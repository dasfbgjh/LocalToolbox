/* ===== MAC Address Lookup ===== */
(function () {
    'use strict';

    // OUI (uppercase, no separators) -> vendor
    var OUI_TABLE = {
        // Apple
        '001B63': 'Apple, Inc.', '002500': 'Apple, Inc.', '0026BB': 'Apple, Inc.', 'ACBC32': 'Apple, Inc.', 'ACDE48': 'Apple, Inc.',
        // Cisco
        '00000C': 'Cisco Systems, Inc', '000142': 'Cisco Systems, Inc', '000143': 'Cisco Systems, Inc', '000163': 'Cisco Systems, Inc', '000164': 'Cisco Systems, Inc',
        // Dell
        '001422': 'Dell Inc.', '0015C5': 'Dell Inc.', '001676': 'Dell Inc.', '001EC9': 'Dell Inc.',
        // HP
        '001B78': 'HP (Hewlett-Packard)', '0024A8': 'HP (Hewlett-Packard)', '002561': 'HP (Hewlett-Packard)', '002655': 'HP (Hewlett-Packard)',
        // Intel
        '0002B3': 'Intel Corporate', '000347': 'Intel Corporate', '000423': 'Intel Corporate', '000CF1': 'Intel Corporate',
        // Microsoft
        '000D3A': 'Microsoft Corporation', '00125A': 'Microsoft Corporation', '00155D': 'Microsoft Corporation', '0017FA': 'Microsoft Corporation',
        // Netgear
        '00095B': 'Netgear', '000FB5': 'Netgear', '001B2F': 'Netgear', '001F33': 'Netgear',
        // Samsung
        '00092D': 'Samsung Electronics', '0012FB': 'Samsung Electronics', '0015B9': 'Samsung Electronics', '0017C1': 'Samsung Electronics',
        // TP-Link
        '50C7BF': 'TP-Link Technologies', '6032B1': 'TP-Link Technologies', 'AC84C6': 'TP-Link Technologies', 'EC086B': 'TP-Link Technologies',
        // Huawei
        '00259E': '华为 (Huawei)', '00464B': '华为 (Huawei)', '0819A6': '华为 (Huawei)', '4846FB': '华为 (Huawei)',
        // ASUS
        '000C6E': '华硕 (ASUS)', '00112F': '华硕 (ASUS)', '00137B': '华硕 (ASUS)', '001A92': '华硕 (ASUS)',
        // Lenovo
        '002326': '联想 (Lenovo)', '0024E8': '联想 (Lenovo)', '00269E': '联想 (Lenovo)', '003067': '联想 (Lenovo)'
    };

    function normalizeMac(input) {
        if (!input) return null;
        var hex = input.trim().toUpperCase().replace(/[\s:\-\.]/g, '');
        if (hex.length < 12) return null;
        hex = hex.substring(0, 12);
        if (!/^[0-9A-F]{12}$/.test(hex)) return null;
        return hex;
    }

    function formatMac(hex) {
        return hex.match(/.{2}/g).join(':');
    }

    function lookup(input) {
        var hex = normalizeMac(input);
        if (!hex) {
            throw new Error('无效的 MAC 地址，支持 AA:BB:CC:DD:EE:FF、AA-BB-CC-DD-EE-FF、AABB.CCDD.EEFF 等格式');
        }
        var oui = hex.substring(0, 6);
        var vendor = OUI_TABLE[oui] || '未知 (未收录在本地 OUI 库)';
        var b0 = parseInt(hex.substring(0, 2), 16);
        var multicast = (b0 & 0x01) === 1;
        var local = (b0 & 0x02) === 2;
        var type = (multicast ? '组播' : '单播') + ' / ' + (local ? '本地管理' : '全球唯一');
        return {
            standard: formatMac(hex),
            oui: formatMac(oui),
            vendor: vendor,
            type: type,
            raw: input.trim()
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
        var input = Tools.$('mac-input').value;
        if (!input.trim()) {
            setResult(null);
            return;
        }
        try {
            setResult(lookup(input));
        } catch (e) {
            setResult(null);
            Tools.showBanner(banner, 'error', e.message);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        Tools.$('mac-input').addEventListener('input', render);
        Tools.$('btn-copy').addEventListener('click', function () {
            var el = document.querySelector('#result-list .value[data-key="standard"]');
            var text = el ? el.textContent : '';
            if (text && text !== '—') Tools.copyText(text, this, '已复制');
            else Tools.showBanner('banner-container', 'warn', '无可复制内容');
        });
        render();
    });
})();
