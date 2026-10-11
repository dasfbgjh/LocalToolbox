#include "McpTools.h"
#include "common/Config.h"
#include "common/Logger.hpp"
#include "common/EventLoop.h"
#include "common/Utils.h"
#include "resource.h"
#include <httplib.h>
#include <filesystem>
#include <mutex>
#include <map>
#include <chrono>
#include <algorithm>
#include <set>
#include <boost/regex.hpp>
#include <sstream>
#include <variant>

namespace fs = std::filesystem;

namespace mcpTools {

using json = mcp::core::json;

// ===== 工具目录扫描 =====

struct ScanDir {
    std::string path;
    bool embedded;
};

struct ToolInfo {
    std::string dirName;
    std::string dirPath;
    bool embedded;
    std::string name;
    std::string desc;
    std::string method;
    std::string entry;
    json args;
    json extension;
};

static std::vector<ScanDir> toolDataDirs() {
    std::vector<ScanDir> dirs;
#ifdef RESOURCE_PATH
    dirs.push_back( { std::string( RESOURCE_PATH ) + "/mcp-tool", false } );
#else
    dirs.push_back( { "/mcp-tool", true } );
#endif
    dirs.push_back( { Config::getAppPath() + "/mcp-tool", false } );
    return dirs;
}

static bool resourceReadFile( const std::string &resName, std::string &out ) {
    const unsigned char *data = nullptr;
    int size = resource_get( resName.c_str(), &data );
    if ( size < 0 || !data )
        return false;
    out.assign( reinterpret_cast<const char *>( data ), static_cast<size_t>( size ) );
    return true;
}

static std::set<std::string> resourceListDirs( const std::string &prefix ) {
    std::set<std::string> dirs;
    std::string p = prefix;
    if ( p.back() != '/' )
        p += '/';
    int count = resource_count();
    for ( int i = 0; i < count; ++i ) {
        const char *name = resource_name( i );
        if ( !name )
            continue;
        std::string n( name );
        if ( n.size() <= p.size() || n.substr( 0, p.size() ) != p )
            continue;
        auto pos = n.find( '/', p.size() );
        if ( pos != std::string::npos )
            dirs.insert( n.substr( p.size(), pos - p.size() ) );
    }
    return dirs;
}

static json readExtensionJsonFromDisk( const std::string &dirPath ) {
    std::string path = utils::fs::safeJoin( dirPath, "extension.json" );
    if ( path.empty() )
        return json::object();
    std::string content;
    if ( !utils::fs::readFile( path, content ) )
        return json::object();
    try {
        json j = json::parse( content );
        if ( j.is_object() )
            return j;
    } catch ( ... ) {
    }
    return json::object();
}

static json readExtensionJsonFromResource( const std::string &resDir ) {
    std::string resName = resDir + "/extension.json";
    std::string content;
    if ( !resourceReadFile( resName, content ) )
        return json::object();
    try {
        json j = json::parse( content );
        if ( j.is_object() )
            return j;
    } catch ( ... ) {
    }
    return json::object();
}

static json readConfigJsonFromDisk( const std::string &dirPath ) {
    std::string path = utils::fs::safeJoin( dirPath, "config.json" );
    if ( path.empty() )
        return json::object();
    std::string content;
    if ( !utils::fs::readFile( path, content ) )
        return json::object();
    try {
        return json::parse( content );
    } catch ( ... ) {
        return json::object();
    }
}

static json readConfigJsonFromResource( const std::string &resDir ) {
    std::string resName = resDir + "/config.json";
    std::string content;
    if ( !resourceReadFile( resName, content ) )
        return json::object();
    try {
        return json::parse( content );
    } catch ( ... ) {
        return json::object();
    }
}

static std::string readInstructionFromDisk( const std::string &dirPath ) {
    std::string path = utils::fs::safeJoin( dirPath, "instruction.md" );
    if ( path.empty() )
        return "";
    std::string content;
    if ( !utils::fs::readFile( path, content ) )
        return "";
    return content;
}

static std::string readInstructionFromResource( const std::string &resDir ) {
    std::string resName = resDir + "/instruction.md";
    std::string content;
    if ( !resourceReadFile( resName, content ) )
        return "";
    return content;
}

static std::string readResultMdFromDisk( const std::string &dirPath ) {
    std::string path = utils::fs::safeJoin( dirPath, "result.md" );
    if ( path.empty() )
        return "";
    std::string content;
    if ( !utils::fs::readFile( path, content ) )
        return "";
    return content;
}

static std::string readResultMdFromResource( const std::string &resDir ) {
    std::string resName = resDir + "/result.md";
    std::string content;
    if ( !resourceReadFile( resName, content ) )
        return "";
    return content;
}

static ToolInfo parseConfigJson( const json &j, const std::string &dirName,
                                 const std::string &dirPath, bool embedded ) {
    ToolInfo info;
    info.dirName = dirName;
    info.dirPath = dirPath;
    info.embedded = embedded;
    info.name = j.value( "name", "" );
    info.desc = j.value( "desc", "" );
    info.method = j.value( "method", "" );
    info.entry = j.value( "entry", "" );
    info.args = j.value( "args", json::array() );
    info.extension = j.value( "extension", json::object() );
    return info;
}

static void scanEmbeddedDir( const ScanDir &sd, std::vector<ToolInfo> &tools,
                             std::set<std::string> &seenIds ) {
    auto subDirs = resourceListDirs( sd.path );
    for ( auto &dirName : subDirs ) {
        if ( dirName.empty() || dirName[0] == '.' || seenIds.count( dirName ) )
            continue;

        std::string resDir = sd.path + "/" + dirName;
        std::string configResName = resDir + "/config.json";
        if ( !resource_exists( configResName.c_str() ) )
            continue;

        json j = readConfigJsonFromResource( resDir );
        if ( j.empty() || !j.is_object() ) {
            LOG_WARN << "McpTools: 解析内嵌 config.json 失败: " << configResName;
            continue;
        }

        ToolInfo info = parseConfigJson( j, dirName, resDir, true );

        json baseExt = readExtensionJsonFromResource( sd.path );
        json merged = baseExt;
        if ( info.extension.is_object() ) {
            for ( auto &[key, value] : info.extension.items() ) {
                merged[key] = value;
            }
        }
        info.extension = merged;

        seenIds.insert( dirName );
        if ( !info.name.empty() )
            tools.push_back( std::move( info ) );
    }
}

static void scanDiskDir( const ScanDir &sd, std::vector<ToolInfo> &tools,
                         std::set<std::string> &seenIds ) {
    std::error_code ec;
    if ( !fs::is_directory( sd.path, ec ) )
        return;

    for ( auto &entry : fs::directory_iterator( sd.path, ec ) ) {
        if ( !entry.is_directory( ec ) ) {
            ec.clear();
            continue;
        }
        std::string dirName = entry.path().filename().string();
        if ( ( !dirName.empty() && dirName[0] == '.' ) || seenIds.count( dirName ) ) {
            ec.clear();
            continue;
        }

        std::string configPath = utils::fs::safeJoin( entry.path().string(), "config.json" );
        if ( configPath.empty() || !fs::is_regular_file( configPath, ec ) ) {
            ec.clear();
            continue;
        }

        json j = readConfigJsonFromDisk( entry.path().string() );
        if ( j.empty() || !j.is_object() ) {
            LOG_WARN << "McpTools: 解析磁盘 config.json 失败: " << configPath;
            ec.clear();
            continue;
        }

        ToolInfo info = parseConfigJson( j, dirName, entry.path().string(), false );

        json baseExt = readExtensionJsonFromDisk( sd.path );
        json merged = baseExt;
        if ( info.extension.is_object() ) {
            for ( auto &[key, value] : info.extension.items() ) {
                merged[key] = value;
            }
        }
        info.extension = merged;

        seenIds.insert( dirName );
        if ( !info.name.empty() )
            tools.push_back( std::move( info ) );
    }
}

static std::vector<ToolInfo> scanTools() {
    auto dirs = toolDataDirs();
    std::vector<ToolInfo> tools;
    std::set<std::string> seenIds;

    for ( auto &sd : dirs ) {
        if ( sd.embedded )
            scanEmbeddedDir( sd, tools, seenIds );
        else
            scanDiskDir( sd, tools, seenIds );
    }

    std::sort( tools.begin(), tools.end(), []( const ToolInfo &a, const ToolInfo &b ) { return a.name < b.name; } );
    return tools;
}

static std::optional<ToolInfo> findTool( const std::string &name ) {
    auto tools = scanTools();
    for ( auto &t : tools ) {
        if ( t.name == name )
            return t;
    }
    return std::nullopt;
}

// ===== 执行引擎 =====

namespace {

std::mutex g_resultsMtx;
std::map<std::string, std::string> g_results;

bool parseUrl( const std::string &url, std::string &schemeHostPort, std::string &path ) {
    size_t pos = url.find( "://" );
    if ( pos == std::string::npos )
        return false;
    std::string scheme = url.substr( 0, pos );
    std::string rest = url.substr( pos + 3 );

    size_t slashPos = rest.find( '/' );
    if ( slashPos == std::string::npos ) {
        schemeHostPort = scheme + "://" + rest;
        path = "/";
    } else {
        schemeHostPort = scheme + "://" + rest.substr( 0, slashPos );
        path = rest.substr( slashPos );
    }
    return true;
}

std::string executeHttp( const std::string &method, const std::string &url,
                         const json &extension, const json &params ) {
    std::string schemeHostPort, path;
    if ( !parseUrl( url, schemeHostPort, path ) ) {
        return "Error: Invalid URL: " + url;
    }

    httplib::Client cli( schemeHostPort );
    cli.set_read_timeout( 30 );
    cli.set_write_timeout( 30 );
    cli.set_connection_timeout( 10 );

    httplib::Headers headers;
    if ( extension.is_object() ) {
        for ( auto &[key, value] : extension.items() ) {
            if ( value.is_string() )
                headers.emplace( key, value.get<std::string>() );
        }
    }

    std::string methodLower = utils::toLower( method );
    httplib::Result res;

    if ( methodLower == "get" ) {
        if ( params.is_string() && !params.get<std::string>().empty() ) {
            std::string query = params.get<std::string>();
            path += ( path.find( '?' ) == std::string::npos ? "?" : "&" ) + query;
        }
        res = cli.Get( path, headers );
    } else if ( methodLower == "post" ) {
        std::string body = params.is_null() ? "" : params.dump();
        res = cli.Post( path, headers, body, "application/json" );
    } else if ( methodLower == "update" ) {
        std::string body = params.is_null() ? "" : params.dump();
        res = cli.Put( path, headers, body, "application/json" );
    } else if ( methodLower == "delete" ) {
        if ( params.is_null() ) {
            res = cli.Delete( path, headers );
        } else {
            std::string body = params.dump();
            res = cli.Delete( path, headers, body, "application/json" );
        }
    } else {
        return "Error: Unsupported HTTP method: " + method;
    }

    if ( !res ) {
        return "Error: HTTP request failed: " + httplib::to_string( res.error() );
    }

    if ( res->status >= 400 ) {
        return "Error: HTTP " + std::to_string( res->status ) + ": " + res->body;
    }

    return res->body;
}

std::string executeCommand( const std::string &entry, const json &extension, const json &params ) {
    std::vector<std::string> cmd;
    cmd.push_back( entry );

    if ( params.is_array() ) {
        for ( auto &p : params ) {
            if ( p.is_string() )
                cmd.push_back( p.get<std::string>() );
            else
                cmd.push_back( p.dump() );
        }
    }

    auto env = EventLoop::currentEnv();
    if ( extension.is_object() ) {
        for ( auto &[key, value] : extension.items() ) {
            if ( value.is_string() )
                env[key] = value.get<std::string>();
        }
    }

    auto result = EventLoop::runProcessSync( cmd, std::filesystem::current_path(), env );
    if ( !result.started ) {
        return "Error: Failed to start process: " + result.error;
    }

    std::string output;
    if ( !result.output.empty() ) {
        if ( utils::isValidUtf8( result.output ) )
            output = result.output;
        else
            output = utils::localToUtf8( result.output );
    }
    if ( !result.error.empty() ) {
        if ( !output.empty() )
            output += "\n";
        std::string errStr = utils::isValidUtf8( result.error ) ? result.error : utils::localToUtf8( result.error );
        output += "[stderr] " + errStr;
    }

    if ( result.exitCode != 0 ) {
        if ( !output.empty() )
            output += "\n";
        output += "[exit code: " + std::to_string( result.exitCode ) + "]";
    }

    return output;
}

std::string executeStatic( const ToolInfo &info ) {
    if ( info.embedded ) {
        std::string content = readResultMdFromResource( info.dirPath );
        if ( content.empty() )
            return "Error: Failed to read result.md from embedded resource";
        return content;
    } else {
        std::string content = readResultMdFromDisk( info.dirPath );
        if ( content.empty() )
            return "Error: Failed to read result.md";
        return content;
    }
}

std::string storeResult( const std::string &result ) {
    auto now = std::chrono::system_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>( now.time_since_epoch() ).count();
    std::string id = std::to_string( ms );

    std::lock_guard<std::mutex> lk( g_resultsMtx );
    g_results[id] = result;
    return id;
}

std::optional<std::string> getResult( const std::string &id ) {
    std::lock_guard<std::mutex> lk( g_resultsMtx );
    auto it = g_results.find( id );
    if ( it == g_results.end() )
        return std::nullopt;
    return it->second;
}

struct MatchItem {
    int64_t pos;
    int64_t len;
    std::string content;
};

std::variant<std::vector<MatchItem>, std::string> searchResult( const std::string &id,
                                                                const std::string &pattern,
                                                                bool isRegex ) {
    std::lock_guard<std::mutex> lk( g_resultsMtx );
    auto it = g_results.find( id );
    if ( it == g_results.end() )
        return std::string( "Error: 找不到结果ID: " + id );

    const std::string &raw = it->second;
    std::vector<MatchItem> matches;

    if ( isRegex ) {
        try {
            boost::regex re( pattern );
            boost::sregex_iterator begin( raw.begin(), raw.end(), re );
            boost::sregex_iterator end;
            for ( auto &m = begin; m != end; ++m ) {
                MatchItem item;
                item.pos = static_cast<int64_t>( m->position() );
                item.len = static_cast<int64_t>( m->length() );
                item.content = m->str();
                matches.push_back( std::move( item ) );
            }
        } catch ( const boost::regex_error & ) {
            return std::string( "Error: Invalid regex pattern" );
        }
    } else {
        size_t start = 0;
        while ( true ) {
            size_t pos = raw.find( pattern, start );
            if ( pos == std::string::npos )
                break;
            MatchItem item;
            item.pos = static_cast<int64_t>( pos );
            item.len = static_cast<int64_t>( pattern.size() );
            item.content = raw.substr( pos, pattern.size() );
            matches.push_back( std::move( item ) );
            start = pos + 1;
        }
    }

    return matches;
}

struct LineInfo {
    int64_t lineNum;
    int64_t pos;
    int64_t len;
};

std::vector<LineInfo> buildLineIndex( const std::string &content ) {
    std::vector<LineInfo> lines;
    int64_t lineNum = 0;
    int64_t pos = 0;
    size_t i = 0;
    while ( i <= content.size() ) {
        size_t eol = content.find( '\n', i );
        if ( eol == std::string::npos ) {
            int64_t len = static_cast<int64_t>( content.size() ) - pos;
            if ( len > 0 )
                lines.push_back( { lineNum, pos, len } );
            break;
        }
        int64_t len = static_cast<int64_t>( eol ) - pos;
        lines.push_back( { lineNum, pos, len } );
        lineNum++;
        pos = static_cast<int64_t>( eol ) + 1;
        i = eol + 1;
    }
    return lines;
}

bool removeResult( const std::string &id ) {
    std::lock_guard<std::mutex> lk( g_resultsMtx );
    return g_results.erase( id ) > 0;
}

} // anonymous namespace

// ===== MCP 工具注册 =====

static void registerGetTools( mcp::McpServer &srv ) {
    mcp::core::JsonSchemaProperty pSearch;
    pSearch.type = "string";
    pSearch.description = "搜索关键词(匹配工具名称和描述)";

    mcp::core::JsonSchemaProperty pOffset;
    pOffset.type = "integer";
    pOffset.description = "分页偏移量(默认0)";

    mcp::core::JsonSchemaProperty pLimit;
    pLimit.type = "integer";
    pLimit.description = "分页大小(默认50)";

    mcp::core::ToolInputSchema sch;
    sch.properties.emplace( "search", std::move( pSearch ) );
    sch.properties.emplace( "offset", std::move( pOffset ) );
    sch.properties.emplace( "limit", std::move( pLimit ) );

    mcp::core::Tool t;
    t.name = "get_tools";
    t.description = "获取工具列表，支持搜索和分页";
    t.inputSchema = std::move( sch );
    t.destructive = false;
    t.idempotent = true;

    srv.registerTool( std::move( t ), []( const std::optional<mcp::core::json> &args ) {
        std::string search;
        if ( args && args->contains( "search" ) && ( *args )["search"].is_string() )
            search = ( *args )["search"].get<std::string>();

        int offset = 0;
        if ( args && args->contains( "offset" ) && ( *args )["offset"].is_number_integer() )
            offset = ( *args )["offset"].get<int>();

        int limit = 50;
        if ( args && args->contains( "limit" ) && ( *args )["limit"].is_number_integer() )
            limit = ( *args )["limit"].get<int>();

        auto tools = scanTools();

        std::string searchLower = utils::toLower( search );
        std::vector<ToolInfo> filtered;
        for ( auto &tool : tools ) {
            if ( searchLower.empty() ) {
                filtered.push_back( std::move( tool ) );
            } else {
                std::string nameLower = utils::toLower( tool.name );
                std::string descLower = utils::toLower( tool.desc );
                if ( nameLower.find( searchLower ) != std::string::npos ||
                     descLower.find( searchLower ) != std::string::npos ) {
                    filtered.push_back( std::move( tool ) );
                }
            }
        }

        if ( offset < 0 )
            offset = 0;
        if ( limit <= 0 )
            limit = 50;

        json items = json::array();
        int end = std::min( offset + limit, static_cast<int>( filtered.size() ) );
        for ( int i = offset; i < end; ++i ) {
            json item;
            item["name"] = filtered[i].name;
            item["desc"] = filtered[i].desc;
            items.push_back( item );
        }

        json result;
        result["tools"] = items;
        result["total"] = filtered.size();
        result["offset"] = offset;
        result["limit"] = limit;

        return mcp::core::makeJsonResult( result );
    } );
}

static void registerGetToolInstructions( mcp::McpServer &srv ) {
    mcp::core::JsonSchemaProperty pName;
    pName.type = "string";
    pName.description = "工具名称";

    mcp::core::ToolInputSchema sch;
    sch.properties.emplace( "name", std::move( pName ) );
    sch.required = { "name" };

    mcp::core::Tool t;
    t.name = "get_tool_instructions";
    t.description = "获取指定工具的用法说明";
    t.inputSchema = std::move( sch );
    t.destructive = false;
    t.idempotent = true;

    srv.registerTool( std::move( t ), []( const std::optional<mcp::core::json> &args ) {
        if ( !args || !args->contains( "name" ) || !( *args )["name"].is_string() ) {
            return mcp::core::makeTextResult( "Error: 缺少必需参数 'name'", true );
        }

        std::string name = ( *args )["name"].get<std::string>();
        auto info = findTool( name );
        if ( !info ) {
            return mcp::core::makeTextResult( "Error: 找不到工具: " + name, true );
        }

        std::string content;
        if ( info->embedded ) {
            content = readInstructionFromResource( info->dirPath );
        } else {
            content = readInstructionFromDisk( info->dirPath );
        }

        if ( content.empty() ) {
            return mcp::core::makeTextResult( "Error: 无法获取用法", true );
        }

        return mcp::core::makeTextResult( content );
    } );
}

static void registerRunTool( mcp::McpServer &srv ) {
    mcp::core::JsonSchemaProperty pName;
    pName.type = "string";
    pName.description = "工具名称";

    mcp::core::JsonSchemaProperty pParams;
    pParams.type = "any";
    pParams.description = "工具执行参数(可选)";

    mcp::core::JsonSchemaProperty pDirectReturn;
    pDirectReturn.type = "boolean";
    pDirectReturn.description = "是否直接返回结果(默认true，为false时存储结果并返回id和大小)";

    mcp::core::ToolInputSchema sch;
    sch.properties.emplace( "name", std::move( pName ) );
    sch.properties.emplace( "params", std::move( pParams ) );
    sch.properties.emplace( "direct_return", std::move( pDirectReturn ) );
    sch.required = { "name" };

    mcp::core::Tool t;
    t.name = "tool_run";
    t.description = "执行指定工具，支持直接返回结果或存储后返回id,然后通过调用获取结果工具读取结果";
    t.inputSchema = std::move( sch );
    t.destructive = false;
    t.idempotent = false;

    srv.registerTool( std::move( t ), []( const std::optional<mcp::core::json> &args ) {
        if ( !args || !args->contains( "name" ) || !( *args )["name"].is_string() ) {
            return mcp::core::makeTextResult( "Error: 缺少必需参数 'name'", true );
        }

        std::string name = ( *args )["name"].get<std::string>();
        json params;
        if ( args && args->contains( "params" ) )
            params = ( *args )["params"];

        bool directReturn = true;
        if ( args && args->contains( "direct_return" ) && ( *args )["direct_return"].is_boolean() )
            directReturn = ( *args )["direct_return"].get<bool>();

        auto info = findTool( name );
        if ( !info ) {
            return mcp::core::makeTextResult( "Error: 找不到工具: " + name, true );
        }

        std::string methodLower = utils::toLower( info->method );
        std::string result;

        if ( methodLower == "static" ) {
            result = executeStatic( *info );
        } else if ( methodLower == "command" ) {
            result = executeCommand( info->entry, info->extension, params );
        } else if ( methodLower == "get" || methodLower == "post" ||
                    methodLower == "update" || methodLower == "delete" ) {
            if ( info->entry.empty() ) {
                return mcp::core::makeTextResult( "Error: 工具 '" + name + "' 的 entry 为空", true );
            }
            result = executeHttp( info->method, info->entry, info->extension, params );
        } else {
            return mcp::core::makeTextResult( "Error: 不支持的执行方式: " + info->method, true );
        }

        if ( !directReturn ) {
            std::string id = storeResult( result );
            json ret;
            ret["id"] = id;
            ret["size"] = result.size();
            return mcp::core::makeJsonResult( ret );
        }

        if ( utils::startWith( result, "Error:" ) ) {
            return mcp::core::makeTextResult( result, true );
        }

        return mcp::core::makeTextResult( result );
    } );
}

static void registerGetToolResult( mcp::McpServer &srv ) {
    mcp::core::JsonSchemaProperty pId;
    pId.type = "string";
    pId.description = "工具执行结果ID";

    mcp::core::JsonSchemaProperty pMode;
    pMode.type = "string";
    pMode.description = "读取模式: 'char'(按字符，默认) 或 'line'(按行)";

    mcp::core::JsonSchemaProperty pOffset;
    pOffset.type = "integer";
    pOffset.description = "起始偏移: char模式为字符偏移(默认0)，line模式为行号(默认0，从0开始)";

    mcp::core::JsonSchemaProperty pSize;
    pSize.type = "integer";
    pSize.description = "读取数量: char模式为字符数(默认-1全部)，line模式为行数(默认-1全部)";

    mcp::core::ToolInputSchema sch;
    sch.properties.emplace( "id", std::move( pId ) );
    sch.properties.emplace( "mode", std::move( pMode ) );
    sch.properties.emplace( "offset", std::move( pOffset ) );
    sch.properties.emplace( "size", std::move( pSize ) );
    sch.required = { "id" };

    mcp::core::Tool t;
    t.name = "get_tool_result";
    t.description = "读取工具执行结果，支持按字符(char)或按行(line)模式读取指定区间";
    t.inputSchema = std::move( sch );
    t.destructive = false;
    t.idempotent = true;

    srv.registerTool( std::move( t ), []( const std::optional<mcp::core::json> &args ) {
        if ( !args || !args->contains( "id" ) || !( *args )["id"].is_string() ) {
            return mcp::core::makeTextResult( "Error: 缺少必需参数 'id'", true );
        }

        std::string id = ( *args )["id"].get<std::string>();

        std::string mode = "char";
        if ( args && args->contains( "mode" ) && ( *args )["mode"].is_string() ) {
            mode = utils::toLower( ( *args )["mode"].get<std::string>() );
        }

        int64_t offset = 0;
        if ( args && args->contains( "offset" ) && ( *args )["offset"].is_number_integer() )
            offset = ( *args )["offset"].get<int64_t>();

        int64_t size = -1;
        if ( args && args->contains( "size" ) && ( *args )["size"].is_number_integer() )
            size = ( *args )["size"].get<int64_t>();

        auto content = getResult( id );
        if ( !content ) {
            return mcp::core::makeTextResult( "Error: 找不到结果ID: " + id, true );
        }

        const std::string &raw = *content;

        if ( mode == "line" ) {
            auto lines = buildLineIndex( raw );
            if ( offset < 0 )
                offset = 0;
            if ( offset >= static_cast<int64_t>( lines.size() ) )
                return mcp::core::makeTextResult( "" );

            int64_t end;
            if ( size < 0 )
                end = static_cast<int64_t>( lines.size() );
            else
                end = std::min( offset + size, static_cast<int64_t>( lines.size() ) );

            std::string result;
            for ( int64_t i = offset; i < end; ++i ) {
                if ( i > offset )
                    result += '\n';
                result += raw.substr( static_cast<size_t>( lines[i].pos ), static_cast<size_t>( lines[i].len ) );
            }

            json meta;
            meta["total_lines"] = lines.size();
            meta["start_line"] = offset;
            meta["line_count"] = end - offset;
            meta["total_chars"] = raw.size();

            json ret;
            ret["content"] = result;
            ret["meta"] = meta;
            return mcp::core::makeJsonResult( ret );
        }

        if ( offset < 0 )
            offset = 0;
        if ( offset >= static_cast<int64_t>( raw.size() ) )
            return mcp::core::makeTextResult( "" );

        std::string result;
        if ( size < 0 || offset + size > static_cast<int64_t>( raw.size() ) )
            result = raw.substr( static_cast<size_t>( offset ) );
        else
            result = raw.substr( static_cast<size_t>( offset ), static_cast<size_t>( size ) );

        json meta;
        meta["total_chars"] = raw.size();
        meta["offset"] = offset;
        meta["size"] = result.size();

        json ret;
        ret["content"] = result;
        ret["meta"] = meta;
        return mcp::core::makeJsonResult( ret );
    } );
}

static void registerSearchToolResult( mcp::McpServer &srv ) {
    mcp::core::JsonSchemaProperty pId;
    pId.type = "string";
    pId.description = "工具执行结果ID";

    mcp::core::JsonSchemaProperty pPattern;
    pPattern.type = "string";
    pPattern.description = "搜索模式: 普通字符串或正则表达式";

    mcp::core::JsonSchemaProperty pIsRegex;
    pIsRegex.type = "boolean";
    pIsRegex.description = "是否将pattern作为正则表达式(默认false，即普通字符串搜索)";

    mcp::core::JsonSchemaProperty pOffset;
    pOffset.type = "integer";
    pOffset.description = "结果集分页偏移(默认0)";

    mcp::core::JsonSchemaProperty pLimit;
    pLimit.type = "integer";
    pLimit.description = "结果集分页大小(默认100)";

    mcp::core::ToolInputSchema sch;
    sch.properties.emplace( "id", std::move( pId ) );
    sch.properties.emplace( "pattern", std::move( pPattern ) );
    sch.properties.emplace( "is_regex", std::move( pIsRegex ) );
    sch.properties.emplace( "offset", std::move( pOffset ) );
    sch.properties.emplace( "limit", std::move( pLimit ) );
    sch.required = { "id", "pattern" };

    mcp::core::Tool t;
    t.name = "search_tool_result";
    t.description = "搜索工具执行结果，支持字符串搜索和正则表达式，返回匹配结果集(每项包含位置、长度、内容)，支持分页";
    t.inputSchema = std::move( sch );
    t.destructive = false;
    t.idempotent = true;

    srv.registerTool( std::move( t ), []( const std::optional<mcp::core::json> &args ) {
        if ( !args || !args->contains( "id" ) || !( *args )["id"].is_string() ) {
            return mcp::core::makeTextResult( "Error: 缺少必需参数 'id'", true );
        }
        if ( !args->contains( "pattern" ) || !( *args )["pattern"].is_string() ) {
            return mcp::core::makeTextResult( "Error: 缺少必需参数 'pattern'", true );
        }

        std::string id = ( *args )["id"].get<std::string>();
        std::string pattern = ( *args )["pattern"].get<std::string>();

        bool isRegex = false;
        if ( args->contains( "is_regex" ) && ( *args )["is_regex"].is_boolean() )
            isRegex = ( *args )["is_regex"].get<bool>();

        int offset = 0;
        if ( args->contains( "offset" ) && ( *args )["offset"].is_number_integer() )
            offset = ( *args )["offset"].get<int>();

        int limit = 100;
        if ( args->contains( "limit" ) && ( *args )["limit"].is_number_integer() )
            limit = ( *args )["limit"].get<int>();

        auto searchOut = searchResult( id, pattern, isRegex );

        if ( std::holds_alternative<std::string>( searchOut ) ) {
            return mcp::core::makeTextResult( std::get<std::string>( searchOut ), true );
        }

        auto &matches = std::get<std::vector<MatchItem>>( searchOut );

        if ( offset < 0 )
            offset = 0;
        if ( limit <= 0 )
            limit = 100;

        int end = std::min( offset + limit, static_cast<int>( matches.size() ) );
        json items = json::array();
        for ( int i = offset; i < end; ++i ) {
            json item;
            item["pos"] = matches[i].pos;
            item["len"] = matches[i].len;
            item["content"] = matches[i].content;
            items.push_back( item );
        }

        json result;
        result["matches"] = items;
        result["total"] = matches.size();
        result["offset"] = offset;
        result["limit"] = limit;
        return mcp::core::makeJsonResult( result );
    } );
}

static void registerRemoveToolResult( mcp::McpServer &srv ) {
    mcp::core::JsonSchemaProperty pId;
    pId.type = "string";
    pId.description = "要移除的工具执行结果ID";

    mcp::core::ToolInputSchema sch;
    sch.properties.emplace( "id", std::move( pId ) );
    sch.required = { "id" };

    mcp::core::Tool t;
    t.name = "remove_tool_result";
    t.description = "根据id移除存储的工具执行结果，释放内存";
    t.inputSchema = std::move( sch );
    t.destructive = true;
    t.idempotent = true;

    srv.registerTool( std::move( t ), []( const std::optional<mcp::core::json> &args ) {
        if ( !args || !args->contains( "id" ) || !( *args )["id"].is_string() ) {
            return mcp::core::makeTextResult( "Error: 缺少必需参数 'id'", true );
        }

        std::string id = ( *args )["id"].get<std::string>();
        bool removed = removeResult( id );

        json result;
        result["id"] = id;
        result["removed"] = removed;
        return mcp::core::makeJsonResult( result );
    } );
}

void registerTools( mcp::McpServer &server ) {
    registerGetTools( server );
    registerGetToolInstructions( server );
    registerRunTool( server );
    registerGetToolResult( server );
    registerSearchToolResult( server );
    registerRemoveToolResult( server );
}

} // namespace mcpTools