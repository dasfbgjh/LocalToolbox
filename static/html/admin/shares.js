(function () {
    'use strict';
    var App = window.App;

    function getFileIcon(name, isDir) {
        return window.FsBrowser.FileIcons.getIcon(name, isDir);
    }

    function loadShares() {
        Api.admin.listShares().then(function (data) {
            if (!data.success) {
                if (data._status === 403) {
                    document.getElementById('access-denied').classList.remove('hidden');
                    document.getElementById('admin-content').classList.add('hidden');
                }
                return;
            }
            document.getElementById('shares-container').dataset.loaded = '1';
            var container = document.getElementById('shares-container');
            var empty = document.getElementById('shares-empty');
            container.innerHTML = '';
            if (!data.shares || data.shares.length === 0) {
                empty.classList.remove('hidden');
                return;
            }
            empty.classList.add('hidden');
            var header = document.createElement('div');
            header.className = 'share-row share-row-header';
            header.innerHTML =
                '<div class="col-name">名称</div>' +
                '<div class="col-path">路径</div>' +
                '<div class="col-perm">权限规则</div>' +
                '<div class="col-actions">操作</div>';
            container.appendChild(header);
            data.shares.forEach(function (s) {
                var row = document.createElement('div');
                row.className = 'share-row';
                var permCount = (s.permissions || []).length;
                var openBtn = s.isDirectory ?
                    '<button class="btn btn-sm" data-act="open" title="跳到文件服务器对应目录">打开</button>' : '';
                row.innerHTML =
                    '<div class="col-name">' +
                    '<span class="icon">' + getFileIcon(s.realPath || s.name, s.isDirectory) + '</span>' +
                    '<span class="name" data-act="open-name" style="cursor:pointer;">' + App.escapeHtml(s.name) + '</span>' +
                    '</div>' +
                    '<div class="col-path"><span class="path">' + App.escapeHtml(s.realPath) + '</span></div>' +
                    '<div class="col-perm"><span class="perm-badge">' + permCount + ' 条</span></div>' +
                    '<div class="col-actions">' +
                    openBtn +
                    '<button class="btn btn-sm btn-outline" data-act="edit">编辑</button>' +
                    '<button class="btn btn-sm btn-danger-outline" data-act="delete">删除</button>' +
                    '</div>';
                function openShareInFileservice() {
                    // 跳到文件服务器，自动打开该共享（仅目录共享）
                    var url = '/fileservice/?share=' + encodeURIComponent(s.id);
                    window.open(url, '_blank');
                }
                row.querySelector('[data-act="open"]').addEventListener('click', openShareInFileservice);
                var nameEl = row.querySelector('[data-act="open-name"]');
                if (nameEl) nameEl.addEventListener('click', openShareInFileservice);
                row.querySelector('[data-act="edit"]').addEventListener('click', function () { showEditModal(s); });
                row.querySelector('[data-act="delete"]').addEventListener('click', function () {
                    if (confirm('确定删除共享 "' + s.name + '"？（不会删除实际文件）')) {
                        Api.admin.deleteShare(s.id).then(function (res) {
                            if (res.success) loadShares();
                            else alert(res.error || '删除失败');
                        });
                    }
                });
                container.appendChild(row);
            });
        });
    }

    // 确保用户列表已加载：被多种入口调用（普通按钮 / ?share= 启动参数 / 批添加），
    // 异步加载未完成时调用 renderPermEditor 会让"+ 添加指定用户"按钮消失。
    function ensureUsersLoaded() {
        if (typeof window.AdminUsers === 'undefined') return Promise.resolve();
        if (window.AdminUsers.getAllUsers().length > 0) return Promise.resolve();
        return Promise.resolve(window.AdminUsers.loadUsers());
    }

    function showAddModal(preset) {
        preset = preset || {};
        return ensureUsersLoaded().then(function () {
            var body =
                '<div class="space-y-4">' +
                '<div><label>共享名称</label><input id="share-name" class="input" placeholder="如：我的文档" /></div>' +
                '<div>' +
                '<label>本机路径</label>' +
                '<div style="display:flex;gap:6px;">' +
                '<input id="share-path" class="input" placeholder="如：C:\\Users\\Documents" style="flex:1;" />' +
                '<button class="btn btn-outline btn-sm" id="browse-btn">浏览</button>' +
                '</div>' +
                '</div>' +
                '<div id="perm-editor"></div>' +
                '</div>';
            var footer = '<button class="btn btn-outline" data-modal-close>取消</button><button class="btn" id="save-share">创建</button>';
            App.openModal('添加共享', body, footer);
            renderPermEditor([]);
            var nameInput = document.getElementById('share-name');
            var pathInput = document.getElementById('share-path');
            if (preset.name && nameInput && !nameInput.value) nameInput.value = preset.name;
            if (preset.path && pathInput && !pathInput.value) pathInput.value = preset.path;
            document.getElementById('browse-btn').addEventListener('click', function () {
                if (typeof window.AdminCommon !== 'undefined') {
                    window.AdminCommon.showFsBrowser(function (p) { document.getElementById('share-path').value = p; });
                }
            });
            document.getElementById('save-share').addEventListener('click', function () { saveShare(null); });
        });
    }

    function showEditModal(share) {
        return ensureUsersLoaded().then(function () {
            var body =
                '<div class="space-y-4">' +
                '<div><label>共享名称</label><input id="share-name" class="input" value="' + App.escapeHtml(share.name) + '" /></div>' +
                '<div><label>本机路径</label><input id="share-path" class="input" value="' + App.escapeHtml(share.realPath) + '" readonly style="opacity:.7;" /></div>' +
                '<div id="perm-editor"></div>' +
                '</div>';
            var footer = '<button class="btn btn-outline" data-modal-close>取消</button><button class="btn" id="save-share">保存</button>';
            App.openModal('编辑共享 - ' + share.name, body, footer);
            renderPermEditor(share.permissions || []);
            document.getElementById('save-share').addEventListener('click', function () { saveShare(share.id); });
        });
    }

    function renderPermEditor(existing) {
        var editor = document.getElementById('perm-editor');
        var allUsers = typeof window.AdminUsers !== 'undefined' ? window.AdminUsers.getAllUsers() : [];
        var anonPerm = existing.find(function (p) { return p.subjectType === 'anonymous'; }) || {};
        var allPerm = existing.find(function (p) { return p.subjectType === 'all'; }) || {};
        var userPerms = existing.filter(function (p) { return p.subjectType === 'user'; });

        var html = '<label>权限设置</label>';
        html += permRow('anonymous', '匿名用户（未登录访客）', anonPerm);
        html += permRow('all', '所有已登录用户', allPerm);
        html += '<div id="user-perms">';
        userPerms.forEach(function (p, i) { html += userPermRow(p, i, allUsers); });
        html += '</div>';

        var availableUsers = allUsers.filter(function (u) {
            return !userPerms.find(function (p) { return p.userId === u.id; });
        });
        if (availableUsers.length > 0) {
            html += '<button class="btn btn-sm btn-outline" id="add-user-perm">+ 添加指定用户</button>';
        }

        editor.innerHTML = html;

        var addBtn = document.getElementById('add-user-perm');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                var container = document.getElementById('user-perms');
                var idx = container.children.length;
                container.insertAdjacentHTML('beforeend', userPermRow(null, idx, allUsers));
                bindUserPermRow(container.lastElementChild);
            });
        }
        document.querySelectorAll('#user-perms > .perm-section').forEach(bindUserPermRow);
    }

    function permRow(st, label, perm) {
        return '<div class="perm-section">' +
            '<div class="header"><span class="title">' + label + '</span></div>' +
            '<div class="perm-checks">' +
            check('canAccess', st, '访问', perm.canAccess) +
            check('canDownload', st, '下载', perm.canDownload) +
            check('canUpload', st, '上传', perm.canUpload) +
            check('canDelete', st, '删除', perm.canDelete) +
            check('canRename', st, '重命名', perm.canRename) +
            '</div></div>';
    }

    function check(name, st, label, checked) {
        return '<label><input type="checkbox" data-perm="' + name + '" data-st="' + st + '"' +
            (checked ? ' checked' : '') + ' /> ' + label + '</label>';
    }

    function userPermRow(perm, idx, allUsers) {
        var uid = perm ? perm.userId : '';
        var opts = '<option value="">-- 选择用户 --</option>';
        allUsers.forEach(function (u) {
            var sel = (perm && perm.userId === u.id) ? ' selected' : '';
            var name = u.nickname || u.email;
            opts += '<option value="' + u.id + '"' + sel + '>' + App.escapeHtml(name) + ' (' + App.escapeHtml(u.email) + ')</option>';
        });
        return '<div class="perm-section">' +
            '<div class="header">' +
            '<select class="select" data-user-select>' + opts + '</select>' +
            '<button class="btn btn-sm btn-ghost btn-icon" data-remove-user>×</button>' +
            '</div>' +
            '<div class="perm-checks">' +
            '<label><input type="checkbox" data-perm="canAccess"' + (perm && perm.canAccess ? ' checked' : '') + ' /> 访问</label>' +
            '<label><input type="checkbox" data-perm="canDownload"' + (perm && perm.canDownload ? ' checked' : '') + ' /> 下载</label>' +
            '<label><input type="checkbox" data-perm="canUpload"' + (perm && perm.canUpload ? ' checked' : '') + ' /> 上传</label>' +
            '<label><input type="checkbox" data-perm="canDelete"' + (perm && perm.canDelete ? ' checked' : '') + ' /> 删除</label>' +
            '<label><input type="checkbox" data-perm="canRename"' + (perm && perm.canRename ? ' checked' : '') + ' /> 重命名</label>' +
            '</div></div>';
    }

    function bindUserPermRow(row) {
        row.querySelector('[data-remove-user]').addEventListener('click', function () { row.remove(); });
    }

    function collectPermissions() {
        var perms = [];
        var anon = { subjectType: 'anonymous' };
        document.querySelectorAll('[data-st="anonymous"]').forEach(function (cb) {
            anon[cb.getAttribute('data-perm')] = cb.checked;
        });
        perms.push(anon);
        var all = { subjectType: 'all' };
        document.querySelectorAll('[data-st="all"]').forEach(function (cb) {
            all[cb.getAttribute('data-perm')] = cb.checked;
        });
        perms.push(all);
        document.querySelectorAll('#user-perms > .perm-section').forEach(function (row) {
            var sel = row.querySelector('[data-user-select]');
            var uid = sel.value;
            if (!uid) return;
            var p = { subjectType: 'user', userId: uid };
            row.querySelectorAll('[data-perm]').forEach(function (cb) {
                p[cb.getAttribute('data-perm')] = cb.checked;
            });
            perms.push(p);
        });
        return perms;
    }

    function saveShare(id) {
        var name = document.getElementById('share-name').value.trim();
        var path = document.getElementById('share-path').value.trim();
        if (!name) { alert('请输入共享名称'); return; }
        if (!path) { alert('请输入路径'); return; }
        var perms = collectPermissions();
        var body = { name: name, permissions: perms };
        if (!id) body.realPath = path;

        var req = id ? Api.admin.updateShare(id, body) : Api.admin.createShare(body);
        req.then(function (res) {
            if (res.success) { App.closeModal(); loadShares(); }
            else { alert(res.error || '保存失败'); }
        });
    }

    function showBatchAddModal(paths) {
        return ensureUsersLoaded().then(function () {
            var body =
                '<div class="space-y-4">' +
                '<div><label>路径列表（共 ' + paths.length + ' 个）</label>' +
                '<div id="batch-paths" style="max-height:300px;overflow-y:auto;">';
            paths.forEach(function (p, i) {
                var parts = p.split(/[\/\\]/).filter(Boolean);
                var name = parts[parts.length - 1] || p;
                body += '<div class="perm-section" data-batch-row="' + i + '">' +
                    '<div class="header">' +
                    '<label style="display:flex;align-items:center;gap:8px;flex:1;">' +
                    '<input type="checkbox" data-batch-check checked style="margin:0;" />' +
                    '<input class="input" data-batch-name value="' + App.escapeHtml(name) + '" style="flex:1;" />' +
                    '</label>' +
                    '</div>' +
                    '<div class="path" style="font-size:12px;color:var(--text-muted);margin-top:4px;font-family:monospace;word-break:break-all;">' + App.escapeHtml(p) + '</div>' +
                    '</div>';
            });
            body += '</div></div>' +
                '<div id="perm-editor"></div>';
            var footer = '<button class="btn btn-outline" data-modal-close>取消</button><button class="btn" id="save-batch">批量创建</button>';
            App.openModal('批量添加共享', body, footer, 'modal-lg');
            renderPermEditor([]);
            document.getElementById('save-batch').addEventListener('click', function () { saveBatchShares(paths); });
        });
    }

    function saveBatchShares(paths) {
        var rows = document.querySelectorAll('#batch-paths [data-batch-row]');
        var perms = collectPermissions();
        var queue = [];
        rows.forEach(function (row, i) {
            var check = row.querySelector('[data-batch-check]');
            if (!check.checked) return;
            var nameInput = row.querySelector('[data-batch-name]');
            var name = nameInput.value.trim();
            if (!name) {
                var parts = paths[i].split(/[\/\\]/).filter(Boolean);
                name = parts[parts.length - 1] || paths[i];
            }
            queue.push({ name: name, realPath: paths[i], permissions: perms });
        });
        if (queue.length === 0) {
            alert('请至少选择一个路径');
            return;
        }
        var idx = 0;
        function next() {
            if (idx >= queue.length) {
                App.closeModal();
                loadShares();
                return;
            }
            var item = queue[idx++];
            Api.admin.createShare(item).then(function (res) {
                if (!res.success) {
                    alert('创建 "' + item.name + '" 失败: ' + (res.error || '未知错误'));
                }
                next();
            });
        }
        next();
    }

    window.AdminShares = {
        loadShares: loadShares,
        showAddModal: showAddModal,
        showEditModal: showEditModal,
        showBatchAddModal: showBatchAddModal
    };
})();