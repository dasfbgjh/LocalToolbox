document.addEventListener('DOMContentLoaded', function () {
    // ===== SVG Icon Library =====
    var ALL_ICONS = getAllIcons();
    var { iconCategories, iconKeywords } = getIconDesigner();

    function makeIconSvg(icon) {
        if (!icon || !icon.icon) return '';
        var [width, height, , , pathData] = icon.icon;
        return '<svg viewBox="0 0 ' + width + ' ' + height + '" fill="currentColor"><path d="' + pathData + '" /></svg>';
    }

    // ===== State =====
    var state = {
        iconType: 'icon',       // 'icon' or 'text'
        selectedIcon: ALL_ICONS.faStar || Object.values(ALL_ICONS)[0],
        iconText: 'A',
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        iconColor: '#FFFFFF',
        iconAlpha: 100,
        iconSize: 60,
        iconRotation: 0,
        size: 256,
        shape: 'rounded',
        radius: 48,
        bgType: 'solid',
        bgColor: '#000000',
        bgAlpha: 100,
        gradStart: '#6366F1',
        gradStartAlpha: 100,
        gradEnd: '#8B5CF6',
        gradEndAlpha: 100,
        gradDir: 45
    };

    var canvas = Tools.$('preview-canvas');
    var iconGrid = Tools.$('icon-grid');
    var iconCats = Tools.$('icon-cats');
    var iconSearch = Tools.$('icon-search');
    var activeCategory = 'popular';

    // ===== Icon type toggle =====
    Tools.$$('button[data-itype]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            Tools.$$('button[data-itype]').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            state.iconType = btn.getAttribute('data-itype');
            Tools.$('icon-select-section').classList.toggle('hidden', state.iconType !== 'icon');
            Tools.$('text-input-section').classList.toggle('hidden', state.iconType !== 'text');
            render();
        });
    });

    // ===== Render icon categories =====
    function renderCategories() {
        iconCats.innerHTML = '';
        iconCategories.forEach(function (cat) {
            var btn = Tools.el('button', {
                class: 'icon-cat-btn' + (cat.key === activeCategory ? ' active' : ''),
                text: cat.name,
                onclick: function () {
                    activeCategory = cat.key;
                    renderCategories();
                    renderIconGrid();
                }
            });
            iconCats.appendChild(btn);
        });
    }

    // ===== Render icon grid =====
    function renderIconGrid() {
        var searchTerm = iconSearch.value.trim().toLowerCase();
        var icons = [];

        if (searchTerm) {
            var allIcons = {};
            iconCategories.forEach(function (cat) {
                cat.icons.forEach(function (icon) { allIcons[icon.iconName] = icon; });
            });
            Object.keys(allIcons).forEach(function (iconName) {
                var icon = allIcons[iconName];
                var keywords = iconKeywords[iconName] || [];
                var matches = iconName.toLowerCase().indexOf(searchTerm) !== -1 ||
                    keywords.some(function (kw) { return kw.toLowerCase().indexOf(searchTerm) !== -1; });
                if (matches) icons.push(icon);
            });
        } else {
            var cat = iconCategories.filter(function (c) { return c.key === activeCategory; })[0];
            icons = cat ? cat.icons : [];
        }

        iconGrid.innerHTML = '';
        if (icons.length === 0) {
            iconGrid.innerHTML = '<div class="icon-no-result">没有找到匹配的图标</div>';
            return;
        }
        icons.forEach(function (icon) {
            var item = Tools.el('div', {
                class: 'icon-item' + (state.selectedIcon === icon ? ' active' : ''),
                'data-icon': icon.iconName,
                title: icon.iconName,
                onclick: function () {
                    state.selectedIcon = icon;
                    Tools.$$('.icon-item').forEach(function (el) { el.classList.remove('active'); });
                    this.classList.add('active');
                    render();
                }
            });
            item.innerHTML = makeIconSvg(icon);
            iconGrid.appendChild(item);
        });
    }

    iconSearch.addEventListener('input', renderIconGrid);
    renderCategories();
    renderIconGrid();

    // ===== Text mode inputs =====
    Tools.$('icon-text').addEventListener('input', function (e) { state.iconText = e.target.value; render(); });
    Tools.$('font-family').addEventListener('change', function (e) { state.fontFamily = e.target.value; render(); });
    Tools.$('font-weight').addEventListener('change', function (e) { state.fontWeight = e.target.value; render(); });

    // ===== Color helpers（颜色 + 透明度统一换算，与标注工具一致） =====
    function normalizeHex(hex) {
        if (!hex) return '#000000';
        hex = hex.trim();
        if (/^#[0-9A-Fa-f]{3}$/.test(hex)) {
            return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        }
        if (/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex;
        if (/^#[0-9A-Fa-f]{8}$/.test(hex)) return hex.slice(0, 7);
        return '#000000';
    }

    function rgba(hex, alphaPctOrNull) {
        var h = normalizeHex(hex).slice(1);
        var r = parseInt(h.substring(0, 2), 16);
        var g = parseInt(h.substring(2, 4), 16);
        var b = parseInt(h.substring(4, 6), 16);
        var a = (alphaPctOrNull == null) ? 1 : (Number(alphaPctOrNull) / 100);
        if (isNaN(a)) a = 1;
        a = Math.max(0, Math.min(1, a));
        return 'rgba(' + r + ',' + g + ',' + b + ',' + (Math.round(a * 1000) / 1000) + ')';
    }

    function rgbaToHex(hex, alphaPct) {
        var h = normalizeHex(hex).slice(1);
        if (alphaPct == null || Number(alphaPct) >= 100) return '#' + h;
        var a = Math.max(0, Math.min(255, Math.round(Number(alphaPct) * 255 / 100)));
        var aHex = a.toString(16).padStart(2, '0');
        return '#' + h + aHex;
    }

    function updateColorOverlay(overlayId, hex, alphaPct) {
        var el = Tools.$(overlayId);
        if (el) el.style.background = rgba(hex, alphaPct);
    }

    /**
     * 绑定一组"颜色 + 透明度"控件：
     *   colorId = color input 的 id（原生取色器，7 位 hex）
     *   textId  = HEX 文本 input 的 id（允许 #RRGGBB 或 #RRGGBBAA）
     *   alphaId = 透明度滑块 id（0-100）
     *   alphaValueId = 显示百分比的 span 的 id
     *   overlayId = 颜色指示块里的 .color-indicator__overlay id
     *   hexKey   = state 中颜色字段名
     *   alphaKey = state 中透明度字段名
     */
    function bindColorQuad(colorId, textId, alphaId, alphaValueId, overlayId, hexKey, alphaKey) {
        var c = Tools.$(colorId);
        var t = Tools.$(textId);
        var a = Tools.$(alphaId);
        var av = Tools.$(alphaValueId);

        function refreshOverlay() {
            updateColorOverlay(overlayId, state[hexKey], state[alphaKey]);
        }

        c.addEventListener('input', function () {
            var v = normalizeHex(c.value);
            c.value = v.slice(0, 7);
            t.value = rgbaToHex(v, state[alphaKey]);
            state[hexKey] = v;
            refreshOverlay();
            render();
        });

        t.addEventListener('input', function () {
            var v = (t.value || '').trim();
            // 支持 #RRGGBB（不改变 alpha）和 #RRGGBBAA（从 alpha 提取）
            if (/^#[0-9A-Fa-f]{8}$/.test(v)) {
                var extractedAlpha = Math.round(parseInt(v.slice(7, 9), 16) * 100 / 255);
                var hexPart = '#' + v.slice(1, 7);
                c.value = hexPart;
                state[hexKey] = hexPart;
                state[alphaKey] = extractedAlpha;
                a.value = String(extractedAlpha);
                av.textContent = extractedAlpha + '%';
                refreshOverlay();
                render();
            } else if (/^#[0-9A-Fa-f]{6}$/.test(v) || /^#[0-9A-Fa-f]{3}$/.test(v)) {
                var norm = normalizeHex(v);
                c.value = norm.slice(0, 7);
                t.value = rgbaToHex(norm, state[alphaKey]);
                state[hexKey] = norm;
                refreshOverlay();
                render();
            }
        });

        a.addEventListener('input', function () {
            var val = parseInt(a.value, 10);
            if (isNaN(val)) val = 100;
            val = Math.max(0, Math.min(100, val));
            state[alphaKey] = val;
            av.textContent = val + '%';
            t.value = rgbaToHex(state[hexKey], val);
            refreshOverlay();
            render();
        });

        refreshOverlay();
    }

    bindColorQuad('icon-color', 'icon-color-text', 'icon-alpha', 'icon-alpha-value', 'iconColorOverlay', 'iconColor', 'iconAlpha');
    bindColorQuad('bg-color',   'bg-color-text',   'bg-alpha',   'bg-alpha-value',   'bgColorOverlay',   'bgColor',   'bgAlpha');
    bindColorQuad('grad-start', 'grad-start-text', 'grad-start-alpha', 'grad-start-alpha-value', 'gradStartOverlay', 'gradStart', 'gradStartAlpha');
    bindColorQuad('grad-end',   'grad-end-text',   'grad-end-alpha',   'grad-end-alpha-value',   'gradEndOverlay',   'gradEnd',   'gradEndAlpha');

    var iconSizeInput = Tools.$('icon-size');
    iconSizeInput.addEventListener('input', function () {
        state.iconSize = parseInt(iconSizeInput.value, 10);
        Tools.$('icon-size-value').textContent = state.iconSize + '%';
        render();
    });

    var iconRotInput = Tools.$('icon-rotation');
    iconRotInput.addEventListener('input', function () {
        state.iconRotation = parseInt(iconRotInput.value, 10);
        Tools.$('icon-rotation-value').textContent = state.iconRotation + '°';
        render();
    });

    // ===== Background settings =====
    Tools.$$('button[data-size]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            Tools.$$('button[data-size]').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            state.size = parseInt(btn.getAttribute('data-size'), 10);
            state.radius = Math.round(state.size * 0.1875);
            Tools.$('radius').value = state.radius;
            Tools.$('radius-value').textContent = state.radius + ' px';
            render();
        });
    });

    Tools.$$('button[data-shape]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            Tools.$$('button[data-shape]').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            state.shape = btn.getAttribute('data-shape');
            render();
        });
    });

    Tools.$$('button[data-bgtype]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            Tools.$$('button[data-bgtype]').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            state.bgType = btn.getAttribute('data-bgtype');
            Tools.$('solid-section').classList.toggle('hidden', state.bgType !== 'solid');
            Tools.$('gradient-section').classList.toggle('hidden', state.bgType !== 'gradient');
            render();
        });
    });

    var radiusInput = Tools.$('radius');
    radiusInput.addEventListener('input', function () {
        state.radius = parseInt(radiusInput.value, 10);
        Tools.$('radius-value').textContent = state.radius + ' px';
        render();
    });

    var gradDirInput = Tools.$('grad-dir');
    gradDirInput.addEventListener('input', function () {
        state.gradDir = parseInt(gradDirInput.value, 10);
        Tools.$('grad-dir-value').textContent = state.gradDir + '°';
        render();
    });

    // ===== Presets =====
    var presets = [
        { name: 'iOS 风', bgType: 'solid', bgColor: '#000000', gradStart: '#000', gradEnd: '#000', gradDir: 45, iconColor: '#FFFFFF', shape: 'rounded', iconSize: 60, iconRotation: 0, selectedIcon: ALL_ICONS.faStar, iconText: 'A' },
        { name: 'Material', bgType: 'solid', bgColor: '#4CAF50', gradStart: '#4CAF50', gradEnd: '#4CAF50', gradDir: 45, iconColor: '#FFFFFF', shape: 'circle', iconSize: 55, iconRotation: 0, selectedIcon: ALL_ICONS.faStar, iconText: 'M' },
        { name: '极简', bgType: 'solid', bgColor: '#FFFFFF', gradStart: '#fff', gradEnd: '#fff', gradDir: 45, iconColor: '#000000', shape: 'square', iconSize: 50, iconRotation: 0, selectedIcon: ALL_ICONS.faStar, iconText: 'X' },
        { name: '紫色渐变', bgType: 'gradient', bgColor: '#8B5CF6', gradStart: '#6366F1', gradEnd: '#8B5CF6', gradDir: 45, iconColor: '#FFFFFF', shape: 'rounded', iconSize: 65, iconRotation: 0, selectedIcon: ALL_ICONS.faStar, iconText: 'G' },
        { name: '霓虹', bgType: 'gradient', bgColor: '#000', gradStart: '#FF006E', gradEnd: '#8338EC', gradDir: 135, iconColor: '#FFFFFF', shape: 'circle', iconSize: 70, iconRotation: 15, selectedIcon: ALL_ICONS.faZap || ALL_ICONS.faStar, iconText: 'N' },
        { name: '夕阳', bgType: 'gradient', bgColor: '#F72585', gradStart: '#F72585', gradEnd: '#B5179E', gradDir: 135, iconColor: '#FFE66D', shape: 'square', iconSize: 65, iconRotation: 0, selectedIcon: ALL_ICONS.faSun || ALL_ICONS.faStar, iconText: 'S' },
        { name: '玻璃拟态', bgType: 'gradient', bgColor: '#93C5FD', gradStart: '#BFDBFE', gradEnd: '#60A5FA', gradDir: 135, iconColor: '#FFFFFF', shape: 'rounded', iconSize: 60, iconRotation: 0, selectedIcon: ALL_ICONS.faStar, iconText: 'Gl' },
        { name: '新拟态', bgType: 'solid', bgColor: '#E0E5EC', gradStart: '#E0E5EC', gradEnd: '#E0E5EC', gradDir: 45, iconColor: '#9BAACF', shape: 'rounded', iconSize: 55, iconRotation: 0, selectedIcon: ALL_ICONS.faStar, iconText: 'Ne' }
    ];

    var presetList = Tools.$('preset-list');
    presets.forEach(function (p) {
        var item = Tools.el('div', { class: 'preset-item' });
        var head = Tools.el('div', { class: 'preset-head' });
        var swatchBg = p.bgType === 'gradient'
            ? 'linear-gradient(' + p.gradDir + 'deg, ' + p.gradStart + ', ' + p.gradEnd + ')'
            : p.bgColor;
        head.appendChild(Tools.el('div', { class: 'preset-swatch', style: { background: swatchBg } }));
        head.appendChild(Tools.el('span', { class: 'preset-name', text: p.name }));
        item.appendChild(head);
        item.appendChild(Tools.el('div', { class: 'preset-desc', text: p.shape + ' • ' + p.iconSize + '%' }));
        item.addEventListener('click', function () {
            Object.keys(p).forEach(function (k) { if (k !== 'name') state[k] = p[k]; });
            // 预设模板没有指定透明度，统一还原为 100%（半透明图标/背景都是显式设置的）
            state.iconAlpha = 100;
            state.bgAlpha = 100;
            state.gradStartAlpha = 100;
            state.gradEndAlpha = 100;
            syncUI();
            render();
        });
        presetList.appendChild(item);
    });

    function syncUI() {
        Tools.$$('button[data-itype]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-itype') === state.iconType); });
        Tools.$('icon-select-section').classList.toggle('hidden', state.iconType !== 'icon');
        Tools.$('text-input-section').classList.toggle('hidden', state.iconType !== 'text');
        Tools.$$('button[data-size]').forEach(function (b) { b.classList.toggle('active', parseInt(b.getAttribute('data-size'), 10) === state.size); });
        Tools.$$('button[data-shape]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-shape') === state.shape); });
        Tools.$$('button[data-bgtype]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-bgtype') === state.bgType); });
        Tools.$('solid-section').classList.toggle('hidden', state.bgType !== 'solid');
        Tools.$('gradient-section').classList.toggle('hidden', state.bgType !== 'gradient');

        Tools.$('icon-color').value = state.iconColor.slice(0, 7);
        Tools.$('icon-color-text').value = rgbaToHex(state.iconColor, state.iconAlpha);
        Tools.$('icon-alpha').value = String(state.iconAlpha);
        Tools.$('icon-alpha-value').textContent = state.iconAlpha + '%';
        updateColorOverlay('iconColorOverlay', state.iconColor, state.iconAlpha);

        Tools.$('bg-color').value = state.bgColor.slice(0, 7);
        Tools.$('bg-color-text').value = rgbaToHex(state.bgColor, state.bgAlpha);
        Tools.$('bg-alpha').value = String(state.bgAlpha);
        Tools.$('bg-alpha-value').textContent = state.bgAlpha + '%';
        updateColorOverlay('bgColorOverlay', state.bgColor, state.bgAlpha);

        Tools.$('grad-start').value = state.gradStart.slice(0, 7);
        Tools.$('grad-start-text').value = rgbaToHex(state.gradStart, state.gradStartAlpha);
        Tools.$('grad-start-alpha').value = String(state.gradStartAlpha);
        Tools.$('grad-start-alpha-value').textContent = state.gradStartAlpha + '%';
        updateColorOverlay('gradStartOverlay', state.gradStart, state.gradStartAlpha);

        Tools.$('grad-end').value = state.gradEnd.slice(0, 7);
        Tools.$('grad-end-text').value = rgbaToHex(state.gradEnd, state.gradEndAlpha);
        Tools.$('grad-end-alpha').value = String(state.gradEndAlpha);
        Tools.$('grad-end-alpha-value').textContent = state.gradEndAlpha + '%';
        updateColorOverlay('gradEndOverlay', state.gradEnd, state.gradEndAlpha);

        Tools.$('grad-dir').value = state.gradDir; Tools.$('grad-dir-value').textContent = state.gradDir + '°';
        Tools.$('icon-size').value = state.iconSize; Tools.$('icon-size-value').textContent = state.iconSize + '%';
        Tools.$('icon-rotation').value = state.iconRotation; Tools.$('icon-rotation-value').textContent = state.iconRotation + '°';
        Tools.$('radius').value = state.radius; Tools.$('radius-value').textContent = state.radius + ' px';
        Tools.$('icon-text').value = state.iconText;
        Tools.$('font-family').value = state.fontFamily;
        Tools.$('font-weight').value = state.fontWeight;
        Tools.$$('.icon-item').forEach(function (el) { el.classList.toggle('active', el.getAttribute('data-icon') === state.selectedIcon.iconName); });
    }

    // ===== Canvas rendering =====
    function drawRoundedRect(ctx, x, y, w, h, r) {
        if (r > w / 2) r = w / 2;
        if (r > h / 2) r = h / 2;
        r = Math.max(0, r);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function drawHexagon(ctx, cx, cy, r) {
        ctx.beginPath();
        for (var i = 0; i < 6; i++) {
            var angle = Math.PI / 3 * i + Math.PI / 6;
            var x = cx + r * Math.cos(angle);
            var y = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }

    function render(targetCanvas, targetSize) {
        var cv = targetCanvas || canvas;
        var size = targetSize || state.size;
        cv.width = size; cv.height = size;
        var c = cv.getContext('2d');
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.clearRect(0, 0, size, size);

        // Clip to shape
        c.save();
        var radius = state.shape === 'circle' ? size / 2
            : state.shape === 'square' ? 0
                : state.shape === 'hexagon' ? size / 2
                    : (targetSize ? state.radius * (size / state.size) : state.radius);

        if (state.shape === 'circle') {
            c.beginPath();
            c.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
            c.closePath();
            c.clip();
        } else if (state.shape === 'rounded') {
            drawRoundedRect(c, 0, 0, size, size, radius);
            c.clip();
        } else if (state.shape === 'hexagon') {
            drawHexagon(c, size / 2, size / 2, size / 2);
            c.clip();
        }

        // Fill background
        if (state.bgType === 'gradient') {
            var angle = state.gradDir * Math.PI / 180;
            var x0 = size / 2 - Math.sin(angle) * size / 2;
            var y0 = size / 2 - Math.cos(angle) * size / 2;
            var x1 = size / 2 + Math.sin(angle) * size / 2;
            var y1 = size / 2 + Math.cos(angle) * size / 2;
            var grad = c.createLinearGradient(x0, y0, x1, y1);
            grad.addColorStop(0, rgba(state.gradStart, state.gradStartAlpha));
            grad.addColorStop(1, rgba(state.gradEnd,   state.gradEndAlpha));
            c.fillStyle = grad;
        } else {
            c.fillStyle = rgba(state.bgColor, state.bgAlpha);
        }
        c.fillRect(0, 0, size, size);
        c.restore();

        // Draw icon or text
        c.save();
        if (state.iconRotation) {
            c.translate(size / 2, size / 2);
            c.rotate(state.iconRotation * Math.PI / 180);
            c.translate(-size / 2, -size / 2);
        }

        if (state.iconType === 'text' && state.iconText) {
            var fontSizePx = Math.round(size * state.iconSize / 100);
            c.fillStyle = rgba(state.iconColor, state.iconAlpha);
            c.font = state.fontWeight + ' ' + fontSizePx + 'px ' + state.fontFamily;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(state.iconText, size / 2, size / 2 + fontSizePx * 0.05);
        } else if (state.iconType === 'icon' && state.selectedIcon && state.selectedIcon.icon) {
            var iconSizePx = Math.round(size * state.iconSize / 100);
            var iconX = (size - iconSizePx) / 2;
            var iconY = (size - iconSizePx) / 2;
            var [iconWidth, iconHeight, , , pathData] = state.selectedIcon.icon;
            if (pathData) {
                c.fillStyle = rgba(state.iconColor, state.iconAlpha);
                var path2d = new Path2D('M' + pathData.substring(1));
                c.translate(iconX, iconY);
                var scale = iconSizePx / Math.max(iconWidth, iconHeight);
                c.scale(scale, scale);
                c.fill(path2d);
            }
        }
        c.restore();

        if (!targetCanvas && !targetSize) {
            updatePreviewInfo();
        }
    }

    function getShapeName() {
        var map = { circle: 'circle', rounded: 'rounded-square', square: 'square', hexagon: 'hexagon' };
        return map[state.shape] || state.shape;
    }

    function updatePreviewInfo() {
        var iconName = state.iconType === 'text'
            ? '"' + (state.iconText || 'Text') + '"'
            : (state.selectedIcon ? state.selectedIcon.iconName : 'Icon');
        var mainLine = iconName + ' · ' + getShapeName() + ' · ' + state.iconSize + '% · ' + state.iconRotation + '°';
        var iconAlphaStr = (state.iconAlpha < 100 ? ' @ ' + state.iconAlpha + '%' : '');
        var subLine;
        if (state.bgType === 'solid') {
            var bgAlphaStr = (state.bgAlpha < 100 ? ' @ ' + state.bgAlpha + '%' : '');
            subLine = '背景: ' + state.bgColor + bgAlphaStr + ' | 图标: ' + state.iconColor + iconAlphaStr;
        } else {
            var gsAlphaStr = (state.gradStartAlpha < 100 ? ' @ ' + state.gradStartAlpha + '%' : '');
            var geAlphaStr = (state.gradEndAlpha   < 100 ? ' @ ' + state.gradEndAlpha   + '%' : '');
            subLine = '背景: 渐变 (' + state.gradStart + gsAlphaStr + ' → ' + state.gradEnd + geAlphaStr + ') | 图标: ' + state.iconColor + iconAlphaStr;
        }
        Tools.$('preview-info-main').textContent = mainLine;
        Tools.$('preview-info-sub').textContent = subLine;
    }

    // ===== Export =====
    var exportSize = 256;
    var exportFormat = 'png';

    Tools.$$('button[data-expsize]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            Tools.$$('button[data-expsize]').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            exportSize = parseInt(btn.getAttribute('data-expsize'), 10);
        });
    });

    Tools.$$('button[data-expformat]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            Tools.$$('button[data-expformat]').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            exportFormat = btn.getAttribute('data-expformat');
        });
    });

    Tools.$('btn-download').addEventListener('click', function () {
        if (exportFormat === 'svg') {
            var svgMarkup = generateSvg(state.size);
            var blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
            Tools.download('icon.svg', blob, 'image/svg+xml');
        } else {
            var exportCanvas = document.createElement('canvas');
            render(exportCanvas, exportSize);
            exportCanvas.toBlob(function (blob) {
                if (!blob) { Tools.showBanner('msg-banner', 'error', '导出失败'); return; }
                Tools.download('icon-' + exportSize + '.png', blob, 'image/png');
            }, 'image/png');
        }
    });

    function generateSvg(size) {
        // 将 rgba(...)/hex 颜色拆成 SVG 需要的 stop-color + stop-opacity
        function splitRgba(colorStr) {
            if (colorStr.indexOf('rgba(') === 0) {
                var m = colorStr.match(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/);
                if (m) {
                    var r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
                    var hex = '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
                    return { color: hex, opacity: Number(m[4]) };
                }
            }
            return { color: colorStr, opacity: 1 };
        }

        var iconFill = splitRgba(rgba(state.iconColor, state.iconAlpha));
        var bgFillSolid = splitRgba(rgba(state.bgColor, state.bgAlpha));
        var gradStopStart = splitRgba(rgba(state.gradStart, state.gradStartAlpha));
        var gradStopEnd   = splitRgba(rgba(state.gradEnd,   state.gradEndAlpha));

        var shapeDef = '';
        var clipId = 'shapeClip';
        if (state.shape === 'circle') {
            shapeDef = '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + (size/2) + '"/>';
        } else if (state.shape === 'rounded') {
            var r = Math.round(size * 0.1875);
            shapeDef = '<rect width="' + size + '" height="' + size + '" rx="' + r + '" ry="' + r + '"/>';
        } else if (state.shape === 'hexagon') {
            var points = [];
            for (var i = 0; i < 6; i++) {
                var a = Math.PI / 3 * i + Math.PI / 6;
                points.push((size/2 + (size/2) * Math.cos(a)) + ',' + (size/2 + (size/2) * Math.sin(a)));
            }
            shapeDef = '<polygon points="' + points.join(' ') + '"/>';
        } else {
            shapeDef = '<rect width="' + size + '" height="' + size + '"/>';
        }

        var bgGradient = '';
        if (state.bgType === 'gradient') {
            bgGradient = '<linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(' + state.gradDir + ')">' +
                '<stop offset="0%" style="stop-color:' + gradStopStart.color + ';stop-opacity:' + gradStopStart.opacity + '"/>' +
                '<stop offset="100%" style="stop-color:' + gradStopEnd.color + ';stop-opacity:' + gradStopEnd.opacity + '"/></linearGradient>';
        }
        var bgFill = state.bgType === 'gradient'
            ? 'url(#bgGrad)'
            : ('fill="' + bgFillSolid.color + '" fill-opacity="' + bgFillSolid.opacity + '"');

        var defs = '<defs><clipPath id="' + clipId + '">' + shapeDef + '</clipPath>' + bgGradient + '</defs>';
        var bgRectAttr = state.bgType === 'gradient'
            ? 'fill="url(#bgGrad)"'
            : ('fill="' + bgFillSolid.color + '" fill-opacity="' + bgFillSolid.opacity + '"');
        var bgRect = '<rect width="' + size + '" height="' + size + '" ' + bgRectAttr + ' clip-path="url(#' + clipId + ')"/>';
        void bgFill;

        var iconMarkup = '';
        var iconSizePx = Math.round(size * state.iconSize / 100);

        if (state.iconRotation) {
            var cx = size / 2, cy = size / 2;
            iconMarkup = '<g transform="rotate(' + state.iconRotation + ',' + cx + ',' + cy + ')">';
        } else {
            iconMarkup = '<g>';
        }

        if (state.iconType === 'text' && state.iconText) {
            iconMarkup += '<text x="' + (size/2) + '" y="' + (size/2) + '" font-family="' + state.fontFamily + '" font-weight="' + state.fontWeight + '" font-size="' + iconSizePx + 'px" fill="' + iconFill.color + '" fill-opacity="' + iconFill.opacity + '" text-anchor="middle" dominant-baseline="middle">' + escapeXml(state.iconText) + '</text>';
        } else if (state.iconType === 'icon' && state.selectedIcon && state.selectedIcon.icon) {
            var [iconWidth, iconHeight, , , pathData] = state.selectedIcon.icon;
            var scale = iconSizePx / Math.max(iconWidth, iconHeight);
            var scaledW = iconWidth * scale;
            var scaledH = iconHeight * scale;
            var offsetX = (size - scaledW) / 2;
            var offsetY = (size - scaledH) / 2;
            iconMarkup += '<path d="' + pathData + '" fill="' + iconFill.color + '" fill-opacity="' + iconFill.opacity + '" transform="translate(' + offsetX + ',' + offsetY + ') scale(' + scale + ')"/>';
        }
        iconMarkup += '</g>';

        return '<?xml version="1.0" encoding="UTF-8"?>' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
            defs + bgRect + iconMarkup +
            '</svg>';
    }

    function escapeXml(str) {
        return str.replace(/[<>&'"]/g, function(c) {
            return {'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c];
        });
    }

    // ===== 悬浮预览卡片拖拽 =====
    (function initFloatingPreview() {
        var card = Tools.$('preview-card');
        var handle = Tools.$('preview-drag-handle');
        if (!card || !handle) return;

        var dragging = false;
        var startX = 0, startY = 0;
        var startLeft = 0, startTop = 0;

        // 初始化为 fixed 定位后自动读取一次位置，方便后续拖动累加
        function initPosition() {
            var rect = card.getBoundingClientRect();
            card.style.left = rect.left + 'px';
            card.style.top = rect.top + 'px';
            card.style.right = 'auto';
            card.style.bottom = 'auto';
        }

        handle.addEventListener('mousedown', function (e) {
            // 不拦截标题内的按钮等控件（目前标题里没有，但防御一下）
            if (e.target !== handle) return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            var rect = card.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            // 切换为绝对 left/top，避免 right 锚定
            card.style.left = startLeft + 'px';
            card.style.top = startTop + 'px';
            card.style.right = 'auto';
            card.style.bottom = 'auto';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', function (e) {
            if (!dragging) return;
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            var newLeft = startLeft + dx;
            var newTop = startTop + dy;
            // 约束在视口内（至少保留标题栏可见）
            var maxLeft = window.innerWidth - 80;
            var maxTop = window.innerHeight - 40;
            newLeft = Math.max(-card.offsetWidth + 80, Math.min(maxLeft, newLeft));
            newTop = Math.max(0, Math.min(maxTop, newTop));
            card.style.left = newLeft + 'px';
            card.style.top = newTop + 'px';
        });

        document.addEventListener('mouseup', function () {
            if (!dragging) return;
            dragging = false;
            document.body.style.userSelect = '';
        });

        // 等布局稳定后初始化位置
        setTimeout(initPosition, 0);
    })();

    // Initial render
    render();
});