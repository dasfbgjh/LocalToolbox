#include "App.h"
#include "AppInfo.h"
#include "resource.h"
#include "common/Logger.hpp"
#include "common/Config.h"
#include "common/EventLoop.h"
#include "core/HttpServerManager.h"
#include "core/ProcManager.h"
#include "routes/FfmpegTool.h"
#include "routes/OcrTools.h"
#include "routes/BatchOcrTool.h"

App *App::g_instance = nullptr;

#ifdef _WIN32
const char *App::g_localServerName = "\\\\.\\pipe\\localtoolbox-ipc";
HANDLE App::g_mutex = nullptr;
#endif

App::App() {
    if ( g_instance )
        throw std::runtime_error( "App instance already exists" );
    g_instance = this;
    m_running = false;
    m_exitCode = 0;
    m_reboot = false;

    m_db = nullptr;

    m_systemTray = std::make_unique<SystemTray>( std::bind( &App::trayMenuCallback, this, std::placeholders::_1, std::placeholders::_2 ) );
}

App::~App() {
    if ( g_mutex != NULL ) {
        CloseHandle( g_mutex );
        g_mutex = nullptr;
    }
    g_instance = nullptr;
}

bool App::init() {
    if ( m_running ) {
        LOG_ERROR << "应用已运行,不能重复初始化";
        return false;
    }
    LOG_DEBUG << "开始应用初始化流程...";

    // 创建数据库
    LOG_INFO << "正在初始化数据库，路径: " << Config::getDatabasePath();
    try {
        m_db = std::make_shared<Database>( Config::getDatabasePath() );
        LOG_INFO << "数据库初始化成功";
    } catch ( const std::exception &e ) {
        LOG_ERROR << "数据库初始化失败: " << e.what();
        return false;
    }

    // 保存配置
    try {
        json::array_t items;
        Config::configJson( items );
        m_db->saveAppConfig( items );
        LOG_INFO << "③ 已将合并后的配置保存回 app_config (id=1)";
    } catch ( const std::exception &e ) {
        LOG_ERROR << "③ 保存配置到数据库失败: " << e.what();
    }
    LOG_INFO << "---------- 配置合并完成 ----------";

    // 配置日志
    configLogger();

    // 配置系统托盘
    loadTrayMenu();
    LOG_DEBUG << "系统托盘菜单已构建";

    LOG_INFO << "右键菜单: " << ( Config::getEnableContextmenu() ? "已启用" : "未启用" );
    LOG_INFO << "开机自启: " << ( Config::getEnableAutoBoot() ? "已启用" : "未启用" );
    return true;
}

int App::exec() {
    m_running = true;

    auto [serverTh1, serverTh2] = m_server.listen();

    // 自动启动标记了 auto_start 的服务器
    HttpServerManager::instance().startAutoStart();
    ProcManager::instance().startAutoStart();

    LOG_INFO << "所有服务线程已启动，进入系统托盘事件循环";
#if 01
    auto t1 = EventLoop::instance().runTimer(
        std::chrono::milliseconds( 30 ),
        [&]( const EventLoop::error_code & ) -> bool {
            if ( m_systemTray->poll() == TRAY_EXIT_CODE ) {
                EventLoop::instance().stop();
                return false;
            }
            handleEventHandlers();
            return true;
        } );

    auto t2 = EventLoop::instance().runTimer(
        std::chrono::milliseconds( 500 ),
        [&]( const EventLoop::error_code & ) -> bool {
            App::listenLocalServer( 10 );
            return true;
        } );

    LOG_INFO << "共处理事件:" << EventLoop::instance().run();
#else
    LOG_DEBUG << "启动本地IPC监听线程";
    while ( true ) {
        if ( m_systemTray->poll() == TRAY_EXIT_CODE )
            break;
        App::listenLocalServer( 30 );
        handleEventHandlers();
    }
    LOG_DEBUG << "本地IPC线程已退出";
    LOG_INFO << "系统托盘已退出，正在停止所有服务线程...";
#endif

    HttpServerManager::instance().shutdownAll();
    ProcManager::instance().shutdownAll();
    routes::ffmpeg::FfmpegManager::instance().shutdownAll();
    routes::ocrTools::shutdown();
    routes::batchOcrTool::shutdown();
    webview.stop();
    m_server.stop();
    if ( serverTh1.joinable() )
        serverTh1.join();
    if ( serverTh2.joinable() )
        serverTh2.join();

    m_running = false;
    LOG_INFO << "所有服务线程已停止";
    return m_exitCode;
}

void App::exit( int exitCode ) {
    LOG_INFO << "接收到退出指令，退出码: " << exitCode;
    m_exitCode = exitCode;
    m_systemTray->exit();
}

void App::reboot() {
    m_reboot = true;
    exit( 0 );
}

bool App::isReboot() {
    return m_reboot;
}

bool App::isRunning() {
    return m_running;
}

void App::postEvent( std::function<void( App * )> handler ) {
    std::lock_guard<std::mutex> lock( m_eventMutex );
    m_eventHandlers.push_back( handler );
}

void App::configLogger() {
    auto &logger = Logger::getInstance();
    int lv = Config::getLogLevel();
    if ( lv >= 0 && lv <= 3 ) {
        logger.setLevel( static_cast<Logger::Level>( lv ) );
        LOG_INFO << "日志等级已应用: " << lv;
    }
    int mode = Config::getLogFileMode();
    const std::string &logFile = Config::getLogFilePath();
    Logger::FileMode fm = Logger::FileMode::FILE_OFF;
    const char *modeName = "OFF";
    switch ( mode ) {
    case 1:
        fm = Logger::FileMode::SINGLE_FILE;
        modeName = "SINGLE_FILE";
        break;
    case 2:
        fm = Logger::FileMode::MULTI_FILE;
        modeName = "MULTI_FILE";
        break;
    default:
        fm = Logger::FileMode::FILE_OFF;
        modeName = "OFF";
        break;
    }
    logger.setOutputToFile( fm, logFile.empty() ? "./logs" : logFile );
    LOG_INFO << "日志文件模式已应用: " << modeName << " 路径: " << ( logFile.empty() ? "./logs" : logFile );
}

void App::handleEventHandlers() {
    std::lock_guard<std::mutex> lock( m_eventMutex );
    clock_t startPTS = clock();
    while ( !m_eventHandlers.empty() && clock() - startPTS < 1000 ) {
        auto handler = m_eventHandlers.front();
        m_eventHandlers.pop_front();
        handler( this );
    }
}

void App::trayMenuCallback( struct tray_menu *item, int id ) {
    LOG_INFO << "系统托盘菜单被点击,菜单ID:" << id;
    switch ( id ) {
    case Exit:
        LOG_INFO << "用户选择退出程序";
        exit( 0 );
        break;
    case Reboot:
        reboot();
        break;
    case EnableContextMenu: {
        bool current = Config::getEnableContextmenu();
        bool target = !current;
        LOG_DEBUG << "切换右键菜单状态:" << ( current ? "启用" : "未启用" ) << " -> " << ( target ? "启用" : "未启用" );
        if ( Config::setEnableContextmenu( target ) ) {
            item->checked = target;
            m_systemTray->update();
            LOG_DEBUG << "右键菜单状态切换成功";
        } else {
            LOG_ERROR << "右键菜单状态切换失败";
        }
        break;
    }
    case AutoBoot: {
        bool current = Config::getEnableAutoBoot();
        bool target = !current;
        LOG_DEBUG << "切换开机自启状态:" << ( current ? "启用" : "未启用" ) << " -> " << ( target ? "启用" : "未启用" );
        if ( Config::setEnableAutoBoot( target ) ) {
            item->checked = target;
            m_systemTray->update();
            LOG_DEBUG << "开机自启状态切换成功";
        } else {
            LOG_ERROR << "开机自启状态切换失败";
        }
        break;
    }
    case Settings:
        LOG_DEBUG << "展开子菜单 (仅UI操作)";
        break;
    case OpenAbout:
        utils::openBrowser( APP_WEB_URL );
        break;
    case OpenBrowser:
        LOG_DEBUG << "浏览器打开";
        utils::openHome();
        break;
    case OpenWebview:
        LOG_DEBUG << "webview打开";
        if ( webview.start() ) {
            webview.navigate( "http://127.0.0.1:" + std::to_string( Config::getHttpServerPort() ) + "/webview" );
            webview.showMaximized();
        }
        break;
    case MakeDesktopShortcut:
        LOG_DEBUG << "创建桌面快捷方式";
        utils::makeDesktopShortcut( Config::getAppFullPath(), APP_NAME );
        break;
    default:
        LOG_WARN << "未处理的菜单ID:" << id;
        break;
    }
}

void App::loadTrayMenu() {
    const unsigned char *iconData = nullptr;
    int iconSize = resource_get( "/image/tray.ico", &iconData );
    if ( iconSize > 0 && iconData ) {
        LOG_DEBUG << "加载系统托盘图标成功,大小: " << iconSize << " 字节";
        m_systemTray->setIconData( iconData, iconSize );
    } else {
        LOG_ERROR << "加载系统托盘图标失败，资源不存在";
    }

    auto settings = {
        m_systemTray->createMenu( "启用右键菜单", EnableContextMenu, false, Config::getEnableContextmenu() ),
        m_systemTray->createMenu( "开机自启", AutoBoot, false, Config::getEnableAutoBoot() ),
        m_systemTray->createMenu( "创建桌面快捷方式", MakeDesktopShortcut ),
    };

    auto root = {
        m_systemTray->createMenu( "浏览器打开", OpenBrowser ),
        m_systemTray->createMenu( "webview打开", OpenWebview ),
        m_systemTray->createMenu( "设置", Settings, settings ),
        m_systemTray->createSeparator(),
        m_systemTray->createMenu( "关于", OpenAbout ),
        m_systemTray->createMenu( "重启", Reboot ),
        m_systemTray->createMenu( "退出", Exit ),
    };
    m_systemTray->update( root );
}

Database &App::getDatabase() {
    return *m_db;
}

App *App::getInstance() {
    return App::g_instance;
}

void App::listenLocalServer( int timeout ) {
    HANDLE pipe = CreateNamedPipeA(
        g_localServerName,
        PIPE_ACCESS_INBOUND | FILE_FLAG_OVERLAPPED,
        PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
        1,
        0,
        8192,
        0,
        NULL );

    if ( pipe == INVALID_HANDLE_VALUE ) {
        Sleep( 30 );
        return;
    }

    OVERLAPPED overlapped = { 0 };
    overlapped.hEvent = CreateEventA( NULL, TRUE, FALSE, NULL );
    if ( !overlapped.hEvent ) {
        CloseHandle( pipe );
        return;
    }

    BOOL pending = ConnectNamedPipe( pipe, &overlapped );
    DWORD lastError = GetLastError();
    if ( !pending && lastError != ERROR_IO_PENDING ) {
        if ( lastError == ERROR_PIPE_CONNECTED ) {
            pending = FALSE;
        } else {
            CloseHandle( overlapped.hEvent );
            CloseHandle( pipe );
            Sleep( 30 );
            return;
        }
    }

    DWORD waitResult = WaitForSingleObject( overlapped.hEvent, timeout );
    if ( waitResult == WAIT_OBJECT_0 ) {
        char buf[8192];
        DWORD bytesRead = 0;
        if ( ReadFile( pipe, buf, sizeof( buf ) - 1, &bytesRead, NULL ) && bytesRead > 0 ) {
            buf[bytesRead] = '\0';
            LOG_DEBUG << "本地IPC收到消息,长度: " << bytesRead << " 字节";
            try {
                auto msg = nlohmann::json::parse( std::string( buf, bytesRead ) );
                handleLocalMessage( msg );
            } catch ( const std::exception &e ) {
                LOG_ERROR << "本地消息解析失败: " << e.what();
            }
        }
    }

    CancelIo( pipe );
    CloseHandle( overlapped.hEvent );
    CloseHandle( pipe );
}

bool App::sendLocalMessage( const json &msg ) {
    LOG_DEBUG << "发送本地IPC消息,类型: " << msg.value( "type", "unknown" );
    for ( int retry = 0; retry < 3; retry++ ) {
        HANDLE pipe = CreateFileA(
            g_localServerName, GENERIC_WRITE, 0, NULL,
            OPEN_EXISTING, 0, NULL );
        if ( pipe != INVALID_HANDLE_VALUE ) {
            DWORD written = 0;
            std::string jsonStr = msg.dump();
            BOOL ok = WriteFile( pipe, jsonStr.c_str(), (DWORD)jsonStr.size(), &written, NULL );
            CloseHandle( pipe );
            bool success = ok && written == (DWORD)jsonStr.size();
            if ( success )
                LOG_DEBUG << "本地IPC消息发送成功";
            else
                LOG_WARN << "本地IPC消息发送失败,重试: " << ( retry + 1 );
            return success;
        }
        Sleep( 100 );
    }
    LOG_ERROR << "本地IPC消息发送失败，已达最大重试次数";
    return false;
}

bool App::isBoot() {
    LOG_DEBUG << "检查单例互斥锁...";
    // 创建全局互斥锁，确保只有一个实例运行
    g_mutex = CreateMutexA( NULL, TRUE, "Global\\LocalToolboxInstanceMutex" );
    if ( g_mutex == NULL || GetLastError() == ERROR_ALREADY_EXISTS ) {
        LOG_WARN << "检测到已有实例正在运行，向已有实例发送启动参数";
        // 另一个实例已经在运行，发送消息给已有实例
        json msg = json::object( {
            { "type", "boot" },
            { "args", Config::getBootParameter() },
        } );
        bool sent = sendLocalMessage( msg );
        if ( !sent )
            LOG_ERROR << "向已有实例发送启动消息失败";

        if ( g_mutex != NULL ) {
            CloseHandle( g_mutex );
            g_mutex = nullptr;
        }
        LOG_INFO << "实例已经运行";
        return false;
    }
    LOG_DEBUG << "获得单例互斥锁，本实例为主进程";

    handleBoot( Config::getBootParameter() );
    return true;
}

void App::handleLocalMessage( const json &msg ) {
    const auto type = msg.value( "type", "unknown" );
    LOG_INFO << "处理本地IPC消息,类型: " << type;
    if ( type == "boot" ) {
        try {
            auto args = msg["args"].get<std::vector<std::string>>();
            handleBoot( args );
        } catch ( const std::exception &e ) {
            LOG_ERROR << "解析boot消息参数失败: " << e.what();
        }
    } else {
        LOG_WARN << "未知的IPC消息类型: " << type;
    }
}

void App::handleBoot( const std::vector<std::string> &args ) {
    LOG_DEBUG << "处理启动参数,参数数量: " << args.size();
    if ( !args.empty() )
        LOG_DEBUG << "启动参数列表: " << args;
    auto id = Config::setPathParameter( args );
    if ( id == "" ) {
        LOG_DEBUG << "无有效路径参数，无需打开浏览器";
        return;
    }
    LOG_INFO << "生成分享ID: " << id << ",打开管理页面";
    utils::openHome( "/index.html?page=./admin/&shareId=" + utils::urlEncode( id ) );
}
