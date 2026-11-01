/* ===== HTML WYSIWYG Editor ===== */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var banner = 'banner';

        var editor = $('editor');
        var source = $('html-source');
        var toggleViewBtn = $('btn-toggle-view');
        var fontSizeSel = $('font-size');
        var textColorInput = $('text-color');
        var bgColorInput = $('bg-color');
        var charCount = $('char-count');

        var sourceMode = false;

        // ===== Execute formatting command =====
        function exec(cmd, value) {
            editor.focus();
            // ensure we're in visual mode before running commands
            if (sourceMode) return;
            try {
                document.execCommand(cmd, false, value || null);
            } catch (e) {
                Tools.showBanner(banner, 'error', '命令执行失败：' + cmd);
            }
            updateCharCount();
        }

        // ===== Wire toolbar command buttons =====
        var cmdBtns = document.querySelectorAll('.wysiwyg-btn[data-cmd]');
        cmdBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                exec(btn.getAttribute('data-cmd'));
            });
        });

        // ===== Font size =====
        fontSizeSel.addEventListener('change', function () {
            var val = fontSizeSel.value;
            if (val) exec('fontSize', val);
            fontSizeSel.value = '';
        });

        // ===== Colors =====
        textColorInput.addEventListener('input', function () {
            exec('foreColor', textColorInput.value);
        });

        bgColorInput.addEventListener('input', function () {
            exec('hiliteColor', bgColorInput.value);
        });

        // ===== Insert link =====
        $('btn-link').addEventListener('click', function () {
            var sel = window.getSelection();
            var hasSelection = sel && sel.toString().length > 0;
            var url = window.prompt('请输入链接地址（URL）：', 'https://');
            if (url === null) return;
            if (!url) {
                Tools.showBanner(banner, 'warn', '链接地址不能为空');
                return;
            }
            if (!hasSelection) {
                var text = window.prompt('请输入链接显示文字：', url);
                if (text === null) return;
                exec('insertHTML', '<a href="' + escapeAttr(url) + '" target="_blank" rel="noopener">' + escapeHtml(text || url) + '</a>');
            } else {
                exec('createLink', url);
            }
        });

        // ===== Insert image =====
        $('btn-image').addEventListener('click', function () {
            var url = window.prompt('请输入图片地址（URL）：', 'https://');
            if (url === null) return;
            if (!url) {
                Tools.showBanner(banner, 'warn', '图片地址不能为空');
                return;
            }
            exec('insertImage', url);
        });

        // ===== Toggle visual / source view =====
        function setView(isSource) {
            sourceMode = isSource;
            if (isSource) {
                source.value = cleanHtml(editor.innerHTML);
                editor.hidden = true;
                source.hidden = false;
                toggleViewBtn.textContent = '可视化编辑';
            } else {
                editor.innerHTML = source.value;
                editor.hidden = false;
                source.hidden = true;
                toggleViewBtn.textContent = '查看 HTML 源码';
            }
            updateCharCount();
        }

        toggleViewBtn.addEventListener('click', function () {
            setView(!sourceMode);
        });

        // ===== Export HTML to source view =====
        $('btn-export').addEventListener('click', function () {
            setView(true);
            Tools.showBanner(banner, 'success', '已导出 HTML 源码');
        });

        // ===== Copy HTML =====
        $('btn-copy').addEventListener('click', function () {
            var html = sourceMode ? source.value : cleanHtml(editor.innerHTML);
            if (!html.trim()) {
                Tools.showBanner(banner, 'warn', '编辑器内容为空');
                return;
            }
            Tools.copyText(html, this, '已复制');
        });

        // ===== Clear content =====
        $('btn-clear').addEventListener('click', function () {
            if (!window.confirm('确定要清空所有内容吗？')) return;
            editor.innerHTML = '';
            source.value = '';
            updateCharCount();
            Tools.clearBanner(banner);
        });

        // ===== Char count =====
        function updateCharCount() {
            var text;
            if (sourceMode) {
                text = source.value;
            } else {
                text = editor.innerText || '';
            }
            charCount.textContent = text.length + ' 字符';
        }

        editor.addEventListener('input', updateCharCount);
        source.addEventListener('input', updateCharCount);

        // ===== Keyboard shortcuts passthrough (browser handles B/I/U/Z natively in contenteditable) =====
        editor.addEventListener('keydown', function (e) {
            // Ctrl+Y redo is not always wired; force it
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                exec('redo');
            }
        });

        // ===== Helpers =====
        function escapeHtml(s) {
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function escapeAttr(s) {
            return String(s).replace(/"/g, '&quot;');
        }

        function cleanHtml(html) {
            // Trim trailing whitespace lines; keep structure intact
            return html.replace(/\s+$/g, '');
        }

        // ===== Seed with sample content =====
        editor.innerHTML = '<h2>欢迎使用 HTML 所见即所得编辑器</h2>' +
            '<p>这是一个使用 <b>contenteditable</b> 实现的富文本编辑器。你可以：</p>' +
            '<ul><li>使用工具栏进行 <i>加粗</i>、<u>下划线</u>、<s>删除线</s> 等格式化</li>' +
            '<li>调整字体大小、文字颜色与背景色</li>' +
            '<li>插入链接与图片</li>' +
            '<li>切换到 HTML 源码视图查看与编辑代码</li></ul>' +
            '<p style="text-align:center;">试试选中这段文字，然后修改颜色吧 🎨</p>';
        updateCharCount();
    });
})();
