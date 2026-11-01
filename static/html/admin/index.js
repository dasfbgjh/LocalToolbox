(function () {
    'use strict';
    var App = window.App;

    function init() {
        if (!window.AdminCommon.isLocalhost()) {
            document.getElementById('access-denied').classList.remove('hidden');
            return;
        }

        document.getElementById('admin-content').classList.remove('hidden');
        window.AdminCommon.initTabs();
        window.AdminUsers.loadUsers();

        var params = new URLSearchParams(window.location.search);
        var shareId = params.get('shareId');
        if (shareId) {
            window.AdminCommon.activateTab('shares', true);
            Api.admin.parameterPaths(shareId).then(function (data) {
                if (!data.success || !data.paths || data.paths.length === 0) return;
                if (data.paths.length === 1) {
                    var sharePath = data.paths[0];
                    var parts = sharePath.split(/[\/\\]/).filter(Boolean);
                    var defaultName = parts[parts.length - 1] || sharePath;
                    // showAddModal 是异步的：内部会 await AdminUsers.loadUsers()，
                    // 以确保权限设置中"+ 添加指定用户"按钮在打开时即可见。
                    window.AdminShares.showAddModal({ path: sharePath, name: defaultName });
                } else {
                    window.AdminShares.showBatchAddModal(data.paths);
                }
            });
        } else {
            var savedTab = null;
            try { savedTab = localStorage.getItem('admin-active-tab'); } catch (e) { }
            Api.settings.list().then(function (sd) {
                var tab = 'users';
                if (sd.success && sd.settings && sd.settings.adminActiveTab) {
                    tab = sd.settings.adminActiveTab;
                    try { localStorage.setItem('admin-active-tab', tab); } catch (e) { }
                } else if (savedTab) {
                    tab = savedTab;
                }
                if (!document.getElementById('tab-' + tab)) tab = 'users';
                window.AdminCommon.activateTab(tab, true);
            }).catch(function () {
                if (savedTab && document.getElementById('tab-' + savedTab)) {
                    window.AdminCommon.activateTab(savedTab, true);
                } else {
                    window.AdminCommon.activateTab('users', true);
                }
            });
        }

        document.getElementById('add-share-btn').addEventListener('click', window.AdminShares.showAddModal);
        document.getElementById('save-config-btn').addEventListener('click', window.AdminSettings.saveConfig);
        document.getElementById('save-reboot-btn').addEventListener('click', window.AdminSettings.saveAndReboot);
        document.getElementById('add-user-btn').addEventListener('click', function () { window.AdminUsers.showUserModal(null); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();