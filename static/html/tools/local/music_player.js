(function () {
    'use strict';
    var App = window.App, Api = window.Api;

    var state = {
        sources: [],
        tracks: [],           // 全部曲目
        filtered: [],         // 搜索/源过滤后的曲目（索引指向 state.tracks）
        currentSourceId: '',
        search: '',
        sortBy: '',
        sortOrder: '',
        currentIndex: -1,     // 指向 state.tracks 的索引
        isPlaying: false,
        mode: 'loop',         // 'loop' | 'one' | 'shuffle'
        lyrics: [],           // [{time, text}]
        lastActiveLyric: -1,
        fullpageOpen: false,
        userScrollingLyrics: false,
        // Web Audio 频谱
        audioCtx: null,
        analyser: null,
        sourceNode: null,
        specRafId: null
    };

    var audio = new Audio();
    audio.preload = 'metadata';

    // ===== 持久化（settings 接口）=====
    var STORAGE_KEY = 'music_player_state';
    var pendingSeek = null;   // 待恢复的播放进度（秒），元数据加载后生效

    function saveState() {
        try {
            var t = state.currentIndex >= 0 ? state.tracks[state.currentIndex] : null;
            var data = {
                sourceId: state.currentSourceId,
                trackPath: t ? t.path : '',
                currentTime: audio.currentTime || 0,
                volume: audio.volume,
                mode: state.mode,
                sortBy: state.sortBy,
                sortOrder: state.sortOrder
            };
            var payload = {};
            payload[STORAGE_KEY] = JSON.stringify(data);
            Api.settings.update(payload).catch(function () { });
        } catch (e) { /* ignore */ }
    }

    function loadState(cb) {
        Api.settings.list().then(function (data) {
            if (!data || !data.success || !data.settings) { cb(null); return; }
            var raw = data.settings[STORAGE_KEY];
            if (!raw) { cb(null); return; }
            try {
                var cfg = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                cb(cfg);
            } catch (e) { cb(null); }
        }).catch(function () { cb(null); });
    }

    var _saveTimer = null;
    function scheduleSave() {
        if (_saveTimer) return;
        _saveTimer = setTimeout(function () {
            _saveTimer = null;
            saveState();
        }, 800);
    }

    function esc(s) { return window.App.escapeHtml(s || ''); }

    // 音符 SVG 图标
    function noteSvg(w, h) {
        w = w || 16; h = h || 16;
        return '<svg viewBox="0 0 24 24" width="' + w + '" height="' + h + '" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>';
    }

    function fmtSize(bytes) {
        bytes = bytes || 0;
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    }

    function fmtTime(sec) {
        if (!isFinite(sec) || sec < 0) sec = 0;
        var m = Math.floor(sec / 60);
        var s = Math.floor(sec % 60);
        return m + ':' + (s < 10 ? '0' + s : s);
    }

    // ===== 源管理 =====
    function loadSources(cb) {
        Api.localTools.music.listSources().then(function (r) {
            if (r && r.success) {
                state.sources = r.sources || [];
                renderSourceSelect();
                if (cb) cb();
            }
        });
    }

    function renderSourceSelect() {
        var sel = document.getElementById('music-source-select');
        if (!sel) return;
        var cur = state.currentSourceId;
        var html = '<option value="">全部目录</option>';
        state.sources.forEach(function (s) {
            html += '<option value="' + s.id + '"' + (s.id === cur ? ' selected' : '') + '>' + esc(s.name) + '</option>';
        });
        sel.innerHTML = html;
    }

    function sortTracks() {
        if (!state.sortBy || !state.tracks.length) return;
        var asc = state.sortOrder !== 'desc';
        state.tracks.sort(function (a, b) {
            var cmp = 0;
            if (state.sortBy === 'name') {
                cmp = (a.title || a.name || '').localeCompare(b.title || b.name || '', 'zh');
            } else if (state.sortBy === 'size') {
                cmp = (a.size || 0) - (b.size || 0);
            } else if (state.sortBy === 'modified') {
                cmp = (a.modified || 0) - (b.modified || 0);
            }
            return asc ? cmp : -cmp;
        });
    }

    function scan(cb) {
        var list = document.getElementById('music-list');
        if (list) list.innerHTML = '<div class="music-loading">扫描中…</div>';
        Api.localTools.music.scan(state.currentSourceId || '').then(function (r) {
            if (r && r.success) {
                state.tracks = r.tracks || [];
                sortTracks();
                applyFilter();
            } else {
                if (list) list.innerHTML = '<div class="music-empty"><div class="icon">⚠️</div><p>扫描失败</p></div>';
            }
            if (cb) cb();
        }).catch(function () {
            if (list) list.innerHTML = '<div class="music-empty"><div class="icon">⚠️</div><p>扫描失败</p></div>';
            if (cb) cb();
        });
    }

    // ===== 搜索过滤 =====
    function applyFilter() {
        var kw = state.search.trim().toLowerCase();
        if (kw) {
            state.filtered = state.tracks.filter(function (t) {
                return (t.title || t.name || '').toLowerCase().indexOf(kw) >= 0 ||
                       (t.sourceName || '').toLowerCase().indexOf(kw) >= 0 ||
                       (t.dir || '').toLowerCase().indexOf(kw) >= 0;
            });
        } else {
            state.filtered = state.tracks.slice();
        }
        renderList();
        updateCount();
    }

    function updateCount() {
        var el = document.getElementById('music-count');
        if (el) el.textContent = state.filtered.length + ' 首';
    }

    // ===== 列表渲染（平铺，data-index 指向 state.tracks 真实索引）=====
    function renderList() {
        var list = document.getElementById('music-list');
        if (!list) return;
        if (state.filtered.length === 0) {
            var tip = state.tracks.length === 0 ? '没有找到音频文件' : '没有匹配的歌曲';
            list.innerHTML = '<div class="music-empty"><div class="icon">' + noteSvg(36, 36) + '</div><p>' + esc(tip) + '</p></div>';
            return;
        }
        var html = '';
        state.filtered.forEach(function (t) {
            html += renderTrack(t);
        });
        list.innerHTML = html;
    }

    function renderTrack(t) {
        var realIdx = state.tracks.indexOf(t);
        var isActive = realIdx === state.currentIndex;
        return '<div class="music-track' + (isActive ? ' active' : '') + '" data-index="' + realIdx + '">' +
            '<span class="track-icon">' + (isActive && state.isPlaying
                ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
                : noteSvg(14, 14)) + '</span>' +
            '<span class="track-title">' + esc(t.title || t.name) + '</span>' +
            '<span class="track-source">' + esc(t.sourceName || '') + '</span>' +
            '<span class="track-size">' + fmtSize(t.size) + '</span>' +
            '</div>';
    }

    // ===== 播放控制 =====
    function playTrack(index, seekTime, autoPlay) {
        if (index < 0 || index >= state.tracks.length) return;
        state.currentIndex = index;
        var t = state.tracks[index];
        pendingSeek = (typeof seekTime === 'number' && seekTime > 0) ? seekTime : null;
        audio.src = Api.localTools.music.audioUrl(t.path);
        if (autoPlay !== false) audio.play().catch(function () { /* 自动播放可能被阻止 */ });
        updateNowPlaying(t);
        loadCover(t);
        loadLyrics(t);
        renderList();
        saveState();
    }

    function updateNowPlaying(t) {
        document.getElementById('now-title').textContent = t.title || t.name;
        document.getElementById('now-source').textContent = (t.sourceName || '') + (t.dir ? ' / ' + t.dir : '');
        document.getElementById('mf-title').textContent = t.title || t.name;
        document.getElementById('mf-source').textContent = (t.sourceName || '') + (t.dir ? ' / ' + t.dir : '');
    }

    function togglePlay() {
        if (state.currentIndex < 0) {
            if (state.filtered.length > 0) {
                var realIdx = state.tracks.indexOf(state.filtered[0]);
                playTrack(realIdx);
            }
            return;
        }
        if (audio.paused) audio.play();
        else audio.pause();
    }

    function playPrev() {
        if (state.tracks.length === 0) return;
        var idx;
        if (state.mode === 'shuffle') {
            idx = Math.floor(Math.random() * state.tracks.length);
        } else {
            idx = state.currentIndex - 1;
            if (idx < 0) idx = state.tracks.length - 1;
        }
        playTrack(idx);
    }

    function playNext() {
        if (state.tracks.length === 0) return;
        var idx;
        if (state.mode === 'shuffle') {
            idx = Math.floor(Math.random() * state.tracks.length);
        } else {
            idx = state.currentIndex + 1;
            if (idx >= state.tracks.length) idx = 0;
        }
        playTrack(idx);
    }

    function cycleMode() {
        var modes = ['loop', 'one', 'shuffle'];
        var i = modes.indexOf(state.mode);
        state.mode = modes[(i + 1) % modes.length];
        updateModeIcon();
        saveState();
    }

    function updateModeIcon() {
        var svg = document.getElementById('icon-mode');
        var btn = document.getElementById('btn-mode');
        if (!svg) return;
        var title = '列表循环';
        if (state.mode === 'loop') {
            svg.innerHTML = '<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>';
            title = '列表循环';
        } else if (state.mode === 'one') {
            svg.innerHTML = '<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path><text x="12" y="14" font-size="7" fill="currentColor" stroke="none" text-anchor="middle" font-weight="bold">1</text>';
            title = '单曲循环';
        } else {
            svg.innerHTML = '<polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line>';
            title = '随机播放';
        }
        if (btn) btn.setAttribute('title', title);
    }

    // ===== 封面（底部栏 + 全屏页）=====
    function loadCover(t) {
        var url = Api.localTools.music.coverUrl(t.path);
        var cover = document.getElementById('music-cover');
        var mfCover = document.getElementById('mf-cover');
        var mfBg = document.getElementById('mf-bg');
        if (cover) cover.innerHTML = noteSvg(22, 22);
        if (mfCover) mfCover.innerHTML = noteSvg(48, 48);
        var img = new Image();
        img.onload = function () {
            if (cover) { cover.innerHTML = ''; cover.appendChild(img.cloneNode()); }
            var big = img.cloneNode();
            if (mfCover) { mfCover.innerHTML = ''; mfCover.appendChild(big); }
            if (mfBg) mfBg.style.backgroundImage = 'url("' + url + '")';
        };
        img.onerror = function () {
            if (cover) cover.innerHTML = noteSvg(22, 22);
            if (mfCover) mfCover.innerHTML = noteSvg(48, 48);
        };
        img.src = url;
    }

    // ===== 歌词（LRC 解析）=====
    function loadLyrics(t) {
        state.lyrics = [];
        state.lastActiveLyric = -1;
        renderLyrics();
        document.getElementById('music-bar-lyrics').textContent = '—';
        Api.localTools.music.lyrics(t.path).then(function (r) {
            if (r && r.success && r.text) {
                state.lyrics = parseLrc(r.text);
                renderLyrics();
            }
        }).catch(function () { /* 无歌词 */ });
    }

    function parseLrc(text) {
        var lines = text.split(/\r?\n/);
        var result = [];
        var timeRe = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var matches = [];
            var m;
            timeRe.lastIndex = 0;
            while ((m = timeRe.exec(line)) !== null) {
                matches.push(parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) / 100 : 0));
            }
            var textPart = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
            if (matches.length && textPart) {
                for (var j = 0; j < matches.length; j++) {
                    result.push({ time: matches[j], text: textPart });
                }
            }
        }
        result.sort(function (a, b) { return a.time - b.time; });
        return result;
    }

    function renderLyrics() {
        var body = document.getElementById('mf-lyrics');
        if (!body) return;
        if (state.lyrics.length === 0) {
            body.innerHTML = '<div class="mf-lyrics-empty">暂无歌词</div>';
            return;
        }
        body.innerHTML = state.lyrics.map(function (l, i) {
            return '<div class="mf-lrc-line" data-idx="' + i + '" data-time="' + l.time + '">' + esc(l.text) + '</div>';
        }).join('');
    }

    function getActiveLyricIndex() {
        var cur = audio.currentTime;
        var idx = -1;
        for (var i = 0; i < state.lyrics.length; i++) {
            if (state.lyrics[i].time <= cur) idx = i;
            else break;
        }
        return idx;
    }

    function updateLyrics() {
        if (state.lyrics.length === 0) return;
        var idx = getActiveLyricIndex();

        // 底部栏单行歌词
        var bar = document.getElementById('music-bar-lyrics');
        if (bar) bar.textContent = idx >= 0 ? state.lyrics[idx].text : '—';

        // 全屏歌词高亮与滚动（仅在非用户拖动时自动滚动）
        var body = document.getElementById('mf-lyrics');
        if (body && state.fullpageOpen) {
            var lines = body.querySelectorAll('.mf-lrc-line');
            lines.forEach(function (el) { el.classList.remove('active'); });
            if (idx >= 0 && lines[idx]) {
                lines[idx].classList.add('active');
                if (!state.userScrollingLyrics && idx !== state.lastActiveLyric) {
                    var line = lines[idx];
                    body.scrollTop = line.offsetTop - body.clientHeight / 2 + line.offsetHeight / 2;
                }
            }
        }
        state.lastActiveLyric = idx;
    }

    // ===== 全屏播放页 =====
    function openFullpage() {
        var fp = document.getElementById('music-fullpage');
        if (!fp) return;
        state.fullpageOpen = true;
        fp.style.display = 'flex';
        syncFullpagePlayState();
        state.lastActiveLyric = -1;
        updateLyrics();
        // 启动频谱动画
        startSpectrum();
    }

    function closeFullpage() {
        var fp = document.getElementById('music-fullpage');
        if (!fp) return;
        state.fullpageOpen = false;
        fp.style.display = 'none';
        stopSpectrum();
    }

    function syncFullpagePlayState() {
        var disc = document.getElementById('mf-disc');
        if (disc) disc.classList.toggle('playing', state.isPlaying);
        var playIcon = document.getElementById('mf-icon-play');
        if (playIcon) {
            playIcon.innerHTML = state.isPlaying
                ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"></path>'
                : '<path d="M8 5v14l11-7z"></path>';
        }
    }

    // ===== 频谱动画（Web Audio API）=====
    function ensureAudioGraph() {
        if ( state.audioCtx ) return;
        var AC = window.AudioContext || window.webkitAudioContext;
        if ( !AC ) return;
        state.audioCtx = new AC();
        state.sourceNode = state.audioCtx.createMediaElementSource( audio );
        state.analyser = state.audioCtx.createAnalyser();
        state.analyser.fftSize = 128;
        state.sourceNode.connect( state.analyser );
        state.analyser.connect( state.audioCtx.destination );
    }

    function startSpectrum() {
        ensureAudioGraph();
        if ( !state.audioCtx || !state.analyser ) return;
        if ( state.audioCtx.state === 'suspended' ) state.audioCtx.resume();
        if ( state.specRafId ) return;
        var canvas = document.getElementById( 'mf-spectrum' );
        if ( !canvas ) return;
        var ctx = canvas.getContext( '2d' );
        var bufferLen = state.analyser.frequencyBinCount;
        var data = new Uint8Array( bufferLen );

        function draw() {
            state.specRafId = requestAnimationFrame( draw );
            state.analyser.getByteFrequencyData( data );
            var w = canvas.width, h = canvas.height;
            ctx.clearRect( 0, 0, w, h );
            var barCount = 48;
            var step = Math.floor( bufferLen / barCount ) || 1;
            var barW = w / barCount;
            for ( var i = 0; i < barCount; i++ ) {
                var v = data[ i * step ] / 255;
                var bh = Math.max( 2, v * h * 0.95 );
                var x = i * barW;
                var grad = ctx.createLinearGradient( 0, h, 0, h - bh );
                grad.addColorStop( 0, 'rgba(120,180,255,0.9)' );
                grad.addColorStop( 1, 'rgba(180,120,255,0.9)' );
                ctx.fillStyle = grad;
                ctx.fillRect( x + 1, h - bh, barW - 2, bh );
            }
        }
        draw();
    }

    function stopSpectrum() {
        if ( state.specRafId ) {
            cancelAnimationFrame( state.specRafId );
            state.specRafId = null;
        }
        var canvas = document.getElementById( 'mf-spectrum' );
        if ( canvas ) {
            var ctx = canvas.getContext( '2d' );
            ctx.clearRect( 0, 0, canvas.width, canvas.height );
        }
    }

    // ===== 源添加弹窗 =====
    function openAddModal() {
        document.getElementById('music-source-name').value = '';
        document.getElementById('music-source-path').value = '';
        document.getElementById('music-source-modal').style.display = 'flex';
        setTimeout(function () { document.getElementById('music-source-name').focus(); }, 0);
    }

    function saveSource() {
        var name = document.getElementById('music-source-name').value.trim();
        var path = document.getElementById('music-source-path').value.trim();
        if (!name) return alert('请输入名称');
        if (!path) return alert('请选择目录');
        Api.localTools.music.createSource({ name: name, path: path }).then(function (r) {
            if (r && r.success) {
                document.getElementById('music-source-modal').style.display = 'none';
                loadSources(function () { scan(); });
            } else {
                alert((r && r.error) || '保存失败');
            }
        });
    }

    function deleteCurrentSource() {
        var sel = document.getElementById('music-source-select');
        var id = sel.value;
        if (!id) return alert('请先选择要删除的目录');
        var src = state.sources.find(function (s) { return s.id === id; });
        if (!confirm('确定删除目录 "' + (src ? src.name : '') + '" 吗？')) return;
        Api.localTools.music.removeSource(id).then(function (r) {
            if (r && r.success) {
                state.currentSourceId = '';
                loadSources(function () { scan(); });
            }
        });
    }

    // ===== 目录管理弹窗 =====
    function openManageModal() {
        document.getElementById('music-manage-modal').style.display = 'flex';
        renderManageList();
    }

    function closeManageModal() {
        document.getElementById('music-manage-modal').style.display = 'none';
    }

    // 渲染目录列表（每个目录可展开查看歌曲并加黑名单）
    function renderManageList() {
        var list = document.getElementById('mm-list');
        if (!list) return;
        list.innerHTML = '<div class="music-loading">加载中…</div>';
        // 管理界面需要查看全部歌曲（含黑名单），传 includeBlacklist=1
        Api.get('/local/music/scan?includeBlacklist=1').then(function (r) {
            if (!r || !r.success) {
                list.innerHTML = '<div class="mm-empty">加载失败</div>';
                return;
            }
            var allTracks = r.tracks || [];
            // 按 sourceId 分组
            var groups = {};
            state.sources.forEach(function (s) { groups[s.id] = { source: s, tracks: [] }; });
            allTracks.forEach(function (t) {
                if (groups[t.id]) groups[t.id].tracks.push(t);
            });
            // 加载所有黑名单
            Api.localTools.music.blacklist.list('').then(function (br) {
                var blPaths = {};
                if (br && br.success && br.items) {
                    br.items.forEach(function (it) {
                        if (!blPaths[it.sourceId]) blPaths[it.sourceId] = {};
                        blPaths[it.sourceId][it.path] = true;
                    });
                }
                renderManageListWithData(groups, blPaths);
            }).catch(function () {
                renderManageListWithData(groups, {});
            });
        }).catch(function () {
            list.innerHTML = '<div class="mm-empty">加载失败</div>';
        });
    }

    function renderManageListWithData(groups, blPaths) {
        var list = document.getElementById('mm-list');
        var ids = Object.keys(groups);
        if (ids.length === 0) {
            list.innerHTML = '<div class="mm-empty">还没有添加音乐目录，点击"添加目录"开始</div>';
            return;
        }
        var html = '';
        ids.forEach(function (sid) {
            var g = groups[sid];
            var bl = blPaths[sid] || {};
            var blCount = 0;
            g.tracks.forEach(function (t) { if (bl[t.path]) blCount++; });
            html += '<div class="mm-dir collapsed" data-sid="' + esc(sid) + '">';
            html += '<div class="mm-dir-head">';
            html += '<span class="mm-dir-chevron">▼</span>';
            html += '<span class="mm-dir-name">' + esc(g.source.name) + '</span>';
            html += '<span class="mm-dir-path">' + esc(g.source.path) + '</span>';
            html += '<span class="mm-dir-count">' + g.tracks.length + ' 首' + (blCount ? ' / ' + blCount + ' 已拉黑' : '') + '</span>';
            html += '<button class="mm-dir-del" data-del-sid="' + esc(sid) + '" title="删除目录">删除</button>';
            html += '</div>';
            html += '<div class="mm-songs">';
            if (g.tracks.length === 0) {
                html += '<div class="mm-empty" style="padding:1rem">该目录下没有音频文件</div>';
            }
            g.tracks.forEach(function (t) {
                var blocked = !!bl[t.path];
                html += '<div class="mm-song' + (blocked ? ' blacklisted' : '') + '" data-path="' + esc(t.path) + '">';
                html += '<span class="mm-song-name">' + esc(t.title || t.name) + '</span>';
                html += '<button class="mm-song-btn' + (blocked ? ' unblock' : '') + '">' + (blocked ? '移出黑名单' : '加入黑名单') + '</button>';
                html += '</div>';
            });
            html += '</div>';
            html += '</div>';
        });
        list.innerHTML = html;

        // 绑定展开/折叠
        list.querySelectorAll('.mm-dir-head').forEach(function (head) {
            head.onclick = function (e) {
                if (e.target.classList.contains('mm-dir-del')) return;
                head.parentElement.classList.toggle('collapsed');
            };
        });
        // 删除目录
        list.querySelectorAll('[data-del-sid]').forEach(function (btn) {
            btn.onclick = function (e) {
                e.stopPropagation();
                var sid = btn.getAttribute('data-del-sid');
                var src = state.sources.find(function (s) { return s.id === sid; });
                if (!confirm('确定删除目录 "' + (src ? src.name : '') + '" 及其黑名单吗？')) return;
                Api.localTools.music.removeSource(sid).then(function () {
                    // 同时清除该目录的黑名单
                    Api.localTools.music.blacklist.list(sid).then(function (br) {
                        if (br && br.success && br.items) {
                            var tasks = br.items.map(function (it) {
                                return Api.localTools.music.blacklist.remove({ sourceId: sid, path: it.path });
                            });
                            Promise.all(tasks).finally(function () {
                                state.currentSourceId = (state.currentSourceId === sid) ? '' : state.currentSourceId;
                                loadSources(function () { scan(); renderManageList(); });
                            });
                        } else {
                            state.currentSourceId = (state.currentSourceId === sid) ? '' : state.currentSourceId;
                            loadSources(function () { scan(); renderManageList(); });
                        }
                    });
                });
            };
        });
        // 黑名单切换（仅局部更新当前行，不刷新整个列表）
        list.querySelectorAll('.mm-song-btn').forEach(function (btn) {
            btn.onclick = function (e) {
                e.stopPropagation();
                var songRow = btn.closest('.mm-song');
                var dirEl = songRow.closest('.mm-dir');
                var sid = dirEl.getAttribute('data-sid');
                var path = songRow.getAttribute('data-path');
                var isBlocked = btn.classList.contains('unblock');
                var total = dirEl.querySelectorAll('.mm-song').length;

                function applyUi(blocked) {
                    songRow.classList.toggle('blacklisted', blocked);
                    btn.classList.toggle('unblock', blocked);
                    btn.textContent = blocked ? '移出黑名单' : '加入黑名单';
                    // 更新目录的拉黑数量
                    var blCount = dirEl.querySelectorAll('.mm-song.blacklisted').length;
                    var countEl = dirEl.querySelector('.mm-dir-count');
                    if (countEl) {
                        countEl.textContent = total + ' 首' + (blCount ? ' / ' + blCount + ' 已拉黑' : '');
                    }
                }

                if (isBlocked) {
                    Api.localTools.music.blacklist.remove({ sourceId: sid, path: path }).then(function () {
                        applyUi(false);
                        scan(); // 刷新主播放列表
                    });
                } else {
                    Api.localTools.music.blacklist.add({ sourceId: sid, path: path }).then(function () {
                        applyUi(true);
                        scan(); // 刷新主播放列表
                    });
                }
            };
        });
    }

    // ===== 排序菜单 =====
    function updateSortActive() {
        var menu = document.getElementById('music-sort-menu');
        if (!menu) return;
        menu.querySelectorAll('[data-sort-by]').forEach(function (item) {
            item.classList.toggle('active', item.getAttribute('data-sort-by') === state.sortBy);
        });
        menu.querySelectorAll('[data-sort-order]').forEach(function (item) {
            item.classList.toggle('active', item.getAttribute('data-sort-order') === (state.sortOrder || 'asc'));
        });
        var btn = document.getElementById('music-sort-btn');
        if (btn) btn.classList.toggle('active', !!state.sortBy);
    }

    // ===== 事件绑定 =====
    function bindEvents() {
        // 源选择
        var sel = document.getElementById('music-source-select');
        if (sel) sel.addEventListener('change', function (e) {
            state.currentSourceId = e.target.value;
            scan();
            saveState();
        });

        // 搜索
        var search = document.getElementById('music-search');
        if (search) search.addEventListener('input', function (e) {
            state.search = e.target.value;
            applyFilter();
        });

        // 目录管理 / 刷新
        document.getElementById('music-manage').onclick = openManageModal;
        document.getElementById('music-refresh').onclick = function () { scan(); };

        // 排序菜单
        var sortBtn = document.getElementById('music-sort-btn');
        var sortMenu = document.getElementById('music-sort-menu');
        if (sortBtn && sortMenu) {
            sortBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                sortMenu.classList.toggle('open');
            });
            sortMenu.addEventListener('click', function (e) {
                var item = e.target.closest('.music-sort-item');
                if (!item) return;
                var sortBy = item.getAttribute('data-sort-by');
                var sortOrder = item.getAttribute('data-sort-order');
                if (sortBy !== null) {
                    state.sortBy = sortBy;
                    if (!sortBy) state.sortOrder = '';
                }
                if (sortOrder !== null) {
                    state.sortOrder = sortOrder;
                }
                updateSortActive();
                sortMenu.classList.remove('open');
                sortTracks();
                applyFilter();
                scheduleSave();
            });
            document.addEventListener('click', function () {
                sortMenu.classList.remove('open');
            });
            updateSortActive();
        }

        // 添加目录弹窗（从管理弹窗中打开）
        document.getElementById('music-source-save').onclick = saveSource;
        document.getElementById('music-source-browse').onclick = function () {
            window.FsBrowser.open({
                mode: 'dir',
                api: 'local',
                title: '选择音乐目录',
                initialPath: document.getElementById('music-source-path').value.trim() || '',
                onConfirm: function (p) {
                    document.getElementById('music-source-path').value = p;
                    var name = document.getElementById('music-source-name').value.trim();
                    if (!name) {
                        var parts = p.replace(/\\/g, '/').split('/');
                        document.getElementById('music-source-name').value = parts[parts.length - 1] || p;
                    }
                }
            });
        };

        // 管理弹窗关闭
        document.querySelectorAll('#music-manage-modal [data-mm-close]').forEach(function (b) {
            b.onclick = closeManageModal;
        });
        document.querySelector('#music-manage-modal .br-modal-mask').onclick = closeManageModal;
        document.getElementById('mm-add').onclick = function () {
            // 保持管理弹窗打开，将添加目录弹窗置于上层
            var addModal = document.getElementById('music-source-modal');
            addModal.classList.add('on-top');
            openAddModal();
            // 保存后刷新管理弹窗列表
            var saveBtn = document.getElementById('music-source-save');
            var origOnclick = saveBtn.onclick;
            saveBtn.onclick = function () {
                saveSource();
                setTimeout(function () {
                    if (addModal.style.display === 'none') {
                        addModal.classList.remove('on-top');
                        renderManageList();
                    }
                }, 400);
            };
        };

        // 弹窗关闭（取消或点遮罩时移除 on-top 层级，管理弹窗保持打开）
        function closeAddModal() {
            var m = document.getElementById('music-source-modal');
            m.style.display = 'none';
            m.classList.remove('on-top');
        }
        document.querySelectorAll('#music-source-modal [data-close]').forEach(function (b) {
            b.onclick = closeAddModal;
        });
        document.querySelector('#music-source-modal .br-modal-mask').onclick = closeAddModal;

        // 列表点击
        var list = document.getElementById('music-list');
        if (list) list.addEventListener('click', function (e) {
            var row = e.target.closest('.music-track');
            if (row) {
                var idx = parseInt(row.getAttribute('data-index'), 10);
                if (idx === state.currentIndex) {
                    togglePlay();
                } else {
                    playTrack(idx);
                }
            }
        });

        // 底部播放控制
        document.getElementById('btn-play').onclick = togglePlay;
        document.getElementById('btn-prev').onclick = playPrev;
        document.getElementById('btn-next').onclick = playNext;
        document.getElementById('btn-mode').onclick = cycleMode;

        // 点击封面/信息打开全屏播放页
        document.getElementById('music-cover').onclick = openFullpage;
        document.getElementById('music-track-info').onclick = openFullpage;

        // 进度条（底部）
        var progress = document.getElementById('music-progress');
        progress.addEventListener('input', function () {
            if (audio.duration) {
                audio.currentTime = (progress.value / 1000) * audio.duration;
            }
        });

        // 音量（底部栏）
        var vol = document.getElementById('music-volume');
        var mfVol = document.getElementById('mf-volume');
        var volIconBar = document.getElementById('vol-icon-bar');
        var volIconMf = document.getElementById('vol-icon-mf');
        var lastVolume = 0.8;
        audio.volume = vol.value / 100;

        function setVolume(v) {
            audio.volume = v;
            vol.value = Math.round(v * 100);
            if (mfVol) mfVol.value = Math.round(v * 100);
            updateVolIcon(v);
            if (v > 0) lastVolume = v;
            scheduleSave();
        }

        // 音量图标：静音时显示带叉的喇叭（通过 CSS class 切换，避免 SVG innerHTML 兼容性问题）
        function updateVolIcon(v) {
            var muted = v <= 0;
            if (volIconBar) {
                volIconBar.classList.toggle('muted', muted);
                var w1 = volIconBar.querySelector('.vol-wave');
                var x1 = volIconBar.querySelector('.vol-x');
                if (w1) w1.style.display = muted ? 'none' : '';
                if (x1) x1.style.display = muted ? '' : 'none';
            }
            if (volIconMf) {
                volIconMf.classList.toggle('muted', muted);
                var w2 = volIconMf.querySelector('.vol-wave');
                var x2 = volIconMf.querySelector('.vol-x');
                if (w2) w2.style.display = muted ? 'none' : '';
                if (x2) x2.style.display = muted ? '' : 'none';
            }
        }

        function toggleMute() {
            if (audio.volume > 0) {
                setVolume(0);
            } else {
                setVolume(lastVolume || 0.8);
            }
        }

        if (volIconBar) volIconBar.addEventListener('click', toggleMute);
        if (volIconMf) volIconMf.addEventListener('click', toggleMute);
        vol.addEventListener('input', function () { setVolume(vol.value / 100); });
        if (mfVol) mfVol.addEventListener('input', function () { setVolume(mfVol.value / 100); });
        // 同步音量图标（init 中已恢复 audio.volume）
        updateVolIcon(audio.volume);

        // ===== 全屏播放页事件 =====
        document.getElementById('mf-close').onclick = closeFullpage;
        document.getElementById('mf-play').onclick = togglePlay;
        document.getElementById('mf-prev').onclick = playPrev;
        document.getElementById('mf-next').onclick = playNext;

        // 全屏进度条
        var mfProgress = document.getElementById('mf-progress');
        mfProgress.addEventListener('input', function () {
            if (audio.duration) {
                audio.currentTime = (mfProgress.value / 1000) * audio.duration;
            }
        });

        // 全屏歌词：点击跳转 + 拖动
        var mfLyrics = document.getElementById('mf-lyrics');
        var dragState = { dragging: false, moved: false, startY: 0, startScroll: 0 };

        mfLyrics.addEventListener('mousedown', function (e) {
            dragState.dragging = true;
            dragState.moved = false;
            dragState.startY = e.clientY;
            dragState.startScroll = mfLyrics.scrollTop;
            state.userScrollingLyrics = true;
            mfLyrics.classList.add('dragging');
        });

        document.addEventListener('mousemove', function (e) {
            if (!dragState.dragging) return;
            var dy = dragState.startY - e.clientY;
            if (Math.abs(dy) > 3) dragState.moved = true;
            mfLyrics.scrollTop = dragState.startScroll + dy;
        });

        document.addEventListener('mouseup', function (e) {
            if (!dragState.dragging) return;
            dragState.dragging = false;
            mfLyrics.classList.remove('dragging');
            // 若未拖动，视为点击跳转
            if (!dragState.moved) {
                var line = e.target.closest('.mf-lrc-line');
                if (line) {
                    var time = parseFloat(line.getAttribute('data-time'));
                    if (!isNaN(time) && audio.duration) {
                        audio.currentTime = Math.min(time, audio.duration);
                    }
                }
            }
            // 短暂延迟后恢复自动滚动，给用户看的时间
            setTimeout(function () {
                state.userScrollingLyrics = false;
            }, 3000);
        });

        // 滚轮也算用户滚动
        mfLyrics.addEventListener('wheel', function () {
            state.userScrollingLyrics = true;
            clearTimeout(mfLyrics._wheelTimer);
            mfLyrics._wheelTimer = setTimeout(function () {
                state.userScrollingLyrics = false;
            }, 3000);
        });

        // ===== audio 事件 =====
        audio.addEventListener('play', function () {
            state.isPlaying = true;
            // 确保音频图已建立并恢复（需在用户手势内）
            ensureAudioGraph();
            if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume();
            document.getElementById('icon-play').innerHTML = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"></path>';
            syncFullpagePlayState();
            renderList();
        });
        audio.addEventListener('pause', function () {
            state.isPlaying = false;
            document.getElementById('icon-play').innerHTML = '<path d="M8 5v14l11-7z"></path>';
            syncFullpagePlayState();
            renderList();
        });
        audio.addEventListener('ended', function () {
            if (state.mode === 'one') {
                audio.currentTime = 0;
                audio.play();
            } else {
                playNext();
            }
        });
        audio.addEventListener('timeupdate', function () {
            var cur = document.getElementById('time-cur');
            var total = document.getElementById('time-total');
            if (cur) cur.textContent = fmtTime(audio.currentTime);
            if (total) total.textContent = fmtTime(audio.duration);
            if (audio.duration) {
                progress.value = Math.round((audio.currentTime / audio.duration) * 1000);
                mfProgress.value = progress.value;
            }
            var mfc = document.getElementById('mf-time-cur');
            var mft = document.getElementById('mf-time-total');
            if (mfc) mfc.textContent = fmtTime(audio.currentTime);
            if (mft) mft.textContent = fmtTime(audio.duration);
            updateLyrics();
            scheduleSave();   // 节流保存播放进度
        });
        audio.addEventListener('loadedmetadata', function () {
            document.getElementById('time-total').textContent = fmtTime(audio.duration);
            document.getElementById('mf-time-total').textContent = fmtTime(audio.duration);
            // 恢复上次播放进度
            if (pendingSeek !== null && audio.duration) {
                audio.currentTime = Math.min(pendingSeek, audio.duration);
                pendingSeek = null;
            }
        });
        audio.addEventListener('pause', function () { saveState(); });
        audio.addEventListener('ended', function () { saveState(); });
        audio.addEventListener('error', function () {
            document.getElementById('now-title').textContent = '播放失败';
            document.getElementById('mf-title').textContent = '播放失败';
        });

        // 键盘快捷键
        document.addEventListener('keydown', function (e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
            else if (e.code === 'ArrowRight') { audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); }
            else if (e.code === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - 5); }
            else if (e.code === 'ArrowUp') { e.preventDefault(); setVolume(Math.min(1, audio.volume + 0.05)); }
            else if (e.code === 'ArrowDown') { e.preventDefault(); setVolume(Math.max(0, audio.volume - 0.05)); }
            else if (e.code === 'Escape') {
                if (state.fullpageOpen) closeFullpage();
                else if (document.getElementById('music-manage-modal').style.display === 'flex') closeManageModal();
            }
        });
    }

    // ===== 初始化 =====
    function init() {
        bindEvents();
        // 先恢复持久化的模式与音量（settings 接口异步）
        loadState(function (saved) {
            if (saved) {
                if (saved.mode) state.mode = saved.mode;
                if (saved.sortBy) state.sortBy = saved.sortBy;
                if (saved.sortOrder) state.sortOrder = saved.sortOrder;
                if (typeof saved.volume === 'number') {
                    audio.volume = saved.volume;
                    var volEl = document.getElementById('music-volume');
                    if (volEl) volEl.value = Math.round(saved.volume * 100);
                    var mfVolEl = document.getElementById('mf-volume');
                    if (mfVolEl) mfVolEl.value = Math.round(saved.volume * 100);
                }
                if (saved.sourceId) state.currentSourceId = saved.sourceId;
            }
            updateModeIcon();
            updateSortActive();
            loadSources(function () {
                scan(function () {
                    if (saved && saved.trackPath) {
                        var idx = state.tracks.findIndex(function (t) { return t.path === saved.trackPath; });
                        if (idx >= 0) {
                            playTrack(idx, saved.currentTime || 0, false);
                        }
                    }
                });
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();