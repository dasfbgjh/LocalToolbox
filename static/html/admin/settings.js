(function () {
    'use strict';
    var App = window.App;

    // 统一基于后端字段驱动：不再按 name 硬编码
    // 后端提供 type / unit / transform / options 等信息，前端只根据这些字段做通用处理

    function rawToDisplay(field, rawVal) {
        var transform = field.transform || '';
        if (transform === 'bytesToMB') {
            if (typeof rawVal === 'number') return Math.round(rawVal / (1024 * 1024));
            return rawVal;
        }
        return rawVal;
    }

    // 根据 name 从缓存的配置数组里取对应字段（不再根据 name 写死元数据）
    function getFieldByName(name) {
        var arr = window.__adminConfigCache__ || [];
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].name === name) return arr[i];
        }
        return null;
    }

    function resolveField(field) {
        var f = Object.assign({}, field);

        // 根据 type（string/number/boolean/file/directory/array/object/dataSize）推断浏览按钮
        if (f.type === 'file') f.browse = 'file';
        else if (f.type === 'directory') f.browse = 'dir';

        // 前端展示类型：有 options 就渲染成下拉，否则按 type
        if (f.options && Array.isArray(f.options) && f.options.length > 0) {
            f.displayType = 'select';
        } else if (f.type === 'dataSize') {
            // dataSize 在界面上还是用 number 输入，只是要做 bytes/MB 转换
            f.displayType = 'number';
        } else {
            f.displayType = f.type;
        }
        return f;
    }

    function renderRuntimeValue(field, val) {
        if (field.type === 'boolean') {
            return '<span class="ro-badge ' + (val ? 'ro-on' : 'ro-off') + '">' + (val ? '已启用' : '未启用') + '</span>';
        }
        if (field.type === 'array') {
            if (!val || !val.length) return '<span class="text-muted">（无）</span>';
            return '<div class="ro-list">' + val.map(function (v) { return '<div class="ro-list-item">' + App.escapeHtml(String(v)) + '</div>'; }).join('') + '</div>';
        }
        if (val === '' || val == null) return '<span class="text-muted">（空）</span>';
        var displayVal = rawToDisplay(field, val);
        var text = String(displayVal);
        if (field.unit) text = text + ' ' + field.unit;
        return '<span class="ro-text">' + App.escapeHtml(text) + '</span>';
    }

    function renderCheckbox(field) {
        var val = !!field.value;
        return (
            '<div class="checkbox-wrap">' +
            '<input type="checkbox" data-config="' + field.name + '" data-rawtype="boolean"' + (val ? ' checked' : '') + ' />' +
            '<span>' + (val ? '已启用' : '未启用') + '</span>' +
            '</div>'
        );
    }

    function renderSelect(field) {
        var html = '<select class="select" data-config="' + field.name + '" data-rawtype="number">';
        (field.options || []).forEach(function (opt) {
            html += '<option value="' + opt.value + '"' + (field.value == opt.value ? ' selected' : '') + '>' + opt.label + '</option>';
        });
        html += '</select>';
        return html;
    }

    function renderTextWithBrowse(field) {
        var displayVal = rawToDisplay(field, field.value);
        var html = '<div class="path-input-wrap">';
        html += '<input type="text" class="input" data-config="' + field.name + '" data-rawtype="string" value="' + App.escapeHtml(String(displayVal == null ? '' : displayVal)) + '" />';
        if (field.browse) {
            html += '<button class="btn btn-sm btn-outline browse-btn" data-browse="' + field.browse + '" data-target="' + field.name + '">浏览</button>';
        }
        html += '</div>';
        return html;
    }

    function renderNumber(field) {
        var displayVal = rawToDisplay(field, field.value);
        var transform = field.transform ? field.transform : '';
        var html = '<input type="number" class="input" data-config="' + field.name + '" data-rawtype="number" data-transform="' + transform + '" value="' + App.escapeHtml(String(displayVal)) + '" />';
        if (field.unit) html += '<div class="hint">单位：' + field.unit + '</div>';
        return html;
    }

    function renderEditableField(field) {
        var t = field.displayType;
        if (t === 'boolean') return renderCheckbox(field);
        if (t === 'select') return renderSelect(field);
        // string / file / directory 都走"文本框 + 可选浏览"
        if (t === 'string' || t === 'file' || t === 'directory') return renderTextWithBrowse(field);
        if (t === 'number') return renderNumber(field);
        // 兜底 array/object 显示只读提示
        return renderRuntimeValue(field, field.value);
    }

    function loadConfig() {
        var formEl = document.getElementById('config-form');
        formEl.innerHTML = '<p class="text-muted">加载中...</p>';
        Api.admin.getConfig().then(function (data) {
            if (!data.success) {
                formEl.innerHTML = '<p class="text-danger">' + (data.error || '加载失败') + '</p>';
                return;
            }
            var configArray = data.config || [];
            renderConfigForm(configArray);
        }).catch(function () {
            formEl.innerHTML = '<p class="text-danger">加载失败</p>';
        });
    }

    function renderConfigForm(configArray) {
        window.__adminConfigCache__ = configArray || [];
        var formEl = document.getElementById('config-form');
        formEl.dataset.loaded = '1';

        var allFields = configArray.map(function (item) { return resolveField(item); });

        var html = '';
        allFields.forEach(function (f) {
            if (f.onlyRead) {
                html +=
                    '<div class="config-field config-field-ro">' +
                    '<div class="label-col">' +
                    '<label>' + f.label + '</label>' +
                    (f.description ? ('<div class="desc">' + f.description + '</div>') : '') +
                    '</div>' +
                    '<div class="input-col">' + renderRuntimeValue(f, f.value) + '</div>' +
                    '</div>';
            } else {
                html +=
                    '<div class="config-field">' +
                    '<div class="label-col">' +
                    '<label>' + f.label + '</label>' +
                    (f.description ? ('<div class="desc">' + f.description + '</div>') : '') +
                    '</div>' +
                    '<div class="input-col">' + renderEditableField(f) + '</div>' +
                    '</div>';
            }
        });
        formEl.innerHTML = html;

        // checkbox 实时更新旁边的"已启用/未启用"
        formEl.querySelectorAll('input[type="checkbox"][data-config]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                var span = cb.nextElementSibling;
                if (span) span.textContent = cb.checked ? '已启用' : '未启用';
            });
        });

        // 浏览按钮
        formEl.querySelectorAll('.browse-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var browseMode = btn.getAttribute('data-browse');
                var targetKey = btn.getAttribute('data-target');
                var targetInput = formEl.querySelector('input[data-config="' + targetKey + '"]');
                var mode = browseMode === 'dir' ? 'dir' : (browseMode === 'file' ? 'file' : 'dir');
                if (typeof window.AdminCommon !== 'undefined') {
                    window.AdminCommon.showFsBrowser(function (p) {
                        if (targetInput) targetInput.value = p;
                    }, mode);
                }
            });
        });
    }

    function getConfig() {
        var formEl = document.getElementById('config-form');
        var body = [];
        formEl.querySelectorAll('[data-config]').forEach(function (el) {
            var key = el.getAttribute('data-config');
            var field = getFieldByName(key) || {};
            var transform = el.getAttribute('data-transform') || field.transform || '';
            var rawtype = el.getAttribute('data-rawtype') || 'string';

            var value;
            if (el.type === 'checkbox') {
                value = !!el.checked;
            } else if (el.tagName === 'SELECT' || rawtype === 'number' || el.type === 'number') {
                var num;
                if (el.tagName === 'SELECT') {
                    num = parseInt(el.value, 10);
                } else {
                    num = parseInt(el.value, 10);
                }
                if (isNaN(num)) num = 0;
                if (transform === 'bytesToMB') num = num * 1024 * 1024;
                value = num;
            } else {
                // string 类型：保留字符串原样
                value = String(el.value == null ? '' : el.value);
            }
            body.push({ name: key, value: value });
        });
        return body;
    }

    function saveConfig() {
        var btn = document.getElementById('save-config-btn');
        var originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '保存中...';
        Api.admin.updateConfig(getConfig()).then(function (data) {
            btn.disabled = false;
            btn.textContent = originalText;
            if (data.success) {
                alert('配置已保存，重启程序后生效');
            } else {
                alert(data.error || '保存失败');
            }
        }).catch(function () {
            btn.disabled = false;
            btn.textContent = originalText;
            alert('保存失败');
        });
    }

    function saveAndReboot() {
        var btn = document.getElementById('save-reboot-btn');
        var originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '保存并重启中...';

        Api.admin.reboot(getConfig()).then(function () {
            showRebootOverlay();
            pollUntilReady();
        }).catch(function () {
            showRebootOverlay();
            pollUntilReady();
        });
    }

    function showRebootOverlay() {
        document.getElementById('reboot-overlay').hidden = false;
    }

    function hideRebootOverlay() {
        document.getElementById('reboot-overlay').hidden = true;
        var btn = document.getElementById('save-reboot-btn');
        btn.disabled = false;
        btn.textContent = '保存并重启';
    }

    function pollUntilReady() {
        var interval = setInterval(function () {
            Api.admin.getConfig().then(function (data) {
                if (data.success) {
                    clearInterval(interval);
                    hideRebootOverlay();
                    loadConfig();
                }
            }).catch(function () {
            });
        }, 2000);
    }

    window.AdminSettings = {
        loadConfig: loadConfig,
        saveConfig: saveConfig,
        saveAndReboot: saveAndReboot
    };
})();