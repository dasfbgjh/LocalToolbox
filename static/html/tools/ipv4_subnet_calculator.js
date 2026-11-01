/* ===== IPv4 Subnet Calculator ===== */
(function () {
    'use strict';

    function parseIPv4(str) {
        var parts = str.trim().split('.');
        if (parts.length !== 4) return null;
        var bytes = [];
        for (var i = 0; i < 4; i++) {
            var n = parseInt(parts[i], 10);
            if (isNaN(n) || n < 0 || n > 255) return null;
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

    function bytesToStr(bytes) {
        return bytes.join('.');
    }

    function intToStr(int) {
        return bytesToStr(intToBytes(int));
    }

    function maskFromPrefix(prefix) {
        if (prefix === 0) return 0;
        return (0xffffffff << (32 - prefix)) >>> 0;
    }

    function getIpClass(firstOctet) {
        if (firstOctet >= 1 && firstOctet <= 126) return 'A 类';
        if (firstOctet === 127) return '环回 (Loopback)';
        if (firstOctet >= 128 && firstOctet <= 191) return 'B 类';
        if (firstOctet >= 192 && firstOctet <= 223) return 'C 类';
        if (firstOctet >= 224 && firstOctet <= 239) return 'D 类 (组播)';
        if (firstOctet >= 240) return 'E 类 (保留)';
        return '未知';
    }

    function isPrivate(bytes) {
        if (bytes[0] === 10) return true;
        if (bytes[0] === 172 && bytes[1] >= 16 && bytes[1] <= 31) return true;
        if (bytes[0] === 192 && bytes[1] === 168) return true;
        return false;
    }

    function compute(cidrStr) {
        var parts = cidrStr.trim().split('/');
        if (parts.length !== 2) throw new Error('格式错误，请使用 IP/前缀 格式');
        var ipBytes = parseIPv4(parts[0]);
        if (!ipBytes) throw new Error('无效的 IP 地址');
        var prefix = parseInt(parts[1], 10);
        if (isNaN(prefix) || prefix < 0 || prefix > 32) throw new Error('前缀必须在 0-32 之间');

        var ipInt = bytesToInt(ipBytes);
        var maskInt = maskFromPrefix(prefix);
        var networkInt = (ipInt & maskInt) >>> 0;
        var wildcardInt = (~maskInt) >>> 0;
        var broadcastInt = (networkInt | wildcardInt) >>> 0;

        var firstHostInt = prefix < 31 ? (networkInt + 1) >>> 0 : networkInt;
        var lastHostInt = prefix < 31 ? (broadcastInt - 1) >>> 0 : broadcastInt;
        var totalIp = Math.pow(2, 32 - prefix);
        var hostCount = prefix >= 31 ? (prefix === 31 ? 2 : 1) : (totalIp - 2);

        var maskBytes = intToBytes(maskInt);
        var binaryMask = maskBytes.map(function (b) { return b.toString(2).padStart(8, '0'); }).join('.');

        return {
            network: intToStr(networkInt),
            broadcast: intToStr(broadcastInt),
            mask: bytesToStr(maskBytes),
            wildcard: intToStr(wildcardInt),
            cidr: intToStr(networkInt) + '/' + prefix,
            class: getIpClass(ipBytes[0]) + (isPrivate(ipBytes) ? ' (私有)' : ''),
            firstHost: intToStr(firstHostInt),
            lastHost: intToStr(lastHostInt),
            hostCount: hostCount.toLocaleString(),
            totalIp: totalIp.toLocaleString(),
            prefix: '/' + prefix,
            binaryMask: binaryMask
        };
    }

    function buildRefTable() {
        var data = [
            { cidr: '/32', mask: '255.255.255.255', hosts: 1 },
            { cidr: '/31', mask: '255.255.255.254', hosts: 2 },
            { cidr: '/30', mask: '255.255.255.252', hosts: 2 },
            { cidr: '/29', mask: '255.255.255.248', hosts: 6 },
            { cidr: '/28', mask: '255.255.255.240', hosts: 14 },
            { cidr: '/27', mask: '255.255.255.224', hosts: 30 },
            { cidr: '/26', mask: '255.255.255.192', hosts: 62 },
            { cidr: '/25', mask: '255.255.255.128', hosts: 126 },
            { cidr: '/24', mask: '255.255.255.0', hosts: 254 },
            { cidr: '/23', mask: '255.255.254.0', hosts: 510 },
            { cidr: '/22', mask: '255.255.252.0', hosts: 1022 },
            { cidr: '/21', mask: '255.255.248.0', hosts: 2046 },
            { cidr: '/20', mask: '255.255.240.0', hosts: 4094 },
            { cidr: '/19', mask: '255.255.224.0', hosts: 8190 },
            { cidr: '/18', mask: '255.255.192.0', hosts: 16382 },
            { cidr: '/17', mask: '255.255.128.0', hosts: 32766 },
            { cidr: '/16', mask: '255.255.0.0', hosts: 65534 },
            { cidr: '/15', mask: '255.254.0.0', hosts: 131070 },
            { cidr: '/14', mask: '255.252.0.0', hosts: 262142 },
            { cidr: '/13', mask: '255.248.0.0', hosts: 524286 },
            { cidr: '/12', mask: '255.240.0.0', hosts: 1048574 },
            { cidr: '/11', mask: '255.224.0.0', hosts: 2097150 },
            { cidr: '/10', mask: '255.192.0.0', hosts: 4194302 },
            { cidr: '/9', mask: '255.128.0.0', hosts: 8388606 },
            { cidr: '/8', mask: '255.0.0.0', hosts: 16777214 },
            { cidr: '/0', mask: '0.0.0.0', hosts: 4294967294 }
        ];
        var container = Tools.$('cidr-ref');
        container.innerHTML = '';
        data.forEach(function (row) {
            var el = Tools.el('div', { class: 'cidr-ref-row', title: '点击使用此 CIDR', onclick: function () {
                Tools.$('cidr-input').value = '192.168.1.1' + row.cidr;
                computeAndRender();
            } }, [
                Tools.el('span', { text: row.cidr }),
                Tools.el('span', { text: row.mask }),
                Tools.el('span', { text: row.hosts.toLocaleString() })
            ]);
            container.appendChild(el);
        });
    }

    function computeAndRender() {
        var banner = 'banner-container';
        var cidrStr = Tools.$('cidr-input').value;
        Tools.clearBanner(banner);
        try {
            var result = compute(cidrStr);
            Tools.$$('#result-list .value').forEach(function (el) {
                var key = el.getAttribute('data-key');
                if (result[key] !== undefined) el.textContent = result[key];
            });
            // Also update the second list
            Tools.$$('[data-key="firstHost"]').forEach(function (el) { el.textContent = result.firstHost; });
            Tools.$$('[data-key="lastHost"]').forEach(function (el) { el.textContent = result.lastHost; });
            Tools.$$('[data-key="hostCount"]').forEach(function (el) { el.textContent = result.hostCount; });
            Tools.$$('[data-key="totalIp"]').forEach(function (el) { el.textContent = result.totalIp; });
            Tools.$$('[data-key="prefix"]').forEach(function (el) { el.textContent = result.prefix; });
            Tools.$$('[data-key="binaryMask"]').forEach(function (el) { el.textContent = result.binaryMask; });
        } catch (e) {
            Tools.showBanner(banner, 'error', e.message);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        buildRefTable();
        Tools.$('btn-compute').addEventListener('click', computeAndRender);
        Tools.$('cidr-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); computeAndRender(); }
        });
        computeAndRender();
    });
})();
