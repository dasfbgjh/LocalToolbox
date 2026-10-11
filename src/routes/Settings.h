#ifndef ROUTES_SETTINGS_H
#define ROUTES_SETTINGS_H

#include <httplib.h>
#include "common/App.h"
#include "core/Auth.hpp"
#include "common/Utils.h"

namespace routes::settings {
// Register all user settings routes on the given server.
void registerSettingsRoutes( httplib::Server &svr );

// GET /api/settings — 返回当前用户的所有设置
void settingsGet( const httplib::Request &req, httplib::Response &res );

// PUT /api/settings — 批量写入设置（body: { key: value, ... }）
void settingsPut( const httplib::Request &req, httplib::Response &res );

// DELETE /api/settings/:key — 删除单个设置
void settingsDelete( const httplib::Request &req, httplib::Response &res );

} // namespace routes::settings
#endif // ROUTES_SETTINGS_H
