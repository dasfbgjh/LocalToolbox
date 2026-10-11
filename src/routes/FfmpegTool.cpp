#include "routes/FfmpegTool.h"
#include "common/Config.h"
#include "common/EventLoop.h"
#include "common/Logger.hpp"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <regex>
#include <sstream>

namespace fs = std::filesystem;

namespace routes::ffmpeg {

// ===== 工具函数 =====

// 判断是否为 URL 输入（http/https/rtmp/rtsp/rtsp/file 等含协议头的输入）
static bool isUrlInput( const std::string &s ) {
    if ( s.empty() )
        return false;
    // 形如 "http://..."、"rtmp://..."、"rtsp://..."、"tcp://..."、"udp://..."、ffmpeg 协议的 "subfile:,mms:,data:" 等
    return s.find( "://" ) != std::string::npos;
}

// ===== 任务 Impl =====
struct FfmpegTask::Impl {
    std::unique_ptr<AsyncProcess> process;
    std::thread waiterThread;
    std::atomic<bool> cancelled{ false };
};

// 把字符串状态转为枚举
static FfmpegStatus parseStatus( const std::string &s ) {
    if ( s == "running" )
        return FfmpegStatus::Running;
    if ( s == "completed" )
        return FfmpegStatus::Completed;
    if ( s == "failed" )
        return FfmpegStatus::Failed;
    if ( s == "cancelled" )
        return FfmpegStatus::Cancelled;
    return FfmpegStatus::Pending;
}

int64_t nowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::system_clock::now().time_since_epoch() )
        .count();
}

// 把 HH:MM:SS.xx 或秒数解析为秒
static double parseTimeToSec( const std::string &s ) {
    if ( s.empty() )
        return 0;
    // HH:MM:SS.xx
    if ( s.find( ':' ) != std::string::npos ) {
        int h = 0, m = 0;
        double sec = 0;
        if ( std::sscanf( s.c_str(), "%d:%d:%lf", &h, &m, &sec ) >= 2 ) {
            return h * 3600 + m * 60 + sec;
        }
        return 0;
    }
    try {
        return std::stod( s );
    } catch ( ... ) {
        return 0;
    }
}

// 读取整个文件内容到字符串
static std::string readAll( const std::string &path ) {
    std::ifstream f( path, std::ios::binary );
    if ( !f )
        return {};
    std::ostringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

// ===== FfmpegManager 实现 =====

FfmpegManager &FfmpegManager::instance() {
    static FfmpegManager inst;
    return inst;
}

FfmpegManager::FfmpegManager() {
    m_worker = std::thread( [this] { workerLoop(); } );
}

void FfmpegManager::shutdownAll() {
    m_stop = true;
    m_cv.notify_all();
    if ( m_worker.joinable() )
        m_worker.join();
    std::lock_guard<std::mutex> lock( m_mutex );
    for ( auto &[id, task] : m_tasks ) {
        if ( task->status.load() == static_cast<int>( FfmpegStatus::Running ) && task->impl && task->impl->process ) {
            try {
                task->impl->process->terminate();
            } catch ( ... ) {
            }
        }
    }
    for ( auto &[id, task] : m_tasks ) {
        if ( task->impl ) {
            if ( task->impl->waiterThread.joinable() )
                task->impl->waiterThread.join();
        }
    }
}

Server::json FfmpegManager::info() {
    std::lock_guard<std::mutex> lock( m_infoMutex );
    std::call_once( m_infoOnce, [this] {
        m_cachedInfo = Server::json::object();
        std::string ffmpeg = Config::getFfmpegPath();
        m_cachedInfo["ffmpegPath"] = ffmpeg;
        m_cachedInfo["available"] = false;
        m_cachedInfo["version"] = "";
        m_cachedInfo["encoders"] = Server::json::array();

        if ( ffmpeg.empty() ) {
            m_cachedInfo["error"] = "未配置 ffmpeg 路径(--ffmpeg 或 config.ffmpegPath)";
            return;
        }

        // 调用 ffmpeg -version
        auto verResult = EventLoop::runProcessSync(
            { ffmpeg, "-version" }, fs::current_path() );
        if ( !verResult.started ) {
            m_cachedInfo["error"] = "启动 ffmpeg 失败";
            return;
        }

        if ( !verResult.output.empty() ) {
            size_t nl = verResult.output.find( '\n' );
            m_cachedInfo["version"] = ( nl != std::string::npos ) ? verResult.output.substr( 0, nl ) : verResult.output;
            m_cachedInfo["available"] = true;
        }

        // 列出可用编码器
        auto encResult = EventLoop::runProcessSync(
            { ffmpeg, "-hide_banner", "-encoders" }, fs::current_path() );
        if ( encResult.started ) {
            std::vector<std::string> want = { "h264_nvenc", "hevc_nvenc", "h264_qsv", "hevc_qsv", "h264_amf", "hevc_amf", "libx264", "libx265" };
            for ( const auto &enc : want ) {
                if ( encResult.output.find( enc ) != std::string::npos ) {
                    m_cachedInfo["encoders"].push_back( enc );
                }
            }
        }
    } );
    return m_cachedInfo;
}

void FfmpegManager::setMaxParallel( int n ) {
    if ( n < 1 )
        n = 1;
    if ( n > 16 )
        n = 16;
    m_maxParallel = n;
    m_cv.notify_all();
}

int FfmpegManager::getMaxParallel() const {
    return m_maxParallel.load();
}

std::string FfmpegManager::deriveOutputPath( const FfmpegTask *task ) const {
    // 默认输出：<input_dir>/<input_stem>{.trim}{.compressed}{.converted}.<ext>
    fs::path in( task->inputPath );
    std::string stem = in.stem().string();
    fs::path parent = in.parent_path();
    std::string origExt = in.extension().string();
    if ( origExt.empty() )
        origExt = ".mp4";
    std::string ext = origExt;

    const auto &opts = task->options;
    bool enableTrim = opts.value( "enableTrim", false );
    bool enableConvert = opts.value( "enableConvert", false );
    bool enableCompress = opts.value( "enableCompress", false );

    if ( enableConvert && opts.contains( "outputFormat" ) && opts["outputFormat"].is_string() ) {
        ext = "." + opts["outputFormat"].get<std::string>();
    }

    std::string suffix;
    if ( enableTrim )
        suffix += ".trim";
    if ( enableCompress )
        suffix += ".compressed";
    if ( enableConvert )
        suffix += ".converted";
    if ( suffix.empty() )
        suffix = ".out";

    // URL 输入：http://x/y/z.m3u8 → parent_path = "http://x/y"，显然不可写。
    // 这种情况应回退到 outputDir / <stem>.<ext>，由调用方在使用前填好 outputPath。
    if ( isUrlInput( task->inputPath ) ) {
        std::string fallbackDir;
        if ( opts.contains( "outputDir" ) && opts["outputDir"].is_string() ) {
            fallbackDir = opts["outputDir"].get<std::string>();
        }
        if ( fallbackDir.empty() ) {
            fallbackDir = ".";
        }
        std::string fallbackExt = ".mp4";
        if ( opts.contains( "outputFormat" ) && opts["outputFormat"].is_string() ) {
            fallbackExt = "." + opts["outputFormat"].get<std::string>();
        } else if ( !origExt.empty() ) {
            fallbackExt = origExt;
        }
        return ( fs::path( fallbackDir ) / ( ( stem.empty() ? "download" : stem ) + fallbackExt ) ).string();
    }

    return ( parent / ( stem + suffix + ext ) ).string();
}

std::string FfmpegManager::computeTargetBitrate( const FfmpegTask *task ) const {
    // options: { percent: 50, audioBitrateKbps: 128 }   // 目标输出大小 = 输入大小 * percent / 100
    if ( !task->options.contains( "percent" ) )
        return {};
    double percent = 50.0;
    try {
        if ( task->options["percent"].is_number() )
            percent = task->options["percent"].get<double>();
    } catch ( ... ) {
    }
    if ( percent <= 0 )
        return {};

    // 估算时长（秒）
    double durationSec = task->durationSec;
    if ( durationSec <= 0 )
        return {};

    // 输入大小（字节）
    int64_t inSize = task->inputSize;
    if ( inSize <= 0 ) {
        std::error_code ec;
        inSize = fs::file_size( task->inputPath, ec );
    }
    if ( inSize <= 0 )
        return {};

    // 目标总比特率（视频+音频，单位 kbps）
    // target_bits = inSize * percent/100 * 8
    // total_kbps = target_bits / 1000 / durationSec
    double targetBits = static_cast<double>( inSize ) * ( percent / 100.0 ) * 8.0;
    double totalKbps = targetBits / 1000.0 / durationSec;
    if ( totalKbps < 50 )
        totalKbps = 50;

    // 音频比特率：可由 options.audioBitrateKbps 覆盖（默认 128kbps）
    double audioKbps = 128.0;
    if ( task->options.contains( "audioBitrateKbps" ) && task->options["audioBitrateKbps"].is_number() ) {
        try {
            audioKbps = task->options["audioBitrateKbps"].get<double>();
        } catch ( ... ) {
        }
    }
    if ( audioKbps < 32 )
        audioKbps = 32;
    if ( audioKbps > 320 )
        audioKbps = 320;
    // 目标总码率过小时，音频自动下调，保证视频至少 50kbps
    if ( totalKbps < audioKbps + 50.0 ) {
        audioKbps = std::max( 32.0, totalKbps - 50.0 );
    }
    double videoKbps = totalKbps - audioKbps;
    if ( videoKbps < 50 )
        videoKbps = 50;

    char buf[32];
    std::snprintf( buf, sizeof( buf ), "%.0fk", videoKbps );
    return buf;
}

std::vector<std::string> FfmpegManager::buildArgs( FfmpegTask *task, const std::string &ffmpegPath, std::string &displayArgs ) const {
    std::vector<std::string> args;
    args.push_back( ffmpegPath );
    args.push_back( "-hide_banner" );
    args.push_back( "-y" );
    args.push_back( "-nostdin" );

    if ( task->extraThreads > 0 ) {
        args.push_back( "-threads" );
        args.push_back( std::to_string( task->extraThreads ) );
    }

    // ===== download 模式：用于从 URL 拉流/录制（含 m3u8 -> mp4、http(s) 下载、rtmp/rtsp 录制等）=====
    // 与转换/压缩走完全不同的参数集，单独处理。
    if ( task->operation == "download" )
        return buildDownloadArgs( task, ffmpegPath, displayArgs, args );

    // 操作开关（options 中读取）
    const auto &opts = task->options;
    bool enableTrim = opts.value( "enableTrim", false );
    bool enableConvert = opts.value( "enableConvert", false );
    bool enableCompress = opts.value( "enableCompress", false );

    // ===== trim =====
    double trimStartSec = 0; // 解析后的开始时间（秒），供 endTime/tail 复用
    if ( enableTrim ) {
        if ( opts.contains( "startTime" ) ) {
            if ( opts["startTime"].is_string() )
                trimStartSec = parseTimeToSec( opts["startTime"].get<std::string>() );
            else if ( opts["startTime"].is_number() )
                trimStartSec = opts["startTime"].get<double>();
            if ( trimStartSec > 0 ) {
                char buf[32];
                std::snprintf( buf, sizeof( buf ), "%.3f", trimStartSec );
                args.push_back( "-ss" );
                args.push_back( buf );
            }
        }
    }

    args.push_back( "-i" );
    args.push_back( task->inputPath );

    if ( enableTrim ) {
        if ( opts.contains( "endTime" ) ) {
            double t = 0;
            if ( opts["endTime"].is_string() )
                t = parseTimeToSec( opts["endTime"].get<std::string>() );
            else if ( opts["endTime"].is_number() )
                t = opts["endTime"].get<double>();
            if ( t > 0 ) {
                // ffmpeg 的 -to 是基于 -ss 之后的输出时间轴：
                // 这里把用户填的"绝对结束时间"换算为相对开始时间的值（endTime - startTime）
                double dur = t - trimStartSec;
                if ( dur > 0 ) {
                    char buf[32];
                    std::snprintf( buf, sizeof( buf ), "%.3f", dur );
                    args.push_back( "-to" );
                    args.push_back( buf );
                } else {
                    // 兜底：endTime <= startTime 时回退为原绝对时间
                    char buf[32];
                    std::snprintf( buf, sizeof( buf ), "%.3f", t );
                    args.push_back( "-to" );
                    args.push_back( buf );
                }
            }
        }
        if ( opts.contains( "duration" ) ) {
            double t = 0;
            const auto &dv = opts["duration"];
            if ( dv.is_string() )
                t = parseTimeToSec( dv.get<std::string>() );
            else if ( dv.is_number() )
                t = dv.get<double>();
            if ( t > 0 ) {
                char buf[32];
                std::snprintf( buf, sizeof( buf ), "%.3f", t );
                args.push_back( "-t" );
                args.push_back( buf );
            }
        }
        // tail: 距离结尾 N 秒（-to 按 -ss 之后输出时间轴，所以也要减 startTime）
        if ( opts.contains( "tail" ) && task->durationSec > 0 ) {
            double t = 0;
            const auto &dv = opts["tail"];
            if ( dv.is_string() )
                t = parseTimeToSec( dv.get<std::string>() );
            else if ( dv.is_number() )
                t = dv.get<double>();
            if ( t > 0 ) {
                double relEnd = ( task->durationSec - t ) - trimStartSec;
                if ( relEnd < 0 )
                    relEnd = 0;
                char buf[32];
                std::snprintf( buf, sizeof( buf ), "%.3f", relEnd );
                args.push_back( "-to" );
                args.push_back( buf );
            }
        }
    }

    // ===== 编码器（仅在 convert/compress 或显式指定时重新编码；纯 trim 优先 stream copy）=====
    bool needEncode = enableConvert || enableCompress || ( !task->encoder.empty() && task->encoder != "auto" );

    // 读取 enableGpu 开关（默认 true；关闭时强制软件编码 libx264）
    bool enableGpu = true;
    if ( opts.contains( "enableGpu" ) && opts["enableGpu"].is_boolean() ) {
        enableGpu = opts["enableGpu"].get<bool>();
    }

    if ( needEncode ) {
        auto hasEncoder = []( const std::string &enc, const Server::json &info ) {
            if ( !info.contains( "encoders" ) || !info["encoders"].is_array() )
                return false;
            for ( const auto &e : info["encoders"] ) {
                if ( e.is_string() && e.get<std::string>() == enc )
                    return true;
            }
            return false;
        };
        Server::json info = const_cast<FfmpegManager *>( this )->info();

        std::string enc = task->encoder;
        if ( enc.empty() || enc == "auto" ) {
            if ( !enableGpu ) {
                // 关闭 GPU → 强制软件编码
                enc = "libx264";
            } else {
                // 自动选择：根据可用编码器
                std::vector<std::string> prefer = { "h264_nvenc", "h264_qsv", "h264_amf", "libx264" };
                for ( const auto &p : prefer ) {
                    if ( hasEncoder( p, info ) ) {
                        enc = p;
                        break;
                    }
                }
                if ( enc.empty() || enc == "auto" )
                    enc = "libx264";
            }
        } else if ( !enableGpu && enc.find( "lib" ) != 0 ) {
            // 显式指定了 GPU 编码器，但开关关闭 → 降级到 libx264
            enc = "libx264";
        }
        args.push_back( "-c:v" );
        args.push_back( enc );

        // 预设
        if ( enc.find( "nvenc" ) != std::string::npos ) {
            args.push_back( "-preset" );
            args.push_back( "p4" );
            args.push_back( "-rc" );
            args.push_back( "vbr" );
        } else if ( enc.find( "qsv" ) != std::string::npos ) {
            args.push_back( "-preset" );
            args.push_back( "medium" );
        } else if ( enc.find( "amf" ) != std::string::npos ) {
            args.push_back( "-quality" );
            args.push_back( "balanced" );
        } else {
            args.push_back( "-preset" );
            args.push_back( "medium" );
        }
    } else {
        // 纯 trim（未指定编码器）→ stream copy，最快
        args.push_back( "-c" );
        args.push_back( "copy" );
    }

    // ===== compress：设置目标码率 + 音频比特率 =====
    if ( enableCompress ) {
        std::string vbitrate = const_cast<FfmpegManager *>( this )->computeTargetBitrate( task );
        if ( !vbitrate.empty() ) {
            args.push_back( "-b:v" );
            args.push_back( vbitrate );
        } else {
            // 兜底：CRF 28
            args.push_back( "-crf" );
            args.push_back( "28" );
        }
        // 音频比特率（默认 128k，compress 时强制重新编码音频以应用指定码率）
        double abr = 128.0;
        if ( opts.contains( "audioBitrateKbps" ) && opts["audioBitrateKbps"].is_number() ) {
            try {
                abr = opts["audioBitrateKbps"].get<double>();
            } catch ( ... ) {
            }
        }
        if ( abr < 32 )
            abr = 32;
        if ( abr > 320 )
            abr = 320;
        char abuf[16];
        std::snprintf( abuf, sizeof( abuf ), "%.0fk", abr );
        args.push_back( "-b:a" );
        args.push_back( abuf );
        args.push_back( "-c:a" );
        args.push_back( "aac" );
    } else if ( enableConvert ) {
        // 单纯格式转换（无 compress）→ CRF 20 保证质量
        args.push_back( "-crf" );
        args.push_back( "20" );
    }
    // convert + compress 同时启用：crf 会被 -b:v 覆盖，无冲突

    // ===== 转换格式时，输出格式的 codec / flag =====
    if ( enableConvert && opts.contains( "outputFormat" ) && opts["outputFormat"].is_string() ) {
        std::string fmt = opts["outputFormat"].get<std::string>();
        std::string lower = fmt;
        std::transform( lower.begin(), lower.end(), lower.begin(), ::tolower );
        if ( lower == "mp4" || lower == "m4v" ) {
            args.push_back( "-c:a" );
            args.push_back( "aac" );
            args.push_back( "-movflags" );
            args.push_back( "+faststart" );
        } else if ( lower == "mkv" || lower == "webm" ) {
            args.push_back( "-c:a" );
            args.push_back( "copy" );
        } else if ( lower == "gif" ) {
            args.push_back( "-vf" );
            args.push_back( "fps=15,scale=480:-1:flags=lanczos" );
        } else if ( lower == "mp3" ) {
            args.push_back( "-vn" );
            args.push_back( "-c:a" );
            args.push_back( "libmp3lame" );
        } else if ( lower == "wav" ) {
            args.push_back( "-vn" );
            args.push_back( "-c:a" );
            args.push_back( "pcm_s16le" );
        } else if ( lower == "m4a" ) {
            args.push_back( "-vn" );
            args.push_back( "-c:a" );
            args.push_back( "aac" );
        } else {
            args.push_back( "-c:a" );
            args.push_back( "copy" );
        }
    }

    // 自定义参数
    if ( task->options.contains( "extraArgs" ) && task->options["extraArgs"].is_array() ) {
        for ( const auto &a : task->options["extraArgs"] ) {
            if ( a.is_string() ) {
                std::string s = a.get<std::string>();
                if ( !s.empty() )
                    args.push_back( s );
            }
        }
    }

    // 进度输出到 stderr（pipe:2 是 stderr）
    args.push_back( "-progress" );
    args.push_back( "pipe:2" );
    args.push_back( "-loglevel" );
    args.push_back( "info" );

    args.push_back( task->outputPath );

    // 构造可显示的命令行
    {
        std::ostringstream ss;
        for ( size_t i = 0; i < args.size(); ++i ) {
            if ( i > 0 )
                ss << ' ';
            const std::string &a = args[i];
            if ( a.find( ' ' ) != std::string::npos )
                ss << '"' << a << '"';
            else
                ss << a;
        }
        displayArgs = ss.str();
    }
    return args;
}

std::vector<std::string> FfmpegManager::buildDownloadArgs( FfmpegTask *task, const std::string &ffmpegPath, std::string &displayArgs, std::vector<std::string> &args ) const {
    const auto &opts = task->options;

    // 网络 IO 超时（毫秒）；默认 30 秒
    int64_t timeoutMs = 30000;
    if ( opts.contains( "timeoutMs" ) && opts["timeoutMs"].is_number_integer() ) {
        timeoutMs = opts["timeoutMs"].get<int64_t>();
        if ( timeoutMs < 1000 )
            timeoutMs = 1000;
    }

    // 仅对 http(s)/rtmp/rtsp 等网络协议做重连配置
    bool isHttp = task->inputPath.rfind( "http://", 0 ) == 0 || task->inputPath.rfind( "https://", 0 ) == 0;
    bool isNetwork = isHttp ||
                     task->inputPath.rfind( "rtmp://", 0 ) == 0 ||
                     task->inputPath.rfind( "rtsp://", 0 ) == 0 ||
                     task->inputPath.rfind( "tcp://", 0 ) == 0 ||
                     task->inputPath.rfind( "udp://", 0 ) == 0;
    // http(s) 默认开启重连；其他网络协议可选项
    bool allowReconnect = isHttp;
    if ( opts.contains( "reconnect" ) && opts["reconnect"].is_boolean() ) {
        allowReconnect = opts["reconnect"].get<bool>();
    }
    if ( allowReconnect && isNetwork ) {
        args.push_back( "-reconnect" );
        args.push_back( "1" );
        args.push_back( "-reconnect_streamed" );
        args.push_back( "1" );
        args.push_back( "-reconnect_delay_max" );
        args.push_back( "5" );
    }

    // -timeout 单位是微秒
    args.push_back( "-timeout" );
    args.push_back( std::to_string( timeoutMs * 1000 ) );

    // 用户自定义 header（http 头），如 "User-Agent: ..."、Referer: ...
    if ( opts.contains( "headers" ) && opts["headers"].is_array() ) {
        for ( const auto &h : opts["headers"] ) {
            if ( h.is_string() ) {
                std::string s = h.get<std::string>();
                if ( !s.empty() ) {
                    args.push_back( "-headers" );
                    args.push_back( s );
                }
            }
        }
    }
    // 用户代理
    if ( opts.contains( "userAgent" ) && opts["userAgent"].is_string() ) {
        std::string ua = opts["userAgent"].get<std::string>();
        if ( !ua.empty() ) {
            args.push_back( "-user_agent" );
            args.push_back( ua );
        }
    }
    // m3u8/HLS 选项
    if ( opts.contains( "hlsAllowExtensions" ) && opts["hlsAllowExtensions"].is_boolean() ) {
        // ffmpeg 用 -protocol_whitelist 与 -allowed_extensions
        if ( opts["hlsAllowExtensions"].get<bool>() ) {
            args.push_back( "-allowed_extensions" );
            args.push_back( "ALL" );
        }
    }

    args.push_back( "-i" );
    args.push_back( task->inputPath );

    // 录制时长（仅用于直播/有边界的源）；0 表示源结束即结束
    if ( opts.contains( "recordDurationSec" ) ) {
        double t = 0;
        const auto &dv = opts["recordDurationSec"];
        if ( dv.is_string() )
            t = parseTimeToSec( dv.get<std::string>() );
        else if ( dv.is_number() )
            t = dv.get<double>();
        if ( t > 0 ) {
            char buf[32];
            std::snprintf( buf, sizeof( buf ), "%.3f", t );
            args.push_back( "-t" );
            args.push_back( buf );
        }
    }

    // 是否允许重新编码（默认 false：stream copy，最快且无损）
    bool reEncode = false;
    if ( opts.contains( "reEncode" ) && opts["reEncode"].is_boolean() ) {
        reEncode = opts["reEncode"].get<bool>();
    }
    // 兼容 convert/compress 模式：开了就重新编码
    bool enableConvert = opts.value( "enableConvert", false );
    bool enableCompress = opts.value( "enableCompress", false );
    reEncode = reEncode || enableConvert || enableCompress;

    if ( reEncode ) {
        // 用 libx264/aac 安全重编码
        args.push_back( "-c:v" );
        args.push_back( "libx264" );
        args.push_back( "-preset" );
        args.push_back( "veryfast" );
        args.push_back( "-c:a" );
        args.push_back( "aac" );
        args.push_back( "-b:a" );
        args.push_back( "128k" );
        // m3u8 -> mp4：开启 faststart
        if ( task->outputPath.size() >= 4 &&
             task->outputPath.substr( task->outputPath.size() - 4 ) == ".mp4" ) {
            args.push_back( "-movflags" );
            args.push_back( "+faststart" );
        }
    } else {
        // 流复制：m3u8 -> mp4 时需要对 AAC 加 ADTS 头
        args.push_back( "-c" );
        args.push_back( "copy" );
        if ( task->outputPath.size() >= 4 &&
             task->outputPath.substr( task->outputPath.size() - 4 ) == ".mp4" ) {
            args.push_back( "-bsf:a" );
            args.push_back( "aac_adtstoasc" );
            args.push_back( "-movflags" );
            args.push_back( "+faststart" );
        }
    }

    // 自定义参数
    if ( opts.contains( "extraArgs" ) && opts["extraArgs"].is_array() ) {
        for ( const auto &a : opts["extraArgs"] ) {
            if ( a.is_string() ) {
                std::string s = a.get<std::string>();
                if ( !s.empty() )
                    args.push_back( s );
            }
        }
    }

    // 进度输出
    args.push_back( "-progress" );
    args.push_back( "pipe:2" );
    args.push_back( "-loglevel" );
    args.push_back( "info" );

    args.push_back( task->outputPath );

    {
        std::ostringstream ss;
        for ( size_t i = 0; i < args.size(); ++i ) {
            if ( i > 0 )
                ss << ' ';
            const std::string &a = args[i];
            if ( a.find( ' ' ) != std::string::npos )
                ss << '"' << a << '"';
            else
                ss << a;
        }
        displayArgs = ss.str();
    }
    return args;
}

double FfmpegManager::probeDuration( const std::string &ffmpegPath, const std::string &inputPath ) const {
    auto result = EventLoop::runProcessSync(
        { ffmpegPath, "-i", inputPath }, fs::current_path() );
    if ( !result.started )
        return 0;
    // ffmpeg 将 "Duration: ..." 输出到 stderr
    const std::string &out = result.error.empty() ? result.output : result.error;
    // Duration: HH:MM:SS.xx
    static const std::regex re( R"(Duration:\s*(\d+):(\d+):(\d+\.\d+))" );
    std::smatch m;
    if ( std::regex_search( out, m, re ) ) {
        int h = std::stoi( m[1].str() );
        int mi = std::stoi( m[2].str() );
        double sc = std::stod( m[3].str() );
        return h * 3600 + mi * 60 + sc;
    }
    return 0;
}

Server::json FfmpegManager::buildTaskJson( FfmpegTask *task ) const {
    Server::json j;
    j["id"] = task->id;
    j["inputPath"] = task->inputPath;
    j["inputName"] = fs::path( task->inputPath ).filename().string();
    j["outputPath"] = task->outputPath;
    j["outputName"] = fs::path( task->outputPath ).filename().string();
    j["operation"] = task->operation;
    j["options"] = task->options;
    j["encoder"] = task->encoder;
    j["status"] = ffmpegStatusName( static_cast<FfmpegStatus>( task->status.load() ) );
    j["progress"] = task->progress.load();
    j["fps"] = task->currentFps.load();
    j["speed"] = task->speed.load();
    j["bitrateKbps"] = task->bitrateKbps.load();
    j["durationSec"] = task->durationSec.load();
    j["outTimeSec"] = task->outTimeSec.load();
    j["elapsedMs"] = task->elapsedMs.load();
    j["etaMs"] = task->etaMs.load();
    j["inputSize"] = task->inputSize.load();
    j["outputSize"] = task->outputSize.load();
    j["error"] = task->error;
    j["exitCode"] = task->exitCode;
    j["createdAt"] = task->createdAtMs;
    j["startTime"] = task->startTimeMs;
    j["endTime"] = task->endTimeMs;
    j["commandLine"] = task->commandLine;
    j["logTail"] = task->logTail;
    return j;
}

void FfmpegManager::parseFfmpegProgress( FfmpegTask *task, const std::string &line ) {
    // 仅匹配 Key=Value
    auto eq = line.find( '=' );
    if ( eq == std::string::npos )
        return;
    std::string key = line.substr( 0, eq );
    std::string val = line.substr( eq + 1 );
    // 去掉尾随空白
    while ( !val.empty() && ( val.back() == '\r' || val.back() == '\n' || val.back() == ' ' ) )
        val.pop_back();

    if ( key == "out_time_us" || key == "out_time_ms" ) {
        try {
            double us = std::stoll( val );
            double sec = us / 1000000.0;
            task->outTimeSec = sec;
        } catch ( ... ) {
        }
    } else if ( key == "out_time" ) {
        try {
            task->outTimeSec = parseTimeToSec( val );
        } catch ( ... ) {
        }
    } else if ( key == "fps" ) {
        try {
            task->currentFps = std::stod( val );
        } catch ( ... ) {
        }
    } else if ( key == "speed" ) {
        // 形如 "1.5x"
        try {
            std::string s = val;
            if ( !s.empty() && s.back() == 'x' )
                s.pop_back();
            task->speed = std::stod( s );
        } catch ( ... ) {
        }
    } else if ( key == "bitrate" ) {
        // 形如 "1234.5kbits/s"
        try {
            std::string s = val;
            double mul = 1.0;
            if ( s.size() > 7 && s.substr( s.size() - 7 ) == "kbits/s" ) {
                mul = 1.0;
                s = s.substr( 0, s.size() - 7 );
            } else if ( s.size() > 7 && s.substr( s.size() - 7 ) == "bits/s" ) {
                mul = 0.001;
                s = s.substr( 0, s.size() - 7 );
            }
            task->bitrateKbps = std::stod( s ) * mul;
        } catch ( ... ) {
        }
    } else if ( key == "progress" ) {
        if ( val == "continue" ) {
            // 计算进度
            double dur = task->durationSec;
            double cur = task->outTimeSec;
            if ( dur > 0 && cur >= 0 ) {
                int p = static_cast<int>( ( cur / dur ) * 100.0 );
                if ( p < 0 )
                    p = 0;
                if ( p > 100 )
                    p = 100;
                task->progress = p;
            }
        } else if ( val == "end" ) {
            task->progress = 100;
        }
    }
}

void FfmpegManager::parseFfmpegOut( FfmpegTask *task, std::string &outPending ) {
    size_t nl;
    while ( ( nl = outPending.find( '\n' ) ) != std::string::npos ) {
        std::string line = outPending.substr( 0, nl );
        outPending.erase( 0, nl + 1 );
        if ( line.empty() )
            continue;
        task->logTail += line;
        task->logTail += '\n';
        if ( task->logTail.size() > 8000 ) {
            task->logTail.erase( 0, task->logTail.size() - 8000 );
        }
        // 尝试解析 progress
        parseFfmpegProgress( task, line );
        // 解析 Duration: （有时不通过 -progress）
        if ( task->durationSec == 0 && line.find( "Duration:" ) != std::string::npos ) {
            static const std::regex re( R"(Duration:\s*(\d+):(\d+):(\d+\.\d+))" );
            std::smatch m;
            if ( std::regex_search( line, m, re ) ) {
                int h = std::stoi( m[1].str() );
                int mi = std::stoi( m[2].str() );
                double sc = std::stod( m[3].str() );
                task->durationSec = h * 3600 + mi * 60 + sc;
            }
        }
        if ( utils::toLower( line ).find( "error" ) != std::string::npos ) {
            task->error = line;
            LOG_ERROR << "ffmpeg error: " << line;
        }
    }
}

void FfmpegManager::startTask( FfmpegTask *task ) {
    std::string ffmpegPath = Config::getFfmpegPath();
    if ( ffmpegPath.empty() ) {
        finishTask( task->id, "failed", -1, "未配置 ffmpeg 路径" );
        return;
    }
    std::error_code ec;
    // URL 输入不校验本地存在
    if ( !isUrlInput( task->inputPath ) && !fs::exists( task->inputPath, ec ) ) {
        finishTask( task->id, "failed", -1, "输入文件不存在: " + task->inputPath );
        return;
    }

    // 自动输出路径
    if ( task->outputPath.empty() ) {
        task->outputPath = deriveOutputPath( task );
    } else {
        // 确保父目录存在
        fs::path outPath( task->outputPath );
        if ( outPath.has_parent_path() ) {
            std::error_code ec2;
            fs::create_directories( outPath.parent_path(), ec2 );
        }
    }

    // 输入大小（仅对本地文件；URL 流式输入大小无法预知）
    if ( !isUrlInput( task->inputPath ) ) {
        std::error_code ec2;
        auto sz = fs::file_size( task->inputPath, ec2 );
        if ( !ec2 )
            task->inputSize = static_cast<int64_t>( sz );
    }

    // 探测时长（仅对本地文件；URL 输入不能同步探测否则会卡住）
    if ( !isUrlInput( task->inputPath ) ) {
        double dur = probeDuration( ffmpegPath, task->inputPath );
        if ( dur > 0 ) {
            task->durationSec = dur;
        }
    }

    // 构造命令行
    std::string displayArgs;
    std::vector<std::string> argv = buildArgs( task, ffmpegPath, displayArgs );
    task->commandLine = displayArgs;
    LOG_DEBUG << "ffmpeg task:" << displayArgs;

    // 启动进程
    task->impl = std::make_unique<FfmpegTask::Impl>();
    task->impl->process = std::make_unique<AsyncProcess>();
    if ( !task->impl->process->start( argv, fs::current_path() ) ) {
        finishTask( task->id, "failed", -1, "启动 ffmpeg 失败" );
        return;
    }

    task->status = static_cast<int>( FfmpegStatus::Running );
    task->startTimeMs = nowMs();

    // 等待线程
    task->impl->waiterThread = std::thread(
        std::bind( &FfmpegManager::waitTask, this, task ) );
}

void FfmpegManager::waitTask( FfmpegTask *task ) {
    // 计算 elapsed
    if ( task->startTimeMs > 0 ) {
        task->elapsedMs = nowMs() - task->startTimeMs;
    }

    // 读取输出
    auto errPipe = task->impl->process->errPipe();
    auto outPipe = task->impl->process->outPipe();
    auto errBuf = std::make_shared<std::vector<char>>( 8192 );
    auto outBuf = std::make_shared<std::vector<char>>( 8192 );
    std::string outPending;
    std::mutex outPendingMtx;
    auto readCallback = [task, &outPending, &outPendingMtx, this]( EventLoop::error_code ec, EventLoop::buffer_ptr buf, std::size_t s ) -> bool {
        if ( ec || s == 0 )
            return false;
        std::lock_guard<std::mutex> lk( outPendingMtx );
        outPending.append( buf->data(), s );
        parseFfmpegOut( task, outPending );
        return true;
    };
    EventLoop::readPipe( errPipe, errBuf, readCallback );
    EventLoop::readPipe( outPipe, outBuf, readCallback );

    // 等待进程退出
    int status = 0;
    if ( task->impl->process->started() ) {
        status = task->impl->process->wait();
    }

    task->endTimeMs = nowMs();
    if ( task->startTimeMs > 0 )
        task->elapsedMs = task->endTimeMs - task->startTimeMs;

    // 给异步读取一点时间收尾
    std::this_thread::sleep_for( std::chrono::milliseconds( 100 ) );
    {
        std::lock_guard<std::mutex> lk( outPendingMtx );
        if ( !outPending.empty() )
            parseFfmpegOut( task, outPending );
    }

    // 输出文件大小
    if ( !task->outputPath.empty() ) {
        std::error_code ec2;
        auto sz = fs::file_size( task->outputPath, ec2 );
        if ( !ec2 )
            task->outputSize = static_cast<int64_t>( sz );
    }

    std::string finalStatus;
    std::string error;
    int exitCode = 0;
    if ( task->impl->cancelled.load() ) {
        finalStatus = "cancelled";
        error = "任务已取消";
        exitCode = -1;
    } else if ( status != 0 ) {
        finalStatus = "failed";
        error = "ffmpeg 返回非零: " + std::to_string( status );
        exitCode = status;
    } else {
        finalStatus = "completed";
        task->progress = 100;
    }

    finishTask( task->id, finalStatus, exitCode, error );
}

void FfmpegManager::finishTask( const std::string &id, const std::string &status, int exitCode, const std::string &error ) {
    FfmpegTask *task = nullptr;
    {
        std::lock_guard<std::mutex> lock( m_mutex );
        auto it = m_tasks.find( id );
        if ( it == m_tasks.end() )
            return;
        task = it->second.get();

        auto rit = std::find( m_running.begin(), m_running.end(), id );
        if ( rit != m_running.end() )
            m_running.erase( rit );
    }
    task->status = static_cast<int>( parseStatus( status ) );
    task->exitCode = exitCode;
    task->error = error;
    if ( status == "completed" )
        task->progress = 100;
    LOG_INFO << "FFmpeg任务 " << id << " " << status << " exit=" << exitCode << " err=" << error;
    // 唤醒 worker，让它根据新的 m_running.size() 决定是否启动下一个任务
    m_cv.notify_all();
}

void FfmpegManager::removeTaskInternal( const std::string &id ) {
    FfmpegTask *task = nullptr;
    {
        std::lock_guard<std::mutex> lock( m_mutex );
        auto it = m_tasks.find( id );
        if ( it == m_tasks.end() )
            return;
        task = it->second.get();
    }
    if ( task->impl ) {
        if ( task->impl->waiterThread.joinable() )
            task->impl->waiterThread.join();
    }
    {
        std::lock_guard<std::mutex> lock( m_mutex );
        m_tasks.erase( id );
    }
    m_cv.notify_all();
}

void FfmpegManager::workerLoop() {
    while ( !m_stop ) {
        std::unique_lock<std::mutex> lock( m_mutex );
        m_cv.wait( lock, [this] {
            return m_stop || ( !m_pending.empty() && static_cast<int>( m_running.size() ) < m_maxParallel.load() );
        } );
        if ( m_stop )
            break;
        if ( m_pending.empty() )
            continue;
        if ( static_cast<int>( m_running.size() ) >= m_maxParallel.load() )
            continue;

        std::string id = m_pending.front();
        m_pending.erase( m_pending.begin() );
        auto it = m_tasks.find( id );
        if ( it == m_tasks.end() )
            continue;
        FfmpegTask *task = it->second.get();
        if ( task->status.load() != static_cast<int>( FfmpegStatus::Pending ) )
            continue;
        m_running.push_back( id );
        lock.unlock();
        startTask( task );
        m_cv.notify_all();
    }
}

Server::json FfmpegManager::createTask( const utils::json &spec ) {
    if ( !spec.is_object() ) {
        return { { "success", false }, { "error", "无效的请求体" } };
    }
    if ( !spec.contains( "inputPath" ) || !spec["inputPath"].is_string() ) {
        return { { "success", false }, { "error", "缺少 inputPath" } };
    }
    std::string inputPath = spec["inputPath"].get<std::string>();
    if ( inputPath.empty() ) {
        return { { "success", false }, { "error", "inputPath 不能为空" } };
    }
    // URL 输入(http/rtmp/rtsp 等)允许直接作为 ffmpeg 输入，本地文件仍校验存在
    std::error_code ec;
    if ( !isUrlInput( inputPath ) && !fs::exists( inputPath, ec ) ) {
        return { { "success", false }, { "error", "输入文件不存在" } };
    }

    std::string outputPath;
    if ( spec.contains( "outputPath" ) && spec["outputPath"].is_string() ) {
        outputPath = spec["outputPath"].get<std::string>();
    }

    utils::json options = utils::json::object();
    if ( spec.contains( "options" ) && spec["options"].is_object() ) {
        options = spec["options"];
    }

    std::string operation = "convert";
    if ( spec.contains( "operation" ) && spec["operation"].is_string() ) {
        operation = spec["operation"].get<std::string>();
    } else {
        // 自动从 options 推导概要（如 "trim+compress"）
        std::vector<std::string> parts;
        if ( options.value( "enableTrim", false ) )
            parts.push_back( "trim" );
        if ( options.value( "enableCompress", false ) )
            parts.push_back( "compress" );
        if ( options.value( "enableConvert", false ) )
            parts.push_back( "convert" );
        if ( !parts.empty() ) {
            std::string s;
            for ( size_t i = 0; i < parts.size(); i++ ) {
                if ( i )
                    s += "+";
                s += parts[i];
            }
            operation = s;
        }
    }

    std::string encoder = "auto";
    if ( spec.contains( "encoder" ) && spec["encoder"].is_string() ) {
        encoder = spec["encoder"].get<std::string>();
    }

    int extraThreads = 0;
    if ( spec.contains( "extraThreads" ) && spec["extraThreads"].is_number_integer() ) {
        extraThreads = spec["extraThreads"].get<int>();
    }

    auto task = std::make_unique<FfmpegTask>();
    task->id = utils::generateId();
    task->inputPath = inputPath;
    task->outputPath = outputPath;
    task->operation = operation;
    task->options = options;
    task->encoder = encoder;
    task->extraThreads = extraThreads;
    task->createdAtMs = nowMs();
    task->status = static_cast<int>( FfmpegStatus::Pending );
    task->progress = 0;

    Server::json j = buildTaskJson( task.get() );
    {
        std::lock_guard<std::mutex> lock( m_mutex );
        std::string id = task->id;
        m_tasks[id] = std::move( task );
        m_pending.push_back( id );
    }
    m_cv.notify_all();
    j["success"] = true;
    return j;
}

bool FfmpegManager::cancelTask( const std::string &id ) {
    FfmpegTask *task = nullptr;
    {
        std::lock_guard<std::mutex> lock( m_mutex );
        auto it = m_tasks.find( id );
        if ( it == m_tasks.end() )
            return false;
        task = it->second.get();
    }
    if ( task->status.load() == static_cast<int>( FfmpegStatus::Pending ) ) {
        // 未开始：从 pending 移除
        {
            std::lock_guard<std::mutex> lock( m_mutex );
            auto pit = std::find( m_pending.begin(), m_pending.end(), id );
            if ( pit != m_pending.end() )
                m_pending.erase( pit );
        }
        task->status = static_cast<int>( FfmpegStatus::Cancelled );
        task->error = "任务已取消";
        task->endTimeMs = nowMs();
        return true;
    }
    if ( task->status.load() == static_cast<int>( FfmpegStatus::Running ) && task->impl && task->impl->process ) {
        task->impl->cancelled = true;
        try {
            task->impl->process->terminate();
        } catch ( ... ) {
        }
        return true;
    }
    return false;
}

bool FfmpegManager::removeTask( const std::string &id ) {
    // 若还在运行则先取消
    FfmpegTask *task = nullptr;
    {
        std::lock_guard<std::mutex> lock( m_mutex );
        auto it = m_tasks.find( id );
        if ( it == m_tasks.end() )
            return false;
        task = it->second.get();
    }
    if ( task->status.load() == static_cast<int>( FfmpegStatus::Pending ) || task->status.load() == static_cast<int>( FfmpegStatus::Running ) ) {
        cancelTask( id );
    }
    removeTaskInternal( id );
    return true;
}

Server::json FfmpegManager::getTask( const std::string &id ) {
    std::lock_guard<std::mutex> lock( m_mutex );
    auto it = m_tasks.find( id );
    if ( it == m_tasks.end() )
        return { { "success", false }, { "error", "任务不存在" } };
    Server::json j = buildTaskJson( it->second.get() );
    j["success"] = true;
    return j;
}

Server::json FfmpegManager::listTasks() {
    std::lock_guard<std::mutex> lock( m_mutex );
    Server::json arr = Server::json::array();
    for ( const auto &[id, task] : m_tasks ) {
        arr.push_back( buildTaskJson( task.get() ) );
    }
    return { { "success", true }, { "tasks", arr }, { "maxParallel", m_maxParallel.load() } };
}

// ===== HTTP 路由 =====

static void ffGetInfo( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto j = FfmpegManager::instance().info();
    j["success"] = true;
    Server::sendJson( res, j );
}

static void ffListTasks( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto j = FfmpegManager::instance().listTasks();
    Server::sendJson( res, j );
}

static void ffCreateTask( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    if ( body.is_null() || !body.is_object() )
        return Server::sendError( res, "无效的请求体", 400 );
    auto j = FfmpegManager::instance().createTask( body );
    Server::sendJson( res, j );
}

static void ffGetTask( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1].str();
    auto j = FfmpegManager::instance().getTask( id );
    Server::sendJson( res, j );
}

static void ffCancelTask( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1].str();
    bool ok = FfmpegManager::instance().cancelTask( id );
    Server::sendJson( res, { { "success", ok } } );
}

static void ffRemoveTask( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1].str();
    bool ok = FfmpegManager::instance().removeTask( id );
    Server::sendJson( res, { { "success", ok } } );
}

static void ffSetMaxParallel( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    int n = 1;
    if ( body.is_object() && body.contains( "maxParallel" ) && body["maxParallel"].is_number_integer() ) {
        n = body["maxParallel"].get<int>();
    }
    FfmpegManager::instance().setMaxParallel( n );
    Server::sendJson( res, { { "success", true }, { "maxParallel", n } } );
}

void registerFfmpegRoutes( httplib::Server &svr ) {
    svr.Get( "/api/ffmpeg/info", ffGetInfo );
    svr.Get( "/api/ffmpeg/tasks", ffListTasks );
    svr.Post( "/api/ffmpeg/tasks", ffCreateTask );
    svr.Get( R"(/api/ffmpeg/tasks/([^/]+))", ffGetTask );
    svr.Post( R"(/api/ffmpeg/tasks/([^/]+)/cancel)", ffCancelTask );
    svr.Delete( R"(/api/ffmpeg/tasks/([^/]+))", ffRemoveTask );
    svr.Post( "/api/ffmpeg/parallel", ffSetMaxParallel );
    LOG_DEBUG << "已注册 7 个 FFmpeg 工具路由";
}

} // namespace routes::ffmpeg
