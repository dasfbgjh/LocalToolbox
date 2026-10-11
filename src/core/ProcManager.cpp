#include "ProcManager.h"
#include "common/App.h"
#include "common/Config.h"
#include "common/EventLoop.h"
#include "common/Logger.hpp"
#include "core/Database.h"
#include "common/Utils.h"

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <vector>

namespace fs = std::filesystem;

int64_t nowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::system_clock::now().time_since_epoch() )
        .count();
}

ProcManager &ProcManager::instance() {
    static ProcManager inst;
    return inst;
}

std::map<std::string, std::string> ProcManager::buildEnv(
    bool envInherit,
    const std::map<std::string, std::string> &userEnv ) {

    // 构建最终 env
    // 1) 系统环境（按需）
    std::map<std::string, std::string> finalEnv;
    if ( envInherit )
        finalEnv = EventLoop::currentEnv();

    // 2) 用户变量（除 PATH 单独处理外，覆盖现有值）
    bool userHasPath = false;
    std::string userPathValue;
    const std::string pathKey = "PATH";
    for ( auto &kv : userEnv ) {
        std::string k = kv.first;
        std::string v = kv.second;

        if ( k == pathKey ) {
            userHasPath = true;
            userPathValue = v;
            continue;
        }

        // 其他变量：覆盖（删除已有）
        finalEnv[k] = v;
    }

    // 3) PATH：用户设置了则处理
    if ( !userHasPath )
        return finalEnv;

    // 收集现有 PATH
    std::string existingPath;
    bool hasExistingPath = false;
    for ( auto &kv : finalEnv ) {
        if ( kv.first != pathKey )
            continue;
        existingPath = kv.second;
        hasExistingPath = true;
        break;
    }

    std::string merged;
    if ( envInherit && hasExistingPath && !existingPath.empty() ) {
#if defined( _WIN32 )
        merged = existingPath + ";" + userPathValue;
#else
        merged = existingPath + ":" + userPathValue;
#endif
    } else {
        merged = userPathValue; // 替换
    }
    finalEnv[pathKey] = merged;

    return finalEnv;
}

ProcInstance *ProcManager::findInstanceNoLock( const std::string &id ) const {
    auto it = m_instances.find( id );
    return it == m_instances.end() ? nullptr : it->second.get();
}

void ProcInstance::appendLog( const std::string &line, int stream ) {
    auto trim = []( const std::string &s ) {
        size_t b = 0, e = s.size();
        while ( b < e && ( s[b] == '\r' || s[b] == '\n' ) )
            ++b;
        while ( e > b && ( s[e - 1] == '\r' || s[e - 1] == '\n' ) )
            --e;
        return s.substr( b, e - b );
    };
    ProcLogLine l;
    l.seq = nextSeq++;
    l.text = utils::isValidUtf8( line ) ? trim( line ) : trim( utils::localToUtf8( line ) );
    l.stream = stream;
    l.tsMs = nowMs();
    logs.push_back( std::move( l ) );
    if ( logs.size() > kMaxLogLines ) {
        size_t drop = logs.size() - kMaxLogLines;
        for ( size_t i = 0; i < drop; ++i )
            logs.pop_front();
        lastLogTruncated = true;
    }
}

std::string ProcManager::trimNewlines( const std::string &s ) {
    size_t b = 0, e = s.size();
    while ( b < e && ( s[b] == '\r' || s[b] == '\n' ) )
        ++b;
    while ( e > b && ( s[e - 1] == '\r' || s[e - 1] == '\n' ) )
        --e;
    return s.substr( b, e - b );
}

void ProcManager::handleProcessOutput( std::string &pending, ProcInstance *instPtr, int stream ) {
    std::lock_guard<std::mutex> lk( instPtr->mtx );
    size_t start = 0;
    for ( size_t i = 0; i < pending.size(); ++i ) {
        if ( pending[i] == '\n' ) {
            std::string line( pending, start, i - start );
            instPtr->appendLog( line, stream );
            start = i + 1;
        }
    }
}

void ProcManager::appendLogNoLock( ProcInstance *inst, const std::string &line, int stream ) {
    inst->appendLog( line, stream );
}

bool ProcManager::start( const std::string &id ) {
    {
        std::lock_guard<std::mutex> lock( m_instancesMtx );
        ProcInstance *p = findInstanceNoLock( id );
        if ( p && p->running.load() )
            return true;
        if ( p ) { // 清理死实例
            if ( p->waiterThread.joinable() )
                p->waiterThread.join();
            m_instances.erase( id );
        }
    }

    // 从数据库查询配置
    auto &db = App::getInstance()->getDatabase();
    auto rows = db.query( "SELECT * FROM proc_configs WHERE id='" + Database::sqlEscape( id ) + "'" );
    if ( rows.empty() ) {
        LOG_WARN << "ProcManager::start 找不到配置 id=" << id;
        return false;
    }
    auto &row = rows[0];
    std::string name = row["name"];
    std::string command = row["command"];
    std::string argsStr = row["args"];
    std::string workingDir = row["working_dir"];
    bool envInherit = row["env_inherit"] == "1";

    // 用户环境变量
    std::map<std::string, std::string> userEnv;
    auto envRows = db.query(
        "SELECT name, value FROM proc_env_vars WHERE config_id='" + Database::sqlEscape( id ) +
        "' ORDER BY sort_order ASC, name ASC" );
    for ( auto &r : envRows )
        userEnv.emplace( r["name"], r["value"] );

    // 启动参数：command 单独作为第一个，args 跟随
    std::vector<std::string> argv;
    argv.push_back( command );
    try {
        utils::json j = utils::json::parse( argsStr );
        if ( j.is_array() ) {
            for ( auto &v : j ) {
                if ( v.is_string() )
                    argv.push_back( v.get<std::string>() );
            }
        }
    } catch ( ... ) {
    }

    // 工作目录
    fs::path cwdPath = workingDir.empty() ? fs::current_path() : fs::path( workingDir );

    // 合并环境变量
    std::map<std::string, std::string> finalEnv = buildEnv( envInherit, userEnv );

    // 创建进程实例
    auto inst = std::make_unique<ProcInstance>();
    inst->id = id;
    inst->name = name;
    inst->process = std::make_unique<AsyncProcess>();
    inst->startTimeMs = nowMs();

    std::string errorMsg;
    if ( !inst->process->start( argv, cwdPath, finalEnv, &errorMsg ) ) {
        LOG_ERROR << "ProcManager::start failed id =" << id << " cmd =" << command;
        try {
            db.execParams( "UPDATE proc_configs SET status=?, error_msg=?, pid=0, exit_code=0, updated_at=? WHERE id=?",
                           { { 1, "error" }, { 2, errorMsg }, { 3, utils::nowIso() }, { 4, id } } );
        } catch ( ... ) {
        }
        return false;
    }
    inst->pid = inst->process->id();
    inst->running = true;
    int savedPid = inst->pid;

    // 等待线程
    inst->waiterThread = std::thread( std::bind( &ProcManager::waitProcess, this, inst.get(), name, id ) );

    {
        std::lock_guard<std::mutex> lock( m_instancesMtx );
        m_instances[id] = std::move( inst );
    }
    try {
        db.execParams( "UPDATE proc_configs SET status=?, error_msg='', updated_at=? WHERE id=?",
                       { { 1, "running" }, { 2, utils::nowIso() }, { 3, id } } );
    } catch ( ... ) {
    }
    LOG_INFO << "ProcManager::start name =" << name << " pid =" << savedPid;
    return true;
}

void ProcManager::waitProcess( ProcInstance *instPtr, const std::string &name, const std::string &id ) {
    auto outPipe = instPtr->process->outPipe();
    auto errPipe = instPtr->process->errPipe();
    auto outBuf = std::make_shared<std::vector<char>>( 4096 );
    auto errBuf = std::make_shared<std::vector<char>>( 4096 );
    std::string outPending;
    std::string errPending;

    EventLoop::readPipe( outPipe, outBuf,
                         [instPtr, &outPending, this]( EventLoop::error_code ec, EventLoop::buffer_ptr buf, std::size_t s ) -> bool {
                             if ( ec || s == 0 || !instPtr->running.load() )
                                 return false;
                             outPending.append( buf->data(), s );
                             handleProcessOutput( outPending, instPtr, 0 );
                             return true;
                         } );
    EventLoop::readPipe( errPipe, errBuf,
                         [instPtr, &errPending, this]( EventLoop::error_code ec, EventLoop::buffer_ptr buf, std::size_t s ) -> bool {
                             if ( ec || s == 0 || !instPtr->running.load() )
                                 return false;
                             errPending.append( buf->data(), s );
                             handleProcessOutput( errPending, instPtr, 1 );
                             return true;
                         } );

    int exitCode = 0;
    if ( instPtr->process && instPtr->process->started() )
        exitCode = instPtr->process->wait();
    instPtr->running = false;
    instPtr->exitCode = exitCode;

    // 给异步读取一点点时间把残留数据收完
    std::this_thread::sleep_for( std::chrono::milliseconds( 100 ) );
    if ( !outPending.empty() ) {
        if ( outPending.back() != '\n' )
            outPending.append( "\n" );
        handleProcessOutput( outPending, instPtr, 0 );
    }
    if ( !errPending.empty() ) {
        if ( errPending.back() != '\n' )
            errPending.append( "\n" );
        handleProcessOutput( errPending, instPtr, 1 );
    }

    // 标记结束
    {
        std::lock_guard<std::mutex> lk( instPtr->mtx );
        instPtr->appendLog( "[退出码 " + std::to_string( exitCode ) + "]", 0 );
    }

    try {
        App::getInstance()->getDatabase().execParams(
            "UPDATE proc_configs SET status=?, pid=0, exit_code=?, error_msg='', updated_at=? WHERE id=?",
            { { 1, "stopped" }, { 2, std::to_string( exitCode ) }, { 3, utils::nowIso() }, { 4, id } } );
    } catch ( ... ) {
    }
    LOG_INFO << "ProcManager::exit name =" << name << " exit =" << exitCode;
}

bool ProcManager::stop( const std::string &id, bool force ) {
    ProcInstance *p = nullptr;
    {
        std::lock_guard<std::mutex> lock( m_instancesMtx );
        p = findInstanceNoLock( id );
    }
    if ( !p || !p->running.load() ) {
        try {
            App::getInstance()->getDatabase().execParams(
                "UPDATE proc_configs SET status=? WHERE id=? AND status!='stopped'",
                { { 1, "stopped" }, { 2, id } } );
        } catch ( ... ) {
        }
        return true;
    }
    LOG_INFO << "ProcManager::stop name =" << p->name << " force =" << force;
    // 注意：AsyncProcess::terminate/kill 内部在 Windows 下已经处理整个进程树（含孙进程，
    // 例如 cmd /c ping -t 的 ping.exe），不用在此处单独写平台代码。
    if ( p->process && p->process->started() ) {
        try {
            if ( force )
                p->process->kill();
            else
                p->process->terminate();
        } catch ( ... ) {
        }
    }

    // waiter 线程会负责清理和 join
    // 但我们还需要更新 DB 状态
    if ( p->waiterThread.joinable() )
        p->waiterThread.join();

    return true;
}

bool ProcManager::isRunning( const std::string &id ) const {
    std::lock_guard<std::mutex> lock( m_instancesMtx );
    auto *p = findInstanceNoLock( id );
    return p && p->running.load();
}

std::string ProcManager::status( const std::string &id ) const {
    {
        std::lock_guard<std::mutex> lock( m_instancesMtx );
        auto *p = findInstanceNoLock( id );
        if ( p && p->running.load() )
            return "running";
    }
    // 进程未运行时，从数据库读取真实状态：
    // - waitProcess 正常结束 / stop 成功 -> DB status = "stopped"
    // - start() 启动失败 -> DB status = "error"
    // 避免死实例残留 map 时把"stopped"错当成"error"
    try {
        auto rows = App::getInstance()->getDatabase().query(
            "SELECT status FROM proc_configs WHERE id='" + Database::sqlEscape( id ) + "'" );
        if ( !rows.empty() ) {
            std::string s = rows[0]["status"];
            if ( !s.empty() )
                return s;
        }
    } catch ( ... ) {
    }
    return "stopped";
}

ProcManager::LogPage ProcManager::getLogs( const std::string &id, int64_t sinceSeq, int limit ) {
    LogPage page;
    if ( limit <= 0 )
        limit = 500;
    if ( limit > 2000 )
        limit = 2000;
    std::lock_guard<std::mutex> outer( m_instancesMtx );
    auto *p = findInstanceNoLock( id );
    if ( !p )
        return page;
    std::lock_guard<std::mutex> lk( p->mtx );
    page.truncated = p->lastLogTruncated;
    p->lastLogTruncated = false;
    for ( auto &l : p->logs ) {
        if ( l.seq <= sinceSeq )
            continue;
        page.lines.push_back( l );
    }
    if ( (int)page.lines.size() > limit ) {
        page.lines.erase( page.lines.begin(), page.lines.end() - limit );
    }
    if ( !p->logs.empty() )
        page.lastSeq = p->logs.back().seq;
    return page;
}

void ProcManager::clearLogs( const std::string &id ) {
    std::lock_guard<std::mutex> outer( m_instancesMtx );
    auto *p = findInstanceNoLock( id );
    if ( !p )
        return;
    std::lock_guard<std::mutex> lk( p->mtx );
    p->logs.clear();
    p->nextSeq = 1;
    p->lastLogTruncated = false;
}

void ProcManager::startAutoStart() {
    auto &db = App::getInstance()->getDatabase();
    auto rows = db.query( "SELECT id FROM proc_configs WHERE auto_start=1" );
    for ( auto &r : rows )
        start( r["id"] );
}

void ProcManager::shutdownAll() {
    std::vector<std::string> ids;
    {
        std::lock_guard<std::mutex> lock( m_instancesMtx );
        for ( auto &kv : m_instances )
            ids.push_back( kv.first );
    }
    for ( auto &id : ids )
        stop( id, true );
}
