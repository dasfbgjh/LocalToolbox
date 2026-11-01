/* ===== Random Port Generator ===== */
(function () {
    'use strict';

    function randomInt(min, max) {
        var arr = new Uint32Array(1);
        crypto.getRandomValues(arr);
        return min + (arr[0] % (max - min + 1));
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var countEl = $('count');
        var countValEl = $('count-val');
        var minPortEl = $('min-port');
        var maxPortEl = $('max-port');
        var avoidWellknownEl = $('avoid-wellknown');
        var uniqueEl = $('unique');
        var sortEl = $('sort');
        var resultList = $('result-list');

        function generate() {
            var count = parseInt(countEl.value, 10) || 1;
            var min = parseInt(minPortEl.value, 10) || 1;
            var max = parseInt(maxPortEl.value, 10) || 65535;
            if (avoidWellknownEl.checked && min < 1024) min = 1024;
            if (min < 1) min = 1;
            if (max > 65535) max = 65535;
            if (min > max) { var t = min; min = max; max = t; }

            var ports = [];
            var seen = {};
            var attempts = 0;
            var maxAttempts = count * 10;
            while (ports.length < count && attempts < maxAttempts) {
                var p = randomInt(min, max);
                if (uniqueEl.checked) {
                    if (!seen[p]) { seen[p] = true; ports.push(p); }
                } else {
                    ports.push(p);
                }
                attempts++;
            }

            if (sortEl.checked) ports.sort(function (a, b) { return a - b; });

            resultList.innerHTML = '';
            if (ports.length === 0) {
                resultList.appendChild(Tools.el('div', { class: 'port-empty', text: '无结果' }));
                return;
            }
            ports.forEach(function (p) {
                var item = Tools.el('span', {
                    class: 'port-item', text: String(p), title: '点击复制', onclick: function () {
                        Tools.copyText(String(p), item, '已复制 ' + p);
                    }
                });
                resultList.appendChild(item);
            });
        }

        function copyAll() {
            var items = resultList.querySelectorAll('.port-item');
            if (items.length === 0) return;
            var text = '';
            items.forEach(function (el) { text += el.textContent + ', '; });
            Tools.copyText(text.slice(0, -2), $('btn-copy-all'), '已复制全部');
        }

        countEl.addEventListener('input', function () { countValEl.textContent = countEl.value; });
        countEl.addEventListener('change', generate);
        minPortEl.addEventListener('change', generate);
        maxPortEl.addEventListener('change', generate);
        avoidWellknownEl.addEventListener('change', generate);
        uniqueEl.addEventListener('change', generate);
        sortEl.addEventListener('change', generate);
        $('btn-generate').addEventListener('click', generate);
        $('btn-copy-all').addEventListener('click', copyAll);

        generate();
    });
})();
