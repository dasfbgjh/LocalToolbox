// ===== 备忘录模块：列表 + Markdown 编辑器 =====
(function () {
    'use strict';

    // -------- HTML 转义（用于 textarea 内容） --------
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // 新建但未保存的草稿使用这个本地 id，不落库
    var DRAFT_ID = '__draft__';

    // -------- 状态 --------
    var state = {
        memos: [],
        currentId: null,
        draft: null,
        editing: false,
        dirty: false,
        filter: '',
        undoStack: [],
        redoStack: [],
        maxUndoSteps: 50
    };

    // -------- DOM --------
    function ensureModal() {
        if (document.getElementById('memo-modal')) return;
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = './memo.css';
        document.head.appendChild(css);

        var div = document.createElement('div');
        div.className = 'memo-modal';
        div.id = 'memo-modal';
        div.hidden = true;
        div.innerHTML = [
            '<div class="memo-panel" role="dialog" aria-label="备忘录">',
            '  <div class="memo-head">',
            '    <h3><span class="memo-icon">📝</span><span id="memo-head-title">备忘录</span></h3>',
            '    <button class="icon-btn" id="memo-close" title="关闭">✕</button>',
            '  </div>',
            '  <div class="memo-body">',
            '    <div class="memo-list">',
            '      <div class="memo-list-head">',
            '        <div class="memo-search-wrap">',
            '          <svg class="memo-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
            '            <circle cx="11" cy="11" r="7"></circle>',
            '            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
            '          </svg>',
            '          <input type="text" class="br-input" id="memo-search" placeholder="搜索标题/内容">',
            '        </div>',
            '        <button class="icon-btn icon-btn-primary" id="memo-new" title="新建">＋</button>',
            '      </div>',
            '      <div class="memo-list-items" id="memo-list-items"></div>',
            '    </div>',
            '    <div class="memo-view" id="memo-view">',
            '      <div class="memo-view-empty">选择左侧条目，或点击 ＋ 新建</div>',
            '    </div>',
            '  </div>',
            '</div>',
            // 删除确认
            '<div class="memo-confirm" id="memo-confirm" hidden>',
            '  <div class="memo-confirm-box">',
            '    <p id="memo-confirm-msg">确定要删除这条备忘录吗？</p>',
            '    <div class="actions">',
            '      <button class="btn btn-outline" id="memo-confirm-cancel">取消</button>',
            '      <button class="btn btn-primary" id="memo-confirm-ok" style="background:var(--danger,#e74c3c);border-color:var(--danger,#e74c3c);">删除</button>',
            '    </div>',
            '  </div>',
            '</div>',
            // 未保存修改确认（保存 / 不保存 / 取消）
            '<div class="memo-confirm" id="memo-unsaved" hidden>',
            '  <div class="memo-confirm-box">',
            '    <p id="memo-unsaved-msg">当前内容已修改，是否保存？</p>',
            '    <div class="actions">',
            '      <button class="btn btn-outline" id="memo-unsaved-cancel">取消</button>',
            '      <button class="btn btn-outline" id="memo-unsaved-discard">不保存</button>',
            '      <button class="btn btn-primary" id="memo-unsaved-save">保存</button>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('\n');
        document.body.appendChild(div);
        bindModalEvents();
    }

    var dom = {};
    function bindDom() {
        dom = {
            modal: document.getElementById('memo-modal'),
            confirm: document.getElementById('memo-confirm'),
            unsaved: document.getElementById('memo-unsaved'),
            listItems: document.getElementById('memo-list-items'),
            view: document.getElementById('memo-view'),
            search: document.getElementById('memo-search'),
            newBtn: document.getElementById('memo-new'),
            closeBtn: document.getElementById('memo-close'),
            confirmOk: document.getElementById('memo-confirm-ok'),
            confirmCancel: document.getElementById('memo-confirm-cancel'),
            confirmMsg: document.getElementById('memo-confirm-msg'),
            unsavedSave: document.getElementById('memo-unsaved-save'),
            unsavedDiscard: document.getElementById('memo-unsaved-discard'),
            unsavedCancel: document.getElementById('memo-unsaved-cancel'),
            unsavedMsg: document.getElementById('memo-unsaved-msg')
        };
    }

    function bindModalEvents() {
        bindDom();
        dom.closeBtn.addEventListener('click', closeModal);
        dom.newBtn.addEventListener('click', function () { createNew(); });
        dom.search.addEventListener('input', function () {
            state.filter = dom.search.value.toLowerCase();
            renderList();
        });
        dom.confirmCancel.addEventListener('click', function () { dom.confirm.hidden = true; });
        // 点击空白不关闭（仅关闭按钮 / Esc / 删除确认中的取消）
        document.addEventListener('keydown', function (e) {
            if (dom.modal.hidden) return;
            if (e.key === 'Escape') {
                if (!dom.confirm.hidden) { dom.confirm.hidden = true; return; }
                closeModal();
            }
        });
    }

    // -------- 行为 --------
    function isDraft(id) { return id === DRAFT_ID; }
    function findMemo(id) {
        if (isDraft(id)) return state.draft;
        return state.memos.find(function (x) { return x.id === id; });
    }
    function discardDraft() {
        if (!state.draft) return;
        state.draft = null;
        if (isDraft(state.currentId)) state.currentId = null;
    }
    // 丢弃草稿并立刻刷新列表，避免列表里残留未保存的条目
    function dropDraftAndRefresh() {
        if (!state.draft) return;
        discardDraft();
        if (dom.listItems) renderList();
    }
    function openModal() {
        ensureModal();
        bindDom();
        dom.modal.hidden = false;
        dom.search.value = state.filter;
        loadList();
    }
    function closeModal() {
        ensureExitEditing(function (choice) {
            if (choice === 'cancel') return;
            discardDraft();
            state.currentId = null;
            state.editing = false;
            var panel = dom.modal.querySelector('.memo-panel');
            if (panel) panel.classList.remove('memo-editing');
            dom.modal.hidden = true;
        });
    }
    function loadList() {
        Api.localTools.memos.list().then(function (data) {
            if (data && data.success) {
                state.memos = data.memos || [];
                if (state.currentId && !isDraft(state.currentId) &&
                    !state.memos.some(function (m) { return m.id === state.currentId; })) {
                    state.currentId = null;
                }
                renderList();
                renderView();
            } else {
                dom.listItems.innerHTML = '<div class="memo-empty">加载失败: ' + window.App.escapeHtml((data && data.error) || '未知') + '</div>';
            }
        }).catch(function (err) {
            dom.listItems.innerHTML = '<div class="memo-empty">加载失败: ' + window.App.escapeHtml(String(err)) + '</div>';
        });
    }
    function renderList() {
        var items = state.memos.slice();
        if (state.draft) items.unshift(state.draft);
        if (!items.length) {
            dom.listItems.innerHTML = '<div class="memo-empty">还没有备忘录<br>点击 ＋ 创建</div>';
            return;
        }
        var filter = state.filter;
        var html = '';
        items.forEach(function (m) {
            var draft = isDraft(m.id);
            if (filter && !draft) {
                var t = (m.title || '').toLowerCase();
                var c = (m.content || '').toLowerCase();
                if (t.indexOf(filter) < 0 && c.indexOf(filter) < 0) return;
            }
            var title = m.title || (draft ? '新备忘录（未保存）' : '（无标题）');
            var preview = (m.content || '').replace(/^#+\s*/gm, '').replace(/[*`>]/g, '').replace(/\n+/g, ' ').trim();
            if (preview.length > 80) preview = preview.substring(0, 80) + '…';
            var updated = draft ? '未保存' : formatTime(m.updated_at);
            html += '<div class="memo-item' + (m.id === state.currentId ? ' active' : '') + '" data-id="' + window.App.escapeHtml(m.id) + '">';
            html += '  <div class="memo-item-body" data-act="open">';
            html += '    <div class="memo-item-title' + (m.title ? '' : ' untitled') + '">' + window.App.escapeHtml(title) + '</div>';
            if (preview) html += '    <div class="memo-item-preview">' + window.App.escapeHtml(preview) + '</div>';
            html += '    <div class="memo-item-meta">' + window.App.escapeHtml(updated) + '</div>';
            html += '  </div>';
            html += '  <div class="memo-item-actions">';
            html += '    <button class="memo-item-btn" data-act="edit" title="编辑"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
            html += '    <button class="memo-item-btn memo-item-btn-danger" data-act="delete" title="删除"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
            html += '  </div>';
            html += '</div>';
        });
        dom.listItems.innerHTML = html || '<div class="memo-empty">没有匹配条目</div>';
        Array.prototype.forEach.call(dom.listItems.querySelectorAll('.memo-item'), function (el) {
            var id = el.getAttribute('data-id');
            el.querySelector('[data-act="open"]').addEventListener('click', function () {
                if (id === state.currentId) return;
                ensureExitEditing(function (choice) {
                    if (choice === 'cancel') return;
                    state.currentId = id;
                    state.editing = false;
                    state.dirty = false;
                    state.undoStack = [];
                    state.redoStack = [];
                    renderList();
                    renderView();
                });
            });
            var editBtn = el.querySelector('[data-act="edit"]');
            if (editBtn) editBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (id === state.currentId && state.editing) return;
                ensureExitEditing(function (choice) {
                    if (choice === 'cancel') return;
                    state.currentId = id;
                    state.editing = true;
                    state.dirty = false;
                    state.undoStack = [];
                    state.redoStack = [];
                    renderList();
                    renderView();
                    var ta = document.getElementById('memo-content');
                    if (ta) { ta.focus(); }
                });
            });
            var delBtn = el.querySelector('[data-act="delete"]');
            if (delBtn) delBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                // 草稿未落库，直接丢弃即可
                if (isDraft(id)) {
                    discardDraft();
                    state.editing = false;
                    state.dirty = false;
                    state.undoStack = [];
                    state.redoStack = [];
                    renderList();
                    renderView();
                    return;
                }
                var prevId = state.currentId;
                state.currentId = id;
                confirmDelete(function () {
                    state.currentId = prevId;
                });
            });
        });
    }
    function renderView() {
        var panel = dom.modal.querySelector('.memo-panel');
        if (!state.currentId) {
            panel.classList.remove('memo-editing');
            dom.view.innerHTML = '<div class="memo-view-empty">从左侧选择条目，或点击 ＋ 新建</div>';
            return;
        }
        var m = findMemo(state.currentId);
        if (!m) {
            panel.classList.remove('memo-editing');
            dom.view.innerHTML = '<div class="memo-view-empty">条目不存在</div>';
            return;
        }
        if (state.editing) {
            panel.classList.add('memo-editing');
            renderEditorView(m);
        } else {
            panel.classList.remove('memo-editing');
            renderPreviewView(m);
        }
    }
    function renderPreviewView(m) {
        var titleVal = m.title || '（无标题）';
        var updated = formatTime(m.updated_at);
        dom.view.innerHTML = [
            '<div class="memo-view-head">',
            '  <h2 class="memo-view-title">' + window.App.escapeHtml(titleVal) + '</h2>',
            '  <span class="memo-view-meta">更新于 ' + window.App.escapeHtml(updated) + '</span>',
            '</div>',
            '<div class="memo-preview-scroll">',
            '  <div class="memo-preview memo-preview-rendered" id="memo-preview"></div>',
            '</div>'
        ].join('\n');
        var preview = document.getElementById('memo-preview');
        if (m.content && m.content.trim()) {
            preview.innerHTML = marked.parse(m.content);
        } else {
            preview.innerHTML = '<div class="memo-preview-empty">（空内容）</div>';
        }
    }
    function renderEditorView(m) {
        var titleVal = m.title || '';
        var contentVal = m.content || '';
        var updated = formatTime(m.updated_at);
        dom.view.innerHTML = [
            '<div class="memo-view-head">',
            '  <input type="text" class="br-input memo-title-input" id="memo-title-input" placeholder="标题（留空显示为 无标题）" value="' + escapeAttr(titleVal) + '">',
            '  <span class="memo-view-meta">更新于 ' + window.App.escapeHtml(updated) + '</span>',
            '  <span class="memo-toast" id="memo-toast" hidden></span>',
            '  <div class="memo-view-actions">',
            '    <button class="btn btn-outline" id="memo-back">返回</button>',
            '    <button class="btn btn-primary" id="memo-save">保存</button>',
            '  </div>',
            '</div>',
            '<div class="memo-md-toolbar" id="memo-md-toolbar" role="toolbar" aria-label="Markdown 工具栏">',
            '  <button type="button" class="memo-md-btn" data-md-action="h1" title="一级标题">H1</button>',
            '  <button type="button" class="memo-md-btn" data-md-action="h2" title="二级标题">H2</button>',
            '  <button type="button" class="memo-md-btn" data-md-action="h3" title="三级标题">H3</button>',
            '  <span class="memo-md-sep"></span>',
            '  <button type="button" class="memo-md-btn" data-md-action="bold" title="粗体 **text**"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg></button>',
            '  <button type="button" class="memo-md-btn" data-md-action="italic" title="斜体 *text*"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>',
            '  <button type="button" class="memo-md-btn" data-md-action="strike" title="删除线 ~~text~~"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg></button>',
            '  <span class="memo-md-sep"></span>',
            '  <button type="button" class="memo-md-btn" data-md-action="quote" title="引用 >"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/></svg></button>',
            '  <button type="button" class="memo-md-btn" data-md-action="code" title="行内代码 `code`"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></button>',
            '  <button type="button" class="memo-md-btn" data-md-action="codeblock" title="代码块"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 10l4 4 4-4"/><line x1="12" y1="8" x2="12" y2="16"/></svg></button>',
            '  <span class="memo-md-sep"></span>',
            '  <button type="button" class="memo-md-btn" data-md-action="ul" title="无序列表"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></button>',
            '  <button type="button" class="memo-md-btn" data-md-action="ol" title="有序列表"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg></button>',
            '  <button type="button" class="memo-md-btn" data-md-action="check" title="待办 - [ ]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="6" height="6" rx="1"/><path d="M5 15l2 2 4-4"/><line x1="12" y1="8" x2="21" y2="8"/><line x1="12" y1="14" x2="21" y2="14"/><line x1="12" y1="20" x2="21" y2="20"/></svg></button>',
            '  <span class="memo-md-sep"></span>',
            '  <button type="button" class="memo-md-btn" data-md-action="link" title="链接 [text](url)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>',
            '  <button type="button" class="memo-md-btn" data-md-action="image" title="图片 ![alt](url)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></button>',
            '  <button type="button" class="memo-md-btn" data-md-action="hr" title="分割线 ---"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>',
            '  <span class="memo-md-sep"></span>',
            '  <button type="button" class="memo-md-btn" id="memo-undo-btn" title="撤销 (Ctrl+Z)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg></button>',
            '  <button type="button" class="memo-md-btn" id="memo-redo-btn" title="重做 (Ctrl+Y)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg></button>',
            '</div>',
            '<div class="memo-edit" id="memo-edit">',
            '  <div class="memo-edit-pane">',
            '    <div class="memo-edit-label">Markdown</div>',
            '    <textarea class="memo-edit-textarea" id="memo-content" placeholder="# 标题\n\n开始写点什么…">' + escapeHtml(contentVal) + '</textarea>',
            '  </div>',
            '  <div class="memo-edit-pane">',
            '    <div class="memo-edit-label">预览</div>',
            '    <div class="memo-preview" id="memo-preview"></div>',
            '  </div>',
            '</div>'
        ].join('\n');
        bindViewEvents();
        updatePreview();
    }

    // Markdown 工具栏：每个动作定义插入逻辑
    var MD_ACTIONS = {
        h1: { prefix: '# ' },
        h2: { prefix: '## ' },
        h3: { prefix: '### ' },
        bold: { wrap: '**' },
        italic: { wrap: '*' },
        strike: { wrap: '~~' },
        quote: { prefix: '> ' },
        code: { wrap: '`', placeholder: 'code' },
        codeblock: { block: '```\n', blockEnd: '\n```', placeholder: 'code' },
        ul: { prefix: '- ' },
        ol: { prefix: '1. ' },
        check: { prefix: '- [ ] ' },
        link: { wrapBefore: '[', wrapAfter: '](https://)', placeholder: '链接文字' },
        image: { wrapBefore: '![', wrapAfter: '](https://)', placeholder: '图片说明' },
        hr: { block: '\n---\n' }
    };

    function insertMarkdown(action) {
        var ta = document.getElementById('memo-content');
        if (!ta) return;
        var cfg = MD_ACTIONS[action];
        if (!cfg) return;
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        var text = ta.value;
        var selected = text.slice(start, end);
        var inserted, cursorStart, cursorEnd;

        if (cfg.wrap) {
            // 对称包裹：选中文本或占位符
            var inner = selected || cfg.placeholder || '';
            inserted = cfg.wrap + inner + cfg.wrap;
            cursorStart = start + cfg.wrap.length;
            cursorEnd = cursorStart + inner.length;
        } else if (cfg.wrapBefore) {
            // 非对称包裹（链接/图片）
            var inner2 = selected || cfg.placeholder || '';
            inserted = cfg.wrapBefore + inner2 + cfg.wrapAfter;
            cursorStart = start + cfg.wrapBefore.length;
            cursorEnd = cursorStart + inner2.length;
        } else if (cfg.block) {
            // 块级：自动补齐前后换行
            var pre = (start > 0 && text[start - 1] !== '\n') ? '\n' : '';
            var post = (end < text.length && text[end] !== '\n') ? '\n' : '';
            inserted = pre + cfg.block + (cfg.blockEnd || '') + post;
            cursorStart = start + pre.length + (cfg.blockEnd ? 0 : cfg.block.length);
            cursorEnd = cursorStart;
            // 代码块：光标定位到内部空行
            if (cfg.blockEnd && cfg.placeholder) {
                cursorStart = start + pre.length + cfg.block.length;
            }
        } else if (cfg.prefix) {
            // 行首前缀：定位到当前行首插入
            var lineStart = start;
            while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
            inserted = cfg.prefix;
            cursorStart = lineStart + cfg.prefix.length;
            cursorEnd = cursorStart;
        } else {
            return;
        }

        saveUndoState();
        ta.value = text.slice(0, start) + inserted + text.slice(end);
        ta.selectionStart = cursorStart;
        ta.selectionEnd = cursorEnd;
        ta.focus();
        state.dirty = true;
        updatePreview();
    }
    function saveUndoState() {
        var ta = document.getElementById('memo-content');
        if (!ta) return;
        state.undoStack.push(ta.value);
        if (state.undoStack.length > state.maxUndoSteps) {
            state.undoStack.shift();
        }
        state.redoStack = [];
    }
    function doUndo() {
        var ta = document.getElementById('memo-content');
        if (!ta || state.undoStack.length === 0) return;
        state.redoStack.push(ta.value);
        ta.value = state.undoStack.pop();
        ta.selectionStart = ta.selectionEnd = ta.value.length;
        state.dirty = true;
        updatePreview();
    }
    function doRedo() {
        var ta = document.getElementById('memo-content');
        if (!ta || state.redoStack.length === 0) return;
        state.undoStack.push(ta.value);
        ta.value = state.redoStack.pop();
        ta.selectionStart = ta.selectionEnd = ta.value.length;
        state.dirty = true;
        updatePreview();
    }
    function showToast(msg, type) {
        var t = document.getElementById('memo-toast');
        if (!t) return;
        t.textContent = msg;
        t.className = 'memo-toast memo-toast-' + (type || 'ok');
        t.hidden = false;
        clearTimeout(showToast._timer);
        showToast._timer = setTimeout(function () {
            t.hidden = true;
        }, 1800);
    }
    function bindViewEvents() {
        var titleInput = document.getElementById('memo-title-input');
        var contentArea = document.getElementById('memo-content');
        var saveBtn = document.getElementById('memo-save');
        var backBtn = document.getElementById('memo-back');

        titleInput.addEventListener('input', function () { state.dirty = true; });
        contentArea.addEventListener('input', function () { state.dirty = true; updatePreview(); });
        contentArea.addEventListener('scroll', function () {
            var p = document.getElementById('memo-preview');
            if (p) p.scrollTop = contentArea.scrollTop;
        });
        contentArea.addEventListener('keydown', function (e) {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    doUndo();
                } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
                    e.preventDefault();
                    doRedo();
                }
            }
        });
        saveBtn.addEventListener('click', function () { saveCurrent(); });
        backBtn.addEventListener('click', function () { goBack(); });

        var toolbar = document.getElementById('memo-md-toolbar');
        if (toolbar) {
            toolbar.addEventListener('click', function (e) {
                var btn = e.target.closest && e.target.closest('[data-md-action]');
                if (btn) insertMarkdown(btn.getAttribute('data-md-action'));
            });
        }
        var undoBtn = document.getElementById('memo-undo-btn');
        if (undoBtn) undoBtn.addEventListener('click', function () { doUndo(); });
        var redoBtn = document.getElementById('memo-redo-btn');
        if (redoBtn) redoBtn.addEventListener('click', function () { doRedo(); });
    }
    function goBack() {
        ensureExitEditing(function (choice) {
            if (choice === 'cancel') return;
            // 'save' 已保存；'discard' 直接退出
            state.editing = false;
            state.dirty = false;
            state.undoStack = [];
            state.redoStack = [];
            renderView();
        });
    }
    // 退出编辑前确认未保存修改；返回 'save' / 'discard' / 'cancel'
    function ensureExitEditing(cb) {
        if (!state.editing || !state.dirty) {
            // 未修改直接退出时，也要丢弃可能存在的草稿
            dropDraftAndRefresh();
            cb('discard');
            return;
        }
        dom.unsaved.hidden = false;
        var done = function (choice) {
            dom.unsaved.hidden = true;
            dom.unsavedSave.onclick = null;
            dom.unsavedDiscard.onclick = null;
            dom.unsavedCancel.onclick = null;
            if (choice === 'save') {
                saveCurrent(function (ok) { cb(ok ? 'save' : 'cancel'); });
            } else {
                if (choice === 'discard') dropDraftAndRefresh();
                cb(choice);
            }
        };
        dom.unsavedSave.onclick = function () { done('save'); };
        dom.unsavedDiscard.onclick = function () { done('discard'); };
        dom.unsavedCancel.onclick = function () { done('cancel'); };
    }
    function updatePreview() {
        var content = document.getElementById('memo-content');
        var preview = document.getElementById('memo-preview');
        if (!content || !preview) return;
        var text = content.value;
        if (!text.trim()) {
            preview.innerHTML = '<div class="memo-preview-empty">（空内容）</div>';
            return;
        }
        preview.innerHTML = marked.parse(text);
    }
    function saveCurrent(cb) {
        if (!state.currentId) { cb && cb(false); return; }
        var saveBtn = document.getElementById('memo-save');
        var titleInput = document.getElementById('memo-title-input');
        var contentArea = document.getElementById('memo-content');
        if (!titleInput || !contentArea) { cb && cb(false); return; }
        var title = titleInput.value;
        var content = contentArea.value;
        var draftSave = isDraft(state.currentId);
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '保存中…'; }
        // 草稿首次保存才真正落库
        var req = draftSave
            ? Api.localTools.memos.create({ title: title, content: content })
            : Api.localTools.memos.update(state.currentId, { title: title, content: content });
        req.then(function (data) {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '保存'; }
            if (data && data.success && data.memo) {
                state.dirty = false;
                if (draftSave) {
                    state.draft = null;
                    state.currentId = data.memo.id;
                    state.memos.unshift(data.memo);
                } else {
                    var idx = state.memos.findIndex(function (m) { return m.id === state.currentId; });
                    if (idx >= 0) state.memos[idx] = data.memo;
                }
                state.memos.sort(function (a, b) { return (b.updated_at || '').localeCompare(a.updated_at || ''); });
                renderList();
                // 更新"更新于"时间
                var meta = dom.view.querySelector('.memo-view-meta');
                if (meta) meta.textContent = '更新于 ' + formatTime(data.memo.updated_at);
                showToast('已保存', 'ok');
                cb && cb(true);
            } else {
                showToast('保存失败: ' + ((data && data.error) || '未知'), 'err');
                cb && cb(false);
            }
        }).catch(function (err) {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '保存'; }
            showToast('保存失败: ' + err, 'err');
            cb && cb(false);
        });
    }
    function cancelEdit(skipDirty) {
        if (!skipDirty && state.dirty) {
            if (!confirm('放弃当前修改？')) return;
        }
        state.dirty = false;
        state.editing = false;
        if (state.currentId) {
            renderView();
        }
    }
    function createNew() {
        ensureExitEditing(function (choice) {
            if (choice === 'cancel') return;
            // 新建只是本地草稿，点保存时才真正创建
            state.draft = {
                id: DRAFT_ID,
                title: '',
                content: '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            state.currentId = DRAFT_ID;
            state.dirty = false;
            state.editing = true;
            state.undoStack = [];
            state.redoStack = [];
            renderList();
            renderView();
            var t = document.getElementById('memo-title-input');
            if (t) { t.focus(); }
        });
    }
    function confirmDelete(onAfter) {
        if (!state.currentId) return;
        dom.confirm.hidden = false;
        dom.confirmOk.onclick = function () {
            dom.confirm.hidden = true;
            var id = state.currentId;
            Api.localTools.memos.remove(id).then(function (data) {
                if (data && data.success) {
                    state.memos = state.memos.filter(function (m) { return m.id !== id; });
                    if (onAfter) onAfter();
                    state.dirty = false;
                    state.editing = false;
                    renderList();
                    renderView();
                } else {
                    alert('删除失败: ' + ((data && data.error) || '未知'));
                }
            }).catch(function (err) { alert('删除失败: ' + err); });
        };
    }
    function formatTime(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        var p = function (n) { return n < 10 ? '0' + n : '' + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
            p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

    // 暴露到 window，供 common.js 的按钮调用
    window.MemoModule = {
        open: openModal,
        close: closeModal,
        ensure: ensureModal
    };
})();