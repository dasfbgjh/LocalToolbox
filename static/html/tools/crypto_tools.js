document.addEventListener('DOMContentLoaded', function () {
    var state = { mode: 'hash', timer: null, seq: 0 };

    // ===== Compact MD5 (RFC 1321), UTF-8 aware =====
    function md5(str) {
        function rl(n, c) { return (n << c) | (n >>> (32 - c)); }
        function au(x, y) {
            var x8 = (x & 0x80000000), y8 = (y & 0x80000000),
                x4 = (x & 0x40000000), y4 = (y & 0x40000000),
                r = (x & 0x3FFFFFFF) + (y & 0x3FFFFFFF);
            if (x4 & y4) return r ^ 0x80000000 ^ x8 ^ y8;
            if (x4 | y4) return (r & 0x40000000) ? (r ^ 0xC0000000 ^ x8 ^ y8) : (r ^ 0x40000000 ^ x8 ^ y8);
            return r ^ x8 ^ y8;
        }
        function cmn(q, a, b, x, s, t) { return au(rl(au(au(a, q), au(x, t)), s), b); }
        function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
        function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
        function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
        function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
        function toWords(s) {
            var len = s.length, n = ((len + 8) >> 6) + 1, w = [], i, k;
            for (k = 0; k < n * 16; k++) w[k] = 0;
            for (i = 0; i < len; i++) w[i >> 2] |= (s.charCodeAt(i) & 0xff) << ((i % 4) * 8);
            w[i >> 2] |= 0x80 << ((i % 4) * 8);
            w[n * 16 - 2] = len * 8;
            w[n * 16 - 1] = len >>> 29;
            return w;
        }
        function toHex(w) {
            var h = '0123456789abcdef', out = '';
            for (var i = 0; i < w.length; i++) {
                var v = w[i];
                for (var j = 0; j < 4; j++) {
                    out += h[(v >>> (j * 8 + 4)) & 0xf] + h[(v >>> (j * 8)) & 0xf];
                }
            }
            return out;
        }
        var bytes = new TextEncoder().encode(str);
        var s = '';
        for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        var x = toWords(s);
        var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
        for (i = 0; i < x.length; i += 16) {
            var oa = a, ob = b, oc = c, od = d;
            a = ff(a, b, c, d, x[i + 0], 7, -680876936); d = ff(d, a, b, c, x[i + 1], 12, -389564586);
            c = ff(c, d, a, b, x[i + 2], 17, 606105819); b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
            a = ff(a, b, c, d, x[i + 4], 7, -176418897); d = ff(d, a, b, c, x[i + 5], 12, 1200080426);
            c = ff(c, d, a, b, x[i + 6], 17, -1473231341); b = ff(b, c, d, a, x[i + 7], 22, -45705983);
            a = ff(a, b, c, d, x[i + 8], 7, 1770035416); d = ff(d, a, b, c, x[i + 9], 12, -1958414417);
            c = ff(c, d, a, b, x[i + 10], 17, -42063); b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
            a = ff(a, b, c, d, x[i + 12], 7, 1804603682); d = ff(d, a, b, c, x[i + 13], 12, -40341101);
            c = ff(c, d, a, b, x[i + 14], 17, -1502002290); b = ff(b, c, d, a, x[i + 15], 22, 1236535329);

            a = gg(a, b, c, d, x[i + 1], 5, -165796510); d = gg(d, a, b, c, x[i + 6], 9, -1069501632);
            c = gg(c, d, a, b, x[i + 11], 14, 643717713); b = gg(b, c, d, a, x[i + 0], 20, -373897302);
            a = gg(a, b, c, d, x[i + 5], 5, -701558691); d = gg(d, a, b, c, x[i + 10], 9, 38016083);
            c = gg(c, d, a, b, x[i + 15], 14, -660478335); b = gg(b, c, d, a, x[i + 4], 20, -405537848);
            a = gg(a, b, c, d, x[i + 9], 5, 568446438); d = gg(d, a, b, c, x[i + 14], 9, -1019803690);
            c = gg(c, d, a, b, x[i + 3], 14, -187363961); b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
            a = gg(a, b, c, d, x[i + 13], 5, -1444681467); d = gg(d, a, b, c, x[i + 2], 9, -51403784);
            c = gg(c, d, a, b, x[i + 7], 14, 1735328473); b = gg(b, c, d, a, x[i + 12], 20, -1926607734);

            a = hh(a, b, c, d, x[i + 5], 4, -378558); d = hh(d, a, b, c, x[i + 8], 11, -2022574463);
            c = hh(c, d, a, b, x[i + 11], 16, 1839030562); b = hh(b, c, d, a, x[i + 14], 23, -35309556);
            a = hh(a, b, c, d, x[i + 1], 4, -1530992060); d = hh(d, a, b, c, x[i + 4], 11, 1272893353);
            c = hh(c, d, a, b, x[i + 7], 16, -155497632); b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
            a = hh(a, b, c, d, x[i + 13], 4, 681279174); d = hh(d, a, b, c, x[i + 0], 11, -358537222);
            c = hh(c, d, a, b, x[i + 3], 16, -722521979); b = hh(b, c, d, a, x[i + 6], 23, 76029189);
            a = hh(a, b, c, d, x[i + 9], 4, -640364487); d = hh(d, a, b, c, x[i + 12], 11, -421815835);
            c = hh(c, d, a, b, x[i + 15], 16, 530742520); b = hh(b, c, d, a, x[i + 2], 23, -995338651);

            a = ii(a, b, c, d, x[i + 0], 6, -198630844); d = ii(d, a, b, c, x[i + 7], 10, 1126891415);
            c = ii(c, d, a, b, x[i + 14], 15, -1416354905); b = ii(b, c, d, a, x[i + 5], 21, -57434055);
            a = ii(a, b, c, d, x[i + 12], 6, 1700485571); d = ii(d, a, b, c, x[i + 3], 10, -1894986606);
            c = ii(c, d, a, b, x[i + 10], 15, -1051523); b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
            a = ii(a, b, c, d, x[i + 8], 6, 1873313359); d = ii(d, a, b, c, x[i + 15], 10, -30611744);
            c = ii(c, d, a, b, x[i + 6], 15, -1560198380); b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
            a = ii(a, b, c, d, x[i + 4], 6, -145523070); d = ii(d, a, b, c, x[i + 11], 10, -1120210379);
            c = ii(c, d, a, b, x[i + 2], 15, 718787259); b = ii(b, c, d, a, x[i + 9], 21, -343485551);

            a = au(a, oa); b = au(b, ob); c = au(c, oc); d = au(d, od);
        }
        return toHex([a, b, c, d]);
    }

    function bufToHex(buf) {
        var bytes = new Uint8Array(buf);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
            hex += ('0' + bytes[i].toString(16)).slice(-2);
        }
        return hex;
    }

    function updateByteCount() {
        var text = Tools.$('input-text').value;
        var count = text ? new TextEncoder().encode(text).length : 0;
        Tools.$('byte-count').textContent = count + ' 字节';
    }

    function setMode(mode) {
        state.mode = mode;
        Tools.$('tab-hash').classList.toggle('active', mode === 'hash');
        Tools.$('tab-hmac').classList.toggle('active', mode === 'hmac');
        Tools.$('key-field').style.display = (mode === 'hmac') ? '' : 'none';
        var algoSelect = Tools.$('algo');
        var md5Opt = algoSelect.querySelector('option[value="MD5"]');
        if (mode === 'hmac') {
            if (algoSelect.value === 'MD5') algoSelect.value = 'SHA-256';
            md5Opt.disabled = true;
        } else {
            md5Opt.disabled = false;
        }
        compute();
    }

    function compute() {
        var text = Tools.$('input-text').value;
        var out = Tools.$('output-text');
        Tools.clearBanner('banner');
        if (!text) { out.value = ''; return; }
        var algo = Tools.$('algo').value;
        var mySeq = ++state.seq;

        try {
            if (state.mode === 'hash' && algo === 'MD5') {
                out.value = md5(text);
                return;
            }
            if (!window.crypto || !crypto.subtle) {
                Tools.showBanner('banner', 'error', '当前环境不支持 Web Crypto API，请使用 HTTPS 或 localhost 访问');
                out.value = '';
                return;
            }
            var enc = new TextEncoder().encode(text);
            if (state.mode === 'hash') {
                crypto.subtle.digest(algo, enc).then(function (buf) {
                    if (mySeq !== state.seq) return;
                    out.value = bufToHex(buf);
                }).catch(function (err) {
                    if (mySeq !== state.seq) return;
                    Tools.showBanner('banner', 'error', '计算失败: ' + (err && err.message ? err.message : '未知错误'));
                    out.value = '';
                });
            } else {
                var key = Tools.$('hmac-key').value;
                if (!key) {
                    Tools.showBanner('banner', 'error', 'HMAC 模式需要输入密钥');
                    out.value = '';
                    return;
                }
                var keyBytes = new TextEncoder().encode(key);
                crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: { name: algo } }, false, ['sign']).then(function (ck) {
                    return crypto.subtle.sign('HMAC', ck, enc);
                }).then(function (buf) {
                    if (mySeq !== state.seq) return;
                    out.value = bufToHex(buf);
                }).catch(function (err) {
                    if (mySeq !== state.seq) return;
                    Tools.showBanner('banner', 'error', 'HMAC 计算失败: ' + (err && err.message ? err.message : '未知错误'));
                    out.value = '';
                });
            }
        } catch (e) {
            Tools.showBanner('banner', 'error', '计算失败: ' + (e && e.message ? e.message : '未知错误'));
            out.value = '';
        }
    }

    function debouncedCompute() {
        clearTimeout(state.timer);
        state.timer = setTimeout(compute, 300);
    }

    Tools.$('tab-hash').addEventListener('click', function () { setMode('hash'); });
    Tools.$('tab-hmac').addEventListener('click', function () { setMode('hmac'); });
    Tools.$('algo').addEventListener('change', compute);
    Tools.$('hmac-key').addEventListener('input', debouncedCompute);
    Tools.$('input-text').addEventListener('input', function () {
        updateByteCount();
        debouncedCompute();
    });
    Tools.$('btn-compute').addEventListener('click', compute);
    Tools.$('btn-copy').addEventListener('click', function () {
        var out = Tools.$('output-text').value;
        if (!out) return;
        Tools.copyText(out, this, '已复制');
    });
    Tools.$('btn-clear').addEventListener('click', function () {
        Tools.$('input-text').value = '';
        Tools.$('output-text').value = '';
        Tools.$('hmac-key').value = '';
        Tools.clearBanner('banner');
        updateByteCount();
    });

    updateByteCount();
});
