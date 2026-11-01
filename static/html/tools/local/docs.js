(function () {
    'use strict';
    var App = window.App, Api = window.Api, Common = window.LocalToolsCommon || {};

    var state = {
        sources: [],
        currentSourceId: null,
        currentSourceName: '',
        baseUrl: '',
        tree: null,
        treeLoading: false,
        currentFile: null,
        filter: '',
        expanded: {},
        iframeLoadTimer: null
    };

    // ============ 工具 ============
    function esc(s) {
        return window.App.escapeHtml(s || '');
    }

    function notify(msg) {
        alert(msg);
    }

    // 根据文件扩展名选择图标
    function iconForFile(name) {
        var lower = (name || '').toLowerCase();
        if (/\.(md|markdown)$/.test(lower)) return '📘';
        if (/\.(html?|htm)$/.test(lower)) return '🌐';
        if (/\.(json)$/.test(lower)) return '🧩';
        if (/\.(ya?ml)$/.test(lower)) return '⚙️';
        if (/\.(xml)$/.test(lower)) return '📰';
        if (/\.(csv)$/.test(lower)) return '📊';
        if (/\.(log)$/.test(lower)) return '📜';
        if (/\.(ini|conf|cfg|toml|properties)$/.test(lower)) return '🔧';
        if (/\.(sh|bash|zsh)$/.test(lower)) return '🐚';
        if (/\.(bat|cmd|ps1)$/.test(lower)) return '🖥️';
        if (/\.(sql)$/.test(lower)) return '🗃️';
        if (/\.(txt)$/.test(lower)) return '📄';
        return '📄';
    }

    // 把 POSIX 相对路径拼到 baseUrl 后面, 每段单独 encodeURIComponent
    function buildFileUrl(baseUrl, relPath) {
        if (!baseUrl) return '';
        var segments = (relPath || '').split('/').map(function (s) { return encodeURIComponent(s); });
        return baseUrl + segments.join('/');
    }

    // ============ DOM 引用 ============
    function $iframe() { return document.getElementById('docs-content'); }
    function $loading() { return document.getElementById('docs-loading'); }
    function $empty() { return document.getElementById('docs-empty'); }

    // ============ iframe 控制 ============
    function showEmpty(show) {
        var e = $empty(); if (e) e.style.display = show ? '' : 'none';
    }
    function showLoading(show) {
        var l = $loading();
        if (l) {
            l.hidden = !show;
            // 双重保险: 即便 CSS 把 [hidden] 默认 display:none 覆盖掉, 这里也强制设 style
            l.style.display = show ? 'flex' : 'none';
        }
        var iframe = $iframe();
        if (iframe) iframe.style.visibility = show ? 'hidden' : 'visible';
        if (!show && state.iframeLoadTimer) {
            clearTimeout(state.iframeLoadTimer);
            state.iframeLoadTimer = null;
        }
    }
    function setIframeSrc(url) {
        var iframe = $iframe();
        if (!iframe) return;
        showEmpty(false);
        showLoading(true);
        // 用 about:blank 中转一下, 确保每次都能触发 load 事件
        iframe.src = 'about:blank';
        // 下一帧再设目标 URL, 避免某些浏览器合并相同 iframe 的 load 事件
        setTimeout(function () { iframe.src = url; }, 0);
        // 超时保护: 30s 内未触发 load, 强制隐藏 loading(防止一直卡在加载中)
        if (state.iframeLoadTimer) clearTimeout(state.iframeLoadTimer);
        state.iframeLoadTimer = setTimeout(function () {
            state.iframeLoadTimer = null;
            var f = $iframe();
            if (f && f.src && f.src !== 'about:blank' && f.src.indexOf('about:blank') < 0) {
                showLoading(false);
            }
        }, 30000);
    }
    function clearIframe() {
        var iframe = $iframe();
        if (iframe) iframe.src = 'about:blank';
        showLoading(false);
        showEmpty(true);
    }

    // 绑定 iframe load: 跨域 iframe 不能访问内容, 但能知道加载完成
    function bindIframeLoad() {
        var iframe = $iframe();
        if (!iframe || iframe._bound) return;
        iframe._bound = true;
        iframe.addEventListener('load', function () {
            // 忽略 about:blank
            var src = iframe.src || '';
            if (src === 'about:blank' || src.indexOf('about:blank') >= 0) return;
            showLoading(false);
        });
        // error 事件: 加载失败时强制关闭 loading
        iframe.addEventListener('error', function () {
            showLoading(false);
        });
    }

    // ============ 顶部文档源下拉 ============
    function renderToolbar() {
        var sel = document.getElementById('docs-source-select');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- 选择文档源 --</option>' +
            state.sources.map(function (s) { return '<option value="' + s.id + '"' + (s.id === state.currentSourceId ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
    }

    // ============ 源管理 ============
    function loadSources(cb) {
        Api.localTools.docs.listSources().then(function (r) {
            if (r && r.success) {
                state.sources = r.sources || [];
                if (cb) cb();
            } else {
                notify((r && r.error) || '加载文档源失败', 'error');
            }
        });
    }

    // 选中并切换(启动/重配后端内部服务)
    function selectSource(id, cb) {
        if (!id) { deselectSource(cb); return; }
        if (state.currentSourceId === id && state.baseUrl) {
            // 已选过, 直接刷树即可
            loadTree(id, cb);
            return;
        }
        Api.localTools.docs.selectSource(id).then(function (r) {
            if (!r || !r.success) {
                notify((r && r.error) || '选择文档源失败', 'error');
                if (cb) cb();
                return;
            }
            state.currentSourceId = id;
            state.baseUrl = r.baseUrl || '';
            var src = state.sources.find(function (s) { return s.id === id; });
            state.currentSourceName = r.sourceName || (src ? src.name : '');
            state.currentFile = null;
            state.expanded = {};
            state.tree = null;
            renderToolbar();
            // 选源后让 iframe 显示该服务根欢迎页
            setIframeSrc(state.baseUrl);
            loadTree(id, cb);
        }).catch(function (e) {
            notify('选择文档源异常: ' + e, 'error');
            if (cb) cb();
        });
    }

    function deselectSource(cb) {
        var wasId = state.currentSourceId;
        state.currentSourceId = null;
        state.currentSourceName = '';
        state.baseUrl = '';
        state.tree = null;
        state.currentFile = null;
        state.expanded = {};
        renderToolbar();
        renderTree();
        clearIframe();
        if (wasId) {
            Api.localTools.docs.deselectSource().catch(function () { /* 忽略 */ });
        }
        if (cb) cb();
    }

    // ============ 加载目录树 ============
    function loadTree(id, cb) {
        state.treeLoading = true;
        renderTree();
        Api.localTools.docs.getTree(id, { depth: 1 }).then(function (r) {
            state.treeLoading = false;
            if (!r || !r.success) {
                notify((r && r.error) || '加载目录树失败', 'error');
                if (cb) cb();
                return;
            }
            var t = r.tree;
            state.tree = {
                name: t.name,
                relPath: t.path || '',
                isDir: true,
                hasChildren: !!t.hasChildren,
                children: (t.children || []).map(normalizeNode),
                _loaded: true,
                _loading: false,
                _error: null
            };
            renderTree();
            if (cb) cb();
        });
    }

    function openAddSourceModal() {
        document.getElementById('docs-source-modal-title').textContent = '添加文档源';
        document.getElementById('docs-source-name').value = '';
        document.getElementById('docs-source-path').value = '';
        document.getElementById('docs-source-path-row-current').style.display = 'none';
        document.getElementById('docs-source-modal').style.display = 'flex';
        setTimeout(function () { document.getElementById('docs-source-name').focus(); }, 0);
    }

    function saveSource() {
        var name = document.getElementById('docs-source-name').value.trim();
        var path = document.getElementById('docs-source-path').value.trim();
        if (!name) return notify('请输入名称', 'error');
        if (!path) return notify('请输入目录', 'error');
        Api.localTools.docs.createSource({ name: name, path: path }).then(function (r) {
            if (r && r.success) {
                document.getElementById('docs-source-modal').style.display = 'none';
                var newId = r.id || r.sourceId;
                var wasCurrent = state.currentSourceId;
                loadSources(function () {
                    if (wasCurrent) {
                        selectSource(wasCurrent);
                    } else if (newId) {
                        selectSource(newId);
                    } else {
                        renderToolbar();
                    }
                });
            } else {
                notify((r && r.error) || '保存失败', 'error');
            }
        });
    }

    function deleteCurrentSource() {
        var id = state.currentSourceId;
        if (!id) return notify('请先选择一个文档源', 'error');
        var name = state.currentSourceName || id;
        if (!confirm('确定要删除文档源 "' + name + '" 吗？\n该操作不可恢复。')) return;
        Api.localTools.docs.removeSource(id).then(function (r) {
            if (r && r.success) {
                state.currentSourceId = null;
                state.currentSourceName = '';
                state.baseUrl = '';
                state.tree = null;
                loadSources(function () { renderToolbar(); renderTree(); showEmpty(true); });
                $iframe().src = 'about:blank';
            } else {
                notify((r && r.error) || '删除失败', 'error');
            }
        });
    }

    // ============ 目录树(按需加载) ============
    function nodeByPath(tree, relPath) {
        if (!tree) return null;
        if (!relPath) return tree;
        var parts = relPath.split('/');
        var cur = tree;
        for (var i = 0; i < parts.length && cur; i++) {
            var next = null;
            if (cur.children) {
                for (var j = 0; j < cur.children.length; j++) {
                    if (cur.children[j].relPath === parts.slice(0, i + 1).join('/')) {
                        next = cur.children[j]; break;
                    }
                }
            }
            cur = next;
        }
        return cur;
    }

    function isFileMatch(node, f) { return node.name.toLowerCase().indexOf(f) >= 0; }
    function isDirMatch(node, f) {
        if (!node.children) return node.name.toLowerCase().indexOf(f) >= 0;
        if (node._loaded) {
            for (var i = 0; i < node.children.length; i++) {
                if (matchesFilter(node.children[i])) return true;
            }
        }
        return node.name.toLowerCase().indexOf(f) >= 0;
    }
    function matchesFilter(node) {
        if (!state.filter) return true;
        var f = state.filter.toLowerCase();
        return node.isDir ? isDirMatch(node, f) : isFileMatch(node, f);
    }

    function renderNode(node, depth) {
        if (state.filter && !matchesFilter(node)) return '';
        var isDir = node.isDir;
        var key = node.relPath || '__root__';
        var expanded = !!state.expanded[key];
        var isCurrent = state.currentFile && state.currentFile.path === node.relPath;

        var chevronHtml;
        if (isDir) {
            if (node._loading) {
                chevronHtml = '<span class="tree-chevron loading" data-action="noop"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></span>';
            } else if (node._error) {
                chevronHtml = '<span class="tree-chevron" data-action="retry" title="加载失败，点击重试"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></span>';
            } else if (node._loaded && node.children && node.children.length === 0) {
                chevronHtml = '<span class="tree-chevron empty" data-action="noop"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></span>';
            } else {
                chevronHtml = '<span class="tree-chevron' + (expanded ? ' expanded' : '') + '" data-action="toggle"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></span>';
            }
        } else {
            chevronHtml = '<span class="tree-chevron empty" data-action="noop"></span>';
        }

        var icon;
        if (isDir) icon = expanded ? '📂' : '📁';
        else icon = iconForFile(node.name);

        var row = '<div class="tree-row' + (isCurrent ? ' active' : '') + '" data-path="' + esc(node.relPath || '') + '" data-isdir="' + (isDir ? '1' : '0') + '">' +
            chevronHtml +
            '<span class="tree-icon">' + icon + '</span>' +
            '<span class="tree-name">' + esc(node.name) + '</span>' +
            '</div>';

        if (isDir) {
            if (node._loaded && node.children && node.children.length === 0) {
                return '';
            }
            var childrenHtml = '';
            if (expanded || state.filter) {
                if (node._error) {
                    childrenHtml = '<div class="docs-tree-empty" style="padding:0.25rem 0.5rem">加载失败：' + esc(node._error) + '</div>';
                } else if (node._loading) {
                    childrenHtml = '<div class="docs-tree-empty" style="padding:0.25rem 0.5rem">加载中…</div>';
                } else if (node.children) {
                    childrenHtml = node.children.map(function (c) { return renderNode(c, depth + 1); }).join('');
                }
            }
            return '<div class="tree-node">' + row + '<div class="tree-children' + ((expanded || state.filter) ? '' : ' collapsed') + '">' + childrenHtml + '</div></div>';
        }
        return '<div class="tree-node">' + row + '</div>';
    }

    function renderTree() {
        var root = document.getElementById('docs-tree');
        if (!root) return;
        if (state.treeLoading) {
            root.innerHTML = '<div class="docs-tree-empty">加载中…</div>';
            return;
        }
        if (!state.tree) {
            root.innerHTML = '<div class="docs-tree-empty">请先添加一个文档源</div>';
            return;
        }
        var html = renderNode(state.tree, 0);
        if (!html) { root.innerHTML = '<div class="docs-tree-empty">没有匹配的文件</div>'; return; }
        root.innerHTML = html;
    }

    function setupTreeDelegation() {
        var root = document.getElementById('docs-tree');
        if (!root || root._bound) return;
        root._bound = true;
        root.addEventListener('click', function (e) {
            var row = e.target.closest('.tree-row');
            if (!row) return;
            var relPath = row.getAttribute('data-path') || '';
            var isDir = row.getAttribute('data-isdir') === '1';
            if (isDir) {
                toggleDir(relPath);
            } else if (relPath) {
                openFile(relPath);
            }
        });
    }

    function toggleDir(relPath) {
        var node = nodeByPath(state.tree, relPath);
        if (!node) return;
        var key = relPath || '__root__';
        if (state.expanded[key]) {
            state.expanded[key] = false;
            renderTree();
            return;
        }
        state.expanded[key] = true;
        if (node._loaded) {
            renderTree();
            return;
        }
        loadChildren(node, relPath, function () { renderTree(); });
        renderTree();
    }

    function loadChildren(node, relPath, cb) {
        node._loading = true;
        node._error = null;
        Api.localTools.docs.getTree(state.currentSourceId, { path: relPath, depth: 1 }).then(function (r) {
            node._loading = false;
            if (!r || !r.success) {
                node._error = (r && r.error) || '加载失败';
                if (cb) cb();
                return;
            }
            var t = r.tree;
            node.children = (t.children || []).map(function (c) { return normalizeNode(c); });
            node._loaded = true;
            node.hasChildren = node.children && node.children.length > 0;
            if (cb) cb();
        }).catch(function (e) {
            node._loading = false;
            node._error = String(e && e.message || e);
            if (cb) cb();
        });
    }

    function normalizeNode(n) {
        var node = {
            name: n.name,
            relPath: n.path || '',
            isDir: !!n.isDir,
            hasChildren: !!n.hasChildren,
            children: null,
            _loaded: false,
            _loading: false,
            _error: null
        };
        if (n.isDir && n.children && n.children.length > 0) {
            node.children = n.children.map(normalizeNode);
            node._loaded = true;
        }
        return node;
    }

    // ============ 文件点击 → 设置 iframe src ============
    function openFile(relPath) {
        if (!state.baseUrl) {
            notify('请先选择文档源', 'error');
            return;
        }
        state.currentFile = { path: relPath, name: relPath.split('/').pop() };
        renderTree();
        var url = buildFileUrl(state.baseUrl, relPath);
        setIframeSrc(url);
    }

    // ============ 事件绑定 ============
    function bindEvents() {
        bindIframeLoad();
        setupTreeDelegation();

        var addBtn = document.getElementById('docs-add-source');
        if (addBtn) addBtn.onclick = openAddSourceModal;

        var delBtn = document.getElementById('docs-delete-source');
        if (delBtn) delBtn.onclick = deleteCurrentSource;

        var refBtn = document.getElementById('docs-refresh');
        if (refBtn) refBtn.onclick = function () {
            var wasCurrent = state.currentSourceId;
            loadSources(function () {
                renderToolbar();
                if (wasCurrent) {
                    // 强制重新挂载(目录可能已变更)
                    state.baseUrl = '';
                    selectSource(wasCurrent);
                }
            });
        };

        var sel = document.getElementById('docs-source-select');
        if (sel) sel.onchange = function (e) {
            var v = e.target.value;
            if (v) selectSource(v);
            else deselectSource();
        };

        var saveBtn = document.getElementById('docs-source-save');
        if (saveBtn) saveBtn.onclick = saveSource;
        var browseBtn = document.getElementById('docs-source-browse');
        if (browseBtn) browseBtn.onclick = function () {
            window.FsBrowser.open({
                mode: 'dir',
                api: 'local',
                title: '选择文档源根目录',
                initialPath: document.getElementById('docs-source-path').value.trim() || '',
                onConfirm: function (p) {
                    document.getElementById('docs-source-path').value = p;
                }
            });
        };

        // 关闭按钮
        document.querySelectorAll('#docs-source-modal [data-close]').forEach(function (b) {
            b.onclick = function () {
                document.getElementById(b.closest('.br-modal').id).style.display = 'none';
            };
        });
        // 遮罩关闭
        document.querySelectorAll('.br-modal-mask').forEach(function (m) {
            m.onclick = function () { m.closest('.br-modal').style.display = 'none'; };
        });

        // 搜索过滤
        var searchTimer;
        var searchInput = document.getElementById('docs-search');
        if (searchInput) searchInput.addEventListener('input', function (e) {
            clearTimeout(searchTimer);
            var v = e.target.value;
            searchTimer = setTimeout(function () { state.filter = v.trim(); renderTree(); }, 120);
        });
    }

    // ============ 初始化 ============
    function init() {
        bindEvents();
        loadSources(function () {
            renderToolbar();
            renderTree();
            // 尝试从后端恢复已选的源(主服务在浏览器刷新时仍保留内部服务)
            Api.localTools.docs.status().then(function (r) {
                if (r && r.success && r.running && r.sourceId) {
                    // 校验: 列表里仍有该源
                    var exists = state.sources.some(function (s) { return s.id === r.sourceId; });
                    if (exists) {
                        state.currentSourceId = r.sourceId;
                        state.baseUrl = r.baseUrl;
                        state.currentSourceName = r.sourceName;
                        renderToolbar();
                        // 加载目录树
                        loadTree(r.sourceId, function () {
                            // 恢复后让 iframe 显示欢迎页
                            setIframeSrc(state.baseUrl);
                        });
                    }
                }
            }).catch(function () { /* 忽略 */ });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();