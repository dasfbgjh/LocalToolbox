(function () {
    'use strict';
    var Api = window.Api;

    function $(id) { return document.getElementById(id); }
    function showBanner(type, msg) {
        var cls = 'info';
        if (type === 'error') cls = 'error';
        else if (type === 'warn') cls = 'warn';
        else if (type === 'success') cls = 'success';
        var el = $('fd-banner');
        if (!el) return;
        el.innerHTML = '<div class="tool-banner ' + cls + '">' + window.App.escapeHtml(msg) + '</div>';
        if (type === 'success') setTimeout(clearBanner, 4000);
    }
    function clearBanner() { var el = $('fd-banner'); if (el) el.innerHTML = ''; }

    function formatSize(b) {
        if (b == null || isNaN(b)) return '-';
        if (b < 1024) return b + ' B';
        var u = ['KB', 'MB', 'GB', 'TB'];
        var i = -1;
        var n = b;
        do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
        return n.toFixed(2) + ' ' + u[i];
    }

    function formatDuration(sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s = sec % 60;
        if (h > 0) return h + ':' + (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
        return m + ':' + (s < 10 ? '0' + s : s);
    }

    function copyToClipboard(text, btn) {
        var done = function () {
            if (btn) {
                var orig = btn.textContent;
                btn.textContent = '已复制';
                btn.disabled = true;
                setTimeout(function () { btn.textContent = orig; btn.disabled = false; }, 1500);
            }
        };
        var fail = function () {
            if (btn) {
                var orig = btn.textContent;
                btn.textContent = '失败';
                setTimeout(function () { btn.textContent = orig; }, 1500);
            }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(function () {
                fallbackCopy(text) ? done() : fail();
            });
        } else {
            fallbackCopy(text) ? done() : fail();
        }
    }
    function fallbackCopy(text) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.top = '-1000px';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return !!ok;
        } catch (e) { return false; }
    }

    // ===== 状态 =====
    var currentMode = 'download';   // 'download' | 'record'
    var openedTaskIds = {};         // 用户点开查看详情的任务
    var ffmpegInfo = null;

    // ===== 检测 ffmpeg =====
    function loadInfo() {
        Api.localTools.ffmpeg.info().then(function (data) {
            ffmpegInfo = data || {};
            var info = $('fd-info');
            if (!data || data.available === false) {
                info.innerHTML = '<span class="pill err">FFmpeg 不可用</span>' +
                    '<span class="pill">' + window.App.escapeHtml((data && data.error) || '未知错误') + '</span>';
            } else {
                var html = '<span class="pill ok">✓ 可用</span>';
                if (data.version) html += '<span class="pill">' + window.App.escapeHtml(data.version) + '</span>';
                if (data.ffmpegPath) html += '<span class="pill" title="' + window.App.escapeHtml(data.ffmpegPath) + '">' + window.App.escapeHtml(data.ffmpegPath) + '</span>';
                info.innerHTML = html;
            }
            loadConfig();
            updateAddBtn();
        }).catch(function (err) {
            $('fd-info').innerHTML = '<span class="pill err">请求失败</span>';
            loadConfig();
        });
    }

    // ===== 模式切换 =====
    function switchMode(mode) {
        currentMode = mode;
        var tabs = document.querySelectorAll('.fd-mode-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].getAttribute('data-mode') === mode);
        }
        var h2 = $('fd-mode-h2');
        if (mode === 'download') {
            h2.textContent = '下载设置';
            $('fd-url').placeholder = 'https://example.com/path/to/index.m3u8 或 http(s)://...';
        } else {
            h2.textContent = '录制设置';
            $('fd-url').placeholder = 'rtmp://server/live/stream 或 rtsp://camera/stream';
        }
        saveConfig();
    }
    for (var i = 0; i < document.querySelectorAll('.fd-mode-tab').length; i++) {
        (function (tab) {
            tab.addEventListener('click', function () { switchMode(tab.getAttribute('data-mode')); });
        })(document.querySelectorAll('.fd-mode-tab')[i]);
    }

    // ===== 输出路径校验 =====
    function updateAddBtn() {
        var btn = $('fd-btn-add');
        var ok = ffmpegInfo && ffmpegInfo.available === true;
        var urlOk = !!($('fd-url').value || '').trim();
        var dirOk = !!($('fd-output-dir').value || '').trim();
        var nameOk = !!($('fd-base-name').value || '').trim();
        btn.disabled = !(ok && urlOk && dirOk && nameOk);
        btn.textContent = currentMode === 'record' ? '开始录制' : '开始下载';
    }
    ['fd-url', 'fd-output-dir', 'fd-base-name'].forEach(function (id) {
        $(id).addEventListener('input', updateAddBtn);
    });

    // ===== 目录浏览器（使用公共模块 FsBrowser） =====
    var outputDirInput = $('fd-output-dir');

    function openBrowser() {
        window.FsBrowser.open({
            mode: 'dir',
            api: 'local',
            title: '选择输出目录',
            initialPath: outputDirInput.value.trim() || '',
            onConfirm: function (p) {
                outputDirInput.value = p;
                updateAddBtn();
            }
        });
    }

    $('fd-btn-pick-dir').onclick = openBrowser;

    // ===== 提交下载/录制 =====
    function submit() {
        clearBanner();
        var url = ($('fd-url').value || '').trim();
        if (!url) { showBanner('error', '请填写源 URL'); return; }
        if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//.test(url)) {
            showBanner('error', 'URL 必须以协议头开始 (http:// / rtmp:// / rtsp:// / ...)');
            return;
        }
        var outDir = ($('fd-output-dir').value || '').trim();
        if (!outDir) { showBanner('error', '请填写输出目录'); return; }
        var baseName = ($('fd-base-name').value || '').trim();
        if (!baseName) { showBanner('error', '请填写文件名前缀'); return; }
        if (baseName.indexOf('/') >= 0 || baseName.indexOf('\\') >= 0 || baseName.indexOf('..') >= 0) {
            showBanner('error', '文件名前缀非法'); return;
        }
        var fmt = $('fd-format').value || 'mp4';
        var ext = '.' + fmt;
        var outPath = outDir.replace(/[\\/]+$/, '') + (outDir.indexOf('\\') >= 0 || outDir.indexOf('/') >= 0 ? '\\' : '/') + baseName + ext;

        // 解析 headers
        var headers = [];
        var headersRaw = $('fd-headers').value || '';
        headersRaw.split(/\r?\n/).forEach(function (line) {
            var t = line.trim();
            if (t) headers.push(t);
        });

        var body = {
            inputPath: url,
            outputPath: outPath,
            operation: 'download',
            encoder: 'auto',
            options: {
                outputFormat: fmt,
                outputDir: outDir,
                timeoutMs: parseInt($('fd-timeout').value, 10) || 30000,
                reconnect: $('fd-reconnect').checked,
                hlsAllowExtensions: $('fd-hls-ext').checked,
                reEncode: $('fd-reencode').checked,
                recordDurationSec: parseFloat($('fd-duration').value, 10) || 0
            }
        };
        if (headers.length) body.options.headers = headers;

        $('fd-btn-add').disabled = true;
        var origText = $('fd-btn-add').textContent;
        $('fd-btn-add').textContent = '提交中...';

        Api.localTools.ffmpeg.create(body).then(function (data) {
            if (data && data.success) {
                showBanner('success', '已加入任务队列：' + (data.id || ''));
                refreshTasks();
            } else {
                showBanner('error', (data && data.error) || '创建任务失败');
            }
        }).catch(function (err) {
            showBanner('error', '创建任务失败: ' + err);
        }).finally(function () {
            $('fd-btn-add').textContent = origText;
            updateAddBtn();
        });
    }
    $('fd-btn-add').onclick = submit;

    // ===== 任务列表 =====
    function refreshTasks() {
        Api.localTools.ffmpeg.list().then(function (data) {
            if (!data || !data.success) {
                $('fd-task-list').innerHTML = '<div class="fd-empty">加载任务失败</div>';
                return;
            }
            var tasks = (data.tasks || []).filter(function (t) { return t.operation === 'download'; });
            var summary = $('fd-task-summary');
            if (tasks.length === 0) {
                summary.textContent = '';
                $('fd-task-list').innerHTML = '<div class="fd-empty">暂无下载/录制任务</div>';
                return;
            }
            var counts = { running: 0, pending: 0, completed: 0, failed: 0, cancelled: 0 };
            tasks.forEach(function (t) { counts[t.status] = (counts[t.status] || 0) + 1; });
            summary.textContent = '共 ' + tasks.length + ' 个 (运行:' + counts.running + ', 排队:' + counts.pending + ', 完成:' + counts.completed + ', 失败:' + counts.failed + ', 取消:' + counts.cancelled + ')';

            tasks.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
            var html = '';
            tasks.forEach(function (t) {
                html += renderTask(t);
            });
            $('fd-task-list').innerHTML = html;
            // 绑定按钮
            Array.prototype.forEach.call($('fd-task-list').querySelectorAll('[data-act]'), function (el) {
                var act = el.getAttribute('data-act');
                var id = el.getAttribute('data-id');
                el.onclick = function () { onTaskAction(act, id); };
            });
        }).catch(function (err) {
            $('fd-task-list').innerHTML = '<div class="fd-empty">加载任务失败: ' + window.App.escapeHtml(String(err)) + '</div>';
        });
    }

    function renderTask(t) {
        var pct = Math.max(0, Math.min(100, t.progress || 0));
        var indeterminate = t.status === 'running' && (!t.durationSec || t.durationSec <= 0);
        var progHtml = '<div class="fd-bar' + (indeterminate ? ' indeterminate' : '') + '"><div style="width:' + pct + '%"></div></div>';
        var meta = [];
        if (t.outTimeSec > 0 && t.durationSec > 0) {
            meta.push(formatDuration(t.outTimeSec) + ' / ' + formatDuration(t.durationSec));
        } else if (t.outTimeSec > 0) {
            meta.push('已用 ' + formatDuration(t.outTimeSec));
        }
        if (t.speed > 0) meta.push('速度 ' + t.speed.toFixed(2) + 'x');
        if (t.bitrateKbps > 0) meta.push('码率 ' + t.bitrateKbps.toFixed(0) + ' kbps');
        if (t.outputSize > 0) meta.push('已写 ' + formatSize(t.outputSize));
        if (t.elapsedMs > 0 && t.status === 'running') meta.push('耗时 ' + formatDuration(t.elapsedMs / 1000));

        var actions = '';
        if (t.status === 'pending' || t.status === 'running') {
            actions += '<button class="btn btn-ghost btn-sm" data-act="cancel" data-id="' + window.App.escapeHtml(t.id) + '">取消</button>';
        }
        actions += '<button class="btn btn-ghost btn-sm" data-act="remove" data-id="' + window.App.escapeHtml(t.id) + '">移除</button>';

        var errHtml = '';
        if (t.error) {
            errHtml = '<div class="fd-task-meta" style="color:#dc2626;">错误: ' + window.App.escapeHtml(t.error) + '</div>';
        }
        var outHtml = '';
        if (t.outputPath && t.status === 'completed') {
            outHtml = '<div class="fd-task-meta">输出: <span title="' + window.App.escapeHtml(t.outputPath) + '">' + window.App.escapeHtml(t.outputPath) + '</span></div>';
        }

        return '' +
            '<div class="fd-task">' +
            '<div class="fd-task-head">' +
            '<span class="fd-task-name" title="' + window.App.escapeHtml(t.inputPath) + '">' + window.App.escapeHtml(t.inputPath) + '</span>' +
            '<span class="fd-status ' + t.status + '">' + t.status + '</span>' +
            '</div>' +
            progHtml +
            '<div class="fd-task-meta">' + meta.join(' · ') + '</div>' +
            outHtml +
            errHtml +
            '<div class="fd-task-actions">' + actions + '</div>' +
            '</div>';
    }

    function onTaskAction(act, id) {
        if (act === 'cancel') {
            Api.localTools.ffmpeg.cancel(id).then(function () { refreshTasks(); }).catch(function (err) { showBanner('error', '取消失败: ' + err); });
        } else if (act === 'remove') {
            Api.localTools.ffmpeg.remove(id).then(function () { refreshTasks(); }).catch(function (err) { showBanner('error', '移除失败: ' + err); });
        }
    }

    // 轮询任务列表
    setInterval(function () {
        var list = $('fd-task-list');
        if (list && list.children.length > 0) refreshTasks();
    }, 1500);

    // ===== 配置保存 =====
    var CONFIG_KEY = 'ffmpeg_download_ui_config';

    function collectConfig() {
        return {
            mode: currentMode,
            url: $('fd-url').value,
            outputDir: $('fd-output-dir').value,
            baseName: $('fd-base-name').value,
            format: $('fd-format').value,
            timeout: $('fd-timeout').value,
            reconnect: $('fd-reconnect').checked,
            hlsExt: $('fd-hls-ext').checked,
            reencode: $('fd-reencode').checked,
            duration: $('fd-duration').value,
            headers: $('fd-headers').value
        };
    }
    function applyConfig(cfg) {
        if (!cfg || typeof cfg !== 'object') return;
        if (typeof cfg.mode === 'string' && (cfg.mode === 'download' || cfg.mode === 'record')) {
            switchMode(cfg.mode);
        }
        if (typeof cfg.url === 'string') $('fd-url').value = cfg.url;
        if (typeof cfg.outputDir === 'string') $('fd-output-dir').value = cfg.outputDir;
        if (typeof cfg.baseName === 'string') $('fd-base-name').value = cfg.baseName;
        if (typeof cfg.format === 'string') $('fd-format').value = cfg.format;
        if (cfg.timeout != null) $('fd-timeout').value = cfg.timeout;
        if (typeof cfg.reconnect === 'boolean') $('fd-reconnect').checked = cfg.reconnect;
        if (typeof cfg.hlsExt === 'boolean') $('fd-hls-ext').checked = cfg.hlsExt;
        if (typeof cfg.reencode === 'boolean') $('fd-reencode').checked = cfg.reencode;
        if (cfg.duration != null) $('fd-duration').value = cfg.duration;
        if (typeof cfg.headers === 'string') $('fd-headers').value = cfg.headers;
    }
    function saveConfig() {
        try {
            var payload = {};
            payload[CONFIG_KEY] = JSON.stringify(collectConfig());
            Api.settings.update(payload).catch(function () { });
        } catch (e) { }
    }
    function loadConfig() {
        Api.settings.list().then(function (data) {
            if (!data || !data.success || !data.settings) return;
            var raw = data.settings[CONFIG_KEY];
            if (!raw) return;
            try {
                var cfg = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                applyConfig(cfg);
                updateAddBtn();
            } catch (e) { }
        }).catch(function () { });
    }
    window.addEventListener('beforeunload', saveConfig);

    // ===== 启动 =====
    document.addEventListener('DOMContentLoaded', function () {
        loadInfo();
        refreshTasks();
    });
})();
