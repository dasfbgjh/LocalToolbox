#ifndef ROUTES_FILE_SERVICE_H
#define ROUTES_FILE_SERVICE_H

#include <httplib.h>
#include <string>
#include <vector>
#include <filesystem>
#include <optional>
#include "core/Auth.hpp"
#include "common/Utils.h"
#include "core/Server.h"
#include "common/App.h"
#include "common/Config.h"

namespace routes::fileService {

void registerFileServiceRoutes( httplib::Server &svr );

} // namespace routes::fileService

#endif // ROUTES_FILE_SERVICE_H