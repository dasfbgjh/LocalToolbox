#include "Config.h"
#include "Logger.hpp"
#include "common/Utils.h"
#include "core/Database.h"

#ifdef _WIN32
#include <windows.h>
#define REG_PATH_AUTOBOOT "Software\\Microsoft\\Windows\\CurrentVersion\\Run"
#define REG_PATH_CONTEXT_MENU_FILE "Software\\Classes\\*\\shell\\Toolbox"
#define REG_PATH_CONTEXT_MENU_DIR "Software\\Classes\\Directory\\shell\\Toolbox"
#define REG_KEY_NAME "LocalToolbox"
#define REG_MENU_TEXT "本地工具箱"
#endif

// 不可配置项
std::filesystem::path Config::appPath = "";                                  // 应用路径
std::string Config::databasePath = "";                                       // 数据库路径
bool Config::enableContextmenu = false;                                      // 是否启用右键菜单
bool Config::enableAutoBoot = false;                                         // 是否自动启动
std::pair<std::string, std::vector<std::string>> Config::pathParameter = {}; // 路径参数

// 可配置项
bool Config::onlyLocalhost = false;                   // 是否仅127.0.0.1地址可访问
std::string Config::tempPath = "";                    // 临时目录
std::string Config::uploadFilePath = "";              // 上传文件目录
size_t Config::maxUploadFileSize = 500 * 1024 * 1024; // 最大上传文件大小（字节）
size_t Config::maxPdfSize = 100 * 1024 * 1024;        // 最大PDF文件大小（字节）
int Config::inviteCodeDurationSEC = 5;                // 邀请码有效期（秒）
int Config::httpServerPort = 3100;                    // http监听端口
int Config::httpsServerPort = 3101;                   // https监听端口
bool Config::enableHttps = false;                     // 是否启用HTTPS
std::string Config::sslCertPath = "";                 // SSL证书路径
std::string Config::sslKeyPath = "";                  // SSL私钥路径
std::vector<std::string> Config::bootParameter = {};  // 启动参数
int Config::logLevel = 0;                             // 日志等级 0=DEBUG 1=INFO 2=WARN 3=ERR
int Config::logFileMode = 0;                          // 日志文件模式 0=off 1=single 2=multi
std::string Config::logFilePath = "log.txt";          // 日志文件路径（single=文件路径；multi=目录路径）
std::string Config::pdfToolPath = "pdf_tool";         // PDF工具路径
std::string Config::ffmpegPath = "ffmpeg";            // FFmpeg路径
std::string Config::adbPath = "adb";                  // ADB路径

int Config::parseConfig( int argc, char *argv[] ) {
    CLI::App app{ "工具箱" };
    app.add_option( "--port", httpServerPort, "http监听端口" );
    app.add_option( "--https-port", httpsServerPort, "https监听端口" );
    app.add_flag( "--https", enableHttps, "启用HTTPS服务" );
    app.add_option( "--ssl-cert", sslCertPath, "SSL证书文件路径" );
    app.add_option( "--ssl-key", sslKeyPath, "SSL私钥文件路径" );
    app.add_option( "--temp", tempPath, "临时目录" );
    app.add_option( "--invite-code-duration-sec", inviteCodeDurationSEC, "邀请码有效期（秒）" );
    app.add_option( "--log-level", logLevel, "日志等级(0=DEBUG,1=INFO,2=WARN,3=ERR)" );
    app.add_option( "--log-file-mode", logFileMode, "日志文件模式(0=关闭,1=单文件,2=按日期切分)" );
    app.add_option( "--log-file", logFilePath, "日志文件路径(单文件=文件路径,切分=目录路径)" );

    app.add_option( "path", bootParameter, "启动参数" );
    app.positionals_at_end( true );
    CLI11_PARSE( app, argc, app.ensure_utf8( argv ) );

    if ( uploadFilePath.empty() )
        uploadFilePath = utils::fs::toNative( getAppPath() + "/uploads" );
    if ( tempPath.empty() ) {
        tempPath = utils::fs::toNative( getAppPath() + "/temp" );
    }

    // 创建临时目录
    std::error_code ecTemp;
    std::filesystem::create_directories( tempPath, ecTemp );
    if ( ecTemp )
        LOG_WARN << "创建临时目录失败: " << ecTemp.message();
    else
        LOG_DEBUG << "临时目录已就绪: " << tempPath;

    // 从系统查询右键菜单配置
    bool ctx = getEnableContextmenu( true );
    LOG_INFO << "右键菜单状态: " << ( ctx ? "已启用" : "未启用" );

    // 从系统查询自动启动配置
    bool autob = getEnableAutoBoot( true );
    LOG_INFO << "开机自启状态: " << ( autob ? "已启用" : "未启用" );

    // 创建上传目录
    std::error_code ec;
    std::filesystem::create_directories( uploadFilePath, ec );
    if ( ec )
        LOG_ERROR << "创建上传目录失败: " << ec.message();
    else
        LOG_DEBUG << "上传目录已就绪: " << uploadFilePath;

    if ( enableHttps )
        LOG_DEBUG << "SSL证书: " << sslCertPath << " / 私钥: " << sslKeyPath;

    LOG_DEBUG << "上传文件目录:" << uploadFilePath;
    LOG_DEBUG << "最大上传文件大小: " << maxUploadFileSize << " 字节";
    LOG_DEBUG << "最大PDF大小: " << maxPdfSize << " 字节";
    LOG_DEBUG << "邀请码有效期: " << inviteCodeDurationSEC << " 秒";
    LOG_DEBUG << "日志等级: " << logLevel << " 日志文件模式: " << logFileMode << " 日志路径: " << logFilePath;
    LOG_DEBUG << "启动参数:" << bootParameter;
    return 0;
}

void Config::init( int argc, char *argv[] ) {
    // 初始化路径
    appPath = std::filesystem::absolute( argv[0] );
    LOG_DEBUG << "应用完整路径: " << getAppFullPath();

    // 初始化数据库路径
    databasePath = utils::fs::toNative( getAppPath() + "/database.db" );
    LOG_DEBUG << "数据库路径: " << databasePath;

    try {
        // 从数据库加载配置
        auto config = Database::getAppConfig( databasePath );
        configJson( config, 1 );
    } catch ( const std::exception &e ) {
        LOG_ERROR << "从数据库加载配置失败: " << e.what();
    }

    // 解析命令行参数,覆盖数据库配置项
    parseConfig( argc, argv );

    // App::init中保存配置
}

#define TransformConfig( _name, _type, _label, _description, _onlyRead, _item ) \
    {                                                                           \
        if ( flag == 0 ) {                                                      \
            Type test = _type;                                                  \
            auto item = _item;                                                  \
            item["name"] = #_name;                                              \
            item["value"] = _name;                                              \
            item["label"] = _label;                                             \
            item["type"] = #_type;                                              \
            item["onlyRead"] = _onlyRead;                                       \
            item["description"] = _description;                                 \
            config.emplace_back( item );                                        \
        } else if ( flag == 1 && !_onlyRead ) {                                 \
            for ( auto it : config ) {                                          \
                try {                                                           \
                    if ( it["name"].get<std::string>() != #_name )              \
                        continue;                                               \
                    _name = it["value"];                                        \
                    break;                                                      \
                } catch ( const std::exception &e ) {                           \
                    LOG_WARN << "配置[" << #_name << "]:" << e.what();          \
                }                                                               \
            }                                                                   \
        }                                                                       \
    }
// flag 0: 配置转json, 1: 从json加载配置项
void Config::configJson( json::array_t &config, char flag ) {
    enum Type {
        number,
        string,
        boolean,
        file,
        directory,
        object,
        array,
        dataSize,
    };
    if ( flag == 0 )
        config.clear();

    std::string appPath = Config::appPath.string();
    TransformConfig( appPath, string, "应用程序位置", "", true, json() );

    json bootParameter( Config::bootParameter );
    TransformConfig( bootParameter, array, "启动参数列表", "", true, json() );

    TransformConfig( onlyLocalhost, boolean, "是否仅在本地运行", "仅在127.0.0.1地址可访问", false, json() );
    TransformConfig( databasePath, file, "数据库文件", "", true, json() );
    TransformConfig( enableContextmenu, boolean, "是否启用右键菜单", "", true, json() );
    TransformConfig( enableAutoBoot, boolean, "是否自动启动", "", true, json() );
    TransformConfig( httpServerPort, number, "http服务端口", "", false, json() );
    TransformConfig( httpsServerPort, number, "https服务端口", "https启用时使用的端口", false, json() );
    TransformConfig( enableHttps, boolean, "启用https", "", false, json() );
    TransformConfig( sslCertPath, file, "ssl证书路径", "https启用时使用的证书文件", false, json() );
    TransformConfig( sslKeyPath, file, "ssl密钥路径", "https启用时使用的密钥文件", false, json() );
    TransformConfig( tempPath, directory, "临时目录", "应用临时文件存储目录", false, json() );
    TransformConfig( uploadFilePath, directory, "上传文件路径", "剪切板上传文件存储路径", false, json() );
    TransformConfig( logFilePath, file, "日志文件路径", "单文件时为日志文件路径，多个文件时为日志文件存储路径", false, json() );
    TransformConfig( pdfToolPath, file, "pdf工具路径", "pdf处理工具调用的处理程序", false, json() );
    TransformConfig( ffmpegPath, file, "ffmpeg路径", "ffmpeg调用的处理程序", false, json() );
    TransformConfig( adbPath, file, "adb路径", "Android Debug Bridge 可执行文件路径", false, json() );
    TransformConfig( inviteCodeDurationSEC, number, "邀请码过期时间", "剪切板团队邀请码最大刷新间隔", false,
                     json( {
                         { "unit", "秒" },
                     } ) );

    TransformConfig( maxUploadFileSize, dataSize, "最大上传文件大小", "剪切板最大上传文件大小", false,
                     json( {
                         { "unit", "MB" },
                         { "transform", "bytesToMB" },
                     } ) );
    TransformConfig( maxPdfSize, dataSize, "最大pdf文件大小", "工具处理pdf文件的最大大小", false,
                     json( {
                         { "unit", "MB" },
                         { "transform", "bytesToMB" },
                     } ) );

    json logLevelOpts = json::array();
    logLevelOpts.push_back( { { "value", 0 }, { "label", "0 - DEBUG" } } );
    logLevelOpts.push_back( { { "value", 1 }, { "label", "1 - LOG" } } );
    logLevelOpts.push_back( { { "value", 2 }, { "label", "2 - INFO" } } );
    logLevelOpts.push_back( { { "value", 3 }, { "label", "3 - WARN" } } );
    logLevelOpts.push_back( { { "value", 4 }, { "label", "4 - ERROR" } } );

    json logFileModeOpts = json::array();
    logFileModeOpts.push_back( { { "value", 0 }, { "label", "0 - 关闭（不输出到文件）" } } );
    logFileModeOpts.push_back( { { "value", 1 }, { "label", "1 - 单文件追加" } } );
    logFileModeOpts.push_back( { { "value", 2 }, { "label", "2 - 按日期切分" } } );
    TransformConfig( logLevel, number, "日志级别", "日志级别", false,
                     json( {
                         { "options", logLevelOpts },
                     } ) );
    TransformConfig( logFileMode, number, "日志文件模式", "日志文件模式 0=禁用文件输出 1=输出到单个文件 2=输出到多个文件", false,
                     json( {
                         { "options", logFileModeOpts },
                     } ) );
}
#undef TransformConfig

const std::string Config::getAppPath() {
    return appPath.parent_path().string();
}

const std::string Config::getAppBaseName() {
    return appPath.filename().string();
}

const std::string Config::getAppFullPath() {
    return appPath.string();
}

const std::string &Config::getDatabasePath() {
    return databasePath;
}

const std::string &Config::getTempPath() {
    return tempPath;
}

const std::string &Config::getUploadFilePath() {
    return uploadFilePath;
}

bool Config::getOnlyLocalhost() {
    return onlyLocalhost;
}

size_t Config::getMaxUploadFileSize() {
    return maxUploadFileSize;
}

size_t Config::getMaxPdfSize() {
    return maxPdfSize;
}

int Config::getInviteCodeDurationSEC() {
    return inviteCodeDurationSEC;
}

int Config::getHttpServerPort() {
    return httpServerPort;
}

int Config::getHttpsServerPort() {
    return httpsServerPort;
}

bool Config::getEnableHttps() {
    return enableHttps;
}

const std::string &Config::getSslCertPath() {
    return sslCertPath;
}

const std::string &Config::getSslKeyPath() {
    return sslKeyPath;
}

const std::vector<std::string> &Config::getBootParameter() {
    return bootParameter;
}

std::string Config::setPathParameter( const std::vector<std::string> &args ) {
    std::vector<std::string> paths;
    for ( auto &arg : args ) {
        if ( arg.empty() )
            continue;
        bool allDigit = true;
        for ( char c : arg ) {
            if ( !std::isdigit( static_cast<unsigned char>( c ) ) ) {
                allDigit = false;
                break;
            }
        }
        if ( allDigit )
            continue;
        if ( !std::filesystem::exists( arg ) )
            continue;
        std::error_code ec;
        auto abs = std::filesystem::absolute( arg, ec );
        paths.push_back( abs.string() );
    }
    if ( paths.empty() ) {
        pathParameter = {};
        return "";
    }
    std::string id = utils::generateId();
    pathParameter.first = id;
    pathParameter.second = paths;
    return id;
}

std::vector<std::string> Config::getPathParameter( const std::string &id ) {
    if ( pathParameter.first != id )
        return {};
    auto args = pathParameter.second;
    pathParameter = {};
    return args;
}

bool Config::getEnableContextmenu( bool reread ) {
    if ( !reread )
        return enableContextmenu;
#ifdef _WIN32
    HKEY hKey;
    LSTATUS status = RegOpenKeyExA( HKEY_CURRENT_USER, REG_PATH_CONTEXT_MENU_FILE, 0, KEY_READ, &hKey );
    if ( status == ERROR_SUCCESS ) {
        RegCloseKey( hKey );
        enableContextmenu = true;
    } else {
        enableContextmenu = false;
    }
#endif
    return enableContextmenu;
}

bool Config::setEnableContextmenu( bool enable ) {
#ifdef _WIN32
    std::string appFullPath = getAppFullPath();

    auto setContextMenu = [&]( const char *regPath ) -> bool {
        HKEY hKey;
        LSTATUS status = RegCreateKeyExA( HKEY_CURRENT_USER, regPath, 0, NULL,
                                          REG_OPTION_NON_VOLATILE, KEY_WRITE, NULL, &hKey, NULL );
        if ( status != ERROR_SUCCESS )
            return false;
        std::string menuText = utils::utf8ToLocal( REG_MENU_TEXT );
        status = RegSetValueExA( hKey, NULL, 0, REG_SZ,
                                 reinterpret_cast<const BYTE *>( menuText.c_str() ),
                                 menuText.length() + 1 );
        if ( status != ERROR_SUCCESS ) {
            RegCloseKey( hKey );
            return false;
        }

        status = RegSetValueExA( hKey, "Icon", 0, REG_SZ,
                                 reinterpret_cast<const BYTE *>( appFullPath.c_str() ),
                                 appFullPath.length() + 1 );
        if ( status != ERROR_SUCCESS ) {
            RegCloseKey( hKey );
            return false;
        }

        HKEY hCommandKey;
        status = RegCreateKeyExA( hKey, "command", 0, NULL, REG_OPTION_NON_VOLATILE,
                                  KEY_WRITE, NULL, &hCommandKey, NULL );
        if ( status != ERROR_SUCCESS ) {
            RegCloseKey( hKey );
            return false;
        }

        std::string command = "\"" + appFullPath + "\" \"%1\"";
        status = RegSetValueExA( hCommandKey, NULL, 0, REG_SZ,
                                 reinterpret_cast<const BYTE *>( command.c_str() ),
                                 command.length() + 1 );
        RegCloseKey( hCommandKey );
        RegCloseKey( hKey );
        return status == ERROR_SUCCESS;
    };

    auto removeContextMenu = [&]( const char *regPath ) -> bool {
        LSTATUS status = RegDeleteTreeA( HKEY_CURRENT_USER, regPath );
        return status == ERROR_SUCCESS || status == ERROR_FILE_NOT_FOUND;
    };

    if ( enable ) {
        bool fileSuccess = setContextMenu( REG_PATH_CONTEXT_MENU_FILE );
        bool dirSuccess = setContextMenu( REG_PATH_CONTEXT_MENU_DIR );

        if ( fileSuccess || dirSuccess ) {
            enableContextmenu = true;
            LOG_INFO << "右键菜单已添加";
            return true;
        } else {
            LOG_ERROR << "添加右键菜单失败";
            return false;
        }
    } else {
        bool fileSuccess = removeContextMenu( REG_PATH_CONTEXT_MENU_FILE );
        bool dirSuccess = removeContextMenu( REG_PATH_CONTEXT_MENU_DIR );
        if ( fileSuccess || dirSuccess ) {
            enableContextmenu = false;
            LOG_INFO << "右键菜单已移除";
            return true;
        } else {
            LOG_ERROR << "删除右键菜单失败";
            return false;
        }
    }
#endif
}

bool Config::getEnableAutoBoot( bool reread ) {
    if ( !reread )
        return enableAutoBoot;
#ifdef _WIN32
    HKEY hKey;
    LSTATUS status = RegOpenKeyExA( HKEY_CURRENT_USER, REG_PATH_AUTOBOOT,
                                    0, KEY_READ, &hKey );
    if ( status == ERROR_SUCCESS ) {
        char value[1024];
        DWORD valueSize = sizeof( value );
        status = RegQueryValueExA( hKey, REG_KEY_NAME, NULL, NULL, reinterpret_cast<LPBYTE>( value ), &valueSize );
        RegCloseKey( hKey );
        enableAutoBoot = ( status == ERROR_SUCCESS );
    } else {
        enableAutoBoot = false;
    }
#endif
    return enableAutoBoot;
}

bool Config::setEnableAutoBoot( bool enable ) {
#ifdef _WIN32
    HKEY hKey;
    LSTATUS status = RegOpenKeyExA( HKEY_CURRENT_USER, REG_PATH_AUTOBOOT,
                                    0, KEY_WRITE, &hKey );
    if ( status != ERROR_SUCCESS ) {
        LOG_ERROR << "打开自启动注册表失败";
        return false;
    }

    if ( enable ) {
        std::string appFullPath = getAppFullPath();
        status = RegSetValueExA( hKey, REG_KEY_NAME, 0, REG_SZ,
                                 reinterpret_cast<const BYTE *>( appFullPath.c_str() ),
                                 appFullPath.length() + 1 );
        RegCloseKey( hKey );
        if ( status == ERROR_SUCCESS ) {
            enableAutoBoot = true;
            LOG_INFO << "自启动已开启";
            return true;
        } else {
            LOG_ERROR << "设置自启动失败";
            return false;
        }
    } else {
        status = RegDeleteValueA( hKey, REG_KEY_NAME );
        RegCloseKey( hKey );
        if ( status == ERROR_SUCCESS || status == ERROR_FILE_NOT_FOUND ) {
            enableAutoBoot = false;
            LOG_INFO << "自启动已关闭";
            return true;
        } else {
            LOG_ERROR << "删除自启动失败";
            return false;
        }
    }
#endif
}

template <typename T>
T get( const std::string &name ) {
}

template <typename T>
void set( const std::string &name, T value ) {
}

int Config::getLogLevel() {
    return logLevel;
}

int Config::getLogFileMode() {
    return logFileMode;
}

const std::string &Config::getLogFilePath() {
    return logFilePath;
}

const std::string &Config::getPdfToolPath() {
    return pdfToolPath;
}
const std::string &Config::getFfmpegPath() {
    return ffmpegPath;
}
const std::string &Config::getAdbPath() {
    return adbPath;
}