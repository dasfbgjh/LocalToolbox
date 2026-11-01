/* ===== Chronometer (Stopwatch) ===== */
(function () {
    'use strict';

    function pad(n, len) {
        len = len || 2;
        var s = '' + n;
        while (s.length < len) s = '0' + s;
        return s;
    }

    function formatMs(ms) {
        if (ms < 0) ms = 0;
        var h = Math.floor(ms / 3600000);
        ms -= h * 3600000;
        var m = Math.floor(ms / 60000);
        ms -= m * 60000;
        var s = Math.floor(ms / 1000);
        ms -= s * 1000;
        return pad(h) + ':' + pad(m) + ':' + pad(s) + '.' + pad(ms, 3);
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var display = $('display');
        var btnStart = $('btn-start');
        var btnLap = $('btn-lap');
        var btnReset = $('btn-reset');
        var btnClearLaps = $('btn-clear-laps');
        var lapList = $('lap-list');

        var running = false;
        var startTime = 0;      // timestamp when current run segment started
        var accumulated = 0;    // ms accumulated before current run segment
        var elapsed = 0;        // current total elapsed ms
        var laps = [];          // [{total, split}]
        var lastLapTotal = 0;
        var rafId = null;

        function tick() {
            elapsed = accumulated + (Date.now() - startTime);
            display.textContent = formatMs(elapsed);
            rafId = requestAnimationFrame(tick);
        }

        function start() {
            if (running) return;
            running = true;
            startTime = Date.now();
            display.classList.add('running');
            display.classList.remove('paused');
            btnStart.textContent = '暂停';
            btnLap.disabled = false;
            rafId = requestAnimationFrame(tick);
        }

        function pause() {
            if (!running) return;
            running = false;
            accumulated = elapsed;
            cancelAnimationFrame(rafId);
            display.classList.remove('running');
            display.classList.add('paused');
            btnStart.textContent = '继续';
        }

        function toggle() {
            if (running) pause(); else start();
        }

        function reset() {
            running = false;
            cancelAnimationFrame(rafId);
            accumulated = 0;
            elapsed = 0;
            lastLapTotal = 0;
            display.textContent = '00:00:00.000';
            display.classList.remove('running', 'paused');
            btnStart.textContent = '开始';
            btnLap.disabled = true;
        }

        function recordLap() {
            if (!running) return;
            var total = elapsed;
            var split = total - lastLapTotal;
            lastLapTotal = total;
            laps.push({ total: total, split: split });
            renderLaps();
        }

        function clearLaps() {
            laps = [];
            lastLapTotal = elapsed;
            renderLaps();
        }

        function renderLaps() {
            lapList.innerHTML = '';
            if (laps.length === 0) {
                lapList.appendChild(Tools.el('div', { class: 'chrono-empty', text: '暂无记圈记录' }));
                return;
            }
            var splits = laps.map(function (l) { return l.split; });
            var minSplit = Math.min.apply(null, splits);
            var maxSplit = Math.max.apply(null, splits);
            // newest first
            for (var i = laps.length - 1; i >= 0; i--) {
                var lap = laps[i];
                var cls = 'chrono-lap';
                if (laps.length > 1) {
                    if (lap.split === minSplit) cls += ' fastest';
                    else if (lap.split === maxSplit) cls += ' slowest';
                }
                lapList.appendChild(Tools.el('div', { class: cls }, [
                    Tools.el('span', { class: 'lap-idx', text: '#' + (i + 1) }),
                    Tools.el('span', { class: 'lap-split', text: '圈速 ' + formatMs(lap.split) }),
                    Tools.el('span', { class: 'lap-total', text: '总计 ' + formatMs(lap.total) })
                ]));
            }
        }

        btnStart.addEventListener('click', toggle);
        btnLap.addEventListener('click', recordLap);
        btnReset.addEventListener('click', function () { reset(); clearLaps(); });
        btnClearLaps.addEventListener('click', clearLaps);

        document.addEventListener('keydown', function (e) {
            var tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (e.code === 'Space') { e.preventDefault(); toggle(); }
            else if (e.key === 'l' || e.key === 'L') { if (running) recordLap(); }
            else if (e.key === 'r' || e.key === 'R') { reset(); clearLaps(); }
        });

        renderLaps();
    });
})();
