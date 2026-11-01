'use strict';
document.addEventListener('DOMContentLoaded', function () {
    var state = {
        mode: 'i2b',
        b2iDataUrl: null,
        b2iMime: '',
        b2iExt: 'png'
    };

    function setMode(mode) {
        state.mode = mode;
        Tools.$('tab-i2b').classList.toggle('active', mode === 'i2b');
        Tools.$('tab-b2i').classList.toggle('active', mode === 'b2i');
        Tools.$('panel-i2b').style.display = mode === 'i2b' ? '' : 'none';
        Tools.$('panel-b2i').style.display = mode === 'b2i' ? '' : 'none';
        Tools.clearBanner('banner');
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function setInfoValue(listId, key, value) {
        var el = Tools.$(listId).querySelector('[data-key="' + key + '"]');
        if (el) el.textContent = value || '—';
    }

    function loadImageDims(dataUrl, cb) {
        var img = new Image();
        img.onload = function () { cb(img.naturalWidth, img.naturalHeight); };
        img.onerror = function () { cb(0, 0); };
        img.src = dataUrl;
    }

    function mimeToExt(mime) {
        var map = {
            'image/jpeg': 'jpg', 'image/jpg': 'jpg',
            'image/png': 'png', 'image/gif': 'gif',
            'image/bmp': 'bmp', 'image/svg+xml': 'svg',
            'image/webp': 'webp', 'image/x-icon': 'ico'
        };
        return map[mime] || 'png';
    }

    function inferMimeType(b64) {
        var p = b64.substring(0, 4);
        if (p.indexOf('/9j/') === 0) return 'image/jpeg';
        if (p.indexOf('iVBO') === 0 || p.indexOf('IVBO') === 0) return 'image/png';
        if (p.indexOf('R0lG') === 0) return 'image/gif';
        if (p.indexOf('Qk0=') === 0) return 'image/bmp';
        if (p.indexOf('UklG') === 0) return 'image/webp';
        return 'image/png';
    }

    // ===== 图片转Base64 =====
    function handleFile(file) {
        if (!file) return;
        if (!file.type || file.type.indexOf('image/') !== 0) {
            Tools.showBanner('banner', 'error', '请选择图片文件');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            Tools.showBanner('banner', 'error', '文件过大（限制 10MB）');
            return;
        }
        Tools.clearBanner('banner');
        Tools.readFile(file, 'dataUrl').then(function (dataUrl) {
            setInfoValue('info-i2b', 'name', file.name);
            setInfoValue('info-i2b', 'size', formatSize(file.size));
            setInfoValue('info-i2b', 'type', file.type);
            Tools.$('output-i2b').value = dataUrl;
            var wrap = Tools.$('preview-i2b-wrap');
            wrap.innerHTML = '';
            wrap.appendChild(Tools.el('img', { src: dataUrl, alt: '预览' }));
            loadImageDims(dataUrl, function (w, h) {
                setInfoValue('info-i2b', 'dim', w && h ? (w + ' × ' + h + ' px') : '—');
            });
        }).catch(function (err) {
            Tools.showBanner('banner', 'error', '读取文件失败: ' + (err && err.message ? err.message : '未知错误'));
        });
    }

    function clearI2B() {
        Tools.$('output-i2b').value = '';
        Tools.$('file-input').value = '';
        var wrap = Tools.$('preview-i2b-wrap');
        wrap.innerHTML = '';
        wrap.appendChild(Tools.el('span', { class: 'preview-empty', text: '图片预览将在这里显示' }));
        ['name', 'size', 'type', 'dim'].forEach(function (k) { setInfoValue('info-i2b', k, '—'); });
        Tools.clearBanner('banner');
    }

    // ===== Base64转图片 =====
    function convertB2I() {
        var input = Tools.$('input-b2i').value.trim();
        var wrap = Tools.$('preview-b2i-wrap');
        var dlBtn = Tools.$('btn-download-b2i');
        Tools.clearBanner('banner');
        if (!input) {
            wrap.innerHTML = '';
            wrap.appendChild(Tools.el('span', { class: 'preview-empty', text: '图片预览将在这里显示' }));
            setInfoValue('info-b2i', 'type', '—');
            setInfoValue('info-b2i', 'dim', '—');
            dlBtn.disabled = true;
            state.b2iDataUrl = null;
            return;
        }
        var dataUrl, mime;
        if (input.indexOf('data:') === 0) {
            var m = input.match(/^data:([^;]+);base64,/);
            if (!m) {
                Tools.showBanner('banner', 'error', '无效的 data URL 格式');
                return;
            }
            mime = m[1];
            dataUrl = input;
        } else {
            mime = inferMimeType(input);
            dataUrl = 'data:' + mime + ';base64,' + input;
        }
        var img = new Image();
        img.onload = function () {
            wrap.innerHTML = '';
            wrap.appendChild(img);
            setInfoValue('info-b2i', 'type', mime);
            setInfoValue('info-b2i', 'dim', img.naturalWidth + ' × ' + img.naturalHeight + ' px');
            dlBtn.disabled = false;
            state.b2iDataUrl = dataUrl;
            state.b2iMime = mime;
            state.b2iExt = mimeToExt(mime);
        };
        img.onerror = function () {
            wrap.innerHTML = '';
            wrap.appendChild(Tools.el('span', { class: 'preview-empty', text: '无法加载图片' }));
            setInfoValue('info-b2i', 'type', '—');
            setInfoValue('info-b2i', 'dim', '—');
            dlBtn.disabled = true;
            state.b2iDataUrl = null;
            Tools.showBanner('banner', 'error', '无法解析为图片，请检查 Base64 数据');
        };
        img.alt = '预览';
        img.src = dataUrl;
    }

    function clearB2I() {
        Tools.$('input-b2i').value = '';
        convertB2I();
        Tools.clearBanner('banner');
    }

    function downloadB2I() {
        if (!state.b2iDataUrl) return;
        var a = Tools.el('a', { href: state.b2iDataUrl, download: 'image.' + state.b2iExt });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // ===== Events =====
    Tools.$('tab-i2b').addEventListener('click', function () { setMode('i2b'); });
    Tools.$('tab-b2i').addEventListener('click', function () { setMode('b2i'); });

    var dropZone = Tools.$('drop-zone');
    var fileInput = Tools.$('file-input');
    dropZone.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
        if (this.files && this.files.length) handleFile(this.files[0]);
    });
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault(); dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault(); dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    Tools.$('btn-copy-b64').addEventListener('click', function () {
        var out = Tools.$('output-i2b').value;
        if (!out) return;
        Tools.copyText(out, this, '已复制');
    });
    Tools.$('btn-copy-css').addEventListener('click', function () {
        var out = Tools.$('output-i2b').value;
        if (!out) return;
        var css = 'background-image: url(' + out + ');';
        Tools.copyText(css, this, '已复制');
    });
    Tools.$('btn-clear-i2b').addEventListener('click', clearI2B);

    Tools.$('btn-convert-b2i').addEventListener('click', convertB2I);
    Tools.$('btn-example-b2i').addEventListener('click', function () {
        Tools.$('input-b2i').value = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAOklEQVR4nO3PAQ0AAAjDMK5/U5jwHwcDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA8F8BOHFYAAAAAElFTkSuQmCC';
        convertB2I();
    });
    Tools.$('btn-clear-b2i').addEventListener('click', clearB2I);
    Tools.$('btn-download-b2i').addEventListener('click', downloadB2I);
});
