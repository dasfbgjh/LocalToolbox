#include "routes/GameTool.h"
#include "common/App.h"
#include "common/Config.h"
#include "common/Logger.hpp"
#include "core/Server.h"
#include "common/Utils.h"
#include "resource.h"

#include <algorithm>
#include <atomic>
#include <filesystem>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>

namespace fs = std::filesystem;

namespace routes::game {

// ===== 游戏目录扫描 =====

struct ScanDir {
    std::string path;
    bool embedded;
};

struct GameEntry {
    std::string id;
    std::string name;
    std::string entryFile;
    std::string baseDir;
    bool embedded;
};

struct ResolvedFile {
    std::string diskPath;
    std::string resName;
    bool embedded;
};

static std::vector<ScanDir> gameDataDirs() {
    std::vector<ScanDir> dirs;
#ifdef RESOURCE_PATH
    dirs.push_back( { std::string( RESOURCE_PATH ) + "/games", false } );
    dirs.push_back( { std::string( RESOURCE_PATH ) + "/games1", false } );
#else
    dirs.push_back( { "/games", true } );
    dirs.push_back( { "/games1", true } );
#endif
    dirs.push_back( { Config::getAppPath() + "/games", false } );
    return dirs;
}

static std::string guessGameName( const std::string &id ) {
    std::string name;
    bool upper = true;
    for ( char c : id ) {
        if ( c == '_' || c == '-' || c == ' ' ) {
            name += ' ';
            upper = true;
        } else if ( upper ) {
            name += static_cast<char>( std::toupper( static_cast<unsigned char>( c ) ) );
            upper = false;
        } else {
            name += c;
        }
    }
    return name;
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

static void parseGamesJson( const std::string &content, const std::string &baseDir,
                            bool embedded, std::vector<GameEntry> &games,
                            std::set<std::string> &seenIds ) {
    try {
        auto j = Server::json::parse( content );
        if ( !j.is_array() )
            return;
        for ( auto &item : j ) {
            std::string path = item.value( "path", "" );
            std::string name = item.value( "name", "" );
            if ( path.empty() )
                continue;

            fs::path p( path );
            std::string id = p.parent_path().string();
            std::string entryFile = p.filename().string();
            std::replace( id.begin(), id.end(), '\\', '/' );
            if ( id.empty() || entryFile.empty() )
                continue;

            if ( seenIds.count( id ) )
                continue;
            seenIds.insert( id );

            GameEntry g;
            g.id = id;
            g.name = name.empty() ? guessGameName( id ) : name;
            g.entryFile = entryFile;
            g.baseDir = baseDir;
            g.embedded = embedded;
            games.push_back( std::move( g ) );
        }
    } catch ( const std::exception &e ) {
        LOG_WARN << "解析 games.json 失败: " << baseDir << "/games.json - " << e.what();
    }
}

static void scanEmbeddedDir( const ScanDir &sd, std::vector<GameEntry> &games,
                             std::set<std::string> &seenIds ) {
    std::string jsonResName = sd.path + "/games.json";
    if ( resource_exists( jsonResName.c_str() ) ) {
        std::string content;
        if ( resourceReadFile( jsonResName, content ) )
            parseGamesJson( content, sd.path, true, games, seenIds );
        return;
    }

    auto subDirs = resourceListDirs( sd.path );
    for ( auto &dirName : subDirs ) {
        if ( dirName.empty() || dirName[0] == '.' || seenIds.count( dirName ) )
            continue;
        std::string resName = sd.path + "/" + dirName + "/index.html";
        if ( !resource_exists( resName.c_str() ) )
            continue;
        seenIds.insert( dirName );
        games.push_back( { dirName, guessGameName( dirName ), "index.html", sd.path, true } );
    }
}

static void scanDiskDir( const ScanDir &sd, std::vector<GameEntry> &games,
                         std::set<std::string> &seenIds ) {
    std::error_code ec;
    if ( !fs::is_directory( sd.path, ec ) )
        return;

    fs::path jsonPath = fs::path( sd.path ) / "games.json";
    if ( fs::is_regular_file( jsonPath, ec ) ) {
        std::string content;
        if ( utils::fs::readFile( jsonPath.string(), content ) )
            parseGamesJson( content, sd.path, false, games, seenIds );
        return;
    }

    for ( auto &entry : fs::directory_iterator( sd.path, ec ) ) {
        if ( !entry.is_directory( ec ) ) {
            ec.clear();
            continue;
        }
        std::string dirName = entry.path().filename().string();
        if ( !dirName.empty() && dirName[0] == '.' || seenIds.count( dirName ) )
            continue;
        if ( !fs::is_regular_file( entry.path() / "index.html", ec ) ) {
            ec.clear();
            continue;
        }
        seenIds.insert( dirName );
        games.push_back( { dirName, guessGameName( dirName ), "index.html", sd.path, false } );
    }
}

static std::vector<GameEntry> scanGames() {
    auto dirs = gameDataDirs();
    if ( dirs.empty() )
        return {};

    std::vector<GameEntry> games;
    std::set<std::string> seenIds;

    for ( auto &sd : dirs ) {
        if ( sd.embedded )
            scanEmbeddedDir( sd, games, seenIds );
        else
            scanDiskDir( sd, games, seenIds );
    }

    LOG_LOG << "Scanned " << games.size() << " games";
    std::sort( games.begin(), games.end(), []( const GameEntry &a, const GameEntry &b ) { return a.id < b.id; } );
    return games;
}

// ===== 内部 HTTP 服务(提供游戏静态文件) =====
namespace {

struct GameServerState {
    std::mutex mtx;
    std::vector<ScanDir> scanDirs;
    bool set = false;
};

GameServerState g_state;
std::unique_ptr<httplib::Server> g_server;
std::thread g_thread;
std::mutex g_lifecycleMtx;
std::atomic<int> g_port{ 0 };
std::atomic<bool> g_running{ false };
std::string g_baseUrl;

static ResolvedFile resolveFile( const std::string &urlPath ) {
    std::string decoded = utils::urlDecode( urlPath );
    while ( !decoded.empty() && ( decoded.front() == '/' || decoded.front() == '\\' ) )
        decoded.erase( decoded.begin() );
    if ( decoded.empty() )
        return {};

    std::vector<ScanDir> roots;
    {
        std::lock_guard<std::mutex> lock( g_state.mtx );
        if ( !g_state.set || g_state.scanDirs.empty() )
            return {};
        roots = g_state.scanDirs;
    }

    for ( auto &sd : roots ) {
        if ( sd.embedded ) {
            std::string resName = sd.path + "/" + decoded;
            if ( resource_exists( resName.c_str() ) )
                return { {}, resName, true };
            continue;
        }

        std::error_code ec;
        fs::path rootCanonical = fs::weakly_canonical( fs::path( sd.path ), ec );
        if ( ec )
            continue;
        fs::path filePath = fs::weakly_canonical( rootCanonical / decoded, ec );
        if ( ec )
            continue;

        std::string absStr = filePath.string();
        std::string rootCanonStr = rootCanonical.string();
        if ( !utils::fs::isWithin( rootCanonStr, absStr ) )
            continue;

        if ( fs::is_regular_file( filePath, ec ) )
            return { filePath.string(), {}, false };
    }

    return {};
}

static void setupGameServerRoutes( httplib::Server &svr ) {
    svr.Get( "/__health", []( const httplib::Request &, httplib::Response &res ) {
        res.set_content( "OK", "text/plain" );
    } );

    svr.Get( R"(.*)", []( const httplib::Request &req, httplib::Response &res ) {
        auto resolved = resolveFile( req.path );
        if ( resolved.embedded ) {
            if ( resolved.resName.empty() ) {
                res.status = 404;
                res.set_content( "Not Found", "text/plain; charset=utf-8" );
                return;
            }
            std::string content;
            if ( !resourceReadFile( resolved.resName, content ) ) {
                res.status = 500;
                res.set_content( "Read Error", "text/plain; charset=utf-8" );
                return;
            }
            res.set_content( content, Server::contentType( fs::path( resolved.resName ) ) );
            return;
        }

        if ( resolved.diskPath.empty() ) {
            res.status = 404;
            res.set_content( "Not Found", "text/plain; charset=utf-8" );
            return;
        }

        std::string content;
        if ( !utils::fs::readFile( resolved.diskPath, content ) ) {
            res.status = 500;
            res.set_content( "Read Error", "text/plain; charset=utf-8" );
            return;
        }
        res.set_content( content, Server::contentType( fs::path( resolved.diskPath ) ) );
    } );
}

static void startGameHttpServerLocked() {
    if ( g_server )
        return;

    auto server = std::make_unique<httplib::Server>();
    setupGameServerRoutes( *server );

    int port = server->bind_to_any_port( "127.0.0.1" );
    if ( port <= 0 ) {
        throw std::runtime_error( "无法绑定游戏服务端口" );
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

static void stopGameHttpServerLocked() {
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
        g_state.set = false;
        g_state.scanDirs.clear();
    }
}

} // anonymous namespace

void shutdownGameHttpServer() {
    std::lock_guard<std::mutex> lock( g_lifecycleMtx );
    stopGameHttpServerLocked();
}

// ===== API 路由 =====

static void listGames( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;

    auto games = scanGames();
    Server::json arr = Server::json::array();
    for ( auto &g : games ) {
        Server::json j;
        j["id"] = g.id;
        j["name"] = g.name;
        j["entryFile"] = g.entryFile;
        arr.push_back( j );
    }
    Server::sendJson( res, { { "success", true }, { "games", arr } } );
}

static void startServer( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;

    auto dirs = gameDataDirs();
    std::vector<ScanDir> validDirs;
    for ( auto &sd : dirs ) {
        if ( sd.embedded ) {
            validDirs.push_back( sd );
        } else {
            std::error_code ec;
            if ( fs::is_directory( sd.path, ec ) )
                validDirs.push_back( sd );
        }
    }
    if ( validDirs.empty() )
        return Server::sendError( res, "没有可用的游戏数据目录", 400 );

    {
        std::lock_guard<std::mutex> lock( g_lifecycleMtx );
        if ( !g_server ) {
            try {
                startGameHttpServerLocked();
            } catch ( const std::exception &e ) {
                return Server::sendError( res, std::string( "启动游戏服务失败: " ) + e.what(), 500 );
            }
        }
        {
            std::lock_guard<std::mutex> sl( g_state.mtx );
            g_state.scanDirs = validDirs;
            g_state.set = true;
        }
    }

    Server::json j;
    j["success"] = true;
    j["baseUrl"] = g_baseUrl;
    j["port"] = g_port.load();
    Server::sendJson( res, j );
}

static void getServerStatus( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;

    Server::json j;
    j["success"] = true;
    j["running"] = g_running.load();
    j["port"] = g_port.load();
    j["baseUrl"] = g_baseUrl;
    Server::sendJson( res, j );
}

void registerGameRoutes( httplib::Server &svr ) {
    svr.Get( "/api/game/list", listGames );
    svr.Post( "/api/game/start", startServer );
    svr.Get( "/api/game/status", getServerStatus );

    LOG_DEBUG << "已注册游戏工具路由";
}

} // namespace routes::game