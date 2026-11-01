/* ===== Percentage Calculator ===== */
(function () {
    'use strict';

    function fmt(n, decimals) {
        if (!isFinite(n)) return '—';
        decimals = decimals == null ? 2 : decimals;
        var rounded = Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);
        return rounded.toFixed(decimals);
    }

    function pctFmt(n) {
        if (!isFinite(n)) return '—';
        var sign = n > 0 ? '+' : '';
        return sign + fmt(n, 2) + '%';
    }

    document.addEventListener('DOMContentLoaded', function () {
        // Mode 1: X% of Y
        var m1x = Tools.$('m1-x');
        var m1y = Tools.$('m1-y');
        var m1r = Tools.$('m1-result');
        function calcM1() {
            var x = parseFloat(m1x.value);
            var y = parseFloat(m1y.value);
            if (isNaN(x) || isNaN(y)) { m1r.textContent = '—'; return; }
            m1r.textContent = fmt(x / 100 * y);
        }
        m1x.addEventListener('input', calcM1);
        m1y.addEventListener('input', calcM1);

        // Mode 2: X is what % of Y
        var m2x = Tools.$('m2-x');
        var m2y = Tools.$('m2-y');
        var m2r = Tools.$('m2-result');
        function calcM2() {
            var x = parseFloat(m2x.value);
            var y = parseFloat(m2y.value);
            if (isNaN(x) || isNaN(y) || y === 0) { m2r.textContent = '—'; return; }
            m2r.textContent = fmt(x / y * 100) + '%';
        }
        m2x.addEventListener('input', calcM2);
        m2y.addEventListener('input', calcM2);

        // Mode 3: increase/decrease from X to Y
        var m3x = Tools.$('m3-x');
        var m3y = Tools.$('m3-y');
        var m3r = Tools.$('m3-result');
        function calcM3() {
            var x = parseFloat(m3x.value);
            var y = parseFloat(m3y.value);
            if (isNaN(x) || isNaN(y) || x === 0) { m3r.textContent = '—'; m3r.className = 'pct-result'; return; }
            var pct = (y - x) / Math.abs(x) * 100;
            m3r.textContent = pctFmt(pct);
            m3r.className = 'pct-result ' + (pct >= 0 ? 'positive' : 'negative');
        }
        m3x.addEventListener('input', calcM3);
        m3y.addEventListener('input', calcM3);

        // Mode 4: chained percentages
        var m4base = Tools.$('m4-base');
        var m4rates = Tools.$('m4-rates');
        var m4r = Tools.$('m4-result');
        function calcM4() {
            var base = parseFloat(m4base.value);
            if (isNaN(base)) { m4r.textContent = '—'; return; }
            var rates = (m4rates.value || '').split(/[,，]/).map(function (s) {
                return parseFloat(s.trim().replace(/%$/, ''));
            }).filter(function (n) { return !isNaN(n); });
            var val = base;
            for (var i = 0; i < rates.length; i++) {
                val = val * (1 + rates[i] / 100);
            }
            m4r.textContent = fmt(val);
        }
        m4base.addEventListener('input', calcM4);
        m4rates.addEventListener('input', calcM4);

        // Initial compute
        calcM1(); calcM2(); calcM3(); calcM4();
    });
})();
