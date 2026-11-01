(function () {
    'use strict';

    var CATEGORIES = [];
    var TOOLS = [];
    var CAT_MAP = {};

    var SEARCH_TERM_KEY = 'tool-search-term';
    var state = {
        activeCat: localStorage.getItem('tool-active-cat') || 'all',
        searchTerm: localStorage.getItem(SEARCH_TERM_KEY) || '',
        toolLastUsed: {}
    };

    function buildCatMap() {
        CAT_MAP = {};
        CATEGORIES.forEach(function (c) { CAT_MAP[c.code] = c.name; });
    }

    function renderCategories() {
        var box = document.getElementById('categories');
        if (!box) return;
        box.innerHTML = '';
        CATEGORIES.forEach(function (cat) {
            var btn = document.createElement('button');
            btn.className = 'tool-cat-btn' + (state.activeCat === cat.code ? ' active' : '');
            btn.textContent = cat.name;
            btn.onclick = function () {
                state.activeCat = cat.code;
                try { localStorage.setItem('tool-active-cat', cat.code); } catch (e) { }
                Api.settings.update({ toolActiveCat: cat.code }).catch(function () { });
                renderCategories();
                renderTools();
            };
            box.appendChild(btn);
        });
    }

    function matchTool(tool) {
        if (state.activeCat !== 'all') {
            var found = false;
            for (var i = 0; i < tool.cats.length; i++) {
                if (tool.cats[i] === state.activeCat) { found = true; break; }
            }
            if (!found) return false;
        }
        if (!state.searchTerm) return true;
        var term = state.searchTerm.toLowerCase();
        if (tool.title && tool.title.toLowerCase().indexOf(term) !== -1) return true;
        if (tool.desc && tool.desc.toLowerCase().indexOf(term) !== -1) return true;
        if (tool.keywords) {
            for (var j = 0; j < tool.keywords.length; j++) {
                if (String(tool.keywords[j]).toLowerCase().indexOf(term) !== -1) return true;
            }
        }
        return false;
    }

    function sortTools(list) {
        if (state.searchTerm) {
            var term = state.searchTerm.toLowerCase();
            list.sort(function (a, b) {
                var at = (a.title || '').toLowerCase().indexOf(term);
                var bt = (b.title || '').toLowerCase().indexOf(term);
                if (at === -1 && bt === -1) return 0;
                if (at === -1) return 1;
                if (bt === -1) return -1;
                return at - bt;
            });
        } else if (state.activeCat === 'all') {
            list.sort(function (a, b) {
                var at = state.toolLastUsed[a.code] || 0;
                var bt = state.toolLastUsed[b.code] || 0;
                if (at !== bt) return bt - at;
                var ac = 1, bc = 1;
                for (var i = 0; i < a.cats.length; i++) { if (a.cats[i] === 'common') { ac = 0; break; } }
                for (var j = 0; j < b.cats.length; j++) { if (b.cats[j] === 'common') { bc = 0; break; } }
                if (ac !== bc) return ac - bc;
                return (a.title || '').localeCompare(b.title || '', 'zh');
            });
        } else {
            list.sort(function (a, b) {
                var ac = 1, bc = 1;
                for (var i = 0; i < a.cats.length; i++) { if (a.cats[i] === 'common') { ac = 0; break; } }
                for (var j = 0; j < b.cats.length; j++) { if (b.cats[j] === 'common') { bc = 0; break; } }
                if (ac !== bc) return ac - bc;
                return (a.title || '').localeCompare(b.title || '', 'zh');
            });
        }
        return list;
    }

    function renderTools() {
        var grid = document.getElementById('tool-grid');
        var empty = document.getElementById('empty-state');
        if (!grid) return;
        var filtered = sortTools(TOOLS.filter(matchTool));
        grid.innerHTML = '';

        if (filtered.length === 0) {
            if (empty) empty.classList.remove('hidden');
            return;
        }
        if (empty) empty.classList.add('hidden');

        filtered.forEach(function (tool) {
            var card = document.createElement('a');
            card.className = 'tool-card-item';
            card.href = tool.url || '#';
            card.addEventListener('click', function () {
                state.toolLastUsed[tool.code] = Date.now();
                try {
                    Api.settings.update({ toolLastUsed: JSON.stringify(state.toolLastUsed) }).catch(function () { });
                } catch (e) { }
            });

            var iconBox = document.createElement('div');
            iconBox.className = 'icon-box';
            var iconVal = tool.icon || '🔧';
            if (typeof iconVal === 'string' && iconVal.match(/\.svg$/i)) {
                var img = document.createElement('img');
                img.src = iconVal;
                img.alt = tool.title || tool.code;
                img.loading = 'lazy';
                iconBox.appendChild(img);
            } else {
                iconBox.textContent = iconVal;
            }

            var contentWrapper = document.createElement('div');
            contentWrapper.className = 'content-wrapper';

            var title = document.createElement('h3');
            title.textContent = tool.title || tool.code;
            contentWrapper.appendChild(title);

            var desc = document.createElement('p');
            desc.textContent = tool.desc || '';
            contentWrapper.appendChild(desc);

            var topRow = document.createElement('div');
            topRow.className = 'top-row';
            topRow.appendChild(iconBox);
            topRow.appendChild(contentWrapper);
            card.appendChild(topRow);

            var tags = document.createElement('div');
            tags.className = 'tool-tags';
            (tool.cats || []).forEach(function (catCode) {
                var catName = CAT_MAP[catCode];
                if (catName && catCode !== 'all') {
                    var tag = document.createElement('span');
                    tag.className = 'tool-tag';
                    tag.textContent = catName;
                    tags.appendChild(tag);
                }
            });
            card.appendChild(tags);

            grid.appendChild(card);
        });
    }

    function bindSearch() {
        var searchInput = document.getElementById('tool-search');
        if (!searchInput) return;
        if (state.searchTerm) searchInput.value = state.searchTerm;
        searchInput.addEventListener('input', function (e) {
            state.searchTerm = e.target.value.trim();
            try {
                if (state.searchTerm) localStorage.setItem(SEARCH_TERM_KEY, state.searchTerm);
                else localStorage.removeItem(SEARCH_TERM_KEY);
            } catch (ex) { }
            renderTools();
        });
    }

    function init() {
        Api.settings.list().then(function (sd) {
            if (sd && sd.success && sd.settings) {
                if (sd.settings.toolActiveCat) {
                    state.activeCat = sd.settings.toolActiveCat;
                    try { localStorage.setItem('tool-active-cat', state.activeCat); } catch (e) { }
                }
                if (sd.settings.toolLastUsed) {
                    try {
                        var parsed = JSON.parse(sd.settings.toolLastUsed);
                        if (parsed && typeof parsed === 'object') state.toolLastUsed = parsed;
                    } catch (e) { }
                }
            }
        }).catch(function () { }).then(function () {
            return Api.tools.catalog().then(function (resp) {
                if (resp && resp.success === false) {
                    console.error('加载工具目录失败:', resp.error);
                    return;
                }
                CATEGORIES = resp.categories || [];
                TOOLS = resp.tools || [];
                buildCatMap();
                renderCategories();
                renderTools();
            }).catch(function (e) {
                console.error('获取工具目录异常:', e);
            });
        });
        bindSearch();
    }

    init();
})();