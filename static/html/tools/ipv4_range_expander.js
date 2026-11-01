/* ===== IPv4 Range Expander ===== */
(function () {
    'use strict';

    function parseIPv4(str) {
        var parts = str.trim().split('.');
        if (parts.length !== 4) return null;
        var bytes = [];
        for (var i = 0; i < 4; i++) {
            var n = parseInt(parts[i], 10);
            if (isNaN(n) || n < 0 || n > 255 || parts[i] !== String(n)) return null;
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

    function intToStr(int) {
        return intToBytes(int).join('.');
    }

    function maskFromPrefix(prefix) {
        if (prefix === 0) return 0;
        return (0xffffffff << (32 - prefix)) >>> 0;
    }

    // Smallest CIDR prefix length containing both start and end (as unsigned ints).
    // Equals the longest common prefix of the two values.
    function smallestPrefix(startInt, endInt) {
        var a = startInt, b = endInt;
        if (a > b) { var t = a; a = b; b = t; }
        if (a === b) return 32;
        var xor = (a ^ b) >>> 0;
        var prefix = 0;
        for (var i = 31; i >= 0; i--) {
            if ((xor >>> i) & 1) break;
            prefix++;
        }
        return prefix;
    }

    function parseInput(str) {
        str = (str || '').trim();
        if (!str) throw new Error('请输入 CIDR 或 IP 范围');

        if (str.indexOf('/') !== -1) {
            var parts = str.split('/');
            if (parts.length !== 2) throw new Error('CIDR 格式错误，应为 IP/前缀');
            var ipBytes = parseIPv4(parts[0]);
            if (!ipBytes) throw new Error('无效的 IP 地址');
            var prefix = parseInt(parts[1], 10);
            if (isNaN(prefix) || prefix < 0 || prefix > 32) throw new Error('前缀必须在 0-32 之间');
            var maskInt = maskFromPrefix(prefix);
            var networkInt = (bytesToInt(ipBytes) & maskInt) >>> 0;
            var broadcastInt = (networkInt | (~maskInt >>> 0)) >>> 0;
            return { start: networkInt, end: broadcastInt, prefix: prefix, type: 'CIDR (' + str + ')' };
        }

        if (str.indexOf('-') !== -1) {
            var seg = str.split('-');
            if (seg.length !== 2) throw new Error('范围格式错误，应为 起始IP-结束IP');
            var sBytes = parseIPv4(seg[0].trim());
            var eBytes = parseIPv4(seg[1].trim());
            if (!sBytes || !eBytes) throw new Error('无效的 IP 地址');
            var s = bytesToInt(sBytes), e = bytesToInt(eBytes);
            if (s > e) { var t2 = s; s = e; e = t2; }
            return { start: s, end: e, prefix: smallestPrefix(s, e), type: 'IP 范围' };
        }

        throw new Error('格式错误，请输入 CIDR 或 起始IP-结束IP');
    }

    function compute(str) {
        var parsed = parseInput(str);
        var prefix = parsed.prefix;
        var maskInt = maskFromPrefix(prefix);
        var networkInt = (parsed.start & maskInt) >>> 0;
        var broadcastInt = (networkInt | (~maskInt >>> 0)) >>> 0;
        var totalIp = Math.pow(2, 32 - prefix);
        var hostCount;
        if (prefix >= 31) hostCount = (prefix === 31 ? 2 : 1);
        else hostCount = totalIp - 2;

        return {
            startIp: intToStr(parsed.start),
            endIp: intToStr(parsed.end),
            network: intToStr(networkInt),
            broadcast: intToStr(broadcastInt),
            mask: intToStr(maskInt),
            cidr: intToStr(networkInt) + '/' + prefix,
            prefix: '/' + prefix,
            range: intToStr(networkInt) + ' - ' + intToStr(broadcastInt),
            totalIp: totalIp.toLocaleString(),
            hostCount: hostCount.toLocaleString(),
            type: parsed.type
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
            setResult(compute(Tools.$('range-input').value));
        } catch (e) {
            setResult(null);
            Tools.showBanner(banner, 'error', e.message);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        Tools.$('range-input').addEventListener('input', render);
        Tools.$('range-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); render(); }
        });
        Tools.$('btn-copy-cidr').addEventListener('click', function () {
            var el = document.querySelector('#result-list .value[data-key="cidr"]');
            var text = el ? el.textContent : '';
            if (text && text !== '—') Tools.copyText(text, this, '已复制');
            else Tools.showBanner('banner-container', 'warn', '无可复制内容');
        });
        render();
    });
})();
