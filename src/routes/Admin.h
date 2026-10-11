#ifndef ADMIN_H
#define ADMIN_H

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

namespace routes::admin {

void registerAdminRoutes( httplib::Server &svr );

} // namespace routes::admin
#endif // ADMIN_H
