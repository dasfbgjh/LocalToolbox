/* ===== JSON Diff ===== */
(function () {
    'use strict';

    var SAMPLE_A = '{\n  "name": "Alice",\n  "age": 30,\n  "email": "alice@example.com",\n  "city": "Beijing",\n  "hobbies": ["reading", "swimming"],\n  "address": {\n    "street": "Chaoyang Road",\n    "zip": "100000"\n  },\n  "active": true,\n  "scores": [90, 85, 88]\n}';
    var SAMPLE_B = '{\n  "name": "Alice",\n  "age": 31,\n  "email": "alice@newemail.com",\n  "phone": "13800000000",\n  "hobbies": ["reading", "hiking", "coding"],\n  "address": {\n    "street": "Haidian Road",\n    "zip": "100000",\n    "city": "Beijing"\n  },\n  "active": true,\n  "scores": [90, 85]\n}';

    var BANNER = 'banner-container';

    // Treat null as its own type so it is not recursed into as an object.
    function getType(v) {
        if (v === null) return 'null';
        if (Array.isArray(v)) return 'array';
        return typeof v;
    }

    // Deep recursive diff. Returns a flat list of diff entries:
    //   { type: 'added'|'removed'|'changed'|'unchanged', path, oldVal?, newVal?, val?, typeA?, typeB? }
    function diffValues(a, b, path) {
        var results = [];
        var typeA = getType(a);
        var typeB = getType(b);

        if (a === b) {
            if (path) results.push({ type: 'unchanged', path: path, val: a });
            return results;
        }

        if (typeA !== typeB || (typeA !== 'object' && typeA !== 'array')) {
            // Type mismatch or primitive value change
            results.push({ type: 'changed', path: path, oldVal: a, newVal: b, typeA: typeA, typeB: typeB });
            return results;
        }

        if (typeA === 'array') {
            var maxLen = Math.max(a.length, b.length);
            for (var i = 0; i < maxLen; i++) {
                var arrPath = path + '[' + i + ']';
                if (i >= a.length) {
                    results.push({ type: 'added', path: arrPath, newVal: b[i] });
                } else if (i >= b.length) {
                    results.push({ type: 'removed', path: arrPath, oldVal: a[i] });
                } else {
                    results = results.concat(diffValues(a[i], b[i], arrPath));
                }
            }
        } else {
            // Object
            var keysA = Object.keys(a);
            var keysB = Object.keys(b);
            var allKeys = keysA.concat(keysB.filter(function (k) { return keysA.indexOf(k) === -1; }));
            for (var ki = 0; ki < allKeys.length; ki++) {
                var k = allKeys[ki];
                var keyPath = path ? path + '.' + k : k;
                if (!(k in a)) {
                    results.push({ type: 'added', path: keyPath, newVal: b[k] });
                } else if (!(k in b)) {
                    results.push({ type: 'removed', path: keyPath, oldVal: a[k] });
                } else {
                    results = results.concat(diffValues(a[k], b[k], keyPath));
                }
            }
        }
        return results;
    }

    function stringifyPretty(v) {
        if (v === undefined) return 'undefined';
        if (v === null) return 'null';
        if (typeof v === 'object') return JSON.stringify(v, null, 2);
        return JSON.stringify(v);
    }

    function stringifyCompact(v) {
        if (v === undefined) return 'undefined';
        return JSON.stringify(v);
    }

    function displayPath(p) {
        return p || '$';
    }

    function setHtml(node, html) {
        node.innerHTML = html;
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var aEl = $('json-a');
        var bEl = $('json-b');
        var listEl = $('diff-list');
        var statsEl = $('diff-stats');
        var showSameEl = $('show-same');

        // Fallback: fill samples if empty (e.g. textarea was cleared by mistake on reload)
        if (!aEl.value) aEl.value = SAMPLE_A;
        if (!bEl.value) bEl.value = SAMPLE_B;

        var lastResults = null;

        function parseJson(raw, label) {
            if (!raw || !raw.trim()) {
                Tools.showBanner(BANNER, 'error', 'JSON ' + label + ' 为空，请输入内容');
                return null;
            }
            try {
                return JSON.parse(raw);
            } catch (e) {
                Tools.showBanner(BANNER, 'error', 'JSON ' + label + ' 无效：' + (e && e.message ? e.message : e));
                return null;
            }
        }

        function renderStats(counts) {
            statsEl.innerHTML = '';
            statsEl.appendChild(makeStatBadge('added', '新增', counts.added));
            statsEl.appendChild(makeStatBadge('removed', '删除', counts.removed));
            statsEl.appendChild(makeStatBadge('changed', '修改', counts.changed));
            statsEl.appendChild(makeStatBadge('unchanged', '相同', counts.unchanged));
        }

        function makeStatBadge(type, label, count) {
            return Tools.el('span', { class: 'diff-stat-badge ' + type }, [
                label + ' ',
                Tools.el('strong', { text: String(count) })
            ]);
        }

        function renderList(results) {
            listEl.innerHTML = '';
            var visible = results.filter(function (r) {
                if (r.type === 'unchanged' && !showSameEl.checked) return false;
                return true;
            });

            if (visible.length === 0) {
                listEl.appendChild(Tools.el('div', { class: 'diff-empty', text: '没有差异，两个 JSON 完全相同' }));
                return;
            }

            for (var i = 0; i < visible.length; i++) {
                listEl.appendChild(renderRow(visible[i]));
            }
        }

        function renderRow(r) {
            var row = Tools.el('div', { class: 'diff-row ' + r.type });
            var badgeText = {
                added: '+ 新增',
                removed: '- 删除',
                changed: '≠ 修改',
                unchanged: '= 相同'
            }[r.type];
            row.appendChild(Tools.el('span', { class: 'diff-badge ' + r.type, text: badgeText }));
            row.appendChild(Tools.el('span', { class: 'diff-path', text: displayPath(r.path) }));

            if (r.type === 'added') {
                var w = Tools.el('div', { class: 'diff-value' });
                setHtml(w, Tools.highlightJson(stringifyPretty(r.newVal)));
                row.appendChild(w);
            } else if (r.type === 'removed') {
                var w2 = Tools.el('div', { class: 'diff-value' });
                setHtml(w2, Tools.highlightJson(stringifyPretty(r.oldVal)));
                row.appendChild(w2);
            } else if (r.type === 'changed') {
                var pair = Tools.el('div', { class: 'diff-value diff-value-pair' });
                var oldWrap = Tools.el('span', { class: 'diff-old' });
                setHtml(oldWrap, Tools.highlightJson(stringifyCompact(r.oldVal)));
                pair.appendChild(oldWrap);
                pair.appendChild(Tools.el('span', { class: 'diff-arrow', text: '→' }));
                var newWrap = Tools.el('span', { class: 'diff-new' });
                setHtml(newWrap, Tools.highlightJson(stringifyCompact(r.newVal)));
                pair.appendChild(newWrap);
                row.appendChild(pair);
                if (r.typeA !== r.typeB) {
                    row.appendChild(Tools.el('span', { class: 'diff-type-info', text: '(' + r.typeA + ' → ' + r.typeB + ')' }));
                }
            } else if (r.type === 'unchanged') {
                var w3 = Tools.el('div', { class: 'diff-value' });
                setHtml(w3, Tools.highlightJson(stringifyPretty(r.val)));
                row.appendChild(w3);
            }
            return row;
        }

        function render(results) {
            lastResults = results;
            var counts = { added: 0, removed: 0, changed: 0, unchanged: 0 };
            for (var i = 0; i < results.length; i++) {
                var t = results[i].type;
                if (counts[t] !== undefined) counts[t]++;
            }
            renderStats(counts);
            renderList(results);
            return counts;
        }

        function runDiff() {
            Tools.clearBanner(BANNER);
            var a = parseJson(aEl.value, 'A');
            var b = parseJson(bEl.value, 'B');
            if (a === null || b === null) {
                listEl.innerHTML = '';
                statsEl.innerHTML = '';
                lastResults = null;
                return;
            }
            var results = diffValues(a, b, '');
            var counts = render(results);
            var diffCount = counts.added + counts.removed + counts.changed;
            if (diffCount === 0) {
                Tools.showBanner(BANNER, 'success', '✓ 两个 JSON 完全相同');
            } else {
                Tools.showBanner(BANNER, 'success', '✓ 对比完成，共发现 ' + diffCount + ' 处差异');
            }
        }

        function rerender() {
            // Re-render only (used when toggling "显示相同项"), without re-parsing.
            if (lastResults) renderList(lastResults);
        }

        function swap() {
            var tmp = aEl.value;
            aEl.value = bEl.value;
            bEl.value = tmp;
            runDiff();
        }

        function clearAll() {
            aEl.value = '';
            bEl.value = '';
            listEl.innerHTML = '';
            statsEl.innerHTML = '';
            lastResults = null;
            Tools.clearBanner(BANNER);
            aEl.focus();
        }

        function formatAll() {
            Tools.clearBanner(BANNER);
            var errors = [];
            var items = [{ label: 'A', el: aEl }, { label: 'B', el: bEl }];
            for (var i = 0; i < items.length; i++) {
                var raw = items[i].el.value;
                if (!raw || !raw.trim()) continue;
                try {
                    var parsed = JSON.parse(raw);
                    items[i].el.value = JSON.stringify(parsed, null, 2);
                } catch (e) {
                    errors.push('JSON ' + items[i].label + '：' + (e && e.message ? e.message : e));
                }
            }
            if (errors.length) {
                Tools.showBanner(BANNER, 'error', '格式化失败：' + errors.join('；'));
            } else {
                Tools.showBanner(BANNER, 'success', '✓ 格式化完成');
            }
        }

        $('btn-diff').addEventListener('click', runDiff);
        $('btn-swap').addEventListener('click', swap);
        $('btn-format').addEventListener('click', formatAll);
        $('btn-clear').addEventListener('click', clearAll);
        showSameEl.addEventListener('change', rerender);

        // Auto-run on load
        runDiff();
    });
})();
