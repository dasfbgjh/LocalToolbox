/* ===== Roman Numeral Converter ===== */
(function () {
    'use strict';

    var VALUES = [
        { num: 1000, sym: 'M' },
        { num: 900, sym: 'CM' },
        { num: 500, sym: 'D' },
        { num: 400, sym: 'CD' },
        { num: 100, sym: 'C' },
        { num: 90, sym: 'XC' },
        { num: 50, sym: 'L' },
        { num: 40, sym: 'XL' },
        { num: 10, sym: 'X' },
        { num: 9, sym: 'IX' },
        { num: 5, sym: 'V' },
        { num: 4, sym: 'IV' },
        { num: 1, sym: 'I' }
    ];

    var ROMAN_MAP = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

    function arabicToRoman(num) {
        if (num < 1 || num > 3999 || num !== Math.floor(num)) return '';
        var result = '';
        for (var i = 0; i < VALUES.length; i++) {
            while (num >= VALUES[i].num) {
                result += VALUES[i].sym;
                num -= VALUES[i].num;
            }
        }
        return result;
    }

    function romanToArabic(str) {
        if (!str) return null;
        str = str.toUpperCase().trim();
        if (!/^[MDCLXVI]+$/.test(str)) return null;
        var total = 0;
        var prev = 0;
        for (var i = str.length - 1; i >= 0; i--) {
            var val = ROMAN_MAP[str[i]];
            if (!val) return null;
            if (val < prev) total -= val;
            else total += val;
            prev = val;
        }
        // Verify by converting back
        if (arabicToRoman(total) !== str) return null;
        return total;
    }

    document.addEventListener('DOMContentLoaded', function () {
        var arabicInput = Tools.$('arabic-input');
        var romanOutput = Tools.$('roman-output');
        var romanInput = Tools.$('roman-input');
        var arabicOutput = Tools.$('arabic-output');
        var banner = 'banner-container';

        function convertToRoman() {
            var val = parseInt(arabicInput.value, 10);
            Tools.clearBanner(banner);
            if (isNaN(val)) {
                romanOutput.textContent = '—';
                romanOutput.classList.add('empty');
                return;
            }
            if (val < 1 || val > 3999) {
                Tools.showBanner(banner, 'warn', '请输入 1 到 3999 之间的整数');
                romanOutput.textContent = '超出范围';
                romanOutput.classList.add('empty');
                return;
            }
            var r = arabicToRoman(val);
            romanOutput.textContent = r || '—';
            romanOutput.classList.toggle('empty', !r);
        }

        function convertToArabic() {
            var str = romanInput.value.trim();
            Tools.clearBanner(banner);
            if (!str) {
                arabicOutput.textContent = '—';
                arabicOutput.classList.add('empty');
                return;
            }
            var val = romanToArabic(str);
            if (val === null) {
                Tools.showBanner(banner, 'error', '无效的罗马数字');
                arabicOutput.textContent = '无效';
                arabicOutput.classList.add('empty');
                return;
            }
            arabicOutput.textContent = String(val);
            arabicOutput.classList.remove('empty');
        }

        arabicInput.addEventListener('input', convertToRoman);
        romanInput.addEventListener('input', convertToArabic);

        Tools.$('btn-copy-roman').addEventListener('click', function () {
            if (romanOutput.classList.contains('empty')) return;
            Tools.copyText(romanOutput.textContent, this, '已复制');
        });
        Tools.$('btn-copy-arabic').addEventListener('click', function () {
            if (arabicOutput.classList.contains('empty')) return;
            Tools.copyText(arabicOutput.textContent, this, '已复制');
        });

        convertToRoman();
        convertToArabic();
    });
})();
