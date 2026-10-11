#include "ocr_dynamic_loader.h"

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#else
#include <dlfcn.h>
#endif

#include <cstring>

namespace ocr {

// ---- 平台辅助函数 ----

#ifdef _WIN32

static std::string extract_dir( const std::string &path ) {
    size_t pos = path.find_last_of( "/\\" );
    if ( pos == std::string::npos )
        return ".";
    return path.substr( 0, pos );
}

static void *platform_load( const std::string &path ) {
    std::string p = path.empty() ? std::string( "OnnxOCR.dll" ) : path;
    std::string dir = extract_dir( p );

    std::wstring wDir( dir.begin(), dir.end() );

    HMODULE h = nullptr;

#if _WIN32_WINNT >= 0x0602
    typedef DLL_DIRECTORY_COOKIE( WINAPI * AddDllDirectory_t )( PCWSTR );
    typedef BOOL( WINAPI * RemoveDllDirectory_t )( DLL_DIRECTORY_COOKIE );

    HMODULE k32 = GetModuleHandleA( "kernel32.dll" );
    auto pAdd = reinterpret_cast<AddDllDirectory_t>(
        GetProcAddress( k32, "AddDllDirectory" ) );
    auto pRemove = reinterpret_cast<RemoveDllDirectory_t>(
        GetProcAddress( k32, "RemoveDllDirectory" ) );

    if ( pAdd ) {
        DLL_DIRECTORY_COOKIE cookie = pAdd( wDir.c_str() );
        if ( cookie == 0 )
            return nullptr;
        h = LoadLibraryExA( p.c_str(), nullptr,
                            LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR |
                                LOAD_LIBRARY_SEARCH_DEFAULT_DIRS );
        if ( !h && pRemove )
            pRemove( cookie );
    } else {
        std::string oldDir;
        char buf[MAX_PATH] = {};
        if ( GetDllDirectoryA( MAX_PATH, buf ) )
            oldDir = buf;
        SetDllDirectoryA( dir.c_str() );
        h = LoadLibraryA( p.c_str() );
        SetDllDirectoryA( oldDir.empty() ? nullptr : oldDir.c_str() );
    }
#else
    std::string oldDir;
    char buf[MAX_PATH] = {};
    if ( GetDllDirectoryA( MAX_PATH, buf ) )
        oldDir = buf;
    SetDllDirectoryA( dir.c_str() );
    h = LoadLibraryA( p.c_str() );
    SetDllDirectoryA( oldDir.empty() ? nullptr : oldDir.c_str() );
#endif

    return reinterpret_cast<void *>( h );
}

static void platform_unload( void *handle ) {
    if ( handle )
        FreeLibrary( reinterpret_cast<HMODULE>( handle ) );
}

static void *platform_resolve( void *handle, const char *name ) {
    if ( !handle )
        return nullptr;
    return reinterpret_cast<void *>( GetProcAddress( reinterpret_cast<HMODULE>( handle ), name ) );
}

static std::string platform_error() {
    DWORD err = GetLastError();
    if ( err == 0 )
        return "no error";
    LPSTR buf = nullptr;
    FormatMessageA(
        FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
        nullptr, err, MAKELANGID( LANG_NEUTRAL, SUBLANG_DEFAULT ),
        reinterpret_cast<LPSTR>( &buf ), 0, nullptr );
    std::string msg( buf ? buf : "unknown error" );
    if ( buf )
        LocalFree( buf );
    return msg;
}
#else
static void *platform_load( const std::string &path ) {
    std::string p;
    if ( path.empty() ) {
#if defined( __APPLE__ )
        p = "libOnnxOCR.dylib";
#else
        p = "libOnnxOCR.so";
#endif
    } else {
        p = path;
    }
    return dlopen( p.c_str(), RTLD_NOW | RTLD_GLOBAL );
}

static void platform_unload( void *handle ) {
    if ( handle )
        dlclose( handle );
}

static void *platform_resolve( void *handle, const char *name ) {
    if ( !handle )
        return nullptr;
    return dlsym( handle, name );
}

static std::string platform_error() {
    const char *err = dlerror();
    return err ? err : "no error";
}
#endif

// ---- OcrDynamicLoader ----

OcrDynamicLoader::OcrDynamicLoader( const std::string &lib_path ) {
    lib_handle_ = platform_load( lib_path );
    if ( !lib_handle_ ) {
        throw DynamicLoaderError(
            "failed to load OnnxOCR library '" +
            ( lib_path.empty() ? std::string( "default" ) : lib_path ) +
            "': " + platform_error() );
    }

    try {
        resolve_symbols();
    } catch ( ... ) {
        platform_unload( lib_handle_ );
        lib_handle_ = nullptr;
        throw;
    }
}

OcrDynamicLoader::~OcrDynamicLoader() {
    if ( lib_handle_ ) {
        platform_unload( lib_handle_ );
        lib_handle_ = nullptr;
    }
}

#define Name_Fn( name ) { #name, reinterpret_cast<void **>( &name##_fn_ ) }

void OcrDynamicLoader::resolve_symbols() {
    struct SymEntry {
        const char *name;
        void **target;
    };
    SymEntry entries[] = {
        Name_Fn( last_error ),
        Name_Fn( version ),

        // 日志API
        Name_Fn( ocr_set_log_level ),
        Name_Fn( ocr_get_log_level ),
        Name_Fn( ocr_set_log_callback ),

        // OCR API
        Name_Fn( ocr_create ),
        Name_Fn( ocr_destroy ),
        Name_Fn( ocr_run ),
        Name_Fn( ocr_run_file ),
        Name_Fn( ocr_free_results ),

        // 车牌识别API
        Name_Fn( plate_create ),
        Name_Fn( plate_destroy ),
        Name_Fn( plate_run ),
        Name_Fn( plate_run_file ),
        Name_Fn( plate_free_results ),

        // 表格识别API
        Name_Fn( table_create ),
        Name_Fn( table_destroy ),
        Name_Fn( table_run ),
        Name_Fn( table_run_file ),
        Name_Fn( table_free_result ),

        // 版面分析统一API
        Name_Fn( doclayout_yolo_create ),
        Name_Fn( doclayout_yolo_destroy ),
        Name_Fn( doclayout_yolo_run ),
        Name_Fn( doclayout_yolo_run_file ),
        Name_Fn( doc_layout_free_results ),

        // 图像显示API
        Name_Fn( image_show_rects ),
        Name_Fn( image_show_rects_file ),

    };

    for ( const auto &e : entries ) {
        *e.target = platform_resolve( lib_handle_, e.name );
        if ( !*e.target ) {
            throw DynamicLoaderError(
                std::string( "failed to resolve symbol '" ) + e.name +
                "': " + platform_error() );
        }
    }
}

#undef Name_Fn

} // namespace ocr