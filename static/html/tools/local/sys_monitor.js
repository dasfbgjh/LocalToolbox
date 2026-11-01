(function () {
    'use strict';
    var Api = window.App && window.App.api ? window.App.api : window.Api;

    function $(id) { return document.getElementById(id); }

    // ===== 工具函数 =====
    function formatBytes(b) {
        if (b == null || isNaN(b)) return '-';
        if (b < 1024) return b + ' B';
        var u = ['KB', 'MB', 'GB', 'TB'];
        var i = -1;
        var n = b;
        do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
        return n.toFixed(2) + ' ' + u[i];
    }
    function formatPct(v) {
        if (v == null || isNaN(v)) return '--%';
        return (v * 100).toFixed(1) + '%';
    }
    function formatHz(hz) {
        if (!hz || hz <= 0) return 'N/A';
        if (hz >= 1e9) return (hz / 1e9).toFixed(2) + ' GHz';
        if (hz >= 1e6) return (hz / 1e6).toFixed(0) + ' MHz';
        if (hz >= 1e3) return (hz / 1e3).toFixed(0) + ' KHz';
        return hz + ' Hz';
    }
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function fmtTime(d) {
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }

    function showBanner(type, msg) {
        var cls = 'info';
        if (type === 'error') cls = 'error';
        else if (type === 'warn') cls = 'warn';
        else if (type === 'success') cls = 'success';
        var el = $('sm-banner');
        if (!el) return;
        el.innerHTML = '<div class="tool-banner ' + cls + '">' + window.App.escapeHtml(msg) + '</div>';
        if (type === 'success') setTimeout(clearBanner, 3000);
    }
    function clearBanner() { var el = $('sm-banner'); if (el) el.innerHTML = ''; }

    // ===== 静态信息渲染 =====
    function renderKv(items) {
        var html = '<div class="sm-kv">';
        items.forEach(function (it) {
            if (it == null) return;
            var k = it[0], v = it[1];
            if (v == null || v === '') return;
            html += '<div class="k">' + window.App.escapeHtml(k) + '</div>' +
                '<div class="v">' + (typeof v === 'string' ? window.App.escapeHtml(v) : v) + '</div>';
        });
        return html + '</div>';
    }
    function wrapKv(arr) { return (arr && arr.length) ? renderKv(arr) : '<div class="sm-empty">无信息</div>'; }

    function renderOs(os) {
        if (!os) return '<div class="sm-empty">无 OS 信息</div>';
        return wrapKv([
            ['名称', os.name],
            ['版本', os.version],
            ['内核', os.kernel],
            ['位数', (os.is64bit ? '64-bit' : (os.is32bit ? '32-bit' : '?'))],
            ['字节序', os.isLittleEndian ? 'Little Endian' : (os.isBigEndian ? 'Big Endian' : '?')]
        ]);
    }
    function renderBoard(b) {
        if (!b) return '<div class="sm-empty">无主板信息</div>';
        return wrapKv([
            ['厂商', b.vendor],
            ['型号', b.name],
            ['版本', b.version],
            ['序列号', b.serial]
        ]);
    }
    function renderCpusStatic(cpus) {
        if (!cpus || !cpus.length) return '<div class="sm-empty">无 CPU 信息</div>';
        var html = '<div class="sm-list">';
        cpus.forEach(function (c, i) {
            var flags = (c.flags || []).slice(0, 8).join(' ');
            if ((c.flags || []).length > 8) flags += ' …';
            html += '<div class="sm-list-item">' +
                '<div class="sm-list-item-title">CPU ' + (i + 1) + ' · ' + window.App.escapeHtml(c.modelName || '-') + '</div>' +
                '<div class="sm-list-item-meta">' +
                '厂商: ' + window.App.escapeHtml(c.vendor || '-') + '<br>' +
                '核心: ' + (c.numPhysicalCores || 0) + 'P / ' + (c.numLogicalCores || 0) + 'L<br>' +
                '频率: ' + formatHz(c.regularFrequencyHz) + ' ~ ' + formatHz(c.maxFrequencyHz) +
                (flags ? '<br>指令集: ' + window.App.escapeHtml(flags) : '') +
                '</div></div>';
        });
        return html + '</div>';
    }
    function renderMemory(m) {
        if (!m) return '<div class="sm-empty">无内存信息</div>';
        var total = m.totalHuman || formatBytes(m.totalBytes);
        var mods = m.modules || [];
        if (!mods.length) return wrapKv([['总容量', total]]);
        var html = '<div class="sm-kv" style="margin-bottom:0.375rem;"><div class="k">总容量</div><div class="v">' + window.App.escapeHtml(total) + '</div></div>';
        html += '<div class="sm-list">';
        mods.forEach(function (md, i) {
            html += '<div class="sm-list-item">' +
                '<div class="sm-list-item-title">DIMM ' + (i + 1) + ' · ' + window.App.escapeHtml(md.sizeHuman || formatBytes(md.sizeBytes)) + '</div>' +
                '<div class="sm-list-item-meta">' +
                window.App.escapeHtml(md.vendor || '-') + ' · ' + window.App.escapeHtml(md.model || '-') + '<br>' +
                '频率: ' + formatHz(md.frequencyHz) + '<br>' +
                'SN: ' + window.App.escapeHtml(md.serial || '-') +
                '</div></div>';
        });
        return html + '</div>';
    }
    function renderDisksStatic(disks) {
        if (!disks || !disks.length) return '<div class="sm-empty">无磁盘信息</div>';
        var html = '<div class="sm-list">';
        disks.forEach(function (d) {
            var mps = (d.mountPoints || []).join(', ') || '(无挂载点)';
            html += '<div class="sm-list-item">' +
                '<div class="sm-list-item-title">' + window.App.escapeHtml(d.model || '-') + '</div>' +
                '<div class="sm-list-item-meta">' +
                window.App.escapeHtml(d.vendor || '-') + ' · ' + window.App.escapeHtml(d.interface || '-') + ' · ' + window.App.escapeHtml(d.sizeHuman || formatBytes(d.sizeBytes)) + '<br>' +
                '挂载: ' + window.App.escapeHtml(mps) + '<br>' +
                'SN: ' + window.App.escapeHtml(d.serial || '-') +
                '</div></div>';
        });
        return html + '</div>';
    }
    function renderGpus(gpus) {
        if (!gpus || !gpus.length) return '<div class="sm-empty">无显卡信息</div>';
        var html = '<div class="sm-list">';
        gpus.forEach(function (g, i) {
            html += '<div class="sm-list-item">' +
                '<div class="sm-list-item-title">GPU ' + (i + 1) + ' · ' + window.App.escapeHtml(g.name || '-') + '</div>' +
                '<div class="sm-list-item-meta">' +
                window.App.escapeHtml(g.vendor || '-') + ' · 驱动 ' + window.App.escapeHtml(g.driverVersion || '-') + '<br>' +
                '显存: 专 ' + window.App.escapeHtml(g.dedicatedMemoryHuman || formatBytes(g.dedicatedMemoryBytes)) +
                ' / 共 ' + window.App.escapeHtml(g.sharedMemoryHuman || formatBytes(g.sharedMemoryBytes)) + '<br>' +
                '频率: ' + formatHz(g.frequencyHz) + ' · 核心: ' + (g.numCores || 0) +
                '</div></div>';
        });
        return html + '</div>';
    }
    function renderNetworks(nets) {
        if (!nets || !nets.length) return '<div class="sm-empty">无网络适配器</div>';
        var html = '<div class="sm-list">';
        nets.forEach(function (n, i) {
            html += '<div class="sm-list-item">' +
                '<div class="sm-list-item-title">' + window.App.escapeHtml(n.description || ('Adapter ' + (i + 1))) + '</div>' +
                '<div class="sm-list-item-meta">' +
                'IPv4: ' + window.App.escapeHtml(n.ip4 || '-') + '<br>' +
                'IPv6: ' + window.App.escapeHtml(n.ip6 || '-') + '<br>' +
                'MAC: ' + window.App.escapeHtml(n.mac || '-') +
                '</div></div>';
        });
        return html + '</div>';
    }
    function renderBatteries(bats) {
        if (!bats || !bats.length) return '<div class="sm-empty">未检测到电池</div>';
        var html = '<div class="sm-list">';
        bats.forEach(function (b, i) {
            var cap = (b.capacity != null) ? (b.capacity * 100).toFixed(0) + '%' : '-';
            html += '<div class="sm-list-item">' +
                '<div class="sm-list-item-title">电池 ' + (i + 1) + ' · ' + window.App.escapeHtml(b.model || '-') + '</div>' +
                '<div class="sm-list-item-meta">' +
                window.App.escapeHtml(b.vendor || '-') + ' · ' + window.App.escapeHtml(b.technology || '-') + '<br>' +
                '状态: ' + window.App.escapeHtml(b.state || '-') + ' · 容量: ' + cap + '<br>' +
                '能量: ' + (b.energyNow || 0) + ' / ' + (b.energyFull || 0) +
                '</div></div>';
        });
        return html + '</div>';
    }

    // ===== 顶栏统计 =====
    function setStat(id, text) { var el = $(id); if (el) el.textContent = text; }

    function applyTopbarStats(info) {
        if (!info) return;
        // 主机：使用 mainboard.name 或 hostname（这里用 mainboard 名称 + OS 名）
        var host = (info.mainboard && (info.mainboard.name || info.mainboard.vendor)) || '-';
        setStat('sm-stat-host', host);
        // OS
        var osName = (info.os && (info.os.name || info.os.version)) || '-';
        if (info.os && info.os.version && info.os.name && info.os.version.length < 40) {
            osName = info.os.name + ' ' + info.os.version;
        }
        setStat('sm-stat-os', osName);
        // Cores
        var cpus = info.cpus || [];
        var phys = 0, log = 0;
        cpus.forEach(function (c) { phys += c.numPhysicalCores || 0; log += c.numLogicalCores || 0; });
        setStat('sm-stat-cores', cpus.length ? (phys + 'P / ' + log + 'L') : '-');
        // 内存
        if (info.memory) {
            setStat('sm-stat-mem', info.memory.totalHuman || formatBytes(info.memory.totalBytes));
        } else {
            setStat('sm-stat-mem', '-');
        }
    }

    // ===== CPU 实时 =====
    function renderCpuLive(data) {
        if (!data) return;
        var overall = data.overall || 0;
        $('sm-cpu-overall').textContent = (overall * 100).toFixed(1) + '%';
        $('sm-cpu-meta').textContent = (data.sleepMs || 200) + 'ms 采样';
        var bar = $('sm-cpu-bar');
        bar.style.width = (overall * 100).toFixed(1) + '%';
        bar.className = 'sm-bar-fill' + (overall >= 0.85 ? ' danger' : (overall >= 0.6 ? ' warn' : ''));
        $('sm-cpu-sub').textContent = (data.threadUtilization || []).length + ' 逻辑线程';

        var tu = data.threadUtilization || [];
        var tf = data.threadFrequencyHz || [];
        var host = $('sm-cpu-threads');
        if (!tu.length) {
            host.innerHTML = '<div class="sm-empty">无数据</div>';
            return;
        }
        if (host.children.length !== tu.length) {
            host.innerHTML = '';
            for (var i = 0; i < tu.length; i++) {
                var t = document.createElement('div');
                t.className = 'sm-thread';
                t.innerHTML = '<div class="sm-thread-head"><span>#' + i + '</span><span class="sm-freq">' + formatHz(tf[i]) + '</span></div>' +
                    '<div class="sm-thread-val">--%</div>' +
                    '<div class="sm-bar"><div class="sm-bar-fill" style="width:0%"></div></div>';
                host.appendChild(t);
            }
        }
        for (var j = 0; j < tu.length; j++) {
            var v = tu[j] || 0;
            var cell = host.children[j];
            if (!cell) continue;
            cell.querySelector('.sm-thread-val').textContent = (v * 100).toFixed(0) + '%';
            cell.querySelector('.sm-freq').textContent = formatHz(tf[j]);
            var fill = cell.querySelector('.sm-bar-fill');
            fill.style.width = (v * 100).toFixed(1) + '%';
            fill.className = 'sm-bar-fill' + (v >= 0.85 ? ' danger' : (v >= 0.6 ? ' warn' : ''));
        }
    }

    // ===== 内存实时 =====
    function renderRamLive(data) {
        if (!data) return;
        var used = data.usedBytes || 0;
        var total = data.totalBytes || 0;
        var ratio = data.usedRatio || 0;
        $('sm-ram-used').textContent = data.usedHuman || formatBytes(used);
        $('sm-ram-used-pct').textContent = (ratio * 100).toFixed(1) + '% / ' + (data.totalHuman || formatBytes(total));
        $('sm-ram-sub').textContent = '总 ' + (data.totalHuman || formatBytes(total));
        var bar = $('sm-ram-bar');
        bar.style.width = (ratio * 100).toFixed(1) + '%';
        bar.className = 'sm-bar-fill' + (ratio >= 0.9 ? ' danger' : (ratio >= 0.75 ? ' warn' : ''));
        $('sm-ram-meta').innerHTML =
            '已用 <b>' + window.App.escapeHtml(data.usedHuman || '-') + '</b> · ' +
            '空闲 ' + window.App.escapeHtml(data.freeHuman || '-') + ' · ' +
            '可用 ' + window.App.escapeHtml(data.availableHuman || '-');
    }

    // ===== 磁盘实时 =====
    function renderDisksLive(data) {
        if (!data) return;
        var arr = data.disks || [];
        var host = $('sm-disks');
        if (!arr.length) {
            host.innerHTML = '<div class="sm-empty">未检测到磁盘</div>';
            $('sm-disks-sub').textContent = '无';
            return;
        }
        if (host.children.length !== arr.length) {
            host.innerHTML = '';
            arr.forEach(function (d) {
                var node = document.createElement('div');
                node.className = 'sm-disk';
                node.innerHTML =
                    '<div class="sm-disk-head">' +
                    '<span class="sm-disk-name">' + window.App.escapeHtml(d.model || '-') + '</span>' +
                    '<span class="sm-disk-tag">' + window.App.escapeHtml(d.interface || '-') + '</span>' +
                    '<span class="sm-disk-tag muted">' + window.App.escapeHtml(d.sizeHuman || '-') + '</span>' +
                    '</div>' +
                    '<div class="sm-disk-mounts" data-mounts></div>';
                host.appendChild(node);
            });
        }
        var total = 0;
        for (var i = 0; i < arr.length; i++) {
            var d = arr[i];
            var node = host.children[i];
            if (!node) continue;
            var mps = node.querySelector('[data-mounts]');
            var mounts = d.mounts || [];
            if (mps.children.length !== mounts.length) {
                mps.innerHTML = '';
                mounts.forEach(function (mp) {
                    var row = document.createElement('div');
                    row.className = 'sm-disk-mount';
                    row.innerHTML =
                        '<div class="sm-disk-mount-name">' + window.App.escapeHtml(mp.mountPoint) + '</div>' +
                        '<div class="sm-disk-mount-bar">' +
                        '<div class="sm-bar"><div class="sm-bar-fill" style="width:0%"></div></div>' +
                        '<div class="sm-disk-mount-meta">--</div>' +
                        '</div>';
                    mps.appendChild(row);
                });
            }
            for (var k = 0; k < mounts.length; k++) {
                var mp = mounts[k];
                var row2 = mps.children[k];
                if (!row2) continue;
                var ratio = mp.usedRatio || 0;
                var fill = row2.querySelector('.sm-bar-fill');
                var meta = row2.querySelector('.sm-disk-mount-meta');
                fill.style.width = (ratio * 100).toFixed(1) + '%';
                fill.className = 'sm-bar-fill' + (ratio >= 0.9 ? ' danger' : (ratio >= 0.8 ? ' warn' : ''));
                if (mp.error) {
                    meta.textContent = '失败: ' + mp.error;
                    meta.style.color = '#ef4444';
                } else {
                    meta.style.color = '';
                    meta.textContent = '剩 ' + (mp.freeHuman || '-') + ' · 用 ' + (ratio * 100).toFixed(1) + '%';
                }
                total++;
            }
        }
        $('sm-disks-sub').textContent = arr.length + ' 盘 / ' + total + ' 挂载点';
    }

    // ===== Tabs =====
    function bindTabs() {
        var tabs = $('sm-tabs');
        if (!tabs) return;
        tabs.addEventListener('click', function (ev) {
            var btn = ev.target.closest('.sm-tab');
            if (!btn) return;
            var name = btn.getAttribute('data-tab');
            Array.prototype.forEach.call(tabs.querySelectorAll('.sm-tab'), function (t) {
                t.classList.toggle('active', t === btn);
            });
            Array.prototype.forEach.call(document.querySelectorAll('.sm-tab-panel'), function (p) {
                p.hidden = p.id !== ('sm-panel-' + name);
            });
        });
    }

    // ===== 拉取与定时 =====
    var timer = null;
    var clockTimer = null;

    function loadStatic() {
        Api.get('/sys/info').then(function (data) {
            if (!data || !data.success) {
                showBanner('error', '读取系统信息失败: ' + ((data && data.error) || ''));
                return;
            }
            applyTopbarStats(data);
            $('sm-panel-os').innerHTML = renderOs(data.os);
            $('sm-panel-board').innerHTML = renderBoard(data.mainboard);
            $('sm-panel-cpu').innerHTML = renderCpusStatic(data.cpus);
            $('sm-panel-memory').innerHTML = renderMemory(data.memory);
            $('sm-panel-disks').innerHTML = renderDisksStatic(data.disks);
            $('sm-panel-gpus').innerHTML = renderGpus(data.gpus);
            $('sm-panel-networks').innerHTML = renderNetworks(data.networks);
            $('sm-panel-batteries').innerHTML = renderBatteries(data.batteries);
        }).catch(function (err) {
            showBanner('error', '读取系统信息失败: ' + err);
        });
    }

    function loadCpu() { return Api.get('/sys/cpu?sleep=200').then(renderCpuLive); }
    function loadRam() { return Api.get('/sys/ram').then(renderRamLive); }
    function loadDisks() { return Api.get('/sys/disks').then(renderDisksLive); }

    function refreshAll() {
        var btn = $('sm-btn-refresh');
        if (btn) btn.classList.add('spinning');
        Promise.all([loadCpu(), loadRam(), loadDisks()])
            .catch(function (err) { showBanner('error', '刷新失败: ' + err); })
            .then(function () { if (btn) setTimeout(function () { btn.classList.remove('spinning'); }, 250); });
    }

    function startTimer() {
        stopTimer();
        if (!$('sm-auto').checked) return;
        var interval = parseInt($('sm-interval').value, 10) || 2000;
        timer = setInterval(refreshAll, interval);
    }
    function stopTimer() {
        if (timer) { clearInterval(timer); timer = null; }
    }

    function startClock() {
        if (clockTimer) clearInterval(clockTimer);
        var tick = function () { setStat('sm-stat-time', fmtTime(new Date())); };
        tick();
        clockTimer = setInterval(tick, 1000);
    }

    // ===== 启动 =====
    function init() {
        bindTabs();
        loadStatic();
        refreshAll();
        startTimer();
        startClock();
        $('sm-btn-refresh').addEventListener('click', function () {
            refreshAll();
            startTimer();
        });
        $('sm-auto').addEventListener('change', function () {
            if ($('sm-auto').checked) startTimer();
            else stopTimer();
        });
        $('sm-interval').addEventListener('change', startTimer);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
