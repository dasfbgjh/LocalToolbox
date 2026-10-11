#include "Utils.h"
#include "common/Config.h"

#ifdef _WIN32
#include <windows.h>
#include <shlobj.h>
#include <objbase.h>
#else
#include <cstdlib>
#endif

namespace utils {

namespace stdfs = std::filesystem;

std::string toHex( const uint8_t *data, size_t len ) {
    static const char *hex = "0123456789abcdef";
    std::string out;
    out.reserve( len * 2 );
    for ( size_t i = 0; i < len; ++i ) {
        out.push_back( hex[( data[i] >> 4 ) & 0xf] );
        out.push_back( hex[data[i] & 0xf] );
    }
    return out;
}

std::vector<uint8_t> fromHex( const std::string &s ) {
    std::vector<uint8_t> out;
    out.reserve( s.size() / 2 );
    auto hexVal = []( char c ) -> int {
        if ( c >= '0' && c <= '9' )
            return c - '0';
        if ( c >= 'a' && c <= 'f' )
            return c - 'a' + 10;
        if ( c >= 'A' && c <= 'F' )
            return c - 'A' + 10;
        return 0;
    };
    for ( size_t i = 0; i + 1 < s.size(); i += 2 ) {
        out.push_back( static_cast<uint8_t>( ( hexVal( s[i] ) << 4 ) | hexVal( s[i + 1] ) ) );
    }
    return out;
}

std::string base64Encode( const uint8_t *data, size_t len ) {
    static const char *tbl = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    out.reserve( ( ( len + 2 ) / 3 ) * 4 );
    for ( size_t i = 0; i < len; i += 3 ) {
        uint32_t n = data[i] << 16;
        if ( i + 1 < len )
            n |= data[i + 1] << 8;
        if ( i + 2 < len )
            n |= data[i + 2];
        out.push_back( tbl[( n >> 18 ) & 0x3f] );
        out.push_back( tbl[( n >> 12 ) & 0x3f] );
        out.push_back( i + 1 < len ? tbl[( n >> 6 ) & 0x3f] : '=' );
        out.push_back( i + 2 < len ? tbl[n & 0x3f] : '=' );
    }
    return out;
}

std::string base64Encode( const std::string &s ) {
    return base64Encode( reinterpret_cast<const uint8_t *>( s.data() ), s.size() );
}

std::vector<uint8_t> base64Decode( const std::string &s ) {
    static int8_t tbl[256];
    static bool init = false;
    if ( !init ) {
        for ( int i = 0; i < 256; ++i )
            tbl[i] = -1;
        const char *chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        for ( int i = 0; i < 64; ++i )
            tbl[(unsigned char)chars[i]] = static_cast<int8_t>( i );
        init = true;
    }
    std::vector<uint8_t> out;
    uint32_t buf = 0;
    int bits = 0;
    for ( char c : s ) {
        if ( c == '=' )
            break;
        int v = tbl[(unsigned char)c];
        if ( v < 0 )
            continue;
        buf = ( buf << 6 ) | v;
        bits += 6;
        if ( bits >= 8 ) {
            bits -= 8;
            out.push_back( static_cast<uint8_t>( ( buf >> bits ) & 0xff ) );
        }
    }
    return out;
}

std::string urlEncode( const std::string &s ) {
    std::ostringstream out;
    out << std::hex << std::uppercase << std::setfill( '0' );
    for ( unsigned char c : s ) {
        if ( ( c >= 'A' && c <= 'Z' ) || ( c >= 'a' && c <= 'z' ) ||
             ( c >= '0' && c <= '9' ) || c == '-' || c == '_' || c == '.' || c == '~' ) {
            out << static_cast<char>( c );
        } else {
            out << '%' << std::setw( 2 ) << static_cast<int>( c );
        }
    }
    return out.str();
}

std::string urlDecode( const std::string &s ) {
    std::string out;
    for ( size_t i = 0; i < s.size(); ++i ) {
        if ( s[i] == '%' && i + 2 < s.size() ) {
            auto hexVal = []( char c ) -> int {
                if ( c >= '0' && c <= '9' )
                    return c - '0';
                if ( c >= 'a' && c <= 'f' )
                    return c - 'a' + 10;
                if ( c >= 'A' && c <= 'F' )
                    return c - 'A' + 10;
                return 0;
            };
            out.push_back( static_cast<char>( ( hexVal( s[i + 1] ) << 4 ) | hexVal( s[i + 2] ) ) );
            i += 2;
        } else if ( s[i] == '+' ) {
            out.push_back( ' ' );
        } else {
            out.push_back( s[i] );
        }
    }
    return out;
}

std::string randomHex( size_t bytes ) {
    std::random_device rd;
    std::mt19937_64 gen( rd() );
    std::uniform_int_distribution<uint64_t> dist;
    std::ostringstream out;
    for ( size_t i = 0; i < bytes; i += 8 ) {
        out << std::hex << std::setw( 16 ) << std::setfill( '0' ) << dist( gen );
    }
    return out.str().substr( 0, bytes * 2 );
}

std::string generateId() {
    return randomHex( 12 ); // 24-char hex id
}

std::string generateToken() {
    return randomHex( 32 ); // 64-char hex token
}

std::string generateInviteCode() {
    std::random_device rd;
    std::mt19937 gen( rd() );
    std::uniform_int_distribution<int> dist( 100000, 999999 );
    return std::to_string( dist( gen ) );
}

std::string nowIso() {
    auto now = std::chrono::system_clock::now();
    std::time_t t = std::chrono::system_clock::to_time_t( now );
    std::tm tm{};
#ifdef _WIN32
    gmtime_s( &tm, &t );
#else
    gmtime_r( &t, &tm );
#endif
    char buf[32];
    std::strftime( buf, sizeof( buf ), "%Y-%m-%dT%H:%M:%SZ", &tm );
    return std::string( buf );
}

std::time_t parseIso( const std::string &s ) {
    int y = 1970, mo = 1, d = 1, h = 0, mi = 0, se = 0;
    if ( s.size() < 10 )
        return 0;
    if ( sscanf( s.c_str(), "%d-%d-%dT%d:%d:%d", &y, &mo, &d, &h, &mi, &se ) < 6 ) {
        if ( sscanf( s.c_str(), "%d-%d-%d %d:%d:%d", &y, &mo, &d, &h, &mi, &se ) < 6 ) {
            return 0;
        }
    }
    std::tm tm{};
    tm.tm_year = y - 1900;
    tm.tm_mon = mo - 1;
    tm.tm_mday = d;
    tm.tm_hour = h;
    tm.tm_min = mi;
    tm.tm_sec = se;
#ifdef _WIN32
    return _mkgmtime( &tm );
#else
    return timegm( &tm );
#endif
}

std::time_t nowTime() {
    return std::chrono::system_clock::to_time_t( std::chrono::system_clock::now() );
}

std::string formatDistanceToNow( const std::string &dateStr ) {
    std::time_t t = parseIso( dateStr );
    if ( t == 0 )
        return "";
    std::time_t now = nowTime();
    long long diff = static_cast<long long>( now - t );
    if ( diff < 60 )
        return "刚刚";
    long long mins = diff / 60;
    if ( mins < 60 )
        return std::to_string( mins ) + "分钟前";
    long long hours = mins / 60;
    if ( hours < 24 )
        return std::to_string( hours ) + "小时前";
    long long days = hours / 24;
    if ( days < 30 )
        return std::to_string( days ) + "天前";
    long long months = days / 30;
    if ( months < 12 )
        return std::to_string( months ) + "个月前";
    long long years = months / 12;
    return std::to_string( years ) + "年前";
}

std::map<std::string, std::string> parseCookies( const std::string &cookieHeader ) {
    std::map<std::string, std::string> cookies;
    size_t pos = 0;
    while ( pos < cookieHeader.size() ) {
        size_t semi = cookieHeader.find( ';', pos );
        std::string pair = cookieHeader.substr( pos, semi == std::string::npos ? std::string::npos : semi - pos );
        size_t eq = pair.find( '=' );
        if ( eq != std::string::npos ) {
            std::string key = pair.substr( 0, eq );
            std::string val = pair.substr( eq + 1 );
            // trim spaces
            size_t ks = key.find_first_not_of( " \t" );
            size_t ke = key.find_last_not_of( " \t" );
            if ( ks != std::string::npos )
                key = key.substr( ks, ke - ks + 1 );
            size_t vs = val.find_first_not_of( " \t" );
            size_t ve = val.find_last_not_of( " \t" );
            if ( vs != std::string::npos )
                val = val.substr( vs, ve - vs + 1 );
            cookies[key] = val;
        }
        if ( semi == std::string::npos )
            break;
        pos = semi + 1;
    }
    return cookies;
}

std::vector<std::string> getLocalIPs() {
    std::vector<std::string> ips;
#ifdef _WIN32
    ULONG bufLen = 15000;
    std::vector<uint8_t> buffer( bufLen );
    ULONG ret = 0;
    DWORD result = GetAdaptersAddresses( AF_INET, GAA_FLAG_INCLUDE_PREFIX, nullptr,
                                         reinterpret_cast<PIP_ADAPTER_ADDRESSES>( buffer.data() ), &bufLen );
    if ( result == ERROR_BUFFER_OVERFLOW ) {
        buffer.resize( bufLen );
        result = GetAdaptersAddresses( AF_INET, GAA_FLAG_INCLUDE_PREFIX, nullptr,
                                       reinterpret_cast<PIP_ADAPTER_ADDRESSES>( buffer.data() ), &bufLen );
    }
    if ( result != NO_ERROR )
        return ips;
    auto *adapter = reinterpret_cast<PIP_ADAPTER_ADDRESSES>( buffer.data() );
    while ( adapter ) {
        if ( adapter->OperStatus == IfOperStatusUp ) {
            for ( auto *addr = adapter->FirstUnicastAddress; addr; addr = addr->Next ) {
                sockaddr *sa = addr->Address.lpSockaddr;
                if ( sa->sa_family == AF_INET ) {
                    auto *sin = reinterpret_cast<sockaddr_in *>( sa );
                    char ip[INET_ADDRSTRLEN];
                    inet_ntop( AF_INET, &sin->sin_addr, ip, sizeof( ip ) );
                    std::string ipStr( ip );
                    if ( ipStr != "127.0.0.1" && std::find( ips.begin(), ips.end(), ipStr ) == ips.end() ) {
                        ips.push_back( ipStr );
                    }
                }
            }
        }
        adapter = adapter->Next;
    }
#else
    struct ifaddrs *ifap;
    if ( getifaddrs( &ifap ) == 0 ) {
        for ( struct ifaddrs *p = ifap; p; p = p->ifa_next ) {
            if ( !p->ifa_addr || p->ifa_addr->sa_family != AF_INET )
                continue;
            auto *sin = reinterpret_cast<sockaddr_in *>( p->ifa_addr );
            char ip[INET_ADDRSTRLEN];
            inet_ntop( AF_INET, &sin->sin_addr, ip, sizeof( ip ) );
            std::string ipStr( ip );
            if ( ipStr != "127.0.0.1" && std::find( ips.begin(), ips.end(), ipStr ) == ips.end() ) {
                ips.push_back( ipStr );
            }
        }
        freeifaddrs( ifap );
    }
#endif
    return ips;
}

void openHome( const std::string &path ) {
#ifdef _WIN32
    std::string url;
    if ( Config::getEnableHttps() && !Config::getSslCertPath().empty() && !Config::getSslKeyPath().empty() )
        url = "https://127.0.0.1:" + std::to_string( Config::getHttpsServerPort() ) + path;
    else
        url = "http://127.0.0.1:" + std::to_string( Config::getHttpServerPort() ) + path;
    openBrowser( url );
#endif
}

void openBrowser( const std::string &url ) {
#ifdef _WIN32
    if ( startWith( url, "http://" ) || startWith( url, "https://" ) )
        ShellExecuteA( NULL, "open", url.c_str(), NULL, ".", SW_SHOWNORMAL );
    else
        LOG_WARN << "打开URL失败: " << url;
#endif
}

void openDirectory( const std::string &path ) {
#ifdef _WIN32
    std::filesystem::path p( path );
    if ( std::filesystem::exists( p ) )
        ShellExecuteA( NULL, "open", p.string().c_str(), NULL, ".", SW_SHOWNORMAL );
    else
        LOG_WARN << "打开文件或目录不存在:" << path;
#endif
}

void makeDesktopShortcut( const std::string &path, const std::string &name ) {
    LOG_INFO << "创建快捷方式: " << path << " " << name;
#ifdef _WIN32
    auto utf8ToW = []( const std::string &s ) -> std::wstring {
        if ( s.empty() )
            return L"";
        int len = MultiByteToWideChar( CP_UTF8, 0, s.c_str(), -1, NULL, 0 );
        std::wstring ws( len - 1, 0 );
        MultiByteToWideChar( CP_UTF8, 0, s.c_str(), -1, &ws[0], len );
        return ws;
    };

    wchar_t wDesktop[MAX_PATH];
    if ( S_OK != SHGetFolderPathW( NULL, CSIDL_DESKTOP, NULL, 0, wDesktop ) ) {
        LOG_WARN << "获取桌面路径失败";
        return;
    }

    std::wstring wName = utf8ToW( name ) + L".lnk";
    stdfs::path lnkPath = stdfs::path( wDesktop ) / wName;
    std::wstring wLnkPath = lnkPath.wstring();

    std::wstring wPath = utf8ToW( path );

    HRESULT hr = CoInitializeEx( NULL, COINIT_APARTMENTTHREADED );
    if ( FAILED( hr ) && hr != RPC_E_CHANGED_MODE ) {
        LOG_WARN << "COM 初始化失败";
        return;
    }

    IShellLinkW *pShellLink = NULL;
    hr = CoCreateInstance( CLSID_ShellLink, NULL, CLSCTX_INPROC_SERVER,
                           IID_IShellLinkW, (void **)&pShellLink );
    if ( SUCCEEDED( hr ) ) {
        pShellLink->SetPath( wPath.c_str() );

        stdfs::path workDir = stdfs::path( wPath ).parent_path();
        if ( !workDir.empty() )
            pShellLink->SetWorkingDirectory( workDir.wstring().c_str() );

        IPersistFile *pPersistFile = NULL;
        hr = pShellLink->QueryInterface( IID_IPersistFile, (void **)&pPersistFile );
        if ( SUCCEEDED( hr ) ) {
            pPersistFile->Save( wLnkPath.c_str(), TRUE );
            pPersistFile->Release();
        } else {
            LOG_WARN << "创建快捷方式失败1:" << lnkPath.string();
        }
        pShellLink->Release();
    } else {
        LOG_WARN << "创建快捷方式失败2:" << lnkPath.string();
    }

    CoUninitialize();
#else
    const char *xdgDesktop = std::getenv( "XDG_DESKTOP_DIR" );
    stdfs::path desktopPath;
    if ( xdgDesktop && xdgDesktop[0] != '\0' )
        desktopPath = xdgDesktop;
    else
        desktopPath = stdfs::path( std::getenv( "HOME" ) ) / "Desktop";

    stdfs::path desktopFilePath = desktopPath / ( name + ".desktop" );
    std::ofstream out( desktopFilePath );
    if ( out.is_open() ) {
        out << "[Desktop Entry]\n";
        out << "Type=Application\n";
        out << "Name=" << name << "\n";
        out << "Exec=" << path << "\n";
        out << "Terminal=false\n";
        out.close();
        stdfs::permissions( desktopFilePath,
                            stdfs::perms::owner_read | stdfs::perms::owner_write | stdfs::perms::owner_exec,
                            stdfs::perm_options::add );
    } else {
        LOG_WARN << "创建 .desktop 文件失败: " << desktopFilePath.string();
    }
#endif
}

bool isValidUtf8( const std::string &str ) {
    int i = 0;
    while ( i < str.size() ) {
        if ( ( str[i] & 0x80 ) == 0 ) {
            i++;
        } else if ( ( str[i] & 0xE0 ) == 0xC0 ) {
            if ( i + 1 >= str.size() )
                return false;
            if ( ( str[i + 1] & 0xC0 ) != 0x80 )
                return false;
            i += 2;
        } else if ( ( str[i] & 0xF0 ) == 0xE0 ) {
            if ( i + 2 >= str.size() )
                return false;
            if ( ( str[i + 1] & 0xC0 ) != 0x80 )
                return false;
            if ( ( str[i + 2] & 0xC0 ) != 0x80 )
                return false;
            i += 3;
        } else if ( ( str[i] & 0xF8 ) == 0xF0 ) {
            if ( i + 3 >= str.size() )
                return false;
            if ( ( str[i + 1] & 0xC0 ) != 0x80 )
                return false;
            if ( ( str[i + 2] & 0xC0 ) != 0x80 )
                return false;
            if ( ( str[i + 3] & 0xC0 ) != 0x80 )
                return false;
            i += 4;
        } else {
            return false;
        }
    }
    return true;
}

std::string sanitizeUtf8( const std::string &in ) {
    size_t len = in.size();
    while ( len > 0 && in[len - 1] == '\0' )
        len--;
    std::string out;
    out.reserve( len + 8 );
    size_t i = 0;
    const char *data = in.data();
    while ( i < len ) {
        unsigned char c = static_cast<unsigned char>( data[i] );
        if ( c < 0x80 ) {
            out.push_back( data[i] );
            i++;
            continue;
        }
        size_t follow = 0;
        bool invalid = false;
        if ( ( c & 0xE0 ) == 0xC0 ) {
            if ( c < 0xC2 )
                invalid = true;
            else
                follow = 1;
        } else if ( ( c & 0xF0 ) == 0xE0 ) {
            follow = 2;
        } else if ( ( c & 0xF8 ) == 0xF0 ) {
            if ( c > 0xF4 )
                invalid = true;
            else
                follow = 3;
        } else {
            invalid = true;
        }
        if ( !invalid && i + follow > len ) {
            // 截断序列，跳过开头字节
            invalid = true;
        }
        if ( !invalid && follow >= 1 ) {
            unsigned char b2 = static_cast<unsigned char>( data[i + 1] );
            if ( ( b2 & 0xC0 ) != 0x80 )
                invalid = true;
            if ( follow == 1 && c == 0xC0 )
                invalid = true;
            if ( follow == 2 ) {
                unsigned char b3 = static_cast<unsigned char>( data[i + 2] );
                if ( ( b3 & 0xC0 ) != 0x80 )
                    invalid = true;
                if ( c == 0xED && b2 >= 0xA0 )
                    invalid = true; // surrogates
                if ( c == 0xE0 && b2 < 0xA0 )
                    invalid = true;
            }
            if ( follow == 3 ) {
                unsigned char b3 = static_cast<unsigned char>( data[i + 2] );
                unsigned char b4 = static_cast<unsigned char>( data[i + 3] );
                if ( ( b3 & 0xC0 ) != 0x80 || ( b4 & 0xC0 ) != 0x80 )
                    invalid = true;
                if ( c == 0xF0 && b2 < 0x90 )
                    invalid = true;
                if ( c == 0xF4 && b2 > 0x8F )
                    invalid = true;
            }
        }
        if ( invalid ) {
            out.append( "\xEF\xBF\xBD", 3 );
            i += 1;
            continue;
        }
        out.append( data + i, 1 + follow );
        i += 1 + follow;
    }
    return out;
}

std::string utf8ToLocal( const std::string &utf8 ) {
#ifdef _WIN32
    if ( utf8.empty() )
        return "";
    int wlen = MultiByteToWideChar( CP_UTF8, 0, utf8.c_str(), -1, nullptr, 0 );
    if ( wlen <= 0 )
        return utf8;
    std::wstring wstr( wlen, 0 );
    MultiByteToWideChar( CP_UTF8, 0, utf8.c_str(), -1, &wstr[0], wlen );
    int len = WideCharToMultiByte( CP_ACP, 0, wstr.c_str(), -1,
                                   nullptr, 0, nullptr, nullptr );
    if ( len <= 0 )
        return utf8;
    std::string result( len, 0 );
    WideCharToMultiByte( CP_ACP, 0, wstr.c_str(), -1,
                         &result[0], len, nullptr, nullptr );
    return result;
#else
    return utf8;
#endif
}

std::string localToUtf8( const std::string &local ) {
#ifdef _WIN32
    if ( local.empty() )
        return "";
    int wlen = MultiByteToWideChar( CP_ACP, 0, local.c_str(), -1, nullptr, 0 );
    if ( wlen <= 0 )
        return local;
    std::wstring wstr( wlen, 0 );
    MultiByteToWideChar( CP_ACP, 0, local.c_str(), -1, &wstr[0], wlen );
    int len = WideCharToMultiByte( CP_UTF8, 0, wstr.c_str(), -1,
                                   nullptr, 0, nullptr, nullptr );
    if ( len <= 0 )
        return local;
    std::string result( len, 0 );
    WideCharToMultiByte( CP_UTF8, 0, wstr.c_str(), -1,
                         &result[0], len, nullptr, nullptr );
    return result;
#else
    return local;
#endif
}

std::string wstring_to_string( const std::wstring &wstr ) {
#ifdef _WIN32
    if ( wstr.empty() )
        return "";
    int size = WideCharToMultiByte( CP_UTF8, 0, wstr.c_str(), (int)wstr.size(),
                                    nullptr, 0, nullptr, nullptr );
    std::string result( size, '\0' );
    WideCharToMultiByte( CP_UTF8, 0, wstr.c_str(), (int)wstr.size(),
                         &result[0], size, nullptr, nullptr );
    return result;
#else
    LOG_WARN << "wstring_to_string: not implemented on non-Windows platform";
    return std::string( wstr.size(), '*' );
#endif
}

std::string jsonStringValue( const json &j, const std::string &key ) {
    if ( j.contains( key ) && !j[key].is_null() )
        return j[key].get<std::string>();
    return "";
}

bool startWith( const std::string &str, const std::string &prefix ) {
    return str.compare( 0, prefix.length(), prefix ) == 0;
}

bool endWith( const std::string &str, const std::string &suffix ) {
    if ( str.length() < suffix.length() ) {
        return false;
    }
    return str.compare( str.length() - suffix.length(), suffix.length(), suffix ) == 0;
}

std::string toLower( std::string str ) {
    std::transform( str.begin(), str.end(), str.begin(), ::tolower );
    return str;
}

std::string toUpper( std::string str ) {
    std::transform( str.begin(), str.end(), str.begin(), ::toupper );
    return str;
}

namespace fs {

std::string toNative( const std::string &p ) {
    std::string out = p;
#ifdef _WIN32
    std::replace( out.begin(), out.end(), '/', '\\' );
#else
    std::replace( out.begin(), out.end(), '\\', '/' );
#endif
    return out;
}

std::string safeJoin( const std::string &base, const std::string &relative ) {
    if ( relative.empty() )
        return base;

    // Normalize separators to forward slash for parsing
    std::string cleaned = relative;
    std::replace( cleaned.begin(), cleaned.end(), '\\', '/' );

    // Split and verify each component
    std::stringstream ss( cleaned );
    std::string part;
    stdfs::path full( base );
    while ( std::getline( ss, part, '/' ) ) {
        if ( part.empty() || part == "." )
            continue;
        if ( part == ".." )
            return ""; // reject traversal
        full /= part;
    }
    return full.string();
}

bool isWithin( const std::string &base, const std::string &path ) {
    std::error_code ec;
    auto baseCanonical = stdfs::weakly_canonical( base, ec );
    if ( ec )
        return false;
    auto pathCanonical = stdfs::weakly_canonical( path, ec );
    if ( ec )
        return false;

    // 检查路径是否在基础路径下
    auto rel = stdfs::relative( pathCanonical, baseCanonical, ec );
    if ( ec )
        return false;
    std::string relStr = rel.string();
    // 相对路径为空（等于 base）或以 "..\" / "../" 开头（逃逸到上层）都不在 base 下
    if ( relStr.empty() || relStr == ".." )
        return false;
    if ( relStr.size() >= 2 && relStr[0] == '.' && relStr[1] == '.' &&
         ( relStr.size() == 2 || relStr[2] == '\\' || relStr[2] == '/' ) )
        return false;
    return true;
}

std::string fileTimeFormat( std::time_t t ) {
    std::tm tm{};
#ifdef _WIN32
    gmtime_s( &tm, &t );
#else
    gmtime_r( &t, &tm );
#endif
    char buf[32];
    std::strftime( buf, sizeof( buf ), "%Y-%m-%dT%H:%M:%SZ", &tm );
    return buf;
}

bool isHiddenEntry( const std::string &nativePath, const std::string &name ) {
    // Unix 风格：以 . 开头视为隐藏
    if ( !name.empty() && name[0] == '.' )
        return true;
#ifdef _WIN32
    // Windows：以属性为准（HIDDEN / SYSTEM），通过 std::filesystem::path::wstring 取得 native 宽字符
    try {
        std::wstring wpath = stdfs::path( nativePath ).wstring();
        DWORD attr = GetFileAttributesW( wpath.c_str() );
        if ( attr != INVALID_FILE_ATTRIBUTES ) {
            if ( attr & FILE_ATTRIBUTE_HIDDEN )
                return true;
            if ( attr & FILE_ATTRIBUTE_SYSTEM )
                return true;
        }
    } catch ( ... ) {
        // 失败时按非隐藏处理
    }
#else
    (void)nativePath;
#endif
    return false;
}

std::vector<DirEntry> listDir( const std::string &nativePath, std::string *err, bool showHidden ) {
    std::vector<DirEntry> entries;
    std::error_code ec;
    if ( !stdfs::is_directory( nativePath, ec ) ) {
        if ( err )
            *err = "Not a directory";
        return entries;
    }
    for ( auto &it : stdfs::directory_iterator( nativePath, ec ) ) {
        DirEntry e;
        e.name = it.path().filename().string();
        if ( e.name.empty() )
            continue;
        e.isDir = it.is_directory( ec );
        e.size = e.isDir ? 0 : static_cast<int64_t>( it.file_size( ec ) );
        auto ftime = it.last_write_time( ec );
        auto sctp = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
            ftime - decltype( ftime )::clock::now() + std::chrono::system_clock::now() );
        e.modified = fileTimeFormat( std::chrono::system_clock::to_time_t( sctp ) );
        if ( !showHidden && isHiddenEntry( it.path().string(), e.name ) )
            continue;
        entries.push_back( std::move( e ) );
    }
    // Sort: directories first, then by name (case-insensitive)
    std::sort( entries.begin(), entries.end(), []( const DirEntry &a, const DirEntry &b ) {
        if ( a.isDir != b.isDir )
            return a.isDir;
        // Case-insensitive compare
        std::string an = a.name, bn = b.name;
        std::transform( an.begin(), an.end(), an.begin(), ::tolower );
        std::transform( bn.begin(), bn.end(), bn.begin(), ::tolower );
        return an < bn;
    } );
    return entries;
}

int64_t fileSize( const std::string &nativePath ) {
    std::error_code ec;
    auto s = stdfs::file_size( nativePath, ec );
    if ( ec )
        return -1;
    return static_cast<int64_t>( s );
}

std::string fileModifiedTime( const std::string &nativePath ) {
    std::error_code ec;
    auto ftime = stdfs::last_write_time( nativePath, ec );
    if ( ec )
        return "";
    auto sctp = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
        ftime - decltype( ftime )::clock::now() + std::chrono::system_clock::now() );
    return fileTimeFormat( std::chrono::system_clock::to_time_t( sctp ) );
}

std::vector<std::string> listRoots() {
    std::vector<std::string> roots;
#ifdef _WIN32
    char buf[256];
    DWORD len = GetLogicalDriveStringsA( sizeof( buf ), buf );
    if ( len > 0 && len < sizeof( buf ) ) {
        const char *p = buf;
        while ( *p ) {
            roots.push_back( std::string( p ) );
            p += std::strlen( p ) + 1;
        }
    }
#else
    roots.push_back( "/" );
#endif
    return roots;
}

bool readFile( const std::string &path, std::string &out ) {
    std::ifstream ifs( utf8ToLocal( path ), std::ios::binary );
    if ( !ifs )
        return false;
    out.assign( std::istreambuf_iterator<char>( ifs ), std::istreambuf_iterator<char>() );
    return true;
}

bool writeFile( const std::string &path, const std::string &data ) {
    std::ofstream ofs( utf8ToLocal( path ), std::ios::binary | std::ios::trunc );
    if ( !ofs )
        return false;
    ofs.write( data.data(), data.size() );
    return ofs.good();
}

bool makeDir( const std::string &nativePath ) {
    std::error_code ec;
    stdfs::create_directories( nativePath, ec );
    return !ec;
}

bool makeLink( const std::string &sourcePath, const std::string &linkPath ) {
    std::error_code ec;
    stdfs::create_symlink( sourcePath, linkPath, ec );
    return !ec;
}

bool remove( const std::string &nativePath ) {
    std::error_code ec;
    return stdfs::remove_all( nativePath, ec ) > 0;
}

} // namespace fs

} // namespace utils

Logger::OStream &operator<<( Logger::OStream &&os, const std::wstring &msg ) {
    return os.operator<<( utils::wstring_to_string( msg ) );
}

Logger::OStream &operator<<( Logger::OStream &&os, const wchar_t *msg ) {
    return operator<<( std::move( os ), std::wstring( msg ) );
}