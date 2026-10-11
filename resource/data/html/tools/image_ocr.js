'use strict';
document.addEventListener('DOMContentLoaded', function () {
    var NS = 'http://www.w3.org/2000/svg';
    var state = {
        file: null,
        dataUrl: null,
        result: null,
        img: {
            natW: 0,
            natH: 0,
            scaleX: 1,
            scaleY: 1,
            offsetX: 0,
            offsetY: 0,
        },
        selectedIdx: -1,
        // 选区：屏幕/显示坐标系（相对于 img 元素 client 区域左上角）
        crop: {
            active: false,
            x: 0, y: 0, w: 0, h: 0,
            mode: null,           // 'move' | 'resize' | null
            handle: null,         // nw/n/ne/e/se/s/sw/w
            startX: 0, startY: 0, // 鼠标按下时屏幕坐标
            startCrop: {},        // 鼠标按下时的 crop 快照
        },
    };

    // ============================================================
    // 坐标系工具
    // ============================================================
    // 获取 object-fit: contain 下图片在 img 元素中的实际显示矩形
    function computeImgLayout() {
        var imgEl = Tools.$('ocr-preview-img');
        if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) return;
        state.img.natW = imgEl.naturalWidth;
        state.img.natH = imgEl.naturalHeight;
        var cw = imgEl.clientWidth;
        var ch = imgEl.clientHeight;
        var ratio = Math.min(cw / state.img.natW, ch / state.img.natH);
        var displayW = state.img.natW * ratio;
        var displayH = state.img.natH * ratio;
        state.img.scaleX = ratio;
        state.img.scaleY = ratio;
        state.img.offsetX = (cw - displayW) / 2;
        state.img.offsetY = (ch - displayH) / 2;

        var stage = Tools.$('ocr-img-stage');
        var stageRect = stage ? stage.getBoundingClientRect() : null;
        var imgRect = imgEl.getBoundingClientRect();
        var stageOffX = stageRect ? Math.round(imgRect.left - stageRect.left) : 0;
        var stageOffY = stageRect ? Math.round(imgRect.top - stageRect.top) : 0;
        state.img.stageOffX = stageOffX;
        state.img.stageOffY = stageOffY;

        var overlay = Tools.$('ocr-box-overlay');
        var layer = Tools.$('ocr-box-layer');
        var cropOverlay = Tools.$('ocr-crop-overlay');
        if (overlay) {
            overlay.setAttribute('viewBox', '0 0 ' + cw + ' ' + ch);
            overlay.setAttribute('width', cw);
            overlay.setAttribute('height', ch);
            overlay.style.width = cw + 'px';
            overlay.style.height = ch + 'px';
            overlay.style.left = stageOffX + 'px';
            overlay.style.top = stageOffY + 'px';
        }
        if (layer) {
            layer.style.width = cw + 'px';
            layer.style.height = ch + 'px';
            layer.style.left = stageOffX + 'px';
            layer.style.top = stageOffY + 'px';
        }
        if (cropOverlay) {
            cropOverlay.setAttribute('viewBox', '0 0 ' + cw + ' ' + ch);
            cropOverlay.setAttribute('width', cw);
            cropOverlay.setAttribute('height', ch);
            cropOverlay.style.width = cw + 'px';
            cropOverlay.style.height = ch + 'px';
            cropOverlay.style.left = stageOffX + 'px';
            cropOverlay.style.top = stageOffY + 'px';
        }

        // 如果当前有选区，按新布局重新映射一下（保持原自然坐标选区）
        if (state.crop.active) {
            var nat = getCropNatural();
            if (nat.w > 0 && nat.h > 0) {
                var topLeft = toScreen(nat.x, nat.y);
                var botRight = toScreen(nat.x + nat.w, nat.y + nat.h);
                state.crop.x = topLeft.x;
                state.crop.y = topLeft.y;
                state.crop.w = Math.max(4, botRight.x - topLeft.x);
                state.crop.h = Math.max(4, botRight.y - topLeft.y);
                renderCrop();
            }
        }
    }

    // OCR 返回的原图坐标 (x,y) → 显示坐标
    function toScreen(x, y) {
        return {
            x: state.img.offsetX + x * state.img.scaleX,
            y: state.img.offsetY + y * state.img.scaleY,
        };
    }

    // 显示坐标 → 原图坐标（裁剪参数时使用）
    function toNatural(x, y) {
        return {
            x: (x - state.img.offsetX) / state.img.scaleX,
            y: (y - state.img.offsetY) / state.img.scaleY,
        };
    }

    // 获取当前选区在原图坐标系下的矩形（整数，夹紧边界）
    function getCropNatural() {
        if (!state.crop.active) return { x: 0, y: 0, w: 0, h: 0 };
        var tl = toNatural(state.crop.x, state.crop.y);
        var br = toNatural(state.crop.x + state.crop.w, state.crop.y + state.crop.h);
        var x1 = Math.max(0, Math.min(state.img.natW, Math.floor(tl.x)));
        var y1 = Math.max(0, Math.min(state.img.natH, Math.floor(tl.y)));
        var x2 = Math.max(0, Math.min(state.img.natW, Math.ceil(br.x)));
        var y2 = Math.max(0, Math.min(state.img.natH, Math.ceil(br.y)));
        return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
    }

    // 把文本块的 box 多边形转成 axis-aligned 矩形（用于 DOM 框定位）
    function boxToAabr(box) {
        if (!box || box.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var i = 0; i < box.length; i++) {
            var p = toScreen(+box[i].x, +box[i].y);
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
    }

    function clearOverlay() {
        var overlay = Tools.$('ocr-box-overlay');
        var layer = Tools.$('ocr-box-layer');
        if (overlay) overlay.innerHTML = '';
        if (layer) layer.innerHTML = '';
    }

    function setSelected(idx) {
        state.selectedIdx = idx;
        var overlay = Tools.$('ocr-box-overlay');
        if (overlay) {
            var polys = overlay.querySelectorAll('polygon.ocr-fill');
            polys.forEach(function (p, i) {
                if (i === idx) p.classList.add('ocr-selected');
                else p.classList.remove('ocr-selected');
            });
        }
        var layer = Tools.$('ocr-box-layer');
        if (layer) {
            var boxes = layer.querySelectorAll('.ocr-box');
            boxes.forEach(function (b, i) {
                if (i === idx) b.classList.add('ocr-selected');
                else b.classList.remove('ocr-selected');
            });
        }
        var editor = Tools.$('ocr-rich-editor');
        if (editor) {
            var items = editor.querySelectorAll('[data-idx]');
            items.forEach(function (item) {
                var i = parseInt(item.getAttribute('data-idx'), 10);
                if (i === idx) item.classList.add('ocr-selected');
                else item.classList.remove('ocr-selected');
            });
            if (idx >= 0) {
                var target = editor.querySelector('[data-idx="' + idx + '"]');
                if (target) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }

    var LAYOUT_COLORS = {
        title: '#e74c3c',
        figure: '#3498db',
        table: '#e67e22',
        header: '#95a5a6',
        footer: '#95a5a6',
        list: '#27ae60',
        figure_caption: '#3498db',
        table_caption: '#e67e22',
        reference: '#8e44ad',
        equation: '#2c3e50',
        text: '#2ecc71',
    };

    function getLayoutColor(type) {
        return LAYOUT_COLORS[type] || LAYOUT_COLORS.text;
    }

    function renderBoxes(blocks) {
        clearOverlay();
        var overlay = Tools.$('ocr-box-overlay');
        var layer = Tools.$('ocr-box-layer');
        if (!overlay || !layer) return;
        if (!blocks || blocks.length === 0) return;

        var frag = document.createDocumentFragment();
        var layerFrag = document.createDocumentFragment();

        blocks.forEach(function (block) {
            var pts = block.box || [];
            var type = block.type || 'text';
            var color = getLayoutColor(type);
            var screenPts = pts.map(function (p) {
                var s = toScreen(+p.x, +p.y);
                return s.x.toFixed(2) + ',' + s.y.toFixed(2);
            });
            var poly = document.createElementNS(NS, 'polygon');
            poly.setAttribute('points', screenPts.join(' '));
            poly.setAttribute('class', 'ocr-fill');
            poly.style.pointerEvents = 'none';
            frag.appendChild(poly);

            var r = boxToAabr(pts);
            var box = Tools.el('div', {
                class: 'ocr-box',
                style: {
                    left: r.x + 'px',
                    top: r.y + 'px',
                    width: r.w + 'px',
                    height: r.h + 'px',
                    borderColor: color,
                }
            });
            box.style.pointerEvents = 'none';
            layerFrag.appendChild(box);
        });

        overlay.appendChild(frag);
        layer.appendChild(layerFrag);
    }

    // ============================================================
    // 选区（crop）交互
    // ============================================================
    function ensureCropHint() {
        if (Tools.$('ocr-crop-hint')) return;
        var stage = Tools.$('ocr-img-stage');
        if (!stage) return;
        var hint = Tools.el('div', { id: 'ocr-crop-hint', class: 'ocr-crop-hint', text: '' });
        stage.appendChild(hint);
    }

    function updateCropHint() {
        ensureCropHint();
        var hint = Tools.$('ocr-crop-hint');
        if (!hint) return;
        if (!state.crop.active) { hint.classList.remove('visible'); return; }
        var nat = getCropNatural();
        hint.classList.add('visible');
        hint.textContent = '选区: ' + nat.w + ' × ' + nat.h + ' px  @ (' + nat.x + ',' + nat.y + ')';
    }

    // 更新 SVG 中所有选区元素（mask-hole / frame / move-area / 8 handles）
    function renderCrop() {
        var overlay = Tools.$('ocr-crop-overlay');
        if (!overlay) return;
        var active = state.crop.active && state.crop.w > 0 && state.crop.h > 0;
        if (active) overlay.classList.add('active'); else overlay.classList.remove('active');

        var hole = Tools.$('ocr-crop-mask-hole');
        var frame = Tools.$('ocr-crop-frame');
        var moveArea = Tools.$('ocr-crop-move-area');
        var handles = overlay.querySelectorAll('.ocr-crop-handle');

        var x = state.crop.x, y = state.crop.y, w = state.crop.w, h = state.crop.h;
        if (hole) { hole.setAttribute('x', x); hole.setAttribute('y', y); hole.setAttribute('width', w); hole.setAttribute('height', h); }
        if (frame) { frame.setAttribute('x', x); frame.setAttribute('y', y); frame.setAttribute('width', w); frame.setAttribute('height', h); }
        if (moveArea) { moveArea.setAttribute('x', x); moveArea.setAttribute('y', y); moveArea.setAttribute('width', w); moveArea.setAttribute('height', h); }

        // 8 个手柄：中心对齐
        var hs = 10; // handle size，必须跟 CSS 一致
        var half = hs / 2;
        var positions = {
            nw: [x, y],
            n:  [x + w / 2, y],
            ne: [x + w, y],
            e:  [x + w, y + h / 2],
            se: [x + w, y + h],
            s:  [x + w / 2, y + h],
            sw: [x, y + h],
            w:  [x, y + h / 2],
        };
        handles.forEach(function (hd) {
            var key = hd.getAttribute('data-handle');
            var p = positions[key];
            if (!p) return;
            hd.setAttribute('x', p[0] - half);
            hd.setAttribute('y', p[1] - half);
        });

        updateCropHint();
    }

    // 获取 img 元素的显示矩形（相对于 viewport），用于把 event.clientX/Y 转 img 内坐标
    function getImgClientRect() {
        var imgEl = Tools.$('ocr-preview-img');
        return imgEl ? imgEl.getBoundingClientRect() : { left: 0, top: 0 };
    }

    // 返回 img 元素内部坐标（x,y 为相对 img 左上角的像素，不考虑 contain）
    function eventToImgCoords(e) {
        var r = getImgClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function createDefaultCrop() {
        var imgEl = Tools.$('ocr-preview-img');
        if (!imgEl || !state.img.natW) return;
        var cw = imgEl.clientWidth;
        var ch = imgEl.clientHeight;
        // 居中 70%
        var w = Math.max(40, cw * 0.7);
        var h = Math.max(40, ch * 0.7);
        state.crop.active = true;
        state.crop.x = (cw - w) / 2;
        state.crop.y = (ch - h) / 2;
        state.crop.w = w;
        state.crop.h = h;
        renderCrop();
    }

    function resetCrop() {
        state.crop.active = false;
        state.crop.x = 0; state.crop.y = 0; state.crop.w = 0; state.crop.h = 0;
        state.crop.mode = null;
        state.crop.handle = null;
        renderCrop();
    }

    function onStartMove(e) {
        if (!state.crop.active) return;
        e.preventDefault();
        e.stopPropagation();
        var p = eventToImgCoords(e);
        state.crop.mode = 'move';
        state.crop.startX = p.x;
        state.crop.startY = p.y;
        state.crop.startCrop = { x: state.crop.x, y: state.crop.y, w: state.crop.w, h: state.crop.h };
    }

    function onStartResize(e) {
        if (!state.crop.active) return;
        e.preventDefault();
        e.stopPropagation();
        var handle = this.getAttribute('data-handle');
        var p = eventToImgCoords(e);
        state.crop.mode = 'resize';
        state.crop.handle = handle;
        state.crop.startX = p.x;
        state.crop.startY = p.y;
        state.crop.startCrop = { x: state.crop.x, y: state.crop.y, w: state.crop.w, h: state.crop.h };
    }

    function onDrag(e) {
        if (!state.crop.mode) return;
        var imgEl = Tools.$('ocr-preview-img');
        if (!imgEl) return;
        var cw = imgEl.clientWidth;
        var ch = imgEl.clientHeight;
        var p = eventToImgCoords(e);
        var dx = p.x - state.crop.startX;
        var dy = p.y - state.crop.startY;
        var s = state.crop.startCrop;

        if (state.crop.mode === 'move') {
            var nx = s.x + dx, ny = s.y + dy;
            // 夹紧到 [0, cw-w] / [0, ch-h]
            nx = Math.max(0, Math.min(cw - s.w, nx));
            ny = Math.max(0, Math.min(ch - s.h, ny));
            state.crop.x = nx;
            state.crop.y = ny;
        } else if (state.crop.mode === 'resize') {
            var handle = state.crop.handle;
            // 候选新矩形，初值 = 起点
            var x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
            if (handle.indexOf('w') >= 0) x1 = s.x + dx;
            if (handle.indexOf('e') >= 0) x2 = s.x + s.w + dx;
            if (handle.indexOf('n') >= 0) y1 = s.y + dy;
            if (handle.indexOf('s') >= 0) y2 = s.y + s.h + dy;
            // 夹紧到图像边界
            x1 = Math.max(0, Math.min(cw, x1));
            x2 = Math.max(0, Math.min(cw, x2));
            y1 = Math.max(0, Math.min(ch, y1));
            y2 = Math.max(0, Math.min(ch, y2));
            // 翻转处理 & 最小尺寸约束 4px
            var minSize = 4;
            if (x2 - x1 < minSize) {
                // 保持原 x1 或 x2 不动，推另一边
                if (handle.indexOf('w') >= 0) x1 = x2 - minSize;
                else x2 = x1 + minSize;
            }
            if (y2 - y1 < minSize) {
                if (handle.indexOf('n') >= 0) y1 = y2 - minSize;
                else y2 = y1 + minSize;
            }
            state.crop.x = x1;
            state.crop.y = y1;
            state.crop.w = x2 - x1;
            state.crop.h = y2 - y1;
        }
        renderCrop();
    }

    function onEndDrag() {
        state.crop.mode = null;
        state.crop.handle = null;
    }

    // 点击空白舞台时：若无选区则创建默认选区
    function onCreateCrop(e) {
        // 点击选区内部或手柄时不触发（stopPropagation 已在上游处理）
        if (state.crop.active) return;
        // 只有在有图片时才允许
        if (!state.file) return;
        createDefaultCrop();
    }

    function bindCropEvents() {
        var overlay = Tools.$('ocr-crop-overlay');
        if (!overlay) return;

        // 舞台点击：初始创建选区
        var stageEl = Tools.$('ocr-img-stage');
        if (stageEl) {
            stageEl.addEventListener('click', function (e) {
                // e.target 为舞台本身或 img（非 overlay 子元素）时才创建
                if (e.target === stageEl || e.target && e.target.id === 'ocr-preview-img') {
                    onCreateCrop(e);
                }
            });
        }

        // 移动区域
        var moveArea = Tools.$('ocr-crop-move-area');
        if (moveArea) {
            moveArea.addEventListener('mousedown', onStartMove);
            moveArea.addEventListener('click', function (e) { e.stopPropagation(); });
        }

        // 8 手柄
        var handles = overlay.querySelectorAll('.ocr-crop-handle');
        handles.forEach(function (hd) {
            hd.addEventListener('mousedown', onStartResize);
            hd.addEventListener('click', function (e) { e.stopPropagation(); });
        });

        // 全局鼠标移动/释放
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', onEndDrag);

        // 重置按钮
        var resetBtn = Tools.$('btn-reset-crop');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                resetCrop();
            });
        }
    }

    // ============================================================
    // 文件 & 结果渲染
    // ============================================================
    function handleFile(file) {
        if (!file) return;
        if (!file.type || file.type.indexOf('image/') !== 0) {
            Tools.showBanner('banner', 'error', '请选择图片文件');
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            Tools.showBanner('banner', 'error', '文件过大（限制 20MB）');
            return;
        }
        Tools.clearBanner('banner');
        state.file = file;
        Tools.readFile(file, 'dataUrl').then(function (dataUrl) {
            state.dataUrl = dataUrl;
            var empty = Tools.$('preview-empty');
            var wrap = Tools.$('preview-wrap');
            var imgEl = Tools.$('ocr-preview-img');
            if (empty) empty.style.display = 'none';
            imgEl.onload = function () {
                computeImgLayout();
                resetCrop();          // 换图重置选区
                if (state.result) renderBoxes(state.result.blocks || []);
            };
            imgEl.src = dataUrl;
            if (wrap) wrap.classList.add('visible');
            Tools.$('btn-ocr').disabled = false;
            clearOverlay();
            clearResult();
        }).catch(function (err) {
            Tools.showBanner('banner', 'error', '读取文件失败: ' + (err && err.message ? err.message : '未知错误'));
        });
    }

    function clearAll() {
        state.file = null;
        state.dataUrl = null;
        state.result = null;
        state.selectedIdx = -1;
        if (state._pollCancel) {
            state._pollCancel();
            state._pollCancel = null;
        }
        Tools.$('file-input').value = '';
        var empty = Tools.$('preview-empty');
        var wrap = Tools.$('preview-wrap');
        if (empty) empty.style.display = '';
        if (wrap) wrap.classList.remove('visible');
        Tools.$('ocr-preview-img').removeAttribute('src');
        clearOverlay();
        resetCrop();
        clearResult();
        Tools.$('btn-ocr').disabled = true;
        Tools.clearBanner('banner');
    }

    function clearResult() {
        state.result = null;
        var empty = Tools.$('result-empty');
        var editor = Tools.$('ocr-rich-editor');
        var toolbar = Tools.$('ocr-result-toolbar');
        var loading = Tools.$('result-loading');
        if (empty) empty.style.display = '';
        if (editor) { editor.style.display = 'none'; editor.innerHTML = ''; }
        if (toolbar) toolbar.style.display = 'none';
        if (loading) loading.style.display = 'none';
    }

    function showLoading(msg, extra) {
        var empty = Tools.$('result-empty');
        var editor = Tools.$('ocr-rich-editor');
        var toolbar = Tools.$('ocr-result-toolbar');
        var loading = Tools.$('result-loading');
        var loadingMsg = Tools.$('result-loading-msg');
        var loadingExtra = Tools.$('result-loading-extra');
        if (empty) empty.style.display = 'none';
        if (editor) editor.style.display = 'none';
        if (toolbar) toolbar.style.display = 'none';
        if (loading) loading.style.display = '';
        if (loadingMsg) loadingMsg.textContent = msg || '正在识别，请稍候...';
        if (loadingExtra) loadingExtra.textContent = extra || '';
    }

    function updateLoadingMsg(extra) {
        var loadingExtra = Tools.$('result-loading-extra');
        if (loadingExtra) loadingExtra.textContent = extra || '';
    }

    // 异步任务轮询
    function pollTaskStatus(taskId, onDone, onError) {
        var startedAt = Date.now();
        var timeoutMs = 10 * 60 * 1000;
        var baseDelayMs = 500;
        var maxDelayMs = 2000;
        var delayMs = baseDelayMs;
        var cancelled = false;

        state._pollCancel = function () { cancelled = true; };

        function step() {
            if (cancelled) return onError(new Error('已取消'));
            if (Date.now() - startedAt > timeoutMs) return onError(new Error('识别超时，请稍后重试'));

            Api.tools.imageOcrStatus(taskId).then(function (resp) {
                if (cancelled) return onError(new Error('已取消'));
                if (!resp || !resp.success || !resp.data) {
                    return onError(new Error((resp && resp.error) ? resp.error : '状态查询失败'));
                }
                var d = resp.data;
                if (d.status === 'done') {
                    onDone(d.data);
                    try { Api.tools.imageOcrDismiss(taskId); } catch (_) {}
                    return;
                }
                if (d.status === 'failed') {
                    return onError(new Error(d.error || '识别失败'));
                }
                var extra = '';
                if (d.status === 'queued') extra = '排队中…';
                else {
                    var wait = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
                    extra = '识别中… ' + wait + ' 秒';
                }
                updateLoadingMsg(extra);

                setTimeout(step, delayMs);
                delayMs = Math.min(maxDelayMs, delayMs * 1.15);
            }).catch(function (err) {
                if (cancelled) return onError(new Error('已取消'));
                setTimeout(step, baseDelayMs);
                void err;
            });
        }
        step();
    }

    function renderResult(data) {
        state.result = data;

        var empty = Tools.$('result-empty');
        var editor = Tools.$('ocr-rich-editor');
        var toolbar = Tools.$('ocr-result-toolbar');
        var statsEl = Tools.$('ocr-stats');
        var loading = Tools.$('result-loading');

        if (empty) empty.style.display = 'none';
        if (loading) loading.style.display = 'none';

        var statsParts = [];
        var s = data.stats || {};
        if (s.layoutCount !== undefined) statsParts.push('版面区域: ' + s.layoutCount);
        if (s.blockCount !== undefined) statsParts.push('文本块: ' + s.blockCount);
        if (s.detectTime !== undefined) statsParts.push('耗时: ' + (+s.detectTime).toFixed(1) + ' ms');
        if (s.dbNetTime !== undefined) statsParts.push('检测: ' + (+s.dbNetTime).toFixed(1) + ' ms');
        if (data.crop && (data.crop.w > 0 || data.crop.h > 0)) {
            statsParts.push('裁剪区域: ' + data.crop.w + '×' + data.crop.h + ' @(' + data.crop.x + ',' + data.crop.y + ')');
        }
        if (statsEl) statsEl.textContent = statsParts.join('  ·  ');

        if (toolbar) toolbar.style.display = '';

        if (editor) {
            editor.innerHTML = '';
            if (data.blocks && data.blocks.length > 0) {
                function getBlockCenterY(block) {
                    if (block.box && block.box.length >= 2) {
                        var y0 = +block.box[0].y;
                        var y2 = +block.box[2].y;
                        return (y0 + y2) / 2;
                    }
                    return null;
                }
                function getBlockHeight(block) {
                    if (block.box && block.box.length >= 4) {
                        var y0 = +block.box[0].y;
                        var y2 = +block.box[2].y;
                        return Math.abs(y2 - y0);
                    }
                    return 0;
                }

                var i = 0;
                while (i < data.blocks.length) {
                    var block = data.blocks[i];
                    var type = block.type || 'text';

                    if (type !== 'text') {
                        var el;
                        if (type === 'title') {
                            el = document.createElement('h3');
                            el.className = 'ocr-block-title';
                        } else if (type === 'figure') {
                            el = document.createElement('div');
                            el.className = 'ocr-block-figure';
                            el.innerHTML = '<span class="ocr-figure-placeholder">[图片区域]</span>';
                        } else if (type === 'table') {
                            el = document.createElement('div');
                            el.className = 'ocr-block-table';
                            if (block.table && block.table.rows) {
                                var tbl = document.createElement('table');
                                tbl.className = 'ocr-table';
                                block.table.rows.forEach(function (row) {
                                    var allEmpty = row.every(function (cell) { return !cell || !cell.trim(); });
                                    if (allEmpty) return;
                                    var tr = document.createElement('tr');
                                    row.forEach(function (cell) {
                                        var td = document.createElement('td');
                                        td.textContent = cell || '';
                                        td.setAttribute('contenteditable', 'true');
                                        tr.appendChild(td);
                                    });
                                    tbl.appendChild(tr);
                                });
                                el.appendChild(tbl);
                            }
                        } else if (type === 'header' || type === 'footer') {
                            el = document.createElement('div');
                            el.className = 'ocr-block-' + type;
                        } else if (type === 'list') {
                            el = document.createElement('div');
                            el.className = 'ocr-block-list';
                        } else if (type === 'figure_caption' || type === 'table_caption') {
                            el = document.createElement('div');
                            el.className = 'ocr-block-caption';
                        } else if (type === 'reference') {
                            el = document.createElement('div');
                            el.className = 'ocr-block-reference';
                        } else if (type === 'equation') {
                            el = document.createElement('div');
                            el.className = 'ocr-block-equation';
                        } else if (type === 'plate') {
                            el = document.createElement('div');
                            el.className = 'ocr-block-plate';
                            var plateText = block.text || '';
                            var plateTypeMap = { 'single_layer': '单层', 'double_layer': '双层' };
                            var plateType = plateTypeMap[block.plateType] || block.plateType || '';
                            if (plateType) plateText = plateText + '  [' + plateType + ']';
                            el.textContent = plateText;
                        }
                        if (el) {
                            el.setAttribute('data-idx', String(i));
                            if (type !== 'figure' && type !== 'table' && type !== 'plate') {
                                el.textContent = block.text || '';
                            }
                            el.addEventListener('click', function () {
                                setSelected(parseInt(this.getAttribute('data-idx'), 10));
                            });
                            editor.appendChild(el);
                        }
                        i++;
                        continue;
                    }

                    var lineStart = i;
                    var refY = getBlockCenterY(block);
                    var refH = getBlockHeight(block);
                    var threshold = refH * 0.5;
                    var lineEnd = i + 1;

                    while (lineEnd < data.blocks.length) {
                        var nextBlock = data.blocks[lineEnd];
                        var nextType = nextBlock.type || 'text';
                        if (nextType !== 'text') break;
                        var nextY = getBlockCenterY(nextBlock);
                        if (refY !== null && nextY !== null && Math.abs(nextY - refY) > threshold) break;
                        lineEnd++;
                    }

                    if (lineEnd - lineStart === 1) {
                        var el2 = document.createElement('div');
                        el2.className = 'ocr-block-text';
                        el2.setAttribute('data-idx', String(lineStart));
                        el2.textContent = (block.text || '').replace(/[\r\n]+/g, ' ');
                        el2.addEventListener('click', function () {
                            setSelected(parseInt(this.getAttribute('data-idx'), 10));
                        });
                        editor.appendChild(el2);
                    } else {
                        var lineEl = document.createElement('div');
                        lineEl.className = 'ocr-line';
                        for (var j = lineStart; j < lineEnd; j++) {
                            var span = document.createElement('span');
                            span.className = 'ocr-block-text ocr-inline';
                            span.setAttribute('data-idx', String(j));
                            span.textContent = (data.blocks[j].text || '').replace(/[\r\n]+/g, ' ');
                            span.addEventListener('click', function () {
                                setSelected(parseInt(this.getAttribute('data-idx'), 10));
                            });
                            lineEl.appendChild(span);
                            if (j < lineEnd - 1) {
                                var gap = document.createElement('span');
                                gap.className = 'ocr-inline-gap';
                                gap.textContent = ' ';
                                lineEl.appendChild(gap);
                            }
                        }
                        editor.appendChild(lineEl);
                    }

                    i = lineEnd;
                }
            } else {
                editor.textContent = data.text || '(未识别到文本)';
            }
            editor.style.display = '';
        }

        computeImgLayout();
        renderBoxes(data.blocks || []);
        setSelected(-1);
    }

    function startOcr() {
        if (!state.file) return;
        if (state._pollCancel) {
            state._pollCancel();
            state._pollCancel = null;
        }

        Tools.clearBanner('banner');
        showLoading('已提交识别任务', '准备中…');
        Tools.$('btn-ocr').disabled = true;

        var formData = new FormData();
        formData.append('file', state.file);
        var modelSel = Tools.$('param-model');
        if (modelSel && modelSel.value) {
            formData.append('model', modelSel.value);
        }
        var clsModeSel = Tools.$('param-cls-mode');
        var clsModelSel = Tools.$('param-cls-model');
        if (clsModeSel && clsModeSel.value && clsModelSel && clsModelSel.value) {
            formData.append('clsModel', clsModelSel.value);
        }
        var layoutSel = Tools.$('param-layout');
        if (layoutSel && layoutSel.value) {
            formData.append('layout', layoutSel.value);
        }
        var tableAlgoSel = Tools.$('param-table-algo');
        var tableAlgo = tableAlgoSel ? tableAlgoSel.value : '';
        if (tableAlgo) {
            formData.append('tableAlgo', tableAlgo);
        }
        if (tableAlgo === 'wireless' || tableAlgo === 'combined') {
            var wirelessSel = Tools.$('param-table-wireless');
            if (wirelessSel && wirelessSel.value) {
                formData.append('tableWirelessModel', wirelessSel.value);
            }
        }
        if (tableAlgo === 'wired' || tableAlgo === 'combined') {
            var wiredSel = Tools.$('param-table-wired');
            if (wiredSel && wiredSel.value) {
                formData.append('tableWiredModel', wiredSel.value);
            }
        }
        if (tableAlgo === 'combined') {
            var tableClsSel = Tools.$('param-table-cls');
            if (tableClsSel && tableClsSel.value) {
                formData.append('tableClsModel', tableClsSel.value);
            }
        }
        var modeSel = Tools.$('param-mode');
        if (modeSel && modeSel.value) {
            formData.append('mode', modeSel.value);
        }
        if (modeSel && modeSel.value === 'plate') {
            var plateModelSel = Tools.$('param-plate-model');
            if (plateModelSel && plateModelSel.value) {
                formData.append('plateModel', plateModelSel.value);
            }
        }
        formData.append('maxSideLen', Tools.$('param-maxSideLen').value);
        formData.append('limitType', Tools.$('param-limitType').value);
        formData.append('boxScoreThresh', Tools.$('param-boxScoreThresh').value);
        formData.append('boxThresh', Tools.$('param-boxThresh').value);
        formData.append('unClipRatio', Tools.$('param-unClipRatio').value);
        formData.append('dilation', Tools.$('param-dilation').value);
        formData.append('scoreMode', Tools.$('param-scoreMode').value);
        formData.append('boxType', Tools.$('param-boxType').value);
        formData.append('spaceChar', Tools.$('param-spaceChar').value);
        formData.append('recBatchNum', Tools.$('param-recBatchNum').value);
        formData.append('dropScore', Tools.$('param-dropScore').value);
        formData.append('clsBatchNum', Tools.$('param-clsBatchNum').value);
        formData.append('clsThresh', Tools.$('param-clsThresh').value);


        // 如果有选区，附带裁剪参数（原图坐标，整数）
        var nat = getCropNatural();
        if (nat.w > 0 && nat.h > 0) {
            formData.append('cropX', String(nat.x));
            formData.append('cropY', String(nat.y));
            formData.append('cropW', String(nat.w));
            formData.append('cropH', String(nat.h));
        }

        function finishWithData(data) {
            Tools.$('btn-ocr').disabled = false;
            if (data) {
                renderResult(data);
                Tools.showBanner('banner', 'success', '识别完成');
            } else {
                clearResult();
                clearOverlay();
            }
            state._pollCancel = null;
        }

        function finishWithError(msg) {
            Tools.$('btn-ocr').disabled = false;
            clearResult();
            clearOverlay();
            Tools.showBanner('banner', 'error', msg || '识别失败');
            state._pollCancel = null;
        }

        Api.tools.imageOcrSubmit(formData).then(function (resp) {
            if (!resp || !resp.success || !resp.taskId) {
                finishWithError((resp && resp.error) ? resp.error : '任务提交失败');
                return;
            }
            pollTaskStatus(resp.taskId, function (data) {
                finishWithData(data);
            }, function (err) {
                finishWithError((err && err.message) || '识别失败');
            });
        }).catch(function (err) {
            finishWithError('提交失败: ' + (err && err.message ? err.message : '网络错误'));
        });
    }

    function initDropZone() {
        var dropZone = Tools.$('drop-zone');
        var fileInput = Tools.$('file-input');
        var reuploadBtn = Tools.$('ocr-reupload-btn');

        fileInput.addEventListener('change', function () {
            if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
        });

        if (reuploadBtn) {
            reuploadBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                fileInput.value = '';
                fileInput.click();
            });
        }

        dropZone.addEventListener('dragover', function (e) {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', function (e) {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        });
        dropZone.addEventListener('drop', function (e) {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
        });
    }

    function initAdvanced() {
        var slider1 = Tools.$('param-boxScoreThresh');
        var val1 = Tools.$('param-boxScoreThresh-val');
        slider1.addEventListener('input', function () {
            val1.textContent = parseFloat(slider1.value).toFixed(2);
        });

        var slider2 = Tools.$('param-unClipRatio');
        var val2 = Tools.$('param-unClipRatio-val');
        slider2.addEventListener('input', function () {
            val2.textContent = parseFloat(slider2.value).toFixed(2);
        });

        var slider3 = Tools.$('param-boxThresh');
        var val3 = Tools.$('param-boxThresh-val');
        if (slider3 && val3) {
            slider3.addEventListener('input', function () {
                val3.textContent = parseFloat(slider3.value).toFixed(2);
            });
        }

        var slider4 = Tools.$('param-dropScore');
        var val4 = Tools.$('param-dropScore-val');
        if (slider4 && val4) {
            slider4.addEventListener('input', function () {
                val4.textContent = parseFloat(slider4.value).toFixed(2);
            });
        }

        var slider5 = Tools.$('param-clsThresh');
        var val5 = Tools.$('param-clsThresh-val');
        if (slider5 && val5) {
            slider5.addEventListener('input', function () {
                val5.textContent = parseFloat(slider5.value).toFixed(2);
            });
        }
    }

    function initResizeSync() {
        var ro;
        if (window.ResizeObserver) {
            ro = new ResizeObserver(function () {
                computeImgLayout();
                if (state.result && state.result.blocks) {
                    renderBoxes(state.result.blocks);
                }
            });
            ro.observe(Tools.$('ocr-img-stage'));
        }
        window.addEventListener('resize', function () {
            computeImgLayout();
            if (state.result && state.result.blocks) {
                renderBoxes(state.result.blocks);
            }
        });
    }

    function initCrop() {
        ensureCropHint();
        bindCropEvents();
        renderCrop();
    }

    var modelData = null;

    function fillSelect(id, items, label) {
        var sel = Tools.$(id);
        if (!sel) return;
        if (!items || items.length === 0) {
            sel.innerHTML = '<option value="">无可用' + label + '</option>';
            sel.disabled = true;
            return;
        }
        var html = '';
        items.forEach(function (m) {
            html += '<option value="' + escapeAttr(m.id) + '">' + Tools.escapeHtml(m.name || m.id) + '</option>';
        });
        sel.innerHTML = html;
        sel.disabled = false;
    }

    function fillClsModeSelect(id, modes) {
        var sel = Tools.$(id);
        if (!sel) return;
        var html = '<option value="">不使用</option>';
        if (modes && modes.length > 0) {
            modes.forEach(function (m) {
                var label = m.mode === 'orientation' ? '方向检测' : '角度分类';
                html += '<option value="' + escapeAttr(m.mode) + '">' + Tools.escapeHtml(label) + '</option>';
            });
        }
        sel.innerHTML = html;
        sel.disabled = false;
    }

    function fillAlgoSelect(id, algos, label) {
        var sel = Tools.$(id);
        if (!sel) return;
        if (!algos || algos.length === 0) {
            sel.innerHTML = '<option value="">无可用' + label + '</option>';
            sel.disabled = true;
            return;
        }
        var html = '';
        algos.forEach(function (a) {
            var display = a.label || a.algo;
            html += '<option value="' + escapeAttr(a.algo) + '">' + Tools.escapeHtml(display) + '</option>';
        });
        sel.innerHTML = html;
        sel.disabled = false;
    }

    function onClsModeChange() {
        if (!modelData) return;
        var modeSel = Tools.$('param-cls-mode');
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
        var algoSel = Tools.$('param-layout-algo');
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
        var algoSel = Tools.$('param-table-algo');
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

        var wirelessGroup = Tools.$('table-wireless-group');
        if (wirelessGroup) {
            wirelessGroup.style.display = (algo === 'wireless' || algo === 'combined') ? '' : 'none';
        }
        if ((algo === 'wireless' || algo === 'combined') && wirelessModels.length > 0) {
            fillSelect('param-table-wireless', wirelessModels, '无线模型');
        }

        var wiredGroup = Tools.$('table-wired-group');
        if (wiredGroup) {
            wiredGroup.style.display = (algo === 'wired' || algo === 'combined') ? '' : 'none';
        }
        if ((algo === 'wired' || algo === 'combined') && wiredModels.length > 0) {
            fillSelect('param-table-wired', wiredModels, '有线模型');
        }

        var clsGroup = Tools.$('table-cls-group');
        if (clsGroup) {
            clsGroup.style.display = (algo === 'combined') ? '' : 'none';
        }
        if (algo === 'combined' && modelData && modelData.tableClsModels) {
            fillSelect('param-table-cls', modelData.tableClsModels, '检测模型');
        }
    }

    function onModeChange() {
        var modeSel = Tools.$('param-mode');
        var mode = modeSel ? modeSel.value : 'doc';
        var isTable = mode === 'table';
        var isPlate = mode === 'plate';
        var fsText = Tools.$('fs-text');
        var fsLayout = Tools.$('fs-layout');
        var fsTable = Tools.$('fs-table');
        var fsPlate = Tools.$('fs-plate');
        if (fsText) fsText.style.display = isPlate ? 'none' : '';
        if (fsLayout) fsLayout.style.display = (isTable || isPlate) ? 'none' : '';
        if (fsTable) fsTable.style.display = isTable ? '' : 'none';
        if (fsPlate) fsPlate.style.display = isPlate ? '' : 'none';
    }

    function initModelSelect() {
        Api.tools.imageOcrModels().then(function (resp) {
            if (!resp || !resp.success) return;
            modelData = resp;

            fillSelect('param-model', resp.textModels, '识别模型');

            fillClsModeSelect('param-cls-mode', resp.clsModes);
            onClsModeChange();

            fillAlgoSelect('param-layout-algo', resp.layoutAlgos, '版面算法');
            onLayoutAlgoChange();

            var tableAlgoSel = Tools.$('param-table-algo');
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

            var clsModeSel = Tools.$('param-cls-mode');
            if (clsModeSel) clsModeSel.addEventListener('change', onClsModeChange);
            var layoutAlgoSel = Tools.$('param-layout-algo');
            if (layoutAlgoSel) layoutAlgoSel.addEventListener('change', onLayoutAlgoChange);
            var tableAlgoSel2 = Tools.$('param-table-algo');
            if (tableAlgoSel2) tableAlgoSel2.addEventListener('change', onTableAlgoChange);
            var modeSel = Tools.$('param-mode');
            if (modeSel) modeSel.addEventListener('change', onModeChange);
            onModeChange();
        }).catch(function (err) {
            ['param-model', 'param-cls-mode', 'param-cls-model', 'param-layout-algo', 'param-layout', 'param-table-algo', 'param-table-wireless', 'param-table-wired', 'param-table-cls', 'param-plate-model'].forEach(function (id) {
                var sel = Tools.$(id);
                if (sel) { sel.innerHTML = '<option value="">加载失败</option>'; }
            });
            void err;
        });
    }

    function escapeAttr(s) {
        return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function initResultToolbar() {
        var copyBtn = Tools.$('btn-copy-text');
        var downloadBtn = Tools.$('btn-download-text');
        if (copyBtn) {
            copyBtn.addEventListener('click', function () {
                var editor = Tools.$('ocr-rich-editor');
                var text = editor ? (editor.innerText || editor.textContent) : '';
                Tools.copyText(text, copyBtn);
            });
        }
        if (downloadBtn) {
            downloadBtn.addEventListener('click', function () {
                var editor = Tools.$('ocr-rich-editor');
                var text = editor ? (editor.innerText || editor.textContent) : '';
                var name = state.file ? state.file.name.replace(/\.[^.]+$/, '') : 'ocr_result';
                Tools.download(name + '.txt', text, 'text/plain;charset=utf-8');
            });
        }
    }

    function initFieldsetCollapse() {
        var legends = document.querySelectorAll('.ocr-fieldset .ocr-legend');
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

    function init() {
        initDropZone();
        initAdvanced();
        initResizeSync();
        initCrop();
        initModelSelect();
        initResultToolbar();
        initFieldsetCollapse();
        Tools.$('btn-ocr').addEventListener('click', startOcr);
        Tools.$('btn-clear').addEventListener('click', clearAll);
    }

    init();
});