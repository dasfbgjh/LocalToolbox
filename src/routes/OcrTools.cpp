#include "routes/OcrTools.h"
#include "common/Config.h"
#include "common/Logger.hpp"
#include "core/Server.h"
#include "core/OcrEngine.h"
#include "common/Utils.h"
#include "ocr.h"

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

namespace routes::ocrTools {

// ========================================================================
// 单任务管理器
// ========================================================================

struct OcrTask {
    std::string id;
    std::string imgPath;
    bool isTempFile = true;
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
    CropRect crop;
    TaskStatus status = TaskStatus::Queued;
    std::string error;
    Server::json result;
    int64_t createdAtMs = 0;
    int64_t startedAtMs = 0;
    int64_t finishedAtMs = 0;
};

class TaskManager {
public:
    static TaskManager &instance() {
        static TaskManager inst;
        return inst;
    }

    TaskManager() {
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

    ~TaskManager() {
        shutdown();
    }

    std::string submit( std::string imgPath, std::string modelId, std::string clsModelId,
                        std::string layoutId, std::string tableId,
                        std::string tableAlgo, std::string tableClsModelId,
                        std::string tableWiredModelId,
                        std::string plateModelId,
                        std::string mode,
                        const OcrRunParam &param, const CropRect &crop = {},
                        bool isTempFile = true ) {
        int64_t nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                            std::chrono::system_clock::now().time_since_epoch() )
                            .count();
        std::string id = "ocr_" + std::to_string( nowMs ) + "_" + utils::generateId();

        auto t = std::make_shared<OcrTask>();
        t->id = id;
        t->imgPath = std::move( imgPath );
        t->isTempFile = isTempFile;
        t->modelId = std::move( modelId );
        t->clsModelId = std::move( clsModelId );
        t->layoutId = std::move( layoutId );
        t->tableId = std::move( tableId );
        t->tableAlgo = std::move( tableAlgo );
        t->tableClsModelId = std::move( tableClsModelId );
        t->tableWiredModelId = std::move( tableWiredModelId );
        t->plateModelId = std::move( plateModelId );
        t->mode = std::move( mode );
        t->param = param;
        t->crop = crop;
        t->createdAtMs = nowMs;

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
        const char *status = "queued";
        if ( t.status == TaskStatus::Running )
            status = "running";
        else if ( t.status == TaskStatus::Done )
            status = "done";
        else if ( t.status == TaskStatus::Failed )
            status = "failed";

        out = {
            { "id", t.id },
            { "status", status },
            { "createdAt", t.createdAtMs },
            { "startedAt", t.startedAtMs ? Server::json( t.startedAtMs ) : Server::json() },
            { "finishedAt", t.finishedAtMs ? Server::json( t.finishedAtMs ) : Server::json() },
        };

        if ( t.status == TaskStatus::Failed )
            out["error"] = t.error;
        if ( t.status == TaskStatus::Done )
            out["data"] = t.result;

        return true;
    }

    void dismiss( const std::string &id ) {
        std::lock_guard<std::mutex> lk( m_mutex );
        auto it = m_tasks.find( id );
        if ( it == m_tasks.end() )
            return;
        cleanupTask( it->second );
        m_tasks.erase( it );
    }

private:
    void workerLoop() {
        for ( ;; ) {
            std::shared_ptr<OcrTask> task;
            {
                std::unique_lock<std::mutex> lk( m_mutex );
                m_cv.wait( lk, [this] { return m_shutdown || !m_queue.empty(); } );
                if ( m_shutdown && m_queue.empty() )
                    return;
                task = m_queue.front();
                m_queue.pop();
            }
            try {
                runTask( task );
            } catch ( const std::exception &e ) {
                LOG_ERROR << "OCR任务异常: " << e.what();
                finishTask( task, TaskStatus::Failed, {}, std::string( "任务异常: " ) + e.what() );
            } catch ( ... ) {
                LOG_ERROR << "OCR任务未知异常";
                finishTask( task, TaskStatus::Failed, {}, "任务未知异常" );
            }
        }
    }

    void runTask( std::shared_ptr<OcrTask> t ) {
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
            finishTask( t, TaskStatus::Failed, {}, "OCR引擎不可用: " + err );
            return;
        }

        std::string usePath = t->imgPath;
        std::string croppedPath;
        CropRect appliedCrop;
        if ( t->crop.valid() && !t->imgPath.empty() ) {
            std::string cropErr;
            croppedPath = ocr::cropImageToTemp( t->imgPath, t->crop, cropErr );
            if ( !croppedPath.empty() ) {
                usePath = croppedPath;
                appliedCrop = t->crop;
                LOG_DEBUG << "OCR 使用裁剪区 " << appliedCrop.w << "x" << appliedCrop.h
                          << " @(" << appliedCrop.x << "," << appliedCrop.y << ")";
            } else {
                LOG_WARN << "OCR 裁剪失败，回退为全图识别: " << cropErr;
            }
        }

        int cx1 = -1, cy1 = -1, cx2 = -1, cy2 = -1;

        Server::json out;
        bool ok = OcrEngine::instance().detect( usePath, t->mode, cx1, cy1, cx2, cy2, out, err );

        if ( !croppedPath.empty() && fs::exists( croppedPath ) ) {
            std::error_code ec;
            fs::remove( croppedPath, ec );
        }

        if ( ok && appliedCrop.valid() ) {
            ocr::applyCropOffsetToResult( out, appliedCrop.x, appliedCrop.y );
            out["crop"] = {
                { "x", appliedCrop.x },
                { "y", appliedCrop.y },
                { "w", appliedCrop.w },
                { "h", appliedCrop.h },
            };
        }

        finishTask( t, ok ? TaskStatus::Done : TaskStatus::Failed, out, err );
    }

    void finishTask( std::shared_ptr<OcrTask> t, TaskStatus s, Server::json data, std::string errMsg ) {
        std::error_code ec;
        if ( t->isTempFile && !t->imgPath.empty() && fs::exists( t->imgPath ) )
            fs::remove( t->imgPath, ec );
        t->imgPath.clear();

        int64_t finishMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                               std::chrono::system_clock::now().time_since_epoch() )
                               .count();
        {
            std::lock_guard<std::mutex> lk( m_mutex );
            t->status = s;
            t->finishedAtMs = finishMs;
            if ( s == TaskStatus::Done )
                t->result = std::move( data );
            else
                t->error = std::move( errMsg );
        }
    }

    void cleanupTask( std::shared_ptr<OcrTask> &t ) {
        if ( t->isTempFile && !t->imgPath.empty() ) {
            std::error_code ec;
            fs::remove( t->imgPath, ec );
            t->imgPath.clear();
        }
        t->result = Server::json();
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
                    if ( t->finishedAtMs && ( nowMs - t->finishedAtMs ) > 5 * 60 * 1000 ) {
                        cleanupTask( t );
                        toErase.push_back( kv.first );
                    }
                } else if ( !t->finishedAtMs && ( nowMs - t->createdAtMs ) > 20 * 60 * 1000 ) {
                    cleanupTask( t );
                    toErase.push_back( kv.first );
                }
            }
            for ( const auto &id : toErase )
                m_tasks.erase( id );
        }
    }

    std::mutex m_mutex;
    std::condition_variable m_cv;
    std::map<std::string, std::shared_ptr<OcrTask>> m_tasks;
    std::queue<std::shared_ptr<OcrTask>> m_queue;
    std::thread m_worker;
    std::thread m_cleanup;
    std::once_flag m_cleanupOnce;
    bool m_shutdown = false;
};

// ========================================================================
// 辅助函数
// ========================================================================

static OcrRunParam parseParamsFromForm( const httplib::MultipartFormData &form ) {
    OcrRunParam param;
    auto parseInt = [&]( const char *field, int minV, int maxV, int defV ) -> int {
        if ( !form.has_field( field ) )
            return defV;
        try {
            int v = std::stoi( form.get_field( field ) );
            return v < minV ? minV : ( v > maxV ? maxV : v );
        } catch ( ... ) {
            return defV;
        }
    };
    auto parseFloat = [&]( const char *field, float minV, float maxV, float defV ) -> float {
        if ( !form.has_field( field ) )
            return defV;
        try {
            float v = std::stof( form.get_field( field ) );
            return v < minV ? minV : ( v > maxV ? maxV : v );
        } catch ( ... ) {
            return defV;
        }
    };
    auto parseString = [&]( const char *field, const char *defV ) -> std::string {
        if ( !form.has_field( field ) )
            return defV;
        return form.get_field( field );
    };
    param.maxSideLen = parseInt( "maxSideLen", 32, 4096, 960 );
    param.limitType = parseString( "limitType", "max" );
    param.boxScoreThresh = parseFloat( "boxScoreThresh", 0.1f, 0.9f, 0.3f );
    param.boxThresh = parseFloat( "boxThresh", 0.1f, 0.9f, 0.6f );
    param.unClipRatio = parseFloat( "unClipRatio", 0.5f, 4.0f, 1.5f );
    param.useDilation = parseInt( "dilation", 0, 1, 0 );
    param.scoreMode = parseString( "scoreMode", "fast" );
    param.boxType = parseString( "boxType", "quad" );
    param.useSpaceChar = parseInt( "spaceChar", 0, 1, 1 );
    param.recBatchNum = parseInt( "recBatchNum", 1, 32, 6 );
    param.dropScore = parseFloat( "dropScore", 0.1f, 0.9f, 0.5f );
    param.clsBatchNum = parseInt( "clsBatchNum", 1, 32, 6 );
    param.clsThresh = parseFloat( "clsThresh", 0.1f, 0.99f, 0.9f );
    return param;
}

static CropRect parseCropFromForm( const httplib::MultipartFormData &form ) {
    CropRect c;
    auto parseInt = [&]( const char *field, int defV ) -> int {
        if ( !form.has_field( field ) )
            return defV;
        try {
            return std::stoi( form.get_field( field ) );
        } catch ( ... ) {
            return defV;
        }
    };
    c.x = parseInt( "cropX", 0 );
    c.y = parseInt( "cropY", 0 );
    c.w = parseInt( "cropW", 0 );
    c.h = parseInt( "cropH", 0 );
    if ( c.x < 0 )
        c.x = 0;
    if ( c.y < 0 )
        c.y = 0;
    if ( c.w < 0 )
        c.w = 0;
    if ( c.h < 0 )
        c.h = 0;
    return c;
}

static bool findFileFromForm( const httplib::MultipartFormData &form,
                              httplib::FormData *outFile ) {
    if ( !form.has_file( "file" ) )
        return false;
    *outFile = form.get_file( "file" );
    return true;
}

static std::string writeTempFile( const httplib::FormData &file ) {
    std::string tempDir = utils::fs::toNative( Config::getTempPath() + "/ocr" );
    std::error_code ec;
    fs::create_directories( tempDir, ec );

    auto nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                     std::chrono::system_clock::now().time_since_epoch() )
                     .count();

    std::string ext = ".png";
    size_t dotPos = file.filename.rfind( '.' );
    if ( dotPos != std::string::npos ) {
        std::string origExt = file.filename.substr( dotPos );
        std::string lower = utils::toLower( origExt );
        if ( lower == ".png" || lower == ".jpg" || lower == ".jpeg" ||
             lower == ".bmp" || lower == ".webp" || lower == ".tif" || lower == ".tiff" )
            ext = origExt;
    }

    std::string tempPath = utils::fs::toNative(
        tempDir + "/" + std::to_string( nowMs ) + "_" + utils::generateId() + ext );

    std::ofstream ofs( tempPath, std::ios::binary );
    if ( !ofs )
        return "";
    ofs.write( file.content.data(), file.content.size() );
    return tempPath;
}

static std::string parseModelIdFromForm( const httplib::MultipartFormData &form ) {
    if ( !form.has_field( "model" ) )
        return {};
    return form.get_field( "model" );
}

static std::string parseLayoutIdFromForm( const httplib::MultipartFormData &form ) {
    if ( !form.has_field( "layout" ) )
        return {};
    return form.get_field( "layout" );
}

static std::string parseClsModelIdFromForm( const httplib::MultipartFormData &form ) {
    if ( !form.has_field( "clsModel" ) )
        return {};
    return form.get_field( "clsModel" );
}

static std::string parseTableIdFromForm( const httplib::MultipartFormData &form ) {
    if ( !form.has_field( "tableModel" ) )
        return {};
    return form.get_field( "tableModel" );
}

static std::string parseTableWirelessModelIdFromForm( const httplib::MultipartFormData &form ) {
    if ( !form.has_field( "tableWirelessModel" ) )
        return {};
    return form.get_field( "tableWirelessModel" );
}

static std::string parseTableAlgoFromForm( const httplib::MultipartFormData &form ) {
    if ( !form.has_field( "tableAlgo" ) )
        return {};
    return form.get_field( "tableAlgo" );
}

static std::string parseTableClsModelIdFromForm( const httplib::MultipartFormData &form ) {
    if ( !form.has_field( "tableClsModel" ) )
        return {};
    return form.get_field( "tableClsModel" );
}

static std::string parseTableWiredModelIdFromForm( const httplib::MultipartFormData &form ) {
    if ( !form.has_field( "tableWiredModel" ) )
        return {};
    return form.get_field( "tableWiredModel" );
}

static std::string parseModeFromForm( const httplib::MultipartFormData &form ) {
    if ( !form.has_field( "mode" ) )
        return "doc";
    std::string m = form.get_field( "mode" );
    if ( m != "doc" && m != "table" && m != "plate" )
        return "doc";
    return m;
}

static std::string parsePlateModelIdFromForm( const httplib::MultipartFormData &form ) {
    if ( !form.has_field( "plateModel" ) )
        return {};
    return form.get_field( "plateModel" );
}

// ========================================================================
// 路由
// ========================================================================

static void imageOcrModels( const httplib::Request &, httplib::Response &res ) {
    Server::json textArr = Server::json::array();
    for ( const auto &m : getOcrModelList() )
        textArr.push_back( { { "id", m.id }, { "name", m.name } } );

    Server::json clsModes = Server::json::array();
    {
        std::map<std::string, Server::json> clsGrouped;
        for ( const auto &m : getClsModelList() ) {
            std::string mode = ( m.clsModelType == CLS_MODEL_ORIENTATION ) ? "orientation" : "angle";
            if ( clsGrouped.find( mode ) == clsGrouped.end() )
                clsGrouped[mode] = Server::json::array();
            clsGrouped[mode].push_back( { { "id", m.id }, { "name", m.name }, { "path", m.modelPath } } );
        }
        for ( auto &[k, v] : clsGrouped )
            clsModes.push_back( { { "mode", k }, { "models", v } } );
    }

    Server::json layoutAlgos = Server::json::array();
    {
        std::map<std::string, Server::json> layoutGrouped;
        for ( const auto &m : getLayoutModelList() ) {
            auto slashPos = m.id.find( '/' );
            std::string algo = ( slashPos != std::string::npos ) ? m.id.substr( 0, slashPos ) : m.id;
            if ( layoutGrouped.find( algo ) == layoutGrouped.end() )
                layoutGrouped[algo] = Server::json::array();
            layoutGrouped[algo].push_back( { { "id", m.id }, { "name", m.name }, { "path", m.modelPath }, { "modelType", m.modelType } } );
        }
        for ( auto &[k, v] : layoutGrouped )
            layoutAlgos.push_back( { { "algo", k }, { "models", v } } );
    }

    Server::json tableAlgos = Server::json::array();
    {
        Server::json wirelessModels = Server::json::array();
        Server::json wiredModels = Server::json::array();
        for ( const auto &m : getTableModelList() ) {
            Server::json item = { { "id", m.id }, { "name", m.name }, { "path", m.modelPath }, { "modelType", m.modelType } };
            if ( m.modelType == TABLE_MODEL_UNET )
                wiredModels.push_back( item );
            else
                wirelessModels.push_back( item );
        }
        if ( !wirelessModels.empty() )
            tableAlgos.push_back( { { "algo", "wireless" }, { "label", "无线表格" }, { "models", wirelessModels } } );
        if ( !wiredModels.empty() )
            tableAlgos.push_back( { { "algo", "wired" }, { "label", "有线表格" }, { "models", wiredModels } } );
        if ( !wirelessModels.empty() && !wiredModels.empty() )
            tableAlgos.push_back( { { "algo", "combined" }, { "label", "自动识别" }, { "models", wirelessModels }, { "wiredModels", wiredModels } } );
    }

    Server::json tableClsArr = Server::json::array();
    for ( const auto &p : getTableClsModelList() ) {
        auto fn = fs::path( p ).filename().string();
        tableClsArr.push_back( { { "id", p }, { "name", fn } } );
    }

    Server::json plateArr = Server::json::array();
    for ( const auto &m : getPlateModelList() )
        plateArr.push_back( { { "id", m.id }, { "name", m.name } } );

    Server::sendJson( res, {
                               { "success", true },
                               { "textModels", textArr },
                               { "clsModes", clsModes },
                               { "layoutAlgos", layoutAlgos },
                               { "tableAlgos", tableAlgos },
                               { "tableClsModels", tableClsArr },
                               { "plateModels", plateArr },
                           } );
}

static void imageOcrSubmit( const httplib::Request &req, httplib::Response &res ) {
    if ( !req.is_multipart_form_data() )
        return Server::sendError( res, "需要multipart上传", 400 );

    httplib::FormData file;
    if ( !findFileFromForm( req.form, &file ) )
        return Server::sendError( res, "缺少file字段", 400 );

    LOG_DEBUG << "OCR识别(submit) filename=" << file.filename << " size=" << file.content.size();
    if ( file.content.size() > 20 * 1024 * 1024 )
        return Server::sendError( res, "图片超过20MB限制", 400 );

    std::string modelId = parseModelIdFromForm( req.form );
    std::string clsModelId = parseClsModelIdFromForm( req.form );
    std::string layoutId = parseLayoutIdFromForm( req.form );
    std::string tableAlgo = parseTableAlgoFromForm( req.form );
    std::string tableWirelessModelId = parseTableWirelessModelIdFromForm( req.form );
    std::string tableWiredModelId = parseTableWiredModelIdFromForm( req.form );
    std::string tableClsModelId = parseTableClsModelIdFromForm( req.form );
    std::string tableId;
    if ( tableAlgo == "wired" )
        tableId = tableWiredModelId;
    else
        tableId = tableWirelessModelId;
    if ( tableId.empty() )
        tableId = parseTableIdFromForm( req.form );
    std::string mode = parseModeFromForm( req.form );
    std::string plateModelId = parsePlateModelIdFromForm( req.form );
    OcrRunParam param = parseParamsFromForm( req.form );
    CropRect crop = parseCropFromForm( req.form );

    std::string err;
    if ( !OcrEngine::instance().ensureLoaded( modelId, clsModelId, layoutId, tableId, tableAlgo, tableClsModelId, tableWiredModelId, plateModelId, param, err ) ) {
        LOG_WARN << "OCR引擎尚未就绪，将在后台线程重试: " << err;
    }

    std::string tempPath = writeTempFile( file );
    if ( tempPath.empty() )
        return Server::sendError( res, "临时文件创建失败", 500 );

    std::string id = TaskManager::instance().submit(
        std::move( tempPath ), std::move( modelId ), std::move( clsModelId ),
        std::move( layoutId ), std::move( tableId ),
        std::move( tableAlgo ), std::move( tableClsModelId ),
        std::move( tableWiredModelId ), std::move( plateModelId ),
        std::move( mode ), param, crop );
    Server::sendJson( res, { { "success", true }, { "taskId", id } } );
}

static void imageOcrStatus( const httplib::Request &req, httplib::Response &res ) {
    std::string id = req.path_params.at( "id" );
    Server::json status;
    if ( !TaskManager::instance().getStatus( id, status ) )
        return Server::sendError( res, "任务不存在或已过期", 404 );
    Server::sendJson( res, { { "success", true }, { "data", status } } );
}

static void imageOcrDismiss( const httplib::Request &req, httplib::Response &res ) {
    std::string id = req.path_params.at( "id" );
    TaskManager::instance().dismiss( id );
    Server::sendJson( res, { { "success", true } } );
}

void shutdown() {
    TaskManager::instance().shutdown();
}

void registerOcrRoutes( httplib::Server &svr ) {
    svr.Get( "/api/tools/image/ocr/models", imageOcrModels );
    svr.Post( "/api/tools/image/ocr/submit", imageOcrSubmit );
    svr.Get( "/api/tools/image/ocr/status/:id", imageOcrStatus );
    svr.Delete( "/api/tools/image/ocr/status/:id", imageOcrDismiss );
    LOG_DEBUG << "已注册 4 个OCR工具路由";
}

} // namespace routes::ocrTools