(function () {
    'use strict';
    var App = window.App;

    function showBanner(type, msg) {
        var cls = 'info';
        if (type === 'error') cls = 'error';
        else if (type === 'warn') cls = 'warn';
        else if (type === 'success') cls = 'success';
        document.getElementById('banner').innerHTML = '<div class="tool-banner ' + cls + '">' + App.escapeHtml(msg) + '</div>';
        if (type === 'success') setTimeout(clearBanner, 3000);
    }
    function clearBanner() { document.getElementById('banner').innerHTML = ''; }

    // 剥离 ANSI 转义序列（含 SGR 颜色、光标控制等），仅保留可见字符
    function stripAnsi(s) {
        if (s == null) return s;
        // CSI 序列：ESC [ ... 字母
        return String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    }

    function showModalErr(msg) {
        var el = document.getElementById('p-modal-err');
        if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
        el.style.display = '';
        el.textContent = msg;
    }

    function isLocalhost() {
        var h = window.location.hostname;
        return h === '127.0.0.1' || h === 'localhost' || h === '::1';
    }

    // 转义HTML并将URL识别为<a>链接（仅 http/https）
    function renderRemarks(text) {
        if (!text) return '';
        var escaped = App.escapeHtml(text);
        // 匹配 http:// 或 https:// 链接（不要求末尾带斜杠，避免破坏中文标点）
        var urlRe = /(https?:\/\/[^\s<>"']+)/g;
        return escaped.replace(urlRe, function (url) {
            // 去掉末尾的中文/英文标点以避免点击区域延伸
            return '<a href="' + url + '" target="_blank" rel="noopener" class="proc-remark-link">' + url + '</a>';
        });
    }

    if (!isLocalhost()) {
        document.getElementById('proc-list').innerHTML = '<div class="admin-empty"><div class="icon">🚫</div><h3>本页面仅限本机访问</h3><p>请在 127.0.0.1 / localhost 打开</p></div>';
        document.getElementById('btn-new').style.display = 'none';
        return;
    }

    var procs = []; // [{id, name, command, args, workingDir, envInherit, autoStart, status, pid, exitCode, error, envVars:[]}]

    function loadAll() {
        Api.localTools.procs.list().then(function (data) {
            if (!data.success) { showBanner('error', data.error || '加载失败'); return; }
            procs = data.procs || [];
            render();
        }).catch(function () { showBanner('error', '请求失败'); });
    }

    function getProc(id) { for (var i = 0; i < procs.length; i++) if (procs[i].id === id) return procs[i]; return null; }

    function render() {
        var list = document.getElementById('proc-list');
        if (procs.length === 0) {
            list.innerHTML = '<div class="admin-empty"><div class="icon">▶</div><h3>暂无进程配置</h3><p>点击右上角"新建进程"开始</p></div>';
            return;
        }
        var html = '';
        procs.forEach(function (p) {
            var badge = '<span class="ui-badge pending">已停止</span>';
            if (p.status === 'running') badge = '<span class="ui-badge ok">运行中</span>';
            else if (p.status === 'error') badge = '<span class="ui-badge err">错误</span>';

            var argsArr = typeof p.args === 'string' ? safeParseArgs(p.args) : (p.args || []);
            var argsDisplay = argsArr.length ? ' ' + argsArr.join(' ') : '';
            var cmdLine = p.command + argsDisplay;

            var autoTag = p.autoStart ? '<span class="tool-tag">自启</span>' : '';
            var inheritTag = '<span class="proc-env-tag">' + (p.envInherit ? '继承系统环境变量' : '不继承系统环境变量') + '</span>';

            var actions = '';
            if (p.status === 'running') {
                actions += '<button class="btn btn-sm btn-outline" data-act="stop" data-id="' + p.id + '">停止</button>';
                actions += '<button class="btn btn-sm btn-outline" data-act="force" data-id="' + p.id + '">强杀</button>';
            } else {
                actions += '<button class="btn btn-sm" data-act="start" data-id="' + p.id + '">启动</button>';
            }
            actions += '<button class="btn btn-sm" data-act="logs" data-id="' + p.id + '">日志</button>';
            actions += '<button class="btn btn-sm btn-outline" data-act="edit" data-id="' + p.id + '">编辑</button>';
            actions += '<button class="btn btn-sm btn-danger-outline" data-act="del" data-id="' + p.id + '">删除</button>';

            var metaParts = [];
            if (p.status === 'running' && p.pid) metaParts.push('PID ' + p.pid);
            if (p.workingDir) metaParts.push('工作目录: ' + p.workingDir);
            metaParts.push((p.envVars || []).length + ' 个环境变量');
            var meta = metaParts.join(' · ');

            var errHtml = (p.status === 'error' && p.error) ? '<div class="tool-banner error" style="margin-top:0.5rem;">' + App.escapeHtml(p.error) + '</div>' : '';

            var remarksHtml = '';
            if (p.remarks) {
                remarksHtml = '<div class="proc-remarks">' + renderRemarks(p.remarks) + '</div>';
            }

            html += '<div class="ui-card" data-id="' + p.id + '">' +
                '<div class="ui-card-head">' +
                '<div class="ui-card-title">' +
                '<span class="ui-card-name">' + App.escapeHtml(p.name) + '</span>' +
                badge + autoTag + inheritTag +
                '</div>' +
                '<div class="ui-card-actions">' + actions + '</div>' +
                '</div>' +
                '<div class="ui-card-body">' +
                '<div class="proc-cmdline" title="' + App.escapeHtml(cmdLine) + '">' + App.escapeHtml(cmdLine) + '</div>' +
                '<div class="proc-meta">' + App.escapeHtml(meta) + '</div>' +
                remarksHtml +
                errHtml +
                '</div>' +
                '</div>';
        });
        list.innerHTML = html;
        list.querySelectorAll('button[data-act]').forEach(function (b) {
            var act = b.getAttribute('data-act');
            var id = b.getAttribute('data-id');
            b.addEventListener('click', function () {
                if (act === 'start') doStart(id);
                else if (act === 'stop') doStop(id, false);
                else if (act === 'force') doStop(id, true);
                else if (act === 'logs') openLog(id);
                else if (act === 'edit') openModal(getProc(id));
                else if (act === 'del') doDelete(id);
            });
        });
    }

    function safeParseArgs(s) {
        if (!s) return [];
        try {
            var j = JSON.parse(s);
            if (Array.isArray(j)) return j;
        } catch (e) { }
        // 简单空格分隔
        return s.split(/\s+/).filter(function (x) { return x.length; });
    }

    function argsToArray(s) {
        if (!s) return [];
        // 支持简单空格分隔的多参数（暂不处理引号转义，简单实现）
        return s.trim().split(/\s+/).filter(function (x) { return x.length; });
    }

    function doStart(id) {
        Api.localTools.procs.start(id).then(function (data) {
            if (!data.success) { showBanner('error', data.error || '启动失败'); loadAll(); return; }
            showBanner('success', '已启动');
            loadAll();
        });
    }
    function doStop(id, force) {
        if (force) {
            if (!confirm('确认强制停止该进程？'))
                return;
        } else {
            if (!confirm('停止该进程？\n\n如果存在嵌套子进程可能无法停止, 需要使用强制杀进程功能'))
                return;
        }

        Api.localTools.procs.stop(id, force).then(function (data) {
            if (!data.success) { showBanner('error', data.error || '停止失败'); loadAll(); return; }
            showBanner('success', '已停止');
            loadAll();
        });
    }
    function doDelete(id) {
        var p = getProc(id);
        if (!p) return;
        if (!confirm('确认删除 "' + p.name + '"？运行中将被强制停止。')) return;
        Api.localTools.procs.remove(id).then(function (data) {
            if (!data.success) { showBanner('error', data.error || '删除失败'); return; }
            showBanner('success', '已删除');
            loadAll();
        });
    }

    // ===== Edit Modal =====
    var modal = document.getElementById('p-modal');
    var editingId = null;

    function openModal(p) {
        editingId = p ? p.id : null;
        document.getElementById('p-modal-title').textContent = p ? '编辑进程' : '新建进程';
        document.getElementById('f-name').value = p ? p.name : '';
        document.getElementById('f-command').value = p ? p.command : '';
        var argsStr = '';
        if (p) {
            var a = typeof p.args === 'string' ? safeParseArgs(p.args) : (p.args || []);
            argsStr = a.join(' ');
        }
        document.getElementById('f-args').value = argsStr;
        document.getElementById('f-cwd').value = p ? (p.workingDir || '') : '';
        document.getElementById('f-remarks').value = p ? (p.remarks || '') : '';
        document.getElementById('f-inherit').checked = p ? !!p.envInherit : true;
        document.getElementById('f-auto').checked = p ? !!p.autoStart : false;
        renderEnvEditor(p ? (p.envVars || []) : []);
        showModalErr('');
        modal.hidden = false;
    }
    function closeModal() { modal.hidden = true; editingId = null; }
    document.getElementById('btn-new').addEventListener('click', function () { openModal(null); });
    modal.addEventListener('click', function (e) {
        if (e.target.getAttribute('data-modal-close') !== null) closeModal();
    });

    function renderEnvEditor(envs) {
        var box = document.getElementById('f-env');
        box.innerHTML = '';
        var list = envs.length ? envs : [{ name: '', value: '' }];
        list.forEach(function (e, i) {
            var row = document.createElement('div');
            row.className = 'proc-env-row';
            row.innerHTML =
                '<input type="text" class="ui-form-input proc-env-name" placeholder="KEY" value="' + App.escapeHtml(e.name || '') + '">' +
                '<span class="ui-sep-arrow">=</span>' +
                '<input type="text" class="ui-form-input proc-env-val" placeholder="value" value="' + App.escapeHtml(e.value || '') + '">' +
                '<button class="btn btn-sm btn-ghost" data-rm="' + i + '">×</button>';
            box.appendChild(row);
        });
        box.querySelectorAll('button[data-rm]').forEach(function (b) {
            b.addEventListener('click', function () {
                if (box.children.length <= 1) {
                    box.children[0].querySelector('.proc-env-name').value = '';
                    box.children[0].querySelector('.proc-env-val').value = '';
                    return;
                }
                var r = b.closest('.proc-env-row');
                r.parentNode.removeChild(r);
            });
        });
    }

    document.getElementById('f-env-add').addEventListener('click', function () {
        var box = document.getElementById('f-env');
        var row = document.createElement('div');
        row.className = 'proc-env-row';
        row.innerHTML =
            '<input type="text" class="ui-form-input proc-env-name" placeholder="KEY">' +
            '<span class="ui-sep-arrow">=</span>' +
            '<input type="text" class="ui-form-input proc-env-val" placeholder="value">' +
            '<button class="btn btn-sm btn-ghost" data-rm="x">×</button>';
        box.appendChild(row);
        row.querySelector('button[data-rm]').addEventListener('click', function () {
            if (box.children.length <= 1) {
                row.querySelector('.proc-env-name').value = '';
                row.querySelector('.proc-env-val').value = '';
                return;
            }
            row.parentNode.removeChild(row);
        });
    });

    function readForm() {
        var data = {
            name: document.getElementById('f-name').value.trim(),
            command: document.getElementById('f-command').value.trim(),
            args: argsToArray(document.getElementById('f-args').value),
            workingDir: document.getElementById('f-cwd').value.trim(),
            remarks: document.getElementById('f-remarks').value,
            envInherit: document.getElementById('f-inherit').checked,
            autoStart: document.getElementById('f-auto').checked,
            envVars: []
        };
        document.querySelectorAll('#f-env .proc-env-row').forEach(function (r) {
            var n = r.querySelector('.proc-env-name').value.trim();
            var v = r.querySelector('.proc-env-val').value;
            if (n) data.envVars.push({ name: n, value: v });
        });
        return data;
    }

    function validate(data) {
        if (!data.name) return '名称不能为空';
        if (!data.command) return '命令不能为空';
        return null;
    }

    document.getElementById('f-save').addEventListener('click', function () {
        var data = readForm();
        var err = validate(data);
        if (err) { showModalErr(err); return; }
        showModalErr('');
        document.getElementById('f-save').disabled = true;
        var p = editingId ? Api.localTools.procs.update(editingId, data) : Api.localTools.procs.create(data);
        p.then(function (resp) {
            document.getElementById('f-save').disabled = false;
            if (!resp.success) { showModalErr(resp.error || '保存失败'); return; }
            closeModal();
            showBanner('success', editingId ? '已保存' : '已创建');
            loadAll();
        }).catch(function () {
            document.getElementById('f-save').disabled = false;
            showModalErr('请求失败');
        });
    });

    // ===== Log Viewer =====
    var logModal = document.getElementById('log-modal');
    var logId = null;
    var logSeq = 0;
    var logTimer = null;
    var procListTimer = null;
    logModal.addEventListener('click', function (e) {
        var closer = e.target.closest && e.target.closest('[data-modal-close]');
        if (closer) closeLog();
    });
    document.getElementById('log-clear').addEventListener('click', function () {
        if (!logId) return;
        Api.localTools.procs.clearLogs(logId).then(function () {
            logSeq = 0;
            document.getElementById('log-body').innerHTML = '';
        });
    });

    function openLog(id) {
        var p = getProc(id);
        if (!p) return;
        logId = id;
        logSeq = 0;
        document.getElementById('log-title').textContent = '日志 · ' + p.name + (p.command ? '  ( ' + p.command + ' )' : '');
        document.getElementById('log-body').innerHTML = '';
        document.getElementById('log-stats').textContent = '0 行';
        logModal.hidden = false;
        pollLogs();
        if (logTimer) clearInterval(logTimer);
        logTimer = setInterval(pollLogs, 1000);
    }
    function closeLog() {
        logId = null;
        logModal.hidden = true;
        if (logTimer) clearInterval(logTimer);
        logTimer = null;
    }
    function pollLogs() {
        if (!logId) return;
        Api.localTools.procs.logs(logId, logSeq, 500).then(function (data) {
            if (!data.success) return;
            var body = document.getElementById('log-body');
            if (data.truncated && body.children.length === 0) {
                body.innerHTML = '<div class="proc-log-line proc-log-err"><span class="proc-log-text">（已截断，缓冲区溢出）</span></div>';
            }
            var html = '';
            data.lines.forEach(function (l) {
                var cls = l.stream === 1 ? 'proc-log-line proc-log-err' : 'proc-log-line';
                var t = new Date(l.ts).toLocaleTimeString();
                html += '<div class="' + cls + '"><span class="proc-log-ts">' + App.escapeHtml(t) + '</span><span class="proc-log-text">' + App.escapeHtml(stripAnsi(l.text)) + '</span></div>';
            });
            if (html) body.insertAdjacentHTML('beforeend', html);
            logSeq = data.lastSeq || logSeq;
            document.getElementById('log-stats').textContent = body.children.length + ' 行';
            // status
            var st = document.getElementById('log-status');
            if (data.running) { st.textContent = '运行中'; st.className = 'ui-badge ok'; }
            else { st.textContent = '已停止'; st.className = 'ui-badge pending'; }
            // auto scroll
            if (document.getElementById('log-auto').checked) {
                body.scrollTop = body.scrollHeight;
            }
        });
    }

    // 周期性刷新列表
    setInterval(function () {
        if (logModal.hidden) loadAll();
    }, 5000);

    loadAll();
})();