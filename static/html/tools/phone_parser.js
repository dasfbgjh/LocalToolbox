/* ===== Phone Number Parser & Formatter ===== */
(function () {
    'use strict';

    // Country definitions.
    // Each country provides:
    //   - dialCode (without '+')
    //   - trunkPrefix (local trunk, e.g. '0', '' for US)
    //   - isValid(national): whether the national number (no trunk) is valid
    //   - detectType(national): returns '手机' / '座机' / '手机/座机' / null
    //   - formatLocal(national, type): local format WITH trunk prefix
    //   - formatIntl(national, type): international format with +dialCode
    var COUNTRIES = [
        {
            code: 'CN', dialCode: '86', name: '中国', trunkPrefix: '0',
            isValid: function (n) {
                if (/^1[3-9]\d{9}$/.test(n)) return true;            // mobile
                if (/^(10|2\d)\d{8}$/.test(n)) return true;           // 2-digit area + 8 local
                if (/^[3-9]\d{2}\d{7,8}$/.test(n)) return true;       // 3-digit area + 7-8 local
                return false;
            },
            detectType: function (n) {
                if (/^1[3-9]\d{9}$/.test(n)) return '手机';
                if (/^(10|2\d)\d{8}$/.test(n)) return '座机';
                if (/^[3-9]\d{2}\d{7,8}$/.test(n)) return '座机';
                return null;
            },
            formatLocal: function (n, type) {
                if (type === '手机') return '0' + n.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1 $2 $3');
                var m = n.match(/^(10|2\d)(\d{4})(\d{4})$/);
                if (m) return '0' + m[1] + '-' + m[2] + m[3];
                m = n.match(/^([3-9]\d{2})(\d{3,4})(\d{4})$/);
                if (m) return '0' + m[1] + '-' + m[2] + m[3];
                return '0' + n;
            },
            formatIntl: function (n, type) {
                if (type === '手机') return '+86 ' + n.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1 $2 $3');
                var m = n.match(/^(10|2\d)(\d{4})(\d{4})$/);
                if (m) return '+86 ' + m[1] + ' ' + m[2] + ' ' + m[3];
                m = n.match(/^([3-9]\d{2})(\d{3,4})(\d{4})$/);
                if (m) return '+86 ' + m[1] + ' ' + m[2] + ' ' + m[3];
                return '+86 ' + n;
            }
        },
        {
            code: 'US', dialCode: '1', name: '美国/加拿大', trunkPrefix: '',
            isValid: function (n) { return /^\d{10}$/.test(n); },
            detectType: function (n) { return /^\d{10}$/.test(n) ? '手机/座机' : null; },
            formatLocal: function (n) { return n.replace(/^(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3'); },
            formatIntl: function (n) { return '+1 ' + n.replace(/^(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3'); }
        },
        {
            code: 'GB', dialCode: '44', name: '英国', trunkPrefix: '0',
            isValid: function (n) {
                return /^7\d{9}$/.test(n) || /^[12]\d{8,9}$/.test(n);
            },
            detectType: function (n) {
                if (/^7\d{9}$/.test(n)) return '手机';
                if (/^[12]\d{8,9}$/.test(n)) return '座机';
                return null;
            },
            formatLocal: function (n, type) {
                if (type === '手机') return '0' + n.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');
                var m = n.match(/^(\d{2})(\d{4})(\d{4})$/);
                if (m) return '0' + m[1] + ' ' + m[2] + ' ' + m[3];
                m = n.match(/^(\d{3})(\d{3})(\d{3})$/);
                if (m) return '0' + m[1] + ' ' + m[2] + ' ' + m[3];
                return '0' + n;
            },
            formatIntl: function (n, type) {
                if (type === '手机') return '+44 ' + n.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');
                var m = n.match(/^(\d{2})(\d{4})(\d{4})$/);
                if (m) return '+44 ' + m[1] + ' ' + m[2] + ' ' + m[3];
                m = n.match(/^(\d{3})(\d{3})(\d{3})$/);
                if (m) return '+44 ' + m[1] + ' ' + m[2] + ' ' + m[3];
                return '+44 ' + n;
            }
        },
        {
            code: 'JP', dialCode: '81', name: '日本', trunkPrefix: '0',
            isValid: function (n) {
                return /^(70|80|90)\d{8}$/.test(n) || /^[3-9]\d{7,8}$/.test(n);
            },
            detectType: function (n) {
                if (/^(70|80|90)\d{8}$/.test(n)) return '手机';
                if (/^[3-9]\d{7,8}$/.test(n)) return '座机';
                return null;
            },
            formatLocal: function (n, type) {
                if (type === '手机') return '0' + n.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1-$2-$3');
                if (/^\d{9}$/.test(n)) return '0' + n.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1-$2-$3');
                return '0' + n.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1-$2-$3');
            },
            formatIntl: function (n, type) {
                if (type === '手机') return '+81 ' + n.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1 $2 $3');
                if (/^\d{9}$/.test(n)) return '+81 ' + n.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3');
                return '+81 ' + n.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1 $2 $3');
            }
        },
        {
            code: 'KR', dialCode: '82', name: '韩国', trunkPrefix: '0',
            isValid: function (n) {
                return /^1[016789]\d{7,8}$/.test(n) || /^[2-6]\d{7,9}$/.test(n);
            },
            detectType: function (n) {
                if (/^1[016789]\d{7,8}$/.test(n)) return '手机';
                if (/^[2-6]\d{7,9}$/.test(n)) return '座机';
                return null;
            },
            formatLocal: function (n, type) {
                if (type === '手机') return '0' + n.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1-$2-$3');
                if (/^\d{9}$/.test(n)) return '0' + n.replace(/^(\d{2})(\d{3})(\d{4})$/, '$1-$2-$3');
                return '0' + n.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1-$2-$3');
            },
            formatIntl: function (n, type) {
                if (type === '手机') return '+82 ' + n.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1 $2 $3');
                if (/^\d{9}$/.test(n)) return '+82 ' + n.replace(/^(\d{2})(\d{3})(\d{4})$/, '$1 $2 $3');
                return '+82 ' + n.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1 $2 $3');
            }
        },
        {
            code: 'AU', dialCode: '61', name: '澳大利亚', trunkPrefix: '0',
            isValid: function (n) { return /^[23478]\d{8}$/.test(n); },
            detectType: function (n) {
                if (/^4\d{8}$/.test(n)) return '手机';
                if (/^[2378]\d{8}$/.test(n)) return '座机';
                return null;
            },
            formatLocal: function (n) { return '0' + n.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3'); },
            formatIntl: function (n) { return '+61 ' + n.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3'); }
        },
        {
            code: 'DE', dialCode: '49', name: '德国', trunkPrefix: '0',
            isValid: function (n) { return /^\d{6,11}$/.test(n); },
            detectType: function (n) {
                if (/^1[5-7]\d{8,9}$/.test(n)) return '手机';
                if (/^\d{6,11}$/.test(n)) return '座机';
                return null;
            },
            formatLocal: function (n) {
                if (n.length <= 7) return '0' + n.replace(/^(\d{3,4})(\d+)$/, '$1 $2');
                return '0' + n.replace(/^(\d{4})(\d{3,})(\d{3})$/, '$1 $2 $3');
            },
            formatIntl: function (n) {
                if (n.length <= 7) return '+49 ' + n.replace(/^(\d{3,4})(\d+)$/, '$1 $2');
                return '+49 ' + n.replace(/^(\d{4})(\d{3,})(\d{3})$/, '$1 $2 $3');
            }
        },
        {
            code: 'FR', dialCode: '33', name: '法国', trunkPrefix: '0',
            isValid: function (n) { return /^\d{9}$/.test(n); },
            detectType: function (n) {
                if (/^[67]\d{8}$/.test(n)) return '手机';
                if (/^[1234589]\d{8}$/.test(n)) return '座机';
                return null;
            },
            formatLocal: function (n) {
                var full = '0' + n;
                return full.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');
            },
            formatIntl: function (n) {
                return '+33 ' + n.replace(/^(\d{1})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');
            }
        },
        {
            code: 'IN', dialCode: '91', name: '印度', trunkPrefix: '0',
            isValid: function (n) { return /^[6-9]\d{9}$/.test(n); },
            detectType: function (n) { return /^[6-9]\d{9}$/.test(n) ? '手机' : null; },
            formatLocal: function (n) { return '0' + n.replace(/^(\d{5})(\d{5})$/, '$1 $2'); },
            formatIntl: function (n) { return '+91 ' + n.replace(/^(\d{5})(\d{5})$/, '$1 $2'); }
        }
    ];

    // Sort by dial code length desc so longer codes match first
    COUNTRIES.sort(function (a, b) { return b.dialCode.length - a.dialCode.length; });

    function findCountryByDialCode(dialCode) {
        for (var i = 0; i < COUNTRIES.length; i++) {
            if (COUNTRIES[i].dialCode === dialCode) return COUNTRIES[i];
        }
        return null;
    }

    function parsePhone(input) {
        if (!input) throw new Error('请输入电话号码');
        var raw = input.trim();
        var hasPlus = raw.charAt(0) === '+';
        var digits = raw.replace(/[^\d]/g, '');
        if (!digits) throw new Error('号码中未检测到数字');

        var country = null, national = '';

        if (hasPlus) {
            // Match longest dial code (1-3 digits)
            for (var len = 3; len >= 1; len--) {
                var prefix = digits.substring(0, len);
                var c = findCountryByDialCode(prefix);
                if (c && digits.length > len) {
                    country = c;
                    national = digits.substring(len);
                    break;
                }
            }
            if (!country) throw new Error('无法识别的国家区号，请检查 + 后的区号');
        } else {
            // No '+': try trunk prefix match first
            for (var i = 0; i < COUNTRIES.length; i++) {
                var cc = COUNTRIES[i];
                if (cc.trunkPrefix && digits.charAt(0) === cc.trunkPrefix) {
                    var nat = digits.substring(1);
                    if (cc.isValid(nat)) {
                        country = cc;
                        national = nat;
                        break;
                    }
                }
            }
            // Try no-trunk countries (e.g. US 10-digit)
            if (!country) {
                for (var j = 0; j < COUNTRIES.length; j++) {
                    var cj = COUNTRIES[j];
                    if (cj.trunkPrefix === '' && cj.isValid(digits)) {
                        country = cj;
                        national = digits;
                        break;
                    }
                }
            }
            // CN mobile without trunk and without '+'
            if (!country && /^1[3-9]\d{9}$/.test(digits)) {
                country = findCountryByDialCode('86');
                national = digits;
            }
            if (!country) throw new Error('无法识别号码归属国家，请使用国际格式 (+国家区号)');
        }

        var type = country.detectType(national);
        if (!type) throw new Error('号码格式不符合 ' + country.name + ' 的规则');

        return {
            countryCode: country.code,
            countryName: country.name,
            dialCode: '+' + country.dialCode,
            type: type,
            intlFormat: country.formatIntl(national, type),
            localFormat: country.formatLocal(national, type),
            raw: raw
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
        var input = Tools.$('phone-input').value;
        if (!input.trim()) {
            setResult(null);
            return;
        }
        try {
            setResult(parsePhone(input));
        } catch (e) {
            setResult(null);
            Tools.showBanner(banner, 'error', e.message);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        Tools.$('phone-input').addEventListener('input', render);
        Tools.$('btn-copy-intl').addEventListener('click', function () {
            var el = document.querySelector('#result-list .value[data-key="intlFormat"]');
            var text = el ? el.textContent : '';
            if (text && text !== '—') Tools.copyText(text, this, '已复制');
            else Tools.showBanner('banner-container', 'warn', '无可复制内容');
        });
        Tools.$('btn-copy-local').addEventListener('click', function () {
            var el = document.querySelector('#result-list .value[data-key="localFormat"]');
            var text = el ? el.textContent : '';
            if (text && text !== '—') Tools.copyText(text, this, '已复制');
            else Tools.showBanner('banner-container', 'warn', '无可复制内容');
        });
        render();
    });
})();
