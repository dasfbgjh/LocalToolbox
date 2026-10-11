#ifndef DATABASE_H
#define DATABASE_H

#include <sqlite3.h>
#include <string>
#include <vector>
#include <map>
#include <mutex>
#include <memory>
#include <optional>
#include <nlohmann/json.hpp>
#include "resource.h"
#include "common/Utils.h"
#include "common/Logger.hpp"

class Database {
private:
    std::string m_path;
    sqlite3 *m_db = nullptr;
    std::mutex m_mtx;

private:
    void initSchema();
    void seedDefaultData();
    bool migration( const std::string &column, const std::string &defaultValue );

public:
    using json = nlohmann::json;
    using Row = std::map<std::string, std::string>;
    using Rows = std::vector<Row>;

    explicit Database( const std::string &path );
    ~Database();

    Database( const Database & ) = delete;
    Database &operator=( const Database & ) = delete;

    // 执行一个不返回行的语句，返回受影响的行数。
    int exec( const std::string &sql );

    // 查询行
    Rows query( const std::string &sql );

    // 执行参数化语句，返回受影响的行数。
    int execParams( const std::string &sql, const std::vector<std::pair<int, std::string>> &params );

    int lastInsertRowId();

    sqlite3 *handle();
    std::mutex &mutex();

    // 对SQL字符串进行转义，防止SQL注入
    static std::string sqlEscape( const std::string &s );

    // 读取应用配置（键值对表，返回 JSON 对象，无数据则返回空对象）
    static json::array_t getAppConfig( const std::string &databasePath );

    // 保存应用配置（遍历 JSON 的每个键值对，INSERT OR REPLACE 到 app_config 表）
    bool saveAppConfig( const json::array_t &config );

    // 读取用户设置（返回 JSON 对象，key→value）
    json getUserSettings( const std::string &userId );

    // 写入用户设置（单条 INSERT OR REPLACE）
    bool setUserSetting( const std::string &userId, const std::string &key, const std::string &value );

    // 删除用户设置
    bool deleteUserSetting( const std::string &userId, const std::string &key );
};

#endif // DATABASE_H
