'use strict';
(function () {
    var POLL_INTERVAL = 1000;
    var HISTORY_WINDOW_MS = 2 * 60 * 1000;
    var COLORS = {
        upload: '#10b981',
        download: '#3b82f6',
        grid: 'rgba(128,128,128,0.18)',
        axis: 'rgba(128,128,128,0.45)',
        upFill: 'rgba(16,185,129,0.20)',
        downFill: 'rgba(59,130,246,0.20)'
    };

    var tbody = document.getElementById('transfers-tbody');
    var emptyEl = document.getElementById('transfers-empty');
    var chartCanvas = document.getElementById('speed-chart');
    var speedCurrentEl = document.getElementById('speed-current');
    var speedUpEl = document.getElementById('speed-up');
    var speedDownEl = document.getElementById('speed-down');
    var summaryEl = document.getElementById('transfers-summary');
    var statusDotEl = document.getElementById('transfers-status-dot');
    var ctx = chartCanvas.getContext('2d');

    var lastTransfers = [];
    var lastHistory = [];
    var pollTimer = null;
    var dpr = window.devicePixelRatio || 1;
    var activeTab = false;

    function formatBytes(n) {
        if (n === null || n === undefined || isNaN(n)) return '—';
        if (n < 1024) return n + ' B';
        var units = ['KB', 'MB', 'GB', 'TB'];
        var v = n / 1024;
        for (var i = 0; i < units.length; i++) {
            if (v < 1024 || i === units.length - 1) {
                return v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2) + ' ' + units[i];
            }
            v /= 1024;
        }
        return n + ' B';
    }
    function formatSpeed(n) { return formatBytes(n) + '/s'; }
    function formatTime(ms) {
        if (ms === null || ms === undefined || ms < 0) return '—';
        if (ms < 1000) return '<1 秒';
        var s = Math.round(ms / 1000);
        if (s < 60) return s + ' 秒';
        var m = Math.floor(s / 60);
        var rs = s % 60;
        return m + ' 分' + (rs > 0 ? ' ' + rs + ' 秒' : '');
    }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function statusBadge(st) {
        var cls = 'badge-' + st;
        var label = { active: '进行中', completed: '已完成', error: '失败' }[st] || st;
        return '<span class="transfer-badge ' + cls + '">' + esc(label) + '</span>';
    }

    // 1/2/5 × 10^n 系列：把 value 向上圆整到最近的"漂亮"刻度
    function niceCeil(value) {
        if (value <= 0) return 1;
        var exp = Math.floor(Math.log10(value));
        var base = Math.pow(10, exp);
        var norm = value / base; // [1, 10)
        var nice;
        if (norm <= 1) nice = 1;
        else if (norm <= 2) nice = 2;
        else if (norm <= 5) nice = 5;
        else nice = 10;
        return nice * base;
    }
    // 向下圆整到 1/2/5 × 10^n
    function niceFloor(value) {
        if (value <= 0) return 0;
        var exp = Math.floor(Math.log10(value));
        var base = Math.pow(10, exp);
        var norm = value / base;
        var nice;
        if (norm >= 5) nice = 5;
        else if (norm >= 2) nice = 2;
        else nice = 1;
        return nice * base;
    }

    function renderTable(list) {
        if (!list || list.length === 0) {
            tbody.innerHTML = '';
            emptyEl.style.display = '';
            return;
        }
        emptyEl.style.display = 'none';
        var rows = [];
        list.forEach(function (t) {
            var pct = t.total > 0 ? (t.progress * 100) : null;
            var pctText = pct === null
                ? (t.status === 'active' ? '—' : '100%')
                : pct.toFixed(1) + '%';
            var progressBar = '<div class="progress-bar">' +
                '<div class="progress-bar-fill progress-bar-fill--' + esc(t.type) +
                '" style="width:' + (pct === null ? 0 : pct) + '%;"></div>' +
                '<span class="progress-bar-text">' + pctText + '</span></div>';
            var transferredText = formatBytes(t.transferred) +
                (t.total > 0 ? ' / ' + formatBytes(t.total) : '');
            var remaining = t.status === 'active'
                ? formatTime(t.remainingMs)
                : '—';
            rows.push(
                '<tr>' +
                '<td class="col-type"><span class="type-pill type-pill--' + esc(t.type) + '">' +
                (t.type === 'upload' ? '↑ 上传' : '↓ 下载') + '</span></td>' +
                '<td class="col-name" title="' + esc(t.filename) + '">' + esc(t.filename) + '</td>' +
                '<td class="col-ip">' + esc(t.ip) + '</td>' +
                '<td class="col-progress">' + progressBar +
                '<div class="progress-sub">' + transferredText + '</div></td>' +
                '<td class="col-speed">' + esc(formatSpeed(t.speed)) + '</td>' +
                '<td class="col-remaining">' + esc(remaining) + '</td>' +
                '<td class="col-status">' + statusBadge(t.status) + '</td>' +
                '</tr>'
            );
        });
        tbody.innerHTML = rows.join('');
    }

    function resizeCanvas() {
        var rect = chartCanvas.getBoundingClientRect();
        if (rect.width === 0) rect.width = chartCanvas.parentElement.clientWidth;
        dpr = window.devicePixelRatio || 1;
        chartCanvas.width = Math.floor(rect.width * dpr);
        chartCanvas.height = Math.floor(160 * dpr);
        chartCanvas.style.height = '160px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // 把后端稀疏采样填补成每秒一格的连续数组
    function alignHistory(history, now) {
        var stepMs = 1000;
        var out = [];
        var byBucket = {};
        history.forEach(function (p) {
            var b = Math.floor(p.t / stepMs) * stepMs;
            byBucket[b] = p;
        });
        // 用整千秒桶作为查询 key，与后端 sample 对齐
        var startSec = Math.floor((now - HISTORY_WINDOW_MS) / 1000);
        var endSec = Math.floor(now / 1000);
        for (var sec = startSec; sec <= endSec; sec++) {
            var t = sec * stepMs;
            var p = byBucket[t];
            out.push({ t: t, up: p ? (p.up || 0) : 0, down: p ? (p.down || 0) : 0 });
        }
        return out;
    }

    function renderChart(history, now) {
        var rect = chartCanvas.getBoundingClientRect();
        var w = rect.width;
        var h = 160;
        ctx.clearRect(0, 0, w, h);

        var padL = 60, padR = 14, padT = 12, padB = 22;
        var plotW = w - padL - padR;
        var plotH = h - padT - padB;

        // 动态 min-max：根据当前 2 分钟窗口内的实际数据范围
        var dataMax = 0, dataMin = Infinity;
        for (var i = 0; i < history.length; i++) {
            var up = history[i].up || 0;
            var dn = history[i].down || 0;
            var peak = up > dn ? up : dn;
            if (peak > dataMax) dataMax = peak;
            if (up < dataMin) dataMin = up;
            if (dn < dataMin) dataMin = dn;
        }
        if (!isFinite(dataMin)) dataMin = 0;
        if (dataMin < 0) dataMin = 0;

        // 上界：取峰值 1.15 倍，再圆整到 1/2/5 序列；无数据时默认 1KB/s
        var yMax = dataMax > 0 ? niceCeil(dataMax * 1.15) : 1024;
        // 下界：0 起步
        var yMin = 0;
        if (yMin >= yMax) yMax = yMin + 1024;
        var yRange = yMax - yMin;

        // 网格 + Y 轴
        ctx.strokeStyle = COLORS.grid;
        ctx.fillStyle = COLORS.axis;
        ctx.lineWidth = 1;
        ctx.font = '11px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        var yTicks = 4;
        for (var i = 0; i <= yTicks; i++) {
            var y = padT + (plotH * i) / yTicks;
            ctx.beginPath();
            ctx.moveTo(padL, y);
            ctx.lineTo(w - padR, y);
            ctx.stroke();
            var v = yMax - (yRange * i) / yTicks;
            ctx.fillText(formatSpeed(v), padL - 6, y);
        }

        // X 轴时间刻度
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        var xTicks = [-120, -90, -60, -30, 0];
        var baseX = padL + plotW;
        xTicks.forEach(function (sec) {
            var x = baseX + (sec * plotW) / 120;
            if (x < padL || x > w - padR) return;
            ctx.strokeStyle = COLORS.grid;
            ctx.beginPath();
            ctx.moveTo(x, padT);
            ctx.lineTo(x, padT + plotH);
            ctx.stroke();
            ctx.fillStyle = COLORS.axis;
            var label = sec === 0 ? '现在' : (-sec + 's');
            ctx.fillText(label, x, padT + plotH + 4);
        });

        var tToX = function (t) {
            return padL + plotW * (1 - (now - t) / HISTORY_WINDOW_MS);
        };
        var vToY = function (v) {
            return padT + plotH - ((v - yMin) / yRange) * plotH;
        };
        var baselineY = vToY(yMin);

        function drawArea(key, fill, stroke) {
            // 找出第一个有数据的索引
            var firstIdx = -1;
            for (var i = 0; i < history.length; i++) {
                if (history[i][key] > 0) { firstIdx = i; break; }
            }
            if (firstIdx < 0) return;

            // 填充
            ctx.beginPath();
            for (var i = firstIdx; i < history.length; i++) {
                var p = history[i];
                var x = tToX(p.t);
                var y = vToY(p[key] || 0);
                if (i === firstIdx) { ctx.moveTo(x, baselineY); ctx.lineTo(x, y); }
                else ctx.lineTo(x, y);
            }
            var lastX = tToX(history[history.length - 1].t);
            ctx.lineTo(lastX, baselineY);
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();

            // 描边
            ctx.beginPath();
            for (var i = firstIdx; i < history.length; i++) {
                var p = history[i];
                var x = tToX(p.t);
                var y = vToY(p[key] || 0);
                if (i === firstIdx) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // 先画下载（底层），再画上传（上层），便于观察
        drawArea('down', COLORS.downFill, COLORS.download);
        drawArea('up', COLORS.upFill, COLORS.upload);
    }

    function splitByType(list) {
        var up = 0, down = 0;
        list.forEach(function (t) {
            if (t.status !== 'active') return;
            if (t.type === 'upload') up += t.speed || 0;
            else if (t.type === 'download') down += t.speed || 0;
        });
        return { up: up, down: down };
    }

    function updateSummary(list) {
        var active = list.filter(function (t) { return t.status === 'active'; });
        var done = list.filter(function (t) { return t.status === 'completed'; });
        var errs = list.filter(function (t) { return t.status === 'error'; });
        var parts = [];
        if (active.length > 0) parts.push(active.length + ' 进行中');
        if (done.length > 0) parts.push(done.length + ' 已完成');
        if (errs.length > 0) parts.push(errs.length + ' 失败');
        if (parts.length === 0) parts = ['无活动任务'];
        summaryEl.textContent = parts.join(' · ');
        if (active.length > 0) statusDotEl.className = 'status-dot status-dot--active';
        else statusDotEl.className = 'status-dot status-dot--idle';
    }

    function renderSpeedText(list) {
        var s = splitByType(list);
        var total = s.up + s.down;
        speedCurrentEl.textContent = formatSpeed(total);
        speedUpEl.textContent = formatSpeed(s.up);
        speedDownEl.textContent = formatSpeed(s.down);
    }

    function fetchOnce() {
        fetch('/api/admin/transfers', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.success) return;
                lastTransfers = data.transfers || [];
                lastHistory = data.speedHistory || [];
                if (!activeTab) return;
                renderTable(lastTransfers);
                renderChart(alignHistory(lastHistory, data.now), data.now);
                renderSpeedText(lastTransfers);
                updateSummary(lastTransfers);
            })
            .catch(function () { /* ignore */ });
    }

    function startPolling() {
        if (pollTimer) return;
        pollTimer = setInterval(fetchOnce, POLL_INTERVAL);
        fetchOnce();
    }
    function stopPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
    }

    function onTabActivated() {
        activeTab = true;
        resizeCanvas();
        startPolling();
    }
    function onTabDeactivated() {
        activeTab = false;
        stopPolling();
    }

    window.AdminTransfers = {
        onActivate: onTabActivated,
        onDeactivate: onTabDeactivated
    };

    window.addEventListener('resize', function () {
        if (activeTab) resizeCanvas();
    });
})();
