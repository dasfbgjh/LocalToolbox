/* ===== Tools JavaScript 工具模块 - 共享 JavaScript 代码 =====
 * 提供：
 *   - 工具标题渲染函数 (renderToolHeader)
 *   - 复制文本到剪贴板函数 (copyText)
 *   - 简单 DOM 操作助手函数 ($, $$, el)
 *   - Banner 显示/隐藏函数 (showBanner)
 *   - JSON 语法高亮函数 (highlightJson)
 *   - 回到顶部按钮 (initBackToTop)
 */
(function (window) {
    'use strict';

    var Tools = {};

    // ===== 简单 DOM 操作助手函数 =====
    Tools.$ = function (id) { return document.getElementById(id); };
    Tools.$$ = function (sel, root) { return (root || document).querySelectorAll(sel); };
    Tools.el = function (tag, attrs, children) {
        var node = document.createElement(tag);
        if (attrs) {
            for (var k in attrs) {
                if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
                if (k === 'class') node.className = attrs[k];
                else if (k === 'text') node.textContent = attrs[k];
                else if (k === 'html') node.innerHTML = attrs[k];
                else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') {
                    node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
                } else if (k === 'style' && typeof attrs[k] === 'object') {
                    for (var s in attrs[k]) node.style[s] = attrs[k][s];
                } else {
                    node.setAttribute(k, attrs[k]);
                }
            }
        }
        if (children) {
            if (!Array.isArray(children)) children = [children];
            children.forEach(function (c) {
                if (c == null) return;
                if (typeof c === 'string' || typeof c === 'number') {
                    node.appendChild(document.createTextNode(String(c)));
                } else {
                    node.appendChild(c);
                }
            });
        }
        return node;
    };

    // ===== 计算返回链接的相对路径 =====
    // /tools/{code}.html -> ../tools.html
    // /tools/local/{code}.html -> ../../tools.html
    Tools.getBackHref = function () {
        var path = window.location.pathname;
        // 统计当前 URL 中 /tools/ 到文件名之间的路径段数量
        if (path.indexOf('/tools/local/') !== -1) return '../../tools.html';
        if (path.indexOf('/tools/') !== -1) return '../tools.html';
        return '../tools.html';
    };

    // ===== 工具元数据缓存 =====
    var _catalogPromise = null;
    var _catalogByFile = null; // { fileCode: {title, icon, desc} }
    var _catalogByCode = null; // { toolCode: {title, icon, desc} }

    Tools.getCatalog = function () {
        if (_catalogPromise) return _catalogPromise;
        if (!window.Api || !window.Api.tools || !window.Api.tools.catalog) {
            _catalogPromise = Promise.resolve({ tools: [] });
            return _catalogPromise;
        }
        _catalogPromise = window.Api.tools.catalog().then(function (resp) {
            var arr = (resp && resp.tools) || [];
            _catalogByFile = {};
            _catalogByCode = {};
            for (var i = 0; i < arr.length; i++) {
                var t = arr[i];
                if (t.code) _catalogByCode[t.code] = t;
                var u = t.url || '';
                var um = u.match(/\/([^/]+)\.html?$/);
                if (um) _catalogByFile[um[1]] = t;
            }
            return resp;
        }).catch(function () {
            _catalogByFile = {};
            _catalogByCode = {};
            return { tools: [] };
        });
        return _catalogPromise;
    };

    Tools.lookupToolByFile = function (fileCode) {
        if (!_catalogByFile) return null;
        return _catalogByFile[fileCode] || null;
    };

    // 自动注入工具头信息
    Tools.autoInjectHeader = function () {
        var m = window.location.pathname.match(/.*?\/([^/]+)\.html?$/);
        if (!m) return;
        var fileCode = m[1];
        var toolPage = document.querySelector('.tool-page');
        if (!toolPage) return;
        // 跳过已禁用头信息的页面 (e.g. <body data-no-header> or .tool-page[data-no-header])
        var noHeaderHost = document.querySelector('[data-no-header]');
        if (toolPage.hasAttribute('data-no-header')) return;
        if (noHeaderHost) return;
        // 跳过已存在头信息的页面
        if (toolPage.querySelector('.tool-header')) return;

        var backHref = Tools.getBackHref();
        var title = document.title || '工具';
        var icon = '🔧';
        var desc = '';

        var inject = function (meta) {
            if (meta) {
                title = meta.title || title;
                icon = meta.icon || icon;
                desc = meta.desc || desc;
            }
            var iconChild = (typeof icon === 'string' && icon.match(/\.svg$/i))
                ? Tools.el('img', { src: icon, alt: title })
                : icon;
            var header = Tools.el('header', { class: 'tool-header' }, [
                Tools.el('a', { class: 'btn btn-outline btn-sm btn-back', href: backHref }, ['返回']),
                Tools.el('div', { class: 'tool-icon' }, [iconChild]),
                Tools.el('div', {}, [
                    Tools.el('h1', { text: title }),
                    desc ? Tools.el('p', { class: 'tool-desc', text: desc }) : null
                ])
            ]);
            toolPage.insertBefore(header, toolPage.firstChild);
        };

        // 优先尝试从缓存中获取工具元数据
        var cached = Tools.lookupToolByFile(fileCode);
        if (cached) {
            inject(cached);
        } else {
            Tools.getCatalog().then(function () {
                var found = Tools.lookupToolByFile(fileCode);
                inject(found);
            });
        }
    };

    // ===== 复制文本到剪贴板 =====
    Tools.copyText = function (text, btnEl, feedbackText) {
        if (!text) return Promise.resolve(false);
        feedbackText = feedbackText || '已复制';
        function fallback() {
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                var ok = document.execCommand('copy');
                document.body.removeChild(ta);
                return ok;
            } catch (e) { return false; }
        }
        var p;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            p = navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return fallback(); });
        } else {
            p = Promise.resolve(fallback());
        }
        return p.then(function (ok) {
            if (ok && btnEl) {
                var orig = btnEl.innerHTML;
                btnEl.innerHTML = '✓ ' + feedbackText;
                btnEl.disabled = true;
                setTimeout(function () {
                    btnEl.innerHTML = orig;
                    btnEl.disabled = false;
                }, 1500);
            }
            return ok;
        });
    };

    // ===== 通知条 =====
    Tools.showBanner = function (containerId, type, message, autoCloseMs) {
        var c = Tools.$(containerId);
        if (!c) return;
        c.innerHTML = '';
        var banner = Tools.el('div', { class: 'tool-banner ' + type });
        banner.style.display = 'flex';
        banner.style.alignItems = 'center';
        banner.style.gap = '0.5rem';
        banner.innerHTML = '<span>' + message + '</span>' +
            '<span style="cursor:pointer;margin-left:auto;opacity:0.6;font-size:1rem;" title="关闭">✕</span>';
        c.appendChild(banner);
        var closeBtn = banner.querySelectorAll('span')[1];
        var close = function () {
            if (banner.parentNode) banner.parentNode.removeChild(banner);
        };
        closeBtn.addEventListener('click', close);
        var ms = autoCloseMs || 3000;
        if (ms > 0) setTimeout(close, ms);
    };
    Tools.clearBanner = function (containerId) {
        var c = Tools.$(containerId);
        if (c) c.innerHTML = '';
    };

    // ===== JSON 语法高亮 =====
    Tools.highlightJson = function (jsonStr) {
        if (!jsonStr) return '';
        var escaped = jsonStr
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return escaped.replace(
            /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
            function (match) {
                var cls = 'json-number';
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) cls = 'json-key';
                    else cls = 'json-string';
                } else if (/true|false/.test(match)) cls = 'json-bool';
                else if (/null/.test(match)) cls = 'json-null';
                return '<span class="' + cls + '">' + match + '</span>';
            }
        );
    };

    // ===== 回到顶部按钮 =====
    Tools.initBackToTop = function () {
        var btn = Tools.el('button', {
            class: 'tool-back-top',
            html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>',
            title: '回到顶部',
            onclick: function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }
        });
        document.body.appendChild(btn);
        window.addEventListener('scroll', function () {
            if (window.scrollY > 300) btn.classList.add('visible');
            else btn.classList.remove('visible');
        });
    };

    // ===== 转义 HTML 特殊字符 =====
    Tools.escapeHtml = function (s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    // ===== 下载文本/二进制文件 =====
    Tools.download = function (filename, content, mime) {
        var blob;
        if (content instanceof Blob) blob = content;
        else blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = Tools.el('a', { href: url, download: filename });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    };

    // ===== 读取文件内容 =====
    Tools.readFile = function (file, mode) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(reader.error); };
            if (mode === 'dataUrl') reader.readAsDataURL(file);
            else if (mode === 'arrayBuffer') reader.readAsArrayBuffer(file);
            else reader.readAsText(file);
        });
    };

    // ===== API 帮助函数（委托给 Api 模块） =====
    Tools.apiGet = function (url) { return window.Api.get(url); };
    Tools.apiPost = function (url, body, isForm) { return window.Api.post(url, body); };

    // ===== 初始化工具头信息 =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            Tools.autoInjectHeader();
            Tools.initBackToTop();
        });
    } else {
        Tools.autoInjectHeader();
        Tools.initBackToTop();
    }

    window.Tools = Tools;
})(window);