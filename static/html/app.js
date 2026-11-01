(function (window) {
    'use strict';

    var STORAGE_KEY = 'auth-storage';

    // ===== State (auth only) =====
    var state = {
        user: null
    };

    function loadState() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            var s = JSON.parse(raw);
            state.user = s.user || null;
        } catch (e) { /* ignore */ }
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            user: state.user
        }));
    }

    function setUser(u) {
        state.user = u || null;
        saveState();
    }

    function logout() {
        state.user = null;
        localStorage.removeItem(STORAGE_KEY);
    }
    function isAuthenticated() { return !!state.user; }

    // ===== Time formatting (Chinese, like date-fns formatDistanceToNow) =====
    function startOf(date, unit) {
        var d = new Date(date);
        if (unit === 'minute') { d.setSeconds(0, 0); }
        else if (unit === 'hour') { d.setMinutes(0, 0, 0); }
        else if (unit === 'day') { d.setHours(0, 0, 0, 0); }
        return d;
    }

    function formatDistanceToNow(date) {
        if (!date) return '';
        var d = (date instanceof Date) ? date : new Date(date);
        var now = new Date();
        var diff = now.getTime() - d.getTime();
        if (isNaN(diff)) return '';
        var sec = Math.round(diff / 1000);
        var min = Math.round(sec / 60);
        var hr = Math.round(min / 60);
        var day = Math.round(hr / 24);
        var month = Math.round(day / 30);

        if (sec < 5) return '刚刚';
        if (sec < 60) return sec + ' 秒前';
        if (min < 60) return min + ' 分钟前';
        if (hr < 24) return hr + ' 小时前';
        if (day < 30) return day + ' 天前';
        if (month < 12) return month + ' 个月前';
        return Math.round(month / 12) + ' 年前';
    }

    // ===== Modal helpers =====
    var _modalCount = 0;
    function openModal(title, bodyHtml, footerHtml, modalClass) {
        _modalCount++;
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        if (_modalCount >= 2) overlay.classList.add('modal-overlay-stack');
        if (_modalCount >= 3) overlay.classList.add('modal-overlay-stack-2');
        overlay.id = '__app_modal_' + _modalCount;
        var modalCls = 'modal' + (modalClass ? ' ' + modalClass : '');
        overlay.innerHTML =
            '<div class="' + modalCls + '">' +
            '<div class="modal-header">' +
            '<span class="modal-title">' + escapeHtml(title || '') + '</span>' +
            '<button class="btn btn-ghost btn-sm" data-modal-close>×</button>' +
            '</div>' +
            '<div class="modal-body">' + (bodyHtml || '') + '</div>' +
            (footerHtml ? '<div class="modal-footer">' + footerHtml + '</div>' : '') +
            '</div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay || e.target.hasAttribute('data-modal-close')) {
                closeModal();
            }
        });
        return overlay;
    }

    function closeModal() {
        var lastId = '__app_modal_' + _modalCount;
        var existing = document.getElementById(lastId);
        if (existing) {
            existing.remove();
            _modalCount--;
        }
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ===== Init: ensure state loaded =====
    loadState();

    // ===== Export =====
    window.App = {
        state: state,
        loadState: loadState,
        saveState: saveState,
        setUser: setUser,
        logout: logout,
        isAuthenticated: isAuthenticated,
        formatDistanceToNow: formatDistanceToNow,
        openModal: openModal,
        closeModal: closeModal,
        escapeHtml: escapeHtml
    };
})(window);
