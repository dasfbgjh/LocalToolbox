cmake_minimum_required(VERSION 3.10)
project(LocalToolbox
    VERSION 1.0.4
    DESCRIPTION "LocalToolbox - a collection of useful tools"
    HOMEPAGE_URL "https://github.com/dasfbgjh/LocalToolbox"
)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/bin)

# 导入应用信息
include(${CMAKE_CURRENT_SOURCE_DIR}/appInfo/AppInfo.cmake)

# 导入 OpenSSL 库
find_package(OpenSSL REQUIRED COMPONENTS SSL Crypto)

# 导入 httplib 库
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/3rdparty/httplib)

if(OPENSSL_FOUND)
    message(STATUS "OpenSSL support enabled")
    add_compile_definitions(-DCPPHTTPLIB_OPENSSL_SUPPORT)
    link_libraries(ssl crypto)
endif()

if(WIN32)
    add_compile_definitions(-D_WIN32_WINNT=0x0A00)
endif()

# 导入 boost 库
find_package(Boost REQUIRED CONFIG COMPONENTS process filesystem regex)

# 导入 hwinfo 库
set(HWINFO_SHARED OFF)
set(HWINFO_STATIC ON)
add_subdirectory(3rdparty/hwinfo)

# 导入资源文件
set(RESOURCE_NAME_PREIFX ${PROJECT_NAME})
add_subdirectory(resource)

if(NOT CMAKE_BUILD_TYPE STREQUAL "Debug")
    set(WIN_GUI WIN32)
endif()

set(APP_FILE_NAME ${PROJECT_NAME})
add_executable(${APP_FILE_NAME} ${WIN_GUI}
    ${APPINFO_SRC}
    src/main.cpp
    src/common/App.cpp
    src/common/Config.cpp
    src/common/SystemTray.cpp
    src/common/EventLoop.cpp
    src/common/Utils.cpp
    src/core/Server.cpp
    src/core/Sha256.cpp
    src/core/TransferTracker.cpp
    src/core/Database.cpp
    src/core/HttpServerManager.cpp
    src/core/ProcManager.cpp
    src/core/WebviewWrapper.cpp
    src/core/McpCore.cpp
    src/core/McpServer.cpp
    src/core/McpClient.cpp
    src/core/McpTools.cpp
    src/core/CertGenerator.cpp
    src/routes/ADBTool.cpp
    src/routes/Admin.cpp
    src/routes/Auth.cpp
    src/routes/Clipboard.cpp
    src/routes/Teams.cpp
    src/routes/FileService.cpp
    src/routes/Tools.cpp
    src/routes/PdfTools.cpp
    src/routes/Settings.cpp
    src/routes/LocalTools.cpp
    src/routes/FfmpegTool.cpp
    src/routes/CertTool.cpp
    src/routes/DocTool.cpp
    src/routes/MusicTool.cpp
    src/routes/GameTool.cpp
    src/routes/SysMonitor.cpp
    src/routes/OcrTools.cpp
    src/routes/BatchOcrTool.cpp
    src/core/OcrEngine.cpp
    src/routes/Mcp.cpp
    3rdparty/qrcodegen/qrcodegen.cpp
    3rdparty/OnnxOCR/ocr_dynamic_loader.cpp
)
target_include_directories(${APP_FILE_NAME} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src

    # cli11
    ${CMAKE_CURRENT_SOURCE_DIR}/3rdparty/cli11

    # qrcodegen
    ${CMAKE_CURRENT_SOURCE_DIR}/3rdparty/qrcodegen

    # tray
    ${CMAKE_CURRENT_SOURCE_DIR}/3rdparty/tray/include

    # stb_image
    ${CMAKE_CURRENT_SOURCE_DIR}/3rdparty/stb

    # OnnxOCR
    ${CMAKE_CURRENT_SOURCE_DIR}/3rdparty/OnnxOCR

    # webview2
    ${CMAKE_CURRENT_SOURCE_DIR}/3rdparty/webview/core/include
    ${CMAKE_CURRENT_SOURCE_DIR}/3rdparty/webview2/include
)
target_compile_definitions(${APP_FILE_NAME} PRIVATE
    -DTRAY_WINAPI=1 # 启用系统托盘
    -DCMAKE_SOURCE_DIR="${CMAKE_SOURCE_DIR}" # 用于日志中转换文件路径到相对路径
)

target_link_options(${APP_FILE_NAME} PRIVATE
    -static-libstdc++ -static-libgcc -static
)

# Debug 模式下，直接读取资源从系统目录
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    target_compile_definitions(${APP_FILE_NAME} PRIVATE
        -DRESOURCE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/resource/data"
    )
endif()

target_link_libraries(${APP_FILE_NAME} PRIVATE
    ${RESOURCE_NAME_PREIFX}_resource

    # SQLite3
    sqlite3

    # boost
    Boost::process
    Boost::filesystem
    Boost::regex

    # hwinfo
    hwinfo_cpu
    hwinfo_ram
    hwinfo_mainboard
    hwinfo_disk
    hwinfo_os
    hwinfo_battery
    hwinfo_gpu
    hwinfo_network
)

if(WIN32)
    target_link_libraries(${APP_FILE_NAME} PRIVATE
        iphlpapi
        crypt32
        ws2_32

        # webview2
        advapi32 ole32 shell32 shlwapi user32 version
    )
endif()

# ----------------------------------------------------------------
add_executable(test
    test/test.cpp
)
target_include_directories(test PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)
target_compile_definitions(test PRIVATE
    -DCMAKE_SOURCE_DIR="${CMAKE_SOURCE_DIR}"
)
target_link_libraries(test PRIVATE
    Boost::process
    Boost::filesystem
    Boost::regex
)