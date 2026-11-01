/* ===== Keycode Info ===== */
(function () {
    'use strict';

    var HISTORY_MAX = 5;
    var history = [];
    var lastInfo = null;

    function locationName(loc) {
        switch (loc) {
            case 0: return '标准 (0)';
            case 1: return '左 (1)';
            case 2: return '右 (2)';
            case 3: return '数字键盘 (3)';
            default: return String(loc);
        }
    }

    function displayKey(e) {
        var key = e.key;
        // show a friendly name for special keys
        var display = key;
        if (key === ' ') display = 'Space';
        if (key.length === 1) display = key.toUpperCase();
        return display;
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var keycapEl = $('keycap');

        function handleKey(e) {
            e.preventDefault();
            Tools.clearBanner('banner');

            var info = {
                key: e.key,
                code: e.code,
                keyCode: e.keyCode,
                which: e.which,
                charCode: e.charCode,
                location: e.location,
                repeat: e.repeat,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                shiftKey: e.shiftKey,
                metaKey: e.metaKey,
                display: displayKey(e)
            };
            lastInfo = info;

            keycapEl.textContent = info.display;
            keycapEl.classList.remove('empty');

            $('r-key').textContent = info.key;
            $('r-code').textContent = info.code;
            $('r-keycode').textContent = info.keyCode;
            $('r-which').textContent = info.which;
            $('r-charcode').textContent = info.charCode;
            $('r-location').textContent = locationName(info.location);
            $('r-repeat').textContent = info.repeat ? '是' : '否';

            setMod('mod-ctrl', info.ctrlKey);
            setMod('mod-alt', info.altKey);
            setMod('mod-shift', info.shiftKey);
            setMod('mod-meta', info.metaKey);

            addHistory(info);
        }

        function setMod(id, active) {
            var el = $(id);
            if (active) { el.classList.add('active'); }
            else { el.classList.remove('active'); }
        }

        function addHistory(info) {
            // avoid duplicate consecutive entries
            if (history.length > 0 && history[0].code === info.code && history[0].key === info.key) {
                return;
            }
            history.unshift({
                display: info.display,
                key: info.key,
                code: info.code,
                keyCode: info.keyCode
            });
            if (history.length > HISTORY_MAX) history = history.slice(0, HISTORY_MAX);
            renderHistory();
        }

        function renderHistory() {
            var list = $('history-list');
            list.innerHTML = '';
            if (history.length === 0) {
                list.appendChild(Tools.el('p', { class: 'tool-hint', text: '暂无历史记录' }));
                return;
            }
            history.forEach(function (h) {
                var item = Tools.el('div', { class: 'history-item' }, [
                    Tools.el('span', { class: 'hk', text: h.display }),
                    Tools.el('span', { class: 'hc', text: h.code }),
                    Tools.el('span', { class: 'hn', text: 'code ' + h.keyCode })
                ]);
                item.addEventListener('click', function () {
                    var text = h.code;
                    Tools.copyText(text, item, '已复制 ' + text);
                });
                list.appendChild(item);
            });
        }

        function copyInfo() {
            if (!lastInfo) {
                Tools.showBanner('banner', 'warn', '请先按下任意键');
                return;
            }
            var lines = [
                'key: ' + lastInfo.key,
                'code: ' + lastInfo.code,
                'keyCode: ' + lastInfo.keyCode,
                'which: ' + lastInfo.which,
                'charCode: ' + lastInfo.charCode,
                'location: ' + locationName(lastInfo.location),
                'ctrl: ' + lastInfo.ctrlKey,
                'alt: ' + lastInfo.altKey,
                'shift: ' + lastInfo.shiftKey,
                'meta: ' + lastInfo.metaKey
            ];
            Tools.copyText(lines.join('\n'), $('btn-copy'), '已复制');
        }

        // listen on window so it works anywhere on the page
        window.addEventListener('keydown', handleKey);
        $('btn-copy').addEventListener('click', copyInfo);
        $('btn-clear').addEventListener('click', function () {
            history = [];
            renderHistory();
            Tools.showBanner('banner', 'success', '历史已清空');
            setTimeout(function () { Tools.clearBanner('banner'); }, 1500);
        });

        renderHistory();
    });
})();
