/* ===== IPv4 Address Converter ===== */
(function () {
    'use strict';

    function parseIPv4(str) {
        var parts = str.trim().split('.');
        if (parts.length !== 4) return null;
        var bytes = [];
        for (var i = 0; i < 4; i++) {
            var n = parseInt(parts[i], 10);
            if (isNaN(n) || n < 0 || n > 255) return null;
            if (parts[i] !== String(n)) return null; // reject leading zeros / hex / octal
            bytes.push(n);
        }
        return bytes;
    }

    function bytesToInt(bytes) {
        return ((bytes[0] << 24) >>> 0) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
    }

    function intToBytes(int) {
        return [
            (int >>> 24) & 0xff,
            (int >>> 16) & 0xff,
            (int >>> 8) & 0xff,
            int & 0xff
        ];
    }

    function pad(str, len, ch) {
        str = String(str);
        while (str.length < len) str = ch + str;
        return str;
    }

    function convert(input) {
        input = (input || '').trim();
        if (!input) throw new Error('请输入 IPv4 地址或十进制整数');
        var bytes;
        if (/^\d+$/.test(input)) {
            var n = parseInt(input, 10);
            if (isNaN(n) || n < 0 || n > 4294967295) {
                throw new Error('十进制整数超出 IPv4 范围 (0 - 4294967295)');
            }
            bytes = intToBytes(n >>> 0);
        } else {
            bytes = parseIPv4(input);
            if (!bytes) throw new Error('无效的 IPv4 地址或十进制整数');
        }
        var int = bytesToInt(bytes);
        var hex = '0x' + bytes.map(function (b) { return pad(b.toString(16), 2, '0'); }).join('').toUpperCase();
        var binary = bytes.map(function (b) { return pad(b.toString(2), 8, '0'); }).join('.');
        var octal = bytes.map(function (b) { return pad(b.toString(8), 4, '0'); }).join('.');
        var reverse = bytes.slice().reverse().join('.') + '.in-addr.arpa';
        return {
            ip: bytes.join('.'),
            decimal: String(int),
            hex: hex,
            binary: binary,
            octal: octal,
            reverse: reverse
        };
    }

    function setResult(map) {
        Tools.$$('#result-list .value').forEach(function (el) {
            var key = el.getAttribute('data-key');
            el.textContent = (map && map[key] != null) ? map[key] : '—';
        });
    }

    function render() {
        var banner = 'banner-container';
        Tools.clearBanner(banner);
        try {
            setResult(convert(Tools.$('ip-input').value));
        } catch (e) {
            setResult(null);
            Tools.showBanner(banner, 'error', e.message);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        Tools.$('ip-input').addEventListener('input', render);
        Tools.$$('#result-list .btn-copy').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var key = btn.getAttribute('data-copy');
                var el = document.querySelector('#result-list .value[data-key="' + key + '"]');
                var text = el ? el.textContent : '';
                if (text && text !== '—') Tools.copyText(text, btn, '已复制');
            });
        });
        render();
    });
})();
