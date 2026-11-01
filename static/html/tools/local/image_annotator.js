(function() {
    'use strict';

    const state = {
        currentTool: 'select',
        strokeColor: '#ff0000',
        strokeAlpha: 1.0,
        fillColor: '#ffffff',
        fillAlpha: 0,
        strokeWidth: 3,
        fontFamily: 'Arial',
        fontSize: 24,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        dirty: false,
        image: null,
        originalImage: null,
        // 绘制相关
        isDrawing: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        history: [],
        historyIndex: -1,
        paths: [],
        currentPath: null,
        // 选区相关
        selection: null,          // { x, y, width, height } 图片坐标系
        isPanning: false,         // 拖动移动页面（平移视图）中
        panOrigin: { clientX: 0, clientY: 0, offsetX: 0, offsetY: 0 },
        isResizing: false,
        resizeHandle: null,
        // 文本输入
        textPosition: null
    };

    const elements = {
        dropZone: document.getElementById('dropZone'),
        fileInput: document.getElementById('fileInput'),
        imageContainer: document.getElementById('imageContainer'),
        mainCanvas: document.getElementById('mainCanvas'),
        overlayCanvas: document.getElementById('overlayCanvas'),
        selectionBox: document.getElementById('selectionBox'),
        selectionMoveArea: document.getElementById('selectionMoveArea'),
        canvasWrapper: document.getElementById('canvasWrapper'),
        floatingToolbar: document.getElementById('floatingToolbar'),
        topbarInfo: document.getElementById('topbarInfo'),
        topbarZoom: document.getElementById('topbarZoom'),
        strokeColor: document.getElementById('strokeColor'),
        strokeAlpha: document.getElementById('strokeAlpha'),
        strokeAlphaValue: document.getElementById('strokeAlphaValue'),
        strokeColorOverlay: document.getElementById('strokeColorOverlay'),
        fillColor: document.getElementById('fillColor'),
        fillAlpha: document.getElementById('fillAlpha'),
        fillAlphaValue: document.getElementById('fillAlphaValue'),
        fillColorOverlay: document.getElementById('fillColorOverlay'),
        strokeWidth: document.getElementById('strokeWidth'),
        strokeWidthValue: document.getElementById('strokeWidthValue'),
        fontSelector: document.getElementById('fontSelector'),
        fontFamily: document.getElementById('fontFamily'),
        fontSize: document.getElementById('fontSize'),
        undoBtn: document.getElementById('undoBtn'),
        redoBtn: document.getElementById('redoBtn'),
        clearBtn: document.getElementById('clearBtn'),
        newImageBtn: document.getElementById('newImageBtn'),
        saveBtn: document.getElementById('saveBtn'),
        zoomIn: document.getElementById('zoomIn'),
        zoomOut: document.getElementById('zoomOut'),
        zoomFit: document.getElementById('zoomFit'),
        zoomLevel: document.getElementById('zoomLevel'),
        imageSize: document.getElementById('imageSize'),
        fileSize: document.getElementById('fileSize'),
        selectionInfo: document.getElementById('selectionInfo'),
        inPlaceTextInput: document.getElementById('inPlaceTextInput'),
        toolbarDragHandle: document.getElementById('toolbarDragHandle')
    };

    const toolbarDragState = {
        dragging: false,
        offsetX: 0,
        offsetY: 0,
        // 记录 toolbar 当前使用的定位方式（null = 默认居中；否则是 absolute left/top 像素值）
        pinnedLeft: null,
        pinnedTop: null
    };

    const ctx = elements.mainCanvas.getContext('2d');
    const overlayCtx = elements.overlayCanvas.getContext('2d');

    const MIN_SELECTION_SIZE = 40;

    function init() {
        setupEventListeners();
        updateAlphaLabels();
        updateColorPreview();
    }

    // ========= 颜色工具函数 =========
    function hexToRgb(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const n = parseInt(hex, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function rgba(hex, alpha) {
        const { r, g, b } = hexToRgb(hex || '#000000');
        const a = (alpha == null) ? 1 : Math.max(0, Math.min(1, alpha));
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    function updateColorPreview() {
        const strokeCss = rgba(state.strokeColor, state.strokeAlpha);
        const fillCss = rgba(state.fillColor, state.fillAlpha);
        if (elements.strokeColorOverlay) elements.strokeColorOverlay.style.background = strokeCss;
        if (elements.fillColorOverlay)   elements.fillColorOverlay.style.background   = fillCss;
    }
    function updateAlphaLabels() {
        if (elements.strokeAlphaValue)
            elements.strokeAlphaValue.textContent = Math.round(state.strokeAlpha * 100) + '%';
        if (elements.fillAlphaValue)
            elements.fillAlphaValue.textContent   = Math.round(state.fillAlpha   * 100) + '%';
    }

    function setupEventListeners() {
        elements.dropZone.addEventListener('click', () => elements.fileInput.click());
        elements.fileInput.addEventListener('change', handleFileSelect);
        elements.newImageBtn.addEventListener('click', () => elements.fileInput.click());

        elements.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            elements.dropZone.classList.add('dragover');
        });
        elements.dropZone.addEventListener('dragleave', () => {
            elements.dropZone.classList.remove('dragover');
        });
        elements.dropZone.addEventListener('drop', handleDrop);

        if (elements.toolbarDragHandle) {
            elements.toolbarDragHandle.addEventListener('mousedown', startToolbarDrag);
        }

        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => selectTool(btn.dataset.tool));
        });

        // 颜色 + 透明度
        function applyStrokeColor(v) {
            state.strokeColor = v;
            updateColorPreview();
        }
        function applyFillColor(v) {
            state.fillColor = v;
            updateColorPreview();
        }
        function applyStrokeAlpha(v) {
            state.strokeAlpha = Math.max(0, Math.min(1, v / 100));
            updateAlphaLabels();
            updateColorPreview();
        }
        function applyFillAlpha(v) {
            state.fillAlpha = Math.max(0, Math.min(1, v / 100));
            updateAlphaLabels();
            updateColorPreview();
        }
        elements.strokeColor.addEventListener('input', (e) => applyStrokeColor(e.target.value));
        elements.fillColor.addEventListener('input', (e) => applyFillColor(e.target.value));
        if (elements.strokeAlpha)
            elements.strokeAlpha.addEventListener('input', (e) => applyStrokeAlpha(parseInt(e.target.value)));
        if (elements.fillAlpha)
            elements.fillAlpha.addEventListener('input', (e) => applyFillAlpha(parseInt(e.target.value)));

        elements.strokeWidth.addEventListener('input', (e) => {
            state.strokeWidth = parseInt(e.target.value);
            elements.strokeWidthValue.textContent = state.strokeWidth;
        });
        elements.fontFamily.addEventListener('change', (e) => { state.fontFamily = e.target.value; });
        elements.fontSize.addEventListener('change', (e) => { state.fontSize = parseInt(e.target.value); });

        elements.undoBtn.addEventListener('click', undo);
        elements.redoBtn.addEventListener('click', redo);
        elements.clearBtn.addEventListener('click', clearCanvas);
        elements.saveBtn.addEventListener('click', () => { userTriggeredSave(); });

        elements.zoomIn.addEventListener('click', () => setZoom(state.zoom + 0.1));
        elements.zoomOut.addEventListener('click', () => setZoom(state.zoom - 0.1));
        elements.zoomFit.addEventListener('click', fitToWindow);

        // Ctrl / Meta + 滚轮缩放（以鼠标指针为中心，围绕该点放大/缩小）
        elements.canvasWrapper.addEventListener('wheel', (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (!state.image) return;
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.1 : -0.1;
            zoomAroundPoint(state.zoom + delta, e);
        }, { passive: false });

        // 快捷键：Ctrl+Z 撤销 / Ctrl+Y 或 Ctrl+Shift+Z 重做 / Ctrl+S 保存
        document.addEventListener('keydown', (e) => {
            const mod = e.ctrlKey || e.metaKey;
            if (!mod) return;
            // 当用户正在文本输入框里打字时，不截全局快捷键（避免浏览器撤销输入内容之类的冲突）
            const at = document.activeElement;
            if (at && (at.tagName === 'INPUT' || at.tagName === 'TEXTAREA' || at.isContentEditable)) return;

            const key = e.key.toLowerCase();
            if (key === 'z' && !e.shiftKey) {
                e.preventDefault(); undo();
            } else if ((key === 'z' && e.shiftKey) || key === 'y') {
                e.preventDefault(); redo();
            } else if (key === 's') {
                e.preventDefault(); userTriggeredSave();
            }
        });

        // 页面关闭 / 刷新 / 跳转前：如果有未保存的标注，弹确认提示
        window.addEventListener('beforeunload', (e) => {
            if (!hasUnsavedChanges()) return;
            const msg = '有未保存的标注内容，确定要离开吗？';
            try { e.returnValue = msg; } catch (_) { /* 兼容 */ }
            return msg;
        });

        // 画布事件（绘制）
        elements.overlayCanvas.addEventListener('mousedown', handleMouseDown);
        elements.overlayCanvas.addEventListener('mousemove', handleMouseMove);
        elements.overlayCanvas.addEventListener('mouseup', handleMouseUp);
        elements.overlayCanvas.addEventListener('mouseleave', handleMouseUp);

        // 原“拖动选区内部来移动选区”的入口，现在改为：
        // 按住选区内部拖动 → 平移整个视图（移动页面），配合缩放浏览大图。
        elements.selectionMoveArea.addEventListener('mousedown', startPanning);
        // 选区手柄（调整大小）
        document.querySelectorAll('.selection-handle').forEach(handle => {
            handle.addEventListener('mousedown', startResize);
        });
        // 全局 mousemove/mouseup 处理移动和调整
        document.addEventListener('mousemove', onDocumentMouseMove);
        document.addEventListener('mouseup', onDocumentMouseUp);

        // 原位文字输入：Enter 确认 / Shift+Enter 换行 / Esc 取消 / 点外部取消
        const ip = elements.inPlaceTextInput;
        ip.addEventListener('input', () => autoSizeTextarea(ip));
        ip.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                confirmTextInput();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelTextInput();
            }
        });
        // 鼠标点到输入框以外 → 视为"应用/确认"（和回车同样效果）
        // 只有按 Esc 才取消输入。
        document.addEventListener('mousedown', (e) => {
            if (!state.textPosition) return; // 没在输入无需处理
            if (e.target === ip || ip.contains(e.target)) return;
            confirmTextInput();
        }, true); // capture 阶段先拦截，避免和画布的绘制 mousedown 冲突

        window.addEventListener('resize', handleResize);
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            loadImage(file);
        }
    }

    function handleDrop(e) {
        e.preventDefault();
        elements.dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            loadImage(file);
        }
    }

    function loadImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                state.image = img;
                state.originalImage = img;
                state.history = [];
                state.historyIndex = -1;
                state.paths = [];

                elements.dropZone.style.display = 'none';
                elements.imageContainer.style.display = 'inline-block';
                if (elements.topbarInfo) elements.topbarInfo.classList.remove('hidden');
                if (elements.topbarZoom) elements.topbarZoom.classList.remove('hidden');
                elements.floatingToolbar.classList.add('visible');

                elements.mainCanvas.width = img.width;
                elements.mainCanvas.height = img.height;
                elements.overlayCanvas.width = img.width;
                elements.overlayCanvas.height = img.height;

                ctx.drawImage(img, 0, 0);

                elements.imageSize.textContent = `${img.width} x ${img.height}`;
                elements.fileSize.textContent = formatFileSize(file.size);

                // 创建默认居中选区（图片 60% 大小）
                const selW = Math.max(MIN_SELECTION_SIZE, Math.round(img.width * 0.6));
                const selH = Math.max(MIN_SELECTION_SIZE, Math.round(img.height * 0.6));
                state.selection = {
                    x: Math.round((img.width - selW) / 2),
                    y: Math.round((img.height - selH) / 2),
                    width: selW,
                    height: selH
                };

                fitToWindow();
                drawOverlay();
                saveState();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function selectTool(tool) {
        state.currentTool = tool;
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });

        elements.fontSelector.style.display = tool === 'text' ? 'flex' : 'none';

        // select 工具下选区可交互；其他工具下选区仅作视觉显示
        if (tool === 'select') {
            elements.selectionBox.classList.remove('tool-mode');
        } else {
            elements.selectionBox.classList.add('tool-mode');
        }

        elements.overlayCanvas.style.cursor = getCursor(tool);
    }

    function getCursor(tool) {
        switch (tool) {
            case 'select': return 'default';
            case 'pen': return 'crosshair';
            case 'text': return 'text';
            case 'eraser': return 'cell';
            default: return 'crosshair';
        }
    }

    function getCanvasCoords(e) {
        const rect = elements.overlayCanvas.getBoundingClientRect();
        const scaleX = elements.overlayCanvas.width / rect.width;
        const scaleY = elements.overlayCanvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    // ============ 绘制事件 ============
    function handleMouseDown(e) {
        if (!state.image) return;
        // 仅在绘制工具下处理（select 工具由选区框处理）
        if (state.currentTool === 'select') return;

        e.preventDefault();
        e.stopPropagation();

        const coords = getCanvasCoords(e);

        // 限制起点在选区内
        if (!clampToSelection(coords)) return;

        state.startX = coords.x;
        state.startY = coords.y;
        state.currentX = coords.x;
        state.currentY = coords.y;
        state.isDrawing = true;

        if (state.currentTool === 'pen') {
            state.currentPath = {
                type: 'pen',
                points: [{ x: coords.x, y: coords.y }],
                color: state.strokeColor,
                strokeAlpha: state.strokeAlpha,
                strokeWidth: state.strokeWidth
            };
        } else if (state.currentTool === 'eraser') {
            // 像素级橡皮擦：记录成 freehand 笔画，渲染时用 destination-out 合成
            state.currentPath = {
                type: 'eraser',
                points: [{ x: coords.x, y: coords.y }],
                strokeWidth: Math.max(4, state.strokeWidth * 4)
            };
        } else if (state.currentTool === 'text') {
            state.textPosition = { x: coords.x, y: coords.y };
            showTextInput(e.clientX, e.clientY);
            state.isDrawing = false;
        }
    }

    // 根据 Shift 状态对当前工具的 (startX,startY)->(curX,curY) 做约束
    //   rectangle/circle: 等比（正方形/圆），宽高中较小者绝对值同步到两者
    //   line/arrow: 仅保留水平或垂直方向分量（选较大者）
    function applyShiftConstrain(tool, sx, sy, cx, cy) {
        if (tool === 'rectangle' || tool === 'circle') {
            const dx = cx - sx;
            const dy = cy - sy;
            const ax = Math.abs(dx);
            const ay = Math.abs(dy);
            const s = Math.max(ax, ay);
            const nx = dx === 0 ? s : Math.sign(dx) * s;
            const ny = dy === 0 ? s : Math.sign(dy) * s;
            return { x: sx + nx, y: sy + ny };
        }
        if (tool === 'line' || tool === 'arrow') {
            const dx = cx - sx;
            const dy = cy - sy;
            if (Math.abs(dx) >= Math.abs(dy)) return { x: cx, y: sy };
            return { x: sx, y: cy };
        }
        return { x: cx, y: cy };
    }

    function handleMouseMove(e) {
        if (!state.isDrawing || !state.image) return;
        e.preventDefault();

        const coords = getCanvasCoords(e);
        clampToSelection(coords);

        let cx = coords.x;
        let cy = coords.y;
        if (e.shiftKey &&
            (state.currentTool === 'rectangle' || state.currentTool === 'circle' ||
             state.currentTool === 'line'      || state.currentTool === 'arrow')) {
            const c = applyShiftConstrain(state.currentTool, state.startX, state.startY, cx, cy);
            cx = c.x; cy = c.y;
        }
        state.currentX = cx;
        state.currentY = cy;

        if (state.currentTool === 'pen' && state.currentPath) {
            state.currentPath.points.push({ x: coords.x, y: coords.y });
            drawOverlay();
            drawCurrentPath();
        } else if (state.currentTool === 'eraser' && state.currentPath) {
            state.currentPath.points.push({ x: coords.x, y: coords.y });
            drawOverlay();
            drawCurrentEraserPath();
        } else {
            drawOverlay();
            drawPreview();
        }
    }

    function handleMouseUp(e) {
        if (!state.isDrawing || !state.image) return;

        const coords = getCanvasCoords(e);
        clampToSelection(coords);

        let cx = coords.x;
        let cy = coords.y;
        if (e.shiftKey &&
            (state.currentTool === 'rectangle' || state.currentTool === 'circle' ||
             state.currentTool === 'line'      || state.currentTool === 'arrow')) {
            const c = applyShiftConstrain(state.currentTool, state.startX, state.startY, cx, cy);
            cx = c.x; cy = c.y;
        }
        state.currentX = cx;
        state.currentY = cy;

        if (state.currentTool === 'pen') {
            if (state.currentPath && state.currentPath.points && state.currentPath.points.length >= 2) {
                state.paths.push(state.currentPath);
                saveState();
            }
        } else if (state.currentTool === 'eraser') {
            if (state.currentPath && state.currentPath.points && state.currentPath.points.length >= 1) {
                state.paths.push(state.currentPath);
                saveState();
            }
        } else if (state.currentTool !== 'text') {
            if (Math.abs(state.currentX - state.startX) > 2 || Math.abs(state.currentY - state.startY) > 2) {
                commitShape();
            }
        }

        state.isDrawing = false;
        state.currentPath = null;
        drawOverlay();
    }

    function clampToSelection(coords) {
        const sel = state.selection;
        if (!sel) return true;
        let inside = true;
        if (coords.x < sel.x) { coords.x = sel.x; inside = false; }
        if (coords.x > sel.x + sel.width) { coords.x = sel.x + sel.width; inside = false; }
        if (coords.y < sel.y) { coords.y = sel.y; inside = false; }
        if (coords.y > sel.y + sel.height) { coords.y = sel.y + sel.height; inside = false; }
        return inside;
    }

    // ============ 视图平移（拖动页面） ============
    // 原先在选区内部拖动是“移动选区框”，现在改成：按住选区 → 平移整张图片的页面。
    // 坐标直接用 viewport 的 clientX/Y 与旧 offsetX/Y 累加，
    // 因为 image-container 的 transform = translate(offsetX,offsetY) scale(zoom)，
    // 直接改 offset 不经过图像坐标换算，没有漂移。
    function startPanning(e) {
        if (!state.image) return;
        e.preventDefault();
        e.stopPropagation();

        state.isPanning = true;
        state.panOrigin = {
            clientX: e.clientX,
            clientY: e.clientY,
            offsetX: state.offsetX || 0,
            offsetY: state.offsetY || 0
        };
        document.body.style.userSelect = 'none';
        elements.canvasWrapper.classList.add('panning');
    }

    function panView(e) {
        if (!state.isPanning) return;
        const dx = e.clientX - state.panOrigin.clientX;
        const dy = e.clientY - state.panOrigin.clientY;
        state.offsetX = state.panOrigin.offsetX + dx;
        state.offsetY = state.panOrigin.offsetY + dy;
        updateZoom();
    }

    function stopPanning() {
        if (!state.isPanning) return;
        state.isPanning = false;
        document.body.style.userSelect = '';
        elements.canvasWrapper.classList.remove('panning');
    }

    // ============ 选区调整大小 ============
    function startResize(e) {
        if (!state.image || state.currentTool !== 'select') return;
        e.preventDefault();
        e.stopPropagation();
        state.isResizing = true;
        state.resizeHandle = e.target.dataset.handle;

        const coords = getCanvasCoords(e);
        state.startX = coords.x;
        state.startY = coords.y;
    }

    function resizeSelection(coords) {
        if (!state.selection) return;
        const sel = state.selection;
        const handle = state.resizeHandle;
        const img = state.image;
        const minSize = MIN_SELECTION_SIZE;

        let x = sel.x, y = sel.y, w = sel.width, h = sel.height;

        switch (handle) {
            case 'nw':
                w = sel.x + sel.width - coords.x;
                h = sel.y + sel.height - coords.y;
                x = coords.x;
                y = coords.y;
                break;
            case 'n':
                h = sel.y + sel.height - coords.y;
                y = coords.y;
                break;
            case 'ne':
                w = coords.x - sel.x;
                h = sel.y + sel.height - coords.y;
                y = coords.y;
                break;
            case 'e':
                w = coords.x - sel.x;
                break;
            case 'se':
                w = coords.x - sel.x;
                h = coords.y - sel.y;
                break;
            case 's':
                h = coords.y - sel.y;
                break;
            case 'sw':
                w = sel.x + sel.width - coords.x;
                h = coords.y - sel.y;
                x = coords.x;
                break;
            case 'w':
                w = sel.x + sel.width - coords.x;
                x = coords.x;
                break;
        }

        // 最小尺寸约束
        if (w < minSize) {
            if (['nw', 'sw', 'w'].includes(handle)) x = sel.x + sel.width - minSize;
            w = minSize;
        }
        if (h < minSize) {
            if (['nw', 'ne', 'n'].includes(handle)) y = sel.y + sel.height - minSize;
            h = minSize;
        }
        // 边界约束
        x = Math.max(0, x);
        y = Math.max(0, y);
        if (x + w > img.width) w = img.width - x;
        if (y + h > img.height) h = img.height - y;

        state.selection = { x, y, width: w, height: h };
        updateSelectionBox();
        drawOverlay();
    }

    // ============ 工具栏拖动 ============
    function startToolbarDrag(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const tbRect = elements.floatingToolbar.getBoundingClientRect();
        toolbarDragState.dragging = true;
        toolbarDragState.offsetX = e.clientX - tbRect.left;
        toolbarDragState.offsetY = e.clientY - tbRect.top;
        document.body.style.userSelect = 'none';
    }

    function moveToolbar(e) {
        const wrapperRect = elements.canvasWrapper.getBoundingClientRect();
        const tbRect = elements.floatingToolbar.getBoundingClientRect();
        let left = e.clientX - wrapperRect.left - toolbarDragState.offsetX;
        let top = e.clientY - wrapperRect.top - toolbarDragState.offsetY;
        // 限制在 canvas-wrapper 边界内
        const maxLeft = wrapperRect.width - tbRect.width - 4;
        const maxTop = wrapperRect.height - tbRect.height - 4;
        left = Math.max(4, Math.min(left, maxLeft));
        top = Math.max(4, Math.min(top, maxTop));
        // 从默认居中切换到绝对定位
        elements.floatingToolbar.style.transform = 'none';
        elements.floatingToolbar.style.left = left + 'px';
        elements.floatingToolbar.style.top = top + 'px';
        toolbarDragState.pinnedLeft = left;
        toolbarDragState.pinnedTop = top;
    }

    function stopToolbarDrag() {
        toolbarDragState.dragging = false;
        document.body.style.userSelect = '';
    }

    // ============ 全局鼠标事件（移动/调整/工具栏拖动/平移） ============
    function onDocumentMouseMove(e) {
        if (toolbarDragState.dragging) {
            moveToolbar(e);
            return;
        }
        // 1) 平移视图（拖动页面）优先：拖拽选区内部时，整图跟着动
        if (state.isPanning) {
            panView(e);
            return;
        }
        // 2) 选区调整手柄（拖动选择框现在改为平移页面，因此仅保留 resize 分支）
        if (!state.isResizing) return;
        const coords = getCanvasCoords(e);
        resizeSelection(coords);
    }

    function onDocumentMouseUp(e) {
        if (toolbarDragState.dragging) {
            stopToolbarDrag();
        }
        if (state.isPanning) {
            stopPanning();
        }
        if (state.isResizing) {
            state.isResizing = false;
            state.resizeHandle = null;
        }
    }

    function updateSelectionBox() {
        const sel = state.selection;
        if (!sel || sel.width <= 0 || sel.height <= 0) {
            elements.selectionBox.classList.remove('active');
            elements.selectionBox.style.display = 'none';
            elements.selectionInfo.textContent = '选区: -';
            return;
        }

        const scale = state.zoom;
        // 计算 image-container 相对 canvas-wrapper 的偏移
        const containerRect = elements.imageContainer.getBoundingClientRect();
        const wrapperRect = elements.canvasWrapper.getBoundingClientRect();
        const offsetX = containerRect.left - wrapperRect.left;
        const offsetY = containerRect.top - wrapperRect.top;

        elements.selectionBox.style.display = 'block';
        elements.selectionBox.classList.add('active');
        elements.selectionBox.style.left = (offsetX + sel.x * scale) + 'px';
        elements.selectionBox.style.top = (offsetY + sel.y * scale) + 'px';
        elements.selectionBox.style.width = (sel.width * scale) + 'px';
        elements.selectionBox.style.height = (sel.height * scale) + 'px';

        elements.selectionInfo.textContent =
            `选区: ${Math.round(sel.width)} × ${Math.round(sel.height)} px`;
    }

    // ============ 绘制 ============
    // 把"标注（含橡皮擦效果）"渲染到独立透明画布，避免 destination-out 擦除已经画好的底图
    // offsetCanvas 尺寸：与目标画布一致；clipRect / optOffset：若提供则按此裁剪、平移坐标（0,0 对齐选区左上）
    function buildAnnotationLayer(targetW, targetH, clipRect, useOutputCoords, offsetX, offsetY) {
        const layer = document.createElement('canvas');
        layer.width = targetW;
        layer.height = targetH;
        const ctx = layer.getContext('2d');

        ctx.save();
        if (clipRect) {
            ctx.beginPath();
            ctx.rect(clipRect.x, clipRect.y, clipRect.width, clipRect.height);
            ctx.clip();
        }

        const drawFn = useOutputCoords
            ? (p) => drawPathOnOutput(ctx, p, offsetX || 0, offsetY || 0)
            : (p) => drawPath(ctx, p);

        // 关键：按 paths 的原始时序单步绘制，不能"先画完所有非 eraser、再画 eraser"。
        // 否则用户在擦除后再绘制的内容，会被位置靠前但后执行的 destination-out
        // 一并擦除，视觉上"画完就消失"。
        state.paths.forEach(p => {
            ctx.globalCompositeOperation = (p.type === 'eraser') ? 'destination-out' : 'source-over';
            drawFn(p);
        });

        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
        return layer;
    }

    function drawOverlay() {
        if (!state.originalImage) return;

        overlayCtx.clearRect(0, 0, elements.overlayCanvas.width, elements.overlayCanvas.height);
        overlayCtx.drawImage(state.originalImage, 0, 0);

        // 绘制遮罩 + 选区边框（这些都直接在 overlayCtx 上，不参与橡皮擦合成）
        let sel = null;
        if (state.selection && state.selection.width > 0 && state.selection.height > 0) {
            applyMask();
            sel = state.selection;
        }

        // 独立透明标注层：destination-out 只挖掉标注像素，不会碰到底下 originalImage + mask
        let clip = null;
        if (sel) clip = { x: sel.x, y: sel.y, width: sel.width, height: sel.height };
        const layer = buildAnnotationLayer(
            elements.overlayCanvas.width,
            elements.overlayCanvas.height,
            clip,
            false, 0, 0
        );

        overlayCtx.save();
        if (sel) {
            overlayCtx.beginPath();
            overlayCtx.rect(sel.x, sel.y, sel.width, sel.height);
            overlayCtx.clip();
        }
        overlayCtx.globalCompositeOperation = 'source-over';
        overlayCtx.drawImage(layer, 0, 0);
        overlayCtx.restore();
    }

    function applyMask() {
        if (!state.selection) return;
        const sel = state.selection;
        const W = elements.overlayCanvas.width;
        const H = elements.overlayCanvas.height;

        overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        // 上
        overlayCtx.fillRect(0, 0, W, Math.max(0, sel.y));
        // 下
        overlayCtx.fillRect(0, sel.y + sel.height, W, Math.max(0, H - sel.y - sel.height));
        // 左
        overlayCtx.fillRect(0, sel.y, Math.max(0, sel.x), sel.height);
        // 右
        overlayCtx.fillRect(sel.x + sel.width, sel.y, Math.max(0, W - sel.x - sel.width), sel.height);

        // 选区边框
        overlayCtx.strokeStyle = '#4a90d9';
        overlayCtx.lineWidth = 2;
        overlayCtx.setLineDash([6, 4]);
        overlayCtx.strokeRect(sel.x, sel.y, sel.width, sel.height);
        overlayCtx.setLineDash([]);
    }

    // 计算 path 最终 stroke/fill CSS 颜色（兼容旧无 alpha 的历史数据）
    function pathStrokeCss(path) {
        const a = path.strokeAlpha != null ? path.strokeAlpha : 1;
        return rgba(path.color, a);
    }
    function pathFillCss(path) {
        if (path.fillColor == null || path.fillColor === 'transparent') return 'transparent';
        const a = path.fillAlpha != null ? path.fillAlpha : 1;
        return rgba(path.fillColor, a);
    }

    function drawPath(ctx, path) {
        ctx.save();
        const lineW = (path.strokeWidth != null) ? path.strokeWidth : (path.width || 3);
        ctx.strokeStyle = pathStrokeCss(path);
        ctx.fillStyle = pathFillCss(path);
        ctx.lineWidth = lineW;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (path.type) {
            case 'rectangle':
                if (path.fillColor && path.fillColor !== 'transparent') {
                    ctx.fillRect(path.x, path.y, path.width, path.height);
                }
                ctx.strokeRect(path.x, path.y, path.width, path.height);
                break;

            case 'circle': {
                const rx = path.width / 2;
                const ry = path.height / 2;
                ctx.beginPath();
                ctx.ellipse(path.x + rx, path.y + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
                if (path.fillColor && path.fillColor !== 'transparent') ctx.fill();
                ctx.stroke();
                break;
            }

            case 'arrow':
                drawArrow(ctx, path.x, path.y, path.endX, path.endY, lineW);
                break;

            case 'line':
                ctx.beginPath();
                ctx.moveTo(path.x, path.y);
                ctx.lineTo(path.endX, path.endY);
                ctx.stroke();
                break;

            case 'pen':
            case 'eraser':
                if (path.points && path.points.length > 0) {
                    // eraser: 颜色无关紧要（由外部 destination-out 合成生效），统一填 #000 让形状明确
                    // pen:    必须使用用户选择的真实颜色（由外层已设置的 strokeStyle 决定）
                    ctx.beginPath();
                    if (path.points.length === 1) {
                        const pt = path.points[0];
                        const r = Math.max(1, lineW / 2);
                        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
                        if (path.type === 'eraser') ctx.fillStyle = '#000';
                        else                        ctx.fillStyle = pathStrokeCss(path);
                        ctx.fill();
                    } else {
                        if (path.type === 'eraser') ctx.strokeStyle = '#000';
                        else                        ctx.strokeStyle = pathStrokeCss(path);
                        ctx.moveTo(path.points[0].x, path.points[0].y);
                        path.points.forEach(p => ctx.lineTo(p.x, p.y));
                        ctx.stroke();
                    }
                }
                break;

            case 'text':
                ctx.font = `${path.fontSize}px "${path.fontFamily}"`;
                ctx.fillStyle = pathStrokeCss(path);
                // path.y 存储的是"文字中线（middle）"坐标，点击点 ≈ 字的视觉中心。
                // Canvas fillText 默认 y=baseline；alphabetic baseline 大约在
                // middle 下方 0.35 字号，换算过来就是 y + fontSize*0.35。
                ctx.fillText(path.text, path.x, path.y + path.fontSize * 0.35);
                break;

            case 'blur':
                applyBlur(ctx, path.x, path.y, path.width, path.height);
                break;
        }

        ctx.restore();
    }

    function drawArrow(ctx, fromX, fromY, toX, toY, lineWidth) {
        const headLen = Math.max(lineWidth * 4, 10);
        const angle = Math.atan2(toY - fromY, toX - fromX);

        // 1) 箭杆：终点往箭头内部缩进 headLen*0.55（约等于三角底边中点），
        //    再额外多收 0.4*lineWidth 防 round/butt 端点“顶出”三角外；
        //    lineCap 临时用 butt，端点不冒半圆头。
        const shaftBackoff = headLen * 0.55 + lineWidth * 0.4;
        const shaftEndX = toX - shaftBackoff * Math.cos(angle);
        const shaftEndY = toY - shaftBackoff * Math.sin(angle);
        const prevCap = ctx.lineCap;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(shaftEndX, shaftEndY);
        ctx.stroke();
        ctx.lineCap = prevCap;

        // 2) 箭头三角：尖端比 toX,toY 再往外探出 lineWidth*0.3，
        //    让视觉尖头刚好落在目标点（fill 的像素边缘不会缩回）；
        //    fill 用箭杆同色、不 stroke，避免 stroke 的 lineJoin 磨圆尖头。
        const tipX = toX + lineWidth * 0.3 * Math.cos(angle);
        const tipY = toY + lineWidth * 0.3 * Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
    }

    function applyBlur(ctx, x, y, width, height) {
        if (width <= 0 || height <= 0) return;
        const radius = Math.max(2, Math.max(width, height) / 10);
        // 从原图取该区域（避免标注叠加自身），放到临时画布模糊后绘回
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.max(1, Math.abs(width));
        tempCanvas.height = Math.max(1, Math.abs(height));
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(state.originalImage, x, y, width, height, 0, 0, width, height);
        ctx.save();
        ctx.filter = `blur(${radius}px)`;
        ctx.drawImage(tempCanvas, x, y);
        ctx.filter = 'none';
        ctx.restore();
    }

    function drawPreview() {
        const x = state.startX;
        const y = state.startY;
        const width = state.currentX - x;
        const height = state.currentY - y;

        // 限制预览在选区内
        overlayCtx.save();
        if (state.selection && state.selection.width > 0 && state.selection.height > 0) {
            overlayCtx.beginPath();
            overlayCtx.rect(state.selection.x, state.selection.y, state.selection.width, state.selection.height);
            overlayCtx.clip();
        }

        overlayCtx.strokeStyle = rgba(state.strokeColor, state.strokeAlpha);
        const fillCss = (state.fillColor === 'transparent')
            ? 'transparent'
            : rgba(state.fillColor, state.fillAlpha);
        overlayCtx.fillStyle = fillCss;
        overlayCtx.lineWidth = state.strokeWidth;
        overlayCtx.lineCap = 'round';
        overlayCtx.lineJoin = 'round';

        switch (state.currentTool) {
            case 'rectangle':
                if (state.fillColor !== 'transparent') {
                    overlayCtx.fillRect(x, y, width, height);
                }
                overlayCtx.strokeRect(x, y, width, height);
                break;

            case 'circle': {
                const rx = width / 2;
                const ry = height / 2;
                overlayCtx.beginPath();
                overlayCtx.ellipse(x + rx, y + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
                if (state.fillColor !== 'transparent') overlayCtx.fill();
                overlayCtx.stroke();
                break;
            }

            case 'arrow':
                drawArrow(overlayCtx, x, y, state.currentX, state.currentY, state.strokeWidth);
                break;

            case 'line':
                overlayCtx.beginPath();
                overlayCtx.moveTo(x, y);
                overlayCtx.lineTo(state.currentX, state.currentY);
                overlayCtx.stroke();
                break;

            case 'blur':
                overlayCtx.strokeStyle = '#4a90d9';
                overlayCtx.setLineDash([5, 5]);
                overlayCtx.strokeRect(x, y, width, height);
                overlayCtx.setLineDash([]);
                break;
        }

        overlayCtx.restore();
    }

    function drawCurrentPath() {
        if (!state.currentPath || !state.currentPath.points || state.currentPath.points.length < 2) return;

        overlayCtx.save();
        if (state.selection && state.selection.width > 0 && state.selection.height > 0) {
            overlayCtx.beginPath();
            overlayCtx.rect(state.selection.x, state.selection.y, state.selection.width, state.selection.height);
            overlayCtx.clip();
        }

        overlayCtx.strokeStyle = pathStrokeCss(state.currentPath);
        overlayCtx.lineWidth = state.currentPath.strokeWidth || 3;
        overlayCtx.lineCap = 'round';
        overlayCtx.lineJoin = 'round';

        overlayCtx.beginPath();
        overlayCtx.moveTo(state.currentPath.points[0].x, state.currentPath.points[0].y);
        state.currentPath.points.forEach(p => overlayCtx.lineTo(p.x, p.y));
        overlayCtx.stroke();
        overlayCtx.restore();
    }

    // 橡皮擦实时预览：画一条半透明带边框的“指示线”，让用户看清笔刷宽度和走向
    // 真实的 destination-out 擦除效果会在松手后（加入 state.paths）由 drawOverlay 合成
    function drawCurrentEraserPath() {
        if (!state.currentPath || !state.currentPath.points || state.currentPath.points.length === 0) return;

        overlayCtx.save();
        if (state.selection && state.selection.width > 0 && state.selection.height > 0) {
            overlayCtx.beginPath();
            overlayCtx.rect(state.selection.x, state.selection.y, state.selection.width, state.selection.height);
            overlayCtx.clip();
        }

        const w = state.currentPath.strokeWidth || 10;
        overlayCtx.lineWidth = w;
        overlayCtx.lineCap = 'round';
        overlayCtx.lineJoin = 'round';
        overlayCtx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
        overlayCtx.fillStyle   = 'rgba(239, 68, 68, 0.35)';

        if (state.currentPath.points.length === 1) {
            const pt = state.currentPath.points[0];
            overlayCtx.beginPath();
            overlayCtx.arc(pt.x, pt.y, Math.max(1, w / 2), 0, Math.PI * 2);
            overlayCtx.fill();
        } else {
            overlayCtx.beginPath();
            overlayCtx.moveTo(state.currentPath.points[0].x, state.currentPath.points[0].y);
            state.currentPath.points.forEach(p => overlayCtx.lineTo(p.x, p.y));
            overlayCtx.stroke();
        }

        // 再用细线画一圈轮廓，便于边界看清楚
        overlayCtx.lineWidth = 1;
        overlayCtx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
        overlayCtx.setLineDash([4, 4]);
        if (state.currentPath.points.length === 1) {
            const pt = state.currentPath.points[0];
            overlayCtx.beginPath();
            overlayCtx.arc(pt.x, pt.y, Math.max(1, w / 2), 0, Math.PI * 2);
            overlayCtx.stroke();
        } else {
            overlayCtx.beginPath();
            overlayCtx.moveTo(state.currentPath.points[0].x, state.currentPath.points[0].y);
            state.currentPath.points.forEach(p => overlayCtx.lineTo(p.x, p.y));
            overlayCtx.stroke();
        }
        overlayCtx.setLineDash([]);

        overlayCtx.restore();
    }

    function commitShape() {
        const x = state.startX;
        const y = state.startY;
        const width = state.currentX - x;
        const height = state.currentY - y;

        let shape = null;

        switch (state.currentTool) {
            case 'rectangle':
            case 'circle':
                shape = {
                    type: state.currentTool,
                    x, y,
                    width, height,
                    color: state.strokeColor,
                    strokeAlpha: state.strokeAlpha,
                    fillColor: state.fillColor,
                    fillAlpha: state.fillAlpha,
                    strokeWidth: state.strokeWidth
                };
                break;

            case 'arrow':
            case 'line':
                shape = {
                    type: state.currentTool,
                    x, y,
                    endX: state.currentX,
                    endY: state.currentY,
                    color: state.strokeColor,
                    strokeAlpha: state.strokeAlpha,
                    strokeWidth: state.strokeWidth
                };
                break;

            case 'blur':
                shape = {
                    type: state.currentTool,
                    x, y,
                    width: Math.abs(width),
                    height: Math.abs(height)
                };
                break;
        }

        if (shape) {
            state.paths.push(shape);
            saveState();
        }
    }

    // clientX/clientY 是画布点击在 wrapper 坐标系中的屏幕位置 → 换算成图像像素坐标
    function showTextInput(clientX, clientY) {
        if (!state.textPosition) return;
        const ip = elements.inPlaceTextInput;
        const x = state.textPosition.x;
        const y = state.textPosition.y;

        // textarea 在 image-container 内部 absolute，image-container 有 transform scale(zoom)
        // 因此直接用图像像素坐标即可，浏览器缩放变换会自动应用
        ip.style.left = x + 'px';
        // text.y 现在存的是"文字视觉中心（middle）"，输入框往上抬半个字号，
        // 让输入框垂直居中在点击点上，和绘制后的文字位置一致。
        ip.style.top  = (y - state.fontSize * 0.5) + 'px';
        ip.style.fontSize   = state.fontSize + 'px';
        ip.style.fontFamily = state.fontFamily;
        // 注意：不要覆盖 textarea 的 color / background，否则当 strokeAlpha=0 或
        // 描边颜色 = 背景色时，文本完全看不见。把当前描边颜色通过 CSS 变量
        // --ip-color 传给左上角的色点 ::before，作为"最终绘制颜色"提示。
        ip.style.setProperty('--ip-color', rgba(state.strokeColor, state.strokeAlpha / 100));
        ip.dataset.color = rgba(state.strokeColor, state.strokeAlpha / 100);

        ip.value = '';
        ip.style.display = 'block';
        // 让高度/宽度随内容自适应（输入变化时 resize）
        autoSizeTextarea(ip);
        setTimeout(() => {
            ip.focus();
            autoSizeTextarea(ip);
        }, 0);
    }

    function autoSizeTextarea(el) {
        // 先重置高度/宽度为最小值，让 scrollHeight/scrollWidth 成为内容真实尺寸
        el.style.height = 'auto';
        el.style.width  = 'auto';
        // 计算单行字符数估算宽度，使用 scrollWidth 保证至少显示所有字符
        el.style.width = Math.max(80, Math.min(800, el.scrollWidth + 4)) + 'px';
        el.style.height = el.scrollHeight + 'px';
    }

    function confirmTextInput() {
        const ip = elements.inPlaceTextInput;
        const text = ip.value;
        // 允许文本含空白，但去掉首尾多余空行（至少一行有效字符）
        const trimmed = text.replace(/^\s+|\s+$/g, '');
        if (trimmed && state.textPosition) {
            state.paths.push({
                type: 'text',
                x: state.textPosition.x,
                y: state.textPosition.y,
                text: text.replace(/\s+$/,''), // 仅去掉尾空白，保留换行/前导
                color: state.strokeColor,
                strokeAlpha: state.strokeAlpha,
                fontFamily: state.fontFamily,
                fontSize: state.fontSize
            });
            saveState();
            drawOverlay();
        }
        cancelTextInput();
    }

    function cancelTextInput() {
        const ip = elements.inPlaceTextInput;
        ip.style.display = 'none';
        ip.value = '';
        state.textPosition = null;
    }

    function saveState() {
        state.historyIndex++;
        state.history = state.history.slice(0, state.historyIndex);
        state.history.push(JSON.parse(JSON.stringify(state.paths)));
        // 只要有新的历史提交（新画/擦除/撤销/重做/清空 都算一次改动），标记 dirty，除非路径集为空
        state.dirty = state.paths.length > 0;
        updateUndoRedoButtons();
    }

    function undo() {
        if (state.historyIndex > 0) {
            state.historyIndex--;
            state.paths = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
            state.dirty = state.paths.length > 0;
            drawOverlay();
            updateUndoRedoButtons();
        }
    }

    function redo() {
        if (state.historyIndex < state.history.length - 1) {
            state.historyIndex++;
            state.paths = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
            state.dirty = state.paths.length > 0;
            drawOverlay();
            updateUndoRedoButtons();
        }
    }

    function updateUndoRedoButtons() {
        elements.undoBtn.disabled = state.historyIndex <= 0;
        elements.redoBtn.disabled = state.historyIndex >= state.history.length - 1;
    }

    function clearCanvas() {
        if (state.paths.length === 0) return;
        if (confirm('确定要清除所有标注吗？')) {
            state.paths = [];
            saveState();
            drawOverlay();
        }
    }

    function saveImage() {
        if (!state.image) return;
        const sel = state.selection;
        if (!sel || sel.width <= 0 || sel.height <= 0) {
            alert('请先在图片上调整选区');
            return;
        }

        const W = Math.round(sel.width);
        const H = Math.round(sel.height);

        // 1) 独立透明"标注层"：destination-out 只在这一层上生效，不会碰到底图像素
        const annos = document.createElement('canvas');
        annos.width = W;
        annos.height = H;
        const aCtx = annos.getContext('2d');

        aCtx.save();
        aCtx.beginPath();
        aCtx.rect(0, 0, W, H);
        aCtx.clip();
        // 与 overlay 渲染保持一致：按原始时序单步绘制，确保"先擦除→再绘制"的
        // 场景下，destination-out 只作用于它之前画过的内容，不会擦除后面新画的。
        state.paths.forEach(p => {
            aCtx.globalCompositeOperation = (p.type === 'eraser') ? 'destination-out' : 'source-over';
            drawPathOnOutput(aCtx, p, sel.x, sel.y);
        });
        aCtx.globalCompositeOperation = 'source-over';
        aCtx.restore();

        // 2) 输出画布：先画原图 → 再在其上画"已经擦除处理好"的标注层（纯叠加，不再改合成模式）
        const out = document.createElement('canvas');
        out.width = W;
        out.height = H;
        const outCtx = out.getContext('2d');

        outCtx.drawImage(state.originalImage,
            sel.x, sel.y, sel.width, sel.height,
            0, 0, W, H);

        outCtx.save();
        outCtx.beginPath();
        outCtx.rect(0, 0, W, H);
        outCtx.clip();
        outCtx.globalCompositeOperation = 'source-over';
        outCtx.drawImage(annos, 0, 0);
        outCtx.restore();

        const link = document.createElement('a');
        link.download = 'annotated_' + Date.now() + '.png';
        link.href = out.toDataURL('image/png');
        link.click();
    }

    function drawPathOnOutput(ctx, path, offsetX, offsetY) {
        ctx.save();
        const lineW = (path.strokeWidth != null) ? path.strokeWidth : (path.width || 3);
        ctx.strokeStyle = pathStrokeCss(path);
        ctx.fillStyle = pathFillCss(path);
        ctx.lineWidth = lineW;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (path.type) {
            case 'rectangle':
                if (path.fillColor && path.fillColor !== 'transparent') {
                    ctx.fillRect(path.x - offsetX, path.y - offsetY, path.width, path.height);
                }
                ctx.strokeRect(path.x - offsetX, path.y - offsetY, path.width, path.height);
                break;

            case 'circle': {
                const rx = path.width / 2;
                const ry = path.height / 2;
                ctx.beginPath();
                ctx.ellipse(path.x - offsetX + rx, path.y - offsetY + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
                if (path.fillColor && path.fillColor !== 'transparent') ctx.fill();
                ctx.stroke();
                break;
            }

            case 'arrow':
                drawArrow(ctx, path.x - offsetX, path.y - offsetY, path.endX - offsetX, path.endY - offsetY, lineW);
                break;

            case 'line':
                ctx.beginPath();
                ctx.moveTo(path.x - offsetX, path.y - offsetY);
                ctx.lineTo(path.endX - offsetX, path.endY - offsetY);
                ctx.stroke();
                break;

            case 'pen':
            case 'eraser':
                if (path.points && path.points.length > 0) {
                    ctx.beginPath();
                    if (path.points.length === 1) {
                        const pt = path.points[0];
                        const r = Math.max(1, lineW / 2);
                        ctx.arc(pt.x - offsetX, pt.y - offsetY, r, 0, Math.PI * 2);
                        if (path.type === 'eraser') ctx.fillStyle = '#000';
                        else                        ctx.fillStyle = pathStrokeCss(path);
                        ctx.fill();
                    } else {
                        if (path.type === 'eraser') ctx.strokeStyle = '#000';
                        else                        ctx.strokeStyle = pathStrokeCss(path);
                        ctx.moveTo(path.points[0].x - offsetX, path.points[0].y - offsetY);
                        path.points.forEach(p => ctx.lineTo(p.x - offsetX, p.y - offsetY));
                        ctx.stroke();
                    }
                }
                break;

            case 'text':
                ctx.font = `${path.fontSize}px "${path.fontFamily}"`;
                ctx.fillStyle = pathStrokeCss(path);
                ctx.fillText(path.text, path.x - offsetX, path.y - offsetY + path.fontSize * 0.35);
                break;

            case 'blur':
                applyBlurOnOutput(ctx, path, offsetX, offsetY);
                break;
        }

        ctx.restore();
    }

    function applyBlurOnOutput(ctx, path, offsetX, offsetY) {
        const sel = state.selection;
        const x = path.x - offsetX;
        const y = path.y - offsetY;
        const w = path.width;
        const h = path.height;
        if (w <= 0 || h <= 0) return;
        const radius = Math.max(2, Math.max(w, h) / 10);

        // 从原图选区内对应区域取像素
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        // 源坐标在原图中：path.x, path.y
        tempCtx.drawImage(state.originalImage, path.x, path.y, w, h, 0, 0, w, h);

        ctx.save();
        ctx.filter = `blur(${radius}px)`;
        ctx.drawImage(tempCanvas, x, y);
        ctx.filter = 'none';
        ctx.restore();
    }

    function setZoom(newZoom) {
        state.zoom = Math.max(0.1, Math.min(5, newZoom));
        updateZoom();
    }

    function updateZoom() {
        const scale = state.zoom;
        const ox = state.offsetX || 0;
        const oy = state.offsetY || 0;
        // translate 写在前面 + origin 0 0，保证"先移动偏移 → 再围绕新原点缩放"，对应 zoomAroundPoint 的数学含义
        elements.imageContainer.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
        elements.imageContainer.style.transformOrigin = '0 0';
        elements.zoomLevel.textContent = Math.round(scale * 100) + '%';
        updateSelectionBox();
    }

    // 围绕鼠标指针做缩放：缩放前后，指针下对应的"图像逻辑像素"位置保持不变
    // 稳定公式（兼容 wrapper 是否自带默认居中 / image-container 是否 absolute）：
    //   visual_cx  = layoutX + oldOX     （+ 缩放后容器的相对 wrapper 左）
    //   mouse_delta_in_container = (mouse - visual_cx) / oldZoom → 图像 scale=1 时的逻辑点
    //   new 目标：mouse = layoutX + newOX + imgLocal * newZoom → newOX = mouse - layoutX - imgLocal * newZoom
    function zoomAroundPoint(newZoom, wheelEvent) {
        const nextZoom = Math.max(0.1, Math.min(5, newZoom));
        if (nextZoom === state.zoom) { setZoom(nextZoom); return; }

        const wrapperRect = elements.canvasWrapper.getBoundingClientRect();
        const containerRect = elements.imageContainer.getBoundingClientRect();

        const mx = wheelEvent.clientX - wrapperRect.left;
        const my = wheelEvent.clientY - wrapperRect.top;

        const oldOX = state.offsetX || 0;
        const oldOY = state.offsetY || 0;
        const cx = containerRect.left - wrapperRect.left; // 容器当前视觉位置（wrapper 相对）
        const cy = containerRect.top  - wrapperRect.top;
        // layoutX/Y = 容器在无 translate 之前的默认布局位置（wrapper 相对）
        const layoutX = cx - oldOX;
        const layoutY = cy - oldOY;

        const imgLocalX = (mx - cx) / state.zoom; // 鼠标指向的图像逻辑点（scale=1）
        const imgLocalY = (my - cy) / state.zoom;

        const newOX = mx - layoutX - imgLocalX * nextZoom;
        const newOY = my - layoutY - imgLocalY * nextZoom;

        state.offsetX = newOX;
        state.offsetY = newOY;
        state.zoom = nextZoom;
        updateZoom();
    }

    // 当前是否有"用户改动过但尚未确认保存"的内容：
    // - 有标注（paths 非空）算未保存；
    // - 只要用户按过保存按钮（成功走完 saveImage 下载流程），就把 dirty 复位
    function hasUnsavedChanges() {
        if (state.dirty === true) return true;
        return Array.isArray(state.paths) && state.paths.length > 0;
    }

    // 统一保存入口：按钮 / Ctrl+S 都走这里，成功后清 dirty 标志
    function userTriggeredSave() {
        const before = state.paths.length;
        saveImage();
        // 如果 saveImage 没提前 return（即走完了下载），清空 dirty
        if (state.image && state.selection && state.selection.width > 0) {
            state.dirty = false;
        }
        void before;
    }

    function fitToWindow() {
        if (!state.image) return;

        const wrapper = elements.canvasWrapper;
        const padding = 80;
        const availWidth = wrapper.clientWidth - padding;
        const availHeight = wrapper.clientHeight - padding;

        const scaleX = availWidth / state.image.width;
        const scaleY = availHeight / state.image.height;
        const nextZoom = Math.min(scaleX, scaleY, 1);
        state.zoom = nextZoom;

        // "自适应窗口"时重新居中：让容器相对 wrapper 视觉居中
        const scaledW = state.image.width * nextZoom;
        const scaledH = state.image.height * nextZoom;
        state.offsetX = Math.max(0, (wrapper.clientWidth  - scaledW) / 2);
        state.offsetY = Math.max(0, (wrapper.clientHeight - scaledH) / 2);

        updateZoom();
    }

    function handleResize() {
        if (state.image) {
            fitToWindow();
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
