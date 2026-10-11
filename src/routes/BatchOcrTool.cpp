#include "routes/BatchOcrTool.h"
#include "common/Config.h"
#include "common/Logger.hpp"
#include "core/Server.h"
#include "core/OcrEngine.h"
#include "common/Utils.h"

#include <chrono>
#include <condition_variable>
#include <filesystem>
#include <map>
#include <mutex>
#include <queue>
#include <string>
#include <thread>
#include <vector>

namespace fs = std::filesystem;
using namespace ocr;

namespace routes::batchOcrTool {

// ========================================================================
// 批量任务结构
// ========================================================================

struct BatchItem {
    std::string filePath;
    std::string fileName;
    int64_t fileSize = 0;
    TaskStatus status = TaskStatus::Queued;
    std::string error;
    Server::json result;
    int64_t startedAtMs = 0;
    int64_t finishedAtMs = 0;
};

struct BatchOcrTask {
    std::string id;
    std::vector<BatchItem> items;
    std::string modelId;
    std::string clsModelId;
    std::string layoutId;
    std::string tableId;
    std::string tableAlgo;
    std::string tableClsModelId;
    std::string tableWiredModelId;
    std::string plateModelId;
    std::string mode;
    OcrRunParam param{};
    TaskStatus status = TaskStatus::Queued;
    int64_t createdAtMs = 0;
    int64_t startedAtMs = 0;
    int64_t finishedAtMs = 0;
    int doneCount = 0;
    int failedCount = 0;
};

// ========================================================================
// 批量任务管理器
// ========================================================================

class BatchTaskManager {
public:
    static BatchTaskManager &instance() {
        static BatchTaskManager inst;
        return inst;
    }

    BatchTaskManager() {
        m_worker = std::thread( [this] { workerLoop(); } );
    }

    void shutdown() {
        {
            std::lock_guard<std::mutex> lk( m_mutex );
            if ( m_shutdown )
                return;
            m_shutdown = true;
        }
        m_cv.notify_all();
        if ( m_worker.joinable() )
            m_worker.join();
        if ( m_cleanup.joinable() )
            m_cleanup.join();
    }

    ~BatchTaskManager() {
        shutdown();
    }

    std::string submit( const Server::json &params, std::string &err ) {
        auto filePaths = params.find( "filePaths" );
        if ( filePaths == params.end() || !filePaths->is_array() || filePaths->empty() ) {
            err = "filePaths 不能为空";
            return {};
        }

        int64_t nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                            std::chrono::system_clock::now().time_since_epoch() )
                            .count();
        std::string id = "batch_ocr_" + std::to_string( nowMs ) + "_" + utils::generateId();

        auto t = std::make_shared<BatchOcrTask>();
        t->id = id;
        t->createdAtMs = nowMs;

        t->modelId = params.value( "model", "" );
        t->clsModelId = params.value( "clsModel", "" );
        t->layoutId = params.value( "layout", "" );
        t->tableAlgo = params.value( "tableAlgo", "" );
        t->tableClsModelId = params.value( "tableClsModel", "" );
        t->tableWiredModelId = params.value( "tableWiredModel", "" );
        {
            std::string wirelessId = params.value( "tableWirelessModel", "" );
            if ( t->tableAlgo == "wired" )
                t->tableId = t->tableWiredModelId;
            else
                t->tableId = wirelessId;
            if ( t->tableId.empty() )
                t->tableId = params.value( "tableModel", "" );
        }
        t->mode = params.value( "mode", "doc" );
        t->plateModelId = params.value( "plateModel", std::string( "" ) );
        t->param.maxSideLen = params.value( "maxSideLen", 960 );
        t->param.limitType = params.value( "limitType", std::string( "max" ) );
        t->param.boxScoreThresh = params.value( "boxScoreThresh", 0.3f );
        t->param.boxThresh = params.value( "boxThresh", 0.6f );
        t->param.unClipRatio = params.value( "unClipRatio", 1.5f );
        t->param.useDilation = params.value( "dilation", 0 );
        t->param.scoreMode = params.value( "scoreMode", std::string( "fast" ) );
        t->param.boxType = params.value( "boxType", std::string( "quad" ) );
        t->param.useSpaceChar = params.value( "spaceChar", 1 );
        t->param.recBatchNum = params.value( "recBatchNum", 6 );
        t->param.dropScore = params.value( "dropScore", 0.5f );
        t->param.clsBatchNum = params.value( "clsBatchNum", 6 );
        t->param.clsThresh = params.value( "clsThresh", 0.9f );

        for ( const auto &fp : *filePaths ) {
            if ( !fp.is_string() )
                continue;
            std::string path = fp.get<std::string>();
            if ( !fs::exists( path ) )
                continue;

            BatchItem item;
            item.filePath = path;
            item.fileName = fs::path( path ).filename().string();
            std::error_code ec;
            item.fileSize = fs::file_size( path, ec );
            t->items.push_back( std::move( item ) );
        }

        if ( t->items.empty() ) {
            err = "没有有效的文件路径";
            return {};
        }

        {
            std::lock_guard<std::mutex> lk( m_mutex );
            m_tasks[id] = t;
            m_queue.push( t );
        }
        m_cv.notify_all();

        std::call_once( m_cleanupOnce, [this] {
            m_cleanup = std::thread( [this] { cleanupLoop(); } );
        } );

        return id;
    }

    bool getStatus( const std::string &id, Server::json &out ) {
        std::lock_guard<std::mutex> lk( m_mutex );
        auto it = m_tasks.find( id );
        if ( it == m_tasks.end() )
            return false;
        const auto &t = *it->second;
        out = taskToJson( t );
        return true;
    }

    Server::json taskToJson( const BatchOcrTask &t ) {
        const char *status = "queued";
        if ( t.status == TaskStatus::Running )
            status = "running";
        else if ( t.status == TaskStatus::Done )
            status = "done";
        else if ( t.status == TaskStatus::Failed )
            status = "failed";

        Server::json progress = Server::json::array();
        for ( const auto &item : t.items ) {
            const char *s = "queued";
            if ( item.status == TaskStatus::Running )
                s = "running";
            else if ( item.status == TaskStatus::Done )
                s = "done";
            else if ( item.status == TaskStatus::Failed )
                s = "failed";
            progress.push_back( {
                { "fileName", item.fileName },
                { "status", s },
            } );
        }

        Server::json out = {
            { "id", t.id },
            { "status", status },
            { "total", (int)t.items.size() },
            { "done", t.doneCount },
            { "failed", t.failedCount },
            { "createdAt", t.createdAtMs },
            { "startedAt", t.startedAtMs ? Server::json( t.startedAtMs ) : Server::json() },
            { "finishedAt", t.finishedAtMs ? Server::json( t.finishedAtMs ) : Server::json() },
            { "progress", progress },
        };

        if ( t.status == TaskStatus::Done || t.status == TaskStatus::Failed ) {
            Server::json results = Server::json::array();
            for ( const auto &item : t.items ) {
                Server::json r = {
                    { "filePath", item.filePath },
                    { "fileName", item.fileName },
                };
                if ( item.status == TaskStatus::Failed )
                    r["error"] = item.error;
                else if ( item.status == TaskStatus::Done )
                    r["data"] = item.result;
                results.push_back( r );
            }
            out["results"] = results;
        }

        return out;
    }

    bool getList( Server::json &out ) {
        std::lock_guard<std::mutex> lk( m_mutex );
        Server::json arr = Server::json::array();
        for ( const auto &kv : m_tasks ) {
            arr.push_back( taskToJson( *kv.second ) );
        }
        out = { { "success", true }, { "tasks", arr } };
        return true;
    }

    void dismiss( const std::string &id ) {
        std::lock_guard<std::mutex> lk( m_mutex );
        m_tasks.erase( id );
    }

private:
    void workerLoop() {
        for ( ;; ) {
            std::shared_ptr<BatchOcrTask> task;
            {
                std::unique_lock<std::mutex> lk( m_mutex );
                m_cv.wait( lk, [this] { return m_shutdown || !m_queue.empty(); } );
                if ( m_shutdown && m_queue.empty() )
                    return;
                task = m_queue.front();
                m_queue.pop();
            }
            try {
                runBatchTask( task );
            } catch ( const std::exception &e ) {
                LOG_ERROR << "批量OCR任务异常: " << e.what();
                std::lock_guard<std::mutex> lk( m_mutex );
                task->status = TaskStatus::Failed;
                task->finishedAtMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                                         std::chrono::system_clock::now().time_since_epoch() )
                                         .count();
            } catch ( ... ) {
                LOG_ERROR << "批量OCR任务未知异常";
                std::lock_guard<std::mutex> lk( m_mutex );
                task->status = TaskStatus::Failed;
                task->finishedAtMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                                         std::chrono::system_clock::now().time_since_epoch() )
                                         .count();
            }
        }
    }

    void runBatchTask( std::shared_ptr<BatchOcrTask> t ) {
        int64_t startMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                              std::chrono::system_clock::now().time_since_epoch() )
                              .count();
        {
            std::lock_guard<std::mutex> lk( m_mutex );
            t->status = TaskStatus::Running;
            t->startedAtMs = startMs;
        }

        std::string err;
        if ( !OcrEngine::instance().ensureLoaded( t->modelId, t->clsModelId, t->layoutId, t->tableId, t->tableAlgo, t->tableClsModelId, t->tableWiredModelId, t->plateModelId, t->param, err ) ) {
            std::lock_guard<std::mutex> lk( m_mutex );
            t->status = TaskStatus::Failed;
            t->finishedAtMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                                  std::chrono::system_clock::now().time_since_epoch() )
                                  .count();
            for ( auto &item : t->items ) {
                item.status = TaskStatus::Failed;
                item.error = "OCR引擎不可用: " + err;
            }
            t->failedCount = (int)t->items.size();
            return;
        }

        for ( size_t i = 0; i < t->items.size(); i++ ) {
            {
                std::lock_guard<std::mutex> lk( m_mutex );
                if ( t->status == TaskStatus::Failed )
                    break;
            }

            auto &item = t->items[i];
            item.status = TaskStatus::Running;
            item.startedAtMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                                   std::chrono::system_clock::now().time_since_epoch() )
                                   .count();

            Server::json out;
            std::string detectErr;
            bool ok = OcrEngine::instance().detect( item.filePath, t->mode, -1, -1, -1, -1, out, detectErr );

            item.finishedAtMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                                    std::chrono::system_clock::now().time_since_epoch() )
                                    .count();

            if ( ok ) {
                item.status = TaskStatus::Done;
                item.result = std::move( out );
                std::lock_guard<std::mutex> lk( m_mutex );
                t->doneCount++;
            } else {
                item.status = TaskStatus::Failed;
                item.error = std::move( detectErr );
                std::lock_guard<std::mutex> lk( m_mutex );
                t->failedCount++;
            }
        }

        int64_t finishMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                               std::chrono::system_clock::now().time_since_epoch() )
                               .count();
        {
            std::lock_guard<std::mutex> lk( m_mutex );
            t->status = TaskStatus::Done;
            t->finishedAtMs = finishMs;
        }
    }

    void cleanupLoop() {
        using namespace std::chrono_literals;
        for ( ;; ) {
            {
                std::unique_lock<std::mutex> lk( m_mutex );
                if ( m_cv.wait_for( lk, 30s, [this] { return m_shutdown; } ) )
                    return;
            }
            int64_t nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                                std::chrono::system_clock::now().time_since_epoch() )
                                .count();

            std::lock_guard<std::mutex> lk( m_mutex );
            if ( m_shutdown )
                return;

            std::vector<std::string> toErase;
            for ( auto &kv : m_tasks ) {
                auto &t = kv.second;
                if ( t->status == TaskStatus::Done || t->status == TaskStatus::Failed ) {
                    if ( t->finishedAtMs && ( nowMs - t->finishedAtMs ) > 10 * 60 * 1000 )
                        toErase.push_back( kv.first );
                } else if ( !t->finishedAtMs && ( nowMs - t->createdAtMs ) > 60 * 60 * 1000 ) {
                    toErase.push_back( kv.first );
                }
            }
            for ( const auto &id : toErase )
                m_tasks.erase( id );
        }
    }

    std::mutex m_mutex;
    std::condition_variable m_cv;
    std::map<std::string, std::shared_ptr<BatchOcrTask>> m_tasks;
    std::queue<std::shared_ptr<BatchOcrTask>> m_queue;
    std::thread m_worker;
    std::thread m_cleanup;
    std::once_flag m_cleanupOnce;
    bool m_shutdown = false;
};

// ========================================================================
// 路由
// ========================================================================

static void imageOcrBatchSubmit( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    Server::json body;
    try {
        body = Server::json::parse( req.body );
    } catch ( ... ) {
        return Server::sendError( res, "无效的JSON请求体", 400 );
    }

    std::string err;
    std::string id = BatchTaskManager::instance().submit( body, err );
    if ( id.empty() )
        return Server::sendError( res, err, 400 );

    Server::sendJson( res, { { "success", true }, { "taskId", id } } );
}

static void imageOcrBatchList( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    Server::json out;
    BatchTaskManager::instance().getList( out );
    Server::sendJson( res, out );
}

static void imageOcrBatchStatus( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.path_params.at( "id" );
    Server::json status;
    if ( !BatchTaskManager::instance().getStatus( id, status ) )
        return Server::sendError( res, "任务不存在或已过期", 404 );
    Server::sendJson( res, { { "success", true }, { "data", status } } );
}

static void imageOcrBatchDismiss( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.path_params.at( "id" );
    BatchTaskManager::instance().dismiss( id );
    Server::sendJson( res, { { "success", true } } );
}

void shutdown() {
    BatchTaskManager::instance().shutdown();
}

void registerBatchOcrRoutes( httplib::Server &svr ) {
    svr.Post( "/api/tools/image/ocr/batch", imageOcrBatchSubmit );
    svr.Get( "/api/tools/image/ocr/batch", imageOcrBatchList );
    svr.Get( "/api/tools/image/ocr/batch/:id", imageOcrBatchStatus );
    svr.Delete( "/api/tools/image/ocr/batch/:id", imageOcrBatchDismiss );
    LOG_DEBUG << "已注册 4 个批量OCR工具路由";
}

} // namespace routes::batchOcrTool