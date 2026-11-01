(function () {
    'use strict';

    var Api = window.Api;

    var PHONE_W_TO_H = 9 / 16;
    var BORDER = 3;
    var FRAME_PAD = 0;
    var MOVE_STEP = 30;

    var state = {
        games: [],
        baseUrl: '',
        activeGame: null,
        mode: localStorage.getItem('game-mode') || 'pc',
        zoom: parseInt(localStorage.getItem('game-zoom'), 10) || 100,
        sidebarCollapsed: localStorage.getItem('game-sidebar-collapsed') === '1',
        searchQuery: '',
        offsetX: 0,
        offsetY: 0
    };

    function $(sel) { return document.querySelector(sel); }

    function renderSidebar() {
        var list = $('#game-list');
        if (!list) return;
        list.innerHTML = '';
        var q = state.searchQuery.toLowerCase();
        var idx = 0;
        state.games.forEach(function (g) {
            if (q && g.name.toLowerCase().indexOf(q) === -1 && g.id.toLowerCase().indexOf(q) === -1) return;
            idx++;
            var li = document.createElement('li');
            li.className = 'game-list-item' + (state.activeGame && state.activeGame.id === g.id ? ' active' : '');
            li.innerHTML = '<span class="game-list-idx">' + idx + '.' + '</span><span class="game-list-name">' + g.name + '</span>';
            li.addEventListener('click', function (e) {
                if (e.ctrlKey || e.metaKey) {
                    var url = buildGameUrl(g);
                    if (url) window.open(url, '_blank');
                    return;
                }
                selectGame(g);
            });
            list.appendChild(li);
        });
    }

    function selectGame(game) {
        var isFirst = !state.activeGame;
        state.activeGame = game;
        renderSidebar();
        renderGameArea();
        if (isFirst) {
            resetPosition();
        } else {
            applyIframeSize();
        }
        focusIframe();
    }

    function focusIframe() {
        var area = $('#game-area');
        if (!area) return;
        var iframe = area.querySelector('iframe');
        if (iframe) {
            try { iframe.contentWindow.focus(); } catch (e) { iframe.focus(); }
        }
    }

    function renderModeButtons() {
        var pcBtn = $('#mode-pc');
        var mobileBtn = $('#mode-mobile');
        if (pcBtn) pcBtn.classList.toggle('active', state.mode === 'pc');
        if (mobileBtn) mobileBtn.classList.toggle('active', state.mode === 'mobile');
        renderZoomLabel();
    }

    function renderZoomLabel() {
        var label = $('#game-zoom-label');
        if (label) label.textContent = state.zoom + '%';
        var slider = $('#game-zoom-slider');
        if (slider) slider.value = state.zoom;
    }

    function setZoom(val) {
        state.zoom = val;
        try { localStorage.setItem('game-zoom', String(val)); } catch (e) { }
        renderZoomLabel();
        applyIframeSize();
    }

    function buildGameUrl(game) {
        if (!state.baseUrl) return '';
        return state.baseUrl + game.id + '/' + game.entryFile;
    }

    function applyIframeSize() {
        var area = $('#game-area');
        if (!area || !state.activeGame) return;

        var scale = state.zoom / 100;
        var container = area.querySelector('.game-iframe-container');
        if (!container) return;

        if (state.mode === 'pc') {
            var iframe = container.querySelector('iframe');
            if (!iframe) return;
            var areaW = area.clientWidth;
            var areaH = area.clientHeight;
            iframe.style.width = Math.round(areaW * scale) + 'px';
            iframe.style.height = Math.round(areaH * scale) + 'px';
            iframe.style.left = state.offsetX + 'px';
            iframe.style.top = state.offsetY + 'px';
        } else {
            var phoneFrame = container.querySelector('.phone-frame');
            if (!phoneFrame) return;
            var availW = area.clientWidth - FRAME_PAD * 2;
            var availH = area.clientHeight - FRAME_PAD * 2;

            var frameHFromW = availW / PHONE_W_TO_H + BORDER * 2;
            var frameWFromH = (availH - BORDER * 2) * PHONE_W_TO_H + BORDER * 2;

            var frameW, frameH;
            if (frameHFromW <= availH) {
                frameW = availW + BORDER * 2;
                frameH = frameHFromW;
            } else {
                frameH = availH + BORDER * 2;
                frameW = frameWFromH;
            }
            frameW = Math.floor(frameW * scale);
            frameH = Math.floor(frameH * scale);

            var screenW = frameW - BORDER * 2;
            var screenH = frameH - BORDER * 2;

            phoneFrame.style.width = frameW + 'px';
            phoneFrame.style.height = frameH + 'px';
            var iframe = phoneFrame.querySelector('iframe');
            if (iframe) {
                iframe.style.width = screenW + 'px';
                iframe.style.height = screenH + 'px';
            }
            phoneFrame.style.left = state.offsetX + 'px';
            phoneFrame.style.top = state.offsetY + 'px';
        }
    }

    function renderGameArea() {
        var area = $('#game-area');
        if (!area) return;

        if (!state.activeGame) {
            area.innerHTML = '<div class="game-empty"><div class="game-empty-icon">🎮</div><div class="game-empty-text">从左侧列表选择一个游戏开始</div></div>';
            area.className = 'game-area';
            return;
        }

        var url = buildGameUrl(state.activeGame);
        if (!url) {
            area.innerHTML = '<div class="game-empty"><div class="game-empty-icon">⚠️</div><div class="game-empty-text">游戏服务未启动</div></div>';
            area.className = 'game-area';
            return;
        }

        area.className = 'game-area ' + state.mode + '-mode';

        if (state.mode === 'pc') {
            area.innerHTML =
                '<div class="game-iframe-container">' +
                '<iframe src="' + url + '" allowfullscreen allow="autoplay; fullscreen"></iframe>' +
                '</div>';
        } else {
            area.innerHTML =
                '<div class="game-iframe-container">' +
                '<div class="phone-frame">' +
                '<iframe src="' + url + '" allowfullscreen allow="autoplay; fullscreen"></iframe>' +
                '</div>' +
                '</div>';
        }

        applyIframeSize();
    }

    function moveIframe(dx, dy) {
        state.offsetX += dx;
        state.offsetY += dy;
        applyIframeSize();
    }

    function resetPosition() {
        var area = $('#game-area');
        if (!area || !state.activeGame) {
            state.offsetX = 0;
            state.offsetY = 0;
            applyIframeSize();
            return;
        }

        var scale = state.zoom / 100;
        var areaW = area.clientWidth;
        var areaH = area.clientHeight;

        if (state.mode === 'pc') {
            var iframeW = Math.round(areaW * scale);
            var iframeH = Math.round(areaH * scale);
            state.offsetX = Math.round((areaW - iframeW) / 2);
            state.offsetY = Math.round((areaH - iframeH) / 2);
        } else {
            var container = area.querySelector('.game-iframe-container');
            var phoneFrame = container ? container.querySelector('.phone-frame') : null;
            if (phoneFrame) {
                var frameW = phoneFrame.offsetWidth;
                var frameH = phoneFrame.offsetHeight;
                state.offsetX = Math.round((areaW - frameW) / 2);
                state.offsetY = Math.round((areaH - frameH) / 2);
            } else {
                state.offsetX = 0;
                state.offsetY = 0;
            }
        }

        applyIframeSize();
    }

    function setMode(mode) {
        state.mode = mode;
        try { localStorage.setItem('game-mode', mode); } catch (e) { }
        renderModeButtons();
        renderGameArea();
        resetPosition();
    }

    function toggleSidebar() {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        try { localStorage.setItem('game-sidebar-collapsed', state.sidebarCollapsed ? '1' : '0'); } catch (e) { }
        var sidebar = $('#game-sidebar');
        if (sidebar) sidebar.classList.toggle('collapsed', state.sidebarCollapsed);
    }

    function init() {
        var sidebar = $('#game-sidebar');
        if (sidebar && state.sidebarCollapsed) sidebar.classList.add('collapsed');

        var collapseBtn = $('#sidebar-collapse');
        if (collapseBtn) collapseBtn.addEventListener('click', toggleSidebar);

        var expandBtn = $('#sidebar-expand');
        if (expandBtn) expandBtn.addEventListener('click', toggleSidebar);

        var pcBtn = $('#mode-pc');
        var mobileBtn = $('#mode-mobile');
        if (pcBtn) pcBtn.addEventListener('click', function () { setMode('pc'); });
        if (mobileBtn) mobileBtn.addEventListener('click', function () { setMode('mobile'); });

        var searchInput = $('#game-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                state.searchQuery = this.value.trim();
                renderSidebar();
            });
        }

        var zoomSlider = $('#game-zoom-slider');
        if (zoomSlider) {
            zoomSlider.addEventListener('input', function () {
                setZoom(parseInt(this.value, 10) || 100);
            });
        }

        var moveUp = $('#move-up');
        var moveDown = $('#move-down');
        var moveLeft = $('#move-left');
        var moveRight = $('#move-right');
        var moveReset = $('#move-reset');
        if (moveUp) moveUp.addEventListener('click', function () { moveIframe(0, -MOVE_STEP); });
        if (moveDown) moveDown.addEventListener('click', function () { moveIframe(0, MOVE_STEP); });
        if (moveLeft) moveLeft.addEventListener('click', function () { moveIframe(-MOVE_STEP, 0); });
        if (moveRight) moveRight.addEventListener('click', function () { moveIframe(MOVE_STEP, 0); });
        if (moveReset) moveReset.addEventListener('click', resetPosition);

        renderModeButtons();

        Api.localTools.game.start().then(function (r) {
            if (r && r.success) {
                state.baseUrl = r.baseUrl || '';
            }
            return Api.localTools.game.list();
        }).then(function (r) {
            if (r && r.success && r.games) {
                state.games = r.games;
            }
            renderSidebar();
            renderGameArea();
        }).catch(function () {
            renderSidebar();
            renderGameArea();
        });

        var resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                if (state.activeGame) applyIframeSize();
            }, 200);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();