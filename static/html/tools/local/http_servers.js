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

    function showModalErr(msg) {
        var el = document.getElementById('hs-modal-err');
        if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
        el.style.display = '';
        el.textContent = msg;
    }

    function isLocalhost() {
        var h = window.location.hostname;
        return h === '127.0.0.1' || h === 'localhost' || h === '::1';
    }

    if (!isLocalhost()) {
        document.getElementById('ui-card-list').innerHTML = '<div class="admin-empty"><div class="icon">🚫</div><h3>本页面仅限本机访问</h3><p>请在 127.0.0.1 / localhost 打开</p></div>';
        document.getElementById('btn-new').style.display = 'none';
        return;
    }

    // ===== Data =====
    var servers = []; // [{id, name, port, status, error, autoStart, mounts:[{path,source}]}]

    function loadAll() {
        Api.localTools.httpServers.list().then(function (data) {
            if (!data.success) { showBanner('error', data.error || '加载失败'); return; }
            servers = data.servers || [];
            render();
        }).catch(function () { showBanner('error', '请求失败'); });
    }

    function render() {
        var list = document.getElementById('ui-card-list');
        if (servers.length === 0) {
            list.innerHTML = '<div class="admin-empty"><div class="icon">⇄</div><h3>暂无 HTTP 服务器</h3><p>点击右上角"新建服务器"开始</p></div>';
            return;
        }
        var html = '';
        servers.forEach(function (s) {
            var statusBadge = '<span class="ui-badge pending">已停止</span>';
            if (s.status === 'running') statusBadge = '<span class="ui-badge ok">运行中</span>';
            else if (s.status === 'error') statusBadge = '<span class="ui-badge err">错误</span>';

            var mounts = s.mounts || [];
            var mountsHtml = '';
            if (mounts.length === 0) {
                mountsHtml = '<div class="ui-empty-message">未配置路径</div>';
            } else {
                var portLink = s.port ? ('http://127.0.0.1:' + s.port) : '';
                mountsHtml = '<table class="hs-mounts-tbl"><tbody>';
                mounts.forEach(function (m) {
                    var isProxy = /^https?:\/\//i.test(m.source);
                    var tag = isProxy ? '<span class="ui-badge pending">代理</span>' : '<span class="ui-badge ok">静态</span>';
                    var pathCell = '<td class="hs-m-path">' + App.escapeHtml(m.path) + '</td>';
                    if (portLink && m.path) {
                        var url = portLink + m.path;
                        pathCell = '<td class="hs-m-path"><a class="hs-m-link" href="' + App.escapeHtml(url) +
                            '" target="_blank" rel="noopener" title="打开 ' + App.escapeHtml(url) + '">' +
                            App.escapeHtml(m.path) + '</a></td>';
                    }
                    mountsHtml += '<tr>' +
                        pathCell +
                        '<td class="ui-sep-arrow">→</td>' +
                        '<td>' + tag + '</td>' +
                        '<td class="hs-m-src">' + App.escapeHtml(m.source) + '</td>' +
                        '</tr>';
                });
                mountsHtml += '</tbody></table>';
            }

            var errMsg = (s.status === 'error' && s.error) ? '<div class="tool-banner error" style="margin-top:0.5rem;">' + App.escapeHtml(s.error) + '</div>' : '';

            var autoBadge = s.autoStart ? '<span class="tool-tag">自动启动</span>' : '';
            var isRunning = s.status === 'running';
            var actions = '';
            if (isRunning) {
                actions = '<button class="btn btn-sm btn-outline" data-act="stop" data-id="' + s.id + '">停止</button>';
            } else {
                actions = '<button class="btn btn-sm" data-act="start" data-id="' + s.id + '">启动</button>';
            }
            var editDis = isRunning ? ' disabled title="服务运行时不可编辑，请先停止"' : '';
            var delDis = isRunning ? ' disabled title="服务运行时不可删除，请先停止"' : '';
            actions += '<button class="btn btn-sm btn-outline" data-act="edit" data-id="' + s.id + '"' + editDis + '>编辑</button>';
            actions += '<button class="btn btn-sm btn-danger-outline" data-act="del" data-id="' + s.id + '"' + delDis + '>删除</button>';

            html += '<div class="ui-card" data-id="' + s.id + '">' +
                '<div class="ui-card-head">' +
                '<div class="ui-card-title">' +
                '<span class="ui-card-name">' + App.escapeHtml(s.name) + '</span>' +
                '<span class="hs-port">:' + s.port + '</span>' +
                statusBadge + autoBadge +
                '</div>' +
                '<div class="ui-card-actions">' + actions + '</div>' +
                '</div>' +
                '<div class="ui-card-body">' + mountsHtml + errMsg + '</div>' +
                '</div>';
        });
        list.innerHTML = html;
        list.querySelectorAll('button[data-act]').forEach(function (b) {
            var act = b.getAttribute('data-act');
            var id = b.getAttribute('data-id');
            b.addEventListener('click', function () {
                var s = getServer(id);
                if (!s) return;
                if ((act === 'edit' || act === 'del') && s.status === 'running') {
                    showBanner('warn', '服务正在运行，请先停止后再操作');
                    return;
                }
                if (act === 'start') doStart(id);
                else if (act === 'stop') doStop(id);
                else if (act === 'edit') openModal(s);
                else if (act === 'del') doDelete(id);
            });
        });
    }

    function getServer(id) {
        for (var i = 0; i < servers.length; i++) if (servers[i].id === id) return servers[i];
        return null;
    }

    function doStart(id) {
        Api.localTools.httpServers.start(id).then(function (data) {
            if (!data.success) { showBanner('error', data.error || '启动失败'); loadAll(); return; }
            showBanner('success', '已启动');
            loadAll();
        });
    }
    function doStop(id) {
        Api.localTools.httpServers.stop(id).then(function (data) {
            if (!data.success) { showBanner('error', data.error || '停止失败'); loadAll(); return; }
            showBanner('success', '已停止');
            loadAll();
        });
    }
    function doDelete(id) {
        var s = getServer(id);
        if (!s) return;
        if (!confirm('确认删除 "' + s.name + '"？正在运行会被一并停止。')) return;
        Api.localTools.httpServers.remove(id).then(function (data) {
            if (!data.success) { showBanner('error', data.error || '删除失败'); return; }
            showBanner('success', '已删除');
            loadAll();
        });
    }

    // ===== Modal =====
    var modal = document.getElementById('hs-modal');
    var editingId = null;

    function openModal(srv) {
        editingId = srv ? srv.id : null;
        document.getElementById('hs-modal-title').textContent = srv ? '编辑服务器' : '新建服务器';
        document.getElementById('f-name').value = srv ? srv.name : '';
        document.getElementById('f-port').value = srv ? srv.port : 8080;
        document.getElementById('f-auto').checked = srv ? !!srv.autoStart : false;
        renderMountEditor(srv ? (srv.mounts || []) : [{ path: '/', source: '' }]);
        showModalErr('');
        modal.hidden = false;
    }
    function closeModal() { modal.hidden = true; editingId = null; }

    document.getElementById('btn-new').addEventListener('click', function () { openModal(null); });
    modal.addEventListener('click', function (e) {
        if (e.target.getAttribute('data-modal-close') !== null) closeModal();
    });

    function renderMountEditor(mounts) {
        var box = document.getElementById('f-mounts');
        box.innerHTML = '';
        if (mounts.length === 0) mounts = [{ path: '', source: '' }];
        mounts.forEach(function (m, i) {
            var row = document.createElement('div');
            row.className = 'hs-m-row';
            row.innerHTML =
                '<input type="text" class="ui-form-input hs-m-input-path" placeholder="/api/" value="' + App.escapeHtml(m.path || '') + '">' +
                '<span class="ui-sep-arrow">→</span>' +
                '<input type="text" class="ui-form-input hs-m-input-src" placeholder="C:\\www 或 http://localhost:3000" value="' + App.escapeHtml(m.source || '') + '">' +
                '<button class="btn btn-sm btn-ghost" data-rm="' + i + '">×</button>';
            box.appendChild(row);
        });
        box.querySelectorAll('button[data-rm]').forEach(function (b) {
            b.addEventListener('click', function () {
                if (box.children.length <= 1) {
                    box.children[0].querySelector('.hs-m-input-path').value = '';
                    box.children[0].querySelector('.hs-m-input-src').value = '';
                    return;
                }
                var r = b.closest('.hs-m-row');
                r.parentNode.removeChild(r);
            });
        });
    }

    document.getElementById('f-add-mount').addEventListener('click', function () {
        var box = document.getElementById('f-mounts');
        var row = document.createElement('div');
        row.className = 'hs-m-row';
        row.innerHTML =
            '<input type="text" class="ui-form-input hs-m-input-path" placeholder="/api/" value="">' +
            '<span class="ui-sep-arrow">→</span>' +
            '<input type="text" class="ui-form-input hs-m-input-src" placeholder="C:\\www 或 http://localhost:3000" value="">' +
            '<button class="btn btn-sm btn-ghost" data-rm="x">×</button>';
        box.appendChild(row);
        row.querySelector('button[data-rm]').addEventListener('click', function () {
            if (box.children.length <= 1) {
                row.querySelector('.hs-m-input-path').value = '';
                row.querySelector('.hs-m-input-src').value = '';
                return;
            }
            row.parentNode.removeChild(row);
        });
    });

    function readForm() {
        var name = document.getElementById('f-name').value.trim();
        var port = parseInt(document.getElementById('f-port').value, 10) || 0;
        var auto = document.getElementById('f-auto').checked;
        var mounts = [];
        document.querySelectorAll('#f-mounts .hs-m-row').forEach(function (r) {
            var p = r.querySelector('.hs-m-input-path').value.trim();
            var s = r.querySelector('.hs-m-input-src').value.trim();
            if (p || s) mounts.push({ path: p, source: s });
        });
        return { name: name, port: port, autoStart: auto, mounts: mounts };
    }

    function validate(data) {
        if (!data.name) return '名称不能为空';
        if (data.port < 1 || data.port > 65535) return '端口必须在 1-65535 之间';
        if (data.mounts.length === 0) return '至少添加一个路径';
        for (var i = 0; i < data.mounts.length; i++) {
            var m = data.mounts[i];
            if (!m.path) return '第 ' + (i + 1) + ' 行路径不能为空';
            if (!m.source) return '第 ' + (i + 1) + ' 行源不能为空';
            if (m.path.charAt(0) !== '/') return '第 ' + (i + 1) + ' 行路径必须以 / 开头';
        }
        return null;
    }

    document.getElementById('f-save').addEventListener('click', function () {
        var data = readForm();
        var err = validate(data);
        if (err) { showModalErr(err); return; }
        showModalErr('');
        document.getElementById('f-save').disabled = true;
        var p;
        if (editingId) p = Api.localTools.httpServers.update(editingId, data);
        else p = Api.localTools.httpServers.create(data);
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

    // 初始
    loadAll();
})();