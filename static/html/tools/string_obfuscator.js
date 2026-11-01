/* ===== String Obfuscator ===== */
(function () {
    'use strict';

    function toBase64(s) {
        try { return btoa(unescape(encodeURIComponent(s))); }
        catch (e) {
            try { return btoa(s); } catch (e2) { return s; }
        }
    }

    function toUnicode(s) {
        var out = '';
        for (var i = 0; i < s.length; i++) {
            var h = s.charCodeAt(i).toString(16);
            while (h.length < 4) h = '0' + h;
            out += '\\u' + h;
        }
        return out;
    }

    function toHex(s) {
        var out = '';
        for (var i = 0; i < s.length; i++) {
            var h = s.charCodeAt(i).toString(16);
            if (h.length % 2) h = '0' + h;
            out += '\\x' + h;
        }
        return out;
    }

    function toHtmlEntity(s) {
        var out = '';
        for (var i = 0; i < s.length; i++) {
            out += '&#' + s.charCodeAt(i) + ';';
        }
        return out;
    }

    function toCharArray(s) {
        var arr = [];
        for (var i = 0; i < s.length; i++) {
            arr.push('"' + s.charAt(i).replace(/["\\]/g, '\\$&') + '"');
        }
        return '[' + arr.join(',') + '].join("")';
    }

    function reverse(s) {
        return s.split('').reverse().join('');
    }

    var METHODS = [
        { key: 'base64', label: 'Base64编码', fn: toBase64 },
        { key: 'unicode', label: 'Unicode转义', fn: toUnicode },
        { key: 'hex', label: 'Hex转义', fn: toHex },
        { key: 'html', label: 'HTML实体', fn: toHtmlEntity },
        { key: 'array', label: '字符数组', fn: toCharArray },
        { key: 'reverse', label: '反转字符串', fn: reverse }
    ];

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var inputEl = $('input');
        var methodsEl = $('methods');
        var outputEl = $('output');
        var statsEl = $('stats');
        var hintEl = $('hint');
        var selected = { base64: true };

        METHODS.forEach(function (m) {
            var cb = Tools.el('input', { type: 'checkbox', id: 'm-' + m.key });
            cb.checked = !!selected[m.key];
            cb.addEventListener('change', function () {
                selected[m.key] = cb.checked;
                update();
            });
            methodsEl.appendChild(Tools.el('label', { class: 'tool-check-row', for: 'm-' + m.key }, [
                cb,
                m.label
            ]));
        });

        function update() {
            Tools.clearBanner('banner');
            var val = inputEl.value;
            var chosen = METHODS.filter(function (m) { return selected[m.key]; });

            if (!val) {
                outputEl.textContent = '—';
                outputEl.classList.add('empty');
                statsEl.innerHTML = '';
                hintEl.textContent = '可多选组合，按顺序应用';
                return;
            }
            if (chosen.length === 0) {
                outputEl.textContent = '—';
                outputEl.classList.add('empty');
                statsEl.innerHTML = '';
                hintEl.textContent = '请至少选择一种混淆方式';
                Tools.showBanner('banner', 'warn', '请至少选择一种混淆方式');
                return;
            }

            var result = val;
            var steps = [];
            chosen.forEach(function (m) {
                result = m.fn(result);
                steps.push(m.label);
            });

            outputEl.textContent = result;
            outputEl.classList.remove('empty');
            hintEl.textContent = '应用顺序：' + steps.join(' → ');

            var ratio = val.length ? (result.length / val.length).toFixed(2) : '0';
            statsEl.innerHTML =
                '<span>原始字符数：<span class="value">' + val.length + '</span></span>' +
                '<span>结果字符数：<span class="value">' + result.length + '</span></span>' +
                '<span>膨胀倍数：<span class="value">' + ratio + 'x</span></span>';
        }

        inputEl.addEventListener('input', update);

        $('btn-copy').addEventListener('click', function () {
            if (!outputEl.textContent || outputEl.classList.contains('empty')) {
                Tools.showBanner('banner', 'warn', '没有可复制的结果');
                return;
            }
            Tools.copyText(outputEl.textContent, this, '已复制');
        });

        $('btn-clear').addEventListener('click', function () {
            inputEl.value = '';
            update();
            inputEl.focus();
        });

        update();
    });
})();
