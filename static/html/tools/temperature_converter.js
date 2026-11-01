/* ===== Temperature Converter ===== */
(function () {
    'use strict';

    // Convert any unit to Celsius
    function toCelsius(value, unit) {
        switch (unit) {
            case 'c': return value;
            case 'f': return (value - 32) * 5 / 9;
            case 'k': return value - 273.15;
            case 'r': return (value - 491.67) * 5 / 9;
            default: return NaN;
        }
    }

    function fromCelsius(c, unit) {
        switch (unit) {
            case 'c': return c;
            case 'f': return c * 9 / 5 + 32;
            case 'k': return c + 273.15;
            case 'r': return (c + 273.15) * 9 / 5;
            default: return NaN;
        }
    }

    function fmt(val) {
        if (!isFinite(val)) return '—';
        var rounded = Math.round(val * 100) / 100;
        return rounded.toFixed(2);
    }

    document.addEventListener('DOMContentLoaded', function () {
        var inputVal = Tools.$('input-value');
        var inputUnit = Tools.$('input-unit');
        var valueEls = {};
        Tools.$$('#result-list .value').forEach(function (el) {
            valueEls[el.getAttribute('data-unit')] = el;
        });

        function convert() {
            var val = parseFloat(inputVal.value);
            if (isNaN(val)) {
                for (var k in valueEls) valueEls[k].textContent = '—';
                return;
            }
            var c = toCelsius(val, inputUnit.value);
            for (var unit in valueEls) {
                valueEls[unit].textContent = fmt(fromCelsius(c, unit)) + ' ' + unitLabel(unit);
            }
        }

        function unitLabel(u) {
            return { c: '°C', f: '°F', k: 'K', r: '°R' }[u] || '';
        }

        inputVal.addEventListener('input', convert);
        inputUnit.addEventListener('change', convert);
        convert();
    });
})();
