#include "routes/MusicTool.h"
#include "common/App.h"
#include "common/Logger.hpp"
#include "core/Database.h"
#include "core/Server.h"
#include "common/Utils.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <string>
#include <unordered_set>
#include <vector>

namespace fs = std::filesystem;

namespace routes::music {

// ===========================================================================
// 通用工具
// ===========================================================================

static const std::vector<std::string> AUDIO_EXTS = {
    ".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac", ".opus", ".wma", ".ape", ".wv"
};

static bool isAudioFile( const fs::path &p ) {
    std::string ext = utils::toLower( p.extension().string() );
    for ( auto &e : AUDIO_EXTS )
        if ( ext == e )
            return true;
    return false;
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
    size_t a = 0, b = s.size();
    while ( a < b && std::isspace( (unsigned char)s[a] ) )
        ++a;
    while ( b > a && std::isspace( (unsigned char)s[b - 1] ) )
        --b;
    return s.substr( a, b - a );
}

static std::string toPosix( const std::string &p ) {
    std::string s = p;
    std::replace( s.begin(), s.end(), '\\', '/' );
    return s;
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
    auto rows = db.query( "SELECT * FROM music_sources WHERE id='" + Database::sqlEscape( id ) + "'" );
    return rows.empty() ? Database::Row{} : rows[0];
}

// ===========================================================================
// 内嵌封面提取（MP3 ID3v2 / FLAC / M4A）
// 返回 {data, mime}，失败返回空
// ===========================================================================

struct CoverData {
    std::vector<unsigned char> data;
    std::string mime;
};

// 从缓冲区读取 ID3v2 synchsafe 整数
static uint32_t readSynchsafe( const unsigned char *p ) {
    return ( (uint32_t)p[0] << 21 ) | ( (uint32_t)p[1] << 14 ) |
           ( (uint32_t)p[2] << 7 ) | (uint32_t)p[3];
}

static uint32_t readBE32( const unsigned char *p ) {
    return ( (uint32_t)p[0] << 24 ) | ( (uint32_t)p[1] << 16 ) |
           ( (uint32_t)p[2] << 8 ) | (uint32_t)p[3];
}

static std::string detectImageMime( const unsigned char *data, size_t len ) {
    if ( len >= 8 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 )
        return "image/png";
    if ( len >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF )
        return "image/jpeg";
    if ( len >= 6 && data[0] == 'G' && data[1] == 'I' && data[2] == 'F' )
        return "image/gif";
    if ( len >= 12 && data[0] == 'R' && data[1] == 'I' && data[2] == 'F' && data[3] == 'F' &&
         data[8] == 'W' && data[9] == 'E' && data[10] == 'B' && data[11] == 'P' )
        return "image/webp";
    return "image/jpeg";
}

// 解析 MP3 ID3v2 APIC
static CoverData extractMp3Cover( const unsigned char *buf, size_t len ) {
    CoverData out;
    if ( len < 10 || std::memcmp( buf, "ID3", 3 ) != 0 )
        return out;
    uint8_t major = buf[3];
    uint8_t flags = buf[5];
    uint32_t tagSize = readSynchsafe( buf + 6 );
    if ( tagSize == 0 || tagSize > len - 10 )
        tagSize = (uint32_t)( len - 10 );

    size_t pos = 10;
    // 扩展头
    if ( major >= 3 && ( flags & 0x40 ) && pos + 4 <= tagSize + 10 ) {
        uint32_t extSize;
        if ( major == 4 )
            extSize = readSynchsafe( buf + pos );
        else
            extSize = readBE32( buf + pos );
        pos += 4 + extSize;
    }
    size_t end = 10 + tagSize;
    if ( end > len )
        end = len;

    while ( pos + 10 <= end ) {
        size_t frameIdLen = ( major == 2 ) ? 3 : 4;
        size_t frameSizeLen = ( major == 2 ) ? 3 : 4;
        if ( pos + frameIdLen + frameSizeLen > end )
            break;
        const unsigned char *fid = buf + pos;
        bool isApic = false;
        if ( major == 2 )
            isApic = ( fid[0] == 'P' && fid[1] == 'I' && fid[2] == 'C' );
        else
            isApic = ( fid[0] == 'A' && fid[1] == 'P' && fid[2] == 'I' && fid[3] == 'C' );

        uint32_t frameSize = 0;
        if ( major == 4 )
            frameSize = readSynchsafe( buf + pos + 3 );
        else if ( major == 3 )
            frameSize = readBE32( buf + pos + 4 );
        else
            frameSize = ( (uint32_t)buf[pos + 3] << 16 ) | ( (uint32_t)buf[pos + 4] << 8 ) | buf[pos + 5];

        size_t headerLen = frameIdLen + frameSizeLen + ( major == 2 ? 0 : 2 );
        size_t dataPos = pos + headerLen;
        size_t dataEnd = dataPos + frameSize;
        if ( dataEnd > end )
            dataEnd = end;

        if ( isApic && dataPos < dataEnd ) {
            // APIC: encoding(1) + mime(null-term) + pictype(1) + desc(null-term) + data
            size_t p = dataPos;
            uint8_t enc = buf[p++];
            // mime
            std::string mime;
            while ( p < dataEnd && buf[p] != 0 )
                mime += (char)buf[p++];
            if ( p < dataEnd )
                p++; // null
            if ( p < dataEnd )
                p++; // picture type
            // description (null terminated, in encoding)
            if ( enc == 1 || enc == 2 ) {
                // UTF-16: 2-byte null terminator
                while ( p + 1 < dataEnd && !( buf[p] == 0 && buf[p + 1] == 0 ) )
                    p += 2;
                if ( p + 1 < dataEnd )
                    p += 2;
            } else {
                while ( p < dataEnd && buf[p] != 0 )
                    p++;
                if ( p < dataEnd )
                    p++;
            }
            if ( p < dataEnd ) {
                out.data.assign( buf + p, buf + dataEnd );
                out.mime = mime.empty() ? detectImageMime( out.data.data(), out.data.size() ) : mime;
            }
            return out;
        }
        pos = dataEnd;
        if ( frameSize == 0 )
            break;
    }
    return out;
}

// 解析 FLAC PICTURE block
static CoverData extractFlacCover( const unsigned char *buf, size_t len ) {
    CoverData out;
    if ( len < 4 || std::memcmp( buf, "fLaC", 4 ) != 0 )
        return out;
    size_t pos = 4;
    while ( pos + 4 <= len ) {
        uint8_t blockHeader = buf[pos];
        bool last = ( blockHeader & 0x80 ) != 0;
        uint8_t type = blockHeader & 0x7F;
        uint32_t blockSize = ( (uint32_t)buf[pos + 1] << 16 ) |
                             ( (uint32_t)buf[pos + 2] << 8 ) | buf[pos + 3];
        pos += 4;
        if ( pos + blockSize > len )
            break;
        if ( type == 6 ) { // PICTURE
            const unsigned char *p = buf + pos;
            size_t blen = blockSize;
            if ( blen < 32 )
                break;
            // type(4) + mime_len(4)
            uint32_t mimeLen = readBE32( p + 4 );
            if ( 8 + mimeLen > blen )
                break;
            std::string mime( (const char *)( p + 8 ), mimeLen );
            size_t off = 8 + mimeLen;
            // desc_len(4) + desc
            if ( off + 4 > blen )
                break;
            uint32_t descLen = readBE32( p + off );
            off += 4 + descLen;
            // width(4) height(4) depth(4) colors(4) data_len(4)
            if ( off + 20 > blen )
                break;
            uint32_t dataLen = readBE32( p + off + 16 );
            off += 20;
            if ( off + dataLen > blen )
                break;
            out.data.assign( p + off, p + off + dataLen );
            out.mime = mime.empty() ? detectImageMime( out.data.data(), out.data.size() ) : mime;
            return out;
        }
        pos += blockSize;
        if ( last )
            break;
    }
    return out;
}

// 解析 M4A/MP4 covr box（需要 fseek）
static CoverData extractM4aCover( const std::string &filePath ) {
    CoverData out;
    std::string local = utils::utf8ToLocal( filePath );
    FILE *fp = std::fopen( local.c_str(), "rb" );
    if ( !fp )
        return out;

    auto readBoxHeader = [&]( uint64_t &size, char type[5] ) -> bool {
        unsigned char hdr[8];
        if ( std::fread( hdr, 1, 8, fp ) != 8 )
            return false;
        size = ( (uint64_t)hdr[0] << 24 ) | ( (uint64_t)hdr[1] << 16 ) |
               ( (uint64_t)hdr[2] << 8 ) | hdr[3];
        std::memcpy( type, hdr + 4, 4 );
        type[4] = '\0';
        if ( size == 1 ) {
            unsigned char ext[8];
            if ( std::fread( ext, 1, 8, fp ) != 8 )
                return false;
            size = 0;
            for ( int i = 0; i < 8; ++i )
                size = ( size << 8 ) | ext[i];
        }
        return true;
    };

    auto findChildBox = [&]( uint64_t containerEnd, const char *target ) -> bool {
        while ( std::ftell( fp ) < (long)containerEnd ) {
            long boxStart = std::ftell( fp );
            uint64_t size;
            char type[5];
            if ( !readBoxHeader( size, type ) )
                return false;
            if ( std::strcmp( type, target ) == 0 )
                return true;
            if ( size < 8 )
                return false;
            std::fseek( fp, boxStart + (long)size, SEEK_SET );
        }
        return false;
    };

    // 找到 moov box
    long fileSize = 0;
    std::fseek( fp, 0, SEEK_END );
    fileSize = std::ftell( fp );
    std::fseek( fp, 0, SEEK_SET );

    uint64_t moovSize = 0;
    long moovStart = -1;
    while ( std::ftell( fp ) < fileSize ) {
        long boxStart = std::ftell( fp );
        uint64_t size;
        char type[5];
        if ( !readBoxHeader( size, type ) )
            break;
        if ( std::strcmp( type, "moov" ) == 0 ) {
            moovSize = size;
            moovStart = boxStart;
            break;
        }
        if ( size < 8 )
            break;
        std::fseek( fp, boxStart + (long)size, SEEK_SET );
    }
    if ( moovStart < 0 ) {
        std::fclose( fp );
        return out;
    }

    uint64_t moovEnd = moovStart + moovSize;
    std::fseek( fp, moovStart + 8, SEEK_SET );

    // moov -> udta
    if ( !findChildBox( moovEnd, "udta" ) ) {
        std::fclose( fp );
        return out;
    }
    long udtaStart = std::ftell( fp ) - 8;
    uint64_t udtaSize;
    char t[5];
    std::fseek( fp, udtaStart, SEEK_SET );
    if ( !readBoxHeader( udtaSize, t ) ) {
        std::fclose( fp );
        return out;
    }
    uint64_t udtaEnd = udtaStart + udtaSize;

    // udta -> meta
    if ( !findChildBox( udtaEnd, "meta" ) ) {
        std::fclose( fp );
        return out;
    }
    long metaStart = std::ftell( fp ) - 8;
    uint64_t metaSize;
    std::fseek( fp, metaStart, SEEK_SET );
    if ( !readBoxHeader( metaSize, t ) ) {
        std::fclose( fp );
        return out;
    }
    uint64_t metaEnd = metaStart + metaSize;
    // meta 有 4 字节 version+flags
    std::fseek( fp, 4, SEEK_CUR );

    // meta -> ilst
    if ( !findChildBox( metaEnd, "ilst" ) ) {
        std::fclose( fp );
        return out;
    }
    long ilstStart = std::ftell( fp ) - 8;
    uint64_t ilstSize;
    std::fseek( fp, ilstStart, SEEK_SET );
    if ( !readBoxHeader( ilstSize, t ) ) {
        std::fclose( fp );
        return out;
    }
    uint64_t ilstEnd = ilstStart + ilstSize;

    // ilst -> covr
    if ( !findChildBox( ilstEnd, "covr" ) ) {
        std::fclose( fp );
        return out;
    }
    long covrStart = std::ftell( fp ) - 8;
    uint64_t covrSize;
    std::fseek( fp, covrStart, SEEK_SET );
    if ( !readBoxHeader( covrSize, t ) ) {
        std::fclose( fp );
        return out;
    }
    uint64_t covrEnd = covrStart + covrSize;

    // covr -> data (可能多个，取第一个)
    if ( !findChildBox( covrEnd, "data" ) ) {
        std::fclose( fp );
        return out;
    }
    long dataStart = std::ftell( fp ) - 8;
    uint64_t dataSize;
    std::fseek( fp, dataStart, SEEK_SET );
    if ( !readBoxHeader( dataSize, t ) ) {
        std::fclose( fp );
        return out;
    }
    // data box: 4 bytes version+flags, then payload
    std::fseek( fp, 4, SEEK_CUR );
    uint64_t payloadSize = dataSize - 12;
    if ( payloadSize > 0 ) {
        out.data.resize( payloadSize );
        if ( std::fread( out.data.data(), 1, payloadSize, fp ) == payloadSize ) {
            out.mime = detectImageMime( out.data.data(), out.data.size() );
        } else {
            out.data.clear();
        }
    }
    std::fclose( fp );
    return out;
}

static CoverData extractCover( const std::string &filePath ) {
    CoverData out;
    std::string ext = utils::toLower( fs::path( filePath ).extension().string() );
    if ( ext == ".mp3" || ext == ".wav" || ext == ".aac" ) {
        // 读取文件头部（ID3 通常在开头，限制读取避免大文件全量加载）
        std::string local = utils::utf8ToLocal( filePath );
        FILE *fp = std::fopen( local.c_str(), "rb" );
        if ( !fp )
            return out;
        constexpr size_t MAX_TAG = 16 * 1024 * 1024; // 最多读 16MB 标签
        std::vector<unsigned char> buf( MAX_TAG );
        size_t n = std::fread( buf.data(), 1, MAX_TAG, fp );
        std::fclose( fp );
        buf.resize( n );
        return extractMp3Cover( buf.data(), buf.size() );
    } else if ( ext == ".flac" ) {
        std::string local = utils::utf8ToLocal( filePath );
        FILE *fp = std::fopen( local.c_str(), "rb" );
        if ( !fp )
            return out;
        constexpr size_t MAX_META = 16 * 1024 * 1024;
        std::vector<unsigned char> buf( MAX_META );
        size_t n = std::fread( buf.data(), 1, MAX_META, fp );
        std::fclose( fp );
        buf.resize( n );
        return extractFlacCover( buf.data(), buf.size() );
    } else if ( ext == ".m4a" || ext == ".mp4" ) {
        return extractM4aCover( filePath );
    }
    return out;
}

// ===========================================================================
// 路由处理
// ===========================================================================

static void listSources( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto &db = App::getInstance()->getDatabase();
    auto rows = db.query( "SELECT * FROM music_sources ORDER BY created_at ASC" );
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
    name = trim( name );
    if ( name.empty() )
        return Server::sendError( res, "名称不能为空", 400 );
    if ( path.empty() )
        return Server::sendError( res, "缺少目录(path)", 400 );

    path = normalizePath( path );
    std::error_code ec;
    if ( !fs::is_directory( path, ec ) )
        return Server::sendError( res, "目录不存在或不可访问", 400 );

    auto &db = App::getInstance()->getDatabase();
    std::string id = utils::generateId();
    std::string now = utils::nowIso();
    try {
        db.execParams(
            "INSERT INTO music_sources(id,name,path,created_at,updated_at) VALUES(?,?,?,?,?)",
            { { 1, id }, { 2, name }, { 3, path }, { 4, now }, { 5, now } } );
    } catch ( const std::exception &e ) {
        return Server::sendError( res, std::string( "创建失败: " ) + e.what(), 500 );
    }
    auto row = getSourceById( id );
    Server::sendJson( res, { { "success", true }, { "source", sourceToJson( row ) } } );
}

static void deleteSource( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string id = req.matches[1].str();
    auto row = getSourceById( id );
    if ( row.empty() )
        return Server::sendError( res, "目录不存在", 404 );
    auto &db = App::getInstance()->getDatabase();
    try {
        db.execParams( "DELETE FROM music_sources WHERE id=?", { { 1, id } } );
    } catch ( const std::exception &e ) {
        return Server::sendError( res, std::string( "删除失败: " ) + e.what(), 500 );
    }
    Server::sendJson( res, { { "success", true } } );
}

// 扫描所有源目录，返回曲目列表
// 可选 query: sourceId=xxx 只扫描指定源
//           includeBlacklist=1 包含黑名单中的歌曲（用于管理界面）
static void scanMusic( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;

    std::string sourceId = Server::queryParam( req, "sourceId" );
    bool includeBlacklist = Server::queryParam( req, "includeBlacklist" ) == "1";
    auto &db = App::getInstance()->getDatabase();
    std::string sql = "SELECT * FROM music_sources";
    if ( !sourceId.empty() )
        sql += " WHERE id='" + Database::sqlEscape( sourceId ) + "'";
    sql += " ORDER BY created_at ASC";
    auto sources = db.query( sql );

    Server::json tracks = Server::json::array();
    int total = 0;

    for ( auto &src : sources ) {
        std::string srcId = src.count( "id" ) ? src["id"] : "";
        std::string srcName = src.count( "name" ) ? src["name"] : "";
        std::string srcPath = src.count( "path" ) ? src["path"] : "";
        if ( srcPath.empty() )
            continue;

        // 加载该目录的黑名单路径集合
        std::unordered_set<std::string> blacklist;
        auto blRows = db.query( "SELECT path FROM music_blacklist WHERE source_id='" + Database::sqlEscape( srcId ) + "'" );
        for ( auto &br : blRows ) {
            if ( br.count( "path" ) )
                blacklist.insert( br["path"] );
        }

        std::error_code ec;
        if ( !fs::is_directory( srcPath, ec ) )
            continue;

        try {
            for ( auto &entry : fs::recursive_directory_iterator(
                      srcPath, fs::directory_options::skip_permission_denied, ec ) ) {
                if ( ec )
                    break;
                if ( !entry.is_regular_file( ec ) )
                    continue;
                if ( !isAudioFile( entry.path() ) )
                    continue;

                std::string fullPath = entry.path().string();
                // 跳过黑名单中的歌曲（管理界面需要查看全部时不跳过）
                if ( !includeBlacklist && blacklist.count( fullPath ) )
                    continue;
                std::string relPath;
                try {
                    relPath = fs::relative( entry.path(), fs::path( srcPath ) ).string();
                } catch ( ... ) {
                    relPath = entry.path().filename().string();
                }
                relPath = toPosix( relPath );

                std::string dir = "";
                auto slash = relPath.rfind( '/' );
                if ( slash != std::string::npos )
                    dir = relPath.substr( 0, slash );

                std::string fileName = entry.path().filename().string();
                int64_t size = 0;
                int64_t modSec = 0;
                std::error_code ec2;
                size = entry.file_size( ec2 );
                auto ftime = entry.last_write_time( ec2 );
                if ( !ec2 ) {
                    try {
                        using namespace std::chrono;
                        auto sysTime = time_point_cast<system_clock::duration>(
                            ftime - fs::file_time_type::clock::now() + system_clock::now() );
                        modSec = duration_cast<seconds>( sysTime.time_since_epoch() ).count();
                    } catch ( ... ) {
                    }
                }

                Server::json t;
                t["id"] = srcId;
                t["sourceName"] = srcName;
                t["sourcePath"] = srcPath;
                t["name"] = fileName;
                t["title"] = entry.path().stem().string();
                t["path"] = fullPath;
                t["relPath"] = relPath;
                t["dir"] = dir;
                t["size"] = size;
                t["modified"] = modSec;
                tracks.push_back( t );
                total++;
            }
        } catch ( ... ) {
        }
    }

    Server::sendJson( res, { { "success", true }, { "tracks", tracks }, { "total", total } } );
}

// 流式播放音频（支持 Range）
static void streamAudio( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string path = Server::queryParam( req, "path" );
    if ( path.empty() )
        return Server::sendError( res, "缺少 path", 400 );

    std::error_code ec;
    if ( !fs::exists( path, ec ) || !fs::is_regular_file( path, ec ) )
        return Server::sendError( res, "文件不存在", 404 );
    if ( !isAudioFile( fs::path( path ) ) )
        return Server::sendError( res, "不支持的音频格式", 400 );

    auto fsize = utils::fs::fileSize( path );
    if ( fsize < 0 )
        return Server::sendError( res, "无法获取文件大小", 500 );

    std::string mimeType = Server::contentType( path );

    std::string file = utils::utf8ToLocal( path );
    FILE *fp = std::fopen( file.c_str(), "rb" );
    if ( !fp )
        return Server::sendError( res, "打开文件失败", 500 );

    res.set_header( "Accept-Ranges", "bytes" );
    res.set_header( "Cache-Control", "public, max-age=3600" );

    res.set_content_provider(
        fsize, mimeType,
        [fp]( size_t offset, size_t length, httplib::DataSink &sink ) -> bool {
            if ( length == 0 )
                return true;
            constexpr size_t CHUNK = 256 * 1024;
            char buf[CHUNK];
            size_t toRead = std::min<size_t>( CHUNK, length );
            fseeko( fp, offset, SEEK_SET );
            size_t n = std::fread( buf, 1, toRead, fp );
            if ( n == 0 )
                return false; // 读取失败，取消传输
            sink.write( buf, n );
            return true;
        },
        [fp]( bool ) {
            if ( fp )
                std::fclose( fp );
        } );
}

// 提取并返回内嵌封面
static void getCover( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string path = Server::queryParam( req, "path" );
    if ( path.empty() )
        return Server::sendError( res, "缺少 path", 400 );

    std::error_code ec;
    if ( !fs::exists( path, ec ) || !fs::is_regular_file( path, ec ) )
        return Server::sendError( res, "文件不存在", 404 );

    CoverData cover = extractCover( path );
    if ( cover.data.empty() ) {
        // 返回 204 无封面
        res.status = 204;
        return;
    }
    res.set_content_provider(
        cover.data.size(), cover.mime,
        [cover]( size_t offset, size_t length, httplib::DataSink &sink ) -> bool {
            if ( length == 0 || offset >= cover.data.size() )
                return true;
            size_t n = std::min<size_t>( length, cover.data.size() - offset );
            sink.write( (const char *)cover.data.data() + offset, n );
            return true;
        } );
}

// 返回歌词（.lrc 文件，与歌曲同目录同名称）
static void getLyrics( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string path = Server::queryParam( req, "path" );
    if ( path.empty() )
        return Server::sendError( res, "缺少 path", 400 );

    fs::path p( path );
    fs::path lrcPath = p.parent_path() / ( p.stem().string() + ".lrc" );

    std::error_code ec;
    if ( !fs::exists( lrcPath, ec ) || !fs::is_regular_file( lrcPath, ec ) ) {
        res.status = 204;
        return;
    }

    std::string content;
    if ( !utils::fs::readFile( lrcPath.string(), content ) ) {
        res.status = 204;
        return;
    }
    Server::sendJson( res, { { "success", true }, { "text", content } } );
}

// ===========================================================================
// 黑名单管理
// ===========================================================================

// GET /api/local/music/blacklist?sourceId=xxx
static void listBlacklist( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    std::string sourceId = Server::queryParam( req, "sourceId" );
    auto &db = App::getInstance()->getDatabase();
    std::string sql = "SELECT * FROM music_blacklist";
    if ( !sourceId.empty() )
        sql += " WHERE source_id='" + Database::sqlEscape( sourceId ) + "'";
    sql += " ORDER BY created_at DESC";
    auto rows = db.query( sql );
    Server::json arr = Server::json::array();
    for ( auto &r : rows ) {
        Server::json j;
        j["id"] = r.count( "id" ) ? r["id"] : "";
        j["sourceId"] = r.count( "source_id" ) ? r["source_id"] : "";
        j["path"] = r.count( "path" ) ? r["path"] : "";
        j["created_at"] = r.count( "created_at" ) ? r["created_at"] : "";
        arr.push_back( j );
    }
    Server::sendJson( res, { { "success", true }, { "items", arr } } );
}

// POST /api/local/music/blacklist  body: {sourceId, path}
static void addBlacklist( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    if ( !body.is_object() )
        return Server::sendError( res, "无效的请求体", 400 );
    std::string sourceId = body.contains( "sourceId" ) && body["sourceId"].is_string() ? body["sourceId"].get<std::string>() : "";
    std::string path = body.contains( "path" ) && body["path"].is_string() ? body["path"].get<std::string>() : "";
    if ( sourceId.empty() || path.empty() )
        return Server::sendError( res, "缺少 sourceId 或 path", 400 );

    auto &db = App::getInstance()->getDatabase();
    std::string id = utils::generateId();
    std::string now = utils::nowIso();
    try {
        db.execParams(
            "INSERT OR IGNORE INTO music_blacklist(id,source_id,path,created_at) VALUES(?,?,?,?)",
            { { 1, id }, { 2, sourceId }, { 3, path }, { 4, now } } );
    } catch ( const std::exception &e ) {
        return Server::sendError( res, std::string( "添加失败: " ) + e.what(), 500 );
    }
    Server::sendJson( res, { { "success", true } } );
}

// DELETE /api/local/music/blacklist  body: {sourceId, path}
static void removeBlacklist( const httplib::Request &req, httplib::Response &res ) {
    if ( Server::guardLocalhost( req, res ) )
        return;
    auto body = Server::parseBody( req );
    std::string sourceId, path;
    if ( body.is_object() ) {
        sourceId = body.contains( "sourceId" ) && body["sourceId"].is_string() ? body["sourceId"].get<std::string>() : "";
        path = body.contains( "path" ) && body["path"].is_string() ? body["path"].get<std::string>() : "";
    }
    // 也支持 query 参数
    if ( sourceId.empty() ) sourceId = Server::queryParam( req, "sourceId" );
    if ( path.empty() ) path = Server::queryParam( req, "path" );
    if ( sourceId.empty() || path.empty() )
        return Server::sendError( res, "缺少 sourceId 或 path", 400 );

    auto &db = App::getInstance()->getDatabase();
    try {
        db.execParams(
            "DELETE FROM music_blacklist WHERE source_id=? AND path=?",
            { { 1, sourceId }, { 2, path } } );
    } catch ( const std::exception &e ) {
        return Server::sendError( res, std::string( "删除失败: " ) + e.what(), 500 );
    }
    Server::sendJson( res, { { "success", true } } );
}

void registerMusicRoutes( httplib::Server &svr ) {
    svr.Get( "/api/local/music/sources", listSources );
    svr.Post( "/api/local/music/sources", createSource );
    svr.Delete( R"(/api/local/music/sources/([^/]+))", deleteSource );
    svr.Get( "/api/local/music/scan", scanMusic );
    svr.Get( "/api/local/music/audio", streamAudio );
    svr.Get( "/api/local/music/cover", getCover );
    svr.Get( "/api/local/music/lyrics", getLyrics );
    svr.Get( "/api/local/music/blacklist", listBlacklist );
    svr.Post( "/api/local/music/blacklist", addBlacklist );
    svr.Delete( "/api/local/music/blacklist", removeBlacklist );
    LOG_DEBUG << "音乐播放器路由已注册";
}

} // namespace routes::music