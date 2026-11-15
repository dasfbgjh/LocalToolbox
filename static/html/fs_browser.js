// ======================================================
// 统一文件浏览器公共模块（内嵌共享文件图标库 FileIcons）
// 提供 dir / file / multi 三种选择模式，支持本机 / 自定义后端
// 用法：
//   <link rel="stylesheet" href="style.css">
//   <script src="fs_browser.js"></script>
//   FsBrowser.open({
//       mode: 'dir' | 'file' | 'multi',   // 默认 'dir'
//       api: 'local' | fn,                // 默认 'local'（本机统一浏览接口）
//       initialPath: '',                  // 初始路径
//       title: '浏览文件系统',
//       confirmLabel: '选择',             // 确认按钮文案（不填则按 mode 自动）
//       hint: '',                         // 列表栏提示
//       showSize: true,                  // 是否显示文件大小
//       multiFilter: function(entry){return true;},  // multi 模式下哪些条目可被勾选
//       onConfirm: function(selected){},  // dir/file: string；multi: entry[]
//       onCancel: function(){}
//   });
// entry 形状：{ fullPath, name, isDir, size, modified }
// ======================================================
(function (window) {
    'use strict';

    const Api = window.Api;
    const App = window.App;

    const FI = {
        folder: '<svg class="fi fi-folder" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
        image: '<svg class="fi fi-image" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
        video: '<svg class="fi fi-video" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>',
        audio: '<svg class="fi fi-audio" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
        pdf: '<svg class="fi fi-pdf" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>',
        doc: '<svg class="fi fi-doc" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
        sheet: '<svg class="fi fi-sheet" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8M8 17h8M12 13v4"/></svg>',
        slide: '<svg class="fi fi-slide" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><line x1="12" y1="16" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>',
        archive: '<svg class="fi fi-archive" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>',
        code: '<svg class="fi fi-code" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        exec: '<svg class="fi fi-exec" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="14" x2="22" y2="14"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="14" x2="4" y2="14"/></svg>',
        text: '<svg class="fi fi-text" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="11" y1="17" x2="13" y2="17"/></svg>',
        font: '<svg class="fi fi-font" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
        cert: '<svg class="fi fi-cert" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>',
        book: '<svg class="fi fi-book" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
        file: '<svg class="fi fi-file" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>'
    };
    const RULES = [
        { type: 'image', test: /^(png|jpe?g|gif|svg|webp|bmp|ico|tiff?|avif|heic)$/ },
        { type: 'video', test: /^(mp4|mov|avi|mkv|flv|webm|wmv|m4v|3gp|ts|mpg|mpeg|rmvb|vob)$/ },
        { type: 'audio', test: /^(mp3|wav|flac|aac|ogg|m4a|wma|ape|opus|aiff|mid|midi)$/ },
        { type: 'pdf', test: /^pdf$/ },
        { type: 'doc', test: /^(doc|docx|rtf|odt|wps)$/ },
        { type: 'sheet', test: /^(xls|xlsx|csv|ods|numbers|et)$/ },
        { type: 'slide', test: /^(ppt|pptx|pps|ppsx|odp|key|dps)$/ },
        { type: 'archive', test: /^(zip|rar|7z|tar|gz|bz2|xz|tgz|z|iso|cab|jar|war|ear)$/ },
        { type: 'code', test: /^(html?|css|scss|less|jsx?|tsx?|vue|svelte|py|pyw|java|class|c|h|cc|cpp|cxx|hpp|cs|go|rs|rb|php|swift|kt|kts|scala|sh|bash|zsh|bat|cmd|ps1|json|ya?ml|xml|toml|ini|conf|sql|db|lua|pl|r|dart|ex|exs|erl|hs|ml|clj|tsv)$/ },
        { type: 'exec', test: /^(exe|msi|app|dmg|apk|xapk|ipa|pkg|deb|rpm)$/ },
        { type: 'text', test: /^(txt|log|md|markdown|nfo|readme|cue|srt|ass|sub|lrc)$/ },
        { type: 'font', test: /^(ttf|otf|woff2?|eot)$/ },
        { type: 'cert', test: /^(crt|pem|cer|key|p12|pfx|der)$/ },
        { type: 'book', test: /^(epub|mobi|azw3|fb2|djvu)$/ }
    ];

    function getExt(name) {
        if (!name) return '';
        var idx = name.lastIndexOf('.');
        if (idx < 0 || idx >= name.length - 1) return '';
        return name.substring(idx + 1).toLowerCase();
    }

    function classify(name, isDir) {
        if (isDir) return 'folder';
        var ext = getExt(name);
        if (!ext) return 'file';
        for (var i = 0; i < RULES.length; i++) {
            if (RULES[i].test.test(ext)) return RULES[i].type;
        }
        return 'file';
    }

    function getIcon(name, isDir) {
        return FI[classify(name, isDir)] || FI.file;
    }

    function iconClass(name, isDir) {
        return 'fi-' + classify(name, isDir);
    }

    function esc(s) {
        if (App && App.escapeHtml) return App.escapeHtml(s == null ? '' : String(s));
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function formatSize(b) {
        if (b == null || isNaN(b)) return '-';
        if (b < 1024) return b + ' B';
        var u = ['KB', 'MB', 'GB', 'TB'];
        var i = -1;
        var n = b;
        do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
        return n.toFixed(2) + ' ' + u[i];
    }

    // 解析父级路径（支持 / 与 \ 两种分隔符）
    function parentPath(p) {
        if (!p) return '';
        var sep = p.indexOf('\\') >= 0 ? '\\' : '/';
        while (p.length > 1 && p.charAt(p.length - 1) === sep) p = p.substring(0, p.length - 1);
        // Windows 盘符根（如 "C:" 或 "C:\"）的上一级是本机根（空）
        if (sep === '\\' && /^[A-Za-z]:\\?$/.test(p)) return '';
        var idx = p.lastIndexOf(sep);
        if (idx < 0) return '';
        return p.substring(0, idx);
    }

    function resolveApi(apiOpt) {
        if (typeof apiOpt === 'function') return apiOpt;
        // 所有模式统一复用本机 /api/local-tools/fs（后端已移除独立的 admin 浏览接口）
        return function (path) { return Api.localTools.browse(path || ''); };
    }

    // 复用同一个 Collator：比逐条调用 localeCompare 快一个数量级（大目录排序更明显）
    var nameCollator = (typeof Intl !== 'undefined' && Intl.Collator) ? new Intl.Collator('zh-CN') : null;
    function compareName(a, b) {
        if (nameCollator) return nameCollator.compare(a, b);
        return a < b ? -1 : (a > b ? 1 : 0);
    }

    // 当前实例状态
    var current = null;

    function close() {
        if (!current || !current.overlay) return;
        var onCancel = current.options.onCancel;
        try { document.removeEventListener('keydown', current.keyHandler); } catch (e) { }
        if (current.overlay.parentNode) current.overlay.parentNode.removeChild(current.overlay);
        var wasCurrent = current;
        current = null;
        if (typeof onCancel === 'function' && !wasCurrent.confirmed) onCancel();
    }

    function confirm() {
        if (!current) return;
        var opt = current.options;
        var sel;
        if (opt.mode === 'multi') {
            // selected 已是跨目录全局唯一的已选集合，直接按插入顺序输出即可
            sel = Object.keys(current.selected).map(function (k) { return current.selected[k]; });
        } else if (opt.mode === 'file') {
            sel = current.selectedPath;
        } else {
            // dir
            sel = current.currentPath;
        }
        current.confirmed = true;
        if (typeof opt.onConfirm === 'function') opt.onConfirm(sel);
        close();
    }

    function buildOverlay(opt) {
        var overlay = document.createElement('div');
        overlay.className = 'fsb-overlay';

        var title = opt.title || (opt.mode === 'file' ? '选择文件' : (opt.mode === 'multi' ? '选择条目' : '选择目录'));
        var confirmLabel = opt.confirmLabel || (opt.mode === 'dir' ? '选择此目录' : (opt.mode === 'file' ? '选择此文件' : '选择'));

        var multi = opt.mode === 'multi';
        var fileMode = opt.mode === 'file';
        var showSize = opt.showSize !== false;

        var html =
            '<div class="fsb-panel">' +
            '<div class="fsb-head">' +
            '<span class="fsb-title">' + esc(title) + '</span>' +
            '<button type="button" class="btn btn-ghost btn-sm fsb-close" title="关闭">×</button>' +
            '</div>' +
            '<div class="fsb-path-row">' +
            '<input type="text" class="input fsb-path-input" placeholder="输入路径跳转 (例如 D:\\Downloads)" />' +
            '<button type="button" class="btn btn-sm" data-act="go">跳转</button>' +
            '</div>' +
            '<div class="fsb-bc"></div>';

        if (multi) {
            html +=
                '<div class="fsb-list-bar">' +
                '<label class="fsb-selectall" title="全选/取消全选"><input type="checkbox" class="fsb-sel-all"> 全选</label>' +
                '<span class="fsb-spacer"></span>' +
                '<span class="fsb-hint"></span>' +
                '</div>';
        } else if (opt.hint) {
            html += '<div class="fsb-list-bar"><span class="fsb-hint">' + esc(opt.hint) + '</span></div>';
        }

        html +=
            '<div class="fsb-list"><div class="fsb-empty">加载中...</div></div>' +
            '<div class="fsb-foot">' +
            '<span class="fsb-current">当前：-</span>' +
            '<span class="fsb-spacer"></span>' +
            '<button type="button" class="btn btn-outline" data-act="cancel">取消</button>' +
            '<button type="button" class="btn" data-act="confirm">' + esc(confirmLabel) + '</button>' +
            '</div>' +
            '</div>';

        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        // 缓存内部元素
        var panel = overlay.querySelector('.fsb-panel');
        var pathInput = overlay.querySelector('.fsb-path-input');
        var bc = overlay.querySelector('.fsb-bc');
        var list = overlay.querySelector('.fsb-list');
        var currentLabel = overlay.querySelector('.fsb-current');
        var hintLabel = overlay.querySelector('.fsb-hint');
        var selAll = overlay.querySelector('.fsb-sel-all');
        var confirmBtn = overlay.querySelector('[data-act="confirm"]');

        var state = {
            overlay: overlay,
            options: opt,
            currentPath: '',
            selectedPath: '',          // file 模式选中的文件路径
            selected: Object.create(null), // multi 模式已选条目 path->entry（跨目录全局唯一来源）
            selectedCount: 0,          // selected 的条目数（增量维护，避免反复 Object.keys）
            entriesByPath: Object.create(null), // 当前目录条目 path->entry，供事件委托回查
            checkableInDir: 0,         // 当前目录可勾选条数
            checkedInDir: 0,           // 当前目录已勾选条数
            loadToken: 0,              // 目录加载请求序号（用于丢弃过期响应）
            confirmed: false,
            panel: panel,
            pathInput: pathInput,
            bc: bc,
            list: list,
            currentLabel: currentLabel,
            hintLabel: hintLabel,
            selAll: selAll,
            confirmBtn: confirmBtn
        };

        // 行内事件统一委托到列表容器（只绑定一次），避免为每行创建多个监听器
        list.addEventListener('click', function (ev) {
            var row = ev.target.closest ? ev.target.closest('.fsb-entry') : null;
            if (!row) return;
            if (row.getAttribute('data-up') === '1') {
                loadDir(state, parentPath(state.currentPath));
                return;
            }
            // 点击 checkbox / 其 label 时交给 change 事件处理，避免重复切换
            if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'LABEL') return;
            var entry = state.entriesByPath[row.getAttribute('data-path') || ''];
            if (!entry) return;
            if (entry.isDir) {
                loadDir(state, entry.fullPath);
            } else if (opt.mode === 'file') {
                state.selectedPath = entry.fullPath;
                confirm();
            } else if (opt.mode === 'multi') {
                var cb = row.querySelector('input[data-sel]');
                if (cb && !cb.disabled) {
                    cb.checked = !cb.checked;
                    applyCheckbox(state, row, cb.checked);
                }
            }
        });
        // 双击：multi 模式下的文件 → 勾上并立即确认
        list.addEventListener('dblclick', function (ev) {
            if (opt.mode !== 'multi') return;
            var row = ev.target.closest ? ev.target.closest('.fsb-entry') : null;
            if (!row) return;
            if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'LABEL') return;
            var entry = state.entriesByPath[row.getAttribute('data-path') || ''];
            if (!entry || entry.isDir) return;
            var cb = row.querySelector('input[data-sel]');
            if (!cb || cb.disabled) return;
            if (!cb.checked) {
                cb.checked = true;
                applyCheckbox(state, row, true);
            }
            confirm();
        });
        // checkbox 勾选变化
        list.addEventListener('change', function (ev) {
            var t = ev.target;
            if (!t || t.tagName !== 'INPUT' || !t.hasAttribute('data-sel')) return;
            var row = t.closest ? t.closest('.fsb-entry') : null;
            if (!row) return;
            applyCheckbox(state, row, t.checked);
        });

        // 关闭/确认
        overlay.querySelector('.fsb-close').addEventListener('click', close);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });
        overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
        overlay.querySelector('[data-act="confirm"]').addEventListener('click', confirm);
        overlay.querySelector('[data-act="go"]').addEventListener('click', function () {
            var v = pathInput.value.trim();
            if (v) loadDir(state, v);
        });
        pathInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); var v = pathInput.value.trim(); if (v) loadDir(state, v); }
        });
        if (selAll) {
            // 严格二态切换：全选 ↔ 全不选（仅作用于当前目录可勾选项）
            // 利用浏览器点击 checkbox 后已更新的 checked 值作为 target，不再 preventDefault 自行推导
            selAll.addEventListener('click', function () {
                if (state.checkableInDir === 0) {
                    selAll.checked = false;
                    selAll.indeterminate = false;
                    return;
                }
                var target = !!selAll.checked;
                // 一次性批量同步：不逐个子项派发 change（否则每项都会触发一次全量统计，形成 O(n²)）
                var cbs = state.list.querySelectorAll('input[data-sel]');
                for (var i = 0; i < cbs.length; i++) {
                    var cb = cbs[i];
                    if (cb.disabled) continue;
                    cb.checked = target;
                    var row = cb.closest ? cb.closest('.fsb-entry') : null;
                    if (!row) continue;
                    var path = row.getAttribute('data-path') || '';
                    var entry = state.entriesByPath[path];
                    if (entry) setSelected(state, path, entry, target);
                }
                state.checkedInDir = target ? state.checkableInDir : 0;
                selAll.checked = target;
                selAll.indeterminate = false;
                updateMultiHint(state);
            });
        }

        // Esc 关闭
        state.keyHandler = function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        };
        document.addEventListener('keydown', state.keyHandler);

        return state;
    }

    function renderBreadcrumb(state) {
        var p = state.currentPath;
        var bc = state.bc;
        if (!p) {
            bc.innerHTML = '<span class="fsb-bc-root">本机</span>';
            return;
        }
        var sep = p.indexOf('\\') >= 0 ? '\\' : '/';
        var html = '<a class="fsb-bc-root" data-idx="-1">本机</a>';
        var parts = p.split(/[\\/]/);
        var lastIdx = parts.length - 1;
        parts.forEach(function (part, i) {
            if (!part) return;
            if (i === lastIdx) {
                html += '<span class="sep">›</span><span>' + esc(part) + '</span>';
            } else {
                html += '<span class="sep">›</span><a data-idx="' + i + '">' + esc(part) + '</a>';
            }
        });
        bc.innerHTML = html;
        var anchors = bc.querySelectorAll('a');
        Array.prototype.forEach.call(anchors, function (a) {
            a.addEventListener('click', function () {
                var idx = parseInt(a.getAttribute('data-idx'), 10);
                if (idx < 0) { loadDir(state, ''); return; }
                var target = parts.slice(0, idx + 1).join(sep);
                if (sep === '\\') {
                    if (!/^[A-Za-z]:/.test(target)) {
                        target = target.replace(/^\\+/, '');
                    } else if (/^[A-Za-z]:$/.test(target)) {
                        // 盘符（如 C:）需补尾反斜杠，否则后端解析为该盘符当前工作目录
                        target += '\\';
                    }
                }
                loadDir(state, target);
            });
        });
    }

    // 统一 Windows 盘符根路径：C: -> C:\
    function normalizePath(p) {
        if (!p) return '';
        if (/^[A-Za-z]:$/.test(p)) return p + '\\';
        return p;
    }

    function loadDir(state, path) {
        // 选择状态由 state.selected 全局维护，切换目录无需再合并暂存勾选

        path = normalizePath(path);
        state.currentPath = path || '';
        state.pathInput.value = state.currentPath;
        state.list.innerHTML = '<div class="fsb-empty">加载中...</div>';
        if (state.selAll) { state.selAll.checked = false; state.selAll.indeterminate = false; }

        // 请求序号：快速连续跳转时丢弃过期响应，避免旧目录结果覆盖新目录
        var token = ++state.loadToken;
        var fn = state.apiFn;
        fn(state.currentPath).then(function (data) {
            if (token !== state.loadToken) return;
            if (!data || data.success === false) {
                state.list.innerHTML = '<div class="fsb-empty">浏览失败: ' + esc((data && data.error) || '未知') + '</div>';
                return;
            }
            // 后端可能返回新解析后的路径（data.path），优先采用
            var resolvedPath = data.path || path || '';
            state.currentPath = resolvedPath;
            state.pathInput.value = resolvedPath;
            state.currentLabel.textContent = '当前：' + (resolvedPath || '本机根');
            renderBreadcrumb(state);

            var entries = data.entries || [];
            if (entries.length === 0) {
                state.list.innerHTML = '<div class="fsb-empty">空目录</div>';
                state.entriesByPath = Object.create(null);
                state.checkableInDir = 0;
                state.checkedInDir = 0;
                updateMultiHint(state);
                return;
            }
            entries.sort(function (a, b) {
                if (a.isDir && !b.isDir) return -1;
                if (!a.isDir && b.isDir) return 1;
                return compareName(a.name, b.name);
            });
            renderEntries(state, entries);
            updateMultiHint(state);
        }).catch(function (err) {
            if (token !== state.loadToken) return;
            state.list.innerHTML = '<div class="fsb-empty">浏览失败: ' + esc(String(err)) + '</div>';
        });
    }

    // 记录/移除一条选择，增量维护计数（O(1)，替代原来的 some/filter 全量扫描）
    function setSelected(state, path, entry, on) {
        if (!path) return;
        var existed = !!state.selected[path];
        if (on) {
            state.selected[path] = {
                fullPath: path,
                name: entry.name,
                isDir: !!entry.isDir,
                size: entry.size,
                modified: entry.modified || 0
            };
            if (!existed) state.selectedCount++;
        } else if (existed) {
            delete state.selected[path];
            state.selectedCount--;
        }
    }

    // 单条 checkbox 变化后的状态同步
    function applyCheckbox(state, row, checked) {
        var path = row.getAttribute('data-path') || '';
        var entry = state.entriesByPath[path];
        if (!entry) return;
        setSelected(state, path, entry, checked);
        state.checkedInDir += checked ? 1 : -1;
        if (state.checkedInDir < 0) state.checkedInDir = 0;
        if (state.checkedInDir > state.checkableInDir) state.checkedInDir = state.checkableInDir;
        updateMultiHint(state);
    }

    function renderEntries(state, entries) {
        var opt = state.options;
        var multi = opt.mode === 'multi';
        var showSize = opt.showSize !== false;

        state.entriesByPath = Object.create(null);
        state.checkableInDir = 0;
        state.checkedInDir = 0;

        // 先拼成完整 HTML 再一次性写入：避免逐行 appendChild 反复触发重排
        var html = '';
        if (state.currentPath) {
            html += '<div class="fsb-entry fsb-up" data-up="1">' +
                '<span class="fsb-icon">↩</span><span class="fsb-name">..</span><span class="fsb-size"></span></div>';
        }

        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var isDir = !!e.isDir;
            var path = e.fullPath || '';
            var checkable = multi ? (!!opt.multiFilter && !!opt.multiFilter(e)) : false;
            var checked = multi && checkable && !!state.selected[path];
            var pEsc = esc(path);

            html += '<div class="fsb-entry" data-path="' + pEsc + '" data-isdir="' + (isDir ? '1' : '0') + '">';
            if (multi) {
                if (checkable) {
                    state.checkableInDir++;
                    if (checked) state.checkedInDir++;
                }
                html += '<label class="fsb-check" title="' + (checkable ? '选中' : '不可选中') + '">' +
                    '<input type="checkbox" data-sel' + (checkable ? '' : ' disabled') + (checked ? ' checked' : '') + '></label>';
            }
            html += '<span class="fsb-icon">' + getIcon(e.name, isDir) + '</span>' +
                '<span class="fsb-name" title="' + pEsc + '">' + esc(e.name) + '</span>' +
                '<span class="fsb-size">' + (isDir ? '' : (showSize ? formatSize(e.size) : '')) + '</span>' +
                '</div>';
            state.entriesByPath[path] = e;
        }
        state.list.innerHTML = html;
        updateSelectAllState(state);
    }

    // 全选状态由计数器推导，不再每次 querySelectorAll 全表扫描
    function updateSelectAllState(state) {
        var sa = state.selAll;
        if (!sa) return;
        var total = state.checkableInDir;
        var n = state.checkedInDir;
        if (total === 0) { sa.checked = false; sa.indeterminate = false; return; }
        sa.checked = n >= total;
        sa.indeterminate = n > 0 && n < total;
    }

    function updateMultiHint(state) {
        // 仅在 multi 模式下改写确认按钮文案，避免覆盖 dir/file 模式的固定文案
        if (state.options.mode !== 'multi') return;
        if (state.confirmBtn) state.confirmBtn.textContent = '选择 (' + state.selectedCount + ')';
        updateSelectAllState(state);
    }

    function open(options) {
        if (current) close();
        var opt = options || {};
        opt.mode = opt.mode || 'dir';
        opt.api = opt.api || 'local';
        var state = buildOverlay(opt);
        state.apiFn = resolveApi(opt.api);
        current = state;

        // 初始 hint
        if (state.hintLabel && opt.hint) state.hintLabel.textContent = opt.hint;
        // multi 默认提示
        if (opt.mode === 'multi' && !opt.hint && state.hintLabel) {
            state.hintLabel.textContent = '勾选条目后点"选择"加入（可跨目录多次勾选）';
        }

        loadDir(state, opt.initialPath || '');
        return { close: close };
    }

    window.FsBrowser = {
        open: open,
        close: close,
        parentPath: parentPath,
        formatSize: formatSize,
        FileIcons: {
            classify: classify,
            getIcon: getIcon,
            iconClass: iconClass,
            getExt: getExt,
            _svg: FI
        }
    };
})(window);