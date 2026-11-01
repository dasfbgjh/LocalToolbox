(function () {
    'use strict';
    var App = window.App;
    var allUsers = [];

    function loadUsers() {
        return Api.admin.users().then(function (data) {
            if (data.success) allUsers = data.users || [];
            renderUsers();
        }).catch(function () { });
    }

    function renderUsers() {
        var container = document.getElementById('users-container');
        var empty = document.getElementById('users-empty');
        container.innerHTML = '';
        if (!allUsers || allUsers.length === 0) {
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        allUsers.forEach(function (u) {
            var name = u.nickname || u.email;
            var initial = name.charAt(0).toUpperCase();
            var created = u.createdAt ? u.createdAt.replace('T', ' ').substring(0, 16) : '';
            var row = document.createElement('div');
            row.className = 'user-row';
            row.innerHTML =
                '<div class="avatar">' + App.escapeHtml(initial) + '</div>' +
                '<div class="info">' +
                '<div class="name">' + App.escapeHtml(name) + '</div>' +
                '<div class="email">' + App.escapeHtml(u.email) + (created ? ' · ' + App.escapeHtml(created) : '') + '</div>' +
                '</div>' +
                '<div class="actions" style="display:flex;gap:6px;">' +
                '<button class="btn btn-sm btn-outline" data-act="edit">编辑</button>' +
                '<button class="btn btn-sm btn-danger-outline" data-act="delete">删除</button>' +
                '</div>';
            row.querySelector('[data-act="edit"]').addEventListener('click', function () { showUserModal(u); });
            row.querySelector('[data-act="delete"]').addEventListener('click', function () { deleteUser(u); });
            container.appendChild(row);
        });
    }

    function showUserModal(user) {
        var isEdit = !!user;
        var u = user || { email: '', nickname: '' };
        var body =
            '<div class="space-y-4">' +
            '<div><label>邮箱</label><input id="user-email" class="input" type="email" value="' + App.escapeHtml(u.email || '') + '" placeholder="user@example.com"' + (isEdit ? ' readonly style="opacity:.7;"' : '') + ' /></div>' +
            '<div><label>昵称</label><input id="user-nickname" class="input" value="' + App.escapeHtml(u.nickname || '') + '" placeholder="选填" /></div>' +
            '<div>' +
            '<label>' + (isEdit ? '重置密码（留空则不修改）' : '密码') + '</label>' +
            '<input id="user-password" class="input" type="password" placeholder="' + (isEdit ? '留空保持原密码' : '请输入密码') + '" />' +
            '</div>' +
            '</div>';
        var footer = '<button class="btn btn-outline" data-modal-close>取消</button>' +
            '<button class="btn" id="save-user">' + (isEdit ? '保存' : '创建') + '</button>';
        App.openModal(isEdit ? '编辑用户' : '添加用户', body, footer);
        document.getElementById('save-user').addEventListener('click', function () { saveUser(user); });
    }

    function saveUser(user) {
        var email = document.getElementById('user-email').value.trim();
        var nickname = document.getElementById('user-nickname').value.trim();
        var password = document.getElementById('user-password').value;
        if (!user) {
            if (!email) { alert('请输入邮箱'); return; }
            if (!password) { alert('请输入密码'); return; }
            var body = { email: email, password: password, nickname: nickname };
            Api.admin.createUser(body).then(function (res) {
                if (res.success) { App.closeModal(); loadUsers(); }
                else { alert(res.error || '创建失败'); }
            });
        } else {
            if (!email) { alert('邮箱不能为空'); return; }
            var body = { nickname: nickname };
            if (password) body.password = password;
            Api.admin.updateUser(user.id, body).then(function (res) {
                if (res.success) { App.closeModal(); loadUsers(); }
                else { alert(res.error || '保存失败'); }
            });
        }
    }

    function deleteUser(user) {
        var name = user.nickname || user.email;
        if (confirm('确定删除用户 "' + name + '"？\n该用户的会话和团队成员关系将被一并清除，此操作不可撤销。')) {
            Api.admin.deleteUser(user.id).then(function (res) {
                if (res.success) loadUsers();
                else alert(res.error || '删除失败');
            });
        }
    }

    window.AdminUsers = {
        loadUsers: loadUsers,
        renderUsers: renderUsers,
        showUserModal: showUserModal,
        getAllUsers: function () { return allUsers; }
    };
})();