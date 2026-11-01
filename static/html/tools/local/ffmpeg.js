(function () {
    'use strict';
    var Api = window.Api;

    // 局部提示工具
    function showBanner(type, msg) {
        var cls = 'info';
        if (type === 'error') cls = 'error';
        else if (type === 'warn') cls = 'warn';
        else if (type === 'success') cls = 'success';
        var el = document.getElementById('banner');
        if (!el) return;
        el.innerHTML = '<div class="tool-banner ' + cls + '">' + window.App.escapeHtml(msg) + '</div>';
        if (type === 'success') setTimeout(clearBanner, 3000);
    }
    function clearBanner() { var el = document.getElementById('banner'); if (el) el.innerHTML = ''; }

    // ===== 状态 =====
    var selectedFiles = [];   // { path, name, size, isDir, modified }
    var ffmpegInfo = null;
    var pollTimer = null;

    // ===== DOM =====
    function $(id) { return document.getElementById(id); }
    var inputList = $('input-list');
    var outputDirInput = $('output-dir');
    var taskList = $('task-list');
    var compressPct = $('compress-pct');
    var compressPctVal = $('compress-pct-val');
    var compressPctNum = $('compress-pct-num');
    var encoderSelect = $('opt-encoder');

    function formatSize(b) {
        if (!b && b !== 0) return '-';
        var k = 1024, u = ['B', 'KB', 'MB', 'GB', 'TB'];
        var i = Math.floor(Math.log(b) / Math.log(k));
        i = Math.max(0, Math.min(i, u.length - 1));
        return (b / Math.pow(k, i)).toFixed(2) + ' ' + u[i];
    }
    function formatDuration(sec) {
        if (!sec || sec < 0) return '--:--';
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s = Math.floor(sec % 60);
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return h > 0 ? (pad(h) + ':' + pad(m) + ':' + pad(s)) : (pad(m) + ':' + pad(s));
    }
    function formatMs(ms) {
        if (!ms || ms < 0) return '--';
        var s = Math.floor(ms / 1000);
        if (s < 60) return s + '秒';
        var m = Math.floor(s / 60);
        var rs = s % 60;
        if (m < 60) return m + '分' + rs + '秒';
        var h = Math.floor(m / 60);
        var rm = m % 60;
        return h + '时' + rm + '分' + rs + '秒';
    }

    // 复制文本到剪贴板（含降级方案）
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
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return !!ok;
        } catch (e) { return false; }
    }

    // ===== 加载 ffmpeg 信息 =====
    function loadInfo() {
        Api.localTools.ffmpeg.info().then(function (data) {
            if (!data || data.success === false) {
                var info = $('ff-info');
                info.innerHTML = '<span class="pill err">FFmpeg 不可用</span>' +
                    '<span class="pill">' + window.App.escapeHtml((data && data.error) || '未知错误') + '</span>';
                // 即使 ffmpeg 不可用，也尝试加载页面配置
                loadConfig();
                return;
            }
            ffmpegInfo = data;
            renderInfo();
            populateEncoderSelect();
            // 编码器列表就绪后再加载配置（确保 saved encoder 能被匹配）
            loadConfig();
        }).catch(function () {
            var info = $('ff-info');
            info.innerHTML = '<span class="pill err">请求失败</span>';
            loadConfig();
        });
    }

    function renderInfo() {
        var info = $('ff-info');
        if (!ffmpegInfo) {
            info.innerHTML = '<span class="pill">检测中...</span>';
            return;
        }
        var html = '';
        if (ffmpegInfo.available) {
            html += '<span class="pill ok">✓ 可用</span>';
            if (ffmpegInfo.version) html += '<span class="pill">' + window.App.escapeHtml(ffmpegInfo.version) + '</span>';
            if (ffmpegInfo.ffmpegPath) html += '<span class="pill" title="' + window.App.escapeHtml(ffmpegInfo.ffmpegPath) + '">' + window.App.escapeHtml(ffmpegInfo.ffmpegPath) + '</span>';
        } else {
            html += '<span class="pill err">不可用</span>';
            if (ffmpegInfo.error) html += '<span class="pill">' + window.App.escapeHtml(ffmpegInfo.error) + '</span>';
        }
        info.innerHTML = html;
    }

    function populateEncoderSelect() {
        if (!ffmpegInfo || !ffmpegInfo.encoders) return;
        var available = ffmpegInfo.encoders || [];
        var labels = {
            'h264_nvenc': 'NVIDIA H.264 (NVENC)',
            'hevc_nvenc': 'NVIDIA HEVC (NVENC)',
            'h264_qsv': 'Intel H.264 (QuickSync)',
            'hevc_qsv': 'Intel HEVC (QuickSync)',
            'h264_amf': 'AMD H.264 (AMF)',
            'hevc_amf': 'AMD HEVC (AMF)',
            'libx264': '软件 H.264 (libx264)',
            'libx265': '软件 HEVC (libx265)'
        };
        while (encoderSelect.options.length > 1) encoderSelect.remove(1);
        available.forEach(function (enc) {
            var opt = document.createElement('option');
            opt.value = enc;
            opt.textContent = labels[enc] || enc;
            encoderSelect.appendChild(opt);
        });
    }

    // ===== 选中的输入文件 =====
    function renderInputList() {
        if (!selectedFiles.length) {
            inputList.innerHTML = '<div class="empty">未选择文件</div>';
        } else {
            inputList.innerHTML = '';
            selectedFiles.forEach(function (f, i) {
                var row = document.createElement('div');
                row.className = 'ff-file-row';
                var name = document.createElement('div');
                name.className = 'name';
                name.textContent = f.path;
                name.title = f.path;
                var size = document.createElement('div');
                size.className = 'size';
                size.textContent = formatSize(f.size);
                var rm = document.createElement('div');
                rm.className = 'rm';
                rm.textContent = '✕';
                rm.title = '移除';
                rm.onclick = function () {
                    selectedFiles.splice(i, 1);
                    renderInputList();
                    updateStartBtn();
                };
                row.appendChild(name);
                row.appendChild(size);
                row.appendChild(rm);
                inputList.appendChild(row);
            });
        }
        updateStartBtn();
    }

    function updateStartBtn() {
        var btn = $('btn-start');
        btn.disabled = !selectedFiles.length || !ffmpegInfo || !ffmpegInfo.available;
    }

    // ===== 文件浏览器（使用公共模块 FsBrowser） =====
    function openBrowser(mode) {
        if (mode === 'output') {
            window.FsBrowser.open({
                mode: 'dir',
                api: 'local',
                title: '选择输出目录',
                initialPath: outputDirInput.value.trim() || '',
                onConfirm: function (p) {
                    outputDirInput.value = p;
                }
            });
            return;
        }
        // input 模式：多选文件
        window.FsBrowser.open({
            mode: 'multi',
            api: 'local',
            title: '选择输入文件',
            hint: '勾选文件后点"选择"加入（可跨目录多次勾选）',
            multiFilter: function (e) { return !e.isDir; },  // 仅文件可勾选
            onConfirm: function (entries) {
                // 合并去重：把新选的并入 selectedFiles
                var merged = {};
                selectedFiles.forEach(function (f) { merged[f.path] = f; });
                entries.forEach(function (e) {
                    if (!merged[e.fullPath]) {
                        merged[e.fullPath] = {
                            path: e.fullPath,
                            name: e.name,
                            size: e.size,
                            isDir: e.isDir,
                            modified: e.modified || 0
                        };
                    }
                });
                selectedFiles = Object.keys(merged).map(function (k) { return merged[k]; });
                renderInputList();
            }
        });
    }

    $('btn-browse-input').onclick = function () { openBrowser('input'); };
    $('btn-browse-output').onclick = function () { openBrowser('output'); };

    $('btn-clear-input').onclick = function () {
        selectedFiles = [];
        renderInputList();
    };

    compressPct.addEventListener('input', function () {
        compressPctVal.textContent = compressPct.value;
        compressPctNum.textContent = compressPct.value + '%';
    });

    // 处理操作：每个操作可启用/禁用
    var opEnables = { trim: true, convert: false, compress: false };
    Array.prototype.forEach.call(document.querySelectorAll('.ff-op-en'), function (cb) {
        cb.addEventListener('change', function () {
            var op = cb.getAttribute('data-op');
            opEnables[op] = cb.checked;
            var body = document.querySelector('[data-op-body="' + op + '"]');
            if (body) body.hidden = !cb.checked;
        });
    });
    // 初始同步（trim 默认 checked；其它默认 unchecked）
    var trimEn = document.querySelector('.ff-op-en[data-op="trim"]');
    if (trimEn) trimEn.checked = !!opEnables.trim;
    Array.prototype.forEach.call(document.querySelectorAll('.ff-op-en'), function (cb) {
        var op = cb.getAttribute('data-op');
        var body = document.querySelector('[data-op-body="' + op + '"]');
        if (body) body.hidden = !cb.checked;
    });

    // 截取结束方式切换
    var trimEndMode = $('trim-end-mode');
    var trimEndLabel = $('trim-end-label');
    var trimEndInput = $('trim-end');
    function syncTrimEndMode() {
        if (trimEndMode.value === 'tail') {
            trimEndLabel.textContent = '距结尾';
            trimEndInput.placeholder = '如 30 或 00:00:30（从结尾往前 N 秒）';
        } else {
            trimEndLabel.textContent = '结束时间';
            trimEndInput.placeholder = '如 30 或 00:00:30（留空到末尾）';
        }
    }
    trimEndMode.addEventListener('change', syncTrimEndMode);
    syncTrimEndMode();

    // ===== 开始任务 =====
    $('btn-start').onclick = function () {
        if (!selectedFiles.length) return;
        clearBanner();
        if (!opEnables.trim && !opEnables.convert && !opEnables.compress) {
            showBanner('error', '请至少启用一种处理操作');
            return;
        }
        // 保存当前页面配置（不含文件列表）
        saveConfig();

        var parallel = Math.max(1, Math.min(16, parseInt($('opt-parallel').value, 10) || 1));
        var threads = Math.max(0, parseInt($('opt-threads').value, 10) || 0);
        var encoder = encoderSelect.value;
        var gpuEnable = $('opt-gpu-enable').checked;
        if (!gpuEnable) encoder = 'libx264';
        var outputDir = outputDirInput.value.trim();

        Api.localTools.ffmpeg.setParallel(parallel).catch(function () { });

        var okCount = 0, failCount = 0;
        var pending = selectedFiles.slice();

        function submitOne() {
            if (!pending.length) {
                showBanner(okCount ? 'success' : 'warn', '已提交 ' + okCount + ' 个任务，失败 ' + failCount + ' 个');
                refreshTasks();
                return;
            }
            var f = pending.shift();
            var spec = buildSpec(f, outputDir, encoder, threads);
            Api.localTools.ffmpeg.create(spec).then(function (data) {
                if (data && data.success) {
                    okCount++;
                } else {
                    failCount++;
                    showBanner('error', '任务创建失败: ' + f.name + ' - ' + ((data && data.error) || '未知'));
                }
                submitOne();
            }).catch(function (err) {
                failCount++;
                showBanner('error', '任务创建失败: ' + f.name + ' - ' + err);
                submitOne();
            });
        }
        submitOne();
    };

    function buildSpec(file, outputDir, encoder, threads) {
        var spec = {
            inputPath: file.path,
            encoder: encoder || 'auto',
            extraThreads: threads
        };
        var baseName = file.name.replace(/\.[^/.]+$/, '');
        var ext = (file.name.match(/\.[^.\\/]+$/) || ['.mp4'])[0];
        if (!outputDir) {
            var idx = Math.max(file.path.lastIndexOf('\\'), file.path.lastIndexOf('/'));
            outputDir = idx >= 0 ? file.path.substring(0, idx) : '';
        }
        var sep = outputDir.indexOf('\\') >= 0 ? '\\' : '/';
        if (outputDir && !outputDir.endsWith(sep)) outputDir += sep;

        // 输出后缀按 trim → compress → convert 顺序
        var suffix = '';
        if (opEnables.trim) suffix += '.trim';
        if (opEnables.compress) suffix += '.compressed';
        if (opEnables.convert) suffix += '.converted';
        if (opEnables.convert) {
            var fmt = $('convert-format').value;
            ext = '.' + fmt;
        }
        if (!suffix) suffix = '.out';
        spec.outputPath = outputDir + baseName + suffix + ext;

        // 读取 GPU 开关（与 click handler 中值一致）
        var gpuEl = $('opt-gpu-enable');
        var gpuEnable = gpuEl ? !!gpuEl.checked : true;

        var options = {
            enableTrim: !!opEnables.trim,
            enableConvert: !!opEnables.convert,
            enableCompress: !!opEnables.compress,
            enableGpu: gpuEnable
        };

        if (opEnables.trim) {
            var s = $('trim-start').value.trim();
            var e = $('trim-end').value.trim();
            var endMode = $('trim-end-mode').value;
            if (s) options.startTime = s;
            if (e) {
                if (endMode === 'tail') options.tail = e;
                else options.endTime = e;
            }
        }
        if (opEnables.convert) {
            options.outputFormat = $('convert-format').value;
        }
        if (opEnables.compress) {
            options.percent = parseInt(compressPct.value, 10) || 50;
            var abrEl = $('compress-audio-bitrate');
            if (abrEl) options.audioBitrateKbps = parseInt(abrEl.value, 10) || 128;
        }

        spec.options = options;
        return spec;
    }

    // ===== 任务列表 =====
    function refreshTasks() {
        Api.localTools.ffmpeg.list().then(function (data) {
            if (!data || !data.success) return;
            renderTasks(data.tasks || []);
        });
    }

    function renderTasks(tasks) {
        if (!tasks.length) {
            taskList.innerHTML = '<div class="tool-hint" style="text-align:center; padding: 1rem;">暂无任务</div>';
            return;
        }
        taskList.innerHTML = '';
        tasks.forEach(function (t) {
            taskList.appendChild(buildTaskEl(t));
        });
    }

    function buildTaskEl(t) {
        var el = document.createElement('div');
        el.className = 'ff-task';
        el.setAttribute('data-id', t.id);

        var head = document.createElement('div');
        head.className = 'ff-task-head';
        var name = document.createElement('div');
        name.className = 'name';
        name.textContent = t.inputName || t.inputPath;
        name.title = t.inputPath;
        var status = document.createElement('span');
        status.className = 'ff-status ' + t.status;
        status.textContent = statusText(t.status);
        var ops = document.createElement('div');
        ops.className = 'ops';
        if (t.status === 'pending' || t.status === 'running') {
            var btnCancel = document.createElement('button');
            btnCancel.className = 'btn btn-ghost btn-sm';
            btnCancel.textContent = '取消';
            btnCancel.onclick = function () { cancelTask(t.id); };
            ops.appendChild(btnCancel);
        }
        if (t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled') {
            var btnRm = document.createElement('button');
            btnRm.className = 'btn btn-ghost btn-sm';
            btnRm.textContent = '移除';
            btnRm.onclick = function () { removeTask(t.id); };
            ops.appendChild(btnRm);
        }
        head.appendChild(name);
        head.appendChild(status);
        head.appendChild(ops);
        el.appendChild(head);

        var progress = document.createElement('div');
        progress.className = 'ff-progress';
        var bar = document.createElement('div');
        bar.className = 'bar ' + t.status;
        bar.style.width = (t.progress || 0) + '%';
        progress.appendChild(bar);
        el.appendChild(progress);

        var meta = document.createElement('div');
        meta.className = 'ff-task-meta';
        meta.appendChild(metaItem('进度', (t.progress || 0) + '%'));
        if (t.durationSec && t.outTimeSec !== undefined) {
            meta.appendChild(metaItem('时间', formatDuration(t.outTimeSec) + ' / ' + formatDuration(t.durationSec)));
        } else if (t.durationSec) {
            meta.appendChild(metaItem('时长', formatDuration(t.durationSec)));
        }
        if (t.speed) meta.appendChild(metaItem('速度', t.speed.toFixed(2) + 'x'));
        if (t.fps) meta.appendChild(metaItem('FPS', t.fps.toFixed(1)));
        if (t.bitrateKbps) meta.appendChild(metaItem('码率', t.bitrateKbps.toFixed(0) + ' kbps'));
        if (t.elapsedMs) meta.appendChild(metaItem('耗时', formatMs(t.elapsedMs)));
        if (t.inputSize) meta.appendChild(metaItem('输入', formatSize(t.inputSize)));
        if (t.outputSize) meta.appendChild(metaItem('输出', formatSize(t.outputSize)));
        if (t.encoder) meta.appendChild(metaItem('编码', t.encoder));
        el.appendChild(meta);

        if (t.error) {
            var err = document.createElement('div');
            err.className = 'ff-task-err';
            err.textContent = t.error;
            el.appendChild(err);
        }
        if (t.commandLine) {
            var cmdWrap = document.createElement('div');
            cmdWrap.style.cssText = 'display:flex; align-items:flex-start; gap:0.375rem; margin-top:0.25rem;';

            var cmd = document.createElement('div');
            cmd.className = 'ff-task-cmd';
            cmd.style.flex = '1';
            cmd.style.marginTop = '0';
            cmd.textContent = t.commandLine;

            var btnCopy = document.createElement('button');
            btnCopy.className = 'btn btn-ghost btn-sm';
            btnCopy.textContent = '复制';
            btnCopy.title = '复制命令行';
            btnCopy.style.flexShrink = '0';
            btnCopy.onclick = (function (text, btn) {
                return function () { copyToClipboard(text, btn); };
            })(t.commandLine, btnCopy);

            cmdWrap.appendChild(cmd);
            cmdWrap.appendChild(btnCopy);
            el.appendChild(cmdWrap);
        }
        return el;
    }

    function metaItem(label, val) {
        var el = document.createElement('span');
        el.innerHTML = '<span>' + window.App.escapeHtml(label) + ': </span><span class="v">' + window.App.escapeHtml(val) + '</span>';
        return el;
    }

    function statusText(s) {
        if (s === 'pending') return '等待';
        if (s === 'running') return '运行中';
        if (s === 'completed') return '完成';
        if (s === 'failed') return '失败';
        if (s === 'cancelled') return '已取消';
        return s;
    }

    function cancelTask(id) {
        Api.localTools.ffmpeg.cancel(id).then(function () { refreshTasks(); })
            .catch(function (err) { showBanner('error', '取消失败: ' + err); });
    }
    function removeTask(id) {
        Api.localTools.ffmpeg.remove(id).then(function () { refreshTasks(); })
            .catch(function (err) { showBanner('error', '移除失败: ' + err); });
    }

    $('btn-clear-finished').onclick = function () {
        Api.localTools.ffmpeg.list().then(function (data) {
            if (!data || !data.success) return;
            var finished = (data.tasks || []).filter(function (t) {
                return t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled';
            });
            if (!finished.length) {
                showBanner('warn', '没有可清理的已完成任务');
                return;
            }
            var pending = finished.length;
            finished.forEach(function (t) {
                Api.localTools.ffmpeg.remove(t.id).finally(function () {
                    pending--;
                    if (pending === 0) refreshTasks();
                });
            });
        });
    };

    // ===== 定时刷新 =====
    function startPolling() {
        if (pollTimer) return;
        pollTimer = setInterval(refreshTasks, 1000);
    }
    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    // ===== 页面配置保存/加载（不含文件列表） =====
    var CONFIG_KEY = 'ffmpeg_ui_config';

    function collectConfig() {
        return {
            opEnables: {
                trim: !!opEnables.trim,
                convert: !!opEnables.convert,
                compress: !!opEnables.compress
            },
            trim: {
                start: $('trim-start').value,
                end: $('trim-end').value,
                endMode: $('trim-end-mode').value
            },
            convert: {
                format: $('convert-format').value
            },
            compress: {
                percent: compressPct.value,
                audioBitrate: $('compress-audio-bitrate').value
            },
            settings: {
                gpuEnable: $('opt-gpu-enable').checked,
                encoder: encoderSelect.value,
                parallel: $('opt-parallel').value,
                threads: $('opt-threads').value
            },
            outputDir: outputDirInput.value
        };
    }

    function applyConfig(cfg) {
        if (!cfg || typeof cfg !== 'object') return;
        if (cfg.opEnables && typeof cfg.opEnables === 'object') {
            opEnables.trim = !!cfg.opEnables.trim;
            opEnables.convert = !!cfg.opEnables.convert;
            opEnables.compress = !!cfg.opEnables.compress;
            ['trim', 'convert', 'compress'].forEach(function (op) {
                var cb = document.querySelector('.ff-op-en[data-op="' + op + '"]');
                if (cb) {
                    cb.checked = opEnables[op];
                    var body = document.querySelector('[data-op-body="' + op + '"]');
                    if (body) body.hidden = !cb.checked;
                }
            });
        }
        if (cfg.trim && typeof cfg.trim === 'object') {
            if (typeof cfg.trim.start === 'string') $('trim-start').value = cfg.trim.start;
            if (typeof cfg.trim.end === 'string') $('trim-end').value = cfg.trim.end;
            if (typeof cfg.trim.endMode === 'string') {
                $('trim-end-mode').value = cfg.trim.endMode;
                syncTrimEndMode();
            }
        }
        if (cfg.convert && typeof cfg.convert === 'object') {
            if (typeof cfg.convert.format === 'string') {
                $('convert-format').value = cfg.convert.format;
            }
        }
        if (cfg.compress && typeof cfg.compress === 'object') {
            if (cfg.compress.percent != null) {
                compressPct.value = cfg.compress.percent;
                compressPctVal.textContent = compressPct.value;
                compressPctNum.textContent = compressPct.value + '%';
            }
            if (typeof cfg.compress.audioBitrate === 'string') {
                $('compress-audio-bitrate').value = cfg.compress.audioBitrate;
            }
        }
        if (cfg.settings && typeof cfg.settings === 'object') {
            if (typeof cfg.settings.gpuEnable === 'boolean') {
                $('opt-gpu-enable').checked = cfg.settings.gpuEnable;
            }
            if (typeof cfg.settings.encoder === 'string' && cfg.settings.encoder) {
                var exists = false;
                for (var i = 0; i < encoderSelect.options.length; i++) {
                    if (encoderSelect.options[i].value === cfg.settings.encoder) {
                        exists = true;
                        break;
                    }
                }
                if (exists) encoderSelect.value = cfg.settings.encoder;
            }
            if (cfg.settings.parallel != null) $('opt-parallel').value = cfg.settings.parallel;
            if (cfg.settings.threads != null) $('opt-threads').value = cfg.settings.threads;
        }
        if (typeof cfg.outputDir === 'string') {
            outputDirInput.value = cfg.outputDir;
        }
    }

    function saveConfig() {
        try {
            var json = JSON.stringify(collectConfig());
            var payload = {};
            payload[CONFIG_KEY] = json;
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
            } catch (e) { }
        }).catch(function () { });
    }

    // ===== 启动 =====
    document.addEventListener('DOMContentLoaded', function () {
        loadInfo();
        refreshTasks();
        startPolling();
    });
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        } else {
            refreshTasks();
            startPolling();
        }
    });

})();
