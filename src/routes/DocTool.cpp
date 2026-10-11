#include "routes/DocTool.h"
#include "common/App.h"
#include "common/Logger.hpp"
#include "core/Database.h"
#include "core/Server.h"
#include "common/Utils.h"
#include "resource.h"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <chrono>
#include <filesystem>
#include <memory>
#include <mutex>
#include <random>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace fs = std::filesystem;

namespace routes::docs {

// ===== 通用工具 =====

static bool isDocFile( const fs::path &p ) {
    std::string ext = utils::toLower( p.extension().string() );
    // 文档类
    if ( ext == ".md" || ext == ".markdown" ||
         ext == ".html" || ext == ".htm" )
        return true;
    // 纯文本/数据/配置/脚本
    if ( ext == ".txt" || ext == ".log" || ext == ".csv" ||
         ext == ".json" || ext == ".xml" ||
         ext == ".yaml" || ext == ".yml" ||
         ext == ".ini" || ext == ".conf" || ext == ".cfg" ||
         ext == ".toml" || ext == ".properties" ||
         ext == ".sh" || ext == ".bat" || ext == ".cmd" ||
         ext == ".ps1" || ext == ".sql" )
        return true;
    return false;
}

// 是否需要用 HTML 包装(纯文本/数据/配置/脚本), 而非直接返回
static bool isTextExt( const std::string &ext ) {
    return ext == ".txt" || ext == ".log" || ext == ".csv" ||
           ext == ".json" || ext == ".xml" ||
           ext == ".yaml" || ext == ".yml" ||
           ext == ".ini" || ext == ".conf" || ext == ".cfg" ||
           ext == ".toml" || ext == ".properties" ||
           ext == ".sh" || ext == ".bat" || ext == ".cmd" ||
           ext == ".ps1" || ext == ".sql";
}

static std::string normalizePath( const std::string &p ) {
    if ( p.empty() )
        return p;
    std::string s = utils::fs::toNative( p );
    while ( s.size() > 3 && ( s.back() == '\\' || s.back() == '/' ) )
        s.pop_back();
    return s;
}

static std::string trim( const std::string &s ) {
    auto isSpace = []( unsigned char c ) { return std::isspace( c ); };
    size_t a = 0, b = s.size();
    while ( a < b && isSpace( s[a] ) )
        ++a;
    while ( b > a && isSpace( s[b - 1] ) )
        --b;
    return s.substr( a, b - a );
}

static Server::json sourceToJson( const Database::Row &r ) {
    Server::json j;
    j["id"] = r.count( "id" ) ? r.at( "id" ) : "";
    j["name"] = r.count( "name" ) ? r.at( "name" ) : "";
    j["path"] = r.count( "path" ) ? r.at( "path" ) : "";
    j["created_at"] = r.count( "created_at" ) ? r.at( "created_at" ) : "";
    j["updated_at"] = r.count( "updated_at" ) ? r.at( "updated_at" ) : "";
    return j;
}

static Database::Row getSourceById( const std::string &id ) {
    auto &db = App::getInstance()->getDatabase();
    auto rows = db.query( "SELECT * FROM doc_sources WHERE id='" + Database::sqlEscape( id ) + "'" );
    return rows.empty() ? Database::Row{} : rows[0];
}

// ===========================================================================
// 内部独立 HTTP 服务(仅本机, 端口自动分配)
// 用于把文档源目录以 HTTP 形式挂载出去, 前端 iframe 直接请求。
//  - .html / .htm: 直接返回文件内容(text/html)
//  - .md / .markdown: 返回嵌入式 HTML 包装(原始 markdown 经嵌入, 浏览器侧用 marked.js 渲染)
//  - 其他文件: 按扩展名返回对应 Content-Type
// ===========================================================================
namespace {

struct DocServerState {
    std::mutex mtx;
    std::string sourceDir;  // 当前挂载的源根目录(绝对路径)
    std::string sourceId;   // 当前源 id
    std::string sourceName; // 当前源名称
    bool sourceSet = false;
};

DocServerState g_state;

std::unique_ptr<httplib::Server> g_server;
std::thread g_thread;
std::mutex g_lifecycleMtx;
std::atomic<int> g_port{ 0 };
std::atomic<bool> g_running{ false };
std::string g_baseUrl; // 形如 http://127.0.0.1:12345/

// 在源根目录下解析 URL 路径到文件, 失败返回空
static fs::path resolveFile( const std::string &urlPath ) {
    std::string decoded = utils::urlDecode( urlPath );
    // 去掉前导 /
    while ( !decoded.empty() && ( decoded.front() == '/' || decoded.front() == '\\' ) )
        decoded.erase( decoded.begin() );
    if ( decoded.empty() )
        return {};

    std::string rootStr;
    {
        std::lock_guard<std::mutex> lock( g_state.mtx );
        if ( !g_state.sourceSet || g_state.sourceDir.empty() )
            return {};
        rootStr = g_state.sourceDir;
    }

    std::error_code ec;
    fs::path rootCanonical = fs::weakly_canonical( fs::path( rootStr ), ec );
    if ( ec )
        return {};
    fs::path filePath = fs::weakly_canonical( rootCanonical / decoded, ec );
    if ( ec )
        return {};

    std::string absStr = filePath.string();
    std::string rootCanonStr = rootCanonical.string();
    if ( !utils::fs::isWithin( rootCanonStr, absStr ) )
        return {};

    return filePath;
}

// Markdown 包装页: 浏览器侧用 marked.js 解析渲染
static std::string buildMarkdownWrapper( const std::string &mdContent ) {
    const std::string markedjs = Server::staticResource( "/lib/marked.js" );
    const std::string b64 = utils::base64Encode( mdContent );
    std::string html;
    html.reserve( mdContent.size() * 2 + markedjs.size() );
    html += "<!DOCTYPE html>\n"
            "<html lang=\"zh-CN\">\n"
            "<head>\n"
            "<meta charset=\"UTF-8\">\n"
            "<title>Document</title>\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n";
    html += "<script>\n" + markedjs + "</script>\n";
    html += "<style>\n"
            ":root { color-scheme: light dark; }\n"
            "html, body { background: Canvas; color: CanvasText; }\n"
            "body { font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, "
            "\"PingFang SC\", \"Microsoft YaHei\", sans-serif; "
            "max-width: 920px; margin: 0 auto; padding: 1.5rem 2rem 4rem; "
            "line-height: 1.65; }\n"
            "h1, h2, h3, h4, h5, h6 { margin-top: 1.4em; margin-bottom: 0.5em; "
            "font-weight: 600; line-height: 1.3; }\n"
            "h1 { font-size: 1.9em; padding-bottom: 0.3em; border-bottom: 1px solid color-mix(in srgb, CanvasText 15%, transparent); }\n"
            "h2 { font-size: 1.45em; padding-bottom: 0.3em; border-bottom: 1px solid color-mix(in srgb, CanvasText 15%, transparent); }\n"
            "h3 { font-size: 1.15em; }\n"
            "p, ul, ol, blockquote, pre, table { margin: 0.8em 0; }\n"
            "code { background: color-mix(in srgb, CanvasText 8%, transparent); "
            "padding: 0.15em 0.4em; border-radius: 3px; font-size: 0.9em; "
            "font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }\n"
            "pre { padding: 1em; border-radius: 6px; overflow: auto; line-height: 1.45; "
            "background: color-mix(in srgb, CanvasText 6%, transparent); }\n"
            "pre code { background: transparent; padding: 0; font-size: 0.875em; }\n"
            "blockquote { border-left: 4px solid color-mix(in srgb, CanvasText 25%, transparent); "
            "margin: 0.8em 0; padding: 0 1em; color: color-mix(in srgb, CanvasText 70%, transparent); }\n"
            "table { border-collapse: collapse; width: 100%; }\n"
            "th, td { border: 1px solid color-mix(in srgb, CanvasText 20%, transparent); "
            "padding: 0.4em 0.8em; }\n"
            "th { background: color-mix(in srgb, CanvasText 6%, transparent); font-weight: 600; }\n"
            "img { max-width: 100%; height: auto; }\n"
            "a { color: #0969da; text-decoration: none; }\n"
            "a:hover { text-decoration: underline; }\n"
            "hr { border: 0; border-top: 1px solid color-mix(in srgb, CanvasText 15%, transparent); margin: 1.5em 0; }\n"
            "ul, ol { padding-left: 1.8em; }\n"
            "li { margin: 0.2em 0; }\n"
            "</style>\n"
            "</head>\n"
            "<body>\n"
            "<div id=\"__md_content\">Loading...</div>\n"
            "<script>\n"
            "(function(){\n"
            "  try {\n";
    html += "    var bin = atob(\"" + b64 + "\");\n";
    html += "    var bytes = new Uint8Array(bin.length);\n"
            "    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);\n"
            "    var md = new TextDecoder('utf-8').decode(bytes);\n"
            "    var el = document.getElementById('__md_content');\n"
            "    if (typeof marked !== 'undefined' && marked && marked.parse) {\n"
            "      marked.setOptions({ breaks: false, gfm: true });\n"
            "      el.innerHTML = marked.parse(md);\n"
            "    } else {\n"
            "      el.textContent = md;\n"
            "    }\n"
            "  } catch (e) {\n"
            "    var el2 = document.getElementById('__md_content');\n"
            "    if (el2) el2.textContent = 'Render error: ' + e.message;\n"
            "  }\n"
            "})();\n"
            "</script>\n"
            "</body>\n"
            "</html>\n";
    return html;
}

// HTML 实体转义
static std::string htmlEscape( const std::string &s ) {
    std::string out;
    out.reserve( s.size() );
    for ( char c : s ) {
        switch ( c ) {
        case '&':
            out += "&amp;";
            break;
        case '<':
            out += "&lt;";
            break;
        case '>':
            out += "&gt;";
            break;
        case '"':
            out += "&quot;";
            break;
        case '\'':
            out += "&#39;";
            break;
        default:
            out += c;
            break;
        }
    }
    return out;
}

// 纯文本/数据/配置/脚本 包装: 用 <pre><code> 展示
static std::string buildTextWrapper( const std::string &content, const std::string &ext, const std::string &filename ) {
    std::string lang;
    if ( ext == ".json" )
        lang = "json";
    else if ( ext == ".xml" )
        lang = "xml";
    else if ( ext == ".yaml" || ext == ".yml" )
        lang = "yaml";
    else if ( ext == ".sh" )
        lang = "bash";
    else if ( ext == ".bat" || ext == ".cmd" )
        lang = "bat";
    else if ( ext == ".ps1" )
        lang = "powershell";
    else if ( ext == ".sql" )
        lang = "sql";
    else
        lang = "text";

    std::string escaped = htmlEscape( content );
    std::string tag = ext.empty() ? std::string() : ext.substr( 1 );
    std::string fnameEsc = htmlEscape( filename );
    std::string tagEsc = htmlEscape( tag );

    std::string html;
    html.reserve( content.size() + 2048 );
    html += "<!DOCTYPE html>\n"
            "<html lang=\"zh-CN\">\n"
            "<head>\n"
            "<meta charset=\"UTF-8\">\n"
            "<title>";
    html += fnameEsc;
    html += "</title>\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
            "<style>\n"
            ":root { color-scheme: light dark; }\n"
            "html, body { background: Canvas; color: CanvasText; }\n"
            "body { font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, "
            "\"PingFang SC\", \"Microsoft YaHei\", sans-serif; "
            "max-width: 1100px; margin: 0 auto; padding: 1.25rem 1.5rem 4rem; "
            "line-height: 1.55; }\n"
            ".tf-head { display: flex; align-items: center; gap: 0.5rem; "
            "padding-bottom: 0.6rem; margin-bottom: 0.8rem; "
            "border-bottom: 1px solid color-mix(in srgb, CanvasText 15%, transparent); "
            "font-size: 0.85rem; color: color-mix(in srgb, CanvasText 65%, transparent); "
            "flex-wrap: wrap; }\n"
            ".tf-head .tf-name { font-weight: 600; color: CanvasText; font-size: 0.95rem; }\n"
            ".tf-head .tf-tag { padding: 0.1em 0.55em; border-radius: 4px; "
            "background: color-mix(in srgb, CanvasText 8%, transparent); "
            "font-size: 0.72em; letter-spacing: 0.05em; text-transform: uppercase; }\n"
            ".tf-pre { background: color-mix(in srgb, CanvasText 5%, transparent); "
            "border: 1px solid color-mix(in srgb, CanvasText 12%, transparent); "
            "border-radius: 8px; padding: 1rem 1.1rem; overflow: auto; line-height: 1.55; "
            "font-family: ui-monospace, SFMono-Regular, \"Cascadia Code\", \"Fira Code\", Consolas, monospace; "
            "font-size: 0.85rem; white-space: pre; tab-size: 4; }\n"
            ".tf-pre code { font-family: inherit; background: transparent; padding: 0; }\n"
            "@media (max-width: 720px) { body { padding: 1rem 0.8rem 2rem; } "
            ".tf-pre { padding: 0.7rem 0.8rem; font-size: 0.8rem; } }\n"
            "</style>\n"
            "</head>\n"
            "<body>\n"
            "<div class=\"tf-head\">";
    html += "<span class=\"tf-name\">" + fnameEsc + "</span>\n";
    html += "<span class=\"tf-tag\">" + tagEsc + "</span></div>\n";
    html += "<pre class=\"tf-pre\"><code class=\"language-" + lang + "\">";
    html += escaped;
    html += "</code></pre>\n</body>\n</html>\n";
    return html;
}

// 内部服务的根路径欢迎页
static std::string buildIndexPage() {
    std::string name;
    {
        std::lock_guard<std::mutex> lock( g_state.mtx );
        name = g_state.sourceName;
    }
    std::string html;
    html += "<!DOCTYPE html>\n"
            "<html lang=\"zh-CN\"><head><meta charset=\"UTF-8\"><title>Document Server</title>"
            "<style>body{font-family:-apple-system,sans-serif;max-width:640px;margin:4rem auto;"
            "padding:0 1.2rem;line-height:1.6;}h1{margin-bottom:0.4em;}"
            ".muted{opacity:.7;}</style></head><body>";
    html += "<h1>📚 Document Server</h1>";
    if ( !name.empty() )
        html += "<p>当前源: <b>" + name + "</b></p>";
    html += "<p class=\"muted\">请在左侧目录树中选择一个文件, 将通过 iframe 加载.</p>";
    html += "</body></html>\n";
    return html;
}

// 注册内部服务路由
static void setupDocServerRoutes( httplib::Server &svr ) {
    // 健康检查
    svr.Get( "/__health", []( const httplib::Request &, httplib::Response &res ) {
        res.set_content( "OK", "text/plain" );
    } );

    // 根路径欢迎页
    svr.Get( "/", []( const httplib::Request &, httplib::Response &res ) {
        res.set_content( buildIndexPage(), "text/html; charset=utf-8" );
    } );

    // 状态查询(JSON)
    svr.Get( "/__status", []( const httplib::Request &, httplib::Response &res ) {
        std::string name, id, dir;
        {
            std::lock_guard<std::mutex> lock( g_state.mtx );
            name = g_state.sourceName;
            id = g_state.sourceId;
            dir = g_state.sourceDir;
        }
        Server::json j;
        j["running"] = g_running.load();
        j["port"] = g_port.load();
        j["baseUrl"] = g_baseUrl;
        j["sourceSet"] = !dir.empty();
        j["sourceId"] = id;
        j["sourceName"] = name;
        j["sourceDir"] = dir;
        res.set_content( j.dump(), "application/json; charset=utf-8" );
    } );

    // 兜底 catch-all(必须最后注册)
    svr.Get( R"(.*)", []( const httplib::Request &req, httplib::Response &res ) {
        // 这两个路径已有专用 handler, 不应落入此处
        if ( req.path == "/__health" || req.path == "/__status" || req.path == "/" )
            return;

        fs::path filePath = resolveFile( req.path );
        if ( filePath.empty() ) {
            res.status = 404;
            res.set_content( "Not Found", "text/plain; charset=utf-8" );
            return;
        }

        std::error_code ec;
        if ( !fs::is_regular_file( filePath, ec ) ) {
            res.status = 404;
            res.set_content( "Not Found", "text/plain; charset=utf-8" );
            return;
        }

        std::string ext = utils::toLower( filePath.extension().string() );

        // Markdown: 返回嵌入式 HTML 包装
        if ( ext == ".md" || ext == ".markdown" ) {
            std::string content;
            if ( !utils::fs::readFile( filePath.string(), content ) ) {
                res.status = 500;
                res.set_content( "Read Error", "text/plain; charset=utf-8" );
                return;
            }
            res.set_content( buildMarkdownWrapper( content ), "text/html; charset=utf-8" );
            return;
        }

        // HTML: 直接返回文件内容
        if ( ext == ".html" || ext == ".htm" ) {
            std::string content;
            if ( !utils::fs::readFile( filePath.string(), content ) ) {
                res.status = 500;
                res.set_content( "Read Error", "text/plain; charset=utf-8" );
                return;
            }
            res.set_content( content, "text/html; charset=utf-8" );
            return;
        }

        // 纯文本/数据/配置/脚本: 返回 HTML 包装
        if ( isTextExt( ext ) ) {
            std::string content;
            if ( !utils::fs::readFile( filePath.string(), content ) ) {
                res.status = 500;
                res.set_content( "Read Error", "text/plain; charset=utf-8" );
                return;
            }
            res.set_content( buildTextWrapper( content, ext, filePath.filename().string() ),
                             "text/html; charset=utf-8" );
            return;
        }

        // 其他文件: 直接返回(按扩展名猜测 Content-Type)
        std::string content;
        if ( !utils::fs::readFile( filePath.string(), content ) ) {
            res.status = 500;
            res.set_content( "Read Error", "text/plain; charset=utf-8" );
            return;
        }
        res.set_content( content, Server::contentType( filePath ) );
    } );
}

static void startDocHttpServerLocked() {
    // 必须在已持有 g_lifecycleMtx 的情况下调用
    if ( g_server )
        return;

    auto server = std::make_unique<httplib::Server>();
    setupDocServerRoutes( *server );

    int port = server->bind_to_any_port( "127.0.0.1" );
    if ( port <= 0 ) {
        throw std::runtime_error( "无法绑定内部服务端口" );
    }

    g_port = port;
    g_baseUrl = "http://127.0.0.1:" + std::to_string( port ) + "/";
    g_server = std::move( server );
    g_running = true;

    g_thread = std::thread( []() {
        try {
            if ( g_server )
                g_server->listen_after_bind();
        } catch ( ... ) {
        }
        g_running = false;
    } );
}

static void stopDocHttpServerLocked() {
    // 必须在已持有 g_lifecycleMtx 的情况下调用
    if ( g_server ) {
        g_server->stop();
    }
    if ( g_thread.joinable() ) {
        g_thread.join();
    }
    g_server.reset();
    g_port = 0;
    g_baseUrl.clear();
    g_running = false;

    {
        std::lock_guard<std::mutex> lock( g_state.mtx );
        g_state.sourceSet = false;
        g_state.sourceDir.clear();
        g_state.sourceId.clear();
        g_state.sourceName.clear();
    }
}

} // anonymous namespace

// ===== 内部服务启停 =====
void shutdownDocHttpServer() {
    std::lock_guard<std::mutex> lock( g_lifecycleMtx );
    stopDocHttpServerLocked();
}

// ===== 文档源 CRUD =====

static void listSources( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto rows = App::getInstance()->getDatabase().query(
        "SELECT * FROM doc_sources ORDER BY updated_at DESC" );
    Server::json arr = Server::json::array();
    for ( auto &r : rows )
        arr.push_back( sourceToJson( r ) );
    Server::sendJson( res, { { "success", true }, { "sources", arr } } );
}

static void createSource( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    if ( !body.is_object() )
        return Server::sendError( res, "无效的请求体", 400 );

    std::string name = body.contains( "name" ) && body["name"].is_string() ? body["name"].get<std::string>() : "";
    std::string path = body.contains( "path" ) && body["path"].is_string() ? body["path"].get<std::string>() : "";
    if ( name.empty() )
        return Server::sendError( res, "缺少名称(name)", 400 );
    if ( path.empty() )
        return Server::sendError( res, "缺少目录(path)", 400 );
    name = trim( name );
    if ( name.empty() )
        return Server::sendError( res, "名称不能为空", 400 );

    path = normalizePath( path );
    std::error_code ec;
    if ( !fs::is_directory( path, ec ) )
        return Server::sendError( res, "目录不存在或不可访问", 400 );

    auto &db = App::getInstance()->getDatabase();
    std::string id = utils::generateId();
    std::string now = utils::nowIso();
    try {
        db.execParams(
            "INSERT INTO doc_sources(id,name,path,created_at,updated_at) VALUES(?,?,?,?,?)",
            { { 1, id }, { 2, name }, { 3, path }, { 4, now }, { 5, now } } );
    } catch ( const std::exception &e ) {
        std::string msg = e.what();
        if ( msg.find( "UNIQUE" ) != std::string::npos )
            return Server::sendError( res, "名称已存在", 400 );
        return Server::sendError( res, "创建失败: " + msg, 500 );
    }
    auto row = getSourceById( id );
    Server::sendJson( res, { { "success", true }, { "source", sourceToJson( row ) } } );
}

static void updateSource( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1].str();
    auto row = getSourceById( id );
    if ( row.empty() )
        return Server::sendError( res, "文档源不存在", 404 );

    auto body = Server::parseBody( req );
    if ( !body.is_object() )
        return Server::sendError( res, "无效的请求体", 400 );

    std::string name = row.count( "name" ) ? row["name"] : "";
    std::string path = row.count( "path" ) ? row["path"] : "";
    if ( body.contains( "name" ) && body["name"].is_string() ) {
        name = trim( body["name"].get<std::string>() );
        if ( name.empty() )
            return Server::sendError( res, "名称不能为空", 400 );
    }
    if ( body.contains( "path" ) && body["path"].is_string() ) {
        path = normalizePath( body["path"].get<std::string>() );
        std::error_code ec;
        if ( !fs::is_directory( path, ec ) )
            return Server::sendError( res, "目录不存在或不可访问", 400 );
    }

    auto &db = App::getInstance()->getDatabase();
    try {
        db.execParams(
            "UPDATE doc_sources SET name=?, path=?, updated_at=? WHERE id=?",
            { { 1, name }, { 2, path }, { 3, utils::nowIso() }, { 4, id } } );
    } catch ( const std::exception &e ) {
        std::string msg = e.what();
        if ( msg.find( "UNIQUE" ) != std::string::npos )
            return Server::sendError( res, "名称已存在", 400 );
        return Server::sendError( res, "更新失败: " + msg, 500 );
    }
    auto updated = getSourceById( id );
    Server::sendJson( res, { { "success", true }, { "source", sourceToJson( updated ) } } );
}

static void deleteSource( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1].str();
    auto row = getSourceById( id );
    if ( row.empty() )
        return Server::sendError( res, "文档源不存在", 404 );
    auto &db = App::getInstance()->getDatabase();
    try {
        db.execParams( "DELETE FROM doc_sources WHERE id=?", { { 1, id } } );
    } catch ( const std::exception &e ) {
        return Server::sendError( res, "删除失败: " + std::string( e.what() ), 500 );
    }
    Server::sendJson( res, { { "success", true } } );
}

// ===== 树 =====

struct TreeNode {
    std::string name;
    std::string relPath; // 相对源根的 POSIX 路径
    bool isDir = false;
    bool hasChildren = false;
    std::vector<TreeNode> children;
};

static fs::path resolveSafe( const fs::path &root, const std::string &relOrAbs );

// 扫描时跳过的"构建/版本控制"目录(黑名单)
static bool isBlacklistedDirName( const std::string &lname ) {
    return lname == "node_modules" || lname == ".git" || lname == ".svn" || lname == ".hg" ||
           lname == "target" || lname == "build" || lname == "dist" || lname == ".idea" ||
           lname == ".vscode" || lname == "vendor" || lname == "__pycache__";
}

static void buildTree( const fs::path &base, const fs::path &cur, TreeNode &node, int depth, int maxDepth ) {
    std::error_code ec;
    std::vector<fs::directory_entry> dirs, files;
    for ( auto &entry : fs::directory_iterator( cur, ec ) ) {
        if ( ec )
            break;
        std::string fname = entry.path().filename().string();
        if ( !fname.empty() && fname[0] == '.' )
            continue;
        if ( entry.is_directory( ec ) ) {
            std::string lname = utils::toLower( fname );
            if ( isBlacklistedDirName( lname ) )
                continue;
            dirs.push_back( entry );
        } else if ( entry.is_regular_file( ec ) ) {
            if ( isDocFile( entry.path() ) )
                files.push_back( entry );
        }
    }
    auto cmpName = []( const fs::directory_entry &a, const fs::directory_entry &b ) {
        std::string la = utils::toLower( a.path().filename().string() );
        std::string lb = utils::toLower( b.path().filename().string() );
        return la < lb;
    };
    std::sort( dirs.begin(), dirs.end(), cmpName );
    std::sort( files.begin(), files.end(), cmpName );

    auto rel = []( const fs::path &base, const fs::path &p ) {
        std::error_code ec;
        fs::path rp = fs::relative( p, base, ec );
        std::string s = rp.generic_string();
        if ( s.empty() || s == "." )
            return std::string();
        return s;
    };

    for ( auto &d : dirs ) {
        TreeNode child;
        child.name = d.path().filename().string();
        child.relPath = rel( base, d.path() );
        child.isDir = true;
        if ( depth < maxDepth )
            buildTree( base, d.path(), child, depth + 1, maxDepth );
        child.hasChildren = !child.children.empty();
        node.children.push_back( std::move( child ) );
    }
    for ( auto &f : files ) {
        TreeNode child;
        child.name = f.path().filename().string();
        child.relPath = rel( base, f.path() );
        child.isDir = false;
        node.children.push_back( std::move( child ) );
    }
}

static Server::json treeToJson( const TreeNode &n ) {
    Server::json j;
    j["name"] = n.name;
    j["path"] = n.relPath;
    j["isDir"] = n.isDir;
    if ( n.isDir ) {
        j["hasChildren"] = n.hasChildren;
        Server::json arr = Server::json::array();
        for ( auto &c : n.children )
            arr.push_back( treeToJson( c ) );
        j["children"] = arr;
    }
    return j;
}

static void getTree( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1].str();
    auto row = getSourceById( id );
    if ( row.empty() )
        return Server::sendError( res, "文档源不存在", 404 );
    std::string rootPath = row["path"];

    std::error_code ec;
    if ( !fs::is_directory( rootPath, ec ) )
        return Server::sendError( res, "文档源目录不存在", 400 );

    std::string sub = Server::queryParam( req, "path" );
    std::string depthStr = Server::queryParam( req, "depth" );
    int depth = 1;
    if ( !depthStr.empty() ) {
        try {
            depth = std::stoi( depthStr );
        } catch ( ... ) {
            depth = 1;
        }
    }
    if ( depth < 1 )
        depth = 1;
    if ( depth > 16 )
        depth = 16;

    fs::path rootFs( rootPath );
    fs::path scanFs = rootFs;
    if ( !sub.empty() ) {
        fs::path safe = resolveSafe( rootFs, sub );
        if ( safe.empty() )
            return Server::sendError( res, "非法路径", 400 );
        if ( !fs::is_directory( safe, ec ) )
            return Server::sendError( res, "目录不存在", 404 );
        scanFs = safe;
    }

    TreeNode node;
    node.name = scanFs == rootFs ? fs::path( rootPath ).filename().string() : scanFs.filename().string();
    node.relPath = ( scanFs == rootFs ) ? std::string() : sub;
    node.isDir = true;
    buildTree( rootFs, scanFs, node, 0, depth );
    node.hasChildren = !node.children.empty();

    Server::json j = treeToJson( node );
    j["rootPath"] = rootPath;
    j["id"] = id;
    j["name"] = row["name"];
    j["depth"] = depth;
    j["path"] = node.relPath;
    Server::sendJson( res, { { "success", true }, { "tree", j } } );
}

// ===== 文件读取(兼容旧版) =====

static fs::path resolveSafe( const fs::path &root, const std::string &relOrAbs ) {
    if ( relOrAbs.empty() )
        return root;
    fs::path p( relOrAbs );
    fs::path abs = p.is_absolute() ? p : ( root / p );
    std::string absStr = abs.string();
    std::string rootStr = root.string();
    if ( !utils::fs::isWithin( rootStr, absStr ) )
        return {};
    return abs;
}

// ===== 选源 / 状态(驱动内部服务) =====

static void selectSourceHandler( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    if ( !body.is_object() )
        return Server::sendError( res, "无效的请求体", 400 );

    std::string id = body.contains( "id" ) && body["id"].is_string() ? body["id"].get<std::string>() : "";
    if ( id.empty() )
        return Server::sendError( res, "缺少 id", 400 );

    auto row = getSourceById( id );
    if ( row.empty() )
        return Server::sendError( res, "文档源不存在", 404 );
    std::string rootPath = row["path"];
    std::string name = row.count( "name" ) ? row["name"] : "";

    std::error_code ec;
    if ( !fs::is_directory( rootPath, ec ) )
        return Server::sendError( res, "文档源目录不存在", 400 );

    {
        std::lock_guard<std::mutex> lock( g_lifecycleMtx );
        try {
            startDocHttpServerLocked();
        } catch ( const std::exception &e ) {
            return Server::sendError( res, std::string( "启动内部服务失败: " ) + e.what(), 500 );
        }
        {
            std::lock_guard<std::mutex> sl( g_state.mtx );
            g_state.sourceDir = rootPath;
            g_state.sourceId = id;
            g_state.sourceName = name;
            g_state.sourceSet = true;
        }
    }

    Server::json j;
    j["success"] = true;
    j["baseUrl"] = g_baseUrl;
    j["port"] = g_port.load();
    j["sourceId"] = id;
    j["sourceName"] = name;
    j["sourceDir"] = rootPath;
    Server::sendJson( res, j );
}

static void deselectSourceHandler( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    {
        std::lock_guard<std::mutex> lock( g_lifecycleMtx );
        stopDocHttpServerLocked();
    }
    Server::sendJson( res, { { "success", true } } );
}

static void getStatusHandler( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string name, id, dir;
    {
        std::lock_guard<std::mutex> lock( g_lifecycleMtx );
        std::lock_guard<std::mutex> sl( g_state.mtx );
        name = g_state.sourceName;
        id = g_state.sourceId;
        dir = g_state.sourceDir;
    }
    Server::json j;
    j["success"] = true;
    j["running"] = g_running.load();
    j["port"] = g_port.load();
    j["baseUrl"] = g_baseUrl;
    j["sourceSet"] = !dir.empty();
    j["sourceId"] = id;
    j["sourceName"] = name;
    j["sourceDir"] = dir;
    Server::sendJson( res, j );
}

// ===== 注册 =====
void registerDocRoutes( httplib::Server &svr ) {
    svr.Get( "/api/docs/sources", listSources );
    svr.Post( "/api/docs/sources", createSource );
    svr.Get( R"(/api/docs/sources/([^/]+))", getTree );
    svr.Put( R"(/api/docs/sources/([^/]+))", updateSource );
    svr.Delete( R"(/api/docs/sources/([^/]+))", deleteSource );

    // 选源 / 内部服务管理
    svr.Post( "/api/docs/source/select", selectSourceHandler );
    svr.Post( "/api/docs/source/deselect", deselectSourceHandler );
    svr.Get( "/api/docs/status", getStatusHandler );

    LOG_DEBUG << "已注册文档阅读工具路由";
}

} // namespace routes::docs
