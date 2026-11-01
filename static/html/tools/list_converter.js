/* ===== List Converter ===== */
(function () {
    'use strict';

    function parseSeparator(s) {
        if (s === '\\n') return '\n';
        if (s === '\\t') return '\t';
        return s;
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var input = $('input');
        var inputSep = $('input-sep');
        var outputSep = $('output-sep');
        var trim = $('trim');
        var filterEmpty = $('filter-empty');
        var unique = $('unique');
        var reverse = $('reverse');
        var sort = $('sort');
        var prefix = $('prefix');
        var suffix = $('suffix');
        var output = $('output');
        var stats = $('stats');

        function convert() {
            var iSep = parseSeparator(inputSep.value);
            var oSep = parseSeparator(outputSep.value);

            var items = input.value.split(iSep);
            if (trim.checked) items = items.map(function (s) { return s.trim(); });
            if (filterEmpty.checked) items = items.filter(function (s) { return s.length > 0; });
            if (unique.checked) {
                var seen = {};
                items = items.filter(function (s) {
                    if (seen[s]) return false;
                    seen[s] = true;
                    return true;
                });
            }

            var sortMode = sort.value;
            if (sortMode === 'asc') items.sort(function (a, b) { return a.localeCompare(b); });
            else if (sortMode === 'desc') items.sort(function (a, b) { return b.localeCompare(a); });
            else if (sortMode === 'len-asc') items.sort(function (a, b) { return a.length - b.length; });
            else if (sortMode === 'len-desc') items.sort(function (a, b) { return b.length - a.length; });
            else if (sortMode === 'num-asc') items.sort(function (a, b) { return (parseFloat(a) || 0) - (parseFloat(b) || 0); });
            else if (sortMode === 'num-desc') items.sort(function (a, b) { return (parseFloat(b) || 0) - (parseFloat(a) || 0); });

            if (reverse.checked) items.reverse();

            var pfx = prefix.value;
            var sfx = suffix.value;
            if (pfx || sfx) {
                items = items.map(function (s) { return pfx + s + sfx; });
            }

            output.value = items.join(oSep);
            stats.textContent = '共 ' + items.length + ' 项';
        }

        [input, inputSep, outputSep, trim, filterEmpty, unique, reverse, sort, prefix, suffix].forEach(function (el) {
            el.addEventListener('input', convert);
            el.addEventListener('change', convert);
        });

        $('btn-copy').addEventListener('click', function () {
            if (output.value) Tools.copyText(output.value, this, '已复制');
        });

        convert();
    });
})();
