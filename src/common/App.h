#ifndef APP_H
#define APP_H

#include <vector>
#include "core/Server.h"
#include "core/Database.h"
#include "common/SystemTray.h"
#include "core/WebviewWrapper.h"

class App {
private:
    static App *g_instance;

#ifdef _WIN32
    static const char *g_localServerName;
    static HANDLE g_mutex;
#endif

    bool m_running;
    int m_exitCode;
    bool m_reboot;

    Server m_server; // http服务器实例

    std::shared_ptr<Database> m_db; // 全局数据库实例

    std::unique_ptr<SystemTray> m_systemTray; // 系统托盘实例

    // 事件处理函数列表
    std::list<std::function<void( App * )>> m_eventHandlers;
    std::mutex m_eventMutex;

    // Webview实例
    WebviewWrapper webview;

public:
    using json = nlohmann::json;

    App();
    ~App();

    bool init();
    int exec();
    void exit( int exitCode = 0 );
    void reboot();
    bool isReboot();
    bool isRunning();
    void postEvent( std::function<void( App * )> handler );

    Database &getDatabase();
    static App *getInstance();
    static bool isBoot();

private:
    enum MenuId {
        Settings,
        Exit,
        Reboot,
        EnableContextMenu,
        AutoBoot,
        OpenAbout,
        OpenBrowser,
        OpenWebview,
        MakeDesktopShortcut,
    };

    void configLogger();
    void handleEventHandlers();
    void loadTrayMenu();
    void trayMenuCallback( struct tray_menu *item, int id );

    static void listenLocalServer( int timeout );
    static bool sendLocalMessage( const json &msg );
    static void handleLocalMessage( const json &msg );
    static void handleBoot( const std::vector<std::string> &args );
};

#endif
// APP_H