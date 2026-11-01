/* ===== Case Converter ===== */
(function () {
    'use strict';

    // Split into words using non-letter boundaries (supports Unicode letters)
    function words(str) {
        return str.split(/[^A-Za-zÀ-ÖØ-öø-ÿ]+/i).filter(Boolean);
    }

    function lower(s) { return s.toLowerCase(); }
    function upper(s) { return s.toUpperCase(); }

    function camelCase(s) {
        var w = words(s);
        return w.map(function (word, i) {
            if (i === 0) return word.toLowerCase();
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join('');
    }

    function pascalCase(s) {
        return words(s).map(function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join('');
    }

    function snakeCase(s) {
        return words(s).map(function (w) { return w.toLowerCase(); }).join('_');
    }

    function constantCase(s) {
        return words(s).map(function (w) { return w.toUpperCase(); }).join('_');
    }

    function kebabCase(s) {
        return words(s).map(function (w) { return w.toLowerCase(); }).join('-');
    }

    function dotCase(s) {
        return words(s).map(function (w) { return w.toLowerCase(); }).join('.');
    }

    function pathCase(s) {
        return words(s).map(function (w) { return w.toLowerCase(); }).join('/');
    }

    function headerCase(s) {
        return words(s).map(function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join('-');
    }

    function sentenceCase(s) {
        var w = words(s);
        if (w.length === 0) return '';
        w[0] = w[0].charAt(0).toUpperCase() + w[0].slice(1).toLowerCase();
        for (var i = 1; i < w.length; i++) w[i] = w[i].toLowerCase();
        return w.join(' ');
    }

    function titleCase(s) {
        return words(s).map(function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join(' ');
    }

    function mockingCase(s) {
        return s.split('').map(function ( c, i) {
            return i % 2 === 0 ? c.toUpperCase() : c.toLowerCase();
        }).join('');
    }

    var FORMATS = [
        { key: 'lower', label: '小写', fn: lower },
        { key: 'upper', label: '大写', fn: upper },
        { key: 'camel', label: 'camelCase', fn: camelCase },
        { key: 'pascal', label: 'PascalCase', fn: pascalCase },
        { key: 'snake', label: 'snake_case', fn: snakeCase },
        { key: 'constant', label: 'CONSTANT_CASE', fn: constantCase },
        { key: 'kebab', label: 'kebab-case', fn: kebabCase },
        { key: 'dot', label: 'dot.case', fn: dotCase },
        { key: 'path', label: 'path/case', fn: pathCase },
        { key: 'header', label: 'Header-Case', fn: headerCase },
        { key: 'sentence', label: 'Sentence case', fn: sentenceCase },
        { key: 'title', label: 'Title Case', fn: titleCase },
        { key: 'mocking', label: 'MoCkInG', fn: mockingCase }
    ];

    document.addEventListener('DOMContentLoaded', function () {
        var input = Tools.$('input');
        var list = Tools.$('result-list');

        // Build rows
        list.innerHTML = '';
        var rowEls = {};
        FORMATS.forEach(function (fmt) {
            var valueEl = Tools.el('div', { class: 'case-value empty', text: '—' });
            var copyBtn = Tools.el('button', {
                class: 'btn btn-ghost btn-sm', type: 'button', text: '复制', onclick: function () {
                    if (!valueEl.classList.contains('empty')) {
                        Tools.copyText(valueEl.textContent, copyBtn, '已复制');
                    }
                }
            });
            var row = Tools.el('div', { class: 'case-row' }, [
                Tools.el('span', { class: 'case-label', text: fmt.label }),
                valueEl,
                copyBtn
            ]);
            list.appendChild(row);
            rowEls[fmt.key] = valueEl;
        });

        function convert() {
            var val = input.value;
            FORMATS.forEach(function (fmt) {
                var el = rowEls[fmt.key];
                if (!val) {
                    el.textContent = '—';
                    el.classList.add('empty');
                } else {
                    var result = fmt.fn(val);
                    el.textContent = result || '—';
                    el.classList.toggle('empty', !result);
                }
            });
        }

        input.addEventListener('input', convert);
        convert();
    });
})();
