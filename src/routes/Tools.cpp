#include "routes/Tools.h"
#include "qrcodegen.hpp"
#include "routes/LocalTools.h"

#define STB_IMAGE_IMPLEMENTATION
#define STB_IMAGE_WRITE_IMPLEMENTATION
#define STB_IMAGE_RESIZE2_IMPLEMENTATION
#include "stb_image.h"
#include "stb_image_write.h"
#include "stb_image_resize2.h"

namespace routes::tools {
struct ParsedUrl {
    std::string scheme;
    std::string host;
    int port;
    std::string path;
};

struct IpCacheEntry {
    Server::json data;
    std::time_t ts;
    std::string source;
};

struct IpApiSource {
    const char *name;
    const char *urlTpl;
};

static std::map<std::string, IpCacheEntry> g_ipCache;
static std::mutex g_ipCacheMutex;

namespace ico {

struct DibImage {
    int width;
    int height;
    std::vector<unsigned char> data;
};

static void writeU32LE( std::vector<unsigned char> &buf, size_t offset, uint32_t val ) {
    buf[offset] = static_cast<unsigned char>( val & 0xFF );
    buf[offset + 1] = static_cast<unsigned char>( ( val >> 8 ) & 0xFF );
    buf[offset + 2] = static_cast<unsigned char>( ( val >> 16 ) & 0xFF );
    buf[offset + 3] = static_cast<unsigned char>( ( val >> 24 ) & 0xFF );
}

static void writeU16LE( std::vector<unsigned char> &buf, size_t offset, uint16_t val ) {
    buf[offset] = static_cast<unsigned char>( val & 0xFF );
    buf[offset + 1] = static_cast<unsigned char>( ( val >> 8 ) & 0xFF );
}

std::vector<DibImage> createDibImages( const unsigned char *srcPixels,
                                       int srcWidth, int srcHeight,
                                       const std::vector<int> &sizes ) {
    std::vector<DibImage> result;
    for ( int sz : sizes ) {
        if ( sz <= 0 || sz > 256 )
            sz = 256;
        std::vector<unsigned char> scaledBuf( sz * sz * 4 );
        unsigned char *scaled = stbir_resize_uint8_linear(
            srcPixels, srcWidth, srcHeight, srcWidth * 4,
            scaledBuf.data(), sz, sz, sz * 4,
            STBIR_RGBA );
        if ( !scaled )
            continue;

        // ICO DIB: BITMAPINFOHEADER(40) + 颜色数据(BGRA, 自下而上) + AND掩码(1bpp, 每行按4字节对齐)
        size_t andMaskRowSize = ( ( sz + 31 ) / 32 ) * 4;
        size_t andMaskSize = andMaskRowSize * sz;
        size_t colorSize = static_cast<size_t>( sz ) * sz * 4;
        size_t dibSize = 40 + colorSize + andMaskSize;
        std::vector<unsigned char> dib( dibSize );
        memset( dib.data(), 0, dibSize );

        writeU32LE( dib, 0, 40 );
        writeU32LE( dib, 4, static_cast<uint32_t>( sz ) );
        writeU32LE( dib, 8, static_cast<uint32_t>( sz * 2 ) ); // biHeight翻倍: XOR掩码 + AND掩码
        writeU16LE( dib, 12, 1 );
        writeU16LE( dib, 14, 32 );
        writeU32LE( dib, 20, static_cast<uint32_t>( colorSize + andMaskSize ) );

        unsigned char *pixels = dib.data() + 40;
        for ( int y = 0; y < sz; ++y ) {
            unsigned char *dstRow = pixels + ( sz - 1 - y ) * sz * 4;
            const unsigned char *srcRow = scaledBuf.data() + y * sz * 4;
            for ( int x = 0; x < sz; ++x ) {
                dstRow[x * 4 + 0] = srcRow[x * 4 + 2];
                dstRow[x * 4 + 1] = srcRow[x * 4 + 1];
                dstRow[x * 4 + 2] = srcRow[x * 4 + 0];
                dstRow[x * 4 + 3] = srcRow[x * 4 + 3];
            }
        }
        result.push_back( { sz, sz, std::move( dib ) } );
    }
    return result;
}

std::vector<unsigned char> buildIcoFile( const std::vector<DibImage> &images ) {
    if ( images.empty() )
        return {};

    size_t headerSize = 6 + images.size() * 16;
    size_t totalSize = headerSize;
    for ( const auto &img : images ) {
        totalSize += img.data.size();
    }

    std::vector<unsigned char> ico;
    ico.reserve( totalSize );
    ico.resize( headerSize );

    size_t offset = headerSize;

    writeU16LE( ico, 0, 0 );
    writeU16LE( ico, 2, 1 );
    writeU16LE( ico, 4, static_cast<uint16_t>( images.size() ) );

    for ( size_t i = 0; i < images.size(); ++i ) {
        const auto &img = images[i];
        size_t entryOffset = 6 + i * 16;

        ico[entryOffset + 0] = ( img.width >= 256 ) ? 0 : static_cast<unsigned char>( img.width );
        ico[entryOffset + 1] = ( img.height >= 256 ) ? 0 : static_cast<unsigned char>( img.height );
        ico[entryOffset + 2] = 0;
        ico[entryOffset + 3] = 0;
        writeU16LE( ico, entryOffset + 4, 1 );
        writeU16LE( ico, entryOffset + 6, 32 );
        writeU32LE( ico, entryOffset + 8, static_cast<uint32_t>( img.data.size() ) );
        writeU32LE( ico, entryOffset + 12, static_cast<uint32_t>( offset ) );

        offset += img.data.size();
    }

    for ( const auto &img : images ) {
        ico.insert( ico.end(), img.data.begin(), img.data.end() );
    }

    return ico;
}

} // namespace ico

bool parseUrl( const std::string &url, ParsedUrl &out ) {
    static const std::regex re( R"(^([a-zA-Z][a-zA-Z0-9+.-]*)://([^/:]+)(?::(\d+))?(/.*)?$)" );
    std::smatch m;
    if ( !std::regex_match( url, m, re ) ) {
        static const std::regex re2( R"(^([^/:]+)(?::(\d+))?(/.*)?$)" );
        if ( !std::regex_match( url, m, re2 ) )
            return false;
        out.scheme = "http";
        out.host = m[1].str();
        out.port = m[2].matched ? std::stoi( m[2].str() ) : 80;
        out.path = m[3].matched ? m[3].str() : "/";
        return true;
    }
    out.scheme = m[1].str();
    std::transform( out.scheme.begin(), out.scheme.end(), out.scheme.begin(), ::tolower );
    out.host = m[2].str();
    if ( m[3].matched )
        out.port = std::stoi( m[3].str() );
    else
        out.port = ( out.scheme == "https" ) ? 443 : 80;
    out.path = m[4].matched ? m[4].str() : "/";
    return true;
}

bool isSensitivePort( int port ) {
    static const std::vector<int> blocked = {
        21, 22, 23, 25, 53, 69, 110, 111, 119, 123, 135, 137, 138, 139, 143,
        161, 162, 389, 445, 465, 514, 515, 587, 631, 636, 989, 990, 993, 995,
        1433, 1434, 1521, 3306, 3389, 5000, 5432, 5900, 6379, 8080, 8443, 8888,
        9200, 9300, 11211, 27017 };
    for ( int p : blocked )
        if ( port == p )
            return true;
    return false;
}

bool isUrlSafe( const std::string &url, std::string &err ) {
    ParsedUrl pu;
    if ( !parseUrl( url, pu ) ) {
        err = "URL格式无效";
        return false;
    }
    if ( pu.scheme != "http" && pu.scheme != "https" ) {
        err = "仅支持HTTP/HTTPS协议";
        return false;
    }
    if ( isSensitivePort( pu.port ) ) {
        err = "目标端口不被允许";
        return false;
    }
    return true;
}

void cacheIpInfo( const std::string &ip, const Server::json &data, const std::string &source ) {
    std::lock_guard<std::mutex> lk( g_ipCacheMutex );
    g_ipCache[ip] = { data, utils::nowTime(), source };
    if ( g_ipCache.size() > 200 ) {
        std::vector<std::pair<std::string, std::time_t>> v;
        for ( auto &kv : g_ipCache )
            v.push_back( { kv.first, kv.second.ts } );
        std::sort( v.begin(), v.end(),
                   []( auto &a, auto &b ) { return a.second < b.second; } );
        for ( size_t i = 0; i < 20 && i < v.size(); i++ )
            g_ipCache.erase( v[i].first );
    }
}

bool getCachedIpInfo( const std::string &ip, IpCacheEntry &out ) {
    std::lock_guard<std::mutex> lk( g_ipCacheMutex );
    auto it = g_ipCache.find( ip );
    if ( it == g_ipCache.end() )
        return false;
    if ( utils::nowTime() - it->second.ts > 3600 )
        return false;
    out = it->second;
    return true;
}

bool isValidIpv4( const std::string &ip ) {
    static const std::regex re( R"(^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$)" );
    return std::regex_match( ip, re );
}

bool fetchIpSource( const std::string &url, Server::json &result, std::string &err ) {
    ParsedUrl pu;
    if ( !parseUrl( url, pu ) ) {
        err = "URL解析失败";
        return false;
    }
    std::string schemeHostPort = pu.scheme + "://" + pu.host + ":" + std::to_string( pu.port );
    httplib::Client cli( schemeHostPort );
    cli.set_connection_timeout( 5, 0 );
    cli.set_read_timeout( 5, 0 );
    cli.set_default_headers( { { "User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                               { "Accept", "application/json, text/plain, */*" } } );
    auto res = cli.Get( pu.path.c_str() );
    if ( !res ) {
        err = "连接失败";
        return false;
    }
    if ( res->status >= 400 ) {
        err = "HTTP " + std::to_string( res->status );
        return false;
    }
    try {
        result = Server::json::parse( res->body );
        return true;
    } catch ( ... ) {
        std::string body = res->body;
        size_t s = body.find( '{' );
        size_t e = body.rfind( '}' );
        if ( s != std::string::npos && e != std::string::npos && e > s ) {
            try {
                result = Server::json::parse( body.substr( s, e - s + 1 ) );
                return true;
            } catch ( ... ) {
            }
        }
        err = "响应不是有效的JSON";
        return false;
    }
}

// L/M/Q/H 字符串 -> QrCode::Ecc；未识别回退 MEDIUM
qrcodegen::QrCode::Ecc parseEcc( const std::string &s ) {
    if ( s.size() == 1 ) {
        switch ( s[0] ) {
        case 'L':
        case 'l':
            return qrcodegen::QrCode::Ecc::LOW;
        case 'Q':
        case 'q':
            return qrcodegen::QrCode::Ecc::QUARTILE;
        case 'H':
        case 'h':
            return qrcodegen::QrCode::Ecc::HIGH;
        default:
            break;
        }
    }
    return qrcodegen::QrCode::Ecc::MEDIUM;
}

std::string generateQrSvg( const std::string &text, int scale, int border, qrcodegen::QrCode::Ecc ecc ) {
    using namespace qrcodegen;
    QrCode qr = QrCode::encodeText( text.c_str(), ecc );
    const int dim = ( qr.getSize() + border * 2 ) * scale;
    std::ostringstream ss;
    ss << "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
       << "<svg xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\""
       << " width=\"" << dim << "\" height=\"" << dim << "\""
       << " viewBox=\"0 0 " << dim << " " << dim << "\""
       << " shape-rendering=\"crispEdges\">"
       << "<rect width=\"" << dim << "\" height=\"" << dim << "\" fill=\"#ffffff\"/>"
       << "<path fill=\"#000000\" d=\"";
    for ( int y = 0; y < qr.getSize(); y++ ) {
        for ( int x = 0; x < qr.getSize(); x++ ) {
            if ( qr.getModule( x, y ) ) {
                const int px = ( x + border ) * scale;
                const int py = ( y + border ) * scale;
                ss << "M" << px << "," << py << "h" << scale << "v" << scale << "h-" << scale << "z";
            }
        }
    }
    ss << "\"/></svg>";
    return ss.str();
}

std::string generateQrSvg( const std::string &text, int scale, int border ) {
    using namespace qrcodegen;
    return generateQrSvg( text, scale, border, QrCode::Ecc::MEDIUM );
}

void ipLookup( const httplib::Request &req, httplib::Response &res ) {
    std::string ip = Server::queryParam( req, "ip" );
    std::string source = Server::queryParam( req, "source" );
    bool checkSelf = ip.empty() || ip == "self";
    LOG_DEBUG << "IP查询 请求IP=" << ip << " source=" << ( source.empty() ? "auto" : source ) << " requestType=" << ( checkSelf ? "self" : "query" );

    std::string clientIp = req.remote_addr;
    if ( checkSelf ) {
        ip = clientIp;
        if ( ip == "127.0.0.1" || ip == "::1" || ip.empty() ) {
            Server::sendJson( res, {
                                       { "data",
                                         { { "ip", "无法获取客户端IP" },
                                           { "country", "未知" },
                                           { "region", "未知" },
                                           { "city", "未知" },
                                           { "isp", "未知" } } },
                                       { "source", "本地分析" },
                                       { "requestType", "self" },
                                   } );
            return;
        }
    } else {
        if ( !isValidIpv4( ip ) ) {
            Server::sendError( res, "无效的IP地址格式", 400 );
            return;
        }
    }

    if ( ip == "127.0.0.1" || ip.rfind( "192.168.", 0 ) == 0 ||
         ip.rfind( "10.", 0 ) == 0 || ip.rfind( "172.", 0 ) == 0 ) {
        int b = 0;
        if ( ip.rfind( "172.", 0 ) == 0 ) {
            try {
                b = std::stoi( ip.substr( 4, ip.find( '.', 4 ) - 4 ) );
            } catch ( ... ) {
            }
            if ( b >= 16 && b <= 31 ) {
                Server::sendJson( res, { { "data", { { "ip", ip }, { "country", "本地网络" }, { "region", "私有网络(B类)" }, { "city", "内部网络" }, { "isp", "本地连接" } } },
                                         { "source", "本地分析" },
                                         { "requestType", checkSelf ? "self" : "query" } } );
                return;
            }
        }
        std::string region = "私有网络";
        if ( ip == "127.0.0.1" )
            region = "环回地址";
        else if ( ip.rfind( "192.168.", 0 ) == 0 )
            region = "私有网络(C类)";
        else if ( ip.rfind( "10.", 0 ) == 0 )
            region = "私有网络(A类)";
        Server::sendJson( res, { { "data", { { "ip", ip }, { "country", "本地网络" }, { "region", region }, { "city", "内部网络" }, { "isp", "本地连接" } } },
                                 { "source", "本地分析" },
                                 { "requestType", checkSelf ? "self" : "query" } } );
        return;
    }

    IpCacheEntry cached;
    if ( getCachedIpInfo( ip, cached ) ) {
        LOG_DEBUG << "IP查询命中缓存 ip=" << ip << " source=" << cached.source;
        Server::sendJson( res, { { "data", cached.data },
                                 { "source", cached.source },
                                 { "requestType", checkSelf ? "self" : "query" },
                                 { "cached", true } } );
        return;
    }

    static const std::vector<IpApiSource> sources = {
        { "ip-api.com", "http://ip-api.com/json/{ip}?lang=zh-CN&fields=status,country,regionName,city,isp,org,as,query,lat,lon,timezone" },
        { "ip-api.cn", "http://ip-api.com/json/{ip}?lang=zh-CN" } };

    std::vector<IpApiSource> trySources;
    if ( !source.empty() && source != "auto" ) {
        for ( auto &s : sources )
            if ( source == s.name ) {
                trySources.push_back( s );
                break;
            }
        if ( trySources.empty() ) {
            Server::sendError( res, "指定的API源不存在或当前不可用", 400 );
            return;
        }
    } else {
        trySources = sources;
    }

    for ( auto &s : trySources ) {
        std::string url = s.urlTpl;
        size_t pos = url.find( "{ip}" );
        if ( pos != std::string::npos )
            url.replace( pos, 4, ip );
        Server::json data;
        std::string err;
        if ( fetchIpSource( url, data, err ) ) {
            cacheIpInfo( ip, data, s.name );
            LOG_INFO << "IP查询成功 ip=" << ip << " source=" << s.name;
            Server::sendJson( res, { { "data", data },
                                     { "source", s.name },
                                     { "requestType", checkSelf ? "self" : "query" } } );
            return;
        } else {
            LOG_WARN << "IP查询源 " << s.name << " 失败: " << err;
        }
    }

    LOG_WARN << "所有IP查询源均失败 ip=" << ip << "，使用回退数据";
    Server::json fallback = { { "ip", ip }, { "country", "未知" }, { "region", "未知" }, { "city", "未知" }, { "isp", "未知" } };
    cacheIpInfo( ip, fallback, "解析失败" );
    Server::sendJson( res, { { "data", fallback },
                             { "source", "解析失败" },
                             { "requestType", checkSelf ? "self" : "query" } } );
}

void httpProxy( const httplib::Request &req, httplib::Response &res ) {
    Server::json body = Server::parseBody( req );
    if ( body.is_null() ) {
        Server::sendError( res, "请求体不是有效的JSON", 400 );
        return;
    }
    std::string url = utils::jsonStringValue( body, "url" );
    std::string method = utils::jsonStringValue( body, "method" );
    if ( url.empty() ) {
        Server::sendError( res, "缺少url参数", 400 );
        return;
    }
    if ( method.empty() )
        method = "GET";
    std::transform( method.begin(), method.end(), method.begin(), ::toupper );

    static const std::vector<std::string> allowed = {
        "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS" };
    bool ok = false;
    for ( auto &m : allowed )
        if ( method == m ) {
            ok = true;
            break;
        }
    if ( !ok ) {
        Server::sendError( res, "不支持的HTTP方法", 400 );
        return;
    }

    std::string err;
    if ( !isUrlSafe( url, err ) ) {
        LOG_WARN << "代理请求被阻止 url=" << url << " reason=" << err;
        Server::sendError( res, err, 403 );
        return;
    }

    ParsedUrl pu;
    parseUrl( url, pu );
    LOG_DEBUG << "HTTP代理请求 method=" << method << " scheme=" << pu.scheme << " host=" << pu.host << " port=" << pu.port << " path=" << pu.path;

    std::string reqBody;
    if ( method != "GET" && method != "HEAD" ) {
        if ( body.contains( "body" ) && body["body"].is_string() ) {
            reqBody = body["body"].get<std::string>();
            if ( reqBody.size() > 2 * 1024 * 1024 ) {
                Server::sendError( res, "请求体超过2MB限制", 413 );
                return;
            }
        }
    }

    httplib::Headers headers;
    headers.emplace( "User-Agent", "shared-clipboard-proxy/1.0" );
    if ( body.contains( "headers" ) && body["headers"].is_object() ) {
        for ( auto it = body["headers"].begin(); it != body["headers"].end(); ++it ) {
            std::string k = it.key();
            std::string lower = k;
            std::transform( lower.begin(), lower.end(), lower.begin(), ::tolower );
            if ( lower == "host" || lower == "origin" || lower == "referer" ||
                 lower == "cookie" || lower == "authorization" )
                continue;
            if ( it.value().is_string() )
                headers.emplace( k, it.value().get<std::string>() );
        }
    }

    std::string schemeHostPort = pu.scheme + "://" + pu.host + ":" + std::to_string( pu.port );
    httplib::Client cli( schemeHostPort );
    cli.set_connection_timeout( 10, 0 );
    cli.set_read_timeout( 15, 0 );
    cli.set_default_headers( headers );

    auto start = std::chrono::steady_clock::now();
    httplib::Result result;
    if ( method == "GET" )
        result = cli.Get( pu.path.c_str() );
    else if ( method == "HEAD" )
        result = cli.Head( pu.path.c_str() );
    else if ( method == "POST" )
        result = cli.Post( pu.path.c_str(), reqBody, "application/json" );
    else if ( method == "PUT" )
        result = cli.Put( pu.path.c_str(), reqBody, "application/json" );
    else if ( method == "DELETE" ) {
        if ( reqBody.empty() )
            result = cli.Delete( pu.path.c_str() );
        else
            result = cli.Delete( pu.path.c_str(), reqBody, "application/json" );
    } else if ( method == "PATCH" )
        result = cli.Patch( pu.path.c_str(), reqBody, "application/json" );
    else if ( method == "OPTIONS" )
        result = cli.Options( pu.path.c_str() );

    auto end = std::chrono::steady_clock::now();
    int ms = static_cast<int>( std::chrono::duration_cast<std::chrono::milliseconds>( end - start ).count() );

    if ( !result ) {
        LOG_WARN << "代理请求失败 method=" << method << " url=" << url << " 耗时=" << ms << "ms reason=连接超时或失败";
        Server::sendError( res, "无法连接到目标服务器或请求超时", 502 );
        return;
    }

    std::string respBody = result->body;
    if ( respBody.size() > 5 * 1024 * 1024 ) {
        respBody = respBody.substr( 0, 5 * 1024 * 1024 );
    }

    Server::json respHeaders = Server::json::object();
    for ( auto &h : result->headers ) {
        if ( respHeaders.contains( h.first ) ) {
            respHeaders[h.first] = respHeaders[h.first].get<std::string>() + ", " + h.second;
        } else {
            respHeaders[h.first] = h.second;
        }
    }

    Server::json respData;
    std::string ct;
    auto ctIt = result->headers.find( "content-type" );
    if ( ctIt != result->headers.end() )
        ct = ctIt->second;
    bool isJson = ct.find( "application/json" ) != std::string::npos || ct.find( "text/json" ) != std::string::npos;
    if ( isJson ) {
        try {
            respData = Server::json::parse( respBody );
        } catch ( ... ) {
            respData = respBody;
        }
    } else {
        respData = respBody;
    }

    LOG_INFO << "代理请求完成 method=" << method << " status=" << result->status << " 耗时=" << ms << "ms 响应大小=" << respBody.size() << " bytes url=" << url;
    Server::json resp = {
        { "status", result->status },
        { "statusText", httplib::status_message( result->status ) },
        { "headers", respHeaders },
        { "data", respData },
        { "time", ms },
        { "size", static_cast<long long>( respBody.size() ) } };
    Server::sendJson( res, resp );
}

void qrcode( const httplib::Request &req, httplib::Response &res ) {
    std::string text = req.get_param_value( "text" );
    if ( text.empty() ) {
        Server::sendJson( res, { { "success", false }, { "error", "Missing text parameter" } }, 400 );
        return;
    }
    std::string format = req.has_param( "format" ) ? req.get_param_value( "format" ) : "svg";
    std::string eccStr = req.has_param( "ecc" ) ? req.get_param_value( "ecc" ) : "M";
    qrcodegen::QrCode::Ecc ecc = parseEcc( eccStr );
    LOG_DEBUG << "生成二维码 format=" << format << " ecc=" << eccStr << " 文本长度=" << text.size();
    try {
        using namespace qrcodegen;
        QrCode qr = QrCode::encodeText( text.c_str(), ecc );
        if ( format == "matrix" ) {
            Server::json matrix = Server::json::array();
            for ( int y = 0; y < qr.getSize(); y++ ) {
                Server::json row = Server::json::array();
                for ( int x = 0; x < qr.getSize(); x++ ) {
                    row.push_back( qr.getModule( x, y ) );
                }
                matrix.push_back( row );
            }
            LOG_DEBUG << "二维码生成成功 format=matrix size=" << qr.getSize();
            Server::sendJson( res, {
                                       { "success", true },
                                       { "size", qr.getSize() },
                                       { "matrix", matrix },
                                   } );
        } else {
            std::string svg = generateQrSvg( text, 10, 4, ecc );
            LOG_DEBUG << "二维码生成成功 format=svg size=" << svg.size() << " bytes";
            res.set_content( svg, "image/svg+xml" );
        }
    } catch ( const std::exception &e ) {
        LOG_ERROR << "二维码生成异常: " << e.what();
        Server::sendJson( res, {
                                   { "success", false },
                                   { "error", e.what() },
                               },
                          500 );
    }
}

void imageConvert( const httplib::Request &req, httplib::Response &res ) {
    if ( !req.is_multipart_form_data() ) {
        Server::sendError( res, "需要multipart上传", 400 );
        return;
    }
    if ( !req.form.has_file( "file" ) ) {
        Server::sendError( res, "缺少file字段", 400 );
        return;
    }
    auto file = req.form.get_file( "file" );
    std::string filename = file.filename;
    LOG_DEBUG << "图片转换请求 filename=" << filename << " size=" << file.content.size();

    std::string targetFormat = "png";
    if ( req.form.has_field( "format" ) ) {
        targetFormat = req.form.get_field( "format" );
        std::transform( targetFormat.begin(), targetFormat.end(), targetFormat.begin(), ::tolower );
    }

    int quality = 90;
    if ( req.form.has_field( "quality" ) ) {
        try {
            quality = std::stoi( req.form.get_field( "quality" ) );
            quality = std::max( 1, std::min( 100, quality ) );
        } catch ( ... ) {
            quality = 90;
        }
    }

    std::vector<int> icoSizes;
    if ( req.form.has_field( "ico_sizes" ) ) {
        std::string sizesStr = req.form.get_field( "ico_sizes" );
        std::stringstream ss( sizesStr );
        std::string token;
        while ( std::getline( ss, token, ',' ) ) {
            try {
                icoSizes.push_back( std::stoi( token ) );
            } catch ( ... ) {
            }
        }
    }

    static const std::vector<std::string> supported = { "png", "jpg", "bmp", "ico" };
    if ( std::find( supported.begin(), supported.end(), targetFormat ) == supported.end() ) {
        Server::sendError( res, "不支持的目标格式，仅支持: png, jpg, bmp, ico", 400 );
        return;
    }

    int width, height, channels;
    unsigned char *imageData = stbi_load_from_memory(
        reinterpret_cast<const stbi_uc *>( file.content.data() ),
        static_cast<int>( file.content.size() ),
        &width, &height, &channels, 4 );

    if ( !imageData ) {
        LOG_WARN << "图片解码失败 filename=" << filename;
        Server::sendError( res, "无法解码图片文件，可能格式不支持或文件已损坏", 400 );
        return;
    }

    LOG_DEBUG << "图片解码成功 width=" << width << " height=" << height << " channels=" << channels << " 目标格式=" << targetFormat;

    std::vector<unsigned char> outputBuffer;
    int outputLen = 0;

    if ( targetFormat == "png" ) {
        int len = 0;
        unsigned char *pngData = stbi_write_png_to_mem(
            imageData, width * 4, width, height, 4, &len );
        if ( pngData && len > 0 ) {
            outputBuffer.assign( pngData, pngData + len );
            outputLen = len;
            STBIW_FREE( pngData );
        }
    } else if ( targetFormat == "jpg" ) {
        auto callback = []( void *context, void *data, int size ) {
            std::vector<unsigned char> *buff = static_cast<std::vector<unsigned char> *>( context );
            buff->insert( buff->end(),
                          static_cast<unsigned char *>( data ),
                          static_cast<unsigned char *>( data ) + size );
        };
        outputLen = stbi_write_jpg_to_func( callback, &outputBuffer, width, height, 4, imageData, quality );
    } else if ( targetFormat == "bmp" ) {
        auto callback = []( void *context, void *data, int size ) {
            std::vector<unsigned char> *buff = static_cast<std::vector<unsigned char> *>( context );
            buff->insert( buff->end(),
                          static_cast<unsigned char *>( data ),
                          static_cast<unsigned char *>( data ) + size );
        };
        outputLen = stbi_write_bmp_to_func( callback, &outputBuffer, width, height, 4, imageData );
    } else if ( targetFormat == "ico" ) {
        if ( icoSizes.empty() ) {
            icoSizes = { 256, 128, 96, 72, 64, 48, 32, 16 };
        }
        for ( auto &s : icoSizes ) {
            if ( s <= 0 )
                s = 256;
            else if ( s > 256 )
                s = 256;
        }
        std::sort( icoSizes.begin(), icoSizes.end(), std::greater<int>() );
        icoSizes.erase( std::unique( icoSizes.begin(), icoSizes.end() ), icoSizes.end() );

        auto dibImages = ico::createDibImages( imageData, width, height, icoSizes );
        if ( dibImages.empty() ) {
            Server::sendError( res, "ICO编码失败：无法生成任何尺寸", 500 );
            stbi_image_free( imageData );
            return;
        }

        outputBuffer = ico::buildIcoFile( dibImages );
        outputLen = static_cast<int>( outputBuffer.size() );
    }

    stbi_image_free( imageData );

    if ( outputLen <= 0 ) {
        LOG_ERROR << "图片编码失败 targetFormat=" << targetFormat;
        Server::sendError( res, "图片编码失败", 500 );
        return;
    }

    std::string mimeType;
    if ( targetFormat == "png" )
        mimeType = "image/png";
    else if ( targetFormat == "jpg" )
        mimeType = "image/jpeg";
    else if ( targetFormat == "ico" )
        mimeType = "image/x-icon";
    else
        mimeType = "image/bmp";

    std::string ext = targetFormat;

    size_t dotPos = filename.rfind( '.' );
    std::string baseName = ( dotPos != std::string::npos ) ? filename.substr( 0, dotPos ) : filename;
    std::string newFilename = baseName + "." + ext;

    LOG_INFO << "图片转换完成 original=" << filename << " size=" << file.content.size()
             << " converted=" << newFilename << " size=" << outputBuffer.size();

    res.set_content( std::string( reinterpret_cast<char *>( outputBuffer.data() ), outputBuffer.size() ), mimeType );
    res.set_header( "Content-Disposition", "attachment; filename=\"" + newFilename + "\"" );
}

void toolCatalog( const httplib::Request &req, httplib::Response &res ) {
    const bool isLocal = Server::isLocalhost( req );

    Server::json categories = Server::json::array();
    categories.push_back( { { "code", "all" }, { "name", "全部工具" } } );
    categories.push_back( { { "code", "common" }, { "name", "常用工具" } } );
    categories.push_back( { { "code", "json" }, { "name", "JSON工具" } } );
    categories.push_back( { { "code", "encoding" }, { "name", "编码加密" } } );
    categories.push_back( { { "code", "network" }, { "name", "网络工具" } } );
    categories.push_back( { { "code", "datetime" }, { "name", "时间日期" } } );
    categories.push_back( { { "code", "code" }, { "name", "代码工具" } } );
    categories.push_back( { { "code", "text" }, { "name", "文本处理" } } );
    categories.push_back( { { "code", "image" }, { "name", "图像工具" } } );
    categories.push_back( { { "code", "frontend" }, { "name", "前端开发" } } );
    categories.push_back( { { "code", "pdf" }, { "name", "PDF工具" } } );
    categories.push_back( { { "code", "math" }, { "name", "数学计算" } } );
    categories.push_back( { { "code", "crypto" }, { "name", "加密工具" } } );
    if ( isLocal ) {
        categories.push_back( { { "code", "local" }, { "name", "本地工具" } } );
    }

    Server::json tools = Server::json::array();

    auto pushTool = [&tools]( const char *code, const char *icon, std::vector<const char *> cats,
                              const char *title, const char *desc,
                              std::vector<const char *> keywords, const char *url ) {
        Server::json jcats = Server::json::array();
        for ( auto c : cats )
            jcats.push_back( c );
        Server::json jkws = Server::json::array();
        for ( auto k : keywords )
            jkws.push_back( k );
        tools.push_back( { { "code", code },
                           { "icon", Server::staticResourcePath( icon, "/tools/icon/", true ) },
                           { "cats", jcats },
                           { "title", title },
                           { "desc", desc },
                           { "keywords", jkws },
                           { "url", url ? url : "" } } );
    };

    // ===== Online tools (isLocal=false) =====
    pushTool( "json_formatter", "json_formatter.svg", { "common", "json" }, "JSON格式化", "JSON美化、压缩、校验与路径查询",
              { "json", "格式化", "美化", "压缩", "校验", "formatter" }, "/tools/json_formatter.html" );

    pushTool( "http_tester", "http_tester.svg", { "common", "network" }, "HTTP接口测试", "发送GET/POST等请求,测试API接口",
              { "http", "api", "请求", "postman", "接口测试" }, "/tools/http_tester.html" );

    pushTool( "timestamp_converter", "timestamp_converter.svg", { "common", "datetime" }, "时间戳转换", "Unix时间戳与日期时间互转",
              { "时间戳", "timestamp", "unix", "时间", "日期" }, "/tools/timestamp_converter.html" );

    pushTool( "encoding_converter", "encoding_converter.svg", { "common", "encoding" }, "编码转换", "Base64/URL/Unicode/Hex多编码互转",
              { "编码", "base64", "url", "unicode", "hex", "解码" }, "/tools/encoding_converter.html" );

    pushTool( "ip_lookup", "ip_lookup.svg", { "common", "network" }, "IP地址查询", "查询IP归属地、运营商信息",
              { "ip", "地址", "归属地", "运营商", "查询" }, "/tools/ip_lookup.html" );

    pushTool( "image_compressor", "image_compressor.svg", { "common", "image" }, "图片压缩", "在线压缩JPEG/PNG图片",
              { "图片", "压缩", "image", "compress" }, "/tools/image_compressor.html" );

    pushTool( "qrcode_generator", "qrcode_generator.svg", { "common", "image" }, "二维码生成", "生成文本/URL二维码",
              { "二维码", "qrcode", "扫码" }, "/tools/qrcode_generator.html" );

    pushTool( "icon_designer", "icon_designer.svg", { "common", "image" }, "图标设计", "在线设计App图标和favicon",
              { "图标", "icon", "logo", "favicon" }, "/tools/icon_designer.html" );

    pushTool( "json_editor", "json_editor.svg", { "common", "json" }, "JSON编辑器", "可视化编辑JSON数据",
              { "json", "编辑器", "editor" }, "/tools/json_editor.html" );

    pushTool( "json_converter", "json_converter.svg", { "json" }, "JSON转换", "JSON与XML/CSV/YAML互转",
              { "json", "xml", "csv", "yaml", "转换" }, "/tools/json_converter.html" );

    pushTool( "regex_tester", "regex_tester.svg", { "text" }, "正则表达式测试", "在线测试正则表达式匹配",
              { "正则", "regex", "表达式" }, "/tools/regex_tester.html" );

    pushTool( "crypto_tools", "crypto_tools.svg", { "encoding" }, "加密解密工具", "MD5/SHA/AES/DES哈希与加密",
              { "加密", "解密", "md5", "sha", "aes", "hash" }, "/tools/crypto_tools.html" );

    pushTool( "url_encoder", "url_encoder.svg", { "encoding" }, "URL编码解码", "URL编码与解码工具",
              { "url", "编码", "解码", "urlencode" }, "/tools/url_encoder.html" );

    pushTool( "unicode_converter", "unicode_converter.svg", { "encoding" }, "Unicode转换", "中文与Unicode编码互转",
              { "unicode", "中文", "编码" }, "/tools/unicode_converter.html" );

    pushTool( "charset_reference", "charset_reference.svg", { "encoding", "common" }, "编码对照表", "ASCII码表对照查询，Unicode码点与字符互查，UTF-8/UTF-16编码详情",
              { "ascii", "unicode", "码表", "编码", "对照", "UTF-8", "UTF-16", "码点" }, "/tools/charset_reference.html" );

    pushTool( "jwt_decoder", "jwt_decoder.svg", { "encoding" }, "JWT解析", "解析JWT令牌的Header与Payload",
              { "jwt", "token", "令牌", "解析" }, "/tools/jwt_decoder.html" );

    pushTool( "number_base_converter", "number_base_converter.svg", { "encoding" }, "进制转换", "二/八/十/十六进制互转",
              { "进制", "二进制", "十六进制", "binary", "hex" }, "/tools/number_base_converter.html" );

    pushTool( "base64_to_image", "base64_to_image.svg", { "image", "encoding" }, "Base64图片互转", "Base64与图片互转",
              { "base64", "图片", "image" }, "/tools/base64_to_image.html" );

    pushTool( "date_calculator", "date_calculator.svg", { "datetime" }, "日期计算器", "计算两个日期差值与加减",
              { "日期", "计算", "差值", "天数" }, "/tools/date_calculator.html" );

    pushTool( "timezone_converter", "timezone_converter.svg", { "datetime" }, "时区转换", "世界各时区时间转换",
              { "时区", "timezone", "UTC", "GMT" }, "/tools/timezone_converter.html" );

    pushTool( "cron_generator", "cron_generator.svg", { "datetime" }, "Cron表达式生成", "生成与解析Cron定时表达式",
              { "cron", "crontab", "定时", "调度" }, "/tools/cron_generator.html" );

    pushTool( "text_escape", "text_escape.svg", { "text", "encoding" }, "文本转义与反转义", "JavaScript/JSON/HTML/CSS/SQL/CSV/正则转义与反转义",
              { "转义", "反转义", "escape", "unescape", "编码", "解码" }, "/tools/text_escape.html" );

    pushTool( "text_counter", "text_counter.svg", { "text" }, "字数统计", "统计字符、单词、行数等",
              { "字数", "统计", "字符", "行数" }, "/tools/text_counter.html" );

    pushTool( "text_space_stripper", "text_space_stripper.svg", { "text" }, "去空格工具", "去除文本中的空格与换行",
              { "空格", "换行", "trim", "strip" }, "/tools/text_space_stripper.html" );

    pushTool( "html_markdown_converter", "html_markdown_converter.svg", { "code", "text" }, "HTML与Markdown互转", "HTML与Markdown格式互转",
              { "html", "markdown", "md", "转换" }, "/tools/html_markdown_converter.html" );

    pushTool( "code_formatter", "code_formatter.svg", { "code" }, "代码格式化", "HTML/CSS/JS/SQL代码美化",
              { "代码", "格式化", "美化", "formatter" }, "/tools/code_formatter.html" );

    pushTool( "yml_properties_converter", "yml_properties_converter.svg", { "code" }, "YML与Properties互转", "YAML与Properties配置互转",
              { "yml", "yaml", "properties", "配置" }, "/tools/yml_properties_converter.html" );

    pushTool( "password_generator", "password_generator.svg", { "code" }, "密码生成器", "生成随机强密码",
              { "密码", "password", "随机", "生成" }, "/tools/password_generator.html" );

    pushTool( "color_tools", "color_tools.svg", { "frontend" }, "颜色工具", "RGB/HEX/HSL颜色转换与调色",
              { "颜色", "color", "rgb", "hex", "hsl" }, "/tools/color_tools.html" );

    pushTool( "css_gradient_generator", "css_gradient_generator.svg", { "frontend" }, "CSS渐变生成器", "生成线性/径向CSS渐变",
              { "css", "渐变", "gradient", "背景" }, "/tools/css_gradient_generator.html" );

    pushTool( "image_converter", "image_converter.svg", { "image" }, "图片格式转换", "使用stb_image库转换图片格式",
              { "图片", "转换", "格式", "png", "jpg", "bmp", "image", "converter" }, "/tools/image_converter.html" );

    pushTool( "image_ocr", "image_ocr.svg", { "image", "common" }, "图片OCR识别", "基于AI识别图片中的文字",
              { "图片", "ocr", "文字识别", "光标识别", "rapidocr", "文字提取" }, "/tools/image_ocr.html" );

    pushTool( "image_watermark", "image_watermark.svg", { "image" }, "图片水印", "为图片添加文字水印",
              { "图片", "水印", "watermark" }, "/tools/image_watermark.html" );

    pushTool( "pdf_manager", "pdf_manager.svg", { "pdf", "common" }, "PDF合并分割", "合并、分割、提取、旋转PDF文件",
              { "pdf", "合并", "分割", "提取", "旋转", "merger" }, "/tools/pdf_manager.html" );

    pushTool( "pdf_compressor", "pdf_compressor.svg", { "pdf", "common" }, "PDF压缩", "压缩PDF文件大小",
              { "pdf", "压缩", "compress" }, "/tools/pdf_compressor.html" );

    pushTool( "pdf_watermark", "pdf_watermark.svg", { "pdf" }, "PDF水印", "为PDF添加文字水印",
              { "pdf", "水印", "watermark" }, "/tools/pdf_watermark.html" );

    pushTool( "uuid_generator", "uuid_generator.svg", { "encoding", "common" }, "UUID生成器", "生成UUID v1/v4/v7与ULID",
              { "uuid", "ulid", "guid", "唯一id", "random" }, "/tools/uuid_generator.html" );

    pushTool( "text_to_binary", "text_to_binary.svg", { "encoding" }, "文本与二进制互转", "文本与二进制字符串互转",
              { "二进制", "binary", "编码", "0和1" }, "/tools/text_to_binary.html" );

    pushTool( "basic_auth_generator", "basic_auth_generator.svg", { "encoding", "network" }, "Basic Auth生成器", "生成HTTP Basic Auth认证头",
              { "basic", "auth", "认证", "base64", "header" }, "/tools/basic_auth_generator.html" );

    pushTool( "html_entities", "html_entities.svg", { "encoding", "frontend" }, "HTML实体编解码", "HTML实体编码与解码",
              { "html", "实体", "entities", "编码", "解码" }, "/tools/html_entities.html" );

    pushTool( "token_generator", "token_generator.svg", { "encoding", "crypto" }, "Token生成器", "生成随机Token、UUID、JWT格式等",
              { "token", "随机", "uuid", "jwt", "api key" }, "/tools/token_generator.html" );

    pushTool( "lorem_ipsum_generator", "lorem_ipsum_generator.svg", { "text" }, "Lorem Ipsum生成器", "生成占位用拉丁文假文本",
              { "lorem", "ipsum", "占位", "假文", "dummy" }, "/tools/lorem_ipsum_generator.html" );

    pushTool( "case_converter", "case_converter.svg", { "text" }, "大小写转换", "多种命名风格互转(camel/snake/kebab等)",
              { "大小写", "case", "camel", "snake", "kebab", "pascal" }, "/tools/case_converter.html" );

    pushTool( "text_to_nato_alphabet", "text_to_nato_alphabet.svg", { "text" }, "北约音标字母", "字母转北约音标与摩斯电码",
              { "nato", "音标", "摩斯", "morse", "字母" }, "/tools/text_to_nato_alphabet.html" );

    pushTool( "slugify_string", "slugify_string.svg", { "text" }, "URL Slug生成器", "将文本转为URL友好的slug",
              { "slug", "url", "seo", "拼音", "permalink" }, "/tools/slugify_string.html" );

    pushTool( "list_converter", "list_converter.svg", { "text" }, "列表转换器", "列表去重、排序、添加前后缀等",
              { "列表", "list", "去重", "排序", "转换" }, "/tools/list_converter.html" );

    pushTool( "numeronym_generator", "numeronym_generator.svg", { "text" }, "数字缩写生成器", "生成i18n、k8s等数字缩写",
              { "缩写", "numeronym", "i18n", "k8s" }, "/tools/numeronym_generator.html" );

    pushTool( "text_diff", "text_diff.svg", { "text" }, "文本对比", "逐行对比两段文本的差异",
              { "diff", "对比", "差异", "compare" }, "/tools/text_diff.html" );

    pushTool( "roman_numeral_converter", "roman_numeral_converter.svg", { "text", "math" }, "罗马数字转换", "阿拉伯数字与罗马数字互转",
              { "罗马", "roman", "数字", "转换" }, "/tools/roman_numeral_converter.html" );

    pushTool( "math_evaluator", "math_evaluator.svg", { "math", "code" }, "数学表达式计算", "安全计算数学表达式",
              { "数学", "计算", "表达式", "math", "evaluate", "计算器" }, "/tools/math_evaluator.html" );

    pushTool( "percentage_calculator", "percentage_calculator.svg", { "math" }, "百分比计算器", "多种百分比计算模式",
              { "百分比", "percent", "计算", "增减" }, "/tools/percentage_calculator.html" );

    pushTool( "temperature_converter", "temperature_converter.svg", { "math", "datetime" }, "温度转换", "摄氏/华氏/开尔文/兰氏互转",
              { "温度", "temperature", "摄氏", "华氏", "开尔文" }, "/tools/temperature_converter.html" );

    pushTool( "chmod_calculator", "chmod_calculator.svg", { "code" }, "Chmod计算器", "Linux文件权限计算器",
              { "chmod", "权限", "linux", "rwx", "octal" }, "/tools/chmod_calculator.html" );

    pushTool( "mime_types", "mime_types.svg", { "code" }, "MIME类型查询", "文件扩展名与MIME类型对照表",
              { "mime", "类型", "扩展名", "content-type", "文件" }, "/tools/mime_types.html" );

    pushTool( "http_status_codes", "http_status_codes.svg", { "network" }, "HTTP状态码查询", "HTTP状态码含义速查表",
              { "http", "状态码", "status", "code", "响应" }, "/tools/http_status_codes.html" );

    pushTool( "mac_address_generator", "mac_address_generator.svg", { "network" }, "MAC地址生成器", "生成随机MAC地址",
              { "mac", "地址", "随机", "网卡", "oui" }, "/tools/mac_address_generator.html" );

    pushTool( "random_port_generator", "random_port_generator.svg", { "network" }, "随机端口生成器", "生成随机网络端口号",
              { "端口", "port", "随机", "random" }, "/tools/random_port_generator.html" );

    pushTool( "ipv4_subnet_calculator", "ipv4_subnet_calculator.svg", { "network" }, "IPv4子网计算器", "CIDR子网掩码与主机范围计算",
              { "ipv4", "子网", "subnet", "cidr", "掩码", "mask" }, "/tools/ipv4_subnet_calculator.html" );

    pushTool( "url_parser", "url_parser.svg", { "network", "frontend" }, "URL解析器", "解析URL各组件和查询参数",
              { "url", "解析", "query", "params", "components" }, "/tools/url_parser.html" );

    pushTool( "device_information", "device_information.svg", { "network", "common" }, "设备信息", "查看浏览器和设备详细信息",
              { "设备", "浏览器", "user agent", "屏幕", "系统" }, "/tools/device_information.html" );

    pushTool( "meta_tag_generator", "meta_tag_generator.svg", { "frontend" }, "元标签生成器", "生成HTML元标签和OG标签",
              { "meta", "og", "标签", "seo", "social" }, "/tools/meta_tag_generator.html" );

    pushTool( "json_diff", "json_diff.svg", { "json" }, "JSON对比", "深度对比两个JSON对象的差异",
              { "json", "diff", "对比", "差异", "compare" }, "/tools/json_diff.html" );

    pushTool( "bip39_mnemonic", "bip39_mnemonic.svg", { "crypto", "common" }, "BIP39助记词", "生成和验证BIP39加密货币助记词",
              { "bip39", "助记词", "mnemonic", "加密货币", "钱包" }, "/tools/bip39_mnemonic.html" );

    pushTool( "password_strength_analyser", "password_strength_analyser.svg", { "crypto" }, "密码强度分析器", "分析密码强度、熵值与破解时间",
              { "密码", "强度", "熵", "安全", "password" }, "/tools/password_strength_analyser.html" );

    pushTool( "pdf_signature_checker", "pdf_signature_checker.svg", { "crypto", "pdf" }, "PDF签名检查器", "检测PDF数字签名与证书信息",
              { "pdf", "签名", "数字签名", "证书", "signature" }, "/tools/pdf_signature_checker.html" );

    pushTool( "pdf_converter", "pdf_converter.svg", { "pdf" }, "PDF转换", "PDF与Word/Excel/PPT/图片等格式互转",
              { "pdf", "转换", "word", "excel", "ppt", "图片" }, "/tools/pdf_converter.html" );

    pushTool( "toml_converter", "toml_converter.svg", { "code" }, "TOML转换器", "TOML与JSON/YAML互转",
              { "toml", "json", "yaml", "转换", "配置" }, "/tools/toml_converter.html" );

    pushTool( "otp_generator", "otp_generator.svg", { "crypto", "network" }, "OTP生成器", "生成和验证TOTP/HOTP一次性密码",
              { "otp", "totp", "hotp", "双因素", "2fa" }, "/tools/otp_generator.html" );

    pushTool( "keycode_info", "keycode_info.svg", { "frontend", "code" }, "键码信息", "查看键盘按键的keyCode等信息",
              { "keycode", "键盘", "按键", "key", "code" }, "/tools/keycode_info.html" );

    pushTool( "user_agent_parser", "user_agent_parser.svg", { "network" }, "用户代理解析器", "解析User-Agent字符串",
              { "user-agent", "ua", "浏览器", "解析" }, "/tools/user_agent_parser.html" );

    pushTool( "html_wysiwyg_editor", "html_wysiwyg_editor.svg", { "frontend" }, "HTML所见即所得编辑器", "在线富文本HTML编辑器",
              { "html", "编辑器", "wysiwyg", "富文本" }, "/tools/html_wysiwyg_editor.html" );

    pushTool( "safelink_decoder", "safelink_decoder.svg", { "network" }, "安全链接解码器", "解码Google/Outlook等安全链接",
              { "safelink", "安全链接", "解码", "url", "google" }, "/tools/safelink_decoder.html" );

    pushTool( "wifi_qr_code_generator", "wifi_qr_code_generator.svg", { "image" }, "WiFi二维码生成器", "生成WiFi连接二维码",
              { "wifi", "二维码", "qrcode", "无线网络" }, "/tools/wifi_qr_code_generator.html" );

    pushTool( "svg_placeholder_generator", "svg_placeholder_generator.svg", { "image", "frontend" }, "SVG占位符生成器", "生成SVG格式占位图片",
              { "svg", "占位符", "placeholder", "图片" }, "/tools/svg_placeholder_generator.html" );

    pushTool( "camera_recorder", "camera_recorder.svg", { "image" }, "摄像头录制器", "录制摄像头视频并下载",
              { "摄像头", "录制", "camera", "视频", "webcam" }, "/tools/camera_recorder.html" );

    pushTool( "git_memo", "git_memo.svg", { "code" }, "Git备忘", "Git命令速查表",
              { "git", "命令", "备忘", "速查" }, "/tools/git_memo.html" );

    pushTool( "docker_run_to_compose", "docker_run_to_compose.svg", { "code" }, "Docker Run转Compose", "将docker run命令转为docker-compose.yml",
              { "docker", "compose", "yaml", "转换" }, "/tools/docker_run_to_compose.html" );

    pushTool( "yaml_viewer", "yaml_viewer.svg", { "code", "json" }, "YAML查看器", "YAML格式化、校验与树形查看",
              { "yaml", "格式化", "查看器", "树形" }, "/tools/yaml_viewer.html" );

    pushTool( "email_normalizer", "email_normalizer.svg", { "text" }, "邮箱标准化", "邮箱地址标准化与批量处理",
              { "邮箱", "email", "标准化", "normalize" }, "/tools/email_normalizer.html" );

    pushTool( "regex_memo", "regex_memo.svg", { "text", "code" }, "正则备忘", "正则表达式语法速查表",
              { "正则", "regex", "备忘", "速查", "语法" }, "/tools/regex_memo.html" );

    pushTool( "ipv4_address_converter", "ipv4_address_converter.svg", { "network" }, "IPv4地址转换器", "IPv4地址与十进制/十六进制互转",
              { "ipv4", "地址", "转换", "十进制", "十六进制" }, "/tools/ipv4_address_converter.html" );

    pushTool( "ipv4_range_expander", "ipv4_range_expander.svg", { "network" }, "IPv4范围扩展器", "计算包含IP范围的最小CIDR",
              { "ipv4", "范围", "cidr", "子网", "扩展" }, "/tools/ipv4_range_expander.html" );

    pushTool( "mac_address_lookup", "mac_address_lookup.svg", { "network" }, "MAC地址查询", "通过OUI查询MAC地址厂商",
              { "mac", "地址", "oui", "厂商", "查询" }, "/tools/mac_address_lookup.html" );

    pushTool( "ipv6_ula_generator", "ipv6_ula_generator.svg", { "network" }, "IPv6 ULA生成器", "生成RFC 4193 IPv6唯一本地地址",
              { "ipv6", "ula", "唯一本地地址", "rfc4193" }, "/tools/ipv6_ula_generator.html" );

    pushTool( "eta_calculator", "eta_calculator.svg", { "math" }, "ETA计算器", "计算预计完成时间和剩余时间",
              { "eta", "预计", "完成", "时间", "进度" }, "/tools/eta_calculator.html" );

    pushTool( "chronometer", "chronometer.svg", { "datetime" }, "计时器", "秒表计时与记圈",
              { "计时器", "秒表", "chronometer", "lap", "圈" }, "/tools/chronometer.html" );

    pushTool( "benchmark_builder", "benchmark_builder.svg", { "code", "math" }, "基准测试构建器", "对比JavaScript代码执行性能",
              { "基准", "benchmark", "性能", "测试", "对比" }, "/tools/benchmark_builder.html" );

    pushTool( "string_obfuscator", "string_obfuscator.svg", { "text", "crypto" }, "字符串混淆器", "将字符串混淆为多种编码形式",
              { "混淆", "obfuscator", "编码", "unicode", "hex" }, "/tools/string_obfuscator.html" );

    pushTool( "ascii_text_drawer", "ascii_text_drawer.svg", { "text" }, "ASCII文本绘图", "将文本转为ASCII艺术字",
              { "ascii", "艺术", "绘图", "字符画", "banner" }, "/tools/ascii_text_drawer.html" );

    pushTool( "emoji_picker", "emoji_picker.svg", { "text" }, "Emoji选择器", "浏览和复制Emoji表情",
              { "emoji", "表情", "选择器", "picker" }, "/tools/emoji_picker.html" );

    pushTool( "phone_parser", "phone_parser.svg", { "network" }, "电话号码解析器", "解析和格式化国际电话号码",
              { "电话", "phone", "解析", "格式化", "国际" }, "/tools/phone_parser.html" );

    pushTool( "iban_validator", "iban_validator.svg", { "network" }, "IBAN验证器", "验证和解析国际银行账号",
              { "iban", "银行", "账号", "验证", "解析" }, "/tools/iban_validator.html" );

    pushTool( "game", "game.svg", { "common" }, "小游戏", "小游戏合集",
              { "游戏" }, "/tools/game.html" );

    // ===== Local tools (only include when localhost) =====
    if ( isLocal ) {
        pushTool( "batch-rename", "batch-rename.svg", { "local", "common" }, "批量重命名", "按规则批量重命名本机文件或文件夹，支持编号、替换、插入、转换大小写",
                  { "批量", "重命名", "rename", "文件" }, "/tools/local/batch_rename.html" );

        pushTool( "mcp-debug", "mcp-debug.svg", { "local", "code" }, "MCP 调试器", "对任意 HTTP MCP 服务执行握手、工具/资源/提示枚举与调用，查看全链路请求/响应与耗时",
                  { "mcp", "调试", "debug", "ai", "协议" }, "/tools/local/mcp_debug.html" );

        pushTool( "http-servers", "http-servers.svg", { "local", "network", "code" }, "HTTP 路径挂载 / 代理", "添加端口并配置不同路径挂载本地目录或代理请求，支持启动/停止监听",
                  { "http", "服务器", "挂载", "文件服务器", "代理", "proxy" }, "/tools/local/http_servers.html" );

        pushTool( "process-mgr", "process-mgr.svg", { "local", "code" }, "服务进程管理", "配置并启动/停止本机进程，实时查看输出，可配置命令、工作目录、环境变量等",
                  { "进程", "process", "服务", "启动", "命令" }, "/tools/local/processes.html" );

        pushTool( "ffmpeg", "ffmpeg.svg", { "local", "common" }, "FFmpeg 视频处理", "调用本地 FFmpeg 进行截取、格式转换、压缩，支持 GPU 编码与并行任务",
                  { "ffmpeg", "视频", "转码", "压缩", "截取" }, "/tools/local/ffmpeg.html" );

        pushTool( "ffmpeg-download", "ffmpeg-download.svg", { "local", "common" }, "FFmpeg 视频下载 / 录制", "从 m3u8/HTTP/HTTPS 拉取视频，或录制 RTMP/RTSP 直播流到本地",
                  { "ffmpeg", "下载", "视频", "录制", "直播", "m3u8" }, "/tools/local/ffmpeg_download.html" );

        pushTool( "cert", "cert.svg", { "local", "code", "encoding" }, "自签名证书生成", "基于本地 OpenSSL 生成自签名 X.509 证书，支持 IP/DNS SAN 与自定义主体信息",
                  { "证书", "cert", "ssl", "tls", "openssl", "签名" }, "/tools/local/cert_tool.html" );

        pushTool( "docs", "docs.svg", { "local", "text" }, "文档阅读", "指定本机目录，递归浏览 Markdown / HTML 文档，左侧目录树 + 右侧内容",
                  { "文档", "doc", "markdown", "阅读", "目录" }, "/tools/local/docs.html" );

        pushTool( "sys-monitor", "sys-monitor.svg", { "local", "common" }, "系统监测", "查看本机硬件信息（CPU/内存/磁盘/网络）与实时占用率，基于 hwinfo 库",
                  { "系统", "监测", "cpu", "内存", "磁盘", "网络", "gpu" }, "/tools/local/sys_monitor.html" );

        pushTool( "image-annotator", "image-annotator.svg", { "local", "image" }, "图片标注工具", "截屏图片标注工具，支持遮罩选区、绘制图形、添加文字、模糊、撤销恢复和保存导出",
                  { "图片", "标注", "绘图", "截图", "注释" }, "/tools/local/image_annotator.html" );

        pushTool( "batch-ocr", "image_ocr.svg", { "local", "image" }, "图片批量OCR", "批量识别本地图片中的文字，结果合并输出为HTML文件",
                  { "图片", "批量", "ocr", "文字识别", "批量识别" }, "/tools/local/batch_ocr.html" );

        pushTool( "music-player", "music-player.svg", { "local", "common" }, "音乐播放器", "扫描本机目录中的音频文件，支持合并/按目录浏览、歌词显示与内嵌封面",
                  { "音乐", "播放器", "music", "mp3", "flac", "歌词", "封面" }, "/tools/local/music_player.html" );

        pushTool( "adb", "adb.svg", { "local", "common" }, "ADB 调试工具", "通过 ADB 管理安卓设备：查看/连接设备、端口转发管理、Shell 命令",
                  { "adb", "android", "安卓", "设备", "调试", "端口转发" }, "/tools/local/adb_tool.html" );
    }

    Server::sendJson( res, { { "categories", categories }, { "tools", tools } } );
}

void registerToolRoutes( httplib::Server &svr ) {
    svr.Get( "/api/tools/ip", ipLookup );
    svr.Post( "/api/tools/proxy", httpProxy );
    svr.Get( "/api/tools/qrcode", qrcode );
    svr.Post( "/api/tools/image/convert", imageConvert );
    svr.Get( "/api/tools/catalog", toolCatalog );

    routes::localTools::registerLocalTools( svr ); // 注册本机工具路由（仅限本机访问）
    LOG_DEBUG << "注册本机工具路由...";
}

} // namespace routes::tools