# LocalToolbox 项目 Code Wiki

> **版本**: v1.0.3  
> **语言**: C++17 + JavaScript  
> **构建工具**: CMake 3.10+  
> **许可证**: MIT  

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [目录结构详解](#3-目录结构详解)
4. [构建系统](#4-构建系统)
5. [核心模块详解](#5-核心模块详解)
   - 5.1 [common 模块 - 基础组件](#51-common-模块---基础组件)
   - 5.2 [core 模块 - 核心引擎](#52-core-模块---核心引擎)
   - 5.3 [routes 模块 - API 路由层](#53-routes-模块---api-路由层)
6. [数据库设计](#6-数据库设计)
7. [前端架构](#7-前端架构)
8. [MCP 协议实现](#8-mcp-协议实现)
9. [第三方依赖](#9-第三方依赖)
10. [项目运行方式](#10-项目运行方式)
11. [开发调试指南](#11-开发调试指南)
12. [附录：关键配置项](#12-附录关键配置项)

---

## 1. 项目概述

**LocalToolbox** 是一款面向开发者的综合性本地工具箱桌面应用，采用 **C++ 后端 + Web 前端** 的混合架构，通过 **WebView** 提供原生桌面体验。应用集成了 **100+ 在线开发小工具** 以及 **系统级本地工具**（HTTP 文件服务器、进程管理器、系统监视器、音乐播放器、ADB 调试、游戏启动器等），同时实现了团队协作功能（剪贴板共享、文件分享）和 MCP (Model Context Protocol) 协议服务（含服务端与客户端）。

### 核心功能领域

| 功能域 | 说明 |
|--------|------|
| 🔐 账户权限系统 | 用户注册/登录/会话管理、Token 认证、管理员后台 |
| 📋 团队剪贴板 | 多人协作剪贴板、文本/HTML/图片/文件历史、邀请码机制 |
| 📁 文件分享服务 | 文件/目录分享、细粒度权限控制（访问/下载/上传/删除/重命名） |
| 🛠 在线小工具(100+) | 文本处理、编码转换、加密安全、网络工具、开发辅助、计算工具、图片处理、PDF 工具 |
| 💻 本地系统工具 | HTTP 服务器管理、进程管理器、系统监视器、批处理重命名、FFmpeg、证书管理、文档阅读、OCR 识别、图片标注、音乐播放器、ADB 调试、游戏启动器、MCP 调试器 |
| 🔌 MCP 服务 | 服务端（供 AI IDE 调用本地工具）+ 客户端（连接外部 MCP 服务调试） |

---

## 2. 整体架构

### 2.1 架构分层图

```
┌───────────────────────────────────────────────────────────────────┐
│                        用户交互层 (UI)                             │
│  ┌──────────────┐     ┌──────────────────┐     ┌───────────────┐  │
│  │  WebView 窗口 │     │  外部浏览器访问   │     │  系统托盘菜单  │  │
│  └──────┬───────┘     └────────┬─────────┘     └───────┬───────┘  │
└─────────┼──────────────────────┼───────────────────────┼──────────┘
          │                      │                       │
┌─────────▼──────────────────────▼───────────────────────▼──────────┐
│                     HTTP 服务层 (httplib)                          │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  静态资源服务  │  REST API 路由  │  MCP JSON-RPC / SSE        │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬───────────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────────┐
│                     核心业务层 (Core)                              │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────────────────┐  │
│  │  Server  │ │ Database │ │  Config   │ │ WebviewWrapper     │  │
│  └──────────┘ └──────────┘ └───────────┘ └────────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────────────────┐  │
│  │ ProcMgr  │ │ HttpSrvM │ │TransTracker│ │ McpServer/McpCore  │  │
│  └──────────┘ └──────────┘ └───────────┘ └────────────────────┘  │
└───────────────────────────┬───────────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────────┐
│                     基础设施层 (3rdparty)                          │
│  SQLite3 │ Boost │ OpenSSL │ httplib │ hwinfo │ webview │ STB    │
│  RapidOCR │ qrcodegen │ CLI11 │ nlohmann/json │ tray              │
└───────────────────────────────────────────────────────────────────┘
```

### 2.2 启动流程

```
main()
  │
  ├─► Config::init(argc, argv)          // 解析命令行 + 配置文件合并
  │
  ├─► App::isBoot()                     // 单例互斥锁检查 + IPC 消息处理
  │
  └─► App app; app.init()
        │
        ├─► 初始化 SQLite 数据库 (Database)
        │     └─► 执行 schema.sql + 迁移 + 种子数据
        │
        ├─► 保存合并后的配置到 app_config 表
        │
        ├─► 配置 Logger 等级和文件输出
        │
        └─► 加载系统托盘菜单 (SystemTray)
  │
  └─► app.exec()
        │
        ├─► Server::listen()           // 启动 HTTP/HTTPS 双线程
        │     ├─► startHttp(port)      // httplib::Server listen("0.0.0.0", port)
        │     └─► startHttps(port)     // 可选 SSL 服务
        │
        ├─► HttpServerManager::startAutoStart()  // 启动标记为自启的文件服务器
        ├─► ProcManager::startAutoStart()        // 启动标记为自启的进程
        │
        ├─► EventLoop 定时器 (30ms) 轮询
        │     ├─► tray->poll()         // 处理托盘菜单事件
        │     ├─► handleEventHandlers() // 处理异步事件队列
        │     └─► listenLocalServer()  // 监听命名管道 IPC (500ms 间隔)
        │
        └─► 退出时清理: shutdownAll -> stop webview -> stop server
```

---

## 3. 目录结构详解

```
d:\project\cmake\Tools\
│
├── 3rdparty/                      # 第三方库源码（直接嵌入编译）
│   ├── OnnxOCR/                   # OCR 引擎（ONNX Runtime 动态加载器）
│   │   └── ocr_dynamic_loader.cpp # 运行时加载 RapidOcrOnnx.dll
│   ├── cli11/                     # 命令行解析库 (header-only)
│   │   └── CLI11.hpp
│   ├── httplib/                   # C++ HTTP 服务器/客户端库
│   │   └── httplib.h
│   ├── hwinfo/                    # 硬件信息采集库 (CPU/内存/磁盘/GPU等)
│   │   ├── include/hwinfo/*.h
│   │   └── src/{windows,linux,apple}/
│   ├── qrcodegen/                 # 二维码生成库
│   │   ├── qrcodegen.hpp / qrcodegen.cpp
│   ├── stb/                       # STB 系列图像库 (stb_image 等)
│   ├── tray/                      # 跨平台系统托盘库
│   │   └── include/tray/tray.h
│   ├── webview/                   # 跨平台 WebView 封装库
│   │   └── core/include/webview/
│   └── webview2/                  # Windows WebView2 SDK 头文件
│       └── include/WebView2*.h
│
├── appInfo/                       # 应用元信息与 Windows 资源
│   ├── AppInfo.cmake              # CMake 模块：版本号/组织名等宏
│   ├── config/
│   │   ├── AppInfo.h.in           # AppInfo.h 模板
│   │   ├── winLogo.ico            # 应用图标
│   │   ├── winManifest.manifest.in # Windows Manifest
│   │   └── winRC.rc.in            # Windows 资源文件模板
│   └── include/
│       ├── AppExtension.hpp       # 控制台输出编码扩展
│       └── WinInfo.h              # Windows 版本信息
│
├── bin/                           # 编译输出与运行时目录
│   ├── RapidOCR/                  # OCR 模型文件与 DLL（由 OnnxOCR 动态加载）
│   │   ├── ch-mobile-v4/{det,cls,rec}.onnx, keys.txt
│   │   └── RapidOcrOnnx.dll
│   ├── pdf_tool.exe               # PDF 处理外部工具
│   └── LocalToolbox               # 主程序 (CMake 生成)
│
├── resource/                      # 前端资源与资源打包系统
│   ├── CMakeLists.txt             # 资源编译：生成 tools_resource 静态库
│   ├── include/resource.h         # 资源嵌入 API (resource_get/resource_exists)
│   ├── src/
│   │   ├── generate.cpp           # 资源打包工具：扫描 data/ -> 生成 data.h
│   │   └── resource.cpp           # 运行时资源读取接口实现
│   └── data/                      # 原始资源文件
│       ├── sql/schema.sql         # 数据库初始化脚本
│       ├── image/tray.ico         # 托盘图标
│       └── html/                  # 前端页面与脚本
│
├── src/                           # C++ 后端源码
│   ├── main.cpp                   # 程序入口
│   ├── common/                    # 通用基础模块
│   │   ├── App.h/cpp              # 应用主类：生命周期、托盘、IPC
│   │   ├── Config.h/cpp           # 全局配置：CLI 解析 + DB 持久化
│   │   ├── EventLoop.h/cpp        # 事件循环：定时器 + 异步任务
│   │   ├── Logger.hpp             # 日志系统（流式宏）
│   │   └── SystemTray.h/cpp       # 系统托盘封装
│   ├── core/                      # 核心业务引擎
│   │   ├── Server.h/cpp           # HTTP 服务器：路由注册、静态资源服务
│   │   ├── Database.h/cpp         # SQLite3 封装
│   │   ├── McpCore.h/cpp          # MCP 协议数据结构与序列化
│   │   ├── McpServer.h/cpp        # MCP 服务端引擎：工具/资源注册与调度
│   │   ├── McpClient.h/cpp        # MCP 客户端：连接外部 MCP 服务（HTTP/SSE/stdio）
│   │   ├── McpTools.h/cpp         # MCP 内置工具注册（echo/get_time/list_directory 等）
│   │   ├── CertGenerator.h/cpp    # SSL/TLS 证书生成（OpenSSL 原生 API）
│   │   ├── WebviewWrapper.h/cpp   # WebView 生命周期与 JS 绑定
│   │   ├── HttpServerManager.h/cpp # 多实例 HTTP 文件服务器管理
│   │   ├── ProcManager.h/cpp      # 进程管理器：启动/监控/日志环形缓冲
│   │   ├── TransferTracker.h/cpp  # 文件传输进度追踪
│   │   ├── Sha256.h/cpp           # SHA256 哈希实现
│   │   ├── Utils.h/cpp            # 通用工具函数（文件/字符串/URL/加密）
│   │   └── Auth.hpp               # 认证鉴权中间件
│   └── routes/                    # API 路由模块（每个 .cpp 注册一组端点）
    ├── Admin.h/cpp            # /api/admin/*    管理员后台
    ├── Auth.h/cpp             # /api/auth/*     登录注册会话
    ├── Clipboard.h/cpp        # /api/clipboard/* 团队剪贴板
    ├── Teams.h/cpp            # /api/teams/*    团队管理
    ├── FileService.h/cpp      # /api/fileservice/* 文件分享服务
    ├── Tools.h/cpp            # /api/tools/*    100+ 在线小工具后端
    ├── PdfTools.h/cpp         # /api/pdf/*      PDF 处理工具
    ├── OcrTools.h/cpp         # /api/ocr/*      OCR 文字识别
    ├── FfmpegTool.h/cpp       # /api/ffmpeg/*   音视频转码与下载
    ├── CertTool.h/cpp         # /api/cert/*     SSL/TLS 证书工具
    ├── DocTool.h/cpp          # /api/docs/*     文档聚合阅读器
    ├── SysMonitor.h/cpp       # /api/local/sysmon/* 系统监控
    ├── ADBTool.h/cpp          # /api/local/adb/* ADB 安卓调试工具
    ├── MusicTool.h/cpp        # /api/local/music/* 音乐播放器
    ├── GameTool.h/cpp         # /api/game/*     游戏启动器（内置 HTTP 服务）
    ├── LocalTools.h/cpp       # /api/local/*    本地工具（聚合 cert/docs/music/sysmon/adb 子模块）
    ├── Mcp.h/cpp              # /mcp            MCP 协议 HTTP 端点
    └── Settings.h/cpp         # /api/settings/* 用户/全局设置
│
├── CMakeLists.txt                 # 顶层构建脚本
└── README.md                      # 用户使用文档
```

---

## 4. 构建系统

### 4.1 构建工具链要求

| 组件 | 最低版本 | 说明 |
|------|----------|------|
| CMake | 3.10 | 构建系统 |
| C++ 标准 | C++17 | 代码使用 `std::filesystem`、`std::optional`、结构化绑定等特性 |
| MinGW-w64 GCC | 推荐 | 官方支持的编译工具链 |
| MSVC 2019 | 兼容 | 也可使用 Visual Studio 2019 Enterprise |

### 4.2 CMake 关键配置说明

**输出位置**: 所有可执行文件输出到 `${CMAKE_SOURCE_DIR}/bin/`

**可执行目标**:
- `LocalToolbox` - 主程序（Release 模式加 `WIN32` 标志，无控制台窗口）
- `test` - 测试程序（独立测试目标）

**静态链接**: Release 模式下启用 `-static-libstdc++ -static-libgcc -static`，生成独立运行的 exe。

**条件编译宏**:
| 宏 | 说明 |
|----|------|
| `CPPHTTPLIB_OPENSSL_SUPPORT` | 启用 httplib 的 HTTPS 支持 |
| `_WIN32_WINNT=0x0A00` | Windows 10 API 目标平台 |
| `TRAY_WINAPI=1` | 启用系统托盘 Win32 API 后端 |
| `CMAKE_SOURCE_DIR="..."` | 日志路径转换用 |
| `RESOURCE_PATH="..."` | Debug 模式：直接从磁盘读资源文件 |

### 4.3 资源打包机制

Release 模式下，所有前端资源编译进二进制：

```
resource/data/html/*  ──► generate.exe ──► data.h (字节数组)
                                            │
                                            ▼
resource.cpp 包含 resource_get()  ──► tools_resource 静态库
                                            │
                                            ▼
                                    LocalToolbox 直接链接
```

API:
```cpp
// 查询资源是否存在
bool resource_exists(const char* name);

// 获取资源数据指针和大小（返回 -1 表示不存在）
int resource_get(const char* name, const unsigned char** data);
```

### 4.4 构建命令示例

使用 MinGW64 + Ninja（推荐）:
```bash
mkdir build && cd build
cmake -G Ninja -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_C_COMPILER=C:/msys64/mingw64/bin/gcc.exe \
      -DCMAKE_CXX_COMPILER=C:/msys64/mingw64/bin/g++.exe ..
cmake --build .
# 输出: ../bin/LocalToolbox
```

Debug 模式（修改前端无需重编译资源）:
```bash
cmake -G Ninja -DCMAKE_BUILD_TYPE=Debug ..
cmake --build .
```

---

## 5. 核心模块详解

---

### 5.1 common 模块 - 基础组件

#### 5.1.1 App 类 ([App.h](file:///d:/project/cmake/Tools/src/common/App.h), [App.cpp](file:///d:/project/cmake/Tools/src/common/App.cpp))

**职责**: 应用程序主控制器，负责生命周期、单例保障、托盘菜单、跨进程通信。

**关键成员变量**:
| 成员 | 类型 | 说明 |
|------|------|------|
| `m_server` | `Server` | HTTP 服务器实例 |
| `m_db` | `shared_ptr<Database>` | 全局数据库连接 |
| `m_systemTray` | `unique_ptr<SystemTray>` | 系统托盘 |
| `webview` | `WebviewWrapper` | WebView 窗口 |
| `m_eventHandlers` | `list<function<void(App*)>>` | 异步事件队列 |
| `g_instance` | `static App*` | 单例指针 |
| `g_mutex` | `static HANDLE` | 全局互斥锁（单例保障） |
| `g_localServerName` | `static const char*` | 命名管道名 `"\\\\.\\pipe\\tools-ipc"` |

**关键方法**:

| 方法 | 签名 | 说明 |
|------|------|------|
| `init()` | `bool init()` | 初始化流程：建库 → 存配置 → 配日志 → 装盘菜单 |
| `exec()` | `int exec()` | 进入事件循环：启动 HTTP 线程 → 定时器轮询托盘/IPC |
| `exit()` | `void exit(int)` | 设置退出码，停止托盘循环 |
| `reboot()` | `void reboot()` | 标记重启，退出后由 `main()` 调用 `EventLoop::delayBoot` |
| `postEvent()` | `void postEvent(function<void(App*)>)` | 投递异步事件到下一帧处理 |
| `isBoot()` | `static bool isBoot()` | **入口处调用**：创建互斥锁判断单例，若已有实例则通过命名管道发送启动参数 |
| `listenLocalServer()` | `static void listenLocalServer(int timeout)` | 轮询接收命名管道 JSON 消息 |
| `sendLocalMessage()` | `static bool sendLocalMessage(const json&)` | 向已运行的主实例发消息 |
| `getInstance()` | `static App* getInstance()` | 获取全局单例指针 |
| `getDatabase()` | `Database& getDatabase()` | 获取数据库引用 |

**托盘菜单 ID 枚举 (MenuId)**:
- `OpenBrowser` / `OpenWebview` - 两种方式打开 UI
- `Settings` - 子菜单容器
- `EnableContextMenu` - 启用/禁用右键菜单开关
- `AutoBoot` - 启用/禁用开机自启开关
- `OpenAbout` / `Reboot` / `Exit` - 关于/重启/退出

---

#### 5.1.2 Config 类 ([Config.h](file:///d:/project/cmake/Tools/src/common/Config.h))

**职责**: 全局配置中心，三层配置合并（命令行 > 数据库 app_config > 默认值）。

**配置项分类**:

**不可配置项（运行时推导）**:
| 静态变量 | 说明 |
|----------|------|
| `appPath` | 可执行文件所在目录 |
| `databasePath` | SQLite DB 文件路径（默认 `<exeDir>/database.db`） |
| `enableContextmenu` | 右键菜单启用状态（写注册表） |
| `enableAutoBoot` | 开机自启状态（写注册表） |

**可配置项（支持持久化到 `app_config` 表）**:
| 静态变量 | 类型 | 默认/说明 |
|----------|------|-----------|
| `httpServerPort` | int | HTTP 服务端口（默认 3100） |
| `httpsServerPort` | int | HTTPS 端口（默认 3101） |
| `enableHttps` | bool | 是否启用 HTTPS |
| `sslCertPath` / `sslKeyPath` | string | SSL 证书/密钥路径 |
| `tempPath` | string | 临时文件目录 |
| `uploadFilePath` | string | 上传文件存储目录 |
| `maxUploadFileSize` | size_t | 最大上传文件大小 |
| `maxPdfSize` | size_t | PDF 文件大小上限 |
| `inviteCodeDurationSEC` | int | 团队邀请码有效期（秒） |
| `onlyLocalhost` | bool | 是否仅允许本机访问（pre_routing_handler 中强制 localhost 守卫） |
| `logLevel` | int | 0=DEBUG 1=INFO 2=WARN 3=ERROR |
| `logFileMode` | int | 0=OFF 1=SINGLE_FILE 2=MULTI_FILE |
| `logFilePath` | string | 日志文件路径 |
| `pdfToolPath` / `ffmpegPath` / `adbPath` | string | 外部工具路径（PDF / FFmpeg / ADB） |
| `bootParameter` | `vector<string>` | 启动参数 |

**关键方法**:
| 方法 | 说明 |
|------|------|
| `init(argc, argv)` | 入口调用：CLI11 解析 → 从数据库加载 → 合并覆盖 |
| `configJson(json::array_t&, char flag)` | 配置 ↔ JSON 数组序列化（flag=0 导出，flag=1 导入） |
| `getEnableContextmenu(reread)` / `setEnableContextmenu(enable)` | 读写 Windows 注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Discardable` 或等价键 |
| `getEnableAutoBoot(reread)` / `setEnableAutoBoot(enable)` | 读写注册表 `HKCU\...\Run` 实现开机自启 |
| `setPathParameter(args)` | 从启动参数提取文件路径，生成分享 ID 返回 |

---

#### 5.1.3 Logger.hpp 日志系统

**流式日志宏**:
```cpp
LOG_DEBUG << "变量值:" << x;   // 调试级别
LOG_INFO  << "启动成功";        // 信息级别
LOG_WARN  << "配置缺失";        // 警告级别
LOG_ERROR << "异常:" << e.what(); // 错误级别
```

**特性**:
- 线程安全（内部 `std::mutex`）
- 控制台输出 + 文件输出（单文件/按日期多文件/关闭 三模式）
- 自动在每条日志前附加：`[级别] [时间戳] [源文件:行号] 函数名`
- 路径相对化：用 `CMAKE_SOURCE_DIR` 宏裁剪绝对路径为相对路径

**FileMode 枚举**:
| 值 | 常量 | 说明 |
|----|------|------|
| 0 | `FILE_OFF` | 不写文件 |
| 1 | `SINGLE_FILE` | 写单一路径 |
| 2 | `MULTI_FILE` | 按日期切分（`app_YYYY-MM-DD.log`） |

---

#### 5.1.4 EventLoop ([EventLoop.h](file:///d:/project/cmake/Tools/src/common/EventLoop.h))

**职责**: 基于 `boost::asio::io_context` 的定时器 + 异步任务事件循环。

**关键方法**:
| 方法 | 签名 | 说明 |
|------|------|------|
| `instance()` | `static EventLoop& instance()` | 全局单例 |
| `runTimer(interval, callback)` | `TimerId runTimer(chrono::duration, F&&)` | 周期定时器，回调返回 bool 决定是否继续 |
| `post(task)` | `void post(F&&)` | 投递一次性异步任务 |
| `run()` | `size_t run()` | 阻塞运行 io_context，返回处理事件数 |
| `stop()` | `void stop()` | 停止事件循环 |
| `delayBoot(exePath, delaySec)` | `static void delayBoot(string, int)` | 延迟 N 秒后重新拉起本程序（用于重启） |

---

#### 5.1.5 SystemTray ([SystemTray.h](file:///d:/project/cmake/Tools/src/common/SystemTray.h))

**职责**: 对 `tray` 第三方库的面向对象封装，使用 Win32 API 后端 (`TRAY_WINAPI=1`)。

**菜单构建**:
```cpp
tray_menu* createMenu(const std::string& text, int id,
                      bool hasSubmenu = false, bool checked = false);
tray_menu* createSeparator();
void update(std::initializer_list<tray_menu*> rootItems);  // 重建菜单
void update();  // 刷新现有菜单（如勾选状态变化）
void setIconData(const unsigned char* icoData, int size);  // 从内存 ICO 设置图标
int poll();     // 非阻塞处理一次消息，返回 TRAY_EXIT_CODE 表示退出
void exit();    // 发送 WM_QUIT 终止托盘消息循环
```

---

### 5.2 core 模块 - 核心引擎

#### 5.2.1 Server ([Server.h](file:///d:/project/cmake/Tools/src/core/Server.h), [Server.cpp](file:///d:/project/cmake/Tools/src/core/Server.cpp))

**职责**: HTTP(S) 服务器封装，基于 `cpp-httplib`。

**服务器参数配置**:
| 参数 | 值 | 说明 |
|------|-----|------|
| `set_payload_max_length` | 4 GB | 上传文件体积上限 |
| `set_read_timeout` | 600 秒 | 读超时（10 分钟） |
| `set_write_timeout` | 600 秒 | 写超时 |
| `set_keep_alive_timeout` | 60 秒 | Keep-Alive |
| 默认 Header | `Cache-Control: no-cache` | 禁用缓存 |

**路由注册顺序** (在 `registerhRoutes()` 中):
```
0. set_pre_routing_handler   → 全局请求日志 + 可选 localhost 守卫（受 Config::getOnlyLocalhost 控制）
1. routes::admin             → /api/admin/*
2. routes::auth              → /api/auth/*
3. routes::teams             → /api/teams/*
4. routes::clipboard         → /api/clipboard/*
5. routes::fileService       → /api/fileservice/*
6. routes::tools             → /api/tools/* （内部并调用 routes::localTools::registerLocalTools
                                  注册 /api/local/* 全部本机工具路由，含 cert/docs/music/sysmon/adb 子模块）
7. routes::ocrTools          → /api/ocr/*
8. routes::pdfTools          → /api/pdf/*
9. routes::ffmpeg            → /api/ffmpeg/*
10. routes::settings         → /api/settings/*
11. routes::mcpRoutes        → /mcp + /api/local/mcp_debug
12. routes::game             → /api/game/* （游戏启动器，内置 HTTP 服务）
13. GET /webview             → WebView 容器页面（动态调用 __windowPage）
14. GET /.well-known/...     → Chrome DevTools 工作区探测
15. GET /(.*) catch-all      → 静态资源服务（最后注册）
```

**核心静态辅助方法**:
| 方法 | 说明 |
|------|------|
| `sendJson(res, j, status)` | 统一 JSON 响应格式（异常时回退到 {success:false,error}） |
| `sendError(res, msg, status)` | 错误响应快捷方式 |
| `parseBody(req)` | 解析请求体为 nlohmann::json，空 body 返回空对象 |
| `queryParam(req, name)` | 获取 URL 查询参数（空则返回空串） |
| `contentType(path)` | 根据扩展名推断 MIME（30+ 种类型） |
| `isLocalhost(req)` | 判断是否为 127.0.0.1 / ::1 |
| `guardLocalhost(req, res)` | 非本机直接返回 403，返回 true 表示已拦截 |

**静态资源服务逻辑 (`serveStatic`)**:
1. 若访问 `/admin` 或 `/tools/local/` 且非 localhost → 403
2. 拼接 `/html` 前缀，优先 `serveResource` 命中
3. 若路径无扩展名 → 尝试追加 `/index.html` 或 `.html` → JS 重定向
4. 未命中 → 404 + `/html/404.html`

---

#### 5.2.2 Database ([Database.h](file:///d:/project/cmake/Tools/src/core/Database.h))

**职责**: SQLite3 数据库 C++ 封装，线程安全。

**类型别名**:
```cpp
using Row  = std::map<std::string, std::string>;  // 单行（字段名→值）
using Rows = std::vector<Row>;                    // 多行
```

**核心 API**:
| 方法 | 说明 |
|------|------|
| `Database(path)` | 构造即打开（自动 `initSchema()` + `seedDefaultData()`） |
| `exec(sql)` | 执行 DDL/DML，返回 `sqlite3_changes()` 受影响行数 |
| `execParams(sql, params)` | 参数化执行：`params` 为 `[{idx, value_str}]`，按序号绑定 |
| `query(sql)` | 执行 SELECT，返回所有行（字符串化） |
| `lastInsertRowId()` | 获取 `sqlite3_last_insert_rowid()` |
| `handle()` / `mutex()` | 获取原生句柄/互斥锁（复杂操作用） |
| `sqlEscape(s)` | 静态方法：单引号转义防注入 |

**配置相关 API**:
| 方法 | 说明 |
|------|------|
| `static getAppConfig(dbPath)` | 读取 `app_config` 表为 `json::array_t` [{key,value,updated_at}] |
| `saveAppConfig(config)` | 批量 `INSERT OR REPLACE` 写回配置 |
| `getUserSettings(userId)` | 读取 `user_settings` 为 JSON 对象 {key:value} |
| `setUserSetting(userId, key, value)` | 写入/更新单条用户设置 |
| `deleteUserSetting(userId, key)` | 删除单条用户设置 |

**初始化流程（`initSchema`）**:
1. 执行 `resource/data/sql/schema.sql` 的全部 `CREATE TABLE IF NOT EXISTS`
2. 调用多次 `migration(column, defaultValue)` 检测缺失列并 `ALTER TABLE ADD COLUMN`
3. `seedDefaultData()` 插入初始种子数据（如默认管理员账户）

---

#### 5.2.3 WebviewWrapper ([WebviewWrapper.h](file:///d:/project/cmake/Tools/src/core/WebviewWrapper.h))

**职责**: 跨平台 WebView 封装（Windows 上用 WebView2），独立线程运行消息循环。

**控制 API**:
| 方法 | 说明 |
|------|------|
| `start()` | 创建 WebView 实例并启动独立线程，成功返回 true |
| `stop()` | 终止 WebView 线程并销毁实例 |
| `navigate(url)` | 跳转 URL（通常是 `http://127.0.0.1:<port>/webview`） |
| `showMaximized() / showMinimized() / showNormal() / hide()` | 窗口状态 |
| `setWindowRect(x,y,w,h)` | 设置窗口位置和尺寸 |
| `setCenter()` | 居中显示 |
| `runJavascript(js)` | 异步注入并执行 JS 代码 |

**内部机制**:
- 所有 WebView API 调用通过 `postEvent()` 投递到 WebView 所在线程执行（线程安全）
- `initLog()`：拦截 `console.log/warn/error` 并回调到 C++ 日志系统
- `initWindow()`：注入 `__windowPage()` 等全局 JS 桥接函数
- `bindings()`：注册 C++ ↔ JS 双向绑定函数

---

#### 5.2.4 HttpServerManager ([HttpServerManager.h](file:///d:/project/cmake/Tools/src/core/HttpServerManager.h))

**职责**: 管理多个独立的本地 HTTP 文件服务器实例（用户可在 UI 中配置）。

**数据结构 `HttpServerInstance`**:
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 对应 `http_servers.id` |
| `port` | int | 监听端口 |
| `server` | `unique_ptr<httplib::Server>` | httplib 实例 |
| `thread` | `std::thread` | 监听线程 |
| `lastError` | string | 启动失败原因 |
| `running` | bool | 运行状态标记 |

**API**:
| 方法 | 说明 |
|------|------|
| `instance()` | 单例（懒加载静态） |
| `start(id)` | 从 DB 读取 http_servers + http_server_mounts 配置，按挂载顺序注册路由 |
| `stop(id)` | `server->stop()` + `thread.join()` |
| `startAutoStart()` | 遍历 `auto_start=1` 的服务器并启动 |
| `shutdownAll()` | 应用退出时停止全部 |
| `status(id)` | 返回 `"running"` / `"stopped"` / `"error"` |
| `listeningPorts()` | 获取当前所有运行实例的端口列表（冲突检测用） |

**典型挂载配置**:
- 每个 mount 记录 `{path, source}`：如路径 `/static` → 源 `D:/website/assets`
- 支持目录列表浏览 + 文件下载（`httplib::Server::set_mount_point`）

---

#### 5.2.5 ProcManager ([ProcManager.h](file:///d:/project/cmake/Tools/src/core/ProcManager.h))

**职责**: 管理长期运行的子进程（如开发服务器、代理服务）。

**数据结构**:

`ProcLogLine`（单条日志）:
| 字段 | 类型 | 说明 |
|------|------|------|
| `seq` | int64_t | 单调递增序号（前端增量拉取用） |
| `text` | string | 日志文本（不含换行） |
| `stream` | int | 0=stdout, 1=stderr |
| `tsMs` | int64_t | 毫秒时间戳 |

`ProcInstance`（进程实例）:
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` / `name` | string | 配置 ID 和显示名 |
| `pid` | int | 系统 PID |
| `process` | `unique_ptr<AsyncProcess>` | Boost.Process 异步子进程 |
| `waiterThread` | `std::thread` | 等待退出 + 读输出的线程 |
| `logs` | `deque<ProcLogLine>` | **环形缓冲**：超过 2000 条时弹出最旧 |
| `running` / `exitCode` | atomic | 状态 |
| `startTimeMs` | atomic<int64_t> | 启动时间 |

**API**:
| 方法 | 说明 |
|------|------|
| `instance()` | 单例 |
| `start(id)` | 读 `proc_configs` + `proc_env_vars` 构造环境变量，用 Boost.Process 异步启动并开始管道读 |
| `stop(id, force)` | 优雅关闭；force=true 则 `TerminateProcess` |
| `getLogs(id, sinceSeq, limit)` | 增量获取日志：返回 `{lastSeq, lines[], truncated}` |
| `clearLogs(id)` | 清空环形缓冲（stop 后调用） |
| `status(id)` | `"running" / "stopped" / "error"` |

**输出处理机制**:
- waiterThread 上用 Boost.Asio 异步读取 stdout/stderr
- 按换行符 `\n` 切分，`appendLog()` 写入环形缓冲并分配递增 seq
- 通过 `env_inherit` 决定是否继承当前进程环境变量

---

#### 5.2.6 Utils ([Utils.h](file:///d:/project/cmake/Tools/src/core/Utils.h))

**工具函数分类**:

**文件系统 (`utils::fs`)**:
- `readFile(path, content)` / `writeFile(path, content)` - 全文件读写
- `fileSize(path)` / `fileExists(path)` / `ensureDir(path)`
- `humanSize(bytes)` - 字节 → 人类可读（如 "1.23 MB"）
- `safeJoinPath(base, sub)` - 防止 `../` 路径穿越攻击

**字符串**:
- `toLower(s)` / `toUpper(s)` / `trim(s)`
- `startsWith(s, prefix)` / `endsWith(s, suffix)`
- `split(s, delim)` / `join(vec, delim)`
- `randomHex(n)` / `randomString(n)` - 密码学安全随机串

**URL**:
- `urlEncode(s)` / `urlDecode(s)`
- `parseQueryString(qs)` → `map<string,string>`

**加密**:
- `sha256Hex(s)` - SHA256 摘要（十六进制）
- `passwordHash(pw, salt)` - 加盐密码哈希
- `verifyPassword(pw, salt, hash)` - 校验

**系统**:
- `openBrowser(url)` - ShellExecute 打开默认浏览器
- `openHome(subpath)` - 打开 `http://127.0.0.1:<port>/<subpath>`
- `isProcessRunning(nameOrPid)` - 进程存在性检查

---

#### 5.2.7 TransferTracker ([TransferTracker.h](file:///d:/project/cmake/Tools/src/core/TransferTracker.h))

**职责**: 追踪 HTTP 文件上传/下载进度，供 UI 实时显示。

**功能**:
- 全局注册表：`transferId` → `{type, name, totalBytes, doneBytes, startTime, speed}`
- 开始/更新/完成三个阶段 API
- 支持查询：单条详情、列表（分页/筛选）
- 自动清理已完成超过 N 分钟的记录

---

#### 5.2.8 McpClient ([McpClient.h](file:///d:/project/cmake/Tools/src/core/McpClient.h), [McpClient.cpp](file:///d:/project/cmake/Tools/src/core/McpClient.cpp))

**职责**: MCP 协议客户端，连接外部 MCP 服务端进行工具调用/资源读取/提示获取。与服务端 `McpServer` 对称，复用 `McpCore` 的数据结构。

**传输层抽象 (`Transport`)**:
- `createHttpTransport(HttpOptions)` - Streamable HTTP 传输（可选 legacy SSE 模式）
- `createStdioTransport(StdioOptions)` - 启动子进程经 stdin/stdout 交换换行分隔的 JSON-RPC
- 自定义传输可实现 `Transport` 接口注入

**高级 API**:
| 方法 | 说明 |
|------|------|
| `initialize()` | 执行 initialize 握手 + 自动发送 notifications/initialized |
| `ping()` | 心跳 |
| `listTools()` / `callTool(name, args)` | 工具列表与调用 |
| `listResources()` / `readResource(uri)` | 资源列表与读取 |
| `listPrompts()` / `getPrompt(name, args)` | 提示模板 |
| `setLoggingLevel(level)` | 设置服务端日志级别 |
| `complete(params)` | 补全建议 |

**回调注册**: `setRootsProvider` / `setSamplingHandler` / `setNotificationHandler` / `setServerRequestHandler`（处理服务端发起的请求如 roots/list、sampling/createMessage）。

**错误模型**: 传输/HTTP 错误及 JSON-RPC 错误统一抛 `Client::Error`；工具调用错误通过返回值的 `isError` 字段表达，不抛异常。

**用途**: MCP 调试器（`/api/local/mcp_debug`）使用 McpClient 连接用户指定的目标 MCP 服务，完成握手 → 列工具 → 调用工具的全流程诊断。

---

#### 5.2.9 McpTools ([McpTools.h](file:///d:/project/cmake/Tools/src/core/McpTools.h), [McpTools.cpp](file:///d:/project/cmake/Tools/src/core/McpTools.cpp))

**职责**: 向 `McpServer` 注册内置工具的统一入口，由 `mcpTools::registerTools(McpServer&)` 一次性注册全部内置工具。

**已注册的内置工具**:
1. `echo` - 参数回显
2. `get_server_info` - 返回服务端运行信息
3. `get_time` - 当前时间戳
4. `list_directory` - 列目录
5. `mcp_debug` - MCP 自身诊断报告
6. `read_text_file` - 读取文本文件
7. `run_shell_command` - 执行 Shell 命令（高风险，受 localhost guard 保护）

---

#### 5.2.10 CertGenerator ([CertGenerator.h](file:///d:/project/cmake/Tools/src/core/CertGenerator.h), [CertGenerator.cpp](file:///d:/project/cmake/Tools/src/core/CertGenerator.cpp))

**职责**: 基于 OpenSSL 原生 API 生成自签名 SSL/TLS 证书，供 `routes::cert` 路由调用。

**参数 (`CertParams`)**:
| 字段 | 说明 |
|------|------|
| `commonName` / `organization` / `organizationalUnit` | 证书主体 |
| `country` / `state` / `locality` | 地理信息 |
| `days` | 有效期（默认 365） |
| `keyBits` | 密钥位数（默认 2048） |
| `altNamesIp` / `altNamesDns` | SAN 扩展（IP/DNS 别名列表） |

**API**:
- `isOpensslAvailable()` - 检查 OpenSSL 可用性
- `getOpensslVersion()` - 获取版本字符串
- `generate(params, outputDir, baseName, overwrite)` - 生成证书，返回 `CertResult{success, error, certPath, keyPath}`

---

### 5.3 routes 模块 - API 路由层

每个路由文件暴露一个命名空间函数 `registerXxxRoutes(httplib::Server& svr)`，在 `Server::registerhRoutes()` 中按序调用。

认证中间件模式（所有需登录的 API）:
```cpp
std::optional<UserInfo> Auth::requireLogin(const Request& req, Response& res);
// 失败则直接 sendError(res, "未登录", 401) 并返回 nullopt
```

管理员中间件:
```cpp
bool Auth::requireAdmin(const Request& req, Response& res);
// 非管理员直接 403
```

#### 5.3.1 Auth 路由 (`/api/auth/*`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/register` | 注册：email + password + nickname（邮箱唯一） |
| POST | `/auth/login` | 登录：验证 → 生成 session token → Set-Cookie |
| POST | `/auth/logout` | 登出：删除 sessions 表记录 + 清 Cookie |
| GET | `/auth/me` | 获取当前用户信息（认证校验） |
| PUT | `/auth/me` | 更新当前用户（nickname/密码修改） |

密码存储：`SHA256(密码 + salt)`，salt 每用户独立随机生成存在 users 表。

---

#### 5.3.2 Admin 路由 (`/api/admin/*`)

**要求**: localhost 访问 OR 管理员权限。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/users` | 用户列表（分页） |
| POST | `/admin/users/:id/role` | 设为管理员/取消管理员 |
| DELETE | `/admin/users/:id` | 删除用户 |
| GET | `/admin/shares` | 文件分享列表 + 权限概览 |
| DELETE | `/admin/shares/:id` | 删除分享 |
| GET | `/admin/transfers` | 文件传输记录（TransferTracker 查询） |
| POST | `/admin/config` | 保存全局 app_config |

---

#### 5.3.3 Clipboard 路由 (`/api/clipboard/*`) + Teams 路由 (`/api/teams/*`)

团队协作模型：
```
用户(users) ──M: N──► 剪贴板团队(clipboard_teams)
                           │
                           ├─► 成员(clipboard_team_members, role=owner/member)
                           │
                           └─► 剪贴板项(clipboard_items, type=text/html/image/file)
```

**Teams API**:
- CRUD 团队、加入邀请码（`inviteCodeDurationSEC` 有效期）、成员管理
- 默认团队：注册时自动为用户创建 `is_default=1` 的个人团队

**Clipboard API**:
- `list(teamId, since)` - 增量拉取（since 参数用 created_at 时间戳）
- `create(data)` - 文本/HTML 类型
- `upload(teamId, formData)` - 图片/文件类型（存文件系统，DB 只存 url+元数据）
- `download(itemId)` - 生成一次性下载 token（写入 `clipboard_file_downloads`），重定向到下载链接

---

#### 5.3.4 FileService 路由 (`/api/fileservice/*`)

权限模型（`file_share_permissions`）:
```
share_id 关联 subject_type:
  - "all"       → 全局默认权限
  - "user"      → user_id 指定的用户权限（优先级更高）
权限位: can_access / can_download / can_upload / can_delete / can_rename
```

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/fileservice` | 分享列表（按当前用户权限过滤） |
| GET | `/fileservice/:id/list?path=...` | 浏览目录（分页 + mtime 排序） |
| GET | `/fileservice/:id/search?q=...` | 关键词搜索文件 |
| GET | `/fileservice/:id/download?path=...` | 流式下载文件（TransferTracker 追踪进度） |
| POST | `/fileservice/:id/upload?path=...&size=...` | 上传（multipart/form-data，支持分片续传？需看实现） |
| DELETE | `/fileservice/:id/delete?path=...` | 删除文件/空目录 |
| PUT | `/fileservice/:id/rename?path=...&to=...` | 重命名 |

**注**: 所有操作先 `Auth::requireLogin`，再查权限表做位运算。

---

#### 5.3.5 Tools 路由 (`/api/tools/*`)

为 100+ 前端小工具提供后端能力：
- 纯计算工具（如 Base64、JSON 格式化、密码强度分析）由前端 JS 直接完成，不走后端
- 需本机资源的工具调用此路由：
  - `/tools/qrcode?text=...` → 生成 PNG 二维码
  - `/tools/image/convert` → 图片格式转换（STB）
  - `/tools/exec/:name` → 特定命令（白名单限制）

---

#### 5.3.6 PdfTools 路由 (`/api/pdf/*`)

调用外部 `pdf_tool.exe`（`bin/pdf_tool.exe`）：
- `/pdf/compress` - 压缩 PDF
- `/pdf/convert` - 格式转换（PDF ↔ Word/Image 等）
- `/pdf/watermark` - 添加文字/图片水印
- `/pdf/signature/check` - 验证数字签名

接口统一使用 `multipart/form-data` 上传，返回 blob 下载。

---

#### 5.3.7 OcrTools 路由 (`/api/ocr/*`)

通过 `3rdparty/OnnxOCR/ocr_dynamic_loader.cpp` 动态加载 `bin/RapidOCR/RapidOcrOnnx.dll` + 模型文件：
- `POST /ocr/recognize` - FormData 图片 → 返回 JSON 数组 `[{text, confidence, box:{x,y,w,h}}]`
- 支持中英文识别，模型目录：`ch-mobile-v4/`（轻量快速）

---

#### 5.3.8 FfmpegTool 路由 (`/api/ffmpeg/*`)

FFmpeg 管理器（`FfmpegManager` 单例，类似 ProcManager）：
- `/ffmpeg/list` - 任务列表
- `/ffmpeg/start` - 新建转码任务（参数 JSON：输入路径、输出格式、编码器）
- `/ffmpeg/:id/logs?since=` - 增量拉取 FFmpeg 输出（解析 `size=`/`time=` 字段估算进度）
- `/ffmpeg/:id/stop` - 取消任务
- `/ffmpeg/download/:id` - 下载输出文件

集成 yt-dlp：
- `/ffmpeg/downloader/start` - 调用 `yt-dlp URL` 下载在线视频

---

#### 5.3.9 LocalTools 路由 (`/api/local/*`)

**全部受 `Server::guardLocalhost` 保护，仅限本机调用**。由 `routes::tools::registerToolRoutes()` 内部调用 `routes::localTools::registerLocalTools()` 注册。

| 子路径 | 说明 |
|--------|------|
| `/local/localIp` | 获取本机 IP 地址列表 |
| `/local/fs` | 本机文件系统浏览（根目录列出驱动器） |
| `/local/rename` | 批量重命名文件 |
| `/local/http/servers/*` | HttpServerManager 的 CRUD + start/stop + status |
| `/local/procs/*` | ProcManager 的 CRUD + start/stop + logs 流 |
| `/local/memos/*` | 备忘录 CRUD |
| `/local/mcp_debug` | MCP 调试器代理接口（使用 McpClient 连接目标 MCP 服务，详见第 8 节） |

此外，LocalTools 内部还注册了以下子模块路由（同样受 localhost 保护）：
- `routes::cert::registerCertRoutes()` - 自签名证书工具（依赖 `CertGenerator` + OpenSSL）
- `routes::docs::registerDocRoutes()` - 文档聚合阅读器
- `routes::music::registerMusicRoutes()` - 音乐播放器（扫描/播放/封面/歌词/黑名单）
- `routes::sysmonitor::registerSysMonitorRoutes()` - 系统监控实时数据
- `routes::adb::registerADBRoutes()` - ADB 安卓调试工具

**音乐播放器 API** (`/api/local/music/*`):
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/local/music/sources` | 列出扫描目录（music_sources 表） |
| POST | `/local/music/sources` | 新增扫描目录 |
| DELETE | `/local/music/sources/:id` | 删除扫描目录 |
| GET | `/local/music/scan?sourceId=` | 扫描目录下音频文件（mp3/flac/wav/ogg/m4a/aac/opus/wma/ape/wv） |
| GET | `/local/music/audio?path=` | 流式音频（支持 Range） |
| GET | `/local/music/cover?path=` | 提取内嵌封面（ID3v2/FLAC/M4A） |
| GET | `/local/music/lyrics?path=` | 提取歌词 |
| GET/POST/DELETE | `/local/music/blacklist` | 黑名单管理（music_blacklist 表） |

**ADB 调试工具 API** (`/api/local/adb/*`):
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/local/adb/info` | ADB 版本信息（依赖 `Config::getAdbPath()`） |
| GET | `/local/adb/devices` | 设备列表 |
| POST | `/local/adb/connect` / `disconnect` | 连接/断开设备 |
| GET/POST | `/local/adb/forward/*` | 端口转发管理（list/add/remove/removeAll） |
| POST | `/local/adb/shell` | 执行 shell 命令 |
| GET | `/local/adb/logcat` | Logcat 日志（支持 tag/level/pid/package 过滤） |
| POST | `/local/adb/logcat/clear` | 清空 logcat |

系统监控数据流：
```
hwinfo CPU/内存/GPU API
        │
        ▼
SysMonitor::snapshot() → json {cpu:{usage,cores},ram:{used,total},gpu:{...},disk:{...},net:{...},battery:{...}}
        │
        ▼
GET /api/local/sysmon/now 返回单帧；GET /api/local/sysmon/stream?since= 返回历史（环形缓冲 N 帧）
```

---

#### 5.3.10 Game 路由 (`/api/game/*`)

游戏启动器，扫描内嵌资源（`/games`、`/games1`）与磁盘目录（`<exeDir>/games`）下的 HTML5 游戏，并启动内置 HTTP 服务供游戏加载运行。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/game/list` | 列出可用的游戏条目（id/name/entryFile） |
| POST | `/game/start` | 启动游戏 HTTP 服务（独立端口） |
| GET | `/game/status` | 查询游戏服务运行状态 |

应用退出时调用 `shutdownGameHttpServer()` 清理资源。

---

#### 5.3.11 Mcp 路由

独立章节（第 8 节）详述。

---

## 6. 数据库设计

**数据库**: SQLite3（`bin/database.db`）  
**初始化**: 首次启动 `Database::initSchema()` 执行 `resource/data/sql/schema.sql`  
**迁移机制**: `migration(column, default)` 检测表是否缺少列，缺则 `ALTER TABLE ADD COLUMN`（向后兼容升级）

### 6.1 用户与会话

| 表名 | 主键 | 核心字段 | 说明 |
|------|------|----------|------|
| **users** | id(TEXT) | email(UNIQUE), nickname, password, created_at | 用户账户，password 为 SHA256(密码+salt) |
| **sessions** | token(TEXT) | user_id, expires_at | 登录会话，Cookie `session_token` |

### 6.2 剪贴板与团队

| 表名 | 主键 | 核心字段 | 说明 |
|------|------|----------|------|
| **clipboard_teams** | id | name, owner_id, is_default, created_at | 团队（每个用户至少一个默认团队） |
| **clipboard_team_members** | id | team_id, user_id, role, joined_at | UNIQUE(team_id,user_id)，role=owner/member |
| **clipboard_items** | id | team_id, type(text/html/image/file), content, html_content, mime_type, file_url, file_name, file_size, created_by_id, created_at | 剪贴板历史条目，索引 `idx_clipboard_team` |
| **clipboard_team_invite_codes** | id | code(UNIQUE), team_id, created_by_id, expires_at, used | 邀请码，`inviteCodeDurationSEC` 控制过期 |
| **clipboard_file_downloads** | id | token(UNIQUE), clipboard_item_id, expires_at, created_at | 一次性文件下载令牌 |

### 6.3 文件分享

| 表名 | 主键 | 核心字段 | 说明 |
|------|------|----------|------|
| **file_shares** | id | name, real_path(物理路径), is_directory, created_at, created_by | 分享条目（目录或文件） |
| **file_share_permissions** | id | share_id, subject_type(all/user), user_id, can_access, can_download, can_upload, can_delete, can_rename | 权限矩阵，索引 `idx_fsp_share` |

### 6.4 本地工具配置

| 表名 | 主键 | 核心字段 | 说明 |
|------|------|----------|------|
| **http_servers** | id | name(UNIQUE), port(UNIQUE), status, error_msg, auto_start, created_at, updated_at | 文件服务器配置 |
| **http_server_mounts** | id | server_id→FK, path, source(物理目录), sort_order | 挂载点，按 sort_order 升序注册 |
| **proc_configs** | id | name(UNIQUE), command, args(JSON), working_dir, env_inherit, auto_start, status, pid, exit_code, error_msg, remarks, timestamps | 进程配置 |
| **proc_env_vars** | id | config_id→FK, name, value, sort_order | UNIQUE(config_id,name) |

### 6.5 应用与用户设置

| 表名 | 主键 | 核心字段 | 说明 |
|------|------|----------|------|
| **app_config** | key(TEXT) | value(TEXT), updated_at | 全局键值对（端口、路径、日志等级等） |
| **user_settings** | (user_id, key) | value, updated_at | 每个用户的偏好（主题/视图/默认团队等） |

### 6.6 杂项

| 表名 | 主键 | 核心字段 | 说明 |
|------|------|----------|------|
| **memos** | id | title, content, timestamps | 内置备忘录，索引 `idx_memos_updated` |
| **doc_sources** | id | name(UNIQUE), path, timestamps | 文档聚合阅读源配置，索引 `idx_doc_sources_updated` |
| **music_sources** | id | name, path, timestamps | 音乐扫描目录配置，索引 `idx_music_sources_updated` |
| **music_blacklist** | id | source_id→FK, path, created_at | 音乐黑名单（被拉黑的歌曲不参与扫描/播放），UNIQUE(source_id, path) |

---

## 7. 前端架构

### 7.1 前端框架选型

**无框架**（Vanilla JavaScript）：为了避免构建工具链，前端完全采用原生 HTML + CSS + JS 编写，模块化程度低但部署零依赖。

### 7.2 主框架结构 ([index.html](file:///d:/project/cmake/Tools/resource/data/html/index.html))

```html
<div id="shell">
  <div id="app-header"></div>        <!-- 导航栏（动态渲染） -->
  <iframe id="content-frame"></iframe> <!-- 子页面容器（SPA 式切换） -->
</div>
```

**架构模式**: 主窗口 Shell + 子页面 iframe 隔离。  
导航栏在父窗口通过 `index.js` 渲染并维护选中状态；子工具页面加载到 iframe 中，通过 `window.parent` 访问共享对象。

### 7.3 核心脚本文件

#### app.js ([app.js](file:///d:/project/cmake/Tools/resource/data/html/app.js)) - 全局应用对象

**State 管理**（仅认证状态）:
- `state.user` - 当前登录用户对象，持久化到 `localStorage['auth-storage']`
- `setUser(u)` / `logout()` / `isAuthenticated()` / `loadState()`

**工具函数**:
- `formatDistanceToNow(date)` - 中文相对时间格式化（"3 分钟前"）
- `openModal(title, bodyHtml, footerHtml, modalClass)` - 自建模态框（支持多层叠加）
- `closeModal()` - 关闭最上层模态
- `escapeHtml(s)` - XSS 转义

#### api.js ([api.js](file:///d:/project/cmake/Tools/resource/data/html/api.js)) - HTTP API 封装

**请求基类**:
- `request(method, path, body, isForm)` → `fetch('/api' + path, {credentials: 'include'})`
- 自动解析 JSON 响应，附加 `data._status = httpStatus`
- `uploadXHR(path, formData, {onProgress, onLoad, onError})` - 大文件上传用 XHR 支持进度

**API 分组命名空间**:
```javascript
Api.auth     // /api/auth/*        (login/register/logout/me/updateMe)
Api.teams    // /api/teams/*       (CRUD, invite, join, members)
Api.clipboard// /api/clipboard/*   (list/create/upload/download/delete)
Api.fileservice// /api/fileservice/* (list/browse/search/upload/download/delete/rename)
Api.admin    // /api/admin/*       (users/shares/transfers/config)
Api.tools    // /api/tools/*
Api.pdf      // /api/pdf/*
Api.ocr      // /api/ocr/*
Api.ffmpeg   // /api/ffmpeg/*
Api.local    // /api/local/*       (http_servers, proc, sysmon, batch_rename)
Api.settings // /api/settings/*
```

#### index.js - 主壳控制器

**职责**:
- 顶部导航栏渲染（工具分类菜单）
- URL Hash 路由（解析 `#hash` 切换 iframe `src`）
- 未登录状态自动跳转到 `/auth/login.html`
- 主题初始化（读取 `user_settings.theme` 或 localStorage）

#### theme.js - 主题系统

- 支持 `light` / `dark` / `auto`（跟随系统）三模式
- 通过 `<html data-theme="...">` 属性切换 CSS 变量
- 提供 `Theme.set(name)` / `Theme.get()` / `Theme.apply()` API

#### fs_browser.js - 文件浏览器组件

统一的文件/目录选择 UI，供多处复用：
```javascript
FsBrowser.open({
  mode: 'dir'|'file'|'multi',          // 选择模式
  api:  'local'|'admin'|'custom',      // 后端来源
  initialPath: '/',                    // 初始路径
  onConfirm: (paths) => {},            // 确认回调
  customList: async (path) => []       // custom 模式下的自定义列表
});
```

### 7.4 前端页面目录

```
resource/data/html/
├── index.html          # 主壳（Shell）
├── index.js / index.css
├── app.js              # App 全局对象
├── api.js              # API 封装
├── theme.js            # 主题管理
├── fs_browser.js       # 文件浏览器组件
├── 404.html            # 404 页面
├── style.css           # 全局样式（基础 + 变量）
├── index.css           # 主壳样式（导航栏 + iframe 布局）
├── memo.js / memo.css  # 内置备忘录页
│
├── admin/              # 管理后台（需管理员）
│   ├── index.html      # 主布局：Tab 切换
│   ├── users.js        # 用户管理
│   ├── shares.js       # 分享列表
│   ├── transfers.js    # 传输监控
│   └── settings.js     # 全局设置
│
├── auth/               # 登录/注册
│   ├── login.html
│   └── register.html
│
├── clipboard/          # 团队剪贴板
│   ├── index.html
│   ├── index.js        # 团队切换 + 历史列表 + 上传
│   └── index.css
│
├── fileservice/        # 文件分享浏览
│   ├── index.html      # 面包屑 + 文件列表 + 上传区
│   └── index.js
│
├── tools/              # 100+ 在线小工具（每个一个 HTML+JS）
│   ├── tools.html      # 分类入口（网格卡片）
│   ├── tools.js        # 搜索 + 分类过滤 + 工具目录 API 调用
│   ├── style.css
│   ├── common.js       # 跨工具共享函数
│   ├── local/          # 本地系统工具页面（仅 localhost 可访问）
│   │   ├── batch_rename.{html,js,css}
│   │   ├── processes.{html,js,css}
│   │   ├── sys_monitor.{html,js,css}
│   │   ├── http_servers.{html,js,css}
│   │   ├── ffmpeg.{html,js,css}
│   │   ├── ffmpeg_download.{html,js,css}
│   │   ├── cert_tool.html
│   │   ├── docs.{html,js,css}
│   │   ├── image_annotator.{html,js,css}
│   │   ├── music_player.{html,js,css}
│   │   ├── adb_tool.{html,js,css}
│   │   └── mcp_debug.{html,js,css}
│   ├── game.html       # 游戏启动器页面
│   └── *.html / *.js   # 各在线工具页面
│
├── lib/                # 前端第三方库
│   ├── bip39/wordlist.js
│   ├── fortawesome/icons.js    # Font Awesome 图标（SVG/JS）
│   └── marked.js              # Markdown 渲染
│
├── webview/             # WebView 容器页面
│   ├── index.html
│   └── window.html
```

### 7.5 100+ 在线小工具分类

| 分类 | 典型工具 |
|------|---------|
| 文本处理 | case_converter, text_counter, text_diff, text_to_binary, lorem_ipsum_generator, slugify_string |
| 编码转换 | base64_to_image, encoding_converter, html_entities, html_markdown_converter, json_converter, toml_converter, yaml_viewer, yml_properties_converter, unicode_converter |
| 加密安全 | password_generator, password_strength_analyser, jwt_decoder, bip39_mnemonic, otp_generator, token_generator, basic_auth_generator, crypto_tools, uuid_generator |
| 网络工具 | ipv4_address_converter, ipv4_subnet_calculator, ipv4_range_expander, ipv6_ula_generator, mac_address_generator/lookup, cron_generator, user_agent_parser, url_parser, http_status_codes, random_port_generator |
| 开发辅助 | json_formatter/editor/diff, code_formatter, html_wysiwyg_editor, css_gradient_generator, icon_designer, emoji_picker, git_memo, regex_tester/memo, keycode_info, ascii_text_drawer |
| 计算工具 | math_evaluator, percentage_calculator, eta_calculator, date_calculator, timestamp_converter, timezone_converter, temperature_converter, number_base_converter, chmod_calculator, benchmark_builder |
| 图片处理 | image_converter/compressor/watermark, image_annotator, image_ocr, camera_recorder |
| PDF | pdf_compressor/converter/manager/watermark/signature_checker |
| 杂项 | qrcode_generator, wifi_qr_code_generator, device_information, docker_run_to_compose, mime_types, safelink_decoder, meta_tag_generator, jwt_decoder... |

---

## 8. MCP 协议实现

### 8.1 MCP 概览

MCP (Model Context Protocol) 是基于 **JSON-RPC 2.0** 的协议，允许 AI 客户端（如 Trae IDE）连接外部服务以：
- **调用工具 (Tools)** - 执行函数并返回结果
- **读取资源 (Resources)** - 按 URI 拉取上下文（文件、文档等）
- **获取提示模板 (Prompts)** - 标准化对话模板
- **列出根目录 (Roots)** - 暴露工作区根
- **日志/采样/补全** - 扩展能力

本项目的 MCP 版本：**`2025-03-26`**

### 8.2 核心模块划分

| 文件 | 职责 |
|------|------|
| [src/core/McpCore.h](file:///d:/project/cmake/Tools/src/core/McpCore.h) + `.cpp` | 协议层：JSON-RPC 数据结构、序列化/反序列化、错误码、方法常量、类型定义 |
| [src/core/McpServer.h](file:///d:/project/cmake/Tools/src/core/McpServer.h) + `.cpp` | 服务端引擎：ServerCapabilities 声明、Tool/Resource/Prompt 注册表、请求分派与响应生成 |
| [src/core/McpClient.h](file:///d:/project/cmake/Tools/src/core/McpClient.h) + `.cpp` | 客户端引擎：连接外部 MCP 服务，支持 HTTP/SSE/stdio 传输，提供强类型高级 API（详见 5.2.8） |
| [src/core/McpTools.h](file:///d:/project/cmake/Tools/src/core/McpTools.h) + `.cpp` | 内置工具注册：`mcpTools::registerTools()` 一次性注册 echo/get_time/list_directory 等内置工具（详见 5.2.9） |
| [src/routes/Mcp.h](file:///d:/project/cmake/Tools/src/routes/Mcp.h) + `.cpp` | HTTP 传输层：Streamable HTTP (POST /mcp) + SSE (GET /mcp → POST /mcp/:session_id) + Debug 代理（使用 McpClient） |

### 8.3 McpCore 数据结构

**JSON-RPC 三件套**:
```
RpcRequest        → { jsonrpc: "2.0", id, method, params? }   需要响应
RpcNotification   → { jsonrpc: "2.0", method, params? }       无需响应
RpcResponse       → { jsonrpc: "2.0", id, result? XOR error? }
  └─ RpcError     → { code, message, data? }
```

**MCP 业务类型**:
- `ImplementationInfo {name, version}` - 服务端/客户端实现信息
- `ServerCapabilities` - 能力位集合（tools, resources, prompts, logging, roots 等），**注意：logging 必须是空对象 `{}` 而非 null（协议规范）**
- `Tool / ToolInputSchema / ToolCallResult` - 工具声明与调用结果
- `Resource / ResourceTemplate / ReadResourceResult` - 资源声明与读取
- `Prompt / PromptArgument / GetPromptResult` - 提示模板
- `Root` - 根目录项
- `LogLevel` - T=0~F=5

**重要常量**:
- `kJsonRpcVersion = "2.0"`
- `kMcpProtocolVersion = "2025-03-26"`
- `ErrorCode` 枚举：ParseError=-32700 ... InternalError=-32603

### 8.4 McpServer 引擎

**单例获取**: `::mcp::McpServer& routes::mcp::getMcpServer()`

**生命周期与协议握手**:
```
Client                              Server (McpServer)
  │  POST /mcp {method:"initialize",params:{protocolVersion,capabilities,clientInfo}}
  │────────────────────────────────────────────────────────►
  │  {result:{protocolVersion:"2025-03-26",capabilities:{...},serverInfo}}
  │◄────────────────────────────────────────────────────────
  │  POST /mcp {method:"notifications/initialized"}
  │────────────────────────────────────────────────────────►
  │  (空响应，服务端标记 m_initialized=true)
  │  此后可自由调用 tools/list / resources/read 等业务方法
```

**注册 API**:
```cpp
// 工具：声明 + 处理函数
mcp.registerTool(
  {.name = "echo", .description = "回显", .inputSchema = {...}},
  [](const optional<json>& args) -> ToolCallResult { /* ... */ }
);

// 资源：声明 + 读取器
mcp.registerResource({.uri = "file:///...", .name = "..."}, reader);

// 提示模板
mcp.registerPrompt({.name = "code-review", ...}, getter);

// 回调
mcp.setRootsProvider([](){ return roots; });
mcp.setLogLevelSetter([](LogLevel){ /* 调整后端日志等级 */ });
mcp.setCanceller([](RequestId){ /* 取消长耗时调用 */ });
```

**内部分派 (`dispatchRequest`)**:
| 方法 | 处理函数 | 返回 |
|------|---------|------|
| `initialize` | `handleInitialize` | `{protocolVersion, capabilities, serverInfo, instructions}` |
| `ping` | `handlePing` | `{}` |
| `tools/list` | `handleToolsList` | `{tools: [...]}` |
| `tools/call` | `handleToolsCall` | `{content:[{type:"text",text:"..."}], isError?}` |
| `resources/list` | `handleResourcesList` | `{resources: [...]}` |
| `resources/read` | `handleResourcesRead` | `{contents:[{uri, mimeType, text/base64}]}` |
| `prompts/list` / `prompts/get` | 对应 | 提示列表/内容 |
| `logging/setLevel` | 转调 LogLevelSetter | `{}` |
| `roots/list` | 转调 RootsProvider | `{roots: [...]}` |
| `sampling/createMessage` | （可选） | 模型采样结果 |
| `completion/complete` | 转调 CompletionHandler | 补全建议 |

**已注册的内置工具**: 由 `mcpTools::registerTools()` 统一注册（详见 5.2.9），包含 echo、get_server_info、get_time、list_directory、mcp_debug、read_text_file、run_shell_command。

### 8.5 HTTP 传输层

项目实现了 **两种** MCP 标准传输模式：

#### (1) Streamable HTTP（默认）
```
POST /mcp  Content-Type: application/json
  Body: 单个 JSON-RPC 对象 或 批量 JSON Array
  → 200 OK: 单响应 或 响应数组
```
Notification（无 id）→ 返回空数组（`[]`）占位。

#### (2) SSE（Server-Sent Events）
```
1. Client GET /mcp  Accept: text/event-stream
   ← 200 OK  Content-Type: text/event-stream
   ← event: endpoint
   ← data: {"uri":"http://host/mcp/sess_abc123"}

2. Client POST /mcp/sess_abc123  （请求发送）
   ← 通过 SSE 通道异步推送 response + notification
```
关键数据结构：
```cpp
struct SseSession {
  std::string id;
  std::deque<std::string> outgoingQueue;  // 待发送帧
  std::mutex mtx;
  // SSE handler 引用...
};
std::map<std::string, SseSession> g_sseSessions;
```

### 8.6 MCP 调试器 (`mcp_debug.html` + `/api/local/mcp_debug`)

前端页面 `tools/local/mcp_debug.html` 提供图形化 MCP 调试器，底层使用 `mcp::Client`（McpClient，详见 5.2.8）连接用户指定的目标 MCP 服务：
- 支持手动选择传输模式（Streamable HTTP / SSE / stdio）
- 模拟 initialize → 列出所有工具 → 调用单个工具
- 查看完整请求/响应日志和 JSON-RPC 帧序列
- 后端代理端点 `/api/local/mcp_debug`（受 `guardLocalhost` 保护）使用 McpClient 建立连接并跑完整诊断流程（`runMcpDebugReport`）

---

## 9. 第三方依赖

### 9.1 C++ 后端依赖

| 库 | 来源 | 用途 | 集成方式 |
|----|------|------|---------|
| **cpp-httplib** | `3rdparty/httplib/httplib.h` | HTTP(S) 服务器 + 客户端 | header-only，含入编译 |
| **nlohmann/json** | 系统安装 (`find_package nlohmann_json`) | JSON 序列化/反序列化 | header-only |
| **SQLite3** | 系统库 (`libsqlite3.a`) | 数据库存储 | `target_link_libraries(sqlite3)` |
| **Boost.Process** | find_package Boost COMPONENTS process | 子进程启动+异步IO管道 | 动态链接 |
| **Boost.Filesystem** | find_package | 文件系统跨平台 | 动态链接 |
| **OpenSSL (SSL/Crypto)** | find_package OpenSSL | HTTPS 支持 + 加密算法 | `CPPHTTPLIB_OPENSSL_SUPPORT` |
| **hwinfo** | `3rdparty/hwinfo/` add_subdirectory | CPU/内存/磁盘/GPU/网络/电池/主板信息 | 静态链接多个模块 (hwinfo_cpu, hwinfo_ram, ...) |
| **CLI11** | `3rdparty/cli11/CLI11.hpp` | 命令行参数解析 | header-only |
| **tray** | `3rdparty/tray/include/tray/tray.h` | 系统托盘（Win32/GTK/Cocoa 后端） | 单头（需链接 user32/shell32/advapi32 等） |
| **webview** | `3rdparty/webview/core/include/webview/*` | 跨平台 WebView 封装 | header-only + WebView2 Loader |
| **WebView2 SDK** | `3rdparty/webview2/include/*.h` | Windows Edge WebView2 原生头 | 头文件（运行时需预装 WebView2 Runtime） |
| **STB** | `3rdparty/stb/stb_image.h` 等 | 图片解码/编码/字体渲染 | single-header（定义 `STB_*_IMPLEMENTATION`） |
| **qrcodegen** | `3rdparty/qrcodegen/` | 二维码生成 | 源码级嵌入编译 |
| **RapidOCR** | `bin/RapidOCR/`（模型文件 + `RapidOcrOnnx.dll`） | 中英文 OCR 模型与运行时 | 运行时 DLL 加载 |
| **OnnxOCR** | `3rdparty/OnnxOCR/ocr_dynamic_loader.cpp` | OCR 动态加载器 | 源码级嵌入编译 |
| **ONNX Runtime** | RapidOCR 依赖 | 推理引擎 | 随 RapidOcrOnnx.dll 分发 |

### 9.2 Windows 系统链接库

```cmake
iphlpapi    # IP 辅助 API（网卡/网络信息）
crypt32     # 证书/加密 API
ws2_32      # Winsock 2
advapi32     # 注册表/高级 API
ole32        # COM 初始化（WebView2）
shell32      # ShellExecute（打开浏览器）
shlwapi      # 路径工具
user32       # 窗口/消息（托盘 + WebView）
version      # 版本信息 API
```

### 9.3 前端依赖

| 库 | 路径 | 用途 |
|----|------|------|
| **Font Awesome (SVG/JS)** | `lib/fortawesome/icons.js` | 图标 |
| **marked.js** | `lib/marked.js` | Markdown → HTML 渲染 |
| **BIP39 Wordlist** | `lib/bip39/wordlist.js` | 助记词生成 |
| **(JiSuXiang / it-tools)** | - | 工具 UI 参照设计（原生重写而非代码复用） |

---

## 10. 项目运行方式

### 10.1 运行前准备

确保 `bin/` 目录下存在以下文件：
```
bin/
├── RapidOCR/
│   ├── ch-mobile-v4/
│   │   ├── det.onnx      # 文本检测模型
│   │   ├── cls.onnx      # 方向分类模型
│   │   ├── rec.onnx      # 文本识别模型
│   │   └── keys.txt      # 字符字典
│   └── RapidOcrOnnx.dll
├── pdf_tool.exe          # PDF 处理（可缺失，对应功能不可用）
└── ffmpeg.exe (可选)     # 若配置了 ffmpegPath
```

### 10.2 启动方式

**方式一：双击 EXE**  
`LocalToolbox` → 后台运行 + 系统托盘图标 → 双击/右键菜单打开 UI

**方式二：命令行启动**
```bash
# 默认：端口 3100 + WebView 窗口模式
LocalToolbox

# 指定端口
LocalToolbox --port 8080

# 启用 HTTPS
LocalToolbox --https --ssl-cert cert.pem --ssl-key key.pem

# 查看帮助
LocalToolbox -h
```

### 10.3 访问方式

启动后日志会打印：
```
[INFO ] HTTP服务已经启动 http://127.0.0.1:<端口>
```

| 访问方式 | 地址/操作 | 说明 |
|---------|----------|------|
| 系统托盘 | 右键 → 「浏览器打开」/「webview 打开」 | 两种 UI 模式 |
| 浏览器 | `http://127.0.0.1:<port>/index.html` | 完整功能 |
| 局域网 | `http://<本机IP>:<port>/index.html` | 同局域网他人可访问（本地工具页 `/admin`/`/tools/local/` 会 403） |
| WebView | 托盘 → 「webview 打开」 | 原生窗口体验，最大化显示 |

### 10.4 首次使用流程

1. 启动应用 → 访问首页 → 跳转登录页
2. 点击「注册」→ 输入邮箱/密码/昵称 → 创建首个用户
3. 登录后自动创建个人默认剪贴板团队 → 开始使用

管理员说明：
- 数据库种子数据可能预置 admin@example.com 账户（详见 `seedDefaultData()`）
- 管理员可在「管理后台」管理用户、分享、传输记录

---

## 11. 开发调试指南

### 11.1 Debug / Release 差异

| 特性 | Debug | Release |
|------|-------|---------|
| 资源来源 | `RESOURCE_PATH` 宏 → 直接读 `resource/data/*` 磁盘文件 | 编译嵌入二进制 (`tools_resource` 静态库) |
| 控制台窗口 | 有 (方便看日志) | 无 (`WIN32` 子系统) |
| 日志级别 | 默认 DEBUG | 默认 INFO |
| 静态链接 | 否（依赖运行库 DLL） | 是（独立 exe） |

### 11.2 前端热开发流程

修改 `resource/data/html/**` 下的文件后：
- **Debug 模式**: 刷新浏览器即可（资源直读）
- **Release 模式**: 需重新编译资源库：
  ```bash
  cmake --build . --target tools_resource   # 仅重打包资源
  cmake --build .                            # 重新链接主程序
  ```

### 11.3 关键日志过滤器

开发时用 grep/过滤关注以下关键词：
- `HTTP服务已经启动` - 端口确认
- `注册...路由` - 路由注册顺序确认
- `静态文件命中` / `静态文件404` - 资源定位问题
- `来自:<IP>` - 溯源 API 调用方
- `本地IPC` / `单例` - 多实例/关联文件启动问题

### 11.4 常见问题排查

| 现象 | 可能原因 | 解决方案 |
|------|---------|---------|
| 启动即退出，无窗口 | 已有实例在运行（互斥锁） | 检查托盘区已有图标，或任务管理器结束进程 |
| 前端 404 一片白 | Release 模式下未编译资源 | 重编译 `tools_resource` 目标 |
| 上传 >100MB 失败 | httplib 默认 payload 限制 | 项目已改为 4GB，如仍失败检查磁盘空间 |
| OCR 功能报错 | RapidOCR DLL/模型缺失 | 确保 `bin/RapidOCR/` 完整 |
| PDF 工具无响应 | `pdf_tool.exe` 缺失 | 放到 bin/ 目录或在设置中指定路径 |
| MCP 客户端报 logging 错误 | ServerCapabilities.logging 为 null | 确保 McpCore.cpp 中写的是 `json::object()` 而非 `json()` |
| MCP 只显示最后一个工具 | registerTool 的 std::move 问题 | 已修复（先拷贝 key），确认代码版本 |

---

## 12. 附录：关键配置项

### 12.1 app_config 表的键值清单（可在管理后台配置）

| key | 类型 | 说明 |
|-----|------|------|
| `http.port` | int | HTTP 服务端口（默认 3100） |
| `https.enable` | bool | 是否启用 HTTPS |
| `https.port` | int | HTTPS 端口 |
| `https.cert` | string | SSL 证书文件路径 |
| `https.key` | string | SSL 私钥文件路径 |
| `path.temp` | string | 临时目录 |
| `path.upload` | string | 上传文件存储目录 |
| `limit.upload_size` | size_t | 上传文件体积上限（字节） |
| `limit.pdf_size` | size_t | PDF 文件体积上限 |
| `clipboard.invite_ttl_sec` | int | 邀请码有效期（秒） |
| `log.level` | int (0-3) | 日志等级 |
| `log.file_mode` | int (0-2) | 文件输出模式 |
| `log.file_path` | string | 日志文件/目录路径 |
| `tool.pdf_path` | string | pdf_tool.exe 完整路径 |
| `tool.ffmpeg_path` | string | ffmpeg.exe 完整路径 |
| `tool.adb_path` | string | adb.exe 完整路径（ADB 调试工具依赖） |
| `tool.openssl_path` | string | openssl.exe 完整路径 |
| `security.only_localhost` | bool | 是否仅允许本机访问（启用后所有请求强制 localhost 守卫） |

### 12.2 命令行参数（CLI11 定义）

| 参数 | 类型 | 说明 |
|------|------|------|
| `-h, --help` | flag | 打印帮助 |
| `--port` | INT | HTTP 端口（默认 3100，优先级 > 数据库配置） |
| `--https-port` | INT | HTTPS 端口（默认 3101） |
| `--https` | flag | 启用 HTTPS 服务 |
| `--ssl-cert` | PATH | SSL 证书文件路径 |
| `--ssl-key` | PATH | SSL 私钥文件路径 |
| `--temp` | PATH | 临时文件目录 |
| `--invite-code-duration-sec` | INT | 团队邀请码有效期（秒，默认 5） |
| `--log-level` | INT (0-3) | 日志等级（0=DEBUG,1=INFO,2=WARN,3=ERR） |
| `--log-file-mode` | INT (0-2) | 日志文件模式（0=关闭,1=单文件,2=按日期切分） |
| `--log-file` | PATH | 日志文件路径 |
| `[PATH...]` | positional | 零或多个文件路径 → 自动生成文件分享 ID → 打开管理页 |

---

**文档结束**

*本 Code Wiki 对应 LocalToolbox 项目 v1.0.3，基于源码静态分析生成。*