#ifndef ROUTES_FFMPEG_TOOL_H
#define ROUTES_FFMPEG_TOOL_H

#include <httplib.h>
#include <atomic>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#include "common/Utils.h"
#include "core/Server.h"

namespace routes::ffmpeg {

// 状态码：0=pending, 1=running, 2=completed, 3=failed, 4=cancelled
enum class FfmpegStatus : int {
    Pending = 0,
    Running = 1,
    Completed = 2,
    Failed = 3,
    Cancelled = 4
};

inline const char *ffmpegStatusName( FfmpegStatus s ) {
    switch ( s ) {
    case FfmpegStatus::Pending:
        return "pending";
    case FfmpegStatus::Running:
        return "running";
    case FfmpegStatus::Completed:
        return "completed";
    case FfmpegStatus::Failed:
        return "failed";
    case FfmpegStatus::Cancelled:
        return "cancelled";
    }
    return "pending";
}

// 单个 FFmpeg 任务
struct FfmpegTask {
    std::string id;
    std::string inputPath;
    std::string outputPath;
    std::string operation; // "trim" | "convert" | "compress" | "custom" | "download"
    utils::json options;   // 操作相关参数
    std::string encoder;   // "auto" | "h264_nvenc" | "hevc_nvenc" | "h264_qsv" | "h264_amf" | "libx264"
    int extraThreads = 0;  // ffmpeg -threads 值，0 表示不指定
    int64_t createdAtMs = 0;

    // 运行时状态
    std::atomic<int> status{ static_cast<int>( FfmpegStatus::Pending ) };
    std::atomic<int> progress{ 0 }; // 0-100
    std::atomic<double> currentFps{ 0.0 };
    std::atomic<double> speed{ 0.0 }; // ffmpeg speed= 字段
    std::atomic<double> bitrateKbps{ 0.0 };
    std::atomic<int64_t> elapsedMs{ 0 };
    std::atomic<int64_t> etaMs{ 0 };
    std::atomic<double> durationSec{ 0.0 };
    std::atomic<double> outTimeSec{ 0.0 };
    std::atomic<int64_t> inputSize{ 0 };
    std::atomic<int64_t> outputSize{ 0 };
    std::string error;
    int exitCode = 0;
    std::string commandLine; // 实际执行的命令行（用于展示）
    std::string logTail;     // ffmpeg 末尾若干行日志

    int64_t startTimeMs = 0;
    int64_t endTimeMs = 0;

    // 内部：进程与线程
    struct Impl;
    std::unique_ptr<Impl> impl;
};

// 任务管理器（单例）
class FfmpegManager {

private:
    mutable std::mutex m_mutex;
    mutable std::mutex m_infoMutex;
    Server::json m_cachedInfo; // 缓存 ffmpeg 信息
    std::condition_variable m_cv;
    std::unordered_map<std::string, std::unique_ptr<FfmpegTask>> m_tasks;
    std::vector<std::string> m_pending; // 等待执行的任务 id
    std::vector<std::string> m_running; // 正在执行的任务 id
    std::thread m_worker;
    std::atomic<bool> m_stop{ false };
    std::atomic<int> m_maxParallel{ 1 };
    std::once_flag m_infoOnce;

public:
    static FfmpegManager &instance();

    // 获取 ffmpeg 信息（路径、版本、可用编码器）
    Server::json info();

    // 创建任务。spec: { inputPath, outputPath, operation, options, encoder, extraThreads }
    // 返回: { success, task, error }
    Server::json createTask( const utils::json &spec );

    // 取消任务（仅对 pending/running 生效）
    bool cancelTask( const std::string &id );

    // 删除任务（从列表中移除，已结束的可以随时删除，运行中的会先取消）
    bool removeTask( const std::string &id );

    // 获取单个任务快照
    Server::json getTask( const std::string &id );

    // 列出所有任务
    Server::json listTasks();

    // 设置/获取最大并发任务数
    void setMaxParallel( int n );
    int getMaxParallel() const;

    // 关闭所有正在运行的任务（用于程序退出）
    void shutdownAll();

private:
    FfmpegManager();
    FfmpegManager( const FfmpegManager & ) = delete;
    FfmpegManager &operator=( const FfmpegManager & ) = delete;

    void workerLoop();
    void startTask( FfmpegTask *task );
    void waitTask( FfmpegTask *task );
    void finishTask( const std::string &id, const std::string &status, int exitCode, const std::string &error );
    void removeTaskInternal( const std::string &id );

    Server::json buildTaskJson( FfmpegTask *task ) const;

    // 解析 ffmpeg 进度（从 stderr 一行）
    void parseFfmpegProgress( FfmpegTask *task, const std::string &line );

    // 处理 ffmpeg 的输出
    void parseFfmpegOut( FfmpegTask *task, std::string &outPending );

    // 构造 ffmpeg 命令行
    std::vector<std::string> buildArgs(
        FfmpegTask *task,
        const std::string &ffmpegPath,
        std::string &displayArgs ) const;

    std::vector<std::string> buildDownloadArgs(
        FfmpegTask *task,
        const std::string &ffmpegPath,
        std::string &displayArgs,
        std::vector<std::string> &args ) const;

    // 推导默认输出路径（当用户未指定时）
    std::string deriveOutputPath( const FfmpegTask *task ) const;

    // 计算目标输出大小相关的 ffmpeg 参数（用于 compress）
    // returns bitrate string for -b:v, or empty to use other method
    std::string computeTargetBitrate( const FfmpegTask *task ) const;

    // 获取输入文件时长（秒）
    double probeDuration( const std::string &ffmpegPath, const std::string &inputPath ) const;
};

void registerFfmpegRoutes( httplib::Server &svr );

} // namespace routes::ffmpeg

#endif // ROUTES_FFMPEG_TOOL_H
