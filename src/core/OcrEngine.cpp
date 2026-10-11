#include "core/OcrEngine.h"
#include "common/Config.h"
#include "common/Logger.hpp"
#include "common/Utils.h"
#include "ocr_dynamic_loader.h"
#include "stb_image.h"
#include "stb_image_write.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <mutex>

#define OnnxOCR_Dir Config::getAppPath() + "/OnnxOCR"

namespace ocr {

void setOcrLog( OcrDynamicLoader *loader ) {
    loader->set_log_level( OCR_LOG_WARN );
    loader->set_log_callback( []( int level, const char *tag, const char *msg ) {
        if ( level == OCR_LOG_ERROR )
            LOG_ERROR << "OCR->" << tag << msg;
        else if ( level == OCR_LOG_WARN )
            LOG_WARN << "OCR->" << tag << msg;
        else if ( level == OCR_LOG_INFO )
            LOG_INFO << "OCR->" << tag << msg;
        else if ( level == OCR_LOG_DEBUG )
            LOG_DEBUG << "OCR->" << tag << msg;
        else
            LOG_DEBUG << "OCR->" << tag << msg;
    } );
}

// ========================================================================
// 模型扫描
// ========================================================================

static std::vector<OcrModelInfo> scanOcrModels() {
    std::vector<OcrModelInfo> result;
    std::string onnxDir = utils::fs::toNative( OnnxOCR_Dir );
    std::string textDir = utils::fs::toNative( onnxDir + "/text" );
    if ( !fs::exists( textDir ) ) {
        LOG_WARN << "OCR OnnxOCR/text 目录不存在: " << textDir;
        return result;
    }
    std::error_code ec;
    for ( const auto &entry : fs::directory_iterator( textDir, ec ) ) {
        if ( ec )
            break;
        if ( !entry.is_directory() )
            continue;
        auto dirPath = entry.path();
        std::string id = dirPath.filename().string();
        if ( id.empty() || id[0] == '.' )
            continue;

        std::string detPath = utils::fs::toNative( dirPath.string() + "/det.onnx" );
        std::string recPath = utils::fs::toNative( dirPath.string() + "/rec.onnx" );
        std::string keyPath = utils::fs::toNative( dirPath.string() + "/keys.txt" );

        if ( fs::exists( detPath ) && fs::exists( recPath ) && fs::exists( keyPath ) ) {
            OcrModelInfo info;
            info.id = id;
            info.name = id;
            info.detPath = detPath;
            info.recPath = recPath;
            info.keyPath = keyPath;
            result.push_back( std::move( info ) );
            LOG_INFO << "发现 OCR 模型:" << id;
        }
    }
    std::sort( result.begin(), result.end(),
               []( const OcrModelInfo &a, const OcrModelInfo &b ) { return a.id < b.id; } );
    return result;
}

static std::vector<LayoutModelInfo> scanLayoutModels() {
    std::vector<LayoutModelInfo> result;
    std::string onnxDir = utils::fs::toNative( OnnxOCR_Dir );
    std::string layoutDir = utils::fs::toNative( onnxDir + "/layout" );
    if ( !fs::exists( layoutDir ) )
        return result;
    std::error_code ec;
    for ( const auto &entry : fs::directory_iterator( layoutDir, ec ) ) {
        if ( ec )
            break;
        if ( !entry.is_directory() )
            continue;
        auto dirPath = entry.path();
        std::string id = dirPath.filename().string();
        if ( id.empty() || id[0] == '.' )
            continue;
        std::error_code ec2;
        for ( const auto &f : fs::directory_iterator( dirPath, ec2 ) ) {
            if ( ec2 )
                break;
            if ( !f.is_regular_file() )
                continue;
            std::string ext = f.path().extension().string();
            if ( ext != ".onnx" )
                continue;
            std::string modelFile = f.path().filename().string();
            std::string modelPath = utils::fs::toNative( f.path().string() );
            LayoutModelInfo info;
            info.id = id + "/" + modelFile;
            info.name = id + " / " + modelFile;
            info.modelPath = modelPath;
            if ( id.find( "pp_doclayout" ) != std::string::npos )
                info.modelType = PP_DOCLAYOUT_V2;
            else if ( id.find( "pp_layout" ) != std::string::npos || id.find( "cdla" ) != std::string::npos )
                info.modelType = PP_LAYOUT_CDLA;
            else if ( id.find( "doclayout_yolo" ) != std::string::npos || id.find( "doclayout-yolo" ) != std::string::npos )
                info.modelType = DOCLAYOUT_YOLO_DOCSTRUCTBENCH;
            else if ( id.find( "yolov8" ) != std::string::npos || id.find( "yolo" ) != std::string::npos )
                info.modelType = YOLO_LAYOUT_PAPER;
            else
                info.modelType = PP_DOCLAYOUT_V2;
            LOG_INFO << "发现版面模型:" << info.id;
            result.push_back( std::move( info ) );
        }
    }
    std::sort( result.begin(), result.end(),
               []( const LayoutModelInfo &a, const LayoutModelInfo &b ) { return a.id < b.id; } );
    return result;
}

static std::vector<TableModelInfo> scanTableModels() {
    std::vector<TableModelInfo> result;
    std::string onnxDir = utils::fs::toNative( OnnxOCR_Dir );
    std::string tableDir = utils::fs::toNative( onnxDir + "/table" );
    if ( !fs::exists( tableDir ) )
        return result;
    std::error_code ec;
    for ( const auto &entry : fs::directory_iterator( tableDir, ec ) ) {
        if ( ec )
            break;
        if ( !entry.is_directory() )
            continue;
        auto dirPath = entry.path();
        std::string id = dirPath.filename().string();
        if ( id.empty() || id[0] == '.' )
            continue;
        if ( id == "cls" )
            continue;
        std::error_code ec2;
        for ( const auto &f : fs::directory_iterator( dirPath, ec2 ) ) {
            if ( ec2 )
                break;
            if ( !f.is_regular_file() )
                continue;
            std::string ext = f.path().extension().string();
            if ( ext != ".onnx" )
                continue;
            std::string modelFile = f.path().filename().string();
            std::string lowerFile = utils::toLower( modelFile );
            if ( lowerFile.find( "cls" ) != std::string::npos )
                continue;
            std::string modelPath = utils::fs::toNative( f.path().string() );
            TableModelInfo info;
            info.id = id + "/" + modelFile;
            info.name = id + " / " + modelFile;
            info.modelPath = modelPath;
            if ( lowerFile.find( "unet" ) != std::string::npos )
                info.modelType = TABLE_MODEL_UNET;
            else if ( lowerFile.find( "slanet" ) != std::string::npos )
                info.modelType = TABLE_MODEL_SLANET_PLUS;
            else
                info.modelType = TABLE_MODEL_SLANET_PLUS;
            LOG_INFO << "发现表格模型:" << info.id;
            result.push_back( std::move( info ) );
        }
    }
    std::sort( result.begin(), result.end(),
               []( const TableModelInfo &a, const TableModelInfo &b ) { return a.id < b.id; } );
    return result;
}

static std::vector<std::string> scanTableClsModels() {
    std::vector<std::string> result;
    std::string onnxDir = utils::fs::toNative( OnnxOCR_Dir );
    std::string clsDir = utils::fs::toNative( onnxDir + "/table/cls" );
    if ( !fs::exists( clsDir ) )
        return result;
    std::error_code ec;
    for ( const auto &f : fs::directory_iterator( clsDir, ec ) ) {
        if ( ec )
            break;
        if ( !f.is_regular_file() )
            continue;
        std::string ext = f.path().extension().string();
        if ( ext != ".onnx" )
            continue;
        result.push_back( utils::fs::toNative( f.path().string() ) );
        LOG_INFO << "发现表格类型检测模型:" << f.path().filename().string();
    }
    std::sort( result.begin(), result.end() );
    return result;
}

static std::vector<ClsModelInfo> scanClsModels() {
    std::vector<ClsModelInfo> result;
    std::string onnxDir = utils::fs::toNative( OnnxOCR_Dir );
    std::string clsDir = utils::fs::toNative( onnxDir + "/text_cls" );
    if ( !fs::exists( clsDir ) )
        return result;
    std::error_code ec;
    for ( const auto &entry : fs::directory_iterator( clsDir, ec ) ) {
        if ( ec )
            break;
        if ( !entry.is_directory() )
            continue;
        auto dirPath = entry.path();
        std::string id = dirPath.filename().string();
        if ( id.empty() || id[0] == '.' )
            continue;
        std::error_code ec2;
        for ( const auto &f : fs::directory_iterator( dirPath, ec2 ) ) {
            if ( ec2 )
                break;
            if ( !f.is_regular_file() )
                continue;
            std::string ext = f.path().extension().string();
            if ( ext != ".onnx" )
                continue;
            std::string modelFile = f.path().filename().string();
            std::string modelPath = utils::fs::toNative( f.path().string() );
            ClsModelInfo info;
            info.id = id + "/" + modelFile;
            info.name = id + " / " + modelFile;
            info.modelPath = modelPath;
            info.clsModelType = ( id.find( "orientation" ) != std::string::npos )
                                    ? CLS_MODEL_ORIENTATION
                                    : CLS_MODEL_ANGLE;
            LOG_INFO << "发现分类模型:" << info.id;
            result.push_back( std::move( info ) );
        }
    }
    std::sort( result.begin(), result.end(),
               []( const ClsModelInfo &a, const ClsModelInfo &b ) { return a.id < b.id; } );
    return result;
}

const std::vector<OcrModelInfo> &getOcrModelList() {
    static std::vector<OcrModelInfo> s_list = scanOcrModels();
    return s_list;
}

const std::vector<LayoutModelInfo> &getLayoutModelList() {
    static std::vector<LayoutModelInfo> s_list = scanLayoutModels();
    return s_list;
}

const std::vector<TableModelInfo> &getTableModelList() {
    static std::vector<TableModelInfo> s_list = scanTableModels();
    return s_list;
}

const std::vector<ClsModelInfo> &getClsModelList() {
    static std::vector<ClsModelInfo> s_list = scanClsModels();
    return s_list;
}

const std::vector<std::string> &getTableClsModelList() {
    static std::vector<std::string> s_list = scanTableClsModels();
    return s_list;
}

const OcrModelInfo *findOcrModelById( const std::string &id ) {
    const auto &list = getOcrModelList();
    for ( const auto &m : list )
        if ( m.id == id )
            return &m;
    if ( !list.empty() )
        return &list[0];
    return nullptr;
}

const LayoutModelInfo *findLayoutModelById( const std::string &id ) {
    const auto &list = getLayoutModelList();
    for ( const auto &m : list )
        if ( m.id == id )
            return &m;
    if ( !list.empty() )
        return &list[0];
    return nullptr;
}

const TableModelInfo *findTableModelById( const std::string &id ) {
    const auto &list = getTableModelList();
    for ( const auto &m : list )
        if ( m.id == id )
            return &m;
    if ( !list.empty() )
        return &list[0];
    return nullptr;
}

const ClsModelInfo *findClsModelById( const std::string &id ) {
    const auto &list = getClsModelList();
    for ( const auto &m : list )
        if ( m.id == id )
            return &m;
    return nullptr;
}

static std::vector<PlateModelInfo> scanPlateModels() {
    std::vector<PlateModelInfo> result;
    std::string onnxDir = utils::fs::toNative( OnnxOCR_Dir );
    std::string plateDir = utils::fs::toNative( onnxDir + "/car_plate" );
    if ( !fs::exists( plateDir ) )
        return result;
    std::error_code ec;
    for ( const auto &entry : fs::directory_iterator( plateDir, ec ) ) {
        if ( ec )
            break;
        if ( !entry.is_directory() )
            continue;
        auto dirPath = entry.path();
        std::string id = dirPath.filename().string();
        if ( id.empty() || id[0] == '.' )
            continue;
        std::string detPath = utils::fs::toNative( dirPath.string() + "/det.onnx" );
        std::string recPath = utils::fs::toNative( dirPath.string() + "/rec.onnx" );
        if ( fs::exists( detPath ) && fs::exists( recPath ) ) {
            PlateModelInfo info;
            info.id = id;
            info.name = id;
            info.detPath = detPath;
            info.recPath = recPath;
            LOG_INFO << "发现车牌模型:" << id;
            result.push_back( std::move( info ) );
        }
    }
    {
        std::string detPath = utils::fs::toNative( plateDir + "/det.onnx" );
        std::string recPath = utils::fs::toNative( plateDir + "/rec.onnx" );
        if ( fs::exists( detPath ) && fs::exists( recPath ) ) {
            PlateModelInfo info;
            info.id = "car_plate";
            info.name = "car_plate";
            info.detPath = detPath;
            info.recPath = recPath;
            LOG_INFO << "发现车牌模型:car_plate";
            result.push_back( std::move( info ) );
        }
    }
    std::sort( result.begin(), result.end(),
               []( const PlateModelInfo &a, const PlateModelInfo &b ) { return a.id < b.id; } );
    return result;
}

const std::vector<PlateModelInfo> &getPlateModelList() {
    static std::vector<PlateModelInfo> s_list = scanPlateModels();
    return s_list;
}

const PlateModelInfo *findPlateModelById( const std::string &id ) {
    const auto &list = getPlateModelList();
    for ( const auto &m : list )
        if ( m.id == id )
            return &m;
    if ( !list.empty() )
        return &list[0];
    return nullptr;
}

// ========================================================================
// 辅助函数
// ========================================================================

std::string cropImageToTemp( const std::string &srcPath, const CropRect &crop, std::string &errMsg ) {
    if ( !crop.valid() ) {
        errMsg = "invalid crop rect";
        return {};
    }
    int w = 0, h = 0, channels = 0;
    stbi_uc *pixels = stbi_load( srcPath.c_str(), &w, &h, &channels, 0 );
    if ( !pixels ) {
        errMsg = std::string( "stbi_load 失败: " ) + ( stbi_failure_reason() ? stbi_failure_reason() : "unknown" );
        return {};
    }
    int cx = std::max( 0, std::min( w - 1, crop.x ) );
    int cy = std::max( 0, std::min( h - 1, crop.y ) );
    int cw = std::max( 1, std::min( w - cx, crop.w ) );
    int ch = std::max( 1, std::min( h - cy, crop.h ) );

    std::vector<unsigned char> buf( size_t( cw ) * ch * channels );
    for ( int y = 0; y < ch; y++ ) {
        const stbi_uc *srcRow = pixels + ( ( cy + y ) * w + cx ) * channels;
        unsigned char *dstRow = buf.data() + size_t( y ) * cw * channels;
        std::memcpy( dstRow, srcRow, size_t( cw ) * channels );
    }
    stbi_image_free( pixels );

    std::string tempDir = utils::fs::toNative( Config::getTempPath() + "/ocr" );
    std::error_code ec;
    fs::create_directories( tempDir, ec );
    auto nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                     std::chrono::system_clock::now().time_since_epoch() )
                     .count();
    std::string tempPath = utils::fs::toNative(
        tempDir + "/crop_" + std::to_string( nowMs ) + "_" + utils::generateId() + ".png" );

    int strideBytes = cw * channels;
    int writeOk = stbi_write_png( tempPath.c_str(), cw, ch, channels, buf.data(), strideBytes );
    if ( !writeOk ) {
        errMsg = "stbi_write_png 失败";
        return {};
    }
    return tempPath;
}

void applyCropOffsetToResult( Server::json &data, int dx, int dy ) {
    if ( !dx && !dy )
        return;
    auto itBlocks = data.find( "blocks" );
    if ( itBlocks == data.end() || !itBlocks->is_array() )
        return;
    for ( auto &b : *itBlocks ) {
        auto itBox = b.find( "box" );
        if ( itBox == b.end() || !itBox->is_array() )
            continue;
        for ( auto &pt : *itBox ) {
            auto itX = pt.find( "x" ), itY = pt.find( "y" );
            if ( itX != pt.end() && itX->is_number() )
                *itX = itX->get<double>() + dx;
            if ( itY != pt.end() && itY->is_number() )
                *itY = itY->get<double>() + dy;
        }
    }
}

// ========================================================================
// OcrEngine::Impl
// ========================================================================

struct OcrEngine::Impl {
    std::mutex mutex;
    std::unique_ptr<ocr::OcrDynamicLoader> loader;
    OcrHandle *handle = nullptr;
    DocLayoutYOLOHandle *layoutHandle = nullptr;
    TableHandle *tableHandle = nullptr;
    std::string currentModelId;
    std::string currentClsModelId;
    std::string currentLayoutId;
    std::string currentTableId;
    std::string currentTableAlgo;
    std::string currentTableClsModelId;
    std::string currentTableWiredModelId;
    std::string currentPlateModelId;
    PlateHandle *plateHandle = nullptr;
    OcrRunParam currentParam;
    bool libraryLoadFailed = false;
    std::string lastError;

    bool ensureDllLoadedInternal( std::string &err ) {
        if ( loader )
            return true;
        if ( libraryLoadFailed ) {
            err = lastError;
            return false;
        }

        std::string dllPath = utils::fs::toNative( OnnxOCR_Dir + "/OnnxOCR.dll" );
        if ( !fs::exists( dllPath ) ) {
            lastError = "无法加载 OnnxOCR.dll，请确认该文件存在于 " + std::string( OnnxOCR_Dir ) + " 目录";
            libraryLoadFailed = true;
            LOG_ERROR << lastError << " path=" << dllPath;
            err = lastError;
            return false;
        }

        try {
            loader = std::make_unique<ocr::OcrDynamicLoader>( dllPath );
            setOcrLog( loader.get() );
            LOG_INFO << "已加载 OnnxOCR DLL:" << dllPath << " version=" << loader->version();
        } catch ( const ocr::DynamicLoaderError &e ) {
            lastError = std::string( "加载 OnnxOCR.dll 失败:" ) + e.what();
            libraryLoadFailed = true;
            LOG_ERROR << lastError;
            err = lastError;
            return false;
        }
        return true;
    }

    bool initModelInternal( const OcrModelInfo &info, const std::string &clsModelId, const OcrRunParam &param, std::string &err ) {
        OcrConfig cfg = {};
        cfg.det_model_path = info.detPath.c_str();
        cfg.rec_model_path = info.recPath.c_str();
        cfg.rec_char_dict_path = info.keyPath.c_str();

        const ClsModelInfo *clsInfo = nullptr;
        if ( !clsModelId.empty() )
            clsInfo = findClsModelById( clsModelId );

        if ( clsInfo && !clsInfo->modelPath.empty() && fs::exists( clsInfo->modelPath ) ) {
            cfg.cls_model_path = clsInfo->modelPath.c_str();
            cfg.cls_model_type = clsInfo->clsModelType;
        } else {
            cfg.cls_model_path = nullptr;
            cfg.cls_model_type = CLS_MODEL_NONE;
        }
        cfg.use_gpu = 0;
        cfg.gpu_id = 0;

        cfg.det_limit_side_len = static_cast<float>( param.maxSideLen > 0 ? param.maxSideLen : 960 );
        cfg.det_limit_type = !param.limitType.empty() ? param.limitType.c_str() : "max";
        cfg.det_db_thresh = param.boxScoreThresh > 0.0f ? param.boxScoreThresh : 0.3f;
        cfg.det_db_box_thresh = param.boxThresh > 0.0f ? param.boxThresh : 0.6f;
        cfg.det_db_unclip_ratio = param.unClipRatio > 0.0f ? param.unClipRatio : 1.5f;
        cfg.use_dilation = param.useDilation;
        cfg.det_db_score_mode = !param.scoreMode.empty() ? param.scoreMode.c_str() : "fast";
        cfg.det_box_type = !param.boxType.empty() ? param.boxType.c_str() : "quad";

        cfg.rec_batch_num = param.recBatchNum > 0 ? param.recBatchNum : 6;
        cfg.rec_image_c = 3;
        cfg.rec_image_h = 48;
        cfg.rec_image_w = 320;
        cfg.use_space_char = param.useSpaceChar;
        cfg.drop_score = param.dropScore > 0.0f ? param.dropScore : 0.5f;

        cfg.cls_batch_num = param.clsBatchNum > 0 ? param.clsBatchNum : 6;
        cfg.cls_image_c = 3;
        if ( cfg.cls_model_type == CLS_MODEL_ORIENTATION ) {
            cfg.cls_image_h = 224;
            cfg.cls_image_w = 224;
        } else {
            cfg.cls_image_h = 48;
            cfg.cls_image_w = 192;
        }
        cfg.cls_thresh = param.clsThresh > 0.0f ? param.clsThresh : 0.9f;

        handle = loader->create( &cfg );
        if ( !handle ) {
            const char *libErr = loader->last_error();
            lastError = libErr ? std::string( "OnnxOCR 初始化失败:" ) + libErr
                               : "OnnxOCR 初始化失败 (模型:" + info.id + ")";
            LOG_ERROR << lastError;
            err = lastError;
            return false;
        }
        currentModelId = info.id;
        LOG_INFO << "OCR 引擎初始化成功，模型:" << info.id;
        return true;
    }

    void initLayoutInternal( const std::string &layoutId, std::string &err ) {
        if ( layoutHandle )
            return;
        const LayoutModelInfo *info = findLayoutModelById( layoutId );
        if ( !info ) {
            err = "未找到版面模型: " + layoutId;
            LOG_WARN << err;
            return;
        }
        DocLayoutYOLOConfig cfg = {};
        cfg.model_path = info->modelPath.c_str();
        cfg.model_type = info->modelType;
        cfg.use_gpu = 0;
        cfg.gpu_id = 0;
        cfg.conf_thresh = 0.5f;
        cfg.iou_thresh = 0.5f;

        layoutHandle = loader->doclayout_yolo_create( &cfg );
        if ( !layoutHandle ) {
            const char *libErr = loader->last_error();
            err = std::string( "版面分析引擎初始化失败: " ) + ( libErr ? libErr : "unknown" );
            LOG_WARN << err << "（将回退为纯OCR）";
        } else {
            currentLayoutId = layoutId;
            LOG_INFO << "版面分析引擎初始化成功，模型: " << layoutId;
        }
    }

    void initLayoutDefault( std::string &err ) {
        const auto &list = getLayoutModelList();
        if ( list.empty() ) {
            LOG_WARN << "无可用版面模型，跳过版面分析";
            return;
        }
        initLayoutInternal( list[0].id, err );
    }

    void initTableInternal( const std::string &tableId,
                            const std::string &tableAlgo,
                            const std::string &tableClsModelId,
                            const std::string &tableWiredModelId,
                            std::string &err ) {
        if ( tableHandle )
            return;
        const TableModelInfo *info = findTableModelById( tableId );
        if ( !info ) {
            LOG_WARN << "未找到表格模型: " << tableId;
            return;
        }
        TableConfig cfg = {};
        cfg.model_path = info->modelPath.c_str();
        cfg.model_type = info->modelType;

        if ( tableAlgo == "combined" ) {
            cfg.model_type = TABLE_MODEL_UNET_SLANET_PLUS;
            if ( !tableClsModelId.empty() && fs::exists( tableClsModelId ) )
                cfg.cls_model_path = tableClsModelId.c_str();
            else {
                const auto &clsList = getTableClsModelList();
                if ( !clsList.empty() )
                    cfg.cls_model_path = clsList[0].c_str();
                else
                    cfg.cls_model_path = nullptr;
            }
            if ( !tableWiredModelId.empty() ) {
                const TableModelInfo *wiredInfo = findTableModelById( tableWiredModelId );
                if ( wiredInfo && !wiredInfo->modelPath.empty() )
                    cfg.unet_model_path = wiredInfo->modelPath.c_str();
                else if ( fs::exists( tableWiredModelId ) )
                    cfg.unet_model_path = tableWiredModelId.c_str();
            }
            if ( !cfg.unet_model_path ) {
                const auto &allModels = getTableModelList();
                for ( const auto &m : allModels ) {
                    if ( m.modelType == TABLE_MODEL_UNET && !m.modelPath.empty() ) {
                        cfg.unet_model_path = m.modelPath.c_str();
                        break;
                    }
                }
            }
        } else {
            cfg.cls_model_path = nullptr;
            cfg.unet_model_path = nullptr;
        }

        cfg.use_gpu = 0;
        cfg.gpu_id = 0;

        tableHandle = loader->table_create( &cfg );
        if ( !tableHandle ) {
            const char *libErr = loader->last_error();
            LOG_WARN << "表格识别引擎初始化失败（表格将降级为OCR）: "
                     << ( libErr ? libErr : "unknown" );
        } else {
            currentTableId = tableId;
            currentTableAlgo = tableAlgo;
            currentTableClsModelId = tableClsModelId;
            currentTableWiredModelId = tableWiredModelId;
            LOG_INFO << "表格识别引擎初始化成功，模型: " << tableId
                     << " 算法: " << tableAlgo;
        }
    }

    void initTableDefault( std::string &err ) {
        const auto &list = getTableModelList();
        if ( list.empty() ) {
            LOG_WARN << "无可用表格模型，跳过表格识别";
            return;
        }
        initTableInternal( list[0].id, {}, {}, {}, err );
    }

    void initPlateInternal( const std::string &plateModelId, std::string &err ) {
        if ( plateHandle )
            return;
        const PlateModelInfo *info = findPlateModelById( plateModelId );
        if ( !info ) {
            err = "未找到车牌模型: " + plateModelId;
            LOG_WARN << err;
            return;
        }
        PlateConfig cfg = {};
        cfg.detect_model_path = info->detPath.c_str();
        cfg.rec_model_path = info->recPath.c_str();
        cfg.use_gpu = 0;
        cfg.gpu_id = 0;
        cfg.min_score = 0.4f;
        cfg.iou_thresh = 0.5f;

        plateHandle = loader->plate_create( &cfg );
        if ( !plateHandle ) {
            const char *libErr = loader->last_error();
            err = std::string( "车牌识别引擎初始化失败: " ) + ( libErr ? libErr : "unknown" );
            LOG_WARN << err;
        } else {
            currentPlateModelId = info->id;
            LOG_INFO << "车牌识别引擎初始化成功，模型: " << info->id;
        }
    }

    bool detectPlateOnly( const std::string &imgPath,
                          Server::json &out, std::string &err ) {
        if ( !plateHandle ) {
            err = "车牌识别引擎未初始化";
            return false;
        }
        PlateResultList results;
        memset( &results, 0, sizeof( results ) );

        int rc = loader->plate_run_file( plateHandle, imgPath.c_str(), &results );
        if ( rc != 0 ) {
            const char *libErr = loader->last_error();
            err = libErr ? std::string( "车牌识别失败: " ) + libErr : "车牌识别失败";
            LOG_ERROR << "车牌识别失败 imgPath=" << imgPath << " err=" << err;
            return false;
        }

        Server::json blocks = Server::json::array();
        std::string fullText;
        for ( int i = 0; i < results.count; i++ ) {
            const PlateResult &r = results.items[i];
            Server::json boxJson = Server::json::array();
            boxJson.push_back( { { "x", r.box.x1 }, { "y", r.box.y1 } } );
            boxJson.push_back( { { "x", r.box.x2 }, { "y", r.box.y1 } } );
            boxJson.push_back( { { "x", r.box.x2 }, { "y", r.box.y2 } } );
            boxJson.push_back( { { "x", r.box.x1 }, { "y", r.box.y2 } } );
            std::string plate = r.plate ? r.plate : "";
            std::string type = r.type ? r.type : "";
            Server::json landmarks = Server::json::array();
            for ( int j = 0; j < 4; j++ )
                landmarks.push_back( { { "x", r.landmarks[j].x }, { "y", r.landmarks[j].y } } );
            blocks.push_back( {
                { "type", std::string( "plate" ) },
                { "text", plate },
                { "score", r.score },
                { "box", boxJson },
                { "plateType", type },
                { "landmarks", landmarks },
            } );
            if ( !fullText.empty() )
                fullText += "\n";
            fullText += plate;
        }

        out = {
            { "text", fullText },
            { "blocks", blocks },
            { "stats", { { "blockCount", results.count } } } };

        loader->plate_free_results( &results );
        LOG_DEBUG << "车牌识别成功 车牌数=" << results.count;
        return true;
    }

    static std::string layoutClassToType( const std::string &className ) {
        if ( className == "title" || className == "Title" )
            return "title";
        if ( className == "text" || className == "Text" || className == "paragraph" )
            return "text";
        if ( className == "figure" || className == "Figure" || className == "image" )
            return "figure";
        if ( className == "figure_caption" || className == "Figure Caption" )
            return "figure_caption";
        if ( className == "table" || className == "Table" )
            return "table";
        if ( className == "table_caption" || className == "Table Caption" )
            return "table_caption";
        if ( className == "header" || className == "Header" )
            return "header";
        if ( className == "footer" || className == "Footer" )
            return "footer";
        if ( className == "reference" || className == "Reference" )
            return "reference";
        if ( className == "equation" || className == "Equation" )
            return "equation";
        if ( className == "list" || className == "List" )
            return "list";
        if ( className == "abandon" )
            return "abandon";
        return "text";
    }

    bool detectWithLayout( const std::string &imgPath,
                           int cropX1, int cropY1, int cropX2, int cropY2,
                           Server::json &out, std::string &err ) {
        DocLayoutItemList layoutResults;
        memset( &layoutResults, 0, sizeof( layoutResults ) );

        int layoutRc = loader->doclayout_yolo_run_file( layoutHandle, imgPath.c_str(), &layoutResults );
        if ( layoutRc != 0 ) {
            const char *libErr = loader->last_error();
            LOG_WARN << "版面分析失败，回退为纯OCR: " << ( libErr ? libErr : "unknown" );
            loader->doc_layout_free_results( &layoutResults );
            OcrResultList ocrResults;
            memset( &ocrResults, 0, sizeof( ocrResults ) );
            int rc = loader->run_file( handle, imgPath.c_str(),
                                       cropX1, cropY1, cropX2, cropY2, &ocrResults );
            if ( rc != 0 ) {
                libErr = loader->last_error();
                err = libErr ? std::string( "OCR识别失败: " ) + libErr : "OCR识别失败";
                return false;
            }
            Server::json blocks = Server::json::array();
            std::string fullText;
            for ( int i = 0; i < ocrResults.count; i++ ) {
                const OcrResult &r = ocrResults.items[i];
                Server::json box = Server::json::array();
                for ( int j = 0; j < 4; j++ )
                    box.push_back( { { "x", r.box[j].x }, { "y", r.box[j].y } } );
                std::string text = r.text ? r.text : "";
                blocks.push_back( { { "type", std::string( "text" ) }, { "text", text }, { "score", r.score }, { "box", box } } );
                if ( !fullText.empty() )
                    fullText += "\n";
                fullText += text;
            }
            out = { { "text", fullText }, { "blocks", blocks }, { "stats", { { "blockCount", ocrResults.count } } } };
            loader->free_results( &ocrResults );
            return true;
        }

        LOG_DEBUG << "版面分析完成 区域数=" << layoutResults.count;

        std::vector<std::pair<int, DocLayoutItem>> sortedItems;
        for ( int i = 0; i < layoutResults.count; i++ )
            sortedItems.emplace_back( layoutResults.items[i].order, layoutResults.items[i] );
        std::sort( sortedItems.begin(), sortedItems.end(),
                   []( const auto &a, const auto &b ) { return a.first < b.first; } );

        Server::json blocks = Server::json::array();
        std::string fullText;
        int textBlockCount = 0;

        for ( auto &[order, item] : sortedItems ) {
            std::string className = item.class_name ? item.class_name : "";
            std::string type = layoutClassToType( className );

            if ( type == "abandon" )
                continue;

            Server::json boxJson = Server::json::array();
            float x1 = item.box[0], y1 = item.box[1], x2 = item.box[2], y2 = item.box[3];
            boxJson.push_back( { { "x", x1 }, { "y", y1 } } );
            boxJson.push_back( { { "x", x2 }, { "y", y1 } } );
            boxJson.push_back( { { "x", x2 }, { "y", y2 } } );
            boxJson.push_back( { { "x", x1 }, { "y", y2 } } );

            if ( type == "figure" ) {
                blocks.push_back( {
                    { "type", std::string( "figure" ) },
                    { "text", std::string( "" ) },
                    { "score", item.score },
                    { "box", boxJson },
                    { "class", className },
                } );
                continue;
            }

            int cx1 = static_cast<int>( std::floor( x1 ) );
            int cy1 = static_cast<int>( std::floor( y1 ) );
            int cx2 = static_cast<int>( std::ceil( x2 ) );
            int cy2 = static_cast<int>( std::ceil( y2 ) );

            if ( type == "table" && tableHandle ) {
                Server::json tableJson = recognizeTable( imgPath );
                if ( !tableJson.is_null() ) {
                    blocks.push_back( {
                        { "type", std::string( "table" ) },
                        { "text", std::string( "" ) },
                        { "score", item.score },
                        { "box", boxJson },
                        { "class", className },
                        { "table", tableJson },
                    } );
                    textBlockCount++;
                    continue;
                }
            }

            OcrResultList ocrResults;
            memset( &ocrResults, 0, sizeof( ocrResults ) );
            int rc = loader->run_file( handle, imgPath.c_str(),
                                       cx1, cy1, cx2, cy2, &ocrResults );
            if ( rc != 0 ) {
                loader->free_results( &ocrResults );
                continue;
            }

            std::string regionText;
            for ( int i = 0; i < ocrResults.count; i++ ) {
                const OcrResult &r = ocrResults.items[i];
                std::string t = r.text ? r.text : "";
                if ( !regionText.empty() )
                    regionText += "\n";
                regionText += t;
            }
            loader->free_results( &ocrResults );

            if ( regionText.empty() )
                continue;

            blocks.push_back( {
                { "type", type },
                { "text", regionText },
                { "score", item.score },
                { "box", boxJson },
                { "class", className },
            } );
            textBlockCount++;
            if ( !fullText.empty() )
                fullText += "\n";
            fullText += regionText;
        }

        loader->doc_layout_free_results( &layoutResults );

        out = {
            { "text", fullText },
            { "blocks", blocks },
            { "stats", { { "blockCount", textBlockCount }, { "layoutCount", layoutResults.count } } } };

        LOG_DEBUG << "文档识别完成 版面区域=" << layoutResults.count << " 文本块=" << textBlockCount;
        return true;
    }

    bool detectTableOnly( const std::string &imgPath,
                          int cropX1, int cropY1, int cropX2, int cropY2,
                          Server::json &out, std::string &err ) {
        Server::json tableJson = recognizeTable( imgPath );
        if ( tableJson.is_null() ) {
            err = "表格识别失败";
            return false;
        }

        Server::json blocks = Server::json::array();

        Server::json cellBoxes = tableJson.value( "cellBoxes", Server::json::array() );
        if ( cellBoxes.is_array() && !cellBoxes.empty() ) {
            float overallMinX = 1e9f, overallMinY = 1e9f;
            float overallMaxX = 0, overallMaxY = 0;
            for ( const auto &cb : cellBoxes ) {
                if ( !cb.is_array() || cb.size() < 4 )
                    continue;
                float bx1 = cb[0].get<float>(), by1 = cb[1].get<float>();
                float bx2 = cb[2].get<float>(), by2 = cb[3].get<float>();
                if ( bx1 < overallMinX )
                    overallMinX = bx1;
                if ( by1 < overallMinY )
                    overallMinY = by1;
                if ( bx2 > overallMaxX )
                    overallMaxX = bx2;
                if ( by2 > overallMaxY )
                    overallMaxY = by2;
            }
            if ( overallMinX < 1e9f ) {
                Server::json tableBox = Server::json::array();
                tableBox.push_back( { { "x", overallMinX }, { "y", overallMinY } } );
                tableBox.push_back( { { "x", overallMaxX }, { "y", overallMinY } } );
                tableBox.push_back( { { "x", overallMaxX }, { "y", overallMaxY } } );
                tableBox.push_back( { { "x", overallMinX }, { "y", overallMaxY } } );
                blocks.push_back( {
                    { "type", std::string( "table" ) },
                    { "text", std::string( "" ) },
                    { "score", 1.0 },
                    { "box", tableBox },
                    { "table", tableJson },
                } );
            } else {
                blocks.push_back( {
                    { "type", std::string( "table" ) },
                    { "text", std::string( "" ) },
                    { "score", 1.0 },
                    { "box", Server::json::array() },
                    { "table", tableJson },
                } );
            }
        } else {
            Server::json boxJson = Server::json::array();
            if ( cropX1 > 0 || cropY1 > 0 || cropX2 > 0 || cropY2 > 0 ) {
                boxJson.push_back( { { "x", cropX1 }, { "y", cropY1 } } );
                boxJson.push_back( { { "x", cropX2 }, { "y", cropY1 } } );
                boxJson.push_back( { { "x", cropX2 }, { "y", cropY2 } } );
                boxJson.push_back( { { "x", cropX1 }, { "y", cropY2 } } );
            }
            blocks.push_back( {
                { "type", std::string( "table" ) },
                { "text", std::string( "" ) },
                { "score", 1.0 },
                { "box", boxJson },
                { "table", tableJson },
            } );
        }

        out = {
            { "text", std::string( "" ) },
            { "blocks", blocks },
            { "stats", { { "blockCount", 1 }, { "tableRows", tableJson.value( "rowCount", 0 ) }, { "tableCols", tableJson.value( "colCount", 0 ) } } } };

        LOG_DEBUG << "表格识别完成 行=" << tableJson.value( "rowCount", 0 )
                  << " 列=" << tableJson.value( "colCount", 0 );
        return true;
    }

    Server::json recognizeTable( const std::string &imgPath ) {
        if ( !tableHandle )
            return {};

        TableResult tableResult;
        memset( &tableResult, 0, sizeof( tableResult ) );

        int rc = loader->table_run_file( tableHandle, imgPath.c_str(), &tableResult );
        if ( rc != 0 || tableResult.cell_count <= 0 || !tableResult.logic_points ) {
            loader->table_free_result( &tableResult );
            LOG_DEBUG << "表格结构识别失败或无单元格";
            return {};
        }

        int maxRow = 0, maxCol = 0;
        for ( int i = 0; i < tableResult.cell_count; ++i ) {
            const RectBox &lp = tableResult.logic_points[i];
            if ( lp.y1 + 1 > maxRow )
                maxRow = lp.y1 + 1;
            if ( lp.y2 + 1 > maxCol )
                maxCol = lp.y2 + 1;
        }
        if ( maxRow <= 0 || maxCol <= 0 ) {
            loader->table_free_result( &tableResult );
            return {};
        }

        std::vector<std::vector<std::string>> grid(
            maxRow, std::vector<std::string>( maxCol ) );
        Server::json cellBoxes = Server::json::array();

        for ( int i = 0; i < tableResult.cell_count; ++i ) {
            const TableCell &cell = tableResult.cells[i];
            const RectBox &lp = tableResult.logic_points[i];

            float minX = cell.bbox[0].x, minY = cell.bbox[0].y;
            float maxX = cell.bbox[0].x, maxY = cell.bbox[0].y;
            for ( int k = 1; k < 4; ++k ) {
                float cx = cell.bbox[k].x;
                float cy = cell.bbox[k].y;
                if ( cx < minX )
                    minX = cx;
                if ( cx > maxX )
                    maxX = cx;
                if ( cy < minY )
                    minY = cy;
                if ( cy > maxY )
                    maxY = cy;
            }

            cellBoxes.push_back( { minX, minY, maxX, maxY } );

            int x1 = static_cast<int>( minX );
            int y1 = static_cast<int>( minY );
            int x2 = static_cast<int>( maxX );
            int y2 = static_cast<int>( maxY );

            OcrResultList ocrResults;
            memset( &ocrResults, 0, sizeof( ocrResults ) );
            int ocrRc = loader->run_file( handle, imgPath.c_str(),
                                          x1, y1, x2, y2, &ocrResults );
            if ( ocrRc == 0 ) {
                std::string cellText;
                for ( int j = 0; j < ocrResults.count; ++j ) {
                    const char *t = ocrResults.items[j].text;
                    if ( t && t[0] != '\0' ) {
                        if ( !cellText.empty() )
                            cellText += " ";
                        cellText += t;
                    }
                }
                for ( int r = lp.x1; r <= lp.y1 && r < maxRow; ++r )
                    for ( int c = lp.x2; c <= lp.y2 && c < maxCol; ++c )
                        grid[r][c] = cellText;
            }
            loader->free_results( &ocrResults );
        }

        loader->table_free_result( &tableResult );

        Server::json rows = Server::json::array();
        for ( int r = 0; r < maxRow; ++r ) {
            Server::json row = Server::json::array();
            for ( int c = 0; c < maxCol; ++c )
                row.push_back( grid[r][c] );
            rows.push_back( row );
        }

        LOG_DEBUG << "表格识别成功 行=" << maxRow << " 列=" << maxCol << " 单元格=" << tableResult.cell_count;
        return { { "rows", rows }, { "rowCount", maxRow }, { "colCount", maxCol }, { "cellBoxes", cellBoxes } };
    }
};

// ========================================================================
// OcrEngine 公共接口
// ========================================================================

OcrEngine &OcrEngine::instance() {
    static OcrEngine inst;
    return inst;
}

OcrEngine::~OcrEngine() {
    if ( m_impl ) {
        if ( m_impl->plateHandle && m_impl->loader ) {
            m_impl->loader->plate_destroy( m_impl->plateHandle );
            m_impl->plateHandle = nullptr;
        }
        if ( m_impl->tableHandle && m_impl->loader ) {
            m_impl->loader->table_destroy( m_impl->tableHandle );
            m_impl->tableHandle = nullptr;
        }
        if ( m_impl->layoutHandle && m_impl->loader ) {
            m_impl->loader->doclayout_yolo_destroy( m_impl->layoutHandle );
            m_impl->layoutHandle = nullptr;
        }
        if ( m_impl->handle && m_impl->loader ) {
            m_impl->loader->destroy( m_impl->handle );
            m_impl->handle = nullptr;
        }
    }
}

bool OcrEngine::ensureLoaded( const std::string &modelId,
                              const std::string &clsModelId,
                              const std::string &layoutId,
                              const std::string &tableId,
                              const std::string &tableAlgo,
                              const std::string &tableClsModelId,
                              const std::string &tableWiredModelId,
                              const std::string &plateModelId,
                              const OcrRunParam &param,
                              std::string &err ) {
    if ( !m_impl )
        m_impl = std::make_unique<Impl>();

    std::lock_guard<std::mutex> lk( m_impl->mutex );
    if ( !m_impl->ensureDllLoadedInternal( err ) )
        return false;

    bool isPlateMode = ( !plateModelId.empty() );
    if ( !isPlateMode ) {
        const OcrModelInfo *info = findOcrModelById( modelId );
        if ( !info ) {
            err = "未找到有效的 OCR 模型: " + modelId;
            LOG_ERROR << err;
            return false;
        }
    }

    bool paramChanged = ( param.maxSideLen != m_impl->currentParam.maxSideLen ||
                          param.limitType != m_impl->currentParam.limitType ||
                          param.boxScoreThresh != m_impl->currentParam.boxScoreThresh ||
                          param.boxThresh != m_impl->currentParam.boxThresh ||
                          param.unClipRatio != m_impl->currentParam.unClipRatio ||
                          param.useDilation != m_impl->currentParam.useDilation ||
                          param.scoreMode != m_impl->currentParam.scoreMode ||
                          param.boxType != m_impl->currentParam.boxType ||
                          param.useSpaceChar != m_impl->currentParam.useSpaceChar ||
                          param.recBatchNum != m_impl->currentParam.recBatchNum ||
                          param.dropScore != m_impl->currentParam.dropScore ||
                          param.clsBatchNum != m_impl->currentParam.clsBatchNum ||
                          param.clsThresh != m_impl->currentParam.clsThresh );

    bool plateChanged = m_impl->currentPlateModelId != plateModelId;
    if ( plateChanged && m_impl->plateHandle ) {
        m_impl->loader->plate_destroy( m_impl->plateHandle );
        m_impl->plateHandle = nullptr;
        m_impl->currentPlateModelId.clear();
    }
    if ( plateChanged && !plateModelId.empty() ) {
        m_impl->initPlateInternal( plateModelId, err );
    }

    if ( isPlateMode ) {
        if ( !m_impl->plateHandle ) {
            err = "车牌识别引擎初始化失败";
            return false;
        }
        m_impl->currentParam = param;
        return true;
    }

    const OcrModelInfo *info = findOcrModelById( modelId );
    if ( !info ) {
        err = "未找到有效的 OCR 模型: " + modelId;
        LOG_ERROR << err;
        return false;
    }

    if ( m_impl->handle && m_impl->currentModelId == info->id ) {
        bool clsChanged = m_impl->currentClsModelId != clsModelId;
        bool layoutChanged = m_impl->currentLayoutId != layoutId;
        bool tableChanged = ( m_impl->currentTableId != tableId ||
                              m_impl->currentTableAlgo != tableAlgo ||
                              m_impl->currentTableClsModelId != tableClsModelId ||
                              m_impl->currentTableWiredModelId != tableWiredModelId );
        if ( !clsChanged && !layoutChanged && !tableChanged && !paramChanged )
            return true;
        if ( paramChanged || clsChanged ) {
            m_impl->loader->destroy( m_impl->handle );
            m_impl->handle = nullptr;
            m_impl->currentModelId.clear();
            m_impl->currentClsModelId.clear();
            if ( !m_impl->initModelInternal( *info, clsModelId, param, err ) )
                return false;
            m_impl->currentModelId = info->id;
            m_impl->currentClsModelId = clsModelId;
            m_impl->currentParam = param;
        }
        if ( layoutChanged && m_impl->layoutHandle ) {
            m_impl->loader->doclayout_yolo_destroy( m_impl->layoutHandle );
            m_impl->layoutHandle = nullptr;
            m_impl->currentLayoutId.clear();
        }
        if ( tableChanged && m_impl->tableHandle ) {
            m_impl->loader->table_destroy( m_impl->tableHandle );
            m_impl->tableHandle = nullptr;
            m_impl->currentTableId.clear();
            m_impl->currentTableAlgo.clear();
            m_impl->currentTableClsModelId.clear();
            m_impl->currentTableWiredModelId.clear();
        }
        if ( layoutChanged ) {
            if ( !layoutId.empty() )
                m_impl->initLayoutInternal( layoutId, err );
            else
                m_impl->initLayoutDefault( err );
        }
        if ( tableChanged ) {
            if ( !tableId.empty() )
                m_impl->initTableInternal( tableId, tableAlgo, tableClsModelId, tableWiredModelId, err );
            else
                m_impl->initTableDefault( err );
        }
        return true;
    }
    if ( m_impl->handle ) {
        m_impl->loader->destroy( m_impl->handle );
        m_impl->handle = nullptr;
    }
    if ( m_impl->layoutHandle ) {
        m_impl->loader->doclayout_yolo_destroy( m_impl->layoutHandle );
        m_impl->layoutHandle = nullptr;
    }
    if ( m_impl->tableHandle ) {
        m_impl->loader->table_destroy( m_impl->tableHandle );
        m_impl->tableHandle = nullptr;
    }
    m_impl->currentModelId.clear();
    m_impl->currentLayoutId.clear();
    m_impl->currentTableId.clear();
    m_impl->currentTableAlgo.clear();
    m_impl->currentTableClsModelId.clear();
    m_impl->currentTableWiredModelId.clear();
    m_impl->currentClsModelId.clear();
    if ( !m_impl->initModelInternal( *info, clsModelId, param, err ) )
        return false;
    m_impl->currentClsModelId = clsModelId;
    m_impl->currentParam = param;
    if ( !layoutId.empty() )
        m_impl->initLayoutInternal( layoutId, err );
    else
        m_impl->initLayoutDefault( err );
    if ( !tableId.empty() )
        m_impl->initTableInternal( tableId, tableAlgo, tableClsModelId, tableWiredModelId, err );
    else
        m_impl->initTableDefault( err );
    return true;
}

bool OcrEngine::detect( const std::string &imgPath, const std::string &mode,
                        int cropX1, int cropY1, int cropX2, int cropY2,
                        Server::json &out, std::string &err ) {
    if ( !m_impl ) {
        err = "OCR引擎未初始化";
        return false;
    }
    std::lock_guard<std::mutex> lk( m_impl->mutex );
    if ( !m_impl->loader ) {
        err = "OCR引擎未初始化";
        return false;
    }

    if ( mode == "plate" && m_impl->plateHandle ) {
        return m_impl->detectPlateOnly( imgPath, out, err );
    }

    if ( !m_impl->handle ) {
        err = "OCR引擎未初始化";
        return false;
    }

    if ( mode == "table" && m_impl->tableHandle ) {
        return m_impl->detectTableOnly( imgPath, cropX1, cropY1, cropX2, cropY2, out, err );
    }

    if ( m_impl->layoutHandle ) {
        return m_impl->detectWithLayout( imgPath, cropX1, cropY1, cropX2, cropY2, out, err );
    }

    OcrResultList results;
    memset( &results, 0, sizeof( results ) );

    int rc = m_impl->loader->run_file( m_impl->handle, imgPath.c_str(),
                                       cropX1, cropY1, cropX2, cropY2, &results );
    if ( rc != 0 ) {
        const char *libErr = m_impl->loader->last_error();
        err = libErr ? std::string( "OCR识别失败: " ) + libErr : "OCR识别失败";
        LOG_ERROR << "OCR识别失败 imgPath=" << imgPath << " err=" << err;
        return false;
    }

    Server::json blocks = Server::json::array();
    std::string fullText;
    for ( int i = 0; i < results.count; i++ ) {
        const OcrResult &r = results.items[i];
        Server::json box = Server::json::array();
        for ( int j = 0; j < 4; j++ )
            box.push_back( { { "x", r.box[j].x }, { "y", r.box[j].y } } );
        std::string text = r.text ? r.text : "";
        blocks.push_back( {
            { "type", std::string( "text" ) },
            { "text", text },
            { "score", r.score },
            { "box", box },
        } );
        if ( !fullText.empty() )
            fullText += "\n";
        fullText += text;
    }

    out = {
        { "text", fullText },
        { "blocks", blocks },
        { "stats", { { "blockCount", results.count } } } };

    m_impl->loader->free_results( &results );
    LOG_DEBUG << "OCR识别成功 文本块数=" << results.count;
    return true;
}

} // namespace ocr