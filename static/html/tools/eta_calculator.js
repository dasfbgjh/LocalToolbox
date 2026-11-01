/* ===== ETA Calculator ===== */
(function () {
    'use strict';

    function fmtNum(n, decimals) {
        if (!isFinite(n)) return '—';
        decimals = decimals == null ? 2 : decimals;
        var f = Math.pow(10, decimals);
        return (Math.round(n * f) / f).toFixed(decimals);
    }

    function formatDuration(sec) {
        if (!isFinite(sec) || sec < 0) return '—';
        if (sec < 1) return fmtNum(sec, 2) + ' 秒';
        var s = Math.floor(sec);
        var days = Math.floor(s / 86400);
        s -= days * 86400;
        var h = Math.floor(s / 3600);
        s -= h * 3600;
        var m = Math.floor(s / 60);
        s -= m * 60;
        var parts = [];
        if (days > 0) parts.push(days + '天');
        if (h > 0) parts.push(h + '小时');
        if (m > 0) parts.push(m + '分钟');
        if (s > 0 || parts.length === 0) parts.push(s + '秒');
        return parts.join('');
    }

    function fmtDateTime(d) {
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
            ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    function toLocalInput(d) {
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
            'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var doneEl = $('done'), totalEl = $('total');
        var modeEl = $('time-mode');
        var elapsedWrap = $('elapsed-wrap'), rangeWrap = $('range-wrap');
        var elapsedEl = $('elapsed');
        var startEl = $('start-time'), endEl = $('end-time');
        var unitEl = $('unit');
        var rPercent = $('r-percent'), rSpeed = $('r-speed'), rRemain = $('r-remain');
        var rEta = $('r-eta'), rDoneTime = $('r-done-time');

        var now = new Date();
        endEl.value = toLocalInput(now);
        startEl.value = toLocalInput(new Date(now.getTime() - 60 * 1000));

        function getElapsed() {
            if (modeEl.value === 'elapsed') {
                return parseFloat(elapsedEl.value);
            }
            var s = new Date(startEl.value).getTime();
            var e = new Date(endEl.value).getTime();
            if (isNaN(s) || isNaN(e)) return NaN;
            return (e - s) / 1000;
        }

        function clearResults() {
            rPercent.textContent = '—';
            rSpeed.textContent = '—';
            rRemain.textContent = '—';
            rEta.textContent = '—';
            rDoneTime.textContent = '—';
        }

        function calc() {
            var done = parseFloat(doneEl.value);
            var total = parseFloat(totalEl.value);
            var elapsed = getElapsed();
            var unit = unitEl.value;

            if (isNaN(done) || isNaN(total) || isNaN(elapsed)) {
                clearResults();
                return;
            }

            var percent = total > 0 ? (done / total * 100) : 0;
            var remainCount = total - done;
            var speed = elapsed > 0 ? (done / elapsed) : 0;
            var remainSec = speed > 0 ? (remainCount / speed) : Infinity;
            var completed = done >= total && total > 0;

            rPercent.textContent = fmtNum(percent, 2) + '%';
            rSpeed.textContent = speed > 0 ? (fmtNum(speed, 3) + ' ' + unit + '/秒') : '—';
            rRemain.textContent = (remainCount >= 0 ? fmtNum(remainCount, 2) : '—') + ' ' + unit;
            rEta.textContent = completed ? '已完成' : formatDuration(remainSec);
            rDoneTime.textContent = completed ? '已完成' :
                (isFinite(remainSec) ? fmtDateTime(new Date(Date.now() + remainSec * 1000)) : '—');
        }

        function switchMode() {
            if (modeEl.value === 'elapsed') {
                elapsedWrap.style.display = '';
                rangeWrap.style.display = 'none';
            } else {
                elapsedWrap.style.display = 'none';
                rangeWrap.style.display = '';
            }
            calc();
        }

        [doneEl, totalEl, elapsedEl, startEl, endEl].forEach(function (el) {
            el.addEventListener('input', calc);
        });
        modeEl.addEventListener('change', switchMode);
        unitEl.addEventListener('change', calc);
        $('btn-now').addEventListener('click', function () {
            endEl.value = toLocalInput(new Date());
            calc();
        });

        switchMode();
        calc();
    });
})();
