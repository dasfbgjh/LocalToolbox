(function () {
    'use strict';
    var THEME_KEY = 'tools-theme';
    var root = document.documentElement;

    function systemPrefersDark() {
        try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
    }

    function resolveTheme(force) {
        if (force === 'light' || force === 'dark') return force;
        try {
            var q = new URLSearchParams(window.location.search).get('theme');
            if (q === 'light' || q === 'dark') return q;
        } catch (e) { /* ignore */ }
        var stored = null;
        try { stored = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
        if (stored === 'light' || stored === 'dark') return stored;
        return systemPrefersDark() ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        var t = resolveTheme(theme);
        if (root.getAttribute('data-theme') !== t) root.setAttribute('data-theme', t);
    }
    applyTheme();

    try {
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const listener = function () {
            var stored = null;
            try { stored = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
            if (stored !== 'light' && stored !== 'dark') applyTheme();
        };
        if (mql.addEventListener) mql.addEventListener('change', listener);
        else if (mql.addListener) mql.addListener(listener); // Safari 旧版兜底
    } catch (e) { /* ignore */ }

    // 跨标签同步（其它页写入 localStorage 后，本页会收到 storage 事件）
    try {
        window.addEventListener('storage', function (e) {
            if (e.key !== THEME_KEY) return;
            applyTheme(e.newValue);
        });
    } catch (e) { /* ignore */ }

    // 对外暴露接口，方便外部壳子直接切换主题
    window.Theme = {
        update: function (theme) {
            try { localStorage.setItem(THEME_KEY, theme === 'light' ? 'light' : 'dark'); } catch (e) { /* ignore */ }
            applyTheme(theme);
        },
        apply: applyTheme,
        themeKey: THEME_KEY
    };
})();
