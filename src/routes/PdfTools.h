#ifndef ROUTES_PDF_TOOLS_H
#define ROUTES_PDF_TOOLS_H

#include <httplib.h>
#include <string>
#include <vector>
#include <fstream>
#include <filesystem>
#include <cstdlib>
#include <map>
#include <mutex>
#include "common/Utils.h"
#include "common/Logger.hpp"

namespace routes::pdfTools {

void registerPdfRoutes( httplib::Server &svr );

} // namespace routes::pdfTools

#endif // ROUTES_PDF_TOOLS_H
