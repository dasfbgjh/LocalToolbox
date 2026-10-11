#ifndef ROUTES_TEAMS_H
#define ROUTES_TEAMS_H

#include <httplib.h>
#include <ctime>
#include <string>
#include "core/Auth.hpp"
#include "common/Utils.h"
#include "common/App.h"
#include "common/Config.h"

namespace routes::teams {

void registerTeamRoutes( httplib::Server &svr );

} // namespace routes::teams
#endif // ROUTES_TEAMS_H