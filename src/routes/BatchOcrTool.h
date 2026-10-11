#ifndef ROUTES_BATCH_OCR_TOOL_H
#define ROUTES_BATCH_OCR_TOOL_H

#include <httplib.h>

namespace routes::batchOcrTool {

void registerBatchOcrRoutes( httplib::Server &svr );
void shutdown();

} // namespace routes::batchOcrTool

#endif // ROUTES_BATCH_OCR_TOOL_H