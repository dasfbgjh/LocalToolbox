(function () {
    'use strict';
    var Api = window.Api;

    function showBanner(type, msg) {
        var cls = 'info';
        if (type === 'error') cls = 'error';
        else if (type === 'warn') cls = 'warn';
        else if (type === 'success') cls = 'success';
        var el = document.getElementById('banner');
        if (!el) return;
        el.innerHTML = '<div class="tool-banner ' + cls + '">' + window.App.escapeHtml(msg) + '</div>';
        if (type === 'success') setTimeout(clearBanner, 3000);
    }
    function clearBanner() { var el = document.getElementById('banner'); if (el) el.innerHTML = ''; }

    var selectedFiles = [];
    var modelData = null;
    var pollTimer = null;
    var tasks = {};
    var taskOrder = [];

    function $(id) { return document.getElementById(id); }
    var inputList;
    var taskListEl;

    function formatSize(b) {
        if (!b && b !== 0) return '-';
        var k = 1024, u = ['B', 'KB', 'MB', 'GB', 'TB'];
        var i = Math.floor(Math.log(b) / Math.log(k));
        i = Math.max(0, Math.min(i, u.length - 1));
        return (b / Math.pow(k, i)).toFixed(2) + ' ' + u[i];
    }

    function formatMs(ms) {
        if (!ms || ms < 0) return '--';
        var s = Math.floor(ms / 1000);
        if (s < 60) return s + '秒';
        var m = Math.floor(s / 60);
        var rs = s % 60;
        if (m < 60) return m + '分' + rs + '秒';
        var h = Math.floor(m / 60);
        var rm = m % 60;
        return h + '时' + rm + '分' + rs + '秒';
    }

    function escapeAttr(s) {
        return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ===== Model select helpers =====
    function fillSelect(id, items, label) {
        var sel = $(id);
        if (!sel) return;
        if (!items || items.length === 0) {
            sel.innerHTML = '<option value="">无可用' + label + '</option>';
            sel.disabled = true;
            return;
        }
        var html = '';
        items.forEach(function (m) {
            html += '<option value="' + escapeAttr(m.id) + '">' + escapeHtml(m.name || m.id) + '</option>';
        });
        sel.innerHTML = html;
        sel.disabled = false;
    }

    function fillClsModeSelect(id, modes) {
        var sel = $(id);
        if (!sel) return;
        var html = '<option value="">不使用</option>';
        if (modes && modes.length > 0) {
            modes.forEach(function (m) {
                var label = m.mode === 'orientation' ? '方向检测' : '角度分类';
                html += '<option value="' + escapeAttr(m.mode) + '">' + escapeHtml(label) + '</option>';
            });
        }
        sel.innerHTML = html;
        sel.disabled = false;
    }

    function fillAlgoSelect(id, algos, label) {
        var sel = $(id);
        if (!sel) return;
        if (!algos || algos.length === 0) {
            sel.innerHTML = '<option value="">无可用' + label + '</option>';
            sel.disabled = true;
            return;
        }
        var html = '';
        algos.forEach(function (a) {
            var display = a.label || a.algo;
            html += '<option value="' + escapeAttr(a.algo) + '">' + escapeHtml(display) + '</option>';
        });
        sel.innerHTML = html;
        sel.disabled = false;
    }

    function onClsModeChange() {
        if (!modelData) return;
        var modeSel = $('param-cls-mode');
        var mode = modeSel ? modeSel.value : '';
        var models = [];
        if (mode && modelData.clsModes) {
            for (var i = 0; i < modelData.clsModes.length; i++) {
                if (modelData.clsModes[i].mode === mode) {
                    models = modelData.clsModes[i].models || [];
                    break;
                }
            }
        }
        fillSelect('param-cls-model', models, '检测模型');
    }

    function onLayoutAlgoChange() {
        if (!modelData) return;
        var algoSel = $('param-layout-algo');
        var algo = algoSel ? algoSel.value : '';
        var models = [];
        if (algo && modelData.layoutAlgos) {
            for (var i = 0; i < modelData.layoutAlgos.length; i++) {
                if (modelData.layoutAlgos[i].algo === algo) {
                    models = modelData.layoutAlgos[i].models || [];
                    break;
                }
            }
        }
        fillSelect('param-layout', models, '版面模型');
    }

    function onTableAlgoChange() {
        if (!modelData) return;
        var algoSel = $('param-table-algo');
        var algo = algoSel ? algoSel.value : '';
        var wirelessModels = [];
        var wiredModels = [];
        if (modelData.tableAlgos) {
            for (var i = 0; i < modelData.tableAlgos.length; i++) {
                var a = modelData.tableAlgos[i];
                if (a.algo === 'wireless' || a.algo === 'combined')
                    wirelessModels = a.models || wirelessModels;
                if (a.algo === 'wired')
                    wiredModels = a.models || wiredModels;
                if (a.algo === 'combined' && a.wiredModels && a.wiredModels.length > 0)
                    wiredModels = a.wiredModels;
            }
        }

        var wirelessGroup = $('table-wireless-group');
        if (wirelessGroup) {
            wirelessGroup.style.display = (algo === 'wireless' || algo === 'combined') ? '' : 'none';
        }
        if ((algo === 'wireless' || algo === 'combined') && wirelessModels.length > 0) {
            fillSelect('param-table-wireless', wirelessModels, '无线模型');
        }

        var wiredGroup = $('table-wired-group');
        if (wiredGroup) {
            wiredGroup.style.display = (algo === 'wired' || algo === 'combined') ? '' : 'none';
        }
        if ((algo === 'wired' || algo === 'combined') && wiredModels.length > 0) {
            fillSelect('param-table-wired', wiredModels, '有线模型');
        }

        var clsGroup = $('table-cls-group');
        if (clsGroup) clsGroup.style.display = (algo === 'combined') ? '' : 'none';
        if (algo === 'combined' && modelData && modelData.tableClsModels) {
            fillSelect('param-table-cls', modelData.tableClsModels, '检测模型');
        }
    }

    function onModeChange() {
        var modeSel = $('param-mode');
        var mode = modeSel ? modeSel.value : 'doc';
        var isTable = mode === 'table';
        var isPlate = mode === 'plate';
        var fsText = $('fs-text');
        var fsLayout = $('fs-layout');
        var fsTable = $('fs-table');
        var fsPlate = $('fs-plate');
        if (fsText) fsText.style.display = isPlate ? 'none' : '';
        if (fsLayout) fsLayout.style.display = (isTable || isPlate) ? 'none' : '';
        if (fsTable) fsTable.style.display = isTable ? '' : 'none';
        if (fsPlate) fsPlate.style.display = isPlate ? '' : 'none';
    }

    function initModelSelect() {
        Api.localTools.batchOcr.models().then(function (resp) {
            if (!resp || !resp.success) return;
            modelData = resp;

            fillSelect('param-model', resp.textModels, '识别模型');
            fillClsModeSelect('param-cls-mode', resp.clsModes);
            onClsModeChange();
            fillAlgoSelect('param-layout-algo', resp.layoutAlgos, '版面算法');
            onLayoutAlgoChange();

            var tableAlgoSel = $('param-table-algo');
            if (tableAlgoSel) {
                tableAlgoSel.innerHTML = '';
                if (resp.tableAlgos && resp.tableAlgos.length > 0) {
                    resp.tableAlgos.forEach(function (a) {
                        var opt = document.createElement('option');
                        opt.value = a.algo;
                        opt.textContent = a.label || a.algo;
                        tableAlgoSel.appendChild(opt);
                    });
                    tableAlgoSel.disabled = false;
                } else {
                    tableAlgoSel.innerHTML = '<option value="">无可用表格算法</option>';
                    tableAlgoSel.disabled = true;
                }
            }
            onTableAlgoChange();

            fillSelect('param-plate-model', resp.plateModels, '车牌模型');

            var clsModeSel = $('param-cls-mode');
            if (clsModeSel) clsModeSel.addEventListener('change', onClsModeChange);
            var layoutAlgoSel = $('param-layout-algo');
            if (layoutAlgoSel) layoutAlgoSel.addEventListener('change', onLayoutAlgoChange);
            var tableAlgoSel2 = $('param-table-algo');
            if (tableAlgoSel2) tableAlgoSel2.addEventListener('change', onTableAlgoChange);
            var modeSel = $('param-mode');
            if (modeSel) modeSel.addEventListener('change', onModeChange);
            onModeChange();
        }).catch(function (err) {
            ['param-model', 'param-cls-mode', 'param-cls-model', 'param-layout-algo', 'param-layout', 'param-table-algo', 'param-table-wireless', 'param-table-wired', 'param-table-cls', 'param-plate-model'].forEach(function (id) {
                var sel = $(id);
                if (sel) sel.innerHTML = '<option value="">加载失败</option>';
            });
            void err;
        });
    }

    function initEventBindings() {
        var boxThresh = $('param-boxScoreThresh');
        var boxThreshVal = $('param-boxScoreThresh-val');
        if (boxThresh && boxThreshVal) {
            boxThresh.addEventListener('input', function () {
                boxThreshVal.textContent = parseFloat(boxThresh.value).toFixed(2);
            });
        }
        var unClip = $('param-unClipRatio');
        var unClipVal = $('param-unClipRatio-val');
        if (unClip && unClipVal) {
            unClip.addEventListener('input', function () {
                unClipVal.textContent = parseFloat(unClip.value).toFixed(2);
            });
        }

        var boxThresh2 = $('param-boxThresh');
        var boxThresh2Val = $('param-boxThresh-val');
        if (boxThresh2 && boxThresh2Val) {
            boxThresh2.addEventListener('input', function () {
                boxThresh2Val.textContent = parseFloat(boxThresh2.value).toFixed(2);
            });
        }

        var dropScore = $('param-dropScore');
        var dropScoreVal = $('param-dropScore-val');
        if (dropScore && dropScoreVal) {
            dropScore.addEventListener('input', function () {
                dropScoreVal.textContent = parseFloat(dropScore.value).toFixed(2);
            });
        }

        var clsThresh = $('param-clsThresh');
        var clsThreshVal = $('param-clsThresh-val');
        if (clsThresh && clsThreshVal) {
            clsThresh.addEventListener('input', function () {
                clsThreshVal.textContent = parseFloat(clsThresh.value).toFixed(2);
            });
        }

        $('btn-browse-input').onclick = function () {
            window.FsBrowser.open({
                mode: 'multi',
                api: 'local',
                title: '选择图片文件',
                hint: '勾选文件后点"选择"加入（可跨目录多次勾选）',
                multiFilter: function (e) { return !e.isDir; },
                onConfirm: function (entries) {
                    var merged = {};
                    selectedFiles.forEach(function (f) { merged[f.path] = f; });
                    entries.forEach(function (e) {
                        if (!merged[e.fullPath]) {
                            merged[e.fullPath] = {
                                path: e.fullPath,
                                name: e.name,
                                size: e.size,
                                isDir: e.isDir,
                                modified: e.modified || 0
                            };
                        }
                    });
                    selectedFiles = Object.keys(merged).map(function (k) { return merged[k]; });
                    renderInputList();
                }
            });
        };
        $('btn-clear-input').onclick = function () {
            selectedFiles = [];
            renderInputList();
        };

        $('btn-start').onclick = function () {
            if (!selectedFiles.length) return;
            clearBanner();

            var params = collectOcrParams();
            params.filePaths = selectedFiles.map(function (f) { return f.path; });

            $('btn-start').disabled = true;

            Api.localTools.batchOcr.submit(params).then(function (resp) {
                $('btn-start').disabled = false;
                if (resp && resp.success && resp.taskId) {
                    tasks[resp.taskId] = {
                        id: resp.taskId,
                        fileCount: selectedFiles.length,
                        status: 'queued',
                        total: selectedFiles.length,
                        done: 0,
                        failed: 0,
                        results: null,
                        progress: null,
                        createdAt: Date.now(),
                        startedAt: null,
                        finishedAt: null
                    };
                    taskOrder.push(resp.taskId);
                    renderTasks();
                    showBanner('success', '已提交 ' + selectedFiles.length + ' 张图片的批量识别任务');
                } else {
                    showBanner('error', '任务创建失败: ' + ((resp && resp.error) || '未知'));
                }
            }).catch(function (err) {
                $('btn-start').disabled = false;
                showBanner('error', '任务创建失败: ' + err);
            });
        };

        $('btn-clear-finished').onclick = function () {
            var finished = taskOrder.filter(function (id) {
                var t = tasks[id];
                return t && (t.status === 'done' || t.status === 'failed');
            });
            if (!finished.length) {
                showBanner('warn', '没有可清理的已完成任务');
                return;
            }
            finished.forEach(function (id) {
                try { Api.localTools.batchOcr.dismiss(id); } catch (_) {}
                delete tasks[id];
            });
            taskOrder = taskOrder.filter(function (id) { return tasks[id]; });
            renderTasks();
        };
    }

    // ===== Input files =====
    function renderInputList() {
        if (!inputList) return;
        if (!selectedFiles.length) {
            inputList.innerHTML = '<div class="empty">未选择文件</div>';
        } else {
            inputList.innerHTML = '';
            selectedFiles.forEach(function (f, i) {
                var row = document.createElement('div');
                row.className = 'bo-file-row';
                var name = document.createElement('div');
                name.className = 'name';
                name.textContent = f.path;
                name.title = f.path;
                var size = document.createElement('div');
                size.className = 'size';
                size.textContent = formatSize(f.size);
                var rm = document.createElement('div');
                rm.className = 'rm';
                rm.textContent = '✕';
                rm.title = '移除';
                rm.onclick = function () {
                    selectedFiles.splice(i, 1);
                    renderInputList();
                    updateStartBtn();
                };
                row.appendChild(name);
                row.appendChild(size);
                row.appendChild(rm);
                inputList.appendChild(row);
            });
        }
        updateStartBtn();
    }

    function updateStartBtn() {
        var btn = $('btn-start');
        btn.disabled = !selectedFiles.length;
    }

    // ===== Collect OCR params =====
    function collectOcrParams() {
        var p = {};
        var modelSel = $('param-model');
        if (modelSel && modelSel.value) p.model = modelSel.value;
        var clsModeSel = $('param-cls-mode');
        var clsModelSel = $('param-cls-model');
        if (clsModeSel && clsModeSel.value && clsModelSel && clsModelSel.value) {
            p.clsModel = clsModelSel.value;
        }
        var layoutSel = $('param-layout');
        if (layoutSel && layoutSel.value) p.layout = layoutSel.value;
        var tableAlgoSel = $('param-table-algo');
        var tableAlgo = tableAlgoSel ? tableAlgoSel.value : '';
        if (tableAlgo) p.tableAlgo = tableAlgo;
        if (tableAlgo === 'wireless' || tableAlgo === 'combined') {
            var wirelessSel = $('param-table-wireless');
            if (wirelessSel && wirelessSel.value) p.tableWirelessModel = wirelessSel.value;
        }
        if (tableAlgo === 'wired' || tableAlgo === 'combined') {
            var wiredSel = $('param-table-wired');
            if (wiredSel && wiredSel.value) p.tableWiredModel = wiredSel.value;
        }
        if (tableAlgo === 'combined') {
            var tableClsSel = $('param-table-cls');
            if (tableClsSel && tableClsSel.value) p.tableClsModel = tableClsSel.value;
        }
        var modeSel = $('param-mode');
        if (modeSel && modeSel.value) p.mode = modeSel.value;
        if (modeSel && modeSel.value === 'plate') {
            var plateModelSel = $('param-plate-model');
            if (plateModelSel && plateModelSel.value) p.plateModel = plateModelSel.value;
        }
        p.maxSideLen = parseInt($('param-maxSideLen').value, 10) || 960;
        p.limitType = $('param-limitType').value || 'max';
        p.boxScoreThresh = parseFloat($('param-boxScoreThresh').value) || 0.3;
        p.boxThresh = parseFloat($('param-boxThresh').value) || 0.6;
        p.unClipRatio = parseFloat($('param-unClipRatio').value) || 1.5;
        p.dilation = parseInt($('param-dilation').value, 10) || 0;
        p.scoreMode = $('param-scoreMode').value || 'fast';
        p.boxType = $('param-boxType').value || 'quad';
        p.spaceChar = parseInt($('param-spaceChar').value, 10) || 1;
        p.recBatchNum = parseInt($('param-recBatchNum').value, 10) || 6;
        p.dropScore = parseFloat($('param-dropScore').value) || 0.5;
        p.clsBatchNum = parseInt($('param-clsBatchNum').value, 10) || 6;
        p.clsThresh = parseFloat($('param-clsThresh').value) || 0.9;
        return p;
    }

    // ===== Task polling =====
    function pollTasks() {
        var ids = Object.keys(tasks);
        if (!ids.length) return;

        var needRender = false;
        var pending = ids.length;
        ids.forEach(function (id) {
            var t = tasks[id];
            if (t.status === 'done' || t.status === 'failed') {
                pending--;
                if (pending === 0 && needRender) renderTasks();
                return;
            }
            Api.localTools.batchOcr.status(id).then(function (resp) {
                var d = resp && resp.success && resp.data ? resp.data : (resp && resp.success ? resp : null);
                if (d) {
                    var prevStatus = t.status;
                    t.status = d.status || t.status;
                    t.total = d.total || t.total;
                    t.done = d.done || 0;
                    t.failed = d.failed || 0;
                    if (d.startedAt) t.startedAt = d.startedAt;
                    if (d.finishedAt) t.finishedAt = d.finishedAt;
                    if (d.status === 'done' || d.status === 'failed') {
                        t.results = d.results || [];
                        t.progress = null;
                    } else {
                        t.progress = d.progress || [];
                        t.results = null;
                    }
                    if (prevStatus !== t.status || t.done > 0 || t.failed > 0) needRender = true;
                }
                pending--;
                if (pending === 0 && needRender) renderTasks();
            }).catch(function () {
                pending--;
                if (pending === 0 && needRender) renderTasks();
            });
        });
    }

    // ===== Render tasks =====
    function renderTasks() {
        if (!taskListEl) return;
        var activeTasks = taskOrder.map(function (id) { return tasks[id]; }).filter(Boolean);
        if (!activeTasks.length) {
            taskListEl.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 0.75rem;">暂无任务</div>';
            return;
        }
        taskListEl.innerHTML = '';
        activeTasks.forEach(function (t) {
            taskListEl.appendChild(buildTaskEl(t));
        });
    }

    function buildTaskEl(t) {
        var el = document.createElement('div');
        el.className = 'bo-task';

        var head = document.createElement('div');
        head.className = 'bo-task-head';
        var name = document.createElement('div');
        name.className = 'name';
        name.textContent = t.fileCount + ' 张图片';
        var status = document.createElement('span');
        status.className = 'bo-status ' + t.status;
        status.textContent = statusText(t.status);
        var ops = document.createElement('div');
        ops.className = 'ops';
        if (t.status === 'done' || t.status === 'failed') {
            var btnRm = document.createElement('button');
            btnRm.className = 'btn btn-ghost btn-sm';
            btnRm.textContent = '移除';
            btnRm.onclick = function () { removeTask(t.id); };
            ops.appendChild(btnRm);
        }
        head.appendChild(name);
        head.appendChild(status);
        head.appendChild(ops);
        el.appendChild(head);

        var meta = document.createElement('div');
        meta.className = 'bo-task-meta';
        if (t.createdAt) meta.appendChild(metaItem('创建', new Date(t.createdAt).toLocaleTimeString()));
        if (t.startedAt) meta.appendChild(metaItem('开始', new Date(t.startedAt).toLocaleTimeString()));
        if (t.finishedAt && t.startedAt) {
            meta.appendChild(metaItem('耗时', formatMs(t.finishedAt - t.startedAt)));
        }

        if (t.status !== 'done' && t.status !== 'failed') {
            meta.appendChild(metaItem('进度', t.done + '/' + t.total + (t.failed ? ' (失败' + t.failed + ')' : '')));
        } else {
            meta.appendChild(metaItem('完成', t.done + '/' + t.total + (t.failed ? ' (失败' + t.failed + ')' : '')));
        }
        el.appendChild(meta);

        if (t.progress && t.progress.length > 0) {
            var progEl = document.createElement('div');
            progEl.className = 'bo-task-progress';
            t.progress.forEach(function (p) {
                var row = document.createElement('div');
                row.className = 'bo-prog-row';
                var dot = document.createElement('span');
                dot.className = 'bo-prog-dot bo-prog-' + p.status;
                row.appendChild(dot);
                var fn = document.createElement('span');
                fn.className = 'bo-prog-name';
                fn.textContent = p.fileName;
                row.appendChild(fn);
                progEl.appendChild(row);
            });
            el.appendChild(progEl);
        }

        if (t.status === 'done' && t.results) {
            var summary = document.createElement('div');
            summary.className = 'bo-task-result';
            var lines = [];
            t.results.forEach(function (r) {
                if (r.data && r.data.text) {
                    lines.push(r.fileName + ': ' + r.data.text.substring(0, 80));
                } else if (r.error) {
                    lines.push(r.fileName + ': [失败] ' + r.error);
                }
            });
            summary.textContent = lines.join('\n').substring(0, 500);
            el.appendChild(summary);

            var btnExport = document.createElement('button');
            btnExport.className = 'btn btn-outline btn-sm';
            btnExport.style.marginTop = '0.25rem';
            btnExport.textContent = '导出HTML';
            btnExport.onclick = function () {
                var html = buildSingleTaskHtml(t);
                if (!html) { showBanner('warn', '导出失败'); return; }
                var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = 'ocr_results.html';
                document.body.appendChild(a); a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showBanner('success', 'HTML文件已导出');
            };
            el.appendChild(btnExport);
        }

        return el;
    }

    function metaItem(label, val) {
        var el = document.createElement('span');
        el.innerHTML = '<span>' + escapeHtml(label) + ': </span><span class="v">' + escapeHtml(val) + '</span>';
        return el;
    }

    function statusText(s) {
        if (s === 'queued') return '等待';
        if (s === 'running') return '运行中';
        if (s === 'done') return '完成';
        if (s === 'failed') return '失败';
        return s;
    }

    function removeTask(id) {
        delete tasks[id];
        taskOrder = taskOrder.filter(function (tid) { return tid !== id; });
        try { Api.localTools.batchOcr.dismiss(id); } catch (_) {}
        renderTasks();
    }

    // ===== Export HTML =====
    function buildSingleTaskHtml(t) {
        if (!t || !t.results || !t.results.length) return null;

        var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n';
        html += '<meta charset="UTF-8">\n';
        html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
        html += '<title>OCR识别结果</title>\n';
        html += '<style>\n';
        html += 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 1rem; color: #333; }\n';
        html += 'h1 { font-size: 1.25rem; border-bottom: 1px solid #ddd; padding-bottom: 0.5rem; }\n';
        html += 'h2 { font-size: 1rem; margin-top: 1.5rem; color: #555; word-break: break-all; }\n';
        html += '.page { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #eee; }\n';
        html += '.page:last-child { border-bottom: none; }\n';
        html += '.text-block { font-size: 0.875rem; line-height: 1.6; margin: 0.25rem 0; }\n';
        html += '.title-block { font-size: 1rem; font-weight: 600; margin: 0.5rem 0; }\n';
        html += 'table { border-collapse: collapse; width: 100%; margin: 0.5rem 0; font-size: 0.8125rem; }\n';
        html += 'td, th { border: 1px solid #ddd; padding: 0.25rem 0.5rem; text-align: left; }\n';
        html += '.figure-block { color: #888; font-style: italic; margin: 0.5rem 0; }\n';
        html += '.plate-block { font-size: 0.9375rem; font-weight: 600; letter-spacing: 0.05em; margin: 0.375rem 0; padding: 0.5rem 0.75rem; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; }\n';
        html += '.stats { font-size: 0.75rem; color: #888; margin-top: 0.25rem; }\n';
        html += '.error-block { color: #b91c1c; font-size: 0.8125rem; margin: 0.25rem 0; }\n';
        html += '</style>\n</head>\n<body>\n';
        html += '<h1>OCR识别结果</h1>\n';

        t.results.forEach(function (r) {
            html += '<div class="page">\n';
            html += '<h2>' + escapeHtml(r.fileName || r.filePath || '未知文件') + '</h2>\n';

            if (r.error) {
                html += '<div class="error-block">识别失败: ' + escapeHtml(r.error) + '</div>\n';
            } else if (r.data) {
                var data = r.data;
                if (data.blocks && data.blocks.length > 0) {
                    data.blocks.forEach(function (block) {
                        var type = block.type || 'text';
                        if (type === 'title') {
                            html += '<div class="title-block">' + escapeHtml(block.text || '') + '</div>\n';
                        } else if (type === 'figure') {
                            html += '<div class="figure-block">[图片区域]</div>\n';
                        } else if (type === 'table' && block.table && block.table.rows) {
                            html += '<table>\n';
                            block.table.rows.forEach(function (row) {
                                var allEmpty = row.every(function (cell) { return !cell || !cell.trim(); });
                                if (allEmpty) return;
                                html += '<tr>';
                                row.forEach(function (cell) {
                                    html += '<td>' + escapeHtml(cell || '') + '</td>';
                                });
                                html += '</tr>\n';
                            });
                            html += '</table>\n';
                        } else if (type === 'plate') {
                            var plateText = escapeHtml(block.text || '');
                            var plateTypeMap = { 'single_layer': '单层', 'double_layer': '双层' };
                            var plateTypeLabel = plateTypeMap[block.plateType] || block.plateType || '';
                            var plateType = plateTypeLabel ? '  [' + escapeHtml(plateTypeLabel) + ']' : '';
                            html += '<div class="plate-block">' + plateText + plateType + '</div>\n';
                        } else {
                            var text = (block.text || '').replace(/[\r\n]+/g, ' ');
                            html += '<div class="text-block">' + escapeHtml(text) + '</div>\n';
                        }
                    });
                    html += '<div class="stats">共 ' + data.blocks.length + ' 个文本块</div>\n';
                } else {
                    html += '<div class="text-block">' + escapeHtml(data.text || '(未识别到文本)') + '</div>\n';
                }
            } else {
                html += '<div class="text-block">(无结果)</div>\n';
            }

            html += '</div>\n';
        });

        html += '</body>\n</html>';
        return html;
    }

    function buildHtmlOutput() {
        var completedTasks = taskOrder.map(function (id) { return tasks[id]; })
            .filter(function (t) { return t && t.status === 'done' && t.results; });
        if (!completedTasks.length) return null;
        var parts = completedTasks.map(buildSingleTaskHtml);
        return parts.filter(Boolean).join('\n');
    }

    // ===== Polling =====
    function startPolling() {
        if (pollTimer) return;
        pollTimer = setInterval(function () {
            pollTasks();
        }, 1500);
    }
    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    function initFieldsetCollapse() {
        var legends = document.querySelectorAll('.bo-fieldset .bo-legend');
        legends.forEach(function(legend) {
            legend.addEventListener('click', function() {
                var fieldset = legend.parentElement;
                if (fieldset) {
                    fieldset.classList.toggle('collapsed');
                    legend.classList.toggle('collapsed');
                }
            });
        });
    }

    // ===== Init =====
    function loadTasksFromServer() {
        Api.localTools.batchOcr.list().then(function (resp) {
            if (resp && resp.success && resp.tasks && resp.tasks.length) {
                resp.tasks.forEach(function (t) {
                    if (!tasks[t.id]) {
                        tasks[t.id] = {
                            id: t.id,
                            fileCount: t.fileCount || t.total || 0,
                            status: t.status,
                            total: t.total || 0,
                            done: t.done || 0,
                            failed: t.failed || 0,
                            results: t.results || null,
                            progress: t.progress || null,
                            createdAt: t.createdAt || Date.now(),
                            startedAt: t.startedAt || null,
                            finishedAt: t.finishedAt || null
                        };
                        taskOrder.push(t.id);
                    }
                });
            }
            renderTasks();
        }).catch(function () {});
    }

    document.addEventListener('DOMContentLoaded', function () {
        inputList = $('input-list');
        taskListEl = $('task-list');
        initEventBindings();
        initModelSelect();
        initFieldsetCollapse();
        renderInputList();
        loadTasksFromServer();
        startPolling();
    });
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            stopPolling();
        } else {
            loadTasksFromServer();
            pollTasks();
            startPolling();
        }
    });

})();