
(function () {
    'use strict';

    // ===== Teams state (clipboard self-contained) =====
    var TEAMS_STORAGE_KEY = 'clipboard-teams-storage';
    var teams = [];
    var currentTeam = null;

    function loadTeamsState() {
        try {
            var raw = localStorage.getItem(TEAMS_STORAGE_KEY);
            if (!raw) return;
            var s = JSON.parse(raw);
            teams = s.teams || [];
            currentTeam = s.currentTeam || null;
        } catch (e) { /* ignore */ }
    }
    function saveTeamsState() {
        localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify({
            teams: teams,
            currentTeam: currentTeam
        }));
    }
    function setTeams(t) {
        teams = t || [];
        saveTeamsState();
    }
    function setCurrentTeam(t) {
        currentTeam = t || null;
        saveTeamsState();
        window.dispatchEvent(new CustomEvent('team-changed', { detail: t }));
    }
    loadTeamsState();

    // ===== Clipboard items state =====
    var items = [];
    var lastUpdateTime = null;
    var lastItemCount = 0;
    var isSyncing = false;
    var pollTimer = null;
    var copiedId = null;

    var grid = document.getElementById('items-grid');
    var emptyState = document.getElementById('empty-state');
    var pasteBtn = document.getElementById('paste-btn');
    var uploadBtn = document.getElementById('upload-btn');
    var fileInput = document.getElementById('file-input');
    var hintEl = document.getElementById('hint');
    var teamToggleBtn = document.getElementById('team-toggle-btn');

    // Team management variables
    var inviteRefreshTimer = null;
    var currentInviteTeamId = null;

    function escapeHtml(s) { return App.escapeHtml(s); }

    function canPaste() {
        var team = currentTeam;
        if (!team) return false;
        // 已登录用户不能在默认团队粘贴; 未登录用户只能在默认团队粘贴
        return !App.isAuthenticated() || !team.isDefault;
    }

    function updateHint() {
        var team = currentTeam;
        var teamEl = document.getElementById('current-team');
        if (!team) {
            hintEl.textContent = '';
            if (teamEl) teamEl.textContent = '-';
            return;
        }
        if (App.isAuthenticated() && team.isDefault) {
            hintEl.textContent = '请选择一个团队进行粘贴';
        } else {
            hintEl.textContent = '支持粘贴文本、图片、HTML内容';
        }
        if (teamEl) {
            teamEl.textContent = team.name;
        }
        pasteBtn.disabled = !canPaste();
        uploadBtn.disabled = !canPaste();
    }

    function typeInfo(type) {
        switch (type) {
            case 'image': return { label: '图片', cls: 'image' };
            case 'html': return { label: 'HTML', cls: 'html' };
            case 'file': return { label: '文件', cls: 'file' };
            default: return { label: '文本', cls: 'text' };
        }
    }

    function renderContent(item) {
        if (item.type === 'image' && item.content) {
            return '<div class="content-image"><div class="content-image-inner"><img src="' + escapeHtml(item.content) + '" alt="粘贴的图片" /></div></div>';
        }
        if (item.type === 'html' && item.htmlContent) {
            return '<div class="content-html"><div class="content-html-inner">' + item.htmlContent + '</div></div>';
        }
        if (item.type === 'text' && item.content) {
            return '<div class="content-text">' + escapeHtml(item.content) + '</div>';
        }
        if (item.type === 'file') {
            var sizeStr = item.fileSize ? (item.fileSize / 1024).toFixed(2) + ' KB' : '';
            return '<div class="content-file">' +
                '<div class="text-primary" style="font-size:1.5rem;">📄</div>' +
                '<div class="flex-1">' +
                '<div class="font-medium truncate">' + escapeHtml(item.fileName || '') + '</div>' +
                '<div class="text-xs text-muted">' + escapeHtml(sizeStr) + '</div>' +
                '</div>' +
                '</div>';
        }
        return '';
    }

    // 复制成功图标（绿色勾）
    var CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#22c55e"><polyline points="20 6 9 17 4 12" /></svg>';
    // 复制图标（两个重叠矩形）
    var COPY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>';

    function setCopyBtnIcon(btn, isCopied) {
        if (!btn) return;
        btn.innerHTML = isCopied ? CHECK_SVG : COPY_SVG;
    }

    function renderItem(item) {
        var info = typeInfo(item.type);
        var who = (item.createdBy && (item.createdBy.nickname || item.createdBy.email)) || '匿名';
        var time = App.formatDistanceToNow(item.createdAt);
        var actions = '';
        if (item.type !== 'file') {
            var copyIcon = copiedId === item.id ? CHECK_SVG : COPY_SVG;
            actions += '<button class="btn btn-ghost btn-sm btn-icon" data-copy="' + escapeHtml(item.id) + '" title="复制到剪贴板">' + copyIcon + '</button>';
        }
        actions += '<button class="btn btn-ghost btn-sm btn-icon" data-download="' + escapeHtml(item.id) + '" title="下载"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></button>';
        actions += '<button class="btn btn-ghost btn-sm btn-icon btn-danger" data-delete="' + escapeHtml(item.id) + '" title="删除"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#ef4444"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg></button>';

        return '<div class="clipboard-item type-' + info.cls + '" data-item-id="' + escapeHtml(item.id) + '">' +
            '<div class="item-header">' +
            '<span class="type-badge ' + info.cls + '">' + info.label + '</span>' +
            '<div class="item-actions">' + actions + '</div>' +
            '</div>' +
            renderContent(item) +
            '<div class="item-meta">' +
            '<span class="truncate">' + escapeHtml(who) + '</span>' +
            '<span>•</span><span>' + escapeHtml(time) + '</span>' +
            '</div>' +
            '</div>';
    }

    function render() {
        if (!currentTeam) {
            grid.innerHTML = '';
            emptyState.classList.remove('hidden');
            emptyState.innerHTML = '<div><div class="icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg></div><h3>请选择一个团队</h3>' +
                '<p class="mb-4">登录用户需要在团队中才能使用粘贴板</p>';
            return;
        }
        if (!items.length) {
            grid.innerHTML = '';
            emptyState.classList.remove('hidden');
            emptyState.innerHTML = '<div><div class="icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="11" width="13" height="11" rx="2" ry="2" /><path d="M5 11H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" /><path d="M18 15H6" /></svg></div><h3>暂无内容</h3><p>粘贴或上传文件到剪贴板</p></div>';
            return;
        }
        emptyState.classList.add('hidden');
        var sorted = items.slice().sort(function (a, b) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        grid.innerHTML = sorted.map(renderItem).join('');

        // Bind actions
        grid.querySelectorAll('[data-copy]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-copy');
                var item = items.find(function (i) { return i.id === id; });
                if (item) handleCopy(item);
            });
        });
        grid.querySelectorAll('[data-download]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-download');
                var item = items.find(function (i) { return i.id === id; });
                if (item) handleDownload(item);
            });
        });
        grid.querySelectorAll('[data-delete]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-delete');
                handleDelete(id);
            });
        });
    }

    function addItem(item) {
        if (items.find(function (i) { return i.id === item.id; })) return;
        items.unshift(item);
        render();
    }
    function removeItem(id) {
        items = items.filter(function (i) { return i.id !== id; });
        render();
    }

    // ===== Fetching =====
    function fetchFullItems(teamId) {
        return Api.clipboard.list(teamId).then(function (data) {
            if (!data.success) return;
            items = data.items || [];
            lastUpdateTime = data.latestTime || null;
            lastItemCount = items.length;
            render();
        });
    }

    function fetchIncrementalItems(teamId) {
        if (!lastUpdateTime) return fetchFullItems(teamId);
        return Api.clipboard.list(teamId, null, true).then(function (cd) {
            if (!cd.success) return;
            if (cd.count < lastItemCount) { return fetchFullItems(teamId); }
            if (cd.count === lastItemCount) return;
            return Api.clipboard.list(teamId, lastUpdateTime).then(function (data) {
                if (!data.success) return;
                (data.items || []).forEach(function (it) {
                    if (!items.find(function (i) { return i.id === it.id; })) items.unshift(it);
                });
                lastUpdateTime = data.latestTime || lastUpdateTime;
                lastItemCount = cd.count;
                render();
            });
        }).catch(function () { return fetchFullItems(teamId); });
    }

    function startPolling(teamId) {
        stopPolling();
        pollTimer = setInterval(function () {
            if (isSyncing) return;
            isSyncing = true;
            fetchIncrementalItems(teamId).then(function () { isSyncing = false; });
        }, 5000);
    }
    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    function switchToTeam(team) {
        items = [];
        lastUpdateTime = null;
        lastItemCount = 0;
        render();
        updateHint();
        if (team) {
            fetchFullItems(team.id);
            startPolling(team.id);
        } else {
            stopPolling();
        }
    }

    // ===== Actions =====
    function handlePasteFromClipboard() {
        if (!canPaste()) return;
        pasteBtn.disabled = true;
        pasteBtn.textContent = ' 粘贴中...';

        if (!navigator.clipboard) {
            openManualInput();
            pasteBtn.disabled = false;
            pasteBtn.innerHTML = '<span>📋</span><span>粘贴</span>';
            return;
        }

        var teamId = currentTeam.id;
        var handled = false;

        function createTextItem(text) {
            if (!text || !text.trim()) return Promise.resolve();
            return Api.clipboard.create({
                teamId: teamId,
                type: 'text',
                content: text,
                mimeType: 'text/plain'
            }).then(function (data) {
                if (data.success) { addItem(data.item); handled = true; }
                else { alert(data.error || '粘贴失败'); }
            });
        }

        function tryReadRich() {
            if (!navigator.clipboard.read) return Promise.resolve(false);
            return navigator.clipboard.read().then(function (clipboardItems) {
                var chain = Promise.resolve(false);
                clipboardItems.forEach(function (ci) {
                    chain = chain.then(function (found) {
                        if (found) return true;
                        var imageTypes = ci.types.filter(function (t) { return t.startsWith('image/'); });
                        if (imageTypes.length > 0) {
                            var it = imageTypes[0];
                            return ci.getType(it).then(function (blob) {
                                return readAsDataURL(blob);
                            }).then(function (base64) {
                                return Api.clipboard.create({
                                    teamId: teamId,
                                    type: 'image',
                                    content: base64,
                                    mimeType: it
                                }).then(function (data) {
                                    if (data.success) { addItem(data.item); handled = true; }
                                    return true;
                                });
                            });
                        }
                        if (ci.types.indexOf('text/html') !== -1) {
                            var htmlP = ci.getType('text/html').then(function (b) { return b.text(); });
                            var textP = ci.types.indexOf('text/plain') !== -1 ? ci.getType('text/plain').then(function (b) { return b.text(); }) : Promise.resolve('');
                            return htmlP.then(function (html) {
                                return textP.then(function (txt) {
                                    return Api.clipboard.create({
                                        teamId: teamId,
                                        type: 'html',
                                        content: txt,
                                        htmlContent: html,
                                        mimeType: 'text/html'
                                    }).then(function (data) {
                                        if (data.success) { addItem(data.item); handled = true; }
                                        return true;
                                    });
                                });
                            });
                        }
                        if (ci.types.indexOf('text/plain') !== -1) {
                            return ci.getType('text/plain').then(function (b) { return b.text(); }).then(function (text) {
                                if (text && text.trim()) {
                                    return createTextItem(text).then(function () { return true; });
                                }
                                return false;
                            });
                        }
                        return false;
                    });
                });
                return chain.then(function () { return handled; });
            }).catch(function () { return false; });
        }

        tryReadRich().then(function (richHandled) {
            if (!richHandled) {
                return navigator.clipboard.readText().then(function (text) {
                    if (!handled) {
                        return createTextItem(text);
                    }
                }).catch(function () {
                    openManualInput();
                });
            }
        }).catch(function () {
            return navigator.clipboard.readText().then(function (text) {
                return createTextItem(text);
            }).catch(function () {
                openManualInput();
            });
        }).then(function () {
            pasteBtn.disabled = false;
            pasteBtn.innerHTML = '<span>📋</span><span>粘贴</span>';
        });
    }

    function readAsDataURL(blob) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function openManualInput() {
        var html = '<div class="space-y-4">' +
            '<div><label>内容</label><textarea id="manual-text" class="textarea" placeholder="请输入要粘贴的内容..."></textarea></div>' +
            '</div>';
        App.openModal('手动输入内容', html,
            '<button class="btn btn-outline" data-modal-close>取消</button><button class="btn" id="manual-submit">提交</button>');
        var ta = document.getElementById('manual-text');
        ta.focus();
        document.getElementById('manual-submit').addEventListener('click', function () {
            var text = ta.value;
            if (!text.trim()) return;
            var btn = this;
            btn.disabled = true;
            Api.clipboard.create({
                teamId: currentTeam.id,
                type: 'text', content: text, mimeType: 'text/plain'
            }).then(function (data) {
                if (data.success) { addItem(data.item); App.closeModal(); }
                else { alert(data.error || '提交失败'); }
            }).then(function () { btn.disabled = false; });
        });
    }

    function handleFileUpload(e) {
        var file = e.target.files && e.target.files[0];
        if (!file || !canPaste()) return;
        uploadBtn.disabled = true;
        uploadBtn.textContent = ' 上传中...';

        var fd = new FormData();
        fd.append('file', file);

        Api.clipboard.upload(currentTeam.id, fd).then(function (data) {
            if (data.success) addItem(data.item);
            else alert(data.error || '上传失败');
        }).catch(function () { alert('上传失败'); })
            .then(function () {
                uploadBtn.disabled = false;
                uploadBtn.innerHTML = '<span>⬆</span><span>粘贴文件</span>';
                fileInput.value = '';
            });
    }

    function handleCopy(item) {
        var btn = grid.querySelector('[data-copy="' + escapeHtml(item.id) + '"]');
        var done = function () {
            copiedId = item.id;
            setCopyBtnIcon(btn, true);
            setTimeout(function () {
                if (copiedId === item.id) {
                    copiedId = null;
                    setCopyBtnIcon(btn, false);
                }
            }, 2000);
        };
        try {
            if (item.type === 'html' && item.htmlContent) {
                var htmlBlob = new Blob([item.htmlContent], { type: 'text/html' });
                var textBlob = new Blob([item.content || item.htmlContent], { type: 'text/plain' });
                var data = [new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })];
                navigator.clipboard.write(data).then(done).catch(function () {
                    navigator.clipboard.writeText(item.content || item.htmlContent).then(done).catch(function () { });
                });
            } else if (item.type === 'image' && item.content) {
                var base64 = item.content.split(',')[1];
                var bin = atob(base64);
                var arr = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                var blob = new Blob([arr], { type: item.mimeType || 'image/png' });
                var d = [new ClipboardItem({})];
                var mtype = item.mimeType || 'image/png';
                var obj = {}; obj[mtype] = blob;
                navigator.clipboard.write([new ClipboardItem(obj)]).then(done).catch(function () {
                    navigator.clipboard.writeText(item.content).then(done).catch(function () { });
                });
            } else if (item.type === 'text' && item.content) {
                navigator.clipboard.writeText(item.content).then(done).catch(function () { });
            }
        } catch (err) {
            if (item.content) {
                navigator.clipboard.writeText(item.content).then(done).catch(function () { });
            }
        }
    }

    function handleDownload(item) {
        if (item.type === 'file' && item.fileUrl) {
            Api.clipboard.download(item.id).then(function (data) {
                if (data.success && data.downloadUrl) {
                    window.location.href = data.downloadUrl;
                } else { alert(data.error || '生成下载链接失败'); }
            });
        } else if (item.type === 'image' && item.content) {
            var base64 = item.content.split(',')[1];
            var bin = atob(base64);
            var arr = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            var blob = new Blob([arr], { type: item.mimeType || 'image/png' });
            var url = URL.createObjectURL(blob);
            triggerDownload(url, 'image-' + item.id + '.' + (item.mimeType || 'image/png').split('/')[1]);
            URL.revokeObjectURL(url);
        } else if (item.type === 'text' && item.content) {
            var tb = new Blob([item.content], { type: 'text/plain' });
            var tu = URL.createObjectURL(tb);
            triggerDownload(tu, 'text-' + item.id + '.txt');
            URL.revokeObjectURL(tu);
        } else if (item.type === 'html' && item.htmlContent) {
            var hb = new Blob([item.htmlContent], { type: 'text/html' });
            var hu = URL.createObjectURL(hb);
            triggerDownload(hu, 'html-' + item.id + '.html');
            URL.revokeObjectURL(hu);
        }
    }

    function triggerDownload(url, filename) {
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function handleDelete(id) {
        Api.clipboard.delete(id).then(function (data) {
            if (data.success) removeItem(id);
            else alert(data.error || '删除失败');
        });
    }

    // ===== Init =====
    function initApp() {
        Api.auth.me().then(function (me) {
            if (me.success) {
                App.setUser(me.user);
                return Api.teams.list().then(function (td) {
                    if (td.success) {
                        setTeams(td.teams);
                        var userTeams = td.teams.filter(function (t) { return !t.isDefault; });
                        if (userTeams.length > 0) {
                            // Keep persisted current team if still valid, else use first
                            var cur = currentTeam;
                            if (!cur || !userTeams.find(function (t) { return t.id === cur.id; })) {
                                setCurrentTeam(userTeams[0]);
                            } else {
                                // refresh stored team data
                                setCurrentTeam(userTeams.find(function (t) { return t.id === cur.id; }));
                            }
                        } else {
                            setCurrentTeam(null);
                        }
                    }
                });
            } else {
                // Anonymous user - load default team only
                return Api.teams.list(true).then(function (td) {
                    if (td.success && td.teams && td.teams.length) {
                        setTeams(td.teams);
                        setCurrentTeam(td.teams[0]);
                    }
                });
            }
        }).then(function () {
            updateHint();
            switchToTeam(currentTeam);
        });
    }

    // Listen for team changes
    window.addEventListener('team-changed', function (e) {
        switchToTeam(e.detail);
    });

    // ===== Team Management Functions (Modal) =====
    function openTeamModal() {
        var modalTeams = (teams || []).filter(function (t) { return !t.isDefault; });
        var modalCurrentTeam = currentTeam;

        var html = '<div class="team-modal-content px-4">' +
            '<div class="grid-2 gap-6 mb-6" style="font-size: 14px;">' +
            '<div class="card">' +
            '<div class="card-header" style="padding: 8px 12px;"><div class="card-title" style="font-size: 14px;">创建新团队</div></div>' +
            '<div class="card-content space-y-3" style="padding: 12px;">' +
            '<input id="modal-new-team-name" class="input" placeholder="团队名称" style="font-size: 13px; padding: 8px 10px;" />' +
            '<button class="btn w-full" id="modal-create-team-btn" disabled style="font-size: 13px; padding: 8px;">创建团队</button>' +
            '</div></div>' +
            '<div class="card">' +
            '<div class="card-header" style="padding: 8px 12px;"><div class="card-title" style="font-size: 14px;">加入团队</div></div>' +
            '<div class="card-content space-y-3" style="padding: 12px;">' +
            '<input id="modal-join-code" class="input" placeholder="输入邀请码" style="font-size: 13px; padding: 8px 10px;" />' +
            '<div id="modal-join-error" class="error-box hidden"></div>' +
            '<button class="btn w-full" id="modal-join-team-btn" disabled style="font-size: 13px; padding: 8px;">加入团队</button>' +
            '</div></div>' +
            '</div>' +
            '<div class="mb-6 mt-6">' +
            '<h3 class="text-sm font-medium mb-3">我的团队</h3>' +
            '<div id="modal-teams-list" class="space-y-2 max-h-64 overflow-y-auto">' +
            (modalTeams.length ? '' : '<div class="text-sm text-muted text-center py-4">还没有加入任何团队</div>') +
            '</div>' +
            '</div>' +
            '</div>';

        App.openModal('团队管理', html, null, 'modal-lg');

        if (modalTeams.length) {
            renderModalTeams(modalTeams, modalCurrentTeam);
        }

        // Bind modal buttons
        document.getElementById('modal-create-team-btn').addEventListener('click', function () {
            var name = document.getElementById('modal-new-team-name').value.trim();
            if (!name) return;
            var btn = this;
            btn.disabled = true;
            Api.teams.create(name).then(function (data) {
                if (data.success) {
                    document.getElementById('modal-new-team-name').value = '';
                    refreshModalTeams();
                } else { alert(data.error || '创建团队失败'); }
            }).then(function () { btn.disabled = false; });
        });

        document.getElementById('modal-join-team-btn').addEventListener('click', function () {
            var code = document.getElementById('modal-join-code').value.trim();
            if (!code) return;
            var errBox = document.getElementById('modal-join-error');
            errBox.classList.add('hidden');
            var btn = this;
            btn.disabled = true;
            Api.teams.join(code).then(function (data) {
                if (data.success) {
                    document.getElementById('modal-join-code').value = '';
                    document.getElementById('modal-join-team-btn').disabled = true;
                    refreshModalTeams();
                } else {
                    errBox.textContent = data.error || '加入团队失败';
                    errBox.classList.remove('hidden');
                }
            }).then(function () { btn.disabled = false; });
        });

        // Input validation
        document.getElementById('modal-new-team-name').addEventListener('input', function () {
            var btn = document.getElementById('modal-create-team-btn');
            btn.disabled = !this.value.trim();
        });

        document.getElementById('modal-join-code').addEventListener('input', function () {
            var btn = document.getElementById('modal-join-team-btn');
            btn.disabled = !this.value.trim();
        });
    }

    function renderModalTeams(teams, currentTeam) {
        var list = document.getElementById('modal-teams-list');
        var html = '';
        teams.forEach(function (t) {
            var isOwner = t.role === 'owner';
            var isCurrent = currentTeam && currentTeam.id === t.id;
            html += '<div class="card p-4 mb-2">' +
                '<div class="flex items-center justify-between">' +
                '<div class="flex items-center space-x-3">' +
                '<div style="width: 40px; height: 40px; border-radius: 50%; background: #8b5cf6; display: flex; align-items: center; justify-content: center;">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />' +
                '</svg>' +
                '</div>' +
                '<div>' +
                '<div class="font-medium">' + escapeHtml(t.name) + (isOwner ? ' 👑' : '') + '</div>' +
                '<div class="text-xs text-muted">' + (t.memberCount || 0) + ' 成员</div>' +
                '</div>' +
                '</div>' +
                '<div class="flex items-center space-x-3">' +
                (isOwner ? '<button class="btn btn-outline btn-xs" style="padding: 4px 10px; font-size: 12px; display: flex; align-items: center; gap: 4px; border-radius: 4px;" data-invite="' + escapeHtml(t.id) + '" data-name="' + escapeHtml(t.name) + '">' +
                    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>' +
                    '邀请' +
                    '</button>' : '') +
                '<button class="btn btn-outline btn-xs" style="padding: 4px 10px; font-size: 12px; display: flex; align-items: center; gap: 4px; border-radius: 4px;" data-toggle="' + escapeHtml(t.id) + '">' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>' +
                '成员' +
                '</button>' +
                '<button class="btn btn-primary btn-xs" style="padding: 4px 12px; font-size: 12px; border-radius: 4px;" data-use="' + escapeHtml(t.id) + '">使用此团队</button>' +
                (isOwner
                    ? '<button class="btn btn-ghost btn-xs btn-danger" style="padding: 4px;" data-disband="' + escapeHtml(t.id) + '" title="解散">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />' +
                    '</svg>' +
                    '</button>'
                    : '<button class="btn btn-ghost btn-xs btn-danger" style="padding: 4px;" data-leave="' + escapeHtml(t.id) + '" title="退出">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />' +
                    '</svg>' +
                    '</button>') +
                '</div>' +
                '</div>' +
                '<div class="members-list hidden mt-3 pt-3 border-t border-gray-200" id="members-' + escapeHtml(t.id) + '"></div>' +
                '</div>';
        });
        list.innerHTML = html;

        // Bind team actions
        list.querySelectorAll('[data-use]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var tid = btn.getAttribute('data-use');
                var team = teams.find(function (t) { return t.id === tid; });
                if (team) {
                    setCurrentTeam(team);
                    App.closeModal();
                }
            });
        });

        list.querySelectorAll('[data-invite]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                openInviteModal(btn.getAttribute('data-invite'), btn.getAttribute('data-name'));
            });
        });

        list.querySelectorAll('[data-disband]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (!confirm('确定要解散此团队吗？此操作不可恢复。')) return;
                var tid = btn.getAttribute('data-disband');
                Api.teams.delete(tid).then(function (data) {
                    if (data.success) { refreshModalTeams(); }
                    else { alert(data.error || '解散团队失败'); }
                });
            });
        });

        list.querySelectorAll('[data-leave]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var tid = btn.getAttribute('data-leave');
                Api.teams.leave(tid).then(function (data) {
                    if (data.success) { refreshModalTeams(); }
                    else { alert(data.error || '退出团队失败'); }
                });
            });
        });

        list.querySelectorAll('[data-toggle]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var tid = btn.getAttribute('data-toggle');
                var membersList = document.getElementById('members-' + tid);
                var icon = btn.querySelector('svg');
                if (membersList.classList.contains('hidden')) {
                    membersList.classList.remove('hidden');
                    icon.innerHTML = '<polyline points="18 15 12 9 6 15"/>';
                    loadTeamMembers(tid);
                } else {
                    membersList.classList.add('hidden');
                    icon.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
                }
            });
        });
    }

    function loadTeamMembers(teamId) {
        Api.teams.members(teamId).then(function (data) {
            if (data.success && data.members) {
                var list = document.getElementById('members-' + teamId);
                var html = '<div style="padding-left: 4px;">' +
                    '<div style="font-size: 12px; font-weight: 500; color: #64748b; margin-bottom: 8px;">成员列表</div>' +
                    '<div class="space-y-1">';
                data.members.forEach(function (m) {
                    var initial = m.email.charAt(0).toUpperCase();
                    html += '<div style="display: flex; align-items: center; gap: 12px; padding: 8px 10px; background: var(--bg-muted); border-radius: 6px;">' +
                        '<div style="width: 28px; height: 28px; border-radius: 50%; background: #8b5cf6; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 500;">' + initial + '</div>' +
                        '<span style="font-size: 13px;">' + escapeHtml(m.email) + '</span>' +
                        (m.role === 'owner' ? ' 👑' : '') +
                        '</div>';
                });
                html += '</div>';
                list.innerHTML = html;
            }
        });
    }

    function refreshModalTeams() {
        Api.teams.list().then(function (td) {
            if (td.success) {
                setTeams(td.teams || []);
                var teams = (td.teams || []).filter(function (t) { return !t.isDefault; });
                renderModalTeams(teams, currentTeam);
            }
        });
    }

    function openInviteModal(teamId, teamName) {
        currentInviteTeamId = teamId;
        Api.teams.inviteCode(teamId).then(function (data) {
            if (!data.success) { alert(data.error || '生成邀请码失败'); return; }

            var overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.id = '__invite_modal';
            overlay.innerHTML =
                '<div class="modal" style="width: 360px; height: auto; max-height: 80vh;">' +
                '<div class="modal-header" style="padding: 12px 16px;">' +
                '<span class="modal-title" style="font-size: 14px;">邀请加入 ' + escapeHtml(teamName) + '</span>' +
                '<button class="btn btn-ghost btn-sm" data-modal-close>×</button>' +
                '</div>' +
                '<div class="modal-body" style="padding: 16px;">' +
                '<div style="background: var(--bg-muted); border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 12px;">' +
                '<code style="font-size: 28px; font-weight: 600; color: var(--secondary); letter-spacing: 4px;">' + escapeHtml(data.inviteCode) + '</code>' +
                '</div>' +
                '<p style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px; text-align: center;">弹窗关闭后邀请码将失效</p>' +
                '<button class="btn btn-outline w-full" id="copy-code" style="border-radius: 6px; padding: 10px;">复制邀请码</button>' +
                '</div>' +
                '</div>';
            document.body.appendChild(overlay);

            overlay.addEventListener('click', function (e) {
                if (e.target === overlay || e.target.hasAttribute('data-modal-close')) {
                    closeInviteModal(teamId);
                }
            });

            document.getElementById('copy-code').addEventListener('click', function () {
                var input = document.createElement('input');
                input.value = data.inviteCode;
                document.body.appendChild(input);
                input.select();
                try {
                    document.execCommand('copy');
                    var btn = document.getElementById('copy-code');
                    btn.textContent = '已复制';
                    btn.classList.add('btn-success');
                    setTimeout(function () {
                        btn.textContent = '复制邀请码';
                        btn.classList.remove('btn-success');
                    }, 2000);
                } catch (e) { alert('复制失败'); }
                document.body.removeChild(input);
            });

            if (inviteRefreshTimer) clearInterval(inviteRefreshTimer);
            inviteRefreshTimer = setInterval(function () {
                if (currentInviteTeamId !== teamId) { clearInterval(inviteRefreshTimer); return; }
                Api.teams.refreshInvite(teamId).then(function (rd) {
                    if (!rd.success) { closeInviteModal(teamId); return; }
                    var codeEl = document.querySelector('#__invite_modal code');
                    if (codeEl) codeEl.textContent = rd.inviteCode;
                }).catch(function () { closeInviteModal(teamId); });
            }, 3000);
        });
    }

    function closeInviteModal(teamId) {
        var inviteModal = document.getElementById('__invite_modal');
        if (inviteModal) inviteModal.remove();
        if (inviteRefreshTimer) { clearInterval(inviteRefreshTimer); inviteRefreshTimer = null; }
        if (teamId) {
            Api.teams.cancelInvite(teamId);
        }
        currentInviteTeamId = null;
    }

    document.addEventListener('click', function (e) {
        if (e.target.hasAttribute('data-modal-close') || e.target.classList.contains('modal-overlay')) {
            if (currentInviteTeamId) {
                closeInviteModal(currentInviteTeamId);
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }, true);

    // Bind team management button to open modal
    teamToggleBtn.addEventListener('click', openTeamModal);

    pasteBtn.addEventListener('click', handlePasteFromClipboard);
    uploadBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', handleFileUpload);

    initApp();
})();
