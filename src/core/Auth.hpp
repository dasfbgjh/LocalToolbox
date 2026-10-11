#ifndef AUTH_HPP
#define AUTH_HPP

#include <string>
#include <optional>
#include <vector>
#include "common/App.h"
#include "common/Logger.hpp"
#include "core/Sha256.h"
#include "common/Utils.h"

namespace core::auth {
using json = nlohmann::json;

struct UserInfo {
    std::string id;
    std::string email;
    std::string nickname;
    std::string createdAt;
};

const std::string COOKIE_NAME = "auth-token";
const int SESSION_DAYS = 7;
const int PBKDF2_ITERATIONS = 10000;

// Hash password with PBKDF2. Format: "pbkdf2$iterations$saltHex$hashHex"
inline std::string hashPassword( const std::string &password ) {
    std::string salt = utils::randomHex( 16 ); // 16 bytes salt
    auto saltBytes = utils::fromHex( salt );
    auto dk = Sha256::pbkdf2Sha256( password, saltBytes.data(), saltBytes.size(), PBKDF2_ITERATIONS, 32 );
    std::string hashHex = utils::toHex( dk.data(), dk.size() );
    LOG_DEBUG << "密码哈希完成 (PBKDF2 iterations=" << PBKDF2_ITERATIONS << ")";
    return "pbkdf2$" + std::to_string( PBKDF2_ITERATIONS ) + "$" + salt + "$" + hashHex;
}

// Verify password against stored hash
inline bool verifyPassword( const std::string &password, const std::string &stored ) {
    // Format: pbkdf2$iterations$saltHex$hashHex
    if ( stored.rfind( "pbkdf2$", 0 ) != 0 ) {
        LOG_WARN << "密码验证失败: 存储格式无效 (缺少pbkdf2前缀)";
        return false;
    }
    size_t p1 = stored.find( '$', 7 );  // "pbkdf2$" is 7 chars, start at position 7
    if ( p1 == std::string::npos ) {
        LOG_WARN << "密码验证失败: 存储格式无效 (缺少iterations分隔符)";
        return false;
    }
    size_t p2 = stored.find( '$', p1 + 1 );
    if ( p2 == std::string::npos ) {
        LOG_WARN << "密码验证失败: 存储格式无效 (缺少hash分隔符)";
        return false;
    }
    int iterations = std::stoi( stored.substr( 7, p1 - 7 ) );  // start at 7, length is p1-7
    std::string saltHex = stored.substr( p1 + 1, p2 - p1 - 1 );
    std::string hashHex = stored.substr( p2 + 1 );
    auto saltBytes = utils::fromHex( saltHex );
    auto dk = Sha256::pbkdf2Sha256( password, saltBytes.data(), saltBytes.size(), iterations, 32 );
    std::string computed = utils::toHex( dk.data(), dk.size() );
    bool ok = computed == hashHex;
    if ( !ok )
        LOG_DEBUG << "密码验证失败: 哈希不匹配";
    else
        LOG_DEBUG << "密码验证成功";
    return ok;
}

// Create session in DB, return token
inline std::string createSession( const std::string &userId ) {
    std::string token = utils::generateToken();
    std::string now = utils::nowIso();
    std::time_t exp = utils::nowTime() + SESSION_DAYS * 86400;
    std::tm tm{};
#ifdef _WIN32
    gmtime_s( &tm, &exp );
#else
    gmtime_r( &exp, &tm );
#endif
    char buf[32];
    std::strftime( buf, sizeof( buf ), "%Y-%m-%dT%H:%M:%SZ", &tm );
    App::getInstance()->getDatabase().execParams(
        "INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)",
        { { 1, token }, { 2, userId }, { 3, std::string( buf ) } } );
    LOG_INFO << "创建会话成功,用户ID: " << userId << " 有效期至: " << buf;
    (void)now;
    return token;
}

inline void deleteSession( const std::string &token ) {
    LOG_DEBUG << "删除会话,token前8位: " << ( token.size() >= 8 ? token.substr( 0, 8 ) : "N/A" );
    App::getInstance()->getDatabase().execParams( "DELETE FROM sessions WHERE token=?", { { 1, token } } );
}

// Get user id from request (via cookie session)
inline std::optional<std::string> getUserIdFromRequest( const httplib::Request &req ) {
    auto it = req.headers.find( "Cookie" );
    if ( it == req.headers.end() )
        return std::nullopt;
    auto cookies = utils::parseCookies( it->second );
    auto cit = cookies.find( COOKIE_NAME );
    if ( cit == cookies.end() )
        return std::nullopt;
    std::string token = cit->second;
    auto rows = App::getInstance()->getDatabase().query(
        "SELECT user_id, expires_at FROM sessions WHERE token='" + token + "'" );
    if ( rows.empty() ) {
        LOG_DEBUG << "会话验证失败: token不存在";
        return std::nullopt;
    }
    std::string expiresAt = rows[0]["expires_at"];
    if ( utils::parseIso( expiresAt ) < utils::nowTime() ) {
        LOG_INFO << "会话已过期,用户ID: " << rows[0]["user_id"] << " 删除过期会话";
        App::getInstance()->getDatabase().execParams( "DELETE FROM sessions WHERE token=?", { { 1, token } } );
        return std::nullopt;
    }
    return rows[0]["user_id"];
}

inline std::optional<UserInfo> getUserFromRequest( const httplib::Request &req ) {
    auto uid = getUserIdFromRequest( req );
    if ( !uid )
        return std::nullopt;
    auto rows = App::getInstance()->getDatabase().query(
        "SELECT id,email,nickname,created_at FROM users WHERE id='" + *uid + "'" );
    if ( rows.empty() ) {
        LOG_WARN << "会话存在但用户不存在,用户ID: " << *uid;
        return std::nullopt;
    }
    UserInfo u;
    u.id = rows[0]["id"];
    u.email = rows[0]["email"];
    u.nickname = rows[0]["nickname"];
    u.createdAt = rows[0]["created_at"];
    return u;
}

inline void setAuthCookie( httplib::Response &res, const std::string &token ) {
    std::string cookie = COOKIE_NAME + "=" + token +
                         "; HttpOnly; Path=/; Max-Age=" +
                         std::to_string( SESSION_DAYS * 86400 ) +
                         "; SameSite=Lax";
    res.set_header( "Set-Cookie", cookie );
    LOG_DEBUG << "设置认证Cookie (Max-Age=" << SESSION_DAYS << "天)";
}

inline void clearAuthCookie( httplib::Response &res ) {
    std::string cookie = COOKIE_NAME + "=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
    res.set_header( "Set-Cookie", cookie );
    LOG_DEBUG << "清除认证Cookie";
}

// Ensure the anonymous user exists, return its id
inline std::string ensureAnonymousUser() {
    auto rows = App::getInstance()->getDatabase().query( "SELECT id FROM users WHERE id='anonymous'" );
    if ( !rows.empty() )
        return "anonymous";
    LOG_INFO << "匿名用户不存在，创建匿名用户账号";
    std::string now = utils::nowIso();
    App::getInstance()->getDatabase().execParams(
        "INSERT INTO users(id,email,nickname,password,created_at) VALUES(?,?,?,?,?)",
        { { 1, "anonymous" }, { 2, "anonymous@clipboard.local" }, { 3, "匿名用户" }, { 4, "anonymous" }, { 5, now } } );
    return "anonymous";
}

// Serialize user info to JSON
inline json userToJson( const UserInfo &u ) {
    return json{
        { "id", u.id },
        { "email", u.email },
        { "nickname", u.nickname.empty() ? json( nullptr ) : json( u.nickname ) },
        { "createdAt", u.createdAt } };
}

} // namespace core::auth

#endif // AUTH_HPP