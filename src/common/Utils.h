#ifndef UTILS_H
#define UTILS_H

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#endif

#include <cstdint>
#include <cstring>
#include <cstdio>
#include <random>
#include <sstream>
#include <iomanip>
#include <string>
#include <vector>
#include <map>
#include <chrono>
#include <ctime>
#include <algorithm>

#ifndef _WIN32
#include <unistd.h>
#include <ifaddrs.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#endif

#include "common/Logger.hpp"
#include "nlohmann/json.hpp"

namespace utils {
using json = nlohmann::json;

std::string toHex( const uint8_t *data, size_t len );
std::vector<uint8_t> fromHex( const std::string &s );

std::string base64Encode( const uint8_t *data, size_t len );
std::string base64Encode( const std::string &s );
std::vector<uint8_t> base64Decode( const std::string &s );

std::string urlEncode( const std::string &s );
std::string urlDecode( const std::string &s );

std::string randomHex( size_t bytes );

std::string generateId();
std::string generateToken();
std::string generateInviteCode();

std::string nowIso();
std::time_t parseIso( const std::string &s );
std::time_t nowTime();
std::string formatDistanceToNow( const std::string &dateStr );

std::map<std::string, std::string> parseCookies( const std::string &cookieHeader );

std::vector<std::string> getLocalIPs();

void openHome( const std::string &path = "/" );
void openBrowser( const std::string &url );
void openDirectory( const std::string &path );

void makeDesktopShortcut( const std::string &path, const std::string &name );

bool isValidUtf8( const std::string &str );

// 将非法 UTF-8 字节替换为 U+FFFD（UTF-8: EF BF BD）
std::string sanitizeUtf8( const std::string &in );

std::string utf8ToLocal( const std::string &utf8 );

std::string localToUtf8( const std::string &local );

std::string wstring_to_string( const std::wstring &wstr );

// 获取JSON中的字符串字段，不存在则返回空字符串
std::string jsonStringValue( const json &j, const std::string &key );

bool startWith( const std::string &str, const std::string &prefix );

bool endWith( const std::string &str, const std::string &suffix );

std::string toLower( std::string str );

std::string toUpper( std::string str );

namespace fs {

struct DirEntry {
    std::string name;
    bool isDir;
    int64_t size;
    std::string modified; // ISO 8601 UTC
};

std::string toNative( const std::string &path );

std::string safeJoin( const std::string &base, const std::string &relative );

// 检查路径是否在基础路径下
bool isWithin( const std::string &base, const std::string &path );

std::string fileTimeFormat( std::time_t t );

// 列出目录内容。showHidden=false 时跳过以 . 开头的文件以及 Windows 隐藏/系统属性文件。
std::vector<DirEntry> listDir( const std::string &nativePath, std::string *err = nullptr, bool showHidden = false );

// 判断文件/目录是否视为隐藏（以 . 开头 或 Windows 隐藏/系统属性）
bool isHiddenEntry( const std::string &nativePath, const std::string &name );

int64_t fileSize( const std::string &nativePath );

std::string fileModifiedTime( const std::string &nativePath );

std::vector<std::string> listRoots();

bool readFile( const std::string &path, std::string &out );

bool writeFile( const std::string &path, const std::string &data );

bool makeDir( const std::string &nativePath );

bool makeLink( const std::string &sourcePath, const std::string &linkPath );

bool remove( const std::string &nativePath );

} // namespace fs

} // namespace utils

Logger::OStream &operator<<( Logger::OStream &&os, const std::wstring &msg );

Logger::OStream &operator<<( Logger::OStream &&os, const wchar_t *msg );
#endif // UTILS_H