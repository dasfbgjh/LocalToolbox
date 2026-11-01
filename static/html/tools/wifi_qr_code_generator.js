/* ===== WiFi QR Code Generator ===== */
(function () {
    'use strict';

    // 转义 WiFi 配置字符串中的特殊字符
    function escapeWifiValue(str) {
        if (str == null) return '';
        return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,')
            .replace(/:/g, '\\:')
            .replace(/"/g, '\\"');
    }

    // 构建 WiFi 配置字符串
    function buildWifiString(ssid, password, encryption, hidden) {
        var parts = ['WIFI:'];
        parts.push('T:' + encryption);
        parts.push(';S:' + escapeWifiValue(ssid));
        if (encryption !== 'nopass') {
            parts.push(';P:' + escapeWifiValue(password));
        }
        parts.push(';H:' + (hidden ? 'true' : 'false'));
        parts.push(';;');
        return parts.join('');
    }

    document.addEventListener('DOMContentLoaded', function () {
        var ssidEl = Tools.$('ssid');
        var passwordEl = Tools.$('password');
        var encryptionEl = Tools.$('encryption');
        var hiddenEl = Tools.$('hidden');
        var qrSize = Tools.$('qr-size');
        var sizeValue = Tools.$('size-value');
        var qrMargin = Tools.$('qr-margin');
        var marginValue = Tools.$('margin-value');
        var fgColor = Tools.$('fg-color');
        var bgColor = Tools.$('bg-color');
        var btnGenerate = Tools.$('btn-generate');
        var btnCopy = Tools.$('btn-copy');
        var btnDownloadPng = Tools.$('btn-download-png');
        var btnDownloadSvg = Tools.$('btn-download-svg');
        var qrPreview = Tools.$('qr-preview');
        var wifiConfig = Tools.$('wifi-config');

        var currentMatrix = null;
        var currentText = '';
        var currentCanvas = null;
        var debounceTimer = null;

        function showMsg(type, text) { Tools.showBanner('banner', type, text); }
        function clearMsg() { Tools.clearBanner('banner'); }

        function isValidHex(c) { return /^#[0-9A-Fa-f]{6}$/.test(c); }

        function syncSize() { sizeValue.textContent = qrSize.value + ' px'; }
        function syncMargin() { marginValue.textContent = qrMargin.value; }

        function debouncedRender() {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(renderQR, 400);
        }

        function getWifiString() {
            var ssid = ssidEl.value.trim();
            var password = passwordEl.value;
            var encryption = encryptionEl.value;
            var hidden = hiddenEl.checked;
            return buildWifiString(ssid, password, encryption, hidden);
        }

        function updateConfigText() {
            var ssid = ssidEl.value.trim();
            var encryption = encryptionEl.value;
            if (!ssid) {
                wifiConfig.textContent = '请填写网络名称';
                wifiConfig.classList.add('empty');
                return;
            }
            if (encryption !== 'nopass' && !passwordEl.value) {
                wifiConfig.textContent = getWifiString();
                wifiConfig.classList.remove('empty');
                return;
            }
            wifiConfig.textContent = getWifiString();
            wifiConfig.classList.remove('empty');
        }

        function renderQR() {
            clearMsg();
            var ssid = ssidEl.value.trim();
            if (!ssid) {
                currentMatrix = null;
                currentText = '';
                qrPreview.innerHTML = '';
                qrPreview.appendChild(Tools.el('div', { class: 'placeholder', text: '请填写网络名称 (SSID)' }));
                btnDownloadPng.disabled = true;
                btnDownloadSvg.disabled = true;
                return;
            }

            var fg = fgColor.value.trim();
            var bg = bgColor.value.trim();
            if (!isValidHex(fg)) { showMsg('error', '前景色格式无效,请使用 #RRGGBB'); return; }
            if (!isValidHex(bg)) { showMsg('error', '背景色格式无效,请使用 #RRGGBB'); return; }
            if (fg.toLowerCase() === bg.toLowerCase()) {
                showMsg('warn', '前景色与背景色相同,二维码将无法识别');
            }

            var text = getWifiString();
            Api.tools.qrcode(text, 'matrix')
                .then(function (data) {
                    if (!data.success) {
                        throw new Error(data.error || '生成失败');
                    }
                    var matrix = data.matrix;
                    currentMatrix = matrix;
                    currentText = text;

                    var size = parseInt(qrSize.value, 10) || 256;
                    var margin = parseInt(qrMargin.value, 10) || 0;
                    var dim = matrix.length + margin * 2;
                    var pixelSize = Math.max(1, Math.floor(size / dim));
                    var realSize = pixelSize * dim;

                    var canvas = document.createElement('canvas');
                    canvas.width = realSize;
                    canvas.height = realSize;
                    var ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = false;
                    ctx.fillStyle = bg;
                    ctx.fillRect(0, 0, realSize, realSize);
                    ctx.fillStyle = fg;
                    for (var y = 0; y < matrix.length; y++) {
                        for (var x = 0; x < matrix[y].length; x++) {
                            if (matrix[y][x]) {
                                ctx.fillRect((x + margin) * pixelSize, (y + margin) * pixelSize, pixelSize, pixelSize);
                            }
                        }
                    }
                    qrPreview.innerHTML = '';
                    qrPreview.appendChild(canvas);
                    currentCanvas = canvas;

                    btnDownloadPng.disabled = false;
                    btnDownloadSvg.disabled = false;
                })
                .catch(function () {
                    currentMatrix = null;
                    qrPreview.innerHTML = '';
                    qrPreview.appendChild(Tools.el('div', { class: 'placeholder', text: '生成失败' }));
                    btnDownloadPng.disabled = true;
                    btnDownloadSvg.disabled = true;
                    showMsg('error', '生成二维码失败,请检查输入或缩短内容后重试');
                });
        }

        // 输入事件绑定
        ssidEl.addEventListener('input', function () { updateConfigText(); debouncedRender(); });
        passwordEl.addEventListener('input', function () { updateConfigText(); debouncedRender(); });
        encryptionEl.addEventListener('change', function () {
            var isNopass = encryptionEl.value === 'nopass';
            passwordEl.disabled = isNopass;
            if (isNopass) passwordEl.value = '';
            updateConfigText();
            debouncedRender();
        });
        hiddenEl.addEventListener('change', function () { updateConfigText(); debouncedRender(); });

        qrSize.addEventListener('input', function () { syncSize(); debouncedRender(); });
        qrMargin.addEventListener('input', function () { syncMargin(); debouncedRender(); });
        fgColor.addEventListener('input', debouncedRender);
        bgColor.addEventListener('input', debouncedRender);
        btnGenerate.addEventListener('click', renderQR);

        btnCopy.addEventListener('click', function () {
            var text = getWifiString();
            if (!ssidEl.value.trim()) {
                showMsg('warn', '请先填写网络名称');
                return;
            }
            Tools.copyText(text, btnCopy, '已复制 WiFi 配置');
        });

        btnDownloadPng.addEventListener('click', function () {
            if (!currentCanvas) return;
            currentCanvas.toBlob(function (blob) {
                if (!blob) { showMsg('error', 'PNG 导出失败'); return; }
                Tools.download('wifi-qrcode.png', blob, 'image/png');
            }, 'image/png');
        });

        btnDownloadSvg.addEventListener('click', function () {
            if (!currentText || !currentMatrix) return;
            var fg = fgColor.value.trim();
            var bg = bgColor.value.trim();
            var margin = parseInt(qrMargin.value, 10) || 0;
            var matrix = currentMatrix;
            var size = matrix.length;
            var dim = size + margin * 2;
            var scale = 10;
            var realDim = dim * scale;
            var svg = '<?xml version="1.0" encoding="UTF-8"?>';
            svg += '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="' + realDim + '" height="' + realDim + '" viewBox="0 0 ' + realDim + ' ' + realDim + '" shape-rendering="crispEdges">';
            svg += '<rect width="' + realDim + '" height="' + realDim + '" fill="' + bg + '"/>';
            svg += '<path fill="' + fg + '" d="';
            for (var y = 0; y < size; y++) {
                for (var x = 0; x < size; x++) {
                    if (matrix[y][x]) {
                        var px = (x + margin) * scale;
                        var py = (y + margin) * scale;
                        svg += 'M' + px + ',' + py + 'h' + scale + 'v' + scale + 'h-' + scale + 'z';
                    }
                }
            }
            svg += '"/></svg>';
            Tools.download('wifi-qrcode.svg', svg, 'image/svg+xml');
        });

        // 初始化
        syncSize();
        syncMargin();
        updateConfigText();
        renderQR();
    });
})();
