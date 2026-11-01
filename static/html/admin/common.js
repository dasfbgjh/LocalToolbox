(function () {
    'use strict';
    var App = window.App;

    function isLocalhost() {
        var h = window.location.hostname;
        return h === '127.0.0.1' || h === 'localhost' || h === '::1';
    }

    // ===== Tab switching =====
    function activateTab(tab, skipSave) {
        var btns = document.querySelectorAll('.tab-btn');
        btns.forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-tab') === tab);
        });
        document.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
        var pane = document.getElementById('tab-' + tab);
        if (pane) pane.classList.add('active');
        // Lazy-load data on first switch
        if (tab === 'shares' && !document.getElementById('shares-container').dataset.loaded) {
            if (typeof window.AdminShares !== 'undefined') window.AdminShares.loadShares();
        } else if (tab === 'settings' && !document.getElementById('config-form').dataset.loaded) {
            if (typeof window.AdminSettings !== 'undefined') window.AdminSettings.loadConfig();
        } else if (tab === 'transfers') {
            if (typeof window.AdminTransfers !== 'undefined') {
                window.AdminTransfers.onActivate();
            }
        }
        // 通知其它 tab 取消激活（暂停轮询等）
        ['users', 'shares', 'settings', 'transfers'].forEach(function (other) {
            if (other === tab) return;
            var mod = window[ 'Admin' + other.charAt(0).toUpperCase() + other.slice(1) ];
            if (mod && typeof mod.onDeactivate === 'function') mod.onDeactivate();
        });
        if (!skipSave) {
            try { localStorage.setItem('admin-active-tab', tab); } catch (e) { }
            Api.settings.update({ adminActiveTab: tab }).catch(function () { });
        }
    }

    function initTabs() {
        document.querySelectorAll('.tab-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                activateTab(btn.getAttribute('data-tab'));
            });
        });
    }

    // ===== 文件系统浏览器（薄封装，转发给公共模块 FsBrowser） =====
    // 保留旧签名 (callback, mode) 以兼容 shares.js / settings.js 调用方
    // 注意：fs_browser 统一使用本机浏览接口（后端已移除独立 admin/fs）
    function showFsBrowser(callback, mode) {
        var m = mode === 'file' ? 'file' : 'dir';
        window.FsBrowser.open({
            mode: m,
            api: 'local',
            onConfirm: function (p) { if (typeof callback === 'function') callback(p); }
        });
    }

    // Export to global
    window.AdminCommon = {
        isLocalhost: isLocalhost,
        activateTab: activateTab,
        initTabs: initTabs,
        showFsBrowser: showFsBrowser
    };
})();
