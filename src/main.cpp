#include "common/Logger.hpp"
#include "common/Config.h"
#include "common/App.h"
#include "AppInfo.h"
#include "common/EventLoop.h"

int main( int argc, char *argv[] ) {
#ifdef WIN32
#if APP_BUILD_RELEASE == 1
    AppExtension::setOutputGBKCode( true );
#else
    system( "chcp 65001 >nul" );
#endif
#endif

    auto &logger = Logger::getInstance();
    logger.setOutputToConsole( true );
    logger.setOutputToFile( Logger::FileMode::FILE_OFF );
    logger.setLevel( Logger::Level::DEBUG );

#if APP_BUILD_RELEASE == 0
#ifdef WIN32
    system( "cls" );
#else
    system( "clear" );
#endif
#endif
    LOG_DEBUG << "应用名称:" << APP_NAME << "(" << APP_NAME_CODE << ")" << "\n"
              << "应用描述:" << APP_DESCRIPTION << "\n"
              << "应用开发组织:" << APP_ORG_NAME << "(" << APP_ORG_CODE << ")" << "\n"
              << "应用主页:" << APP_WEB_URL << "\n"
              << "应用开发者:" << APP_DEVELOPER << "\n"
              << "调试模式:" << APP_DEBUG_MODE << "\n"
              << "构建模式:" << APP_BUILD_RELEASE << "\n"
              << "应用版本:" << APP_VERSION << "(" << APP_VERSION_CODE << ")" << "\n"
              << "启动参数个数:" << argc << "\n"
              << "更新日志:" << "\n"
              << APP_UPDATE_LOG;

    try {
        Config::init( argc, argv );
        LOG_DEBUG << "配置解析完成";
    } catch ( const std::exception &e ) {
        LOG_ERROR << "配置解析异常: " << e.what();
        return 1;
    }

    if ( !App::isBoot() ) {
        LOG_INFO << "检测到已有实例在运行，退出当前进程";
        return 0;
    }

    LOG_INFO << "开始初始化应用...";
    App app;
    if ( !app.init() ) {
        LOG_ERROR << "应用初始化失败";
        return 1;
    }
    LOG_INFO << "应用初始化成功";

    LOG_INFO << "进入主事件循环";
    int code = app.exec();
    LOG_INFO << "应用退出，退出码:" << code;

    if ( app.isReboot() ) {
        LOG_INFO << "应用重启";
        EventLoop::delayBoot( Config::getAppFullPath(), 2 );
    }
    return code;
}
