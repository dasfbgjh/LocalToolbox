/* ===== IPv6 ULA Generator ===== */
(function () {
    'use strict';

    function randomBytes(n) {
        var arr = new Uint8Array(n);
        crypto.getRandomValues(arr);
        return arr;
    }

    function pad4(s) { while (s.length < 4) s = '0' + s; return s; }
    function stripLead(s) { var t = s.replace(/^0+/, ''); return t === '' ? '0' : t; }

    function bytesToGroups(bytes) {
        var g = [];
        for (var i = 0; i < 16; i += 2) {
            g.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
        }
        return g;
    }

    function fullString(bytes) {
        return bytesToGroups(bytes).map(pad4).join(':');
    }

    // Compress per RFC 5952: replace the longest run of zero groups with ::
    function compressString(bytes) {
        var g = bytesToGroups(bytes).map(stripLead);
        var bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
        for (var i = 0; i < 8; i++) {
            if (g[i] === '0') {
                if (curStart < 0) curStart = i;
                curLen++;
                if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
            } else {
                curStart = -1; curLen = 0;
            }
        }
        if (bestLen < 2) return g.join(':');
        var before = g.slice(0, bestStart).join(':');
        var after = g.slice(bestStart + bestLen).join(':');
        if (bestStart === 0 && bestStart + bestLen === 8) return '::';
        if (bestStart === 0) return '::' + after;
        if (bestStart + bestLen === 8) return before + '::';
        return before + '::' + after;
    }

    // RFC 4193 ULA: fd + 40-bit Global ID + 16-bit subnet ID + 64-bit interface ID
    function generateOne(subnetId, randomIid) {
        var bytes = new Uint8Array(16);
        bytes[0] = 0xfd; // fc00::/7 with L=1
        var gid = randomBytes(5);
        for (var i = 0; i < 5; i++) bytes[1 + i] = gid[i];
        if (subnetId != null) {
            bytes[6] = (subnetId >> 8) & 0xff;
            bytes[7] = subnetId & 0xff;
        } else {
            var sb = randomBytes(2);
            bytes[6] = sb[0]; bytes[7] = sb[1];
        }
        if (randomIid) {
            var iid = randomBytes(8);
            for (var j = 0; j < 8; j++) bytes[8 + j] = iid[j];
        }
        return { compressed: compressString(bytes), full: fullString(bytes) };
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var countEl = $('count');
        var countValEl = $('count-val');
        var subnetEl = $('subnet');
        var iidEl = $('random-iid');
        var resultList = $('result-list');

        function parseSubnet() {
            var v = subnetEl.value.trim();
            if (!v) return null; // random
            if (!/^[0-9a-fA-F]{1,4}$/.test(v)) throw new Error('子网 ID 必须是 1-4 位十六进制');
            return parseInt(v, 16);
        }

        function generate() {
            var banner = 'banner-container';
            Tools.clearBanner(banner);
            var subnetId;
            try { subnetId = parseSubnet(); }
            catch (e) {
                Tools.showBanner(banner, 'error', e.message);
                return;
            }
            var randomIid = iidEl.checked;
            var count = parseInt(countEl.value, 10) || 1;
            if (count < 1) count = 1;
            if (count > 50) count = 50;

            var addrs = [];
            for (var i = 0; i < count; i++) addrs.push(generateOne(subnetId, randomIid));

            resultList.innerHTML = '';
            addrs.forEach(function (addr, idx) {
                var copyBtn = Tools.el('button', {
                    class: 'btn btn-ghost btn-sm btn-copy-item', type: 'button', text: '复制', onclick: function () {
                        Tools.copyText(addr.compressed, copyBtn, '已复制');
                    }
                });
                var top = Tools.el('div', { class: 'ula-top' }, [
                    Tools.el('span', { class: 'ula-idx', text: String(idx + 1) }),
                    Tools.el('span', { class: 'ula-text', text: addr.compressed }),
                    copyBtn
                ]);
                var full = Tools.el('div', { class: 'ula-full', text: addr.full });
                resultList.appendChild(Tools.el('div', { class: 'ula-item' }, [top, full]));
            });
        }

        function copyAll() {
            var items = resultList.querySelectorAll('.ula-text');
            if (items.length === 0) {
                Tools.showBanner('banner-container', 'warn', '请先生成');
                return;
            }
            var text = '';
            items.forEach(function (el) { text += el.textContent + '\n'; });
            Tools.copyText(text.trim(), $('btn-copy-all'), '已复制全部');
        }

        countEl.addEventListener('input', function () { countValEl.textContent = countEl.value; });
        countEl.addEventListener('change', generate);
        iidEl.addEventListener('change', generate);
        $('btn-generate').addEventListener('click', generate);
        $('btn-copy-all').addEventListener('click', copyAll);
        $('btn-clear').addEventListener('click', function () {
            resultList.innerHTML = '';
            resultList.appendChild(Tools.el('div', { class: 'ula-empty', text: '点击「生成」按钮创建' }));
        });

        generate();
    });
})();
