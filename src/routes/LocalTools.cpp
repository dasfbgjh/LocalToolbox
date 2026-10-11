#include "LocalTools.h"
#include "core/Server.h"
#include "common/Utils.h"
#include "core/Database.h"
#include "common/App.h"
#include "common/Config.h"
#include "common/Logger.hpp"
#include "core/HttpServerManager.h"
#include "core/ProcManager.h"
#include "routes/CertTool.h"
#include "routes/DocTool.h"
#include "routes/MusicTool.h"
#include "routes/SysMonitor.h"
#include "routes/ADBTool.h"
#include "routes/BatchOcrTool.h"

#include <filesystem>
#include <random>
#include <chrono>
#include <string>
#include <vector>
#include <sstream>
#include <cstdint>

namespace fs = std::filesystem;

namespace routes::localTools {

void localIp( const httplib::Request &req, httplib::Response &res ) {
    Server::json ips = Server::json::array();
    for ( auto &ip : utils::getLocalIPs() )
        ips.push_back( ip );
    Server::sendJson( res, { { "success", true }, { "ips", ips } } );
}

// 列出本机目录内容（本机统一文件浏览入口；本机 fs_browser 与 share/settings 等均复用）
static void localFsBrowse( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string path = Server::queryParam( req, "path" );
    LOG_DEBUG << "本机目录浏览 path=" << path;

    Server::json entries = Server::json::array();
    std::string parent;
    if ( path.empty() ) {
        // 根：列出本机驱动器
        auto roots = utils::fs::listRoots();
        for ( auto &r : roots ) {
            Server::json e;
            e["name"] = r;
            e["fullPath"] = r;
            e["isDir"] = true;
            e["size"] = 0;
            e["modified"] = 0;
            entries.push_back( e );
        }
    } else {
        std::error_code ec;
        if ( !fs::is_directory( path, ec ) )
            return Server::sendError( res, "目录不存在", 404 );

        // 计算父目录
        try {
            fs::path p( path );
            if ( p.has_parent_path() ) {
                auto pp = p.parent_path();
                parent = pp.string();
                if ( parent.empty() )
                    parent = p.root_path().string();
            }
        } catch ( ... ) {
        }

        for ( auto &entry : fs::directory_iterator( path, ec ) ) {
            if ( ec )
                break;
            std::error_code ec2;
            auto ftime = fs::last_write_time( entry, ec2 );
            int64_t modSec = 0;
            if ( !ec2 ) {
                try {
                    using namespace std::chrono;
                    auto sysTime = time_point_cast<system_clock::duration>(
                        ftime - fs::file_time_type::clock::now() + system_clock::now() );
                    modSec = duration_cast<seconds>( sysTime.time_since_epoch() ).count();
                } catch ( ... ) {
                }
            }
            auto fname = entry.path().filename().string();
            bool isDir = entry.is_directory( ec );
            int64_t size = 0;
            if ( !isDir ) {
                size = entry.file_size( ec );
            }
            Server::json e;
            e["name"] = fname;
            e["fullPath"] = entry.path().string();
            e["isDir"] = isDir;
            e["size"] = size;
            e["modified"] = modSec;
            entries.push_back( e );
        }
    }
    Server::sendJson( res, { { "success", true },
                             { "path", path },
                             { "parent", parent },
                             { "entries", entries } } );
}

// 批量重命名
// body: { items: [{oldPath, newName}], allowOverwrite: bool }
// newName 仅是文件名（不含路径），oldPath 为完整原路径
static void localRename( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    if ( body.is_null() || !body.is_object() )
        return Server::sendError( res, "无效的请求体", 400 );
    if ( !body.contains( "items" ) || !body["items"].is_array() )
        return Server::sendError( res, "缺少 items", 400 );

    bool allowOverwrite = false;
    if ( body.contains( "allowOverwrite" ) && body["allowOverwrite"].is_boolean() )
        allowOverwrite = body["allowOverwrite"].get<bool>();

    Server::json results = Server::json::array();
    int okCount = 0, failCount = 0;

    for ( auto &it : body["items"] ) {
        if ( !it.is_object() || !it.contains( "oldPath" ) || !it.contains( "newName" ) ) {
            Server::json r;
            r["ok"] = false;
            r["error"] = "参数不完整";
            results.push_back( r );
            failCount++;
            continue;
        }
        std::string oldPath = it["oldPath"].get<std::string>();
        std::string newName = it["newName"].get<std::string>();

        // 校验 newName
        if ( newName.empty() || newName == "." || newName == ".." ) {
            Server::json r;
            r["ok"] = false;
            r["oldPath"] = oldPath;
            r["newName"] = newName;
            r["error"] = "新名称无效";
            results.push_back( r );
            failCount++;
            continue;
        }
        if ( newName.find( '/' ) != std::string::npos || newName.find( '\\' ) != std::string::npos ) {
            Server::json r;
            r["ok"] = false;
            r["oldPath"] = oldPath;
            r["newName"] = newName;
            r["error"] = "新名称不能包含路径分隔符";
            results.push_back( r );
            failCount++;
            continue;
        }

        fs::path p( oldPath );
        if ( !fs::exists( p ) ) {
            Server::json r;
            r["ok"] = false;
            r["oldPath"] = oldPath;
            r["newName"] = newName;
            r["error"] = "原文件不存在";
            results.push_back( r );
            failCount++;
            continue;
        }

        fs::path newPath = p.parent_path() / newName;
        if ( newPath == p ) {
            // 重命名到相同名称
            Server::json r;
            r["ok"] = true;
            r["oldPath"] = oldPath;
            r["newPath"] = oldPath;
            r["newName"] = newName;
            r["unchanged"] = true;
            results.push_back( r );
            okCount++;
            continue;
        }

        // Windows 文件系统按大小写不敏感比较路径：仅大小写不同的"重命名"是空操作。
        // 通过临时文件名中转强制修改大小写。
#ifdef _WIN32
        {
            // 仅比较路径本身的"原始字节"。在 Windows 上 fs::path 的内部表示是 wstring，
            // 因此使用 wstring 路径比较；p/newPath 已包含目录+文件名。
            std::wstring op = p.wstring();
            std::wstring np = newPath.wstring();
            auto ieq = []( wchar_t a, wchar_t b ) {
                return ::towlower( a ) == ::towlower( b );
            };
            bool sameIgnoreCase = op.size() == np.size() &&
                                  std::equal( op.begin(), op.end(), np.begin(), ieq );
            if ( sameIgnoreCase ) {
                std::error_code tec;
                // 取当前进程 ID 作为后缀，确保并发或重入时不会撞名
                std::ostringstream suffix;
                suffix << ".__tmpcase__" << ::GetCurrentProcessId() << "__" << (uintptr_t)&p;
                std::string tmpName = newName + suffix.str();
                fs::path tmpPath = p.parent_path() / tmpName;
                fs::rename( p, tmpPath, tec );
                if ( tec ) {
                    Server::json r;
                    r["ok"] = false;
                    r["oldPath"] = oldPath;
                    r["newName"] = newName;
                    r["error"] = std::string( "无法修改大小写(临时重命名失败): " ) + tec.message();
                    results.push_back( r );
                    failCount++;
                    continue;
                }
                fs::rename( tmpPath, newPath, tec );
                if ( tec ) {
                    // 尽力回滚
                    std::error_code rec;
                    fs::rename( tmpPath, p, rec );
                    Server::json r;
                    r["ok"] = false;
                    r["oldPath"] = oldPath;
                    r["newName"] = newName;
                    r["error"] = std::string( "无法修改大小写: " ) + tec.message();
                    results.push_back( r );
                    failCount++;
                    continue;
                }
                Server::json r;
                r["ok"] = true;
                r["oldPath"] = oldPath;
                r["newPath"] = newPath.string();
                r["newName"] = newName;
                results.push_back( r );
                okCount++;
                continue;
            }
        }
#endif

        std::error_code ec;
        if ( fs::exists( newPath, ec ) ) {
            if ( !allowOverwrite ) {
                Server::json r;
                r["ok"] = false;
                r["oldPath"] = oldPath;
                r["newName"] = newName;
                r["error"] = "目标已存在";
                results.push_back( r );
                failCount++;
                continue;
            }
            // 允许覆盖：先删除
            fs::remove( newPath, ec );
            if ( ec ) {
                Server::json r;
                r["ok"] = false;
                r["oldPath"] = oldPath;
                r["newName"] = newName;
                r["error"] = "无法覆盖目标: " + ec.message();
                results.push_back( r );
                failCount++;
                continue;
            }
        }

        fs::rename( p, newPath, ec );
        if ( ec ) {
            Server::json r;
            r["ok"] = false;
            r["oldPath"] = oldPath;
            r["newName"] = newName;
            r["error"] = "重命名失败: " + ec.message();
            results.push_back( r );
            failCount++;
            continue;
        }
        Server::json r;
        r["ok"] = true;
        r["oldPath"] = oldPath;
        r["newPath"] = newPath.string();
        r["newName"] = newName;
        results.push_back( r );
        okCount++;
    }
    LOG_INFO << "批量重命名完成 成功=" << okCount << " 失败=" << failCount;
    Server::sendJson( res, { { "success", true },
                             { "okCount", okCount },
                             { "failCount", failCount },
                             { "results", results } } );
}

// ======================================================
// HTTP 服务器（路径挂载 / 请求代理）管理
// ======================================================

static Server::json serverToJson( const Database::Row &row ) {
    Server::json j;
    j["id"] = row.count( "id" ) ? row.at( "id" ) : "";
    j["name"] = row.count( "name" ) ? row.at( "name" ) : "";
    j["port"] = row.count( "port" ) ? std::stoi( row.at( "port" ) ) : 0;
    j["status"] = row.count( "status" ) ? row.at( "status" ) : "stopped";
    j["error"] = row.count( "error_msg" ) ? row.at( "error_msg" ) : "";
    j["autoStart"] = row.count( "auto_start" ) && row.at( "auto_start" ) == "1";
    j["createdAt"] = row.count( "created_at" ) ? row.at( "created_at" ) : "";
    j["updatedAt"] = row.count( "updated_at" ) ? row.at( "updated_at" ) : "";
    return j;
}

static Server::json mountToJson( const Database::Row &row ) {
    Server::json j;
    j["id"] = row.count( "id" ) ? row.at( "id" ) : "";
    j["path"] = row.count( "path" ) ? row.at( "path" ) : "";
    j["source"] = row.count( "source" ) ? row.at( "source" ) : "";
    j["sortOrder"] = row.count( "sort_order" ) ? std::stoi( row.at( "sort_order" ) ) : 0;
    return j;
}

static void loadMountsInto( Server::json &serverObj, const std::string &serverId ) {
    auto mounts = App::getInstance()->getDatabase().query(
        "SELECT * FROM http_server_mounts WHERE server_id='" + Database::sqlEscape( serverId ) +
        "' ORDER BY sort_order ASC, id ASC" );
    Server::json arr = Server::json::array();
    for ( auto &m : mounts )
        arr.push_back( mountToJson( m ) );
    serverObj["mounts"] = arr;
}

static std::string genUuid() {
    // 简化版 UUID（基于随机数与时间）
    static std::mt19937_64 rng( std::random_device{}() );
    auto rnd = std::to_string( rng() );
    auto now = std::to_string( std::chrono::system_clock::now().time_since_epoch().count() );
    return now + "-" + rnd;
}

static void httpServersList( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto rows = App::getInstance()->getDatabase().query(
        "SELECT * FROM http_servers ORDER BY created_at DESC" );
    Server::json arr = Server::json::array();
    for ( auto &r : rows ) {
        auto j = serverToJson( r );
        // 实时状态以内存中为准
        std::string liveStatus = HttpServerManager::instance().status( r["id"] );
        j["status"] = liveStatus;
        loadMountsInto( j, r["id"] );
        arr.push_back( j );
    }
    Server::sendJson( res, { { "success", true }, { "servers", arr } } );
}

static void httpServerCreate( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    if ( body.is_null() || !body.is_object() )
        return Server::sendError( res, "无效的请求体", 400 );
    std::string name = utils::jsonStringValue( body, "name" );
    int port = 0;
    if ( body.contains( "port" ) && body["port"].is_number_integer() )
        port = body["port"].get<int>();
    bool autoStart = body.contains( "autoStart" ) && body["autoStart"].is_boolean() && body["autoStart"].get<bool>();
    if ( name.empty() )
        return Server::sendError( res, "名称不能为空", 400 );
    if ( port < 1 || port > 65535 )
        return Server::sendError( res, "端口必须在 1-65535 之间", 400 );
    auto &db = App::getInstance()->getDatabase();
    std::string id = genUuid();
    std::string now = utils::nowIso();
    try {
        db.execParams(
            "INSERT INTO http_servers(id,name,port,status,error_msg,auto_start,created_at,updated_at) "
            "VALUES(?,?,?,?,?,?,?,?)",
            { { 1, id }, { 2, name }, { 3, std::to_string( port ) }, { 4, "stopped" }, { 5, "" }, { 6, autoStart ? "1" : "0" }, { 7, now }, { 8, now } } );
    } catch ( const std::exception &e ) {
        std::string msg = e.what();
        if ( msg.find( "UNIQUE" ) != std::string::npos ) {
            if ( msg.find( "http_servers.name" ) != std::string::npos )
                return Server::sendError( res, "名称已存在", 400 );
            return Server::sendError( res, "端口已被占用", 400 );
        }
        return Server::sendError( res, "创建失败: " + msg, 500 );
    }
    // 可选挂载列表
    if ( body.contains( "mounts" ) && body["mounts"].is_array() ) {
        int order = 0;
        for ( auto &m : body["mounts"] ) {
            if ( !m.is_object() )
                continue;
            std::string p = utils::jsonStringValue( m, "path" );
            std::string src = utils::jsonStringValue( m, "source" );
            if ( p.empty() || src.empty() )
                continue;
            std::string mid = genUuid();
            try {
                db.execParams(
                    "INSERT INTO http_server_mounts(id,server_id,path,source,sort_order) VALUES(?,?,?,?,?)",
                    { { 1, mid }, { 2, id }, { 3, p }, { 4, src }, { 5, std::to_string( order++ ) } } );
            } catch ( ... ) {
            }
        }
    }
    auto rows = db.query( "SELECT * FROM http_servers WHERE id='" + Database::sqlEscape( id ) + "'" );
    auto j = rows.empty() ? Server::json::object() : serverToJson( rows[0] );
    loadMountsInto( j, id );
    Server::sendJson( res, { { "success", true }, { "server", j } } );
}

static void httpServerUpdate( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1];
    auto body = Server::parseBody( req );
    if ( body.is_null() || !body.is_object() )
        return Server::sendError( res, "无效的请求体", 400 );
    auto &db = App::getInstance()->getDatabase();
    auto rows = db.query( "SELECT * FROM http_servers WHERE id='" + Database::sqlEscape( id ) + "'" );
    if ( rows.empty() )
        return Server::sendError( res, "服务器不存在", 404 );
    auto &row = rows[0];

    std::string newName = body.contains( "name" ) ? utils::jsonStringValue( body, "name" ) : row["name"];
    int newPort = std::stoi( row["port"] );
    if ( body.contains( "port" ) && body["port"].is_number_integer() )
        newPort = body["port"].get<int>();
    bool newAuto = row["auto_start"] == "1";
    if ( body.contains( "autoStart" ) && body["autoStart"].is_boolean() )
        newAuto = body["autoStart"].get<bool>();

    if ( newName.empty() )
        return Server::sendError( res, "名称不能为空", 400 );
    if ( newPort < 1 || newPort > 65535 )
        return Server::sendError( res, "端口必须在 1-65535 之间", 400 );

    bool wasRunning = HttpServerManager::instance().isRunning( id );
    // 如果名称/端口变化且正在运行，先停
    if ( wasRunning && ( newName != row["name"] || newPort != std::stoi( row["port"] ) ) ) {
        HttpServerManager::instance().stop( id );
    }

    try {
        db.execParams( "UPDATE http_servers SET name=?, port=?, auto_start=?, updated_at=? WHERE id=?",
                       { { 1, newName }, { 2, std::to_string( newPort ) }, { 3, newAuto ? "1" : "0" }, { 4, utils::nowIso() }, { 5, id } } );
    } catch ( const std::exception &e ) {
        std::string msg = e.what();
        if ( msg.find( "UNIQUE" ) != std::string::npos ) {
            if ( msg.find( "http_servers.name" ) != std::string::npos )
                return Server::sendError( res, "名称已存在", 400 );
            return Server::sendError( res, "端口已被占用", 400 );
        }
        return Server::sendError( res, "更新失败: " + msg, 500 );
    }

    // 替换挂载列表
    if ( body.contains( "mounts" ) && body["mounts"].is_array() ) {
        try {
            db.execParams( "DELETE FROM http_server_mounts WHERE server_id=?",
                           { { 1, id } } );
        } catch ( ... ) {
        }
        int order = 0;
        for ( auto &m : body["mounts"] ) {
            if ( !m.is_object() )
                continue;
            std::string p = utils::jsonStringValue( m, "path" );
            std::string src = utils::jsonStringValue( m, "source" );
            if ( p.empty() || src.empty() )
                continue;
            std::string mid = genUuid();
            try {
                db.execParams(
                    "INSERT INTO http_server_mounts(id,server_id,path,source,sort_order) VALUES(?,?,?,?,?)",
                    { { 1, mid }, { 2, id }, { 3, p }, { 4, src }, { 5, std::to_string( order++ ) } } );
            } catch ( ... ) {
            }
        }
    }

    auto updated = db.query( "SELECT * FROM http_servers WHERE id='" + Database::sqlEscape( id ) + "'" );
    auto j = updated.empty() ? Server::json::object() : serverToJson( updated[0] );
    loadMountsInto( j, id );

    // 如果原先在运行且配置变了，重启
    if ( wasRunning && ( newName != row["name"] || newPort != std::stoi( row["port"] ) || body.contains( "mounts" ) ) ) {
        HttpServerManager::instance().start( id );
        j["status"] = HttpServerManager::instance().status( id );
    }
    Server::sendJson( res, { { "success", true }, { "server", j } } );
}

static void httpServerDelete( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1];
    auto &db = App::getInstance()->getDatabase();
    auto rows = db.query( "SELECT id FROM http_servers WHERE id='" + Database::sqlEscape( id ) + "'" );
    if ( rows.empty() )
        return Server::sendError( res, "服务器不存在", 404 );
    HttpServerManager::instance().stop( id );
    try {
        db.execParams( "DELETE FROM http_servers WHERE id=?", { { 1, id } } );
    } catch ( const std::exception &e ) {
        return Server::sendError( res, "删除失败: " + std::string( e.what() ), 500 );
    }
    Server::sendJson( res, { { "success", true } } );
}

static void httpServerStart( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1];
    auto &db = App::getInstance()->getDatabase();
    auto rows = db.query( "SELECT * FROM http_servers WHERE id='" + Database::sqlEscape( id ) + "'" );
    if ( rows.empty() )
        return Server::sendError( res, "服务器不存在", 404 );
    if ( HttpServerManager::instance().isRunning( id ) )
        return Server::sendJson( res, { { "success", true }, { "message", "已在运行" } } );
    int port = std::stoi( rows[0]["port"] );
    // 检查本服务中其他实例的端口冲突
    auto listening = HttpServerManager::instance().listeningPorts();
    for ( int p : listening ) {
        if ( p == port )
            return Server::sendError( res, "端口 " + std::to_string( port ) + " 已被本工具内其他服务器占用", 400 );
    }
    bool ok = HttpServerManager::instance().start( id );
    if ( !ok ) {
        // 重新读取最新状态
        auto updated = db.query( "SELECT * FROM http_servers WHERE id='" + Database::sqlEscape( id ) + "'" );
        Server::json j = updated.empty() ? Server::json::object() : serverToJson( updated[0] );
        loadMountsInto( j, id );
        return Server::sendError( res, "启动失败：" + j.value( "error", "" ), 500 );
    }
    auto updated = db.query( "SELECT * FROM http_servers WHERE id='" + Database::sqlEscape( id ) + "'" );
    auto j = updated.empty() ? Server::json::object() : serverToJson( updated[0] );
    loadMountsInto( j, id );
    Server::sendJson( res, { { "success", true }, { "server", j } } );
}

static void httpServerStop( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1];
    auto &db = App::getInstance()->getDatabase();
    auto rows = db.query( "SELECT id FROM http_servers WHERE id='" + Database::sqlEscape( id ) + "'" );
    if ( rows.empty() )
        return Server::sendError( res, "服务器不存在", 404 );
    HttpServerManager::instance().stop( id );
    auto updated = db.query( "SELECT * FROM http_servers WHERE id='" + Database::sqlEscape( id ) + "'" );
    auto j = updated.empty() ? Server::json::object() : serverToJson( updated[0] );
    loadMountsInto( j, id );
    Server::sendJson( res, { { "success", true }, { "server", j } } );
}

// ======================================================
// 进程管理（服务进程 / 守护进程）
// ======================================================

static Server::json procToJson( const Database::Row &row ) {
    Server::json j;
    j["id"] = row.count( "id" ) ? row.at( "id" ) : "";
    j["name"] = row.at( "name" );
    j["command"] = row.at( "command" );
    j["args"] = row.at( "args" );
    j["workingDir"] = row.at( "working_dir" );
    j["envInherit"] = row.at( "env_inherit" ) == "1";
    j["autoStart"] = row.at( "auto_start" ) == "1";
    j["status"] = row.at( "status" );
    j["pid"] = std::stoi( row.at( "pid" ) );
    j["exitCode"] = std::stoi( row.at( "exit_code" ) );
    j["error"] = row.at( "error_msg" );
    j["remarks"] = row.count( "remarks" ) ? row.at( "remarks" ) : "";
    j["createdAt"] = row.at( "created_at" );
    j["updatedAt"] = row.at( "updated_at" );
    // 实时状态
    j["status"] = ProcManager::instance().status( row.at( "id" ) );
    return j;
}

static void loadEnvInto( Server::json &proc, const std::string &id ) {
    auto rows = App::getInstance()->getDatabase().query(
        "SELECT id, name, value, sort_order FROM proc_env_vars WHERE config_id='" +
        Database::sqlEscape( id ) + "' ORDER BY sort_order ASC, name ASC" );
    Server::json arr = Server::json::array();
    for ( auto &r : rows ) {
        Server::json e;
        e["id"] = r.at( "id" );
        e["name"] = r.at( "name" );
        e["value"] = r.at( "value" );
        e["sortOrder"] = std::stoi( r.at( "sort_order" ) );
        arr.push_back( e );
    }
    proc["envVars"] = arr;
}

static void procList( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto rows = App::getInstance()->getDatabase().query(
        "SELECT * FROM proc_configs ORDER BY created_at DESC" );
    Server::json arr = Server::json::array();
    for ( auto &r : rows ) {
        auto j = procToJson( r );
        loadEnvInto( j, r["id"] );
        arr.push_back( j );
    }
    Server::sendJson( res, { { "success", true }, { "procs", arr } } );
}

static void procCreate( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    if ( body.is_null() || !body.is_object() )
        return Server::sendError( res, "无效的请求体", 400 );
    std::string name = utils::jsonStringValue( body, "name" );
    std::string command = utils::jsonStringValue( body, "command" );
    if ( name.empty() )
        return Server::sendError( res, "名称不能为空", 400 );
    if ( command.empty() )
        return Server::sendError( res, "命令不能为空", 400 );
    std::string workingDir = utils::jsonStringValue( body, "workingDir" );
    std::string remarks = utils::jsonStringValue( body, "remarks" );
    bool envInherit = body.contains( "envInherit" ) && body["envInherit"].is_boolean() ? body["envInherit"].get<bool>() : true;
    bool autoStart = body.contains( "autoStart" ) && body["autoStart"].is_boolean() ? body["autoStart"].get<bool>() : false;
    std::string argsStr = "[]";
    if ( body.contains( "args" ) ) {
        if ( body["args"].is_array() ) {
            argsStr = body["args"].dump();
        } else if ( body["args"].is_string() ) {
            argsStr = body["args"].get<std::string>();
        }
    }
    std::string id = genUuid();
    std::string now = utils::nowIso();
    auto &db = App::getInstance()->getDatabase();
    try {
        db.execParams( "INSERT INTO proc_configs(id,name,command,args,working_dir,env_inherit,auto_start,status,remarks,created_at,updated_at) "
                       "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                       { { 1, id }, { 2, name }, { 3, command }, { 4, argsStr }, { 5, workingDir }, { 6, envInherit ? "1" : "0" }, { 7, autoStart ? "1" : "0" }, { 8, "stopped" }, { 9, remarks }, { 10, now }, { 11, now } } );
    } catch ( const std::exception &e ) {
        std::string msg = e.what();
        if ( msg.find( "UNIQUE" ) != std::string::npos )
            return Server::sendError( res, "名称已存在", 400 );
        return Server::sendError( res, "创建失败: " + msg, 500 );
    }
    // env vars
    if ( body.contains( "envVars" ) && body["envVars"].is_array() ) {
        int order = 0;
        for ( auto &e : body["envVars"] ) {
            if ( !e.is_object() )
                continue;
            std::string n = utils::jsonStringValue( e, "name" );
            std::string v = utils::jsonStringValue( e, "value" );
            if ( n.empty() )
                continue;
            std::string vid = genUuid();
            try {
                db.execParams( "INSERT INTO proc_env_vars(id,config_id,name,value,sort_order) VALUES(?,?,?,?,?)",
                               { { 1, vid }, { 2, id }, { 3, n }, { 4, v }, { 5, std::to_string( order++ ) } } );
            } catch ( ... ) {
            }
        }
    }
    auto rows = db.query( "SELECT * FROM proc_configs WHERE id='" + Database::sqlEscape( id ) + "'" );
    auto j = rows.empty() ? Server::json::object() : procToJson( rows[0] );
    loadEnvInto( j, id );
    Server::sendJson( res, { { "success", true }, { "proc", j } } );
}

static void procUpdate( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1];
    auto body = Server::parseBody( req );
    if ( body.is_null() || !body.is_object() )
        return Server::sendError( res, "无效的请求体", 400 );
    auto &db = App::getInstance()->getDatabase();
    auto rows = db.query( "SELECT * FROM proc_configs WHERE id='" + Database::sqlEscape( id ) + "'" );
    if ( rows.empty() )
        return Server::sendError( res, "配置不存在", 404 );
    auto &row = rows[0];
    std::string name = body.contains( "name" ) ? utils::jsonStringValue( body, "name" ) : row["name"];
    std::string command = body.contains( "command" ) ? utils::jsonStringValue( body, "command" ) : row["command"];
    std::string workingDir = body.contains( "workingDir" ) ? utils::jsonStringValue( body, "workingDir" ) : row["working_dir"];
    std::string remarks = body.contains( "remarks" ) ? utils::jsonStringValue( body, "remarks" ) : ( row.count( "remarks" ) ? row["remarks"] : std::string( "" ) );
    bool envInherit = row["env_inherit"] == "1";
    if ( body.contains( "envInherit" ) && body["envInherit"].is_boolean() )
        envInherit = body["envInherit"].get<bool>();
    bool autoStart = row["auto_start"] == "1";
    if ( body.contains( "autoStart" ) && body["autoStart"].is_boolean() )
        autoStart = body["autoStart"].get<bool>();
    std::string argsStr = row["args"];
    if ( body.contains( "args" ) ) {
        if ( body["args"].is_array() )
            argsStr = body["args"].dump();
        else if ( body["args"].is_string() )
            argsStr = body["args"].get<std::string>();
    }
    if ( name.empty() )
        return Server::sendError( res, "名称不能为空", 400 );
    if ( command.empty() )
        return Server::sendError( res, "命令不能为空", 400 );

    // 若在运行中且配置改变，先停
    bool wasRunning = ProcManager::instance().isRunning( id );
    bool configChanged = ( name != row["name"] ) || ( command != row["command"] ) ||
                         ( workingDir != row["working_dir"] ) || body.contains( "args" ) ||
                         body.contains( "envVars" ) || ( row["env_inherit"] == "1" ) != envInherit;
    if ( wasRunning && configChanged ) {
        ProcManager::instance().stop( id, true );
    }

    try {
        db.execParams( "UPDATE proc_configs SET name=?, command=?, args=?, working_dir=?, env_inherit=?, auto_start=?, remarks=?, updated_at=? WHERE id=?",
                       { { 1, name }, { 2, command }, { 3, argsStr }, { 4, workingDir }, { 5, envInherit ? "1" : "0" }, { 6, autoStart ? "1" : "0" }, { 7, remarks }, { 8, utils::nowIso() }, { 9, id } } );
    } catch ( const std::exception &e ) {
        std::string msg = e.what();
        if ( msg.find( "UNIQUE" ) != std::string::npos )
            return Server::sendError( res, "名称已存在", 400 );
        return Server::sendError( res, "更新失败: " + msg, 500 );
    }
    if ( body.contains( "envVars" ) && body["envVars"].is_array() ) {
        try {
            db.execParams( "DELETE FROM proc_env_vars WHERE config_id=?",
                           { { 1, id } } );
        } catch ( ... ) {
        }
        int order = 0;
        for ( auto &e : body["envVars"] ) {
            if ( !e.is_object() )
                continue;
            std::string n = utils::jsonStringValue( e, "name" );
            std::string v = utils::jsonStringValue( e, "value" );
            if ( n.empty() )
                continue;
            std::string vid = genUuid();
            try {
                db.execParams( "INSERT INTO proc_env_vars(id,config_id,name,value,sort_order) VALUES(?,?,?,?,?)",
                               { { 1, vid }, { 2, id }, { 3, n }, { 4, v }, { 5, std::to_string( order++ ) } } );
            } catch ( ... ) {
            }
        }
    }
    auto updated = db.query( "SELECT * FROM proc_configs WHERE id='" + Database::sqlEscape( id ) + "'" );
    auto j = updated.empty() ? Server::json::object() : procToJson( updated[0] );
    loadEnvInto( j, id );
    Server::sendJson( res, { { "success", true }, { "proc", j } } );
}

static void procDelete( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1];
    auto &db = App::getInstance()->getDatabase();
    auto rows = db.query( "SELECT id FROM proc_configs WHERE id='" + Database::sqlEscape( id ) + "'" );
    if ( rows.empty() )
        return Server::sendError( res, "配置不存在", 404 );
    ProcManager::instance().stop( id, true );
    try {
        db.execParams( "DELETE FROM proc_configs WHERE id=?",
                       { { 1, id } } );
    } catch ( const std::exception &e ) {
        return Server::sendError( res, "删除失败: " + std::string( e.what() ), 500 );
    }
    Server::sendJson( res, { { "success", true } } );
}

static void procStart( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1];
    auto &db = App::getInstance()->getDatabase();
    auto rows = db.query( "SELECT * FROM proc_configs WHERE id='" + Database::sqlEscape( id ) + "'" );
    if ( rows.empty() )
        return Server::sendError( res, "配置不存在", 404 );
    if ( ProcManager::instance().isRunning( id ) )
        return Server::sendJson( res, { { "success", true }, { "message", "已在运行" } } );
    bool ok = ProcManager::instance().start( id );
    if ( !ok ) {
        auto updated = db.query( "SELECT * FROM proc_configs WHERE id='" + Database::sqlEscape( id ) + "'" );
        auto j = updated.empty() ? Server::json::object() : procToJson( updated[0] );
        loadEnvInto( j, id );
        return Server::sendError( res, "启动失败：" + j.value( "error", std::string( "" ) ), 500 );
    }
    auto updated = db.query( "SELECT * FROM proc_configs WHERE id='" + Database::sqlEscape( id ) + "'" );
    auto j = updated.empty() ? Server::json::object() : procToJson( updated[0] );
    loadEnvInto( j, id );
    Server::sendJson( res, { { "success", true }, { "proc", j } } );
}

static void procStop( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1];
    auto &db = App::getInstance()->getDatabase();
    auto rows = db.query( "SELECT id FROM proc_configs WHERE id='" + Database::sqlEscape( id ) + "'" );
    if ( rows.empty() )
        return Server::sendError( res, "配置不存在", 404 );
    bool force = false;
    if ( req.has_param( "force" ) )
        force = req.get_param_value( "force" ) == "1";
    ProcManager::instance().stop( id, force );
    auto updated = db.query( "SELECT * FROM proc_configs WHERE id='" + Database::sqlEscape( id ) + "'" );
    auto j = updated.empty() ? Server::json::object() : procToJson( updated[0] );
    loadEnvInto( j, id );
    Server::sendJson( res, { { "success", true }, { "proc", j } } );
}

static void procLogs( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1];
    int64_t since = 0;
    if ( req.has_param( "since" ) )
        since = std::stoll( req.get_param_value( "since" ) );
    int limit = 500;
    if ( req.has_param( "limit" ) )
        limit = std::stoi( req.get_param_value( "limit" ) );
    auto page = ProcManager::instance().getLogs( id, since, limit );
    Server::json lines = Server::json::array();
    for ( auto &l : page.lines ) {
        Server::json j;
        j["seq"] = l.seq;
        j["ts"] = l.tsMs;
        j["stream"] = l.stream;
        j["text"] = l.text;
        lines.push_back( j );
    }
    bool running = ProcManager::instance().isRunning( id );
    Server::sendJson( res, { { "success", true },
                             { "lines", lines },
                             { "lastSeq", page.lastSeq },
                             { "truncated", page.truncated },
                             { "running", running } } );
}

static void procClearLogs( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1];
    ProcManager::instance().clearLogs( id );
    Server::sendJson( res, { { "success", true } } );
}

// ===== 备忘录 =====

static Server::json memoToJson( const Database::Row &row ) {
    Server::json j;
    j["id"] = row.count( "id" ) ? row.at( "id" ) : "";
    j["title"] = row.count( "title" ) ? row.at( "title" ) : "";
    j["content"] = row.count( "content" ) ? row.at( "content" ) : "";
    j["created_at"] = row.count( "created_at" ) ? row.at( "created_at" ) : "";
    j["updated_at"] = row.count( "updated_at" ) ? row.at( "updated_at" ) : "";
    return j;
}

static void memoList( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto &db = App::getInstance()->getDatabase();
    Server::json arr = Server::json::array();
    try {
        auto rows = db.query( "SELECT * FROM memos ORDER BY updated_at DESC" );
        for ( auto &r : rows )
            arr.push_back( memoToJson( r ) );
    } catch ( const std::exception &e ) {
        LOG_ERROR << "列出备忘录失败: " << e.what();
        Server::sendError( res, std::string( "列出失败: " ) + e.what(), 500 );
        return;
    }
    Server::sendJson( res, { { "success", true }, { "memos", arr } } );
}

static void memoCreate( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    Server::json body;
    try {
        body = Server::json::parse( req.body );
    } catch ( const std::exception &e ) {
        Server::sendError( res, "请求体 JSON 解析失败", 400 );
        return;
    }
    std::string title = body.value( "title", std::string() );
    std::string content = body.value( "content", std::string() );
    std::string id = utils::generateId();
    std::string now = utils::nowIso();
    auto &db = App::getInstance()->getDatabase();
    try {
        db.execParams(
            "INSERT INTO memos(id,title,content,created_at,updated_at) VALUES(?,?,?,?,?)",
            { { 1, id }, { 2, title }, { 3, content }, { 4, now }, { 5, now } } );
    } catch ( const std::exception &e ) {
        LOG_ERROR << "创建备忘录失败: " << e.what();
        Server::sendError( res, std::string( "创建失败: " ) + e.what(), 500 );
        return;
    }
    auto rows = db.query( "SELECT * FROM memos WHERE id='" + Database::sqlEscape( id ) + "'" );
    Server::json result = { { "success", true } };
    if ( !rows.empty() )
        result["memo"] = memoToJson( rows.front() );
    else {
        result["memo"] = { { "id", id }, { "title", title }, { "content", content }, { "created_at", now }, { "updated_at", now } };
    }
    Server::sendJson( res, result );
}

static void memoUpdate( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1].str();
    if ( id.empty() ) {
        Server::sendError( res, "缺少备忘录 ID", 400 );
        return;
    }
    Server::json body;
    try {
        body = Server::json::parse( req.body );
    } catch ( const std::exception &e ) {
        Server::sendError( res, "请求体 JSON 解析失败", 400 );
        return;
    }
    auto &db = App::getInstance()->getDatabase();
    auto rows = db.query( "SELECT * FROM memos WHERE id='" + Database::sqlEscape( id ) + "'" );
    if ( rows.empty() ) {
        Server::sendError( res, "备忘录不存在", 404 );
        return;
    }
    std::string title = body.value( "title", rows.front()["title"] );
    std::string content = body.value( "content", rows.front()["content"] );
    try {
        db.execParams(
            "UPDATE memos SET title=?, content=?, updated_at=? WHERE id=?",
            { { 1, title }, { 2, content }, { 3, utils::nowIso() }, { 4, id } } );
    } catch ( const std::exception &e ) {
        LOG_ERROR << "更新备忘录失败: " << e.what();
        Server::sendError( res, std::string( "更新失败: " ) + e.what(), 500 );
        return;
    }
    auto updated = db.query( "SELECT * FROM memos WHERE id='" + Database::sqlEscape( id ) + "'" );
    Server::json result = { { "success", true } };
    if ( !updated.empty() )
        result["memo"] = memoToJson( updated.front() );
    Server::sendJson( res, result );
}

static void memoDelete( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1].str();
    if ( id.empty() ) {
        Server::sendError( res, "缺少备忘录 ID", 400 );
        return;
    }
    auto &db = App::getInstance()->getDatabase();
    try {
        db.execParams( "DELETE FROM memos WHERE id=?",
                       { { 1, id } } );
    } catch ( const std::exception &e ) {
        LOG_ERROR << "删除备忘录失败: " << e.what();
        Server::sendError( res, std::string( "删除失败: " ) + e.what(), 500 );
        return;
    }
    Server::sendJson( res, { { "success", true } } );
}

void registerLocalTools( httplib::Server &svr ) {
    svr.Get( "/api/local/localIp", localIp );

    svr.Get( "/api/local/fs", localFsBrowse );

    svr.Post( "/api/local/rename", localRename );

    svr.Get( "/api/local/http/servers", httpServersList );
    svr.Post( "/api/local/http/servers", httpServerCreate );
    svr.Put( R"(/api/local/http/servers/([^/]+))", httpServerUpdate );
    svr.Delete( R"(/api/local/http/servers/([^/]+))", httpServerDelete );
    svr.Post( R"(/api/local/http/servers/([^/]+)/start)", httpServerStart );
    svr.Post( R"(/api/local/http/servers/([^/]+)/stop)", httpServerStop );

    svr.Get( "/api/local/procs", procList );
    svr.Post( "/api/local/procs", procCreate );
    svr.Put( R"(/api/local/procs/([^/]+))", procUpdate );
    svr.Delete( R"(/api/local/procs/([^/]+))", procDelete );
    svr.Post( R"(/api/local/procs/([^/]+)/start)", procStart );
    svr.Post( R"(/api/local/procs/([^/]+)/stop)", procStop );
    svr.Get( R"(/api/local/procs/([^/]+)/logs)", procLogs );
    svr.Post( R"(/api/local/procs/([^/]+)/logs/clear)", procClearLogs );

    svr.Get( "/api/local/memos", memoList );
    svr.Post( "/api/local/memos", memoCreate );
    svr.Put( R"(/api/local/memos/([^/]+))", memoUpdate );
    svr.Delete( R"(/api/local/memos/([^/]+))", memoDelete );

    routes::cert::registerCertRoutes( svr );             // 注册自签名证书工具路由
    routes::docs::registerDocRoutes( svr );              // 注册文档阅读工具路由
    routes::music::registerMusicRoutes( svr );           // 注册音乐播放器路由
    routes::sysmonitor::registerSysMonitorRoutes( svr ); // 注册系统监测工具路由（仅限本机）
    routes::adb::registerADBRoutes( svr );               // 注册ADB工具工具路由（仅限本机）
    routes::batchOcrTool::registerBatchOcrRoutes( svr ); // 注册批量OCR工具路由
    LOG_DEBUG << "本机工具路由已注册";
}

} // namespace routes::localTools