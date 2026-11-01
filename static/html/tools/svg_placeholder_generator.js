/* ===== SVG Placeholder Generator ===== */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var widthEl = Tools.$('width');
        var heightEl = Tools.$('height');
        var textEl = Tools.$('text');
        var fontSizeEl = Tools.$('font-size');
        var fontValue = Tools.$('font-value');
        var cornerRadiusEl = Tools.$('corner-radius');
        var radiusValue = Tools.$('radius-value');
        var bgColor = Tools.$('bg-color');
        var bgText = Tools.$('bg-text');
        var fgColor = Tools.$('fg-color');
        var fgText = Tools.$('fg-text');
        var gradientEl = Tools.$('gradient');
        var gradientRow = Tools.$('gradient-row');
        var bg2Color = Tools.$('bg2-color');
        var bg2Text = Tools.$('bg2-text');
        var presetGrid = Tools.$('preset-grid');
        var preview = Tools.$('preview');
        var codeOutput = Tools.$('code-output');
        var btnCopy = Tools.$('btn-copy');
        var btnDownload = Tools.$('btn-download');

        var presets = [
            { name: '经典灰', bg: '#e5e7eb', fg: '#6b7280', bg2: '#9ca3af', gradient: false },
            { name: '蓝调', bg: '#dbeafe', fg: '#1e40af', bg2: '#60a5fa', gradient: false },
            { name: '渐变蓝', bg: '#667eea', fg: '#ffffff', bg2: '#764ba2', gradient: true },
            { name: '渐变橙', bg: '#f093fb', fg: '#ffffff', bg2: '#f5576c', gradient: true },
            { name: '深色', bg: '#1f2937', fg: '#9ca3af', bg2: '#374151', gradient: false },
            { name: '暖橙', bg: '#ffedd5', fg: '#9a3412', bg2: '#fdba74', gradient: false }
        ];

        function showMsg(type, text) { Tools.showBanner('banner', type, text); }
        function clearMsg() { Tools.clearBanner('banner'); }

        function isValidHex(c) { return /^#[0-9A-Fa-f]{6}$/.test(c); }

        function syncColorText(colorInput, textInput) { textInput.value = colorInput.value; }
        function syncColorPicker(colorInput, textInput) {
            var v = textInput.value.trim();
            if (isValidHex(v)) { colorInput.value = v; return true; }
            return false;
        }

        // 转义 SVG 文本中的特殊字符
        function escapeXml(s) {
            if (s == null) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        }

        function buildSvg() {
            var w = parseInt(widthEl.value, 10) || 1;
            var h = parseInt(heightEl.value, 10) || 1;
            if (w < 1) w = 1;
            if (h < 1) h = 1;
            var fontSize = parseInt(fontSizeEl.value, 10) || 12;
            var radius = parseInt(cornerRadiusEl.value, 10) || 0;
            var bg = bgText.value.trim();
            var fg = fgText.value.trim();
            var useGradient = gradientEl.checked;
            var bg2 = bg2Text.value.trim();
            var displayText = textEl.value.trim();
            if (!displayText) displayText = w + '×' + h;

            var rectAttrs = 'x="0" y="0" width="' + w + '" height="' + h + '"';
            if (radius > 0) rectAttrs += ' rx="' + radius + '" ry="' + radius + '"';

            var fillPart;
            if (useGradient && isValidHex(bg) && isValidHex(bg2)) {
                fillPart = 'fill="url(#placeholder-gradient)"';
            } else {
                fillPart = 'fill="' + (isValidHex(bg) ? bg : '#e5e7eb') + '"';
            }

            var svg = '<?xml version="1.0" encoding="UTF-8"?>';
            svg += '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">';

            if (useGradient && isValidHex(bg) && isValidHex(bg2)) {
                svg += '<defs>';
                svg += '<linearGradient id="placeholder-gradient" x1="0%" y1="0%" x2="100%" y2="100%">';
                svg += '<stop offset="0%" stop-color="' + bg + '"/>';
                svg += '<stop offset="100%" stop-color="' + bg2 + '"/>';
                svg += '</linearGradient>';
                svg += '</defs>';
            }

            svg += '<rect ' + rectAttrs + ' ' + fillPart + '/>';
            var fgColorVal = isValidHex(fg) ? fg : '#6b7280';
            svg += '<text x="50%" y="50%" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" '
                + 'font-size="' + fontSize + '" fill="' + fgColorVal + '" '
                + 'text-anchor="middle" dominant-baseline="middle">';
            svg += escapeXml(displayText);
            svg += '</text>';
            svg += '</svg>';
            return svg;
        }

        function render() {
            clearMsg();
            var bg = bgText.value.trim();
            var fg = fgText.value.trim();
            if (!isValidHex(bg)) { showMsg('error', '背景色格式无效,请使用 #RRGGBB'); return; }
            if (!isValidHex(fg)) { showMsg('error', '文字颜色格式无效,请使用 #RRGGBB'); return; }
            if (gradientEl.checked && !isValidHex(bg2Text.value.trim())) {
                showMsg('error', '渐变颜色 2 格式无效,请使用 #RRGGBB');
                return;
            }

            var svg = buildSvg();
            preview.innerHTML = svg;
            codeOutput.textContent = svg;
        }

        // 颜色输入联动
        bgColor.addEventListener('input', function () { syncColorText(bgColor, bgText); render(); });
        bgText.addEventListener('input', function () { if (syncColorPicker(bgColor, bgText)) render(); });
        fgColor.addEventListener('input', function () { syncColorText(fgColor, fgText); render(); });
        fgText.addEventListener('input', function () { if (syncColorPicker(fgColor, fgText)) render(); });
        bg2Color.addEventListener('input', function () { syncColorText(bg2Color, bg2Text); render(); });
        bg2Text.addEventListener('input', function () { if (syncColorPicker(bg2Color, bg2Text)) render(); });

        gradientEl.addEventListener('change', function () {
            gradientRow.style.display = gradientEl.checked ? '' : 'none';
            render();
        });

        // 数值输入联动
        widthEl.addEventListener('input', render);
        heightEl.addEventListener('input', render);
        textEl.addEventListener('input', render);

        fontSizeEl.addEventListener('input', function () {
            fontValue.textContent = fontSizeEl.value + ' px';
            render();
        });
        cornerRadiusEl.addEventListener('input', function () {
            radiusValue.textContent = cornerRadiusEl.value + ' px';
            render();
        });

        // 预设
        presets.forEach(function (p) {
            var btn = Tools.el('button', { class: 'preset-btn', type: 'button', title: p.name });
            var bgVal = p.gradient ? 'linear-gradient(135deg, ' + p.bg + ', ' + p.bg2 + ')' : p.bg;
            var swatch = Tools.el('div', {
                class: 'preset-swatch',
                style: { background: bgVal, color: p.fg },
                text: p.name
            });
            btn.appendChild(swatch);
            btn.addEventListener('click', function () {
                bgColor.value = p.bg;
                bgText.value = p.bg;
                fgColor.value = p.fg;
                fgText.value = p.fg;
                bg2Color.value = p.bg2;
                bg2Text.value = p.bg2;
                gradientEl.checked = p.gradient;
                gradientRow.style.display = p.gradient ? '' : 'none';
                render();
            });
            presetGrid.appendChild(btn);
        });

        btnCopy.addEventListener('click', function () {
            var svg = codeOutput.textContent;
            if (!svg) { showMsg('warn', '暂无可复制内容'); return; }
            Tools.copyText(svg, btnCopy, '已复制 SVG 代码');
        });

        btnDownload.addEventListener('click', function () {
            var svg = codeOutput.textContent;
            if (!svg) { showMsg('warn', '暂无可下载内容'); return; }
            var w = parseInt(widthEl.value, 10) || 1;
            var h = parseInt(heightEl.value, 10) || 1;
            var filename = 'placeholder-' + w + 'x' + h + '.svg';
            Tools.download(filename, svg, 'image/svg+xml');
        });

        // 初始化
        fontValue.textContent = fontSizeEl.value + ' px';
        radiusValue.textContent = cornerRadiusEl.value + ' px';
        render();
    });
})();
