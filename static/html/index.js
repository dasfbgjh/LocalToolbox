(function (window) {
    'use strict';
    const ICON_SUN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    const ICON_MOON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    const ICON_MEMO = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12a2 2 0 0 1 2 2v14l-4-3-4 3-4-3-4 3V6a2 2 0 0 1 2-2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="13" y2="13"/></svg>';
    const ICON_LOGOUT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
    const ICON_QR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm9-2h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zm9-2h2v2h-2v-2zm4 0h3v3h-2v-1h-1v-2zm-4 4h2v3h-2v-3zm4 1h1v-1h2v3h-3v-2zm0-2h1v1h-1v-1z"/></svg>';
    const ICON_REFRESH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
    const ICON_LOGIN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>';
    const ICON_USER = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    const ICON_COLLAPSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>';

    const App = window.App;

    const navItems = [
        { id: 'tools', name: '工具箱', path: './tools.html', pathPrefix: '/tools/', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>' },
        { id: 'clipboard', name: '剪切板', path: './clipboard/', isBrand: true, icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>' },
        { id: 'fileservice', name: '文件服务', path: './fileservice/', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' },
        { id: 'admin', name: '管理员', path: './admin/', localhostOnly: true, icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' }
    ];
    const defaultPage = navItems[0];
    let currentPageId = defaultPage.id;
    const sidebarEl = document.getElementById('sidebar');
    const iframe = document.getElementById('content-frame');
    let sidebarCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';

    function toggleTheme() {
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        var next = current === 'dark' ? 'light' : 'dark';
        window.Theme.update(next);
        Api.settings.update({ theme: next }).catch(function () { });
        renderSidebar();
    }

    function toggleSidebar() {
        sidebarCollapsed = !sidebarCollapsed;
        try { localStorage.setItem('sidebar-collapsed', sidebarCollapsed); } catch (e) { }
        if (sidebarCollapsed) {
            sidebarEl.classList.add('collapsed');
        } else {
            sidebarEl.classList.remove('collapsed');
        }
    }

    // ===== QR Code modal =====
    function openQrModal() {
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = '__qr_modal';
        overlay.innerHTML =
            '<div class="modal" style="width: 400px; height: auto;">' +
            '<div class="modal-header" style="padding: 12px 14px;">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm9-2h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zm9-2h2v2h-2v-2zm4 0h3v3h-2v-1h-1v-2zm-4 4h2v3h-2v-3zm4 1h1v-1h2v3h-3v-2zm0-2h1v1h-1v-1z"/></svg>' +
            '<span class="modal-title" style="font-size: 14px;">扫描二维码访问</span>' +
            '<button class="btn btn-ghost btn-sm" data-modal-close>×</button>' +
            '</div>' +
            '<div class="modal-body" id="qr-body" style="padding: 14px;">获取网络地址中...</div>' +
            '</div>';
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay || e.target.hasAttribute('data-modal-close')) {
                var modal = document.getElementById('__qr_modal');
                if (modal) modal.remove();
            }
        });

        var body = document.getElementById('qr-body');
        if (!body) return;
        Api.localTools.localIp().then(function (data) {
            if (!data.success || !data.ips || !data.ips.length) {
                body.innerHTML = '<p style="text-align: center; color: #94a3b8;">无可用网络地址</p>';
                return;
            }
            var port = window.location.port ? ':' + window.location.port : '';
            var html = '<div style="display: flex; flex-direction: column; gap: 14px;">' +
                '<div>' +
                '<label style="font-size: 13px; margin-bottom: 6px; display: block;">选择网络地址</label>' +
                '<select id="qr-ip" class="select" style="width: 100%; font-size: 13px;">';
            data.ips.forEach(function (ip) { html += '<option value="' + escapeHtml(ip) + '">' + escapeHtml(ip) + '</option>'; });
            html += '</select></div>' +
                '<div style="text-align: center;">' +
                '<img id="qr-img" src="" alt="QR" style="width: 200px; height: 200px; border-radius: 8px; background: #fff;"/>' +
                '</div>' +
                '<div style="display: flex; gap: 8px;">' +
                '<input id="qr-url" class="input" readonly style="flex: 1; font-size: 13px; padding: 8px;" />' +
                '<button class="btn btn-outline btn-sm" id="qr-copy" style="padding: 8px;" title="复制链接">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                '</button>' +
                '</div>' +
                '<p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">扫描二维码或复制上方链接到浏览器打开</p>' +
                '</div>';
            body.innerHTML = html;
            var sel = document.getElementById('qr-ip');
            var img = document.getElementById('qr-img');
            var urlInput = document.getElementById('qr-url');
            function render(ip) {
                var url = 'http://' + ip + port;
                urlInput.value = url;
                img.src = Api.tools.qrcode(url);
            }
            sel.addEventListener('change', function () { render(sel.value); });
            render(data.ips[0]);
            document.getElementById('qr-copy').addEventListener('click', function () {
                urlInput.select();
                try {
                    document.execCommand('copy');
                    var btn = this;
                    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                    setTimeout(function () {
                        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                    }, 1500);
                } catch (e) { }
            });
        }).catch(function () {
            body.innerHTML = '<p class="text-danger text-center">获取网络地址失败</p>';
        });
    }

    function escapeHtml(s) {
        return window.App.escapeHtml(s);
    }

    function savePage(page) {
        try {
            localStorage.setItem('tools-current-page', page);
        } catch (e) {

        }
        Api.settings.update({ currentPageId: page }).catch(function () { });
    }

    function getSavedPage() {
        try {
            return localStorage.getItem('tools-current-page');
        } catch (e) {
            return null;
        }
    }

    function getNavUrl(pageId) {
        var item = navItems.find(function (n) { return n.id === pageId; });
        var base = item ? item.path : defaultPage.path;
        var qp = new URLSearchParams(window.location.search);
        qp.delete('page');
        var qs = qp.toString();
        if (qs) {
            var sep = base.indexOf('?') === -1 ? '?' : '&';
            return base + sep + qs;
        }
        return base;
    }

    function toAbsolutePath(relativePath) {
        if (!relativePath) return relativePath;

        if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
            var url = new URL(relativePath);
            return url.pathname;
        }

        var currentPath = window.location.pathname;
        var basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);

        if (relativePath.startsWith('/')) {
            return relativePath;
        }

        if (relativePath.startsWith('./')) {
            relativePath = relativePath.substring(2);
        }

        while (relativePath.startsWith('../')) {
            relativePath = relativePath.substring(3);
            basePath = basePath.substring(0, basePath.substring(0, basePath.length - 1).lastIndexOf('/') + 1);
        }

        return basePath + relativePath;
    }

    function appendQueryParams(url) {
        var qp = new URLSearchParams(window.location.search);
        qp.delete('page');
        var qs = qp.toString();
        if (qs) {
            var sep = url.indexOf('?') === -1 ? '?' : '&';
            return url + sep + qs;
        }
        return url;
    }

    function isLocalhost() {
        var host = window.location.hostname;
        return host === '127.0.0.1' || host === 'localhost' || host === '::1';
    }

    function getLeftNavItems() {
        return navItems.filter(function (n) {
            return !n.showInRightNav && (!n.localhostOnly || isLocalhost());
        });
    }

    function navigateTo(page) {
        currentPageId = page;
        savePage(page);
        iframe.src = getNavUrl(page);
        renderSidebar();
    }

    var _markedLoading = false;
    function loadMarked(cb) {
        if (window.marked) { cb && cb(); return; }
        if (_markedLoading) {
            var t = setInterval(function () {
                if (window.marked) { clearInterval(t); cb && cb(); }
            }, 30);
            return;
        }
        _markedLoading = true;
        var s = document.createElement('script');
        s.src = './lib/marked.js';
        s.onload = function () { _markedLoading = false; cb && cb(); };
        s.onerror = function () { _markedLoading = false; alert('加载 marked.js 失败'); };
        document.head.appendChild(s);
    }

    var _memoLoading = false;
    function loadMemoModule(cb) {
        if (window.MemoModule) { cb && cb(); return; }
        if (_memoLoading) {
            var t = setInterval(function () {
                if (window.MemoModule) { clearInterval(t); cb && cb(); }
            }, 30);
            return;
        }
        _memoLoading = true;
        if (!document.getElementById('memo-css')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.id = 'memo-css';
            link.href = './memo.css';
            document.head.appendChild(link);
        }
        loadMarked(function () {
            var s = document.createElement('script');
            s.src = './memo.js';
            s.onload = function () { _memoLoading = false; cb && cb(); };
            s.onerror = function () { _memoLoading = false; alert('加载备忘录模块失败'); };
            document.head.appendChild(s);
        });
    }

    function renderSidebar() {
        var user = App.state.user;
        var authed = !!user;
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        var navHtml = '';
        getLeftNavItems().forEach(function (item) {
            var isActive = currentPageId === item.id;
            navHtml += '<button class="sidebar-nav-item' + (isActive ? ' active' : '') + '" data-nav="' + item.id + '" title="' + escapeHtml(item.name) + '">' +
                item.icon +
                '<span>' + escapeHtml(item.name) + '</span>' +
                '</button>';
        });

        var bottomHtml = '';
        bottomHtml += '<button class="sidebar-nav-item" id="memo-btn" title="备忘录">' + ICON_MEMO + '<span>备忘录</span></button>';
        bottomHtml += '<button class="sidebar-nav-item" id="theme-btn" title="' + (isDark ? '切换浅色主题' : '切换深色主题') + '">' + (isDark ? ICON_SUN : ICON_MOON) + '<span>' + (isDark ? '浅色主题' : '深色主题') + '</span></button>';
        bottomHtml += '<button class="sidebar-nav-item" id="qr-btn" title="显示二维码">' + ICON_QR + '<span>二维码</span></button>';
        bottomHtml += '<button class="sidebar-nav-item" id="refresh-btn" title="刷新页面">' + ICON_REFRESH + '<span>刷新</span></button>';

        if (authed) {
            bottomHtml += '<button class="sidebar-nav-item" id="logout-btn" title="退出登录">' + ICON_LOGOUT + '<span>退出登录</span></button>';
        } else {
            bottomHtml += '<a href="/auth/login.html" class="sidebar-nav-item" title="登录">' + ICON_LOGIN + '<span>登录</span></a>';
        }

        bottomHtml += '<button class="sidebar-toggle" id="sidebar-toggle" title="' + (sidebarCollapsed ? '展开侧栏' : '收起侧栏') + '">' + ICON_COLLAPSE + '</button>';

        var topHtml = '';
        if (authed) {
            topHtml = '<div class="sidebar-top" id="user-info" title="点击修改昵称">' +
                ICON_USER +
                '<span class="sidebar-title">' + escapeHtml(user.nickname || user.email) + '</span>' +
                '</div>';
        } else {
            topHtml = '<div class="sidebar-top">' +
                '<img src="./favicon.ico" class="sidebar-logo" alt="😁" />' +
                '<span class="sidebar-title">😁</span>' +
                '</div>';
        }

        sidebarEl.innerHTML =
            topHtml +
            '<div class="sidebar-nav">' + navHtml + '</div>' +
            '<div class="sidebar-bottom">' + bottomHtml + '</div>';

        if (sidebarCollapsed) {
            sidebarEl.classList.add('collapsed');
        } else {
            sidebarEl.classList.remove('collapsed');
        }

        sidebarEl.querySelectorAll('[data-nav]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var nav = btn.getAttribute('data-nav');
                navigateTo(nav);
            });
        });

        var logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function () {
                var overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                overlay.id = '__logout_modal';
                overlay.innerHTML =
                    '<div class="modal" style="width: 320px; height: auto;">' +
                    '<div class="modal-header" style="padding: 10px 14px;">' +
                    '<span class="modal-title" style="font-size: 14px;">确认退出</span>' +
                    '<button class="btn btn-ghost btn-sm" data-modal-close>×</button>' +
                    '</div>' +
                    '<div class="modal-body" style="padding: 14px; font-size: 0.875rem;">确定要退出登录吗？</div>' +
                    '<div class="modal-footer" style="padding: 10px 14px; justify-content: flex-end; gap: 8px;">' +
                    '<button class="btn btn-outline btn-sm" data-modal-close style="padding: 6px 14px;">取消</button>' +
                    '<button class="btn btn-sm" id="logout-confirm" style="padding: 6px 14px;">确定</button>' +
                    '</div>' +
                    '</div>';
                document.body.appendChild(overlay);
                overlay.addEventListener('click', function (e) {
                    if (e.target === overlay || e.target.hasAttribute('data-modal-close')) {
                        var modal = document.getElementById('__logout_modal');
                        if (modal) modal.remove();
                    }
                });
                document.getElementById('logout-confirm').addEventListener('click', function () {
                    var modal = document.getElementById('__logout_modal');
                    if (modal) modal.remove();
                    Api.auth.logout().then(function () {
                        App.logout();
                        window.location.href = '/auth/login.html';
                    });
                });
            });
        }

        var userInfo = document.getElementById('user-info');
        if (userInfo) {
            userInfo.addEventListener('click', function () {
                var overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                overlay.id = '__nick_modal';
                overlay.innerHTML =
                    '<div class="modal" style="width: 320px; height: auto;">' +
                    '<div class="modal-header" style="padding: 10px 14px;">' +
                    '<span class="modal-title" style="font-size: 14px;">修改昵称</span>' +
                    '<button class="btn btn-ghost btn-sm" data-modal-close>×</button>' +
                    '</div>' +
                    '<div class="modal-body" style="padding: 14px;">' +
                    '<div style="margin-bottom: 12px;">' +
                    '<label style="font-size: 13px; margin-bottom: 4px; display: block;">昵称</label>' +
                    '<input id="nick-input" class="input" style="font-size: 13px; padding: 8px;" />' +
                    '</div>' +
                    '</div>' +
                    '<div class="modal-footer" style="padding: 10px 14px; justify-content: flex-end; gap: 8px;">' +
                    '<button class="btn btn-outline btn-sm" data-modal-close style="padding: 6px 14px;">取消</button>' +
                    '<button class="btn btn-sm" id="nick-save" style="padding: 6px 14px;">保存</button>' +
                    '</div>' +
                    '</div>';
                document.body.appendChild(overlay);

                overlay.addEventListener('click', function (e) {
                    if (e.target === overlay || e.target.hasAttribute('data-modal-close')) {
                        var modal = document.getElementById('__nick_modal');
                        if (modal) modal.remove();
                    }
                });

                var input = document.getElementById('nick-input');
                input.value = App.state.user.nickname || '';
                input.focus();
                document.getElementById('nick-save').addEventListener('click', function () {
                    Api.auth.updateMe({ nickname: input.value.trim() }).then(function (data) {
                        if (data.success) {
                            App.setUser(data.user);
                            var modal = document.getElementById('__nick_modal');
                            if (modal) modal.remove();
                            renderSidebar();
                        } else {
                            alert(data.error || '更新失败');
                        }
                    });
                });
            });
        }

        var qrBtn = document.getElementById('qr-btn');
        if (qrBtn) qrBtn.addEventListener('click', openQrModal);

        var refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) refreshBtn.addEventListener('click', function () {
            try { iframe.contentWindow.location.reload(); } catch (ex) { iframe.src = iframe.src; }
        });

        var themeBtn = document.getElementById('theme-btn');
        if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

        var memoBtn = document.getElementById('memo-btn');
        if (memoBtn) {
            memoBtn.addEventListener('click', function () {
                if (window.MemoModule && window.MemoModule.open) {
                    window.MemoModule.open();
                } else {
                    loadMemoModule(function () { window.MemoModule && window.MemoModule.open(); });
                }
            });
        }

        var toggleBtn = document.getElementById('sidebar-toggle');
        if (toggleBtn) toggleBtn.addEventListener('click', toggleSidebar);
    }

    function initShell() {
        currentPageId = getSavedPage() || defaultPage.id;
        var initialIframeUrl = null;

        var params = new URLSearchParams(window.location.search);
        var initialPage = params.get('page');
        var initialPageSpecified = !!initialPage;

        iframe.addEventListener('load', function () {
            try {
                var p = iframe.contentWindow.location.pathname;
                var parentPath = window.location.pathname;
                if (p === parentPath || p === '/' || p === '/index.html') {
                    currentPageId = defaultPage.id;
                    iframe.src = getNavUrl(defaultPage.id);
                    renderSidebar();
                    return;
                }
                var matched = navItems.find(function (n) {
                    var normalized = toAbsolutePath(n.path);
                    if (p.indexOf(normalized) !== -1) return true;
                    if (n.pathPrefix) {
                        var pp = n.pathPrefix;
                        if (pp.startsWith('/') && p.indexOf(pp) !== -1) return true;
                    }
                    return false;
                });
                if (matched) {
                    currentPageId = matched.id;
                    renderSidebar();
                }
            } catch (e) { /* cross-origin */ }
        });

        if (initialPage) {
            var matched = navItems.find(function (n) {
                if (n.path === initialPage) return true;
                if (n.pathPrefix) {
                    if (initialPage.indexOf(n.pathPrefix) !== -1) return true;
                }
                return false;
            });
            if (matched) {
                currentPageId = matched.id;
                initialIframeUrl = appendQueryParams(matched.path);
                iframe.src = initialIframeUrl;
            } else {
                initialIframeUrl = appendQueryParams(initialPage);
                iframe.src = initialIframeUrl;
            }
        }

        if (!initialIframeUrl) {
            iframe.src = getNavUrl(currentPageId);
        }

        window.addEventListener('storage', function (e) {
            if (e.key === 'auth-storage') {
                App.loadState();
                renderSidebar();
            } else if (e.key === window.Theme.themeKey) {
                renderSidebar();
            }
        });

        renderSidebar();

        Api.auth.me().then(function (me) {
            if (me.success) {
                App.setUser(me.user);
            }
        }).then(function () {
            return Api.settings.list().then(function (sd) {
                if (sd.success && sd.settings) {
                    var s = sd.settings;
                    if (s.theme)
                        window.Theme.update(s.theme);

                    if (s.currentPageId && !initialPageSpecified) {
                        currentPageId = s.currentPageId;
                        try { localStorage.setItem('tools-current-page', s.currentPageId); } catch (e) { }
                    }
                }
            }).catch(function () { });
        }).then(function () {
            renderSidebar();
            if (initialIframeUrl) return;
            iframe.src = getNavUrl(currentPageId);
        });
    }

    initShell();

})(window);