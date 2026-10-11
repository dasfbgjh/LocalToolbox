(function () {
    'use strict';
    var App = window.App;

    function isLocalhost() {
        var h = window.location.hostname;
        return h === '127.0.0.1' || h === 'localhost' || h === '::1';
    }

    function showBanner(type, msg) {
        var cls = 'info';
        if (type === 'error') cls = 'error';
        else if (type === 'warn') cls = 'warn';
        else if (type === 'success') cls = 'success';
        document.getElementById('adb-banner').innerHTML = '<div class="tool-banner ' + cls + '">' + App.escapeHtml(msg) + '</div>';
        if (type === 'success') setTimeout(clearBanner, 3000);
    }
    function clearBanner() { document.getElementById('adb-banner').innerHTML = ''; }

    if (!isLocalhost()) {
        document.querySelector('.tool-page').innerHTML = '<div class="admin-empty"><div class="icon">🚫</div><h3>本页面仅限本机访问</h3><p>请在 127.0.0.1 / localhost 打开</p></div>';
        return;
    }

    var adbAvailable = false;
    var devices = [];
    var cmdHistory = [];

    var QUICK_CMDS = [
        { label: '系统版本', cmd: 'getprop ro.build.version.release' },
        { label: 'SDK版本', cmd: 'getprop ro.build.version.sdk' },
        { label: '设备型号', cmd: 'getprop ro.product.model' },
        { label: '设备厂商', cmd: 'getprop ro.product.brand' },
        { label: 'Android ID', cmd: 'settings get secure android_id' },
        { label: '屏幕密度', cmd: 'wm density' },
        { label: '屏幕分辨率', cmd: 'wm size' },
        { label: 'IP地址', cmd: 'ip addr show wlan0' },
        { label: '内存信息', cmd: 'cat /proc/meminfo' },
        { label: 'CPU信息', cmd: 'cat /proc/cpuinfo' },
        { label: '已安装包', cmd: 'pm list packages -3' },
        { label: '电池信息', cmd: 'dumpsys battery' },
        { label: '输入法列表', cmd: 'ime list -s' },
        { label: '转发列表', cmd: 'cat /proc/net/tcp' }
    ];

    function initInfo() {
        Api.localTools.adb.info().then(function (data) {
            var bar = document.getElementById('adb-info-bar');
            if (data.success && data.version) {
                adbAvailable = true;
                bar.innerHTML = '<span class="pill ok">ADB: ' + App.escapeHtml(data.version) + '</span>' +
                    '<span class="pill">' + App.escapeHtml(data.adbPath || 'adb') + '</span>';
            } else {
                bar.innerHTML = '<span class="pill err">ADB: 不可用</span>' +
                    '<span class="pill">' + App.escapeHtml(data.error || '未配置 adb 路径') + '</span>';
            }
        }).catch(function () {
            document.getElementById('adb-info-bar').innerHTML = '<span class="pill err">ADB: 请求失败</span>';
        });
    }

    function switchTab(tabName) {
        document.querySelectorAll('.adb-tab').forEach(function (t) {
            t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
        });
        document.querySelectorAll('.adb-panel').forEach(function (p) {
            p.hidden = p.id !== 'panel-' + tabName;
        });
        if (tabName === 'devices') loadDevices();
        if (tabName === 'forward') { updateSerialSelects(); loadForwards(); }
        if (tabName === 'shell') updateSerialSelects();
        if (tabName === 'logcat') updateLogcatSerialSelect();
        if (tabName !== 'logcat') stopLogcat();
    }

    function loadDevices() {
        Api.localTools.adb.devices().then(function (data) {
            if (!data.success) { showBanner('error', data.error || '获取设备列表失败'); return; }
            devices = data.devices || [];
            renderDevices();
            updateSerialSelects();
        }).catch(function () { showBanner('error', '请求失败'); });
    }

    function renderDevices() {
        var list = document.getElementById('adb-device-list');
        if (devices.length === 0) {
            list.innerHTML = '<div class="adb-empty">未检测到设备，请确认设备已连接并启用 USB 调试</div>';
            return;
        }
        var html = '';
        devices.forEach(function (d) {
            var stateClass = 'other';
            var stateText = d.state;
            if (d.state === 'device') { stateClass = 'device'; stateText = '已连接'; }
            else if (d.state === 'offline') { stateClass = 'offline'; stateText = '离线'; }
            else if (d.state === 'unauthorized') { stateClass = 'unauthorized'; stateText = '未授权'; }

            var detailsHtml = d.details ? '<span class="details">' + App.escapeHtml(d.details) + '</span>' : '';
            var disconnectBtn = '';
            if (d.serial.indexOf('.') !== -1 || d.serial.indexOf(':') !== -1) {
                disconnectBtn = '<button class="btn btn-sm btn-outline" data-disconnect="' + App.escapeHtml(d.serial) + '">断开</button>';
            }

            html += '<div class="adb-device-card">' +
                '<span class="serial">' + App.escapeHtml(d.serial) + '</span>' +
                '<span class="state-badge ' + stateClass + '">' + stateText + '</span>' +
                detailsHtml +
                '<span class="actions">' + disconnectBtn + '</span>' +
                '</div>';
        });
        list.innerHTML = html;
    }

    function updateSerialSelects() {
        var selects = [document.getElementById('fwd-serial'), document.getElementById('fwd-add-serial'), document.getElementById('shell-serial'), document.getElementById('logcat-serial')];
        selects.forEach(function (sel) {
            if (!sel) return;
            var cur = sel.value;
            var html = '<option value="">所有设备</option>';
            if (sel.id === 'fwd-add-serial' || sel.id === 'shell-serial' || sel.id === 'logcat-serial') {
                html = '<option value="">默认设备</option>';
            }
            devices.forEach(function (d) {
                html += '<option value="' + App.escapeHtml(d.serial) + '">' + App.escapeHtml(d.serial) + '</option>';
            });
            sel.innerHTML = html;
            sel.value = cur;
        });
    }

    function updateLogcatSerialSelect() {
        var sel = document.getElementById('logcat-serial');
        if (!sel) return;
        var cur = sel.value;
        var html = '<option value="">默认设备</option>';
        devices.forEach(function (d) {
            html += '<option value="' + App.escapeHtml(d.serial) + '">' + App.escapeHtml(d.serial) + '</option>';
        });
        sel.innerHTML = html;
        sel.value = cur;
    }

    var LOGCAT_LEVEL_COLORS = {
        V: '#9e9e9e',
        D: '#2196f3',
        I: '#4caf50',
        W: '#ff9800',
        E: '#f44336',
        F: '#e91e63'
    };

    var logcatRawText = '';
    var logcatTimer = null;
    var logcatRunning = false;

    function parseLogcatLine(line) {
        var m = line.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.+?)\s*:\s*(.*)$/);
        if (m) return { time: m[1], pid: m[2], tid: m[3], level: m[4], tag: m[5], msg: m[6] };
        m = line.match(/^([VDIWEF])\/(.+?)\s*\(\s*(\d+)\s*\):\s*(.*)$/);
        if (m) return { time: '', pid: m[3], tid: '', level: m[1], tag: m[2], msg: m[4] };
        return null;
    }

    function renderLogcat(text) {
        logcatRawText = text;
        var container = document.getElementById('logcat-output');
        if (!text) {
            container.innerHTML = '<div class="adb-shell-placeholder">无日志输出</div>';
            return;
        }
        var lines = text.split('\n');
        var html = '';
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (!line) continue;
            var parsed = parseLogcatLine(line);
            if (parsed) {
                var color = LOGCAT_LEVEL_COLORS[parsed.level] || 'var(--text)';
                html += '<div class="adb-logcat-line" data-level="' + parsed.level + '">' +
                    '<span class="log-time">' + App.escapeHtml(parsed.time) + '</span>' +
                    '<span class="log-level" style="color:' + color + '">' + parsed.level + '</span>' +
                    '<span class="log-pid">' + App.escapeHtml(parsed.pid) + '</span>' +
                    '<span class="log-tag" style="color:' + color + '">' + App.escapeHtml(parsed.tag) + '</span>' +
                    '<span class="log-msg">' + App.escapeHtml(parsed.msg) + '</span>' +
                    '</div>';
            } else {
                html += '<div class="adb-logcat-line">' +
                    '<span class="log-msg">' + App.escapeHtml(line) + '</span>' +
                    '</div>';
            }
        }
        container.innerHTML = html;
        if (document.getElementById('logcat-autoscroll').checked) {
            container.scrollTop = container.scrollHeight;
        }
    }

    function fetchLogcat() {
        var serial = document.getElementById('logcat-serial').value;
        var level = document.getElementById('logcat-level').value;
        var tag = document.getElementById('logcat-tag').value.trim();
        var packageOrPid = document.getElementById('logcat-package').value.trim();
        var lines = parseInt(document.getElementById('logcat-lines').value, 10) || 200;

        var pid = '';
        var pkg = '';
        if (packageOrPid && /^\d+$/.test(packageOrPid)) {
            pid = packageOrPid;
        } else if (packageOrPid) {
            pkg = packageOrPid;
        }

        Api.localTools.adb.logcat(serial, tag, level, pid, pkg, lines).then(function (data) {
            if (data.success) {
                renderLogcat(data.output || '');
            } else {
                document.getElementById('logcat-output').innerHTML = '<div class="adb-shell-placeholder">错误: ' + App.escapeHtml(data.error || '读取失败') + '</div>';
            }
        }).catch(function () {
            document.getElementById('logcat-output').innerHTML = '<div class="adb-shell-placeholder">请求失败</div>';
        });
    }

    function startLogcat() {
        if (logcatRunning) return;
        logcatRunning = true;
        document.getElementById('btn-logcat-start').disabled = true;
        document.getElementById('btn-logcat-stop').disabled = false;
        fetchLogcat();
        var interval = parseInt(document.getElementById('logcat-interval').value, 10) || 2000;
        logcatTimer = setInterval(fetchLogcat, interval);
    }

    function stopLogcat() {
        if (!logcatRunning) return;
        logcatRunning = false;
        if (logcatTimer) { clearInterval(logcatTimer); logcatTimer = null; }
        document.getElementById('btn-logcat-start').disabled = false;
        document.getElementById('btn-logcat-stop').disabled = true;
    }

    function clearLogcat() {
        var serial = document.getElementById('logcat-serial').value;
        if (!confirm('确认清空 logcat 缓冲区？')) return;
        Api.localTools.adb.logcatClear({ serial: serial }).then(function (data) {
            if (data.success) showBanner('success', 'logcat 缓冲区已清空');
            else showBanner('error', data.error || '清空失败');
        }).catch(function () { showBanner('error', '请求失败'); });
    }

    function isReverse() {
        return document.getElementById('fwd-reverse').checked;
    }

    function loadForwards() {
        var serial = document.getElementById('fwd-serial').value;
        var reverse = isReverse();
        Api.localTools.adb.forwardList(serial || '', reverse).then(function (data) {
            if (!data.success) { showBanner('error', data.error || '获取转发列表失败'); return; }
            renderForwards(data.forwards || [], reverse);
        }).catch(function () { showBanner('error', '请求失败'); });
    }

    function renderForwards(fwds, reverse) {
        var list = document.getElementById('adb-forward-list');
        if (fwds.length === 0) {
            list.innerHTML = '<div class="adb-empty">暂无' + (reverse ? '反向' : '') + '端口转发规则</div>';
            return;
        }
        var arrow = reverse ? '←' : '→';
        var html = '';
        fwds.forEach(function (f) {
            html += '<div class="adb-forward-row">' +
                '<span class="fwd-serial">' + App.escapeHtml(f.serial) + '</span>' +
                '<span class="fwd-local">' + App.escapeHtml(f.local) + '</span>' +
                '<span class="fwd-arrow">' + arrow + '</span>' +
                '<span class="fwd-remote">' + App.escapeHtml(f.remote) + '</span>' +
                '<span class="fwd-actions"><button class="btn btn-sm btn-danger-outline" data-fwd-remove="' + App.escapeHtml(f.local) + '" data-fwd-serial="' + App.escapeHtml(f.serial) + '">移除</button></span>' +
                '</div>';
        });
        list.innerHTML = html;
    }

    function execShell() {
        var serial = document.getElementById('shell-serial').value;
        var cmd = document.getElementById('shell-cmd').value.trim();
        if (!cmd) return;
        var output = document.getElementById('shell-output');
        output.innerHTML = '<span class="adb-shell-placeholder">执行中...</span>';
        Api.localTools.adb.shell({ serial: serial, cmd: cmd }).then(function (data) {
            if (data.success) {
                output.textContent = data.output || '(无输出)';
            } else {
                output.textContent = '错误: ' + (data.error || '执行失败');
            }
            addCmdHistory(cmd);
        }).catch(function () {
            output.textContent = '请求失败';
        });
    }

    function addCmdHistory(cmd) {
        if (cmdHistory.length > 0 && cmdHistory[0] === cmd) return;
        cmdHistory.unshift(cmd);
        if (cmdHistory.length > 20) cmdHistory.pop();
        renderCmdHistory();
    }

    function renderCmdHistory() {
        var container = document.querySelector('.adb-cmd-history-list');
        if (!container) return;
        if (cmdHistory.length === 0) {
            container.innerHTML = '';
            return;
        }
        var html = '';
        cmdHistory.forEach(function (c) {
            html += '<div class="adb-cmd-history-item" data-cmd="' + App.escapeHtml(c) + '"><span class="cmd-text">' + App.escapeHtml(c) + '</span></div>';
        });
        container.innerHTML = html;
    }

    function renderQuickCmds() {
        var container = document.getElementById('adb-quick-cmds');
        var html = '';
        QUICK_CMDS.forEach(function (q) {
            html += '<button class="adb-quick-cmd" data-cmd="' + App.escapeHtml(q.cmd) + '">' + App.escapeHtml(q.label) + '</button>';
        });
        container.innerHTML = html;
    }

    function init() {
        initInfo();
        renderQuickCmds();

        document.querySelectorAll('.adb-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                switchTab(this.getAttribute('data-tab'));
            });
        });

        document.getElementById('btn-refresh-devices').addEventListener('click', loadDevices);

        document.getElementById('btn-adb-connect').addEventListener('click', function () {
            var target = document.getElementById('adb-target').value.trim();
            if (!target) { showBanner('error', '请输入设备地址'); return; }
            Api.localTools.adb.connect(target).then(function (data) {
                if (data.success) showBanner('success', data.output || '连接成功');
                else showBanner('error', data.error || '连接失败');
                loadDevices();
            }).catch(function () { showBanner('error', '请求失败'); });
        });

        document.getElementById('btn-adb-disconnect').addEventListener('click', function () {
            var target = document.getElementById('adb-target').value.trim();
            if (!target) { showBanner('error', '请输入设备地址'); return; }
            Api.localTools.adb.disconnect(target).then(function (data) {
                if (data.success) showBanner('success', data.output || '已断开');
                else showBanner('error', data.error || '断开失败');
                loadDevices();
            }).catch(function () { showBanner('error', '请求失败'); });
        });

        document.getElementById('btn-refresh-forward').addEventListener('click', loadForwards);

        document.getElementById('btn-forward-remove-all').addEventListener('click', function () {
            var serial = document.getElementById('fwd-serial').value;
            var reverse = isReverse();
            var label = reverse ? '反向' : '';
            if (!confirm('确认移除所有' + label + '端口转发规则？')) return;
            Api.localTools.adb.forwardRemoveAll({ serial: serial, reverse: reverse }).then(function (data) {
                if (data.success) showBanner('success', '已移除所有' + label + '转发规则');
                else showBanner('error', data.error || '移除失败');
                loadForwards();
            }).catch(function () { showBanner('error', '请求失败'); });
        });

        document.getElementById('btn-forward-add').addEventListener('click', function () {
            var reverse = isReverse();
            document.getElementById('fwd-modal-title').textContent = reverse ? '添加反向端口转发' : '添加端口转发';
            document.getElementById('fwd-local').value = '';
            document.getElementById('fwd-remote').value = '';
            document.getElementById('fwd-modal').hidden = false;
        });

        document.getElementById('fwd-modal').addEventListener('click', function (e) {
            if (e.target.closest('[data-modal-close]')) {
                document.getElementById('fwd-modal').hidden = true;
            }
        });

        document.getElementById('btn-forward-add-confirm').addEventListener('click', function () {
            var serial = document.getElementById('fwd-add-serial').value;
            var local = document.getElementById('fwd-local').value.trim();
            var remote = document.getElementById('fwd-remote').value.trim();
            var reverse = isReverse();
            if (!local || !remote) { showBanner('error', '请填写本地和远程端口'); return; }
            Api.localTools.adb.forwardAdd({ serial: serial, local: local, remote: remote, reverse: reverse }).then(function (data) {
                if (data.success) showBanner('success', (reverse ? '反向' : '') + '转发规则已添加');
                else showBanner('error', data.error || '添加失败');
                document.getElementById('fwd-modal').hidden = true;
                loadForwards();
            }).catch(function () { showBanner('error', '请求失败'); });
        });

        document.getElementById('btn-shell-exec').addEventListener('click', execShell);
        document.getElementById('shell-cmd').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') execShell();
        });

        document.getElementById('btn-logcat-start').addEventListener('click', startLogcat);
        document.getElementById('btn-logcat-stop').addEventListener('click', stopLogcat);
        document.getElementById('btn-logcat-clear').addEventListener('click', clearLogcat);
        document.getElementById('btn-logcat-copy').addEventListener('click', function () {
            if (!logcatRawText) { showBanner('warn', '暂无日志可复制'); return; }
            navigator.clipboard.writeText(logcatRawText).then(function () {
                showBanner('success', '已复制到剪贴板');
            }).catch(function () { showBanner('error', '复制失败'); });
        });
        document.getElementById('btn-logcat-download').addEventListener('click', function () {
            if (!logcatRawText) { showBanner('warn', '暂无日志可下载'); return; }
            var now = new Date();
            var ts = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + '_' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
            var blob = new Blob([logcatRawText], { type: 'text/plain;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'logcat_' + ts + '.log';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        });

        document.getElementById('fwd-serial').addEventListener('change', loadForwards);
        document.getElementById('fwd-reverse').addEventListener('change', loadForwards);

        document.addEventListener('click', function (e) {
            var target = e.target.closest('[data-disconnect]');
            if (target) {
                var serial = target.getAttribute('data-disconnect');
                Api.localTools.adb.disconnect(serial).then(function (data) {
                    if (data.success) showBanner('success', '已断开: ' + serial);
                    else showBanner('error', data.error || '断开失败');
                    loadDevices();
                }).catch(function () { showBanner('error', '请求失败'); });
                return;
            }

            var fwdRemove = e.target.closest('[data-fwd-remove]');
            if (fwdRemove) {
                var local = fwdRemove.getAttribute('data-fwd-remove');
                var reverse = isReverse();
                var fwdSerial = reverse ? document.getElementById('fwd-serial').value : fwdRemove.getAttribute('data-fwd-serial');
                Api.localTools.adb.forwardRemove({ serial: fwdSerial, local: local, reverse: reverse }).then(function (data) {
                    if (data.success) showBanner('success', '已移除: ' + local);
                    else showBanner('error', data.error || '移除失败');
                    loadForwards();
                }).catch(function () { showBanner('error', '请求失败'); });
                return;
            }

            var quickCmd = e.target.closest('.adb-quick-cmd');
            if (quickCmd) {
                document.getElementById('shell-cmd').value = quickCmd.getAttribute('data-cmd');
                switchTab('shell');
                execShell();
                return;
            }

            var histCmd = e.target.closest('.adb-cmd-history-item');
            if (histCmd) {
                document.getElementById('shell-cmd').value = histCmd.getAttribute('data-cmd');
                execShell();
                return;
            }
        });

        loadDevices();
    }

    init();
})();