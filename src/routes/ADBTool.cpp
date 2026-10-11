#include "ADBTool.h"
#include "common/EventLoop.h"
#include "common/Config.h"
#include "core/Server.h"

namespace fs = std::filesystem;

namespace routes::adb {

// ===== ADB 工具 =====

static std::string adbTrim( const std::string &s ) {
    size_t a = 0, b = s.size();
    while ( a < b && ( s[a] == ' ' || s[a] == '\t' || s[a] == '\r' || s[a] == '\n' ) )
        ++a;
    while ( b > a && ( s[b - 1] == ' ' || s[b - 1] == '\t' || s[b - 1] == '\r' || s[b - 1] == '\n' ) )
        --b;
    return s.substr( a, b - a );
}

static Server::json adbExec( const std::vector<std::string> &args ) {
    Server::json j = Server::json::object();
    std::string adb = Config::getAdbPath();
    j["adbPath"] = adb;
    j["success"] = false;
    j["error"] = "";

    if ( adb.empty() ) {
        j["error"] = "未配置 adb 路径";
        return j;
    }

    std::vector<std::string> cmd;
    cmd.push_back( adb );
    for ( auto &a : args )
        cmd.push_back( a );

    auto result = EventLoop::runProcessSync( cmd, fs::current_path() );
    if ( !result.started ) {
        j["error"] = "启动 adb 失败";
        return j;
    }

    std::string output = adbTrim( result.output );
    std::string errStr = adbTrim( result.error );

    j["output"] = output;
    j["exitCode"] = result.exitCode;
    j["success"] = ( result.exitCode == 0 );

    if ( result.exitCode != 0 && !errStr.empty() )
        j["error"] = errStr;

    return j;
}

static void adbInfo( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto j = adbExec( { "version" } );
    if ( j["success"].get<bool>() ) {
        std::string ver = j["output"].get<std::string>();
        size_t nl = ver.find( '\n' );
        j["version"] = ( nl != std::string::npos ) ? ver.substr( 0, nl ) : ver;
    }
    Server::sendJson( res, j );
}

static void adbDevices( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto j = adbExec( { "devices", "-l" } );
    if ( j["success"].get<bool>() ) {
        Server::json devs = Server::json::array();
        std::istringstream iss( j["output"].get<std::string>() );
        std::string line;
        while ( std::getline( iss, line ) ) {
            line = adbTrim( line );
            if ( line.empty() || line.find( "List of devices" ) == 0 )
                continue;
            Server::json d = Server::json::object();
            size_t sp = line.find( '\t' );
            if ( sp == std::string::npos )
                sp = line.find( ' ' );
            if ( sp != std::string::npos ) {
                d["serial"] = adbTrim( line.substr( 0, sp ) );
                std::string rest = adbTrim( line.substr( sp + 1 ) );
                size_t sp2 = rest.find( ' ' );
                d["state"] = ( sp2 != std::string::npos ) ? adbTrim( rest.substr( 0, sp2 ) ) : rest;
                d["details"] = ( sp2 != std::string::npos ) ? adbTrim( rest.substr( sp2 + 1 ) ) : "";
            } else {
                d["serial"] = line;
                d["state"] = "unknown";
                d["details"] = "";
            }
            devs.push_back( d );
        }
        j["devices"] = devs;
    }
    Server::sendJson( res, j );
}

static void adbConnect( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    std::string target = "";
    if ( body.is_object() && body.contains( "target" ) && body["target"].is_string() )
        target = body["target"].get<std::string>();
    if ( target.empty() )
        return Server::sendError( res, "缺少 target 参数", 400 );
    auto j = adbExec( { "connect", target } );
    Server::sendJson( res, j );
}

static void adbDisconnect( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    std::string target = "";
    if ( body.is_object() && body.contains( "target" ) && body["target"].is_string() )
        target = body["target"].get<std::string>();
    if ( target.empty() )
        return Server::sendError( res, "缺少 target 参数", 400 );
    auto j = adbExec( { "disconnect", target } );
    Server::sendJson( res, j );
}

static bool jsonBool( const Server::json &j, const char *key, bool def ) {
    if ( !j.is_object() || !j.contains( key ) || !j[key].is_boolean() )
        return def;
    return j[key].get<bool>();
}

static void adbForwardList( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string serial = Server::queryParam( req, "serial" );
    bool reverse = Server::queryParam( req, "reverse" ) == "true";
    std::string subcmd = reverse ? "reverse" : "forward";
    std::vector<std::string> args = { subcmd, "--list" };
    if ( !serial.empty() ) {
        args = { "-s", serial, subcmd, "--list" };
    }
    auto j = adbExec( args );
    if ( j["success"].get<bool>() ) {
        Server::json fwds = Server::json::array();
        std::istringstream iss( j["output"].get<std::string>() );
        std::string line;
        while ( std::getline( iss, line ) ) {
            line = adbTrim( line );
            if ( line.empty() )
                continue;
            Server::json f = Server::json::object();
            size_t p1 = line.find( ' ' );
            if ( p1 == std::string::npos ) {
                f["serial"] = line;
                f["local"] = "";
                f["remote"] = "";
            } else {
                f["serial"] = adbTrim( line.substr( 0, p1 ) );
                std::string rest = adbTrim( line.substr( p1 + 1 ) );
                size_t p2 = rest.find( ' ' );
                if ( p2 == std::string::npos ) {
                    f["local"] = rest;
                    f["remote"] = "";
                } else {
                    f["local"] = adbTrim( rest.substr( 0, p2 ) );
                    f["remote"] = adbTrim( rest.substr( p2 + 1 ) );
                }
            }
            fwds.push_back( f );
        }
        j["forwards"] = fwds;
    }
    Server::sendJson( res, j );
}

static void adbForwardAdd( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    std::string serial, local, remote;
    bool reverse = false;
    if ( body.is_object() ) {
        if ( body.contains( "serial" ) && body["serial"].is_string() )
            serial = body["serial"].get<std::string>();
        if ( body.contains( "local" ) && body["local"].is_string() )
            local = body["local"].get<std::string>();
        if ( body.contains( "remote" ) && body["remote"].is_string() )
            remote = body["remote"].get<std::string>();
        reverse = jsonBool( body, "reverse", false );
    }
    if ( local.empty() || remote.empty() )
        return Server::sendError( res, "缺少 local 或 remote 参数", 400 );
    std::string subcmd = reverse ? "reverse" : "forward";
    std::vector<std::string> args;
    if ( !serial.empty() )
        args = { "-s", serial, subcmd, local, remote };
    else
        args = { subcmd, local, remote };
    auto j = adbExec( args );
    Server::sendJson( res, j );
}

static void adbForwardRemove( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    std::string serial, local;
    bool reverse = false;
    if ( body.is_object() ) {
        if ( body.contains( "serial" ) && body["serial"].is_string() )
            serial = body["serial"].get<std::string>();
        if ( body.contains( "local" ) && body["local"].is_string() )
            local = body["local"].get<std::string>();
        reverse = jsonBool( body, "reverse", false );
    }
    if ( local.empty() )
        return Server::sendError( res, "缺少 local 参数", 400 );
    std::string subcmd = reverse ? "reverse" : "forward";
    std::vector<std::string> args;
    if ( !serial.empty() )
        args = { "-s", serial, subcmd, "--remove", local };
    else
        args = { subcmd, "--remove", local };
    auto j = adbExec( args );
    Server::sendJson( res, j );
}

static void adbForwardRemoveAll( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    std::string serial;
    bool reverse = false;
    if ( body.is_object() ) {
        if ( body.contains( "serial" ) && body["serial"].is_string() )
            serial = body["serial"].get<std::string>();
        reverse = jsonBool( body, "reverse", false );
    }
    std::string subcmd = reverse ? "reverse" : "forward";
    std::vector<std::string> args;
    if ( !serial.empty() )
        args = { "-s", serial, subcmd, "--remove-all" };
    else
        args = { subcmd, "--remove-all" };
    auto j = adbExec( args );
    Server::sendJson( res, j );
}

static void adbShell( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    std::string serial, cmd;
    if ( body.is_object() ) {
        if ( body.contains( "serial" ) && body["serial"].is_string() )
            serial = body["serial"].get<std::string>();
        if ( body.contains( "cmd" ) && body["cmd"].is_string() )
            cmd = body["cmd"].get<std::string>();
    }
    if ( cmd.empty() )
        return Server::sendError( res, "缺少 cmd 参数", 400 );
    std::vector<std::string> args;
    if ( !serial.empty() )
        args = { "-s", serial, "shell", cmd };
    else
        args = { "shell", cmd };
    auto j = adbExec( args );
    Server::sendJson( res, j );
}

static void adbLogcat( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string serial = Server::queryParam( req, "serial" );
    std::string tag = Server::queryParam( req, "tag" );
    std::string level = Server::queryParam( req, "level" );
    std::string pid = Server::queryParam( req, "pid" );
    std::string package = Server::queryParam( req, "package" );
    std::string linesStr = Server::queryParam( req, "lines" );
    int lines = 200;
    if ( !linesStr.empty() ) {
        try { lines = std::stoi( linesStr ); } catch ( ... ) { lines = 200; }
        if ( lines <= 0 ) lines = 200;
        if ( lines > 5000 ) lines = 5000;
    }

    std::vector<std::string> args;
    if ( !serial.empty() )
        args.push_back( "-s" ), args.push_back( serial );

    args.push_back( "logcat" );
    args.push_back( "-d" );

    if ( lines > 0 )
        args.push_back( "-t" ), args.push_back( std::to_string( lines ) );

    if ( !pid.empty() )
        args.push_back( "--pid=" + pid );

    std::string formatFilter;
    if ( !tag.empty() && !level.empty() ) {
        formatFilter = tag + ":" + level;
    } else if ( !level.empty() ) {
        std::string lvl = level;
        if ( lvl.size() == 1 )
            lvl = std::string( 1, (char)toupper( lvl[0] ) );
        formatFilter = "*:" + lvl;
    } else if ( !tag.empty() ) {
        formatFilter = tag + ":V";
    }

    if ( !package.empty() && pid.empty() ) {
        std::vector<std::string> pidArgs;
        if ( !serial.empty() )
            pidArgs = { "-s", serial, "shell", "pidof", package };
        else
            pidArgs = { "shell", "pidof", package };
        auto pidResult = adbExec( pidArgs );
        if ( pidResult["success"].get<bool>() ) {
            std::string pkgPid = adbTrim( pidResult["output"].get<std::string>() );
            if ( !pkgPid.empty() )
                args.push_back( "--pid=" + pkgPid );
        }
    }

    if ( !formatFilter.empty() )
        args.push_back( formatFilter );

    auto j = adbExec( args );
    Server::sendJson( res, j );
}

static void adbLogcatClear( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    std::string serial;
    if ( body.is_object() && body.contains( "serial" ) && body["serial"].is_string() )
        serial = body["serial"].get<std::string>();
    std::vector<std::string> args;
    if ( !serial.empty() )
        args = { "-s", serial, "logcat", "-c" };
    else
        args = { "logcat", "-c" };
    auto j = adbExec( args );
    Server::sendJson( res, j );
}

void registerADBRoutes( httplib::Server &svr ) {
    svr.Get( "/api/local/adb/info", adbInfo );
    svr.Get( "/api/local/adb/devices", adbDevices );
    svr.Post( "/api/local/adb/connect", adbConnect );
    svr.Post( "/api/local/adb/disconnect", adbDisconnect );
    svr.Get( "/api/local/adb/forward/list", adbForwardList );
    svr.Post( "/api/local/adb/forward/add", adbForwardAdd );
    svr.Post( "/api/local/adb/forward/remove", adbForwardRemove );
    svr.Post( "/api/local/adb/forward/removeAll", adbForwardRemoveAll );
    svr.Post( "/api/local/adb/shell", adbShell );
    svr.Get( "/api/local/adb/logcat", adbLogcat );
    svr.Post( "/api/local/adb/logcat/clear", adbLogcatClear );
}
} // namespace routes::adb