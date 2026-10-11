#include "common/Utils.h"
#include "common/Logger.hpp"
#include "SystemTray.h"

SystemTray::SystemTray( std::function<void( struct tray_menu *item, int id )> clickCallback )
    : m_clickCallback( clickCallback ) {
    memset( &m_tray, 0, sizeof( m_tray ) );

    int code = tray_init( &m_tray );
    if ( code < 0 )
        LOG_ERROR << "初始化系统托盘失败，错误码: " << code;
}

SystemTray::~SystemTray() {
    exit();
}

void SystemTray::setIconData( const unsigned char *data, size_t size ) {
    m_tray.icon_data = const_cast<void *>( reinterpret_cast<const void *>( data ) );
    m_tray.icon_data_size = size;
    tray_update( &m_tray );
}

void SystemTray::setIconPath( const std::string &path ) {
    m_tray.icon = const_cast<char *>( path.c_str() );
    tray_update( &m_tray );
}

void SystemTray::update( const SystemTray::SubMenu &menus ) {
    if ( menus.empty() ) {
        m_tray.menu = nullptr;
        tray_update( &m_tray );
        m_trayRoot.clear();
        m_trayMenus.clear();
    } else {
        m_trayRoot.clear();
        for ( auto menu : menus )
            m_trayRoot.push_back( *menu );
        m_trayRoot.push_back( { nullptr, 0, 0, nullptr, nullptr, nullptr } );
        m_tray.menu = m_trayRoot.data();
        tray_update( &m_tray );
    }
}

void SystemTray::update() {
    tray_update( &m_tray );
}

int SystemTray::run() {
    while ( tray_loop( 1 ) != TRAY_EXIT_CODE ) {
    }
    return TRAY_EXIT_CODE;
}

int SystemTray::poll() {
    return tray_loop( 0 );
}

void SystemTray::exit() {
    tray_exit();
}

void SystemTray::menuCallback( struct tray_menu *item ) {
    TrayMenuContext *context = reinterpret_cast<TrayMenuContext *>( item->context );
    if ( !context )
        return;
    if ( !context->instance )
        return;
    if ( !context->instance->m_clickCallback )
        return;
    context->instance->m_clickCallback( item, context->id );
}

SystemTray::Menu SystemTray::createMenu( const std::string &name, int id, bool disabled,
                                         bool checked, const SystemTray::SubMenu &submenu ) {
    auto context = std::make_shared<TrayMenuContext>();
    context->id = id;
    context->name = utils::utf8ToLocal( name );
    context->instance = this;
    for ( auto menu : submenu )
        context->subMenu.push_back( *menu );
    if ( !context->subMenu.empty() )
        context->subMenu.push_back( { nullptr, 0, 0, nullptr, nullptr, nullptr } );
    m_trayMenus.push_back( context );

    Menu menu = std::make_shared<struct tray_menu>();
    menu->text = name.empty() ? nullptr : const_cast<char *>( context->name.c_str() );
    menu->disabled = disabled;
    menu->checked = checked;
    menu->cb = menuCallback;
    menu->context = context.get();
    menu->submenu = context->subMenu.empty() ? nullptr : context->subMenu.data();
    return menu;
}

SystemTray::Menu SystemTray::createMenu( const std::string &name, int id,
                                         const SystemTray::SubMenu &submenu ) {
    return createMenu( name, id, false, false, submenu );
}

SystemTray::Menu SystemTray::createSeparator( int id ) {
    return createMenu( "-", id, false, false, {} );
}