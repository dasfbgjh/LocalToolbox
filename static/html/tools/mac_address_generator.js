/* ===== MAC Address Generator ===== */
(function () {
    'use strict';

    var VENDOR_PREFIXES = {
        random: null,
        local: ['02', '00', '00'],
        intel: ['00', '1B', '21'],
        cisco: ['00', '1B', '54'],
        dell: ['00', '14', '22'],
        apple: ['00', '1F', 'F3'],
        microsoft: ['00', '50', 'F2'],
        google: ['00', '1A', '11']
    };

    function randomHex() {
        var arr = new Uint8Array(1);
        crypto.getRandomValues(arr);
        return arr[0].toString(16).padStart(2, '0');
    }

    function generateMac(vendor, sep, upper) {
        var prefix;
        if (vendor === 'random') {
            // Locally administered, unicast
            var b0 = randomHex();
            var n0 = parseInt(b0, 16);
            n0 = (n0 & 0xfc) | 0x02; // locally administered, unicast
            prefix = [n0.toString(16).padStart(2, '0'), randomHex(), randomHex()];
        } else {
            // Copy the vendor prefix
            prefix = VENDOR_PREFIXES[vendor] ? VENDOR_PREFIXES[vendor].slice() : [randomHex(), randomHex(), randomHex()];
        }
        var bytes = prefix.concat([randomHex(), randomHex(), randomHex()]);
        var mac = bytes.join(sep);
        return upper ? mac.toUpperCase() : mac.toLowerCase();
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var countEl = $('count');
        var countValEl = $('count-val');
        var separatorEl = $('separator');
        var caseEl = $('case');
        var vendorEl = $('vendor');
        var resultList = $('result-list');

        function generate() {
            var count = parseInt(countEl.value, 10) || 1;
            var sep = separatorEl.value;
            var upper = caseEl.value === 'upper';
            var vendor = vendorEl.value;

            resultList.innerHTML = '';
            for (var i = 0; i < count; i++) {
                var mac = generateMac(vendor, sep, upper);
                var copyBtn = Tools.el('button', {
                    class: 'btn btn-ghost btn-sm', type: 'button', text: '复制', onclick: function () {
                        Tools.copyText(mac, copyBtn, '已复制');
                    }
                });
                resultList.appendChild(Tools.el('div', { class: 'mac-item' }, [
                    Tools.el('span', { class: 'mac-idx', text: (i + 1) }),
                    Tools.el('span', { class: 'mac-text', text: mac }),
                    copyBtn
                ]));
            }
        }

        function copyAll() {
            var items = resultList.querySelectorAll('.mac-text');
            if (items.length === 0) return;
            var text = '';
            items.forEach(function (el) { text += el.textContent + '\n'; });
            Tools.copyText(text.trim(), $('btn-copy-all'), '已复制全部');
        }

        countEl.addEventListener('input', function () { countValEl.textContent = countEl.value; });
        countEl.addEventListener('change', generate);
        separatorEl.addEventListener('change', generate);
        caseEl.addEventListener('change', generate);
        vendorEl.addEventListener('change', generate);
        $('btn-generate').addEventListener('click', generate);
        $('btn-copy-all').addEventListener('click', copyAll);

        generate();
    });
})();
