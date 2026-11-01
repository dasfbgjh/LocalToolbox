/* ===== Text Diff ===== */
(function () {
    'use strict';

    // Line-based diff using Longest Common Subsequence (LCS).
    // equals is optional; defaults to strict equality.
    function diffLines(oldLines, newLines, equals) {
        equals = equals || function (a, b) { return a === b; };
        var m = oldLines.length, n = newLines.length;
        var dp = [];
        for (var i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
        for (var i = m - 1; i >= 0; i--) {
            for (var j = n - 1; j >= 0; j--) {
                if (equals(oldLines[i], newLines[j])) dp[i][j] = dp[i + 1][j + 1] + 1;
                else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
        // Backtrack to build diff
        var result = [];
        var i = 0, j = 0;
        while (i < m && j < n) {
            if (equals(oldLines[i], newLines[j])) {
                result.push({ type: 'equal', oldLine: i + 1, newLine: j + 1, text: oldLines[i] });
                i++; j++;
            } else if (dp[i + 1][j] >= dp[i][j + 1]) {
                result.push({ type: 'removed', oldLine: i + 1, newLine: null, text: oldLines[i] });
                i++;
            } else {
                result.push({ type: 'added', oldLine: null, newLine: j + 1, text: newLines[j] });
                j++;
            }
        }
        while (i < m) { result.push({ type: 'removed', oldLine: i + 1, newLine: null, text: oldLines[i] }); i++; }
        while (j < n) { result.push({ type: 'added', oldLine: null, newLine: j + 1, text: newLines[j] }); j++; }
        return result;
    }

    function normalizeLine(line, ignoreWs, caseSensitive) {
        var s = line;
        if (ignoreWs) s = s.replace(/\s+/g, '');
        if (!caseSensitive) s = s.toLowerCase();
        return s;
    }

    function pad(n, w) {
        n = String(n == null ? '' : n);
        while (n.length < w) n = ' ' + n;
        return n;
    }

    function splitLines(text) {
        var raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (raw.length === 0) return [];
        return raw.split('\n');
    }

    function buildDiffText(diff) {
        return diff.map(function (d) {
            var sign = d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' ';
            return sign + ' ' + pad(d.oldLine, 4) + ' ' + pad(d.newLine, 4) + ' | ' + d.text;
        }).join('\n');
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var oldInput = $('old-text');
        var newInput = $('new-text');
        var ignoreWsChk = $('opt-ignore-ws');
        var caseSensitiveChk = $('opt-case-sensitive');
        var diffView = $('diff-view');
        var statAdded = $('stat-added');
        var statRemoved = $('stat-removed');
        var statEqual = $('stat-equal');
        var btnDiff = $('btn-diff');
        var btnSwap = $('btn-swap');
        var btnClear = $('btn-clear');
        var btnCopy = $('btn-copy');
        var banner = 'banner-container';

        var lastDiff = [];

        var SAMPLE_OLD = 'The quick brown fox\njumps over the lazy dog.\nIt was a dark and stormy night.\nThe cat sat on the mat.';
        var SAMPLE_NEW = 'The quick brown fox\nleaps over the lazy dog.\nIt was a bright and sunny day.\nThe cat sat on the mat.\nA new line at the end.';

        function renderDiff(diff) {
            diffView.innerHTML = '';
            if (!diff.length) {
                diffView.classList.add('empty');
                diffView.textContent = '无差异内容';
                return;
            }
            diffView.classList.remove('empty');
            var frag = document.createDocumentFragment();
            diff.forEach(function (d) {
                var sign = d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' ';
                var row = Tools.el('div', { class: 'diff-row ' + d.type }, [
                    Tools.el('span', { class: 'diff-ln old', text: d.oldLine != null ? String(d.oldLine) : '' }),
                    Tools.el('span', { class: 'diff-ln new', text: d.newLine != null ? String(d.newLine) : '' }),
                    Tools.el('span', { class: 'diff-sign', text: sign }),
                    Tools.el('span', { class: 'diff-text', text: d.text })
                ]);
                frag.appendChild(row);
            });
            diffView.appendChild(frag);
        }

        function compute() {
            Tools.clearBanner(banner);
            var oldLines = splitLines(oldInput.value);
            var newLines = splitLines(newInput.value);
            var ignoreWs = ignoreWsChk.checked;
            var caseSensitive = caseSensitiveChk.checked;

            var equalsFn = function (a, b) {
                return normalizeLine(a, ignoreWs, caseSensitive) === normalizeLine(b, ignoreWs, caseSensitive);
            };

            var diff = diffLines(oldLines, newLines, equalsFn);
            lastDiff = diff;

            var added = 0, removed = 0, equal = 0;
            diff.forEach(function (d) {
                if (d.type === 'added') added++;
                else if (d.type === 'removed') removed++;
                else equal++;
            });
            statAdded.textContent = added;
            statRemoved.textContent = removed;
            statEqual.textContent = equal;

            renderDiff(diff);
            btnCopy.disabled = diff.length === 0;

            if (oldLines.length === 0 && newLines.length === 0) {
                Tools.showBanner(banner, 'warn', '请输入需要对比的文本');
            }
        }

        function swap() {
            var tmp = oldInput.value;
            oldInput.value = newInput.value;
            newInput.value = tmp;
            compute();
        }

        function clearAll() {
            oldInput.value = '';
            newInput.value = '';
            lastDiff = [];
            statAdded.textContent = '0';
            statRemoved.textContent = '0';
            statEqual.textContent = '0';
            diffView.classList.add('empty');
            diffView.innerHTML = '点击“对比”查看差异';
            btnCopy.disabled = true;
            Tools.clearBanner(banner);
            oldInput.focus();
        }

        btnDiff.addEventListener('click', compute);
        btnSwap.addEventListener('click', swap);
        btnClear.addEventListener('click', clearAll);
        btnCopy.addEventListener('click', function () {
            if (!lastDiff.length) return;
            Tools.copyText(buildDiffText(lastDiff), this, '已复制');
        });

        // Initialize with sample text and run once
        oldInput.value = SAMPLE_OLD;
        newInput.value = SAMPLE_NEW;
        compute();
    });
})();
