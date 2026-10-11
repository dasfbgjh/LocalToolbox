#ifndef ROUTES_TOOLS_H
#define ROUTES_TOOLS_H

#include <httplib.h>
#include <string>
#include <vector>
#include <regex>
#include <chrono>
#include <map>
#include <mutex>
#include <algorithm>
#include "common/Utils.h"
#include "core/Server.h"

namespace routes::tools {

void registerToolRoutes( httplib::Server &svr );

} // namespace routes::tools

#endif // ROUTES_TOOLS_H