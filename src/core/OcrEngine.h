#ifndef OCR_ENGINE_H
#define OCR_ENGINE_H

#include "core/Server.h"
#include <filesystem>
#include <string>
#include <vector>

namespace fs = std::filesystem;

namespace ocr {

struct CropRect {
    int x = 0;
    int y = 0;
    int w = 0;
    int h = 0;
    bool valid() const {
        return w > 0 && h > 0;
    }
};

struct OcrRunParam {
    int maxSideLen = 960;
    std::string limitType = "max";
    float boxScoreThresh = 0.3f;
    float boxThresh = 0.6f;
    float unClipRatio = 1.5f;
    int useDilation = 0;
    std::string scoreMode = "fast";
    std::string boxType = "quad";
    int useSpaceChar = 1;
    int recBatchNum = 6;
    float dropScore = 0.5f;
    int clsBatchNum = 6;
    float clsThresh = 0.9f;
};

enum class TaskStatus : int {
    Queued = 0,
    Running = 1,
    Done = 2,
    Failed = 3,
};

struct OcrModelInfo {
    std::string id;
    std::string name;
    std::string detPath;
    std::string recPath;
    std::string keyPath;
};

struct LayoutModelInfo {
    std::string id;
    std::string name;
    std::string modelPath;
    int modelType = 0;
};

struct TableModelInfo {
    std::string id;
    std::string name;
    std::string modelPath;
    int modelType = 0;
};

struct ClsModelInfo {
    std::string id;
    std::string name;
    std::string modelPath;
    int clsModelType = 0;
};

struct PlateModelInfo {
    std::string id;
    std::string name;
    std::string detPath;
    std::string recPath;
};

const std::vector<OcrModelInfo> &getOcrModelList();
const std::vector<LayoutModelInfo> &getLayoutModelList();
const std::vector<TableModelInfo> &getTableModelList();
const std::vector<ClsModelInfo> &getClsModelList();
const std::vector<PlateModelInfo> &getPlateModelList();
const std::vector<std::string> &getTableClsModelList();

const OcrModelInfo *findOcrModelById( const std::string &id );
const LayoutModelInfo *findLayoutModelById( const std::string &id );
const TableModelInfo *findTableModelById( const std::string &id );
const ClsModelInfo *findClsModelById( const std::string &id );
const PlateModelInfo *findPlateModelById( const std::string &id );

std::string cropImageToTemp( const std::string &srcPath, const CropRect &crop, std::string &errMsg );
void applyCropOffsetToResult( Server::json &data, int dx, int dy );

class OcrEngine {
public:
    static OcrEngine &instance();

    bool ensureLoaded( const std::string &modelId,
                       const std::string &clsModelId,
                       const std::string &layoutId,
                       const std::string &tableId,
                       const std::string &tableAlgo,
                       const std::string &tableClsModelId,
                       const std::string &tableWiredModelId,
                       const std::string &plateModelId,
                       const OcrRunParam &param,
                       std::string &err );

    bool detect( const std::string &imgPath, const std::string &mode,
                 int cropX1, int cropY1, int cropX2, int cropY2,
                 Server::json &out, std::string &err );

    ~OcrEngine();

private:
    OcrEngine() = default;
    OcrEngine( const OcrEngine & ) = delete;
    OcrEngine &operator=( const OcrEngine & ) = delete;

    struct Impl;
    std::unique_ptr<Impl> m_impl;
};

} // namespace ocr

#endif // OCR_ENGINE_H