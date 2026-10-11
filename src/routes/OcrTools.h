#ifndef ROUTES_OCR_TOOLS_H
#define ROUTES_OCR_TOOLS_H

#include <httplib.h>

namespace routes::ocrTools {

void registerOcrRoutes( httplib::Server &svr );
void shutdown();

} // namespace routes::ocrTools

#endif // ROUTES_OCR_TOOLS_H