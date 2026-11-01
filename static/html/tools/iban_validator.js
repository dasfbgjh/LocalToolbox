/* ===== IBAN Validator & Parser ===== */
(function () {
    'use strict';

    // IBAN total lengths for common countries (including country code + check digits)
    var IBAN_LENGTHS = {
        NO: 15, BE: 16, GB: 22, DE: 22, FR: 27, IT: 27, ES: 24,
        NL: 18, CH: 21, PL: 28,
        AT: 20, BA: 20, BG: 22, CY: 28, CZ: 24, DK: 18, EE: 20,
        FI: 18, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, LI: 21,
        LT: 20, LU: 20, LV: 21, MC: 27, MK: 19, MT: 31, RO: 24,
        RS: 22, SE: 24, SI: 19, SK: 24, TR: 26
    };

    var COUNTRY_NAMES = {
        NO: '挪威', BE: '比利时', GB: '英国', DE: '德国', FR: '法国',
        IT: '意大利', ES: '西班牙', NL: '荷兰', CH: '瑞士', PL: '波兰',
        AT: '奥地利', BA: '波黑', BG: '保加利亚', CY: '塞浦路斯',
        CZ: '捷克', DK: '丹麦', EE: '爱沙尼亚', FI: '芬兰', GR: '希腊',
        HR: '克罗地亚', HU: '匈牙利', IE: '爱尔兰', IS: '冰岛',
        LI: '列支敦士登', LT: '立陶宛', LU: '卢森堡', LV: '拉脱维亚',
        MC: '摩纳哥', MK: '北马其顿', MT: '马耳他', RO: '罗马尼亚',
        RS: '塞尔维亚', SE: '瑞典', SI: '斯洛文尼亚', SK: '斯洛伐克',
        TR: '土耳其', CN: '中国'
    };

    // BBAN structures: array of [type, length] in order.
    // type: 'bank' (bank code), 'branch' (branch/sort code), 'check' (check digits), 'account'
    var BBAN_STRUCTURES = {
        DE: [['bank', 8], ['account', 10]],
        FR: [['bank', 5], ['branch', 5], ['account', 11], ['check', 2]],
        GB: [['bank', 4], ['branch', 6], ['account', 8]],
        IT: [['check', 1], ['bank', 5], ['branch', 5], ['account', 12]],
        ES: [['bank', 4], ['branch', 4], ['check', 2], ['account', 10]],
        NL: [['bank', 4], ['account', 10]],
        BE: [['bank', 3], ['account', 7], ['check', 2]],
        CH: [['bank', 5], ['account', 12]],
        PL: [['bank', 8], ['account', 16]],
        NO: [['bank', 4], ['account', 6], ['check', 1]],
        SE: [['bank', 3], ['account', 17]],
        AT: [['bank', 5], ['account', 11]]
    };

    function charToValue(ch) {
        var code = ch.charCodeAt(0);
        if (code >= 48 && code <= 57) return ch;                  // 0-9
        if (code >= 65 && code <= 90) return String(code - 55);   // A=10 ... Z=35
        return null;
    }

    // Compute mod 97 for an arbitrarily long numeric string (digit by digit).
    function mod97(numStr) {
        var rem = 0;
        for (var i = 0; i < numStr.length; i++) {
            rem = (rem * 10 + parseInt(numStr.charAt(i), 10)) % 97;
        }
        return rem;
    }

    function formatIBAN(cleaned) {
        return cleaned.replace(/(.{4})/g, '$1 ').trim();
    }

    function parseBBAN(countryCode, bban) {
        var s = BBAN_STRUCTURES[countryCode];
        if (!s) return { bankId: bban, account: '—' };
        var pos = 0;
        var bankParts = [];
        var acctParts = [];
        for (var i = 0; i < s.length; i++) {
            var type = s[i][0], len = s[i][1];
            var part = bban.substring(pos, pos + len);
            pos += len;
            if (type === 'account') acctParts.push(part);
            else bankParts.push(part);
        }
        if (pos < bban.length) acctParts.push(bban.substring(pos));
        return {
            bankId: bankParts.length ? bankParts.join(' ') : '—',
            account: acctParts.length ? acctParts.join(' ') : '—'
        };
    }

    function validateIBAN(input) {
        if (!input) throw new Error('请输入 IBAN');
        var raw = input.trim();
        var cleaned = raw.replace(/\s+/g, '').toUpperCase();

        if (cleaned.length < 5) throw new Error('IBAN 至少需要 5 个字符');
        if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) {
            throw new Error('IBAN 格式错误：应以 2 位国家字母 + 2 位校验位开头');
        }

        var countryCode = cleaned.substring(0, 2);
        var checkDigits = cleaned.substring(2, 4);
        var bban = cleaned.substring(4);
        var countryName = COUNTRY_NAMES[countryCode] || '未知';
        var formatted = formatIBAN(cleaned);

        // CN does not use IBAN
        if (countryCode === 'CN') {
            return {
                valid: false,
                reason: '中国未使用 IBAN 体系（国内使用银行账号）',
                countryCode: countryCode,
                countryName: countryName,
                checkDigits: checkDigits,
                bban: bban,
                bankId: '—',
                account: '—',
                formatted: formatted,
                raw: raw
            };
        }

        // Length check for known countries
        var expectedLen = IBAN_LENGTHS[countryCode];
        if (expectedLen && cleaned.length !== expectedLen) {
            return {
                valid: false,
                reason: countryName + ' IBAN 长度应为 ' + expectedLen + ' 位，实际 ' + cleaned.length + ' 位',
                countryCode: countryCode,
                countryName: countryName,
                checkDigits: checkDigits,
                bban: bban,
                bankId: '—',
                account: '—',
                formatted: formatted,
                raw: raw
            };
        }

        // Checksum: move first 4 chars to end, convert letters to numbers, mod 97
        var reordered = bban + cleaned.substring(0, 4);
        var numericStr = '';
        for (var i = 0; i < reordered.length; i++) {
            var v = charToValue(reordered.charAt(i));
            if (v === null) {
                return {
                    valid: false,
                    reason: '包含非法字符: ' + reordered.charAt(i),
                    countryCode: countryCode,
                    countryName: countryName,
                    checkDigits: checkDigits,
                    bban: bban,
                    bankId: '—',
                    account: '—',
                    formatted: formatted,
                    raw: raw
                };
            }
            numericStr += v;
        }
        var rem = mod97(numericStr);
        var parsed = parseBBAN(countryCode, bban);

        return {
            valid: rem === 1,
            reason: rem === 1 ? '校验通过 (mod 97 = 1)' : '校验失败 (mod 97 = ' + rem + '，应为 1)',
            countryCode: countryCode,
            countryName: countryName,
            checkDigits: checkDigits,
            bban: bban,
            bankId: parsed.bankId,
            account: parsed.account,
            formatted: formatted,
            raw: raw
        };
    }

    function setResult(map) {
        Tools.$$('#result-list .value').forEach(function (el) {
            var key = el.getAttribute('data-key');
            el.textContent = (map && map[key] != null) ? map[key] : '—';
        });
        var status = Tools.$('iban-status');
        if (status) {
            if (map && map.valid === true) {
                status.textContent = '✓ 有效';
                status.className = 'iban-status valid';
            } else if (map && map.valid === false) {
                status.textContent = '✗ 无效';
                status.className = 'iban-status invalid';
            } else {
                status.textContent = '—';
                status.className = 'iban-status';
            }
        }
    }

    function render() {
        var banner = 'banner-container';
        Tools.clearBanner(banner);
        var input = Tools.$('iban-input').value;
        if (!input.trim()) {
            setResult(null);
            return;
        }
        try {
            setResult(validateIBAN(input));
        } catch (e) {
            setResult(null);
            Tools.showBanner(banner, 'error', e.message);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        Tools.$('iban-input').addEventListener('input', render);
        Tools.$('btn-copy').addEventListener('click', function () {
            var el = document.querySelector('#result-list .value[data-key="formatted"]');
            var text = el ? el.textContent : '';
            if (text && text !== '—') Tools.copyText(text, this, '已复制');
            else Tools.showBanner('banner-container', 'warn', '无可复制内容');
        });
        render();
    });
})();
