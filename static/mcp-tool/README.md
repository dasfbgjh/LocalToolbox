# MCP Tool 配置说明

1. 一个工具一个目录，目录名称为工具名称

2. 每个工具目录下包含一个`config.json`文件，用于配置工具的参数。、
   - `name`：工具名称，与工具目录名称一致
   - `desc`：工具描述
   - `method`：工具调用方法，`get`、`post`、`update`、`delete`、`command`、`static`
   - `entry`：工具调用入口，例如`http://127.0.0.1:3100`、`ls`
   - `extension`：HTTP 请求头或进程环境变量，例如`{"Content-Type": "application/json"}`、`{"PATH": "/bin:/usr/bin"}`

| method值 | 说明                                          |
|----------|-----------------------------------------------|
| get      | HTTP GET 请求，params 字符串 作为查询参数       |
| post     | HTTP POST 请求，params 任意值 作为请求体        |
| update   | HTTP PUT 请求，params 任意值 作为请求体         |
| delete   | HTTP DELETE 请求，params 任意值 作为请求体      |
| command  | 同步执行进程，entry 为命令，params 数组 作为参数 |
| static   | 读取工具目录下 result.md 文件，返回文件内容      |

示例:
```json
{
    "name": "test",
    "desc": "测试工具调用",
    "method": "get",
    "entry": "http://127.0.0.1:3100",
    "extension": {"Content-Type": "application/json"}
}
```

3. 工具使用方法写入工具目录下的`instruction.md`文件中

4. 工具目录上一级下可添加`extension.json`文件，在其中可添加全局的HTTP 请求头或进程环境变量

# 调用工具

提供的相关方法如下：

| 方法名                | 描述                                                                 |
|-----------------------|----------------------------------------------------------------------|
| get_tools             | 获取工具列表，支持搜索和分页                                            |
| get_tool_instructions | 获取指定工具的用法说明                                                 |
| tool_run              | 执行指定工具                                                          |
| get_tool_result       | 读取工具执行结果，支持按字符(char)或按行(line)模式读取指定区间            |
| search_tool_result    | 搜索工具执行结果，支持字符串搜索和正则表达式，返回匹配结果集(位置/长度/内容)|
| remove_tool_result    | 根据结果 ID 移除存储的工具执行结果，释放内存     

1. 执行工具
    - `name`：工具名称，与工具目录名称一致
    - `params`：工具调用参数，根据工具不同而不同。
    - `direct_return`：是否直接返回工具调用结果，`true` 表示直接返回，`false` 返回结果大小和一个id，后续可通过id获取结果

调用示例:
```json
{
    "name" : "test",
    "params" : {},
    "direct_return" : true
}
```