/* ===== Benchmark Builder ===== */
(function () {
    'use strict';

    var SAMPLE_TASKS = [
        { name: 'for 循环', code: 'var sum = 0;\nfor (var i = 0; i < 100; i++) { sum += i; }' },
        { name: 'while 循环', code: 'var sum = 0;\nvar n = 0;\nwhile (n < 100) { sum += n; n++; }' },
        { name: 'Array.forEach', code: 'var sum = 0;\nnew Array(100).fill(0).forEach(function (v, idx) { sum += idx; });' },
        { name: 'for...of (keys)', code: 'var sum = 0;\nvar arr = new Array(100).fill(0);\nfor (var idx of arr.keys()) { sum += idx; }' }
    ];

    function fmtTime(ms) {
        if (!isFinite(ms)) return '—';
        if (ms <= 0) return '0 ms';
        if (ms < 0.001) return (ms * 1000000).toFixed(2) + ' ns';
        if (ms < 1) return (ms * 1000).toFixed(2) + ' µs';
        if (ms < 1000) return ms.toFixed(3) + ' ms';
        return (ms / 1000).toFixed(3) + ' s';
    }

    function fmtOps(ops) {
        if (!isFinite(ops) || ops <= 0) return '—';
        if (ops >= 1e6) return (ops / 1e6).toFixed(2) + ' M';
        if (ops >= 1e3) return (ops / 1e3).toFixed(2) + ' K';
        return ops.toFixed(0);
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var taskList = $('task-list');
        var resultArea = $('result-area');
        var runCountEl = $('run-count');
        var btnRun = $('btn-run');
        var btnCopy = $('btn-copy');
        var running = false;

        function addTask(name, code) {
            var codeEl = Tools.el('textarea', {
                class: 'tool-textarea bench-code sm',
                placeholder: '// 在此输入 JS 代码片段，可用变量 i'
            });
            codeEl.value = code || '';

            var nameEl = Tools.el('input', {
                class: 'tool-input bench-name',
                type: 'text',
                placeholder: '任务名称',
                value: name || ''
            });

            var card = Tools.el('div', { class: 'bench-task' }, [
                Tools.el('div', { class: 'bench-task-head' }, [
                    nameEl,
                    Tools.el('button', {
                        class: 'btn btn-ghost btn-sm', type: 'button', text: '删除',
                        onclick: function () {
                            if (taskList.children.length <= 1) {
                                Tools.showBanner('banner', 'warn', '至少保留一个任务');
                                return;
                            }
                            card.remove();
                        }
                    })
                ]),
                codeEl
            ]);
            taskList.appendChild(card);
        }

        function getTasks() {
            var tasks = [];
            var cards = taskList.querySelectorAll('.bench-task');
            cards.forEach(function (card) {
                var name = card.querySelector('.bench-name').value.trim() || '未命名';
                var code = card.querySelector('.bench-code').value;
                tasks.push({ name: name, code: code });
            });
            return tasks;
        }

        function runBenchmark() {
            if (running) return;
            var tasks = getTasks();
            var runCount = parseInt(runCountEl.value, 10) || 1;
            if (runCount < 1) runCount = 1;
            if (runCount > 1000000) runCount = 1000000;

            running = true;
            btnRun.disabled = true;
            resultArea.className = 'bench-empty bench-running';
            resultArea.textContent = '运行中，请稍候…';
            Tools.clearBanner('banner');

            // defer so UI can update before the heavy loop
            setTimeout(function () {
                var results = [];
                for (var t = 0; t < tasks.length; t++) {
                    var task = tasks[t];
                    var times = [];
                    var err = null;
                    try {
                        var fn = new Function('i', '"use strict";\n' + task.code);
                        // warmup once
                        try { fn(0); } catch (e) { }
                        for (var r = 0; r < runCount; r++) {
                            var t0 = performance.now();
                            fn(r);
                            var t1 = performance.now();
                            times.push(t1 - t0);
                        }
                    } catch (e) {
                        err = e.message;
                    }

                    if (err) {
                        results.push({ name: task.name, error: err });
                    } else {
                        var sum = 0, min = Infinity, max = 0;
                        for (var k = 0; k < times.length; k++) {
                            sum += times[k];
                            if (times[k] < min) min = times[k];
                            if (times[k] > max) max = times[k];
                        }
                        var avg = sum / times.length;
                        var ops = avg > 0 ? (1000 / avg) : 0;
                        results.push({ name: task.name, avg: avg, min: min, max: max, ops: ops });
                    }
                }

                // sort: valid results by avg asc (fastest first), errors last
                results.sort(function (a, b) {
                    if (a.error && b.error) return 0;
                    if (a.error) return 1;
                    if (b.error) return -1;
                    return a.avg - b.avg;
                });

                renderResults(results);
                running = false;
                btnRun.disabled = false;
                if (results.length && !results[0].error) {
                    Tools.showBanner('banner', 'success', '运行完成，最快：' + results[0].name);
                }
            }, 30);
        }

        function renderResults(results) {
            resultArea.innerHTML = '';
            if (results.length === 0) {
                resultArea.className = 'bench-empty';
                resultArea.textContent = '无结果';
                return;
            }
            resultArea.className = 'bench-result-table';

            resultArea.appendChild(Tools.el('div', { class: 'bench-row bench-row-head' }, [
                Tools.el('span', { class: 'br-rank', text: '排名' }),
                Tools.el('span', { class: 'br-name', text: '任务' }),
                Tools.el('span', { class: 'br-num', text: '平均' }),
                Tools.el('span', { class: 'br-num', text: '最小' }),
                Tools.el('span', { class: 'br-num', text: '最大' }),
                Tools.el('span', { class: 'br-num', text: 'ops/秒' })
            ]));

            var fastestAvg = Infinity;
            for (var i = 0; i < results.length; i++) {
                if (!results[i].error && results[i].avg < fastestAvg) fastestAvg = results[i].avg;
            }

            for (var j = 0; j < results.length; j++) {
                var r = results[j];
                var rowCls = 'bench-row';
                if (!r.error && r.avg === fastestAvg) rowCls += ' fastest';
                var children = [
                    Tools.el('span', { class: 'br-rank', text: '#' + (j + 1) }),
                    Tools.el('span', { class: 'br-name', text: r.name })
                ];
                if (r.error) {
                    children.push(Tools.el('span', { class: 'br-err', text: '错误: ' + r.error }));
                } else {
                    children.push(Tools.el('span', { class: 'br-num', text: fmtTime(r.avg) }));
                    children.push(Tools.el('span', { class: 'br-num', text: fmtTime(r.min) }));
                    children.push(Tools.el('span', { class: 'br-num', text: fmtTime(r.max) }));
                    children.push(Tools.el('span', { class: 'br-num', text: fmtOps(r.ops) }));
                }
                resultArea.appendChild(Tools.el('div', { class: rowCls }, children));
            }
        }

        function copyResults() {
            if (resultArea.classList.contains('bench-empty')) {
                Tools.showBanner('banner', 'warn', '暂无结果可复制');
                return;
            }
            var rows = resultArea.querySelectorAll('.bench-row');
            var lines = ['排名\t任务\t平均\t最小\t最大\tops每秒'];
            rows.forEach(function (row) {
                if (row.classList.contains('bench-row-head')) return;
                var cells = row.querySelectorAll('span');
                var parts = [];
                cells.forEach(function (c) { parts.push(c.textContent); });
                lines.push(parts.join('\t'));
            });
            Tools.copyText(lines.join('\n'), btnCopy, '已复制结果');
        }

        btnRun.addEventListener('click', runBenchmark);
        btnAdd.addEventListener('click', function () { addTask('', ''); });
        btnCopy.addEventListener('click', copyResults);

        // init sample tasks
        SAMPLE_TASKS.forEach(function (t) { addTask(t.name, t.code); });
    });
})();
