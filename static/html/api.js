(function () {
    'use strict';

    const Api = {};
    const PREFIX = '/api';

    Api.PREFIX = PREFIX;

    function parseJSON(res) {
        return res.text().then(function (t) {
            if (!t) return {};
            try { return JSON.parse(t); } catch (e) { return { success: false, error: 'Invalid JSON' }; }
        });
    }

    function request(method, path, body, isForm) {
        var url = PREFIX + path;
        var opts = { method: method, credentials: 'include' };
        if (!isForm) opts.headers = { 'Content-Type': 'application/json' };
        if (body !== undefined && body !== null) {
            opts.body = isForm ? body : JSON.stringify(body);
        }
        return fetch(url, opts).then(function (res) {
            return parseJSON(res).then(function (data) {
                data._status = res.status;
                return data;
            });
        });
    }

    function buildPath(path) {
        return PREFIX + path;
    }

    Api.get = function (url) { return request('GET', url); };
    Api.post = function (url, body) { return request('POST', url, body); };
    Api.put = function (url, body) { return request('PUT', url, body); };
    Api.delete = function (url, body) { return request('DELETE', url, body); };
    Api.upload = function (url, formData) { return request('POST', url, formData, true); };

    // XHR 上传（支持进度回调，用于 PDF 等大文件操作）
    Api.uploadXHR = function (path, formData, opts) {
        opts = opts || {};
        var url = PREFIX + path;
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.responseType = opts.responseType || 'blob';
        xhr.withCredentials = true;

        if (opts.onProgress) {
            xhr.upload.onprogress = function (e) {
                if (e.lengthComputable) opts.onProgress(e);
            };
        }

        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
                if (opts.onLoad) opts.onLoad(xhr, xhr.response);
            } else {
                if (opts.onError) {
                    var reader = new FileReader();
                    reader.onload = function () {
                        var err = null;
                        try { err = JSON.parse(reader.result); } catch (e) { }
                        opts.onError(xhr, err);
                    };
                    reader.readAsText(xhr.response);
                }
            }
        };

        xhr.onerror = function () {
            if (opts.onError) opts.onError(xhr, null);
        };

        xhr.send(formData);
        return xhr;
    };

    Api.auth = {
        login: function (email, password) { return Api.post('/auth/login', { email: email, password: password }); },
        register: function (email, password, nickname) { return Api.post('/auth/register', { email: email, password: password, nickname: nickname }); },
        logout: function () { return Api.post('/auth/logout'); },
        me: function () { return Api.get('/auth/me'); },
        updateMe: function (data) { return Api.put('/auth/me', data); }
    };

    Api.teams = {
        list: function (defaultOnly) {
            return Api.get('/teams' + (defaultOnly ? '?defaultOnly=true' : ''));
        },
        get: function (id) { return Api.get('/teams/' + id); },
        create: function (name) { return Api.post('/teams', { name: name }); },
        delete: function (id) { return Api.delete('/teams/' + id); },
        leave: function (id) { return Api.delete('/teams/' + id + '/leave'); },
        members: function (id) { return Api.get('/teams/' + id + '/members'); },
        removeMember: function (teamId, userId) { return Api.delete('/teams/' + teamId + '/members/' + userId); },
        inviteCode: function (teamId) { return Api.post('/teams/invite', { teamId: teamId }); },
        refreshInvite: function (teamId) { return Api.put('/teams/invite', { teamId: teamId }); },
        cancelInvite: function (teamId) { return Api.delete('/teams/invite', { teamId: teamId }); },
        join: function (code) { return Api.post('/teams/join', { code: code }); },
        validateInvite: function (code) { return Api.get('/teams/invite/' + code); }
    };

    Api.clipboard = {
        list: function (teamId, since, onlyCount) {
            var url = '/clipboard?teamId=' + encodeURIComponent(teamId);
            if (since) url += '&since=' + encodeURIComponent(since);
            if (onlyCount) url += '&onlyCount=true';
            return Api.get(url);
        },
        create: function (data) { return Api.post('/clipboard', data); },
        upload: function (teamId, formData) {
            formData.append('teamId', teamId);
            return Api.upload('/clipboard/upload', formData);
        },
        download: function (itemId) { return Api.post('/clipboard/' + itemId + '/download'); },
        delete: function (id) { return Api.delete('/clipboard/' + id); }
    };

    Api.fileservice = {
        list: function () { return Api.get('/fileservice'); },
        browse: function (shareId, path, showHidden) {
            var url = '/fileservice/' + shareId + '/list';
            var qs = [];
            if (path) qs.push('path=' + encodeURIComponent(path));
            if (showHidden) qs.push('showHidden=1');
            if (qs.length) url += '?' + qs.join('&');
            return Api.get(url);
        },
        search: function (shareId, keyword, showHidden) {
            var url = '/fileservice/' + shareId + '/search?q=' + encodeURIComponent(keyword);
            if (showHidden) url += '&showHidden=1';
            return Api.get(url);
        },
        download: function (shareId, path) {
            return buildPath('/fileservice/' + shareId + '/download' + (path ? '?path=' + encodeURIComponent(path) : ''));
        },
        // 上传接口路径（直接用 XHR/fetch 调用，由调用方决定是否带进度、是否分片）
        // size: 文件大小（字节），可选；传给后端用于准确的进度/剩余时间展示
        uploadPath: function (shareId, path, size) {
            var url = PREFIX + '/fileservice/' + shareId + '/upload?path=' + encodeURIComponent(path || '');
            if (size && size > 0) url += '&size=' + encodeURIComponent(String(size));
            return url;
        },
        delete: function (shareId, path) {
            var url = '/fileservice/' + shareId + '/delete';
            if (path) url += '?path=' + encodeURIComponent(path);
            return Api.delete(url);
        },
        rename: function (shareId, path, newName) {
            var url = '/fileservice/' + shareId + '/rename';
            return Api.put(url, { path: path, newName: newName });
        }
    };

    Api.admin = {
        users: function () { return Api.get('/admin/users'); },
        createUser: function (data) { return Api.post('/admin/users', data); },
        updateUser: function (id, data) { return Api.put('/admin/users/' + encodeURIComponent(id), data); },
        deleteUser: function (id) { return Api.delete('/admin/users/' + encodeURIComponent(id)); },
        listShares: function () { return Api.get('/admin/shares'); },
        createShare: function (data) { return Api.post('/admin/shares', data); },
        updateShare: function (id, data) { return Api.put('/admin/shares/' + id, data); },
        deleteShare: function (id) { return Api.delete('/admin/shares/' + id); },
        parameterPaths: function (id) { return Api.get('/admin/shares/parameter/paths?id=' + encodeURIComponent(id)); },
        getConfig: function () { return Api.get('/admin/config'); },
        updateConfig: function (data) { return Api.put('/admin/config', data); },
        reboot: function (config) { return Api.post('/admin/reboot', config || []); }
    };

    Api.tools = {
        catalog: function () { return Api.get('/tools/catalog'); },
        ipLookup: function (ip) {
            return Api.get('/tools/ip' + (ip ? '?ip=' + encodeURIComponent(ip) : ''));
        },
        proxy: function (payload) { return Api.post('/tools/proxy', payload); },
        qrcode: function (text, format, ecc) {
            var url = '/tools/qrcode?text=' + encodeURIComponent(text);
            if (format) url += '&format=' + encodeURIComponent(format);
            if (ecc) url += '&ecc=' + encodeURIComponent(ecc);
            if (format === 'matrix') return Api.get(url);
            return buildPath(url);
        },
        imageConvert: function (formData, opts) {
            return Api.uploadXHR('/tools/image/convert', formData, opts);
        },
        imageOcrModels: function () {
            return Api.get('/tools/image/ocr/models');
        },
        imageOcrSubmit: function (formData) {
            return Api.upload('/tools/image/ocr/submit', formData);
        },
        imageOcrStatus: function (taskId) {
            return Api.get('/tools/image/ocr/status/' + encodeURIComponent(taskId));
        },
        imageOcrDismiss: function (taskId) {
            return Api.delete('/tools/image/ocr/status/' + encodeURIComponent(taskId));
        },
        imageConvertStatus: function (taskId) {
            return Api.get('/tools/image/convert/status/' + encodeURIComponent(taskId));
        }
    };


    Api.localTools = {
        // 获取本机ip地址
        localIp: function () { return Api.get('/local/localIp'); },

        // 浏览本机目录（仅本机可访问）
        browse: function (path) {
            var url = '/local/fs';
            if (path) url += '?path=' + encodeURIComponent(path);
            return Api.get(url);
        },
        // 批量重命名
        rename: function (items, allowOverwrite) {
            return Api.post('/local/rename', {
                items: items,
                allowOverwrite: !!allowOverwrite
            });
        },
        // MCP 调试代理（使用 McpClient 连接目标 MCP 服务，仅本机可访问）
        mcpDebug: function (data) { return Api.post('/local/mcp_debug', data); },
        // HTTP 服务器（路径挂载/请求代理）
        httpServers: {
            list: function () { return Api.get('/local/http/servers'); },
            create: function (data) { return Api.post('/local/http/servers', data); },
            update: function (id, data) { return Api.put('/local/http/servers/' + encodeURIComponent(id), data); },
            remove: function (id) { return Api.delete('/local/http/servers/' + encodeURIComponent(id)); },
            start: function (id) { return Api.post('/local/http/servers/' + encodeURIComponent(id) + '/start'); },
            stop: function (id) { return Api.post('/local/http/servers/' + encodeURIComponent(id) + '/stop'); }
        },
        // 进程管理
        procs: {
            list: function () { return Api.get('/local/procs'); },
            create: function (data) { return Api.post('/local/procs', data); },
            update: function (id, data) { return Api.put('/local/procs/' + encodeURIComponent(id), data); },
            remove: function (id) { return Api.delete('/local/procs/' + encodeURIComponent(id)); },
            start: function (id) { return Api.post('/local/procs/' + encodeURIComponent(id) + '/start'); },
            stop: function (id, force) {
                return Api.post('/local/procs/' + encodeURIComponent(id) + '/stop' + (force ? '?force=1' : ''));
            },
            logs: function (id, since, limit) {
                var q = [];
                if (since) q.push('since=' + since);
                if (limit) q.push('limit=' + limit);
                return Api.get('/local/procs/' + encodeURIComponent(id) + '/logs' + (q.length ? '?' + q.join('&') : ''));
            },
            clearLogs: function (id) { return Api.post('/local/procs/' + encodeURIComponent(id) + '/logs/clear'); }
        },
        // FFmpeg 视频处理
        ffmpeg: {
            info: function () { return Api.get('/ffmpeg/info'); },
            list: function () { return Api.get('/ffmpeg/tasks'); },
            create: function (data) { return Api.post('/ffmpeg/tasks', data); },
            get: function (id) { return Api.get('/ffmpeg/tasks/' + encodeURIComponent(id)); },
            cancel: function (id) { return Api.post('/ffmpeg/tasks/' + encodeURIComponent(id) + '/cancel', {}); },
            remove: function (id) { return Api.delete('/ffmpeg/tasks/' + encodeURIComponent(id)); },
            setParallel: function (n) { return Api.post('/ffmpeg/parallel', { maxParallel: n }); }
        },
        // 备忘录
        memos: {
            list: function () { return Api.get('/local/memos'); },
            create: function (data) { return Api.post('/local/memos', data); },
            update: function (id, data) { return Api.put('/local/memos/' + encodeURIComponent(id), data); },
            remove: function (id) { return Api.delete('/local/memos/' + encodeURIComponent(id)); }
        },
        // 自签名证书生成（依赖 Config::getOpensslPath()）
        cert: {
            info: function () { return Api.get('/cert/info'); },
            generate: function (data) { return Api.post('/cert/generate', data); }
        },
        // 文档阅读
        docs: {
            listSources: function () { return Api.get('/docs/sources'); },
            createSource: function (data) { return Api.post('/docs/sources', data); },
            updateSource: function (id, data) { return Api.put('/docs/sources/' + encodeURIComponent(id), data); },
            removeSource: function (id) { return Api.delete('/docs/sources/' + encodeURIComponent(id)); },
            getTree: function (id, opts) {
                opts = opts || {};
                var qs = [];
                if (opts.path) qs.push('path=' + encodeURIComponent(opts.path));
                if (opts.depth) qs.push('depth=' + encodeURIComponent(opts.depth));
                var url = '/docs/sources/' + encodeURIComponent(id) + (qs.length ? '?' + qs.join('&') : '');
                return Api.get(url);
            },
            // 选源/内部 HTTP 服务管理(返回 baseUrl, iframe 通过该 URL 加载文档)
            selectSource: function (id) { return Api.post('/docs/source/select', { id: id }); },
            deselectSource: function () { return Api.post('/docs/source/deselect', {}); },
            status: function () { return Api.get('/docs/status'); }
        },
        game: {
            list: function () { return Api.get('/game/list'); },
            start: function () { return Api.post('/game/start', {}); },
            status: function () { return Api.get('/game/status'); }
        },
        // 音乐播放器
        music: {
            listSources: function () { return Api.get('/local/music/sources'); },
            createSource: function (data) { return Api.post('/local/music/sources', data); },
            removeSource: function (id) { return Api.delete('/local/music/sources/' + encodeURIComponent(id)); },
            scan: function (sourceId) {
                var url = '/local/music/scan';
                if (sourceId) url += '?sourceId=' + encodeURIComponent(sourceId);
                return Api.get(url);
            },
            audioUrl: function (path) { return '/api/local/music/audio?path=' + encodeURIComponent(path); },
            coverUrl: function (path) { return '/api/local/music/cover?path=' + encodeURIComponent(path); },
            lyrics: function (path) { return Api.get('/local/music/lyrics?path=' + encodeURIComponent(path)); },
            blacklist: {
                list: function (sourceId) {
                    var url = '/local/music/blacklist';
                    if (sourceId) url += '?sourceId=' + encodeURIComponent(sourceId);
                    return Api.get(url);
                },
                add: function (data) { return Api.post('/local/music/blacklist', data); },
                remove: function (data) { return Api.delete('/local/music/blacklist', data); }
            }
        },
        adb: {
            info: function () { return Api.get('/local/adb/info'); },
            devices: function () { return Api.get('/local/adb/devices'); },
            connect: function (target) { return Api.post('/local/adb/connect', { target: target }); },
            disconnect: function (target) { return Api.post('/local/adb/disconnect', { target: target }); },
            forwardList: function (serial, reverse) {
                var url = '/local/adb/forward/list';
                var params = [];
                if (serial) params.push('serial=' + encodeURIComponent(serial));
                if (reverse) params.push('reverse=true');
                if (params.length) url += '?' + params.join('&');
                return Api.get(url);
            },
            forwardAdd: function (data) { return Api.post('/local/adb/forward/add', data); },
            forwardRemove: function (data) { return Api.post('/local/adb/forward/remove', data); },
            forwardRemoveAll: function (data) { return Api.post('/local/adb/forward/removeAll', data); },
            shell: function (data) { return Api.post('/local/adb/shell', data); },
            logcat: function (serial, tag, level, pid, pkg, lines) {
                var url = '/local/adb/logcat';
                var params = [];
                if (serial) params.push('serial=' + encodeURIComponent(serial));
                if (tag) params.push('tag=' + encodeURIComponent(tag));
                if (level) params.push('level=' + encodeURIComponent(level));
                if (pid) params.push('pid=' + encodeURIComponent(pid));
                if (pkg) params.push('package=' + encodeURIComponent(pkg));
                if (lines) params.push('lines=' + encodeURIComponent(String(lines)));
                if (params.length) url += '?' + params.join('&');
                return Api.get(url);
            },
            logcatClear: function (data) { return Api.post('/local/adb/logcat/clear', data); }
        },
        batchOcr: {
            models: function () {
                return Api.get('/tools/image/ocr/models');
            },
            submit: function (data) {
                return Api.post('/tools/image/ocr/batch', data);
            },
            list: function () {
                return Api.get('/tools/image/ocr/batch');
            },
            status: function (taskId) {
                return Api.get('/tools/image/ocr/batch/' + encodeURIComponent(taskId));
            },
            dismiss: function (taskId) {
                return Api.delete('/tools/image/ocr/batch/' + encodeURIComponent(taskId));
            }
        },
    };

    Api.pdf = {
        compress: function (formData, opts) { return Api.uploadXHR('/pdf/compress', formData, opts); },
        merge: function (formData, opts) { return Api.uploadXHR('/pdf/merge', formData, opts); },
        split: function (formData, opts) { return Api.uploadXHR('/pdf/split', formData, opts); },
        extract: function (formData, opts) { return Api.uploadXHR('/pdf/extract', formData, opts); },
        rotate: function (formData, opts) { return Api.uploadXHR('/pdf/rotate', formData, opts); },
        watermark: function (formData, opts) { return Api.uploadXHR('/pdf/watermark', formData, opts); },
        tempFile: function (sessionId, file) { return buildPath('/pdf/temp/' + sessionId + '/' + file); }
    };

    Api.storage = {
        key: 'auth-storage',
        load: function () {
            try {
                var raw = localStorage.getItem(Api.storage.key);
                return raw ? JSON.parse(raw) : null;
            } catch (e) { return null; }
        },
        save: function (data) {
            localStorage.setItem(Api.storage.key, JSON.stringify(data));
        },
        clear: function () {
            localStorage.removeItem(Api.storage.key);
        }
    };

    Api.settings = {
        list: function () { return Api.get('/settings'); },
        update: function (data) { return Api.put('/settings', data); },
        remove: function (key) { return Api.delete('/settings/' + encodeURIComponent(key)); }
    };

    window.Api = Api;
})();