CREATE TABLE IF NOT EXISTS users (
    -- 用户表
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    nickname TEXT,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    -- 会话表
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clipboard_teams (
    -- 团队表
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clipboard_team_members (
    -- 团队成员表
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at TEXT NOT NULL,
    UNIQUE(team_id, user_id)
);
CREATE TABLE IF NOT EXISTS clipboard_items (
    -- 剪贴板项表
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT,
    html_content TEXT,
    mime_type TEXT,
    file_url TEXT,
    file_name TEXT,
    file_size INTEGER,
    created_by_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clipboard_team ON clipboard_items(team_id, created_at DESC);
CREATE TABLE IF NOT EXISTS clipboard_team_invite_codes (
    -- 团队邀请码表
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    team_id TEXT NOT NULL,
    created_by_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS clipboard_file_downloads (
    -- 剪贴板文件下载表
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    clipboard_item_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS file_shares (
    -- 文件分享表
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    real_path TEXT NOT NULL,
    is_directory INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS file_share_permissions (
    -- 文件分享权限表
    id TEXT PRIMARY KEY,
    share_id TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    user_id TEXT,
    can_access INTEGER DEFAULT 0,
    can_download INTEGER DEFAULT 0,
    can_upload INTEGER DEFAULT 0,
    can_delete INTEGER DEFAULT 0,
    can_rename INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fsp_share ON file_share_permissions(share_id);

CREATE TABLE IF NOT EXISTS app_config (
    -- 应用配置表（键值对结构）
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
    -- 用户设置表（每个用户的键值对偏好设置）
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);

-- HTTP 服务器表（本机工具）
CREATE TABLE IF NOT EXISTS http_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    port INTEGER NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'stopped',
    error_msg TEXT,
    auto_start INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- HTTP 挂载/代理表
CREATE TABLE IF NOT EXISTS http_server_mounts (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    path TEXT NOT NULL,
    source TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (server_id) REFERENCES http_servers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_http_server_mounts_sid ON http_server_mounts(server_id);

-- 进程配置表（本机工具）
CREATE TABLE IF NOT EXISTS proc_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    command TEXT NOT NULL,
    args TEXT NOT NULL DEFAULT '[]',
    working_dir TEXT DEFAULT '',
    env_inherit INTEGER NOT NULL DEFAULT 1,
    auto_start INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'stopped',
    pid INTEGER NOT NULL DEFAULT 0,
    exit_code INTEGER NOT NULL DEFAULT 0,
    error_msg TEXT DEFAULT '',
    remarks TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 进程环境变量表
CREATE TABLE IF NOT EXISTS proc_env_vars (
    id TEXT PRIMARY KEY,
    config_id TEXT NOT NULL,
    name TEXT NOT NULL,
    value TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (config_id) REFERENCES proc_configs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_proc_env_vars_sid ON proc_env_vars(config_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_proc_env_vars_unique ON proc_env_vars(config_id, name);

-- 备忘录表
CREATE TABLE IF NOT EXISTS memos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memos_updated ON memos(updated_at DESC);

-- 文档阅读源表
CREATE TABLE IF NOT EXISTS doc_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_sources_updated ON doc_sources(updated_at DESC);

-- 音乐扫描目录表
CREATE TABLE IF NOT EXISTS music_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_music_sources_updated ON music_sources(updated_at DESC);

-- 音乐黑名单表（与目录关联，被拉黑的歌曲不参与扫描/播放）
CREATE TABLE IF NOT EXISTS music_blacklist (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_music_blacklist_source ON music_blacklist(source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_music_blacklist_source_path ON music_blacklist(source_id, path);