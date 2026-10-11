#ifndef ROUTES_AUTH_H
#define ROUTES_AUTH_H

#include <httplib.h>
#include "common/App.h"
#include "core/Auth.hpp"
#include "common/Utils.h"

namespace routes::auth {
// Register all authentication-related routes on the given server.
void registerAuthRoutes( httplib::Server &svr );

} // namespace routes::auth
#endif // ROUTES_AUTH_H
