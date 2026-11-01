(function () {
    'use strict';
    var App = window.App;
    var atRoot = true;           // 虚拟根：所有目录共享作为一级目录
    var currentShare = null;
    var currentPath = '';
    var currentEntries = [];
    var currentCanRename = false;
    var sortState = { key: '', order: '' };
    var isNavigating = false;
    var searchMode = false;
    var searchKeyword = '';
    var searchResults = [];
    var showHidden = false;
    var SHOW_HIDDEN_KEY = 'fileservice-show-hidden';
    var SORT_KEY = 'fileservice-sort';
    var DIR_TYPE_LABEL = '文件夹';

    function getFileIcon(name, isDir) {
        return window.FsBrowser.FileIcons.getIcon(name, isDir);
    }

    function formatSize(bytes) {
        if (!bytes || bytes <= 0) return '-';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    }

    function formatDate(iso) {
        if (!iso) return '-';
        return App.formatDistanceToNow(iso);
    }

    // ======================================================
    // 共享列表
    // ======================================================
    // 虚拟根：所有目录共享作为一级目录展示
    // ======================================================
    function loadRoot() {
        atRoot = true;
        currentShare = null;
        currentPath = '';
        currentEntries = [];
        currentCanRename = false;
        document.getElementById('browser-view').classList.remove('hidden');
        // 虚拟根：隐藏"仅在某个共享内"的工具栏元素
        hideToolbarForRoot();
        // 面包屑
        renderBreadcrumb('', true);
        // 清空上传栏（虚拟根不可上传）
        renderUploadBar({});
        // 推历史
        if (isNavigating) {
            // popstate 调用：已推过
        } else {
            pushRootHistory();
        }
        persistRootState();
        // 拉取共享列表
        Api.fileservice.list().then(function (data) {
            if (!data.success) return;
            // 仅取目录共享作为虚拟根条目
            var shares = (data.shares || []).filter(function (s) { return s.isDirectory; });
            var entries = shares.map(function (s) {
                return {
                    name: s.name,
                    isDir: true,
                    size: 0,
                    modified: 0,
                    _share: s
                };
            });
            currentEntries = entries;
            // 文件表为空时显示空状态
            var emptyEl = document.getElementById('dir-empty');
            var emptyTitle = document.getElementById('dir-empty-title');
            var emptyDesc = document.getElementById('dir-empty-desc');
            var tbody = document.getElementById('file-tbody');
            tbody.innerHTML = '';
            if (entries.length === 0) {
                if (emptyTitle) emptyTitle.textContent = '暂无可用共享';
                if (emptyDesc) emptyDesc.textContent = '请联系管理员共享文件夹';
                emptyEl.classList.remove('hidden');
            } else {
                if (emptyTitle) emptyTitle.textContent = '空文件夹';
                if (emptyDesc) emptyDesc.textContent = '此文件夹中没有内容';
                emptyEl.classList.add('hidden');
                if (sortState && sortState.key) {
                    var sorted = sortEntries(sortState.key, sortState.order);
                    renderFiles(sorted, currentCanRename);
                    updateSortIcon(sortState.key, sortState.order);
                } else {
                    renderFiles(entries, currentCanRename);
                    resetSortIcons();
                }
            }
        });
    }

    // 虚拟根：隐藏仅在某个共享内才有意义的工具栏元素
    function hideToolbarForRoot() {
        try { document.getElementById('toggle-hidden-btn').style.display = 'none'; } catch (e) { }
        try { document.getElementById('search-input').parentElement.parentElement.style.display = 'none'; } catch (e) { }
        try { document.getElementById('search-clear-btn').style.display = 'none'; } catch (e) { }
        try { document.getElementById('upload-bar').style.display = 'none'; } catch (e) { }
    }
    // 某个共享内：显示全部工具栏元素
    function showToolbarForShare() {
        try { document.getElementById('toggle-hidden-btn').style.display = ''; } catch (e) { }
        try { document.getElementById('search-input').parentElement.parentElement.style.display = ''; } catch (e) { }
        try { document.getElementById('search-clear-btn').style.display = ''; } catch (e) { }
        try { document.getElementById('upload-bar').style.display = ''; } catch (e) { }
    }

    function openShare(share) {
        currentShare = share;
        currentPath = '';
        atRoot = false;
        document.getElementById('browser-view').classList.remove('hidden');
        if (share.isDirectory) {
            loadDir('');
        } else {
            window.location.href = Api.fileservice.download(share.id);
        }
    }

    // ======================================================
    // 目录加载
    // ======================================================
    // 单调递增序列号：丢弃过期请求响应，防止快速切换时旧响应覆盖新内容
    var loadDirSeq = 0;
    function loadDir(path, replace) {
        var mySeq = ++loadDirSeq;
        currentPath = path;
        atRoot = false;
        // 进入某个共享：显示工具栏元素
        showToolbarForShare();
        if (!isNavigating) {
            if (replace) {
                pushHistoryReplace(currentShare.id, path);
            } else {
                pushHistory(currentShare.id, path);
            }
        }
        Api.fileservice.browse(currentShare.id, path, showHidden).then(function (data) {
            if (mySeq !== loadDirSeq) return; // 过期请求，直接丢弃
            if (!data.success) {
                var err = data.error || '加载失败';
                // 共享已被删除 / 无访问权限 → 回虚拟根
                if (err === '共享不存在' || err === '无访问权限') {
                    alert(err);
                    returnToRoot();
                    return;
                }
                // 目标目录在文件系统中被删除 → 跳到该共享根目录（path 非空时）或虚拟根（共享根也丢失时）
                if (err === '目标目录不存在' || err === '目录不存在') {
                    alert(err);
                    if (path) {
                        loadDir('', true);
                    } else {
                        returnToRoot();
                    }
                    return;
                }
                alert(err);
                return;
            }
            currentEntries = data.entries || [];
            currentCanRename = !!data.canRename;
            renderBreadcrumb(path);
            renderUploadBar(data);
            if (sortState && sortState.key) {
                var sorted = sortEntries(sortState.key, sortState.order);
                renderFiles(sorted, currentCanRename);
                updateSortIcon(sortState.key, sortState.order);
            } else {
                renderFiles(currentEntries, currentCanRename);
                resetSortIcons();
            }
        }).catch(function () {
            if (mySeq !== loadDirSeq) return; // 过期请求静默忽略
            alert('加载失败');
            // 网络/服务错误：尝试跳到该共享根目录以恢复
            if (currentShare) {
                if (path) loadDir('', true);
                else returnToRoot();
            }
        });
    }

    function pushRootHistory() {
        history.pushState({ atRoot: true }, '文件服务器', window.location.pathname);
    }
    function pushRootHistoryReplace() {
        history.replaceState({ atRoot: true }, '文件服务器', window.location.pathname);
    }
    function pushHistory(shareId, path) {
        if (isNavigating) return;
        var state = { shareId: shareId, path: path || '' };
        var title = currentShare ? currentShare.name : '文件服务器';
        if (path) {
            var parts = path.split(/[\/\\]/).filter(Boolean);
            title = parts[parts.length - 1] + ' - ' + title;
        }
        history.pushState(state, title, '?share=' + shareId + (path ? '&path=' + encodeURIComponent(path) : ''));
        try {
            localStorage.setItem('fileservice-state', JSON.stringify({ atRoot: false, shareId: shareId, path: path || '' }));
        } catch (e) { }
    }

    function pushHistoryReplace(shareId, path) {
        if (isNavigating) return;
        var state = { shareId: shareId, path: path || '' };
        var title = currentShare ? currentShare.name : '文件服务器';
        if (path) {
            var parts = path.split(/[\/\\]/).filter(Boolean);
            title = parts[parts.length - 1] + ' - ' + title;
        }
        history.replaceState(state, title, '?share=' + shareId + (path ? '&path=' + encodeURIComponent(path) : ''));
        try {
            localStorage.setItem('fileservice-state', JSON.stringify({ atRoot: false, shareId: shareId, path: path || '' }));
        } catch (e) { }
    }
    function persistRootState() {
        try { localStorage.setItem('fileservice-state', JSON.stringify({ atRoot: true })); } catch (e) { }
    }

    // ======================================================
    // 排序
    // ======================================================
    function getType(entry) {
        if (!entry) return '';
        if (entry.isDir) return DIR_TYPE_LABEL;
        var name = entry.name || '';
        var idx = name.lastIndexOf('.');
        if (idx <= 0 || idx >= name.length - 1) return '—';
        return name.substring(idx + 1).toLowerCase();
    }

    function readSort() {
        try {
            var raw = localStorage.getItem(SORT_KEY);
            if (!raw) return;
            var s = JSON.parse(raw);
            if (s && (s.key === 'name' || s.key === 'type' || s.key === 'size' || s.key === 'modified')
                && (s.order === 'asc' || s.order === 'desc')) {
                sortState = { key: s.key, order: s.order };
            }
        } catch (e) { }
    }

    function persistSort() {
        try {
            if (sortState && sortState.key) {
                localStorage.setItem(SORT_KEY, JSON.stringify(sortState));
            }
        } catch (e) { }
    }

    function resetSortIcons() {
        document.querySelectorAll('.file-table th').forEach(function (th) {
            th.classList.remove('sorted-asc', 'sorted-desc');
            var icon = th.querySelector('.sort-icon');
            if (icon) icon.textContent = '▲';
        });
    }

    function updateSortIcon(key, order) {
        document.querySelectorAll('.file-table th').forEach(function (th) {
            th.classList.remove('sorted-asc', 'sorted-desc');
            var icon = th.querySelector('.sort-icon');
            if (icon) icon.textContent = '▲';
        });
        var th = document.querySelector('.file-table th[data-sort="' + key + '"]');
        if (th) {
            th.classList.add(order === 'asc' ? 'sorted-asc' : 'sorted-desc');
            var icon = th.querySelector('.sort-icon');
            if (icon) icon.textContent = order === 'asc' ? '▲' : '▼';
        }
    }

    function sortEntries(key, order) {
        var dirs = currentEntries.filter(function (e) { return e.isDir; });
        var files = currentEntries.filter(function (e) { return !e.isDir; });

        var compareFn;
        if (key === 'name') {
            compareFn = function (a, b) {
                return order === 'asc'
                    ? a.name.localeCompare(b.name)
                    : b.name.localeCompare(a.name);
            };
        } else if (key === 'type') {
            // 类型排序：目录按 DIR_TYPE_LABEL，文件按扩展名（不带点的纯小写形式）
            compareFn = function (a, b) {
                var ta = a.isDir ? DIR_TYPE_LABEL : (function () {
                    var n = a.name || '';
                    var i = n.lastIndexOf('.');
                    if (i <= 0 || i >= n.length - 1) return '';
                    return n.substring(i + 1).toLowerCase();
                })();
                var tb = b.isDir ? DIR_TYPE_LABEL : (function () {
                    var n = b.name || '';
                    var i = n.lastIndexOf('.');
                    if (i <= 0 || i >= n.length - 1) return '';
                    return n.substring(i + 1).toLowerCase();
                })();
                return order === 'asc' ? ta.localeCompare(tb) : tb.localeCompare(ta);
            };
        } else if (key === 'size') {
            compareFn = function (a, b) {
                var sa = a.size || 0;
                var sb = b.size || 0;
                return order === 'asc' ? sa - sb : sb - sa;
            };
        } else if (key === 'modified') {
            compareFn = function (a, b) {
                var da = a.modified ? new Date(a.modified).getTime() : 0;
                var db = b.modified ? new Date(b.modified).getTime() : 0;
                return order === 'asc' ? da - db : db - da;
            };
        } else {
            return dirs.concat(files);
        }

        dirs.sort(compareFn);
        files.sort(compareFn);
        return dirs.concat(files);
    }

    function handleSort(key) {
        var order;
        if (sortState.key === key) {
            order = sortState.order === 'asc' ? 'desc' : 'asc';
        } else {
            order = 'asc';
        }
        sortState = { key: key, order: order };
        persistSort();
        var sorted = sortEntries(key, order);
        renderFiles(sorted, currentCanRename);
        updateSortIcon(key, order);
    }

    // ======================================================
    // 面包屑 & 返回
    // ======================================================
    function renderBreadcrumb(path, isRoot) {
        var bc = document.getElementById('breadcrumb');
        var html = '';
        if (isRoot) {
            // 虚拟根：只显示"我的文件"，无返回按钮
            html = '<span class="root-label">我的文件</span>';
            bc.innerHTML = html;
            return;
        }
        // 在某个共享内：所有节点可点击导航（我的文件 / 共享名 / 子路径）
        html = '<a data-action="root">我的文件</a>' +
            '<span class="sep">/</span>' +
            '<a data-path="">' + App.escapeHtml(currentShare.name) + '</a>';
        if (path) {
            var parts = path.split(/[\/\\]/);
            var accum = '';
            parts.forEach(function (p, i) {
                if (!p) return;
                if (accum) accum += '/';
                accum += p;
                html += '<span class="sep">/</span>';
                html += '<a data-path="' + App.escapeHtml(accum) + '">' + App.escapeHtml(p) + '</a>';
            });
        }
        bc.innerHTML = html;
        bc.querySelectorAll('a[data-path]').forEach(function (a) {
            a.addEventListener('click', function () {
                var targetPath = this.getAttribute('data-path');
                loadDir(targetPath, true);
            });
        });
        bc.querySelectorAll('a[data-action="root"]').forEach(function (a) {
            a.addEventListener('click', function () { returnToRoot(); });
        });
    }

    // ======================================================
    // 搜索
    // ======================================================
    function exitSearch() {
        searchMode = false;
        searchKeyword = '';
        searchResults = [];
        document.getElementById('search-input').value = '';
        document.getElementById('search-clear-btn').classList.add('hidden');
        document.getElementById('search-empty').classList.add('hidden');
        if (atRoot) {
            // 退出搜索回到虚拟根
            loadRoot();
            return;
        }
        renderBreadcrumb(currentPath);
        renderUploadBar({ canUpload: currentShare.canUpload, canDelete: currentShare.canDelete });
        if (sortState && sortState.key) {
            var sorted = sortEntries(sortState.key, sortState.order);
            renderFiles(sorted, currentCanRename);
            updateSortIcon(sortState.key, sortState.order);
        } else {
            renderFiles(currentEntries, currentCanRename);
            resetSortIcons();
        }
    }

    var searchSeq = 0;
    function doSearch() {
        if (atRoot || !currentShare) return; // 虚拟根下不搜索
        var keyword = document.getElementById('search-input').value.trim();
        if (!keyword) return;
        var mySeq = ++searchSeq;
        searchKeyword = keyword;
        searchMode = true;
        document.getElementById('search-clear-btn').classList.remove('hidden');
        document.getElementById('search-empty').classList.add('hidden');
        document.getElementById('dir-empty').classList.add('hidden');
        document.getElementById('file-tbody').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text-muted);">搜索中...</td></tr>';
        document.getElementById('file-table').style.display = '';

        Api.fileservice.search(currentShare.id, keyword, showHidden).then(function (data) {
            if (mySeq !== searchSeq) return; // 过期请求
            if (!data.success) {
                alert(data.error || '搜索失败');
                exitSearch();
                return;
            }
            searchResults = data.results || [];
            renderSearchResults(searchResults);
        }).catch(function () {
            if (mySeq !== searchSeq) return; // 过期请求静默忽略
            alert('搜索失败');
            exitSearch();
        });
    }

    function renderSearchResults(results) {
        var tbody = document.getElementById('file-tbody');
        var empty = document.getElementById('search-empty');
        var table = document.getElementById('file-table');
        tbody.innerHTML = '';
        if (results.length === 0) {
            table.style.display = 'none';
            empty.classList.remove('hidden');
            return;
        }
        table.style.display = '';
        empty.classList.add('hidden');

        results.forEach(function (e) {
            var tr = document.createElement('tr');
            var icon = getFileIcon(e.name, e.isDir);
            var actions = '';
            if (!e.isDir && currentShare && currentShare.canDownload) {
                actions += '<button class="btn btn-sm btn-outline" data-act="download">下载</button>';
            }
            if (currentShare && currentShare.canRename) {
                actions += '<button class="btn btn-sm btn-outline" data-act="rename">重命名</button>';
            }
            if (currentShare && currentShare.canDelete) {
                actions += '<button class="btn btn-sm btn-danger-outline" data-act="delete">删除</button>';
            }
            tr.innerHTML =
                '<td><div class="file-name"><span class="file-icon">' + icon + '</span>' +
                App.escapeHtml(e.name) + '</div>' +
                '<div class="file-path text-muted" style="font-size:12px;margin-left:24px;">' + App.escapeHtml(e.path) + '</div></td>' +
                '<td class="text-muted">' + formatSize(e.size) + '</td>' +
                '<td class="text-muted">' + formatDate(e.modified) + '</td>' +
                '<td><div class="file-actions">' + actions + '</div></td>';
            if (e.isDir) {
                tr.addEventListener('click', function () {
                    exitSearch();
                    loadDir(e.path);
                });
            }
            tr.querySelectorAll('button').forEach(function (btn) {
                btn.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    var act = this.getAttribute('data-act');
                    if (act === 'download') {
                        window.location.href = Api.fileservice.download(currentShare.id, e.path);
                    } else if (act === 'rename') {
                        var newName = prompt('请输入新名称：', e.name);
                        if (newName == null) return;
                        newName = newName.trim();
                        if (!newName || newName === e.name) return;
                        if (newName.indexOf('/') !== -1 || newName.indexOf('\\') !== -1) {
                            alert('名称不能包含路径分隔符');
                            return;
                        }
                        Api.fileservice.rename(currentShare.id, e.path, newName).then(function (res) {
                            if (res.success) doSearch();
                            else alert(res.error || '重命名失败');
                        });
                    } else if (act === 'delete') {
                        if (confirm('确定删除 "' + e.name + '" ？此操作不可恢复。')) {
                            Api.fileservice.delete(currentShare.id, e.path).then(function (res) {
                                if (res.success) doSearch();
                                else alert(res.error || '删除失败');
                            });
                        }
                    }
                });
            });
            tbody.appendChild(tr);
        });
    }

    function returnToRoot() {
        // 保留 sortState：用户对排序的偏好跨目录、跨会话保持
        searchMode = false;
        searchKeyword = '';
        searchResults = [];
        try { document.getElementById('search-input').value = ''; } catch (e) { }
        try { document.getElementById('search-clear-btn').classList.add('hidden'); } catch (e) { }
        try { document.getElementById('search-empty').classList.add('hidden'); } catch (e) { }
        try { document.getElementById('dir-empty').classList.add('hidden'); } catch (e) { }
        try { document.getElementById('file-tbody').innerHTML = ''; } catch (e) { }
        // 拉取共享列表渲染虚拟根；loadRoot 内部会设置 currentShare=null
        loadRoot();
    }

    function handlePopState(event) {
        isNavigating = true;
        var state = event.state;
        if (!state || state.atRoot) {
            returnToRoot();
            isNavigating = false;
            return;
        }
        if (!state.shareId) {
            returnToRoot();
            isNavigating = false;
            return;
        }

        if (!currentShare || currentShare.id !== state.shareId) {
            Api.fileservice.list().then(function (data) {
                if (!data.success) { isNavigating = false; return; }
                var share = (data.shares || []).find(function (s) { return s.id === state.shareId; });
                if (!share) {
                    returnToRoot();
                    isNavigating = false;
                    return;
                }
                currentShare = share;
                atRoot = false;
                document.getElementById('browser-view').classList.remove('hidden');
                loadDir(state.path || '');
                isNavigating = false;
            });
        } else {
            loadDir(state.path || '');
            isNavigating = false;
        }
    }

    // ======================================================
    // 上传弹窗（多文件、上传进度、点空白不关闭）
    // ======================================================
    var uploadQueue = []; // { id, file, status, progress, error, xhr }
    var uploadUid = 0;
    var uploadOverlay = null;
    var uploadingCount = 0;
    var completedCount = 0;

    function openUploadModal() {
        if (!currentShare) return;
        uploadQueue = [];
        uploadingCount = 0;
        completedCount = 0;

        uploadOverlay = document.createElement('div');
        uploadOverlay.className = 'modal-overlay';
        uploadOverlay.id = '__fs_upload_modal';
        uploadOverlay.innerHTML =
            '<div class="modal fs-upload-modal">' +
            '<div class="modal-header">' +
            '<span class="modal-title">⬆ 上传文件到：<span id="fs-upload-target" style="font-weight:normal;color:var(--text-muted);"></span></span>' +
            '<button class="btn btn-ghost btn-sm" data-fs-upload-close>×</button>' +
            '</div>' +
            '<div class="modal-body" style="padding:14px;">' +
            '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">' +
            '<input type="file" id="fs-upload-input" multiple style="display:none;" />' +
            '<button class="btn btn-sm" id="fs-upload-add">+ 添加文件</button>' +
            '<button class="btn btn-sm btn-outline" id="fs-upload-start">▶ 开始上传</button>' +
            '<button class="btn btn-sm btn-outline hidden" id="fs-upload-close-finish">完成</button>' +
            '<span class="text-muted" style="margin-left:auto;font-size:12px;">目录：' + (currentPath ? App.escapeHtml(currentPath) : '（根目录）') + '</span>' +
            '</div>' +
            '<div id="fs-upload-list" class="fs-upload-list">' +
            '<div class="fs-upload-empty">点击"添加文件"选择要上传的文件（可多选）</div>' +
            '</div>' +
            '</div>' +
            '</div>';

        document.body.appendChild(uploadOverlay);

        var targetEl = uploadOverlay.querySelector('#fs-upload-target');
        if (targetEl) {
            targetEl.textContent = currentShare.name + (currentPath ? ' / ' + currentPath : '');
        }

        // ===== 注意：点击空白区域（overlay）不关闭 =====
        uploadOverlay.addEventListener('click', function (e) {
            // 只允许通过"×"和"完成"按钮关闭
            if (e.target.hasAttribute('data-fs-upload-close')) {
                tryCloseUploadModal();
            }
        });

        // 选择文件
        var addBtn = uploadOverlay.querySelector('#fs-upload-add');
        var fileInput = uploadOverlay.querySelector('#fs-upload-input');
        if (addBtn && fileInput) {
            addBtn.addEventListener('click', function () { fileInput.click(); });
            fileInput.addEventListener('change', function () {
                if (fileInput.files && fileInput.files.length) {
                    for (var i = 0; i < fileInput.files.length; i++) {
                        addToUploadQueue(fileInput.files[i]);
                    }
                }
                fileInput.value = ''; // 允许再次选择同一文件
                renderUploadList();
            });
        }

        // 开始上传
        var startBtn = uploadOverlay.querySelector('#fs-upload-start');
        if (startBtn) {
            startBtn.addEventListener('click', function () {
                if (uploadQueue.length === 0) {
                    alert('请先添加文件');
                    return;
                }
                startBtn.classList.add('hidden');
                var addBtn = uploadOverlay.querySelector('#fs-upload-add');
                if (addBtn) addBtn.classList.add('hidden');
                uploadOverlay.querySelector('#fs-upload-close-finish').classList.add('hidden');
                // 依次开始上传所有 pending 的文件
                uploadQueue.forEach(function (item) {
                    if (item.status === 'pending') uploadSingle(item);
                });
            });
        }

        // 完成按钮（上传全部完成后显示）
        var finishBtn = uploadOverlay.querySelector('#fs-upload-close-finish');
        if (finishBtn) {
            finishBtn.addEventListener('click', function () { closeUploadModal(true); });
        }
    }

    function tryCloseUploadModal() {
        if (uploadingCount > 0) {
            if (!confirm('正在上传 ' + uploadingCount + ' 个文件，确认要关闭并取消上传？')) return;
            // 中止所有正在上传的
            uploadQueue.forEach(function (item) {
                if (item.controller) try { item.controller.abort(); } catch (e) { }
                if (item.xhr) try { item.xhr.abort(); } catch (e) { }
            });
        }
        closeUploadModal(uploadingCount === 0 && completedCount > 0);
    }

    function closeUploadModal(needRefresh) {
        if (uploadOverlay) {
            uploadOverlay.remove();
            uploadOverlay = null;
        }
        uploadQueue = [];
        uploadingCount = 0;
        if (needRefresh && currentShare) {
            loadDir(currentPath, true);
        }
    }

    function addToUploadQueue(file) {
        uploadUid++;
        uploadQueue.push({
            id: 'fs-upl-' + uploadUid,
            file: file,
            status: 'pending', // pending | uploading | done | error | cancelled
            progress: 0,
            error: null,
            xhr: null
        });
    }

    function renderUploadList() {
        if (!uploadOverlay) return;
        var list = uploadOverlay.querySelector('#fs-upload-list');
        if (!list) return;

        if (uploadQueue.length === 0) {
            list.innerHTML = '<div class="fs-upload-empty">点击"添加文件"选择要上传的文件（可多选）</div>';
            return;
        }

        var html = '';
        uploadQueue.forEach(function (item) {
            var f = item.file;
            var pct = Math.round(item.progress);
            var statusText = '';
            var statusClass = '';
            if (item.status === 'pending') { statusText = '等待上传'; statusClass = 'text-muted'; }
            else if (item.status === 'uploading') { statusText = '上传中... ' + pct + '%'; statusClass = ''; }
            else if (item.status === 'done') { statusText = '✓ 已完成'; statusClass = 'text-success'; }
            else if (item.status === 'error') { statusText = '✗ ' + (item.error || '上传失败'); statusClass = 'text-danger'; }
            else if (item.status === 'cancelled') { statusText = '已取消'; statusClass = 'text-muted'; }

            html +=
                '<div class="fs-upload-item" data-id="' + item.id + '">' +
                '<div class="fs-upload-item-head">' +
                '<div class="fs-upload-name-wrap"><span class="fs-upload-icon">' + getFileIcon(f.name, false) + '</span>' +
                '<span class="fs-upload-name">' + App.escapeHtml(f.name) + '</span></div>' +
                '<span class="fs-upload-status ' + statusClass + '" style="font-size:12px;">' + statusText + '</span>' +
                (item.status === 'pending'
                    ? '<button class="btn btn-sm btn-ghost btn-icon fs-upload-remove" title="移除">×</button>'
                    : '') +
                '</div>' +
                '<div class="fs-upload-meta text-muted" style="font-size:12px;">' +
                formatSize(f.size) +
                '</div>' +
                '<div class="fs-upload-progress-wrap"><div class="fs-upload-progress" style="width:' + pct + '%;"></div></div>' +
                '</div>';
        });
        list.innerHTML = html;

        // 移除按钮（仅待上传时可用）
        list.querySelectorAll('.fs-upload-remove').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = this.closest('.fs-upload-item').getAttribute('data-id');
                uploadQueue = uploadQueue.filter(function (x) { return x.id !== id; });
                renderUploadList();
            });
        });

        // 底部按钮状态更新
        var pendingCount = uploadQueue.filter(function (x) { return x.status === 'pending'; }).length;
        var doneCount = uploadQueue.filter(function (x) { return x.status === 'done' || x.status === 'error' || x.status === 'cancelled'; }).length;
        var allFinished = uploadQueue.length > 0 && pendingCount === 0 && uploadingCount === 0;
        var startBtn = uploadOverlay.querySelector('#fs-upload-start');
        var finishBtn = uploadOverlay.querySelector('#fs-upload-close-finish');
        if (startBtn) {
            startBtn.classList.toggle('hidden', pendingCount === 0 || uploadingCount > 0 || doneCount > 0);
        }
        if (finishBtn) {
            finishBtn.classList.toggle('hidden', !allFinished);
        }
    }

    function updateUploadItem(item) {
        if (!uploadOverlay) return;
        var el = uploadOverlay.querySelector('.fs-upload-item[data-id="' + item.id + '"]');
        if (!el) return;
        var pct = Math.round(item.progress);
        var statusText = '';
        var statusClass = '';
        if (item.status === 'pending') { statusText = '等待上传'; statusClass = 'text-muted'; }
        else if (item.status === 'uploading') { statusText = '上传中... ' + pct + '%'; statusClass = ''; }
        else if (item.status === 'done') { statusText = '✓ 已完成'; statusClass = 'text-success'; }
        else if (item.status === 'error') { statusText = '✗ ' + (item.error || '上传失败'); statusClass = 'text-danger'; }
        else if (item.status === 'cancelled') { statusText = '已取消'; statusClass = 'text-muted'; }

        var statusEl = el.querySelector('.fs-upload-status');
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.className = 'fs-upload-status';
            if (statusClass) statusEl.classList.add(statusClass);
            statusEl.setAttribute('style', 'font-size:12px;');
        }

        var prog = el.querySelector('.fs-upload-progress');
        if (prog) prog.style.width = pct + '%';
    }

    function uploadSingle(item) {
        if (!currentShare) return;
        item.status = 'uploading';
        item.progress = 0;
        uploadingCount++;
        renderUploadList();

        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        item.controller = controller;
        item.xhr = null;

        var xhr = new XMLHttpRequest();
        item.xhr = xhr;
        var fd = new FormData();
        fd.append('file', item.file, item.file.name);

        xhr.upload.addEventListener('progress', function (e) {
            if (e.lengthComputable) {
                item.progress = (e.loaded / e.total) * 100;
                updateUploadItem(item);
            }
        });
        xhr.addEventListener('load', function () {
            uploadingCount--;
            item.xhr = null;
            item.controller = null;
            var ok = xhr.status >= 200 && xhr.status < 300;
            if (ok) {
                item.status = 'done';
                item.progress = 100;
                completedCount++;
            } else {
                item.status = 'error';
                try { item.error = (JSON.parse(xhr.responseText).error) || ('HTTP ' + xhr.status); }
                catch (_) { item.error = 'HTTP ' + xhr.status; }
            }
            renderUploadList();
            checkAllDoneRefresh();
        });
        xhr.addEventListener('error', function () {
            uploadingCount--;
            item.xhr = null;
            item.controller = null;
            item.status = 'error';
            item.error = '网络错误';
            renderUploadList();
            checkAllDoneRefresh();
        });
        xhr.addEventListener('abort', function () {
            uploadingCount--;
            item.xhr = null;
            item.controller = null;
            item.status = 'cancelled';
            item.error = '已取消';
            renderUploadList();
            checkAllDoneRefresh();
        });
        if (controller) {
            controller.signal.addEventListener('abort', function () { try { xhr.abort(); } catch (_) { } });
        }
        xhr.open('POST', Api.fileservice.uploadPath(currentShare.id, currentPath, item.file.size));
        xhr.send(fd);
    }

    function checkAllDoneRefresh() {
        if (uploadingCount === 0) {
            var pendingLeft = uploadQueue.filter(function (x) { return x.status === 'pending'; }).length;
            if (pendingLeft === 0 && currentShare) {
                loadDir(currentPath, true);
            }
        }
    }

    // ======================================================
    // 上传工具栏按钮
    // ======================================================
    function renderUploadBar(data) {
        var bar = document.getElementById('upload-bar');
        var html = '';
        if (data.canUpload) {
            html += '<button class="btn btn-sm" id="upload-btn">⬆ 上传文件</button>';
        }
        bar.innerHTML = html;
        var upBtn = document.getElementById('upload-btn');
        if (upBtn) {
            upBtn.addEventListener('click', function () { openUploadModal(); });
        }
    }

    // ======================================================
    // 文件列表渲染（按扩展名显示不同图标）
    // ======================================================
    function renderFiles(entries, canRename) {
        var tbody = document.getElementById('file-tbody');
        var empty = document.getElementById('dir-empty');
        var table = document.getElementById('file-table');
        tbody.innerHTML = '';
        if (entries.length === 0) {
            table.style.display = 'none';
            empty.classList.remove('hidden');
            return;
        }
        table.style.display = '';
        empty.classList.add('hidden');

        entries.forEach(function (e) {
            var tr = document.createElement('tr');
            var childPath = currentPath ? currentPath + '/' + e.name : e.name;
            var icon = getFileIcon(e.name, e.isDir);
            var actions = '';
            // 虚拟根下的共享条目：只允许进入；无下载/重命名/删除操作
            if (e._share) {
                // 无操作按钮
            } else {
                if (!e.isDir && currentShare && currentShare.canDownload) {
                    actions += '<button class="btn btn-sm btn-outline" data-act="download">下载</button>';
                }
                if (canRename) {
                    actions += '<button class="btn btn-sm btn-outline" data-act="rename">重命名</button>';
                }
                if (currentShare && currentShare.canDelete) {
                    actions += '<button class="btn btn-sm btn-danger-outline" data-act="delete">删除</button>';
                }
            }
            var typeStr = getType(e);
            var typeCls = e.isDir ? 'file-type dir-type' : 'file-type';
            tr.innerHTML =
                '<td><div class="file-name"><span class="file-icon">' + icon + '</span>' +
                App.escapeHtml(e.name) + '</div></td>' +
                '<td><span class="' + typeCls + '" title="' + App.escapeHtml(typeStr) + '">' + App.escapeHtml(typeStr) + '</span></td>' +
                '<td class="text-muted">' + formatSize(e.size) + '</td>' +
                '<td class="text-muted">' + formatDate(e.modified) + '</td>' +
                '<td><div class="file-actions">' + actions + '</div></td>';
            if (e.isDir) {
                tr.addEventListener('click', function () {
                    if (e._share) {
                        // 虚拟根下的共享条目：进入该共享
                        openShare(e._share);
                    } else {
                        loadDir(childPath);
                    }
                });
            }
            tr.querySelectorAll('button').forEach(function (btn) {
                btn.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    var act = this.getAttribute('data-act');
                    if (act === 'download') {
                        window.location.href = Api.fileservice.download(currentShare.id, childPath);
                    } else if (act === 'rename') {
                        doRename(childPath, e.name);
                    } else if (act === 'delete') {
                        if (confirm('确定删除 "' + e.name + '" ？此操作不可恢复。')) {
                            Api.fileservice.delete(currentShare.id, childPath).then(function (res) {
                                if (res.success) loadDir(currentPath, true);
                                else alert(res.error || '删除失败');
                            });
                        }
                    }
                });
            });
            tbody.appendChild(tr);
        });
    }

    function doRename(path, oldName) {
        var newName = prompt('请输入新名称：', oldName);
        if (newName == null) return;
        newName = newName.trim();
        if (!newName || newName === oldName) return;
        if (newName.indexOf('/') !== -1 || newName.indexOf('\\') !== -1) {
            alert('名称不能包含路径分隔符');
            return;
        }
        Api.fileservice.rename(currentShare.id, path, newName).then(function (res) {
            if (res.success) {
                loadDir(currentPath, true);
            } else {
                alert(res.error || '重命名失败');
            }
        });
    }

    // ======================================================
    // 切换隐藏文件显示
    // ======================================================
    function readShowHidden() {
        try {
            var v = localStorage.getItem(SHOW_HIDDEN_KEY);
            showHidden = v === '1' || v === 'true';
        } catch (e) { showHidden = false; }
    }

    function persistShowHidden() {
        try { localStorage.setItem(SHOW_HIDDEN_KEY, showHidden ? '1' : '0'); } catch (e) { }
    }

    function applyToggleButton() {
        var btn = document.getElementById('toggle-hidden-btn');
        if (!btn) return;
        if (showHidden) {
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
        } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-pressed', 'false');
        }
    }

    function toggleShowHidden() {
        showHidden = !showHidden;
        persistShowHidden();
        applyToggleButton();
        // 重新加载当前视图
        if (searchMode) {
            doSearch();
        } else if (currentShare) {
            loadDir(currentPath, true);
        }
    }

    // ======================================================
    // 初始化
    // ======================================================
    readShowHidden();
    applyToggleButton();
    readSort();

    history.replaceState({ atRoot: true }, '文件服务器', window.location.pathname);

    // URL 参数 ?share=<id>：从管理页"打开"按钮进入，自动定位到指定共享
    var urlParams = new URLSearchParams(window.location.search);
    var urlShareId = urlParams.get('share');
    var urlPath = urlParams.get('path') || '';

    if (urlShareId) {
        // URL 参数优先
        Api.fileservice.list().then(function (data) {
            if (!data.success) { loadRoot(); return; }
            var share = (data.shares || []).find(function (s) { return s.id === urlShareId; });
            if (share) {
                openShare(share);
                if (urlPath) loadDir(urlPath, true);
            } else {
                // 共享不存在，回退到虚拟根
                loadRoot();
            }
        });
    } else {
        try {
            var saved = localStorage.getItem('fileservice-state');
            if (saved) {
                var state = JSON.parse(saved);
                if (state && state.shareId) {
                    Api.fileservice.list().then(function (data) {
                        if (!data.success) { loadRoot(); return; }
                        var share = (data.shares || []).find(function (s) { return s.id === state.shareId; });
                        if (share) {
                            openShare(share);
                            if (state.path) loadDir(state.path, true);
                        } else {
                            // 保存的共享已被删除：回到虚拟根
                            loadRoot();
                        }
                    });
                } else {
                    // 保存的状态是 atRoot 或老格式 {}，显示虚拟根
                    loadRoot();
                }
            } else {
                // 首次进入：虚拟根
                loadRoot();
            }
        } catch (e) { loadRoot(); }
    }

    window.addEventListener('popstate', handlePopState);
    document.querySelectorAll('.file-table th.sortable').forEach(function (th) {
        th.addEventListener('click', function () {
            var key = this.getAttribute('data-sort');
            if (key) handleSort(key);
        });
    });

    var searchBtn = document.getElementById('search-btn');
    var searchInput = document.getElementById('search-input');
    var searchClearBtn = document.getElementById('search-clear-btn');
    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    if (searchInput) {
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
        });
    }
    if (searchClearBtn) searchClearBtn.addEventListener('click', exitSearch);

    var toggleHiddenBtn = document.getElementById('toggle-hidden-btn');
    if (toggleHiddenBtn) toggleHiddenBtn.addEventListener('click', toggleShowHidden);
})();