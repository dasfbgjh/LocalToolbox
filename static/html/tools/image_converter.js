'use strict';
document.addEventListener('DOMContentLoaded', function () {
    var state = {
        file: null,
        dataUrl: null
    };

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function setInfoValue(key, value) {
        var el = Tools.$('info-list').querySelector('[data-key="' + key + '"]');
        if (el) el.textContent = value || '—';
    }

    function loadImageDims(dataUrl, cb) {
        var img = new Image();
        img.onload = function () { cb(img.naturalWidth, img.naturalHeight); };
        img.onerror = function () { cb(0, 0); };
        img.src = dataUrl;
    }

    function updateQualityVisibility() {
        var format = document.querySelector('input[name="format"]:checked').value;
        var qualitySection = Tools.$('quality-section');
        var icoSection = Tools.$('ico-section');
        if (qualitySection) {
            qualitySection.classList.toggle('visible', format === 'jpg');
        }
        if (icoSection) {
            icoSection.classList.toggle('visible', format === 'ico');
        }
    }

    function initFormatRadios() {
        var radios = document.querySelectorAll('input[name="format"]');
        radios.forEach(function (radio) {
            radio.addEventListener('change', updateQualityVisibility);
        });
        updateQualityVisibility();
    }

    function initQualitySlider() {
        var slider = Tools.$('quality-slider');
        var value = Tools.$('quality-value');
        if (slider && value) {
            slider.addEventListener('input', function () {
                value.textContent = slider.value + '%';
            });
        }
    }

    function handleFile(file) {
        if (!file) return;
        if (!file.type || file.type.indexOf('image/') !== 0) {
            Tools.showBanner('banner', 'error', '请选择图片文件');
            return;
        }
        if (file.size > 50 * 1024 * 1024) {
            Tools.showBanner('banner', 'error', '文件过大（限制 50MB）');
            return;
        }
        Tools.clearBanner('banner');
        state.file = file;
        Tools.readFile(file, 'dataUrl').then(function (dataUrl) {
            state.dataUrl = dataUrl;
            setInfoValue('name', file.name);
            setInfoValue('size', formatSize(file.size));
            setInfoValue('type', file.type);
            var empty = Tools.$('preview-empty');
            var wrap = Tools.$('preview-wrap');
            if (empty) empty.style.display = 'none';
            if (wrap) {
                wrap.innerHTML = '';
                wrap.appendChild(Tools.el('img', { src: dataUrl, alt: '预览' }));
                wrap.classList.add('visible');
            }
            loadImageDims(dataUrl, function (w, h) {
                setInfoValue('dim', w && h ? (w + ' × ' + h + ' px') : '—');
            });
            Tools.$('btn-convert').disabled = false;
        }).catch(function (err) {
            Tools.showBanner('banner', 'error', '读取文件失败: ' + (err && err.message ? err.message : '未知错误'));
        });
    }

    function clearAll() {
        state.file = null;
        state.dataUrl = null;
        Tools.$('file-input').value = '';
        var empty = Tools.$('preview-empty');
        var wrap = Tools.$('preview-wrap');
        if (empty) empty.style.display = '';
        if (wrap) {
            wrap.innerHTML = '';
            wrap.classList.remove('visible');
        }
        ['name', 'size', 'type', 'dim'].forEach(function (k) { setInfoValue(k, '—'); });
        Tools.$('btn-convert').disabled = true;
        Tools.clearBanner('banner');
    }

    function convertAndDownload() {
        if (!state.file) return;
        var format = document.querySelector('input[name="format"]:checked').value;
        var quality = parseInt(Tools.$('quality-slider').value, 10);

        Tools.showBanner('banner', 'info', '正在转换...');

        var formData = new FormData();
        formData.append('file', state.file);
        formData.append('format', format);
        if (format === 'jpg') {
            formData.append('quality', quality);
        }
        if (format === 'ico') {
            var checkedSizes = [];
            var checkboxes = document.querySelectorAll('#ico-sizes-grid input[type="checkbox"]:checked');
            checkboxes.forEach(function(cb) {
                checkedSizes.push(cb.value);
            });
            if (checkedSizes.length > 0) {
                formData.append('ico_sizes', checkedSizes.join(','));
            }
        }

        var ext = format === 'jpg' ? 'jpg' : format;
        var originalName = state.file.name;
        var dotPos = originalName.lastIndexOf('.');
        var baseName = dotPos > 0 ? originalName.substring(0, dotPos) : originalName;
        var downloadName = baseName + '.' + ext;

        Api.tools.imageConvert(formData, {
            responseType: 'blob',
            onLoad: function (xhr, blob) {
                Tools.clearBanner('banner');

                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = downloadName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                Tools.showBanner('banner', 'success', '转换成功，已开始下载');
            },
            onError: function (xhr, err) {
                Tools.clearBanner('banner');
                var msg = '转换失败';
                if (err && err.error) msg = err.error;
                Tools.showBanner('banner', 'error', msg);
            }
        });
    }

    function initDropZone() {
        var dropZone = Tools.$('drop-zone');
        var fileInput = Tools.$('file-input');

        fileInput.addEventListener('change', function () {
            if (fileInput.files.length > 0) {
                handleFile(fileInput.files[0]);
            }
        });

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
            if (e.dataTransfer.files.length > 0) {
                handleFile(e.dataTransfer.files[0]);
            }
        });
    }

    function init() {
        initDropZone();
        initFormatRadios();
        initQualitySlider();

        Tools.$('btn-convert').addEventListener('click', convertAndDownload);
        Tools.$('btn-clear').addEventListener('click', clearAll);
    }

    init();
});