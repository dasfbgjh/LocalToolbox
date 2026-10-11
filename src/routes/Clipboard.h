#ifndef ROUTES_CLIPBOARD_H
#define ROUTES_CLIPBOARD_H

#include <httplib.h>
#include <filesystem>
#include <system_error>
#include "core/Auth.hpp"
#include "common/Utils.h"
#include "core/Database.h"
#include "common/App.h"
#include "common/Config.h"

namespace routes::clipboard {

void registerClipboardRoutes( httplib::Server &svr );

} // namespace routes::clipboard

#endif // ROUTES_CLIPBOARD_H
