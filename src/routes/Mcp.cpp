#include "routes/Mcp.h"
#include "core/Server.h"
#include "common/Utils.h"
#include "core/McpClient.h"
#include "core/McpTools.h"
#include "common/Config.h"
#include "common/Logger.hpp"

namespace routes::mcpRoutes {

// ---------------------------------
namespace serverSpace {

// Resource 示例: resource://tools/readme
static void registerResources( mcp::McpServer &srv ) {
    mcp::core::Resource readme;
    readme.uri = "resource://tools/readme";
    readme.name = "Tools MCP README";
    readme.description = "本 MCP 服务器随附的说明文档，解释已注册工具与安全策略。";
    readme.mimeType = "text/markdown";
    srv.registerResource( std::move( readme ), []( const std::string &uri ) {
        (void)uri;
        mcp::core::ResourceContent c;
        c.uri = "resource://tools/readme";
        c.mimeType = "text/markdown";
        static const char *kText = R"MCPDOC(
# Tools MCP Server 说明

本服务通过 `POST /mcp` 暴露 MCP (Model Context Protocol) JSON-RPC 接口。

## 已注册工具

| 工具名                | 描述                                                                 |
|-----------------------|----------------------------------------------------------------------|
| get_tools             | 获取工具列表，支持搜索和分页                                            |
| get_tool_instructions | 获取指定工具的用法说明                                                 |
| tool_run              | 执行指定工具                                                          |
| get_tool_result       | 读取工具执行结果，支持按字符(char)或按行(line)模式读取指定区间            |
| search_tool_result    | 搜索工具执行结果，支持字符串搜索和正则表达式，返回匹配结果集(位置/长度/内容)|
| remove_tool_result    | 根据结果 ID 移除存储的工具执行结果，释放内存                              |

## 工具目录扫描

工具目录在编译时固定，支持磁盘目录和内嵌资源两种来源：
- 磁盘目录：`RESOURCE_PATH/mcp-tool` 和 `<appPath>/resource/data/mcp-tool`
- 内嵌资源：`/mcp-tool`（无 RESOURCE_PATH 宏时启用）

每个工具子目录包含：
- `config.json`：工具配置(name/desc/method/entry/args/extension)
- `instruction.md`：工具用法说明
- `extension.json`（可选）：扫描目录级公共扩展配置，工具自身 extension 字段覆盖同名键

## 执行方式 (method)

| method   | 说明                                          |
|----------|-----------------------------------------------|
| get      | HTTP GET 请求，params 字符串作为查询参数       |
| post     | HTTP POST 请求，params 作为 JSON 请求体        |
| update   | HTTP PUT 请求，params 作为 JSON 请求体         |
| delete   | HTTP DELETE 请求，可选请求体                   |
| command  | 同步执行进程，entry 为命令，params 数组为参数   |
| static   | 读取工具目录下 result.md 文件                  |

## 结果存储与检索

- `tool_run` 设置 `direct_return=false` 时，结果存入内存并返回 `{id, size}`
- `get_tool_result`：按字符或按行模式读取指定区间，返回 `{content, meta}`
- `search_tool_result`：字符串/正则搜索，返回匹配结果集 `{matches: [{pos, len, content}], total, offset, limit}`
- `remove_tool_result`：按 ID 移除存储结果

## 典型交互流程

1. 调用 `initialize`：客户端提交 protocolVersion、capabilities、clientInfo
2. 收到 Response 后发送 `notifications/initialized`
3. `tools/list` / `resources/list` / `prompts/list` 发现能力
4. 使用 `tools/call` 执行工具

)MCPDOC";
        c.text = std::string( kText );
        mcp::core::ReadResourceResult r;
        r.contents.push_back( std::move( c ) );
        return r;
    } );
}

// Prompt 示例: system-reviewer
static void registerPrompts( mcp::McpServer &srv ) {
    mcp::core::Prompt p;
    p.name = "system-reviewer";
    p.description = "生成针对指定路径代码/目录的审查 Prompt 模板，给 AI 助手一套检查点。";
    mcp::core::PromptArgument arg;
    arg.name = "path";
    arg.description = "目标目录或文件路径";
    arg.required = true;
    p.arguments.push_back( std::move( arg ) );

    srv.registerPrompt( std::move( p ),
                        []( const std::optional<mcp::core::json> &args ) -> mcp::core::GetPromptResult {
                            std::string target = ".";
                            if ( args && args->contains( "path" ) )
                                target = ( *args )["path"].get<std::string>();
                            mcp::core::GetPromptResult result;
                            result.description = "代码/目录审查任务模板";

                            mcp::core::Content::Text sys;
                            sys.text = "你是一名资深代码审查者。请针对用户提供的路径下的代码进行审查，"
                                       "关注：1) 编译与类型安全；2) 资源释放与生命周期；3) 并发安全；"
                                       "4) 输入校验与边界；5) 可维护性与命名。针对每条问题给出代码位置+建议。";
                            mcp::core::PromptMessage m1{ mcp::core::Role::User, std::move( sys ) };
                            result.messages.push_back( std::move( m1 ) );

                            mcp::core::Content::Text user;
                            user.text = "请对路径 `" + target + "` 执行审查。"
                                                                " 先列出目录结构，再按关注点逐项总结，最后给出 Top 10 问题。";
                            mcp::core::PromptMessage m2{ mcp::core::Role::User, std::move( user ) };
                            result.messages.push_back( std::move( m2 ) );
                            return result;
                        } );
}

// Roots Provider 示例: 暴露当前工作目录和配置目录
static void registerRootsProvider( mcp::McpServer &srv ) {
    srv.setRootsProvider( []() -> std::vector<mcp::core::Root> {
        std::vector<mcp::core::Root> roots;
        try {
            char cwdBuf[4096];
#ifdef _WIN32
            _getcwd( cwdBuf, sizeof( cwdBuf ) );
#else
            getcwd( cwdBuf, sizeof( cwdBuf ) );
#endif
            mcp::core::Root r1;
            r1.uri = std::string( "file://" ) + cwdBuf;
            r1.name = "Working directory";
            roots.push_back( std::move( r1 ) );
        } catch ( ... ) {
        }
        try {
            mcp::core::Root r2;
            r2.uri = std::string( "file://" ) + Config::getTempPath();
            r2.name = "Tools temp directory";
            roots.push_back( std::move( r2 ) );
        } catch ( ... ) {
        }
        return roots;
    } );
}

static mcp::McpServer &mcpServer() {
    static std::mutex mutex;
    static std::shared_ptr<mcp::McpServer> server = nullptr;

    std::lock_guard<std::mutex> lk( mutex );
    if ( !server ) {
        server = std::make_shared<::mcp::McpServer>();
        mcpTools::registerTools( *server.get() );
        registerResources( *server.get() );
        registerPrompts( *server.get() );
        registerRootsProvider( *server.get() );
        LOG_INFO << "MCP server initialized";
    }
    return *server;
}

static void handleMcpRequest( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;

    const std::string &body = req.body;
    LOG_DEBUG << "MCP POST (来自:" << req.remote_addr << ") body前200: "
              << body.substr( 0, std::min<size_t>( 200, body.size() ) );

    mcp::core::json output;
    try {
        if ( body.empty() ) {
            auto r = mcp::core::makeErrorResponse( mcp::core::RequestId{}, mcp::core::ErrorCode::InvalidRequest, "请求体为空" );
            output = mcp::core::json( r );
        } else {
            mcp::core::json j = mcp::core::json::parse( body );
            output = mcpServer().handleBatchOrSingle( j );
        }
        // 纯通知（batch 全是 notification 时 handleBatchOrSingle 返回空数组）
        Server::sendJson( res, output, 200 );
    } catch ( const mcp::core::json::parse_error &e ) {
        auto r = mcp::core::makeErrorResponse( mcp::core::RequestId{}, mcp::core::ErrorCode::ParseError,
                                               std::string( "Parse error: " ) + e.what() );

        Server::sendJson( res, mcp::core::json( r ), 200 );
    } catch ( const std::invalid_argument &e ) {
        auto r = mcp::core::makeErrorResponse( mcp::core::RequestId{}, mcp::core::ErrorCode::InvalidRequest, e.what() );
        Server::sendJson( res, mcp::core::json( r ), 200 );
    } catch ( const std::exception &e ) {
        auto r = mcp::core::makeErrorResponse( mcp::core::RequestId{}, mcp::core::ErrorCode::InternalError, e.what() );
        Server::sendJson( res, mcp::core::json( r ), 500 );
    }
}

} // namespace serverSpace

// ---------------------------------
namespace clientSpace {

struct ProxyParams {
    std::string transport;
    bool isStdio;
    std::string endpoint;
    std::string commandStr;
    std::map<std::string, std::string> env;
    std::string action;
    int timeoutSec;
    bool skipHandshake;
    std::string protoVer;
    std::string clientName;
    std::string clientVersion;
};

class StepRecorder {
    using clock_t = std::chrono::high_resolution_clock;
    mcp::Client &client_;
    mcp::core::json &report_;
    bool &anyError_;

    static long long elapsedMs( clock_t::time_point t0 ) {
        return std::chrono::duration_cast<std::chrono::milliseconds>( clock_t::now() - t0 ).count();
    }

public:
    StepRecorder( mcp::Client &client, mcp::core::json &report, bool &anyError )
        : client_( client ), report_( report ), anyError_( anyError ) {
    }

    static mcp::core::json buildReqJson( const std::string &method, const mcp::core::json &params ) {
        mcp::core::json j = { { "jsonrpc", "2.0" }, { "method", method } };
        if ( !params.is_null() )
            j["params"] = params;
        return j;
    }

    std::optional<mcp::core::RpcResponse> doRequest( const std::string &method,
                                                     const mcp::core::json &params,
                                                     const std::string &label ) {
        auto t0 = clock_t::now();
        mcp::core::json step = { { "step", label }, { "request", buildReqJson( method, params ) } };
        std::optional<mcp::core::RpcResponse> ret;
        try {
            std::optional<mcp::core::json> p = params.is_null() ? std::nullopt
                                                                : std::optional<mcp::core::json>( params );
            auto resp = client_.sendRequest( method, p );
            step["ok"] = !resp.isError();
            step["http_status"] = 200;
            step["response"] = mcp::core::json( resp );
            ret = resp;
            if ( resp.isError() )
                anyError_ = true;
        } catch ( const mcp::Client::Error &e ) {
            step["ok"] = false;
            step["http_status"] = e.httpStatus();
            step["error"] = e.what();
            anyError_ = true;
        } catch ( const std::exception &e ) {
            step["ok"] = false;
            step["error"] = e.what();
            anyError_ = true;
        }
        step["elapsed_ms"] = elapsedMs( t0 );
        report_["steps"].push_back( step );
        return ret;
    }

    bool doNotification( const std::string &method,
                         const mcp::core::json &params,
                         const std::string &label ) {
        auto t0 = clock_t::now();
        mcp::core::json step = { { "step", label }, { "request", buildReqJson( method, params ) } };
        bool ok = false;
        try {
            std::optional<mcp::core::json> p = params.is_null() ? std::nullopt
                                                                : std::optional<mcp::core::json>( params );
            client_.sendNotification( method, p );
            ok = true;
            step["ok"] = true;
            step["http_status"] = 200;
        } catch ( const mcp::Client::Error &e ) {
            step["ok"] = false;
            step["http_status"] = e.httpStatus();
            step["error"] = e.what();
            anyError_ = true;
        } catch ( const std::exception &e ) {
            step["ok"] = false;
            step["error"] = e.what();
            anyError_ = true;
        }
        step["elapsed_ms"] = elapsedMs( t0 );
        report_["steps"].push_back( step );
        return ok;
    }
};

static std::vector<std::string> parseStdioCommand( const std::string &commandStr ) {
    std::vector<std::string> result;
    std::istringstream iss( commandStr );
    std::string token;
    bool inQuote = false;
    std::string quoted;
    char c;
    while ( iss.get( c ) ) {
        if ( c == '"' ) {
            inQuote = !inQuote;
            if ( !inQuote && !quoted.empty() ) {
                result.push_back( quoted );
                quoted.clear();
            }
            continue;
        }
        if ( inQuote ) {
            quoted += c;
        } else if ( c == ' ' || c == '\t' ) {
            if ( !token.empty() ) {
                result.push_back( token );
                token.clear();
            }
        } else {
            token += c;
        }
    }
    if ( !token.empty() )
        result.push_back( token );
    if ( !quoted.empty() )
        result.push_back( quoted );
    return result;
}

static std::map<std::string, std::string> parseStdioEnv( const mcp::core::json &args ) {
    std::map<std::string, std::string> env;
    std::string envStr;
    if ( args.contains( "env" ) && args["env"].is_string() )
        envStr = args["env"].get<std::string>();

    std::istringstream ess( envStr );
    std::string pair;
    while ( std::getline( ess, pair, ',' ) ) {
        auto eq = pair.find( '=' );
        if ( eq != std::string::npos ) {
            std::string k = pair.substr( 0, eq );
            std::string v = pair.substr( eq + 1 );
            while ( !k.empty() && std::isspace( (unsigned char)k.front() ) )
                k.erase( k.begin() );
            while ( !k.empty() && std::isspace( (unsigned char)k.back() ) )
                k.pop_back();
            while ( !v.empty() && std::isspace( (unsigned char)v.front() ) )
                v.erase( v.begin() );
            while ( !v.empty() && std::isspace( (unsigned char)v.back() ) )
                v.pop_back();
            if ( !k.empty() )
                env[k] = v;
        }
    }
    return env;
}

bool createClient( mcp::Client &client, const ProxyParams &params, mcp::core::json &report, httplib::Response &res ) {
    try {
        if ( params.isStdio ) {
            mcp::Client::StdioOptions opts;
            opts.command = parseStdioCommand( params.commandStr );
            opts.timeout = std::chrono::seconds( params.timeoutSec );
            opts.env = params.env;
            auto t = mcp::Client::createStdioTransport( opts );
            client.setTransport( t );
        } else {
            mcp::Client::HttpOptions opts;
            opts.url = params.endpoint;
            opts.timeout = std::chrono::seconds( params.timeoutSec );
            opts.sseLegacyMode = ( params.transport == "sse" );
            auto t = mcp::Client::createHttpTransport( opts );
            client.setTransport( t );
        }
    } catch ( const mcp::Client::Error &e ) {
        report["ok"] = false;
        report["fatal_exception"] = std::string( "传输创建失败: " ) + e.what();
        Server::sendJson( res, report, 200 );
        return false;
    } catch ( const std::exception &e ) {
        report["ok"] = false;
        report["fatal_exception"] = std::string( "传输创建失败: " ) + e.what();
        Server::sendJson( res, report, 200 );
        return false;
    }
    client.setClientInfo( params.clientName, params.clientVersion );
    client.capabilities().roots = true;
    client.capabilities().sampling = true;
    return true;
}

static mcp::core::json buildInitParams( const std::string &protoVer, const std::string &clientName,
                                        const std::string &clientVersion ) {
    return mcp::core::json{
        { "protocolVersion", protoVer },
        { "capabilities", { { "roots", { { "listChanged", true } } }, { "sampling", { { "queueSize", 1 } } } } },
        { "clientInfo", { { "name", clientName }, { "version", clientVersion } } } };
}

static void sendInputError( const std::string &msg, httplib::Response &res ) {
    Server::sendJson( res, { { "ok", false }, { "error", msg }, { "steps", mcp::core::json::array() } }, 200 );
}

static void performHandshake( StepRecorder &recorder,
                              mcp::core::json &report,
                              const std::string &protoVer,
                              const std::string &clientName,
                              const std::string &clientVersion ) {
    auto resp = recorder.doRequest( "initialize", buildInitParams( protoVer, clientName, clientVersion ), "initialize" );
    if ( resp && !resp->isError() && resp->result && resp->result->is_object() ) {
        const auto &result = *resp->result;
        if ( result.contains( "protocolVersion" ) && result["protocolVersion"].is_string() ) {
            std::string sv = result["protocolVersion"].get<std::string>();
            if ( sv != protoVer )
                report["protocol_warning"] = "客户端请求版本 " + protoVer + " 与服务端版本 " + sv + " 不一致";
            report["server_info"] = result;
        }
        recorder.doNotification( mcp::core::methods::InitializedNotification,
                                 mcp::core::json::object(),
                                 mcp::core::methods::InitializedNotification );
    }
}

static void dispatchAction( const std::string &action, const mcp::core::json &args,
                            StepRecorder &recorder, mcp::core::json &report,
                            const std::string &protoVer, const std::string &clientName,
                            const std::string &clientVersion, httplib::Response &res ) {
    if ( action == "initialize" ) {
        auto resp = recorder.doRequest( mcp::core::methods::Initialize,
                                        buildInitParams( protoVer, clientName, clientVersion ),
                                        mcp::core::methods::Initialize );
        if ( resp && !resp->isError() && resp->result && resp->result->is_object() ) {
            recorder.doNotification( mcp::core::methods::InitializedNotification,
                                     mcp::core::json::object(),
                                     mcp::core::methods::InitializedNotification );
            report["server_info"] = *resp->result;
        }
    } else if ( action == "ping" ) {
        recorder.doRequest( mcp::core::methods::Ping,
                            mcp::core::json::object(),
                            mcp::core::methods::Ping );
    } else if ( action == "tools_list" ) {
        mcp::core::json params = mcp::core::json::object();
        if ( args.contains( "cursor" ) && args["cursor"].is_string() )
            params["cursor"] = args["cursor"].get<std::string>();
        auto resp = recorder.doRequest( mcp::core::methods::ToolsList,
                                        params,
                                        mcp::core::methods::ToolsList );
        if ( resp && !resp->isError() && resp->result && resp->result->is_object() ) {
            const auto &r = *resp->result;
            if ( r.contains( "tools" ) && r["tools"].is_array() ) {
                report["tools"] = r["tools"];
                mcp::core::json names = mcp::core::json::array();
                for ( const auto &tm : r["tools"] )
                    if ( tm.is_object() && tm.contains( "name" ) )
                        names.push_back( tm["name"] );
                report["tool_names"] = names;
            }
            if ( r.contains( "nextCursor" ) && !r["nextCursor"].is_null() )
                report["next_cursor"] = r["nextCursor"];
        }
    } else if ( action == "call_tool" ) {
        if ( !args.contains( "tool_name" ) || !args["tool_name"].is_string() )
            return sendInputError( "call_tool 需要参数: tool_name", res );
        mcp::core::json params = { { "name", args["tool_name"].get<std::string>() } };
        if ( args.contains( "tool_args" ) ) {
            if ( args["tool_args"].is_string() ) {
                const std::string s = args["tool_args"].get<std::string>();
                try {
                    params["arguments"] = mcp::core::json::parse( s );
                } catch ( const std::exception &e ) {
                    params["arguments"] = { { "_raw", s } };
                    report["warn"] = std::string( "tool_args 字符串解析失败，当作 _raw 原值传入: " ) + e.what();
                }
            } else {
                params["arguments"] = args["tool_args"];
            }
        }
        recorder.doRequest( mcp::core::methods::ToolsCall,
                            params,
                            mcp::core::methods::ToolsCall );
    } else if ( action == "resources_list" ) {
        mcp::core::json params = mcp::core::json::object();
        if ( args.contains( "cursor" ) && args["cursor"].is_string() )
            params["cursor"] = args["cursor"].get<std::string>();
        auto resp = recorder.doRequest( mcp::core::methods::ResourcesList,
                                        params,
                                        mcp::core::methods::ResourcesList );
        if ( resp && !resp->isError() && resp->result && resp->result->is_object() ) {
            const auto &r = *resp->result;
            if ( r.contains( "resources" ) && r["resources"].is_array() )
                report["resources"] = r["resources"];
            if ( r.contains( "nextCursor" ) && !r["nextCursor"].is_null() )
                report["next_cursor"] = r["nextCursor"];
        }
    } else if ( action == "read_resource" ) {
        if ( !args.contains( "resource_uri" ) || !args["resource_uri"].is_string() )
            return sendInputError( "read_resource 需要参数: resource_uri", res );
        mcp::core::json params = { { "uri", args["resource_uri"].get<std::string>() } };
        recorder.doRequest( mcp::core::methods::ResourcesRead,
                            params,
                            mcp::core::methods::ResourcesRead );
    } else if ( action == "prompts_list" ) {
        mcp::core::json params = mcp::core::json::object();
        if ( args.contains( "cursor" ) && args["cursor"].is_string() )
            params["cursor"] = args["cursor"].get<std::string>();
        auto resp = recorder.doRequest( mcp::core::methods::PromptsList,
                                        params,
                                        mcp::core::methods::PromptsList );
        if ( resp && !resp->isError() && resp->result && resp->result->is_object() ) {
            const auto &r = *resp->result;
            if ( r.contains( "prompts" ) && r["prompts"].is_array() )
                report["prompts"] = r["prompts"];
            if ( r.contains( "nextCursor" ) && !r["nextCursor"].is_null() )
                report["next_cursor"] = r["nextCursor"];
        }
    } else if ( action == "get_prompt" ) {
        if ( !args.contains( "prompt_name" ) || !args["prompt_name"].is_string() )
            return sendInputError( "get_prompt 需要参数: prompt_name", res );
        mcp::core::json params = { { "name", args["prompt_name"].get<std::string>() } };
        if ( args.contains( "prompt_args" ) && args["prompt_args"].is_object() )
            params["arguments"] = args["prompt_args"];
        recorder.doRequest( mcp::core::methods::PromptsGet,
                            params,
                            mcp::core::methods::PromptsGet );
    } else if ( action == "raw" ) {
        if ( !args.contains( "raw_method" ) || !args["raw_method"].is_string() )
            return sendInputError( "raw 需要参数: raw_method", res );
        const std::string method = args["raw_method"].get<std::string>();
        mcp::core::json params = mcp::core::json();
        if ( args.contains( "raw_params" ) )
            params = args["raw_params"];
        bool isNotify = args.value( "notification", method.rfind( "notifications/", 0 ) == 0 );
        if ( isNotify )
            recorder.doNotification( method, params, "raw-notify:" + method );
        else
            recorder.doRequest( method, params, "raw-request:" + method );
    } else {
        return sendInputError( std::string( "未知 action: " ) + action +
                                   "；允许值: probe / initialize / ping / tools_list / call_tool / "
                                   "resources_list / read_resource / prompts_list / get_prompt / raw",
                               res );
    }
}

static void handleProxyRequest( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    mcp::core::json args;
    try {
        args = Server::parseBody( req );
        if ( !args.is_object() )
            return sendInputError( "请求体必须是 JSON 对象", res );
        if ( !args.contains( "action" ) || !args["action"].is_string() )
            return sendInputError( "缺少必需参数: action (string)", res );
    } catch ( const std::exception &e ) {
        Server::sendJson( res, { { "ok", false }, { "error", std::string( "请求体解析失败: " ) + e.what() } }, 200 );
        return;
    }

    ProxyParams params;
    params.transport = args.value( "transport", std::string( "auto" ) );
    params.isStdio = ( utils::toLower( params.transport ) == "stdio" );
    if ( !params.isStdio && ( !args.contains( "endpoint" ) || !args["endpoint"].is_string() ) )
        return sendInputError( "HTTP 模式缺少必需参数: endpoint (string)", res );
    if ( params.isStdio && ( !args.contains( "command" ) || !args["command"].is_string() || args["command"].get<std::string>().empty() ) )
        return sendInputError( "stdio 模式缺少必需参数: command (string)", res );
    params.endpoint = params.isStdio ? std::string() : args["endpoint"].get<std::string>();
    params.commandStr = params.isStdio ? args["command"].get<std::string>() : std::string();
    params.env = parseStdioEnv( args );
    params.action = utils::toLower( args["action"].get<std::string>() );
    params.timeoutSec = args.value( "timeout_seconds", 30 );
    if ( params.timeoutSec < 1 )
        params.timeoutSec = 1;
    if ( params.timeoutSec > 600 )
        params.timeoutSec = 600;
    params.skipHandshake = args.value( "skip_handshake", false );
    params.protoVer = args.value( "protocol_version", std::string( mcp::core::kMcpProtocolVersion ) );
    params.clientName = args.value( "client_name", std::string( "MCP-Debug-Tool" ) );
    params.clientVersion = args.value( "client_version", std::string( "1.0" ) );

    mcp::core::json report = mcp::core::json::object();
    report["steps"] = mcp::core::json::array();
    report["target_endpoint"] = params.isStdio ? params.commandStr : params.endpoint;
    report["action"] = params.action;
    report["transport_mode"] = params.transport;
    bool anyError = false;

    try {
        mcp::Client client;
        if ( !createClient( client, params, report, res ) )
            return;
        StepRecorder recorder( client, report, anyError );
        bool needHandshake = ( params.action != "initialize" && params.action != "raw" && !params.skipHandshake );
        if ( needHandshake )
            performHandshake( recorder, report, params.protoVer, params.clientName, params.clientVersion );

        dispatchAction( params.action, args, recorder, report, params.protoVer, params.clientName, params.clientVersion, res );
    } catch ( const std::exception &e ) {
        anyError = true;
        report["fatal_exception"] = std::string( e.what() );
    }
    report["ok"] = !anyError;
    Server::sendJson( res, report, 200 );
}

} // namespace clientSpace

// ---------------------------------
mcp::McpServer &getMcpServer() {
    return serverSpace::mcpServer();
}

void registerMcpRoutes( httplib::Server &svr ) {
    // MCP 调试代理
    svr.Post( "/api/local/mcp_debug", clientSpace::handleProxyRequest );

    // Streamable HTTP JSON-RPC 入口
    svr.Post( "/mcp", serverSpace::handleMcpRequest );
    svr.Get( "/mcp", []( const httplib::Request &req, httplib::Response &res ) {
        if ( Server::guardLocalhost( req, res ) )
            return;
        res.status = 500;
        res.set_content( "MCP 服务不支持 SSE 模式，请使用 Streamable HTTP 模式", "text/plain" );
    } );
}

} // namespace routes::mcpRoutes