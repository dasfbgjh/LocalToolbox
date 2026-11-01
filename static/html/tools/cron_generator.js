'use strict';
document.addEventListener('DOMContentLoaded', function () {
    var formArea = Tools.$('form-area');
    var exprInput = Tools.$('expr-input');
    var exprDesc = Tools.$('expr-desc');
    var parseInput = Tools.$('parse-input');
    var execList = Tools.$('exec-list');

    var WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    var FIELDS = [
        { key: 'minute', label: '分钟 (0-59)', min: 0, max: 59, spec: 0 },
        { key: 'hour', label: '小时 (0-23)', min: 0, max: 23, spec: 0 },
        { key: 'day', label: '日 (1-31)', min: 1, max: 31, spec: 1 },
        { key: 'month', label: '月 (1-12)', min: 1, max: 12, spec: 1 },
        { key: 'week', label: '周 (0-6, 0=周日)', min: 0, max: 6, spec: 0 }
    ];

    var state = {
        minute: { type: 'specific', value: 0 },
        hour: { type: 'specific', value: 0 },
        day: { type: 'every' },
        month: { type: 'every' },
        week: { type: 'every' }
    };

    var fieldSections = {};

    function pad2(s) { return String(s).padStart(2, '0'); }
    function isNum(s) { return /^\d+$/.test(String(s)); }

    // ===== 表达式生成 =====
    function fieldToExpr(f) {
        var s = state[f.key];
        if (s.type === 'every') return '*';
        if (s.type === 'specific') return String(s.value != null ? s.value : f.spec);
        if (s.type === 'range') return (s.start != null ? s.start : f.min) + '-' + (s.end != null ? s.end : f.max);
        if (s.type === 'step') {
            var start = (s.start === '' || s.start == null) ? '*' : s.start;
            return start + '/' + (s.step || 1);
        }
        return '*';
    }

    function generateExpr() {
        return FIELDS.map(fieldToExpr).join(' ');
    }

    // ===== 可读描述 =====
    function weekName(f) {
        if (f.indexOf('/') !== -1) return '周(' + f + ')';
        f = weekToNumbers(f);
        return f.split(',').map(function (part) {
            if (part.indexOf('-') !== -1) {
                var rp = part.split('-');
                var a = parseInt(rp[0], 10), b = parseInt(rp[1], 10);
                return (WEEK_NAMES[a] || rp[0]) + '至' + (WEEK_NAMES[b] || rp[1]);
            }
            if (isNum(part)) { var n = parseInt(part, 10); return WEEK_NAMES[n] || part; }
            return part;
        }).join('、');
    }

    function describeCron(expr) {
        var parts = String(expr).trim().split(/\s+/);
        if (parts.length !== 5) return '表达式格式不正确(需要 5 个字段: 分 时 日 月 周)';
        var minute = parts[0], hour = parts[1], day = parts[2], month = parts[3], week = parts[4];
        var segs = [];

        // 时间
        if (minute === '*' && hour === '*') segs.push('每分钟');
        else if (minute.indexOf('*/') === 0 && hour === '*') segs.push('每 ' + minute.slice(2) + ' 分钟');
        else if (minute === '0' && hour === '*') segs.push('每小时整点');
        else if (minute === '0' && hour.indexOf('*/') === 0) segs.push('每 ' + hour.slice(2) + ' 小时整点');
        else if (minute === '*' && hour.indexOf('*/') === 0) segs.push('每 ' + hour.slice(2) + ' 小时');
        else if (isNum(minute) && isNum(hour)) segs.push('在 ' + pad2(hour) + ':' + pad2(minute));
        else if (isNum(minute) && hour === '*') segs.push('每小时的 ' + minute + ' 分');
        else if (minute === '*' && isNum(hour)) segs.push(pad2(hour) + ' 时的每分钟');
        else segs.push('分(' + minute + ') 时(' + hour + ')');

        // 日/周
        var dayIsStar = (day === '*' || day === '?');
        var weekIsStar = (week === '*' || week === '?');
        if (!dayIsStar && !weekIsStar) {
            segs.push('每月 ' + day + ' 日 或 ' + weekName(week));
        } else if (!dayIsStar) {
            if (day.indexOf('*/') === 0) segs.push('每 ' + day.slice(2) + ' 天');
            else segs.push('每月 ' + day + ' 日');
        } else if (!weekIsStar) {
            segs.push('每' + weekName(week));
        }

        // 月
        if (month !== '*') {
            if (month.indexOf('*/') === 0) segs.push('每 ' + month.slice(2) + ' 个月');
            else if (isNum(month)) segs.push(month + ' 月');
            else segs.push(month + ' 月');
        }

        return segs.join(', ') + ' 执行';
    }

    // ===== Cron 解析为值集合 =====
    function weekToNumbers(field) {
        if (!field) return field;
        var map = { 'SUN': '0', 'MON': '1', 'TUE': '2', 'WED': '3', 'THU': '4', 'FRI': '5', 'SAT': '6' };
        var result = String(field).toUpperCase();
        Object.keys(map).forEach(function (name) {
            result = result.replace(new RegExp(name, 'g'), map[name]);
        });
        result = result.replace(/\b7\b/g, '0');
        return result;
    }

    function parseField(field, min, max) {
        var set = new Set();
        var isStar = (field === '*' || field === '?');
        if (isStar) {
            for (var i = min; i <= max; i++) set.add(i);
            return { values: set, isStar: isStar };
        }
        String(field).split(',').forEach(function (part) {
            var step = 1, rangePart = part;
            if (part.indexOf('/') !== -1) {
                var sp = part.split('/');
                rangePart = sp[0];
                step = parseInt(sp[1], 10) || 1;
            }
            var start, end;
            if (rangePart === '*' || rangePart === '?') { start = min; end = max; }
            else if (rangePart.indexOf('-') !== -1) {
                var rp = rangePart.split('-');
                start = parseInt(rp[0], 10);
                end = parseInt(rp[1], 10);
            } else {
                start = parseInt(rangePart, 10);
                end = (part.indexOf('/') !== -1) ? max : start;
            }
            if (isNaN(start)) return;
            for (var j = start; j <= end; j += step) {
                if (j >= min && j <= max) set.add(j);
            }
        });
        return { values: set, isStar: isStar };
    }

    function formatDateTime(date) {
        return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
            ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds());
    }

    function getNextExecutions(expr, count) {
        var parts = String(expr).trim().split(/\s+/);
        if (parts.length !== 5) return [];
        var weekField = weekToNumbers(parts[4]);
        var minute = parseField(parts[0], 0, 59);
        var hour = parseField(parts[1], 0, 23);
        var day = parseField(parts[2], 1, 31);
        var month = parseField(parts[3], 1, 12);
        var week = parseField(weekField, 0, 6);

        var results = [];
        var date = new Date();
        date.setMilliseconds(0);
        date.setSeconds(0);
        date.setMinutes(date.getMinutes() + 1);

        var iter = 0;
        var maxIter = 200000;
        while (results.length < count && iter < maxIter) {
            iter++;
            var mon = date.getMonth() + 1;
            if (!month.values.has(mon)) {
                date.setDate(1);
                date.setMonth(date.getMonth() + 1);
                date.setHours(0, 0, 0, 0);
                continue;
            }
            var dom = date.getDate();
            var dow = date.getDay();
            var dayMatch;
            if (day.isStar && week.isStar) dayMatch = true;
            else if (day.isStar) dayMatch = week.values.has(dow);
            else if (week.isStar) dayMatch = day.values.has(dom);
            else dayMatch = day.values.has(dom) || week.values.has(dow);

            if (!dayMatch) {
                date.setDate(date.getDate() + 1);
                date.setHours(0, 0, 0, 0);
                continue;
            }
            var h = date.getHours();
            if (!hour.values.has(h)) {
                date.setHours(date.getHours() + 1, 0, 0, 0);
                continue;
            }
            var m = date.getMinutes();
            if (!minute.values.has(m)) {
                date.setMinutes(date.getMinutes() + 1, 0, 0);
                continue;
            }
            results.push(formatDateTime(date));
            date.setMinutes(date.getMinutes() + 1, 0, 0);
        }
        return results;
    }

    // ===== 表单构建 =====
    function makeValueControl(f, prop, value, placeholder) {
        var input;
        if (f.key === 'week' || f.key === 'month') {
            input = Tools.el('select', { class: 'tool-select', style: { width: 'auto', display: 'inline-block', marginRight: '0.25rem' } });
            for (var i = f.min; i <= f.max; i++) {
                var label = f.key === 'week' ? (i + ' ' + WEEK_NAMES[i]) : String(i);
                input.appendChild(Tools.el('option', { value: i, text: label }));
            }
            input.value = (value != null && value !== '') ? value : f.spec;
            input.addEventListener('change', function () {
                state[f.key][prop] = parseInt(input.value, 10);
                onFormChange();
            });
        } else {
            input = Tools.el('input', { class: 'tool-input', type: 'number', min: String(f.min), max: String(f.max), style: { width: '6rem', display: 'inline-block' } });
            if (value != null && value !== '') input.value = value;
            if (placeholder) input.placeholder = placeholder;
            input.addEventListener('input', function () {
                state[f.key][prop] = input.value === '' ? '' : parseInt(input.value, 10);
                onFormChange();
            });
        }
        return input;
    }

    function buildFieldSection(f) {
        var wrap = Tools.el('div', { style: { marginBottom: '1rem' } }, [
            Tools.el('div', { class: 'tool-label', text: f.label })
        ]);
        var typeSel = Tools.el('select', { class: 'tool-select', style: { marginBottom: '0.5rem' } });
        var types = [
            { v: 'every', t: '每' },
            { v: 'specific', t: '指定' },
            { v: 'range', t: '范围' },
            { v: 'step', t: '步进' }
        ];
        types.forEach(function (t) {
            typeSel.appendChild(Tools.el('option', { value: t.v, text: t.t }));
        });
        var inputsDiv = Tools.el('div', {});
        wrap.appendChild(typeSel);
        wrap.appendChild(inputsDiv);

        function refresh() {
            typeSel.value = state[f.key].type;
            inputsDiv.innerHTML = '';
            var s = state[f.key];
            if (s.type === 'every') {
                inputsDiv.appendChild(Tools.el('span', { class: 'tool-hint', text: '每个值都匹配 (*)' }));
            } else if (s.type === 'specific') {
                inputsDiv.appendChild(makeValueControl(f, 'value', s.value));
            } else if (s.type === 'range') {
                inputsDiv.appendChild(makeValueControl(f, 'start', s.start));
                inputsDiv.appendChild(Tools.el('span', { text: ' 至 ', style: { margin: '0 0.25rem' } }));
                inputsDiv.appendChild(makeValueControl(f, 'end', s.end));
            } else if (s.type === 'step') {
                inputsDiv.appendChild(Tools.el('span', { class: 'tool-hint', text: '从', style: { marginRight: '0.25rem' } }));
                inputsDiv.appendChild(makeValueControl(f, 'start', s.start, '*'));
                inputsDiv.appendChild(Tools.el('span', { class: 'tool-hint', text: '每隔', style: { margin: '0 0.25rem' } }));
                var stepInput = Tools.el('input', { class: 'tool-input', type: 'number', min: '1', value: s.step, style: { width: '5rem', display: 'inline-block' } });
                stepInput.addEventListener('input', function () {
                    state[f.key].step = parseInt(stepInput.value, 10) || 1;
                    onFormChange();
                });
                inputsDiv.appendChild(stepInput);
            }
        }

        typeSel.addEventListener('change', function () {
            var defaults = {
                every: { type: 'every' },
                specific: { type: 'specific', value: f.spec },
                range: { type: 'range', start: f.min, end: f.max },
                step: { type: 'step', start: '', step: 1 }
            };
            state[f.key] = Object.assign({}, defaults[typeSel.value]);
            refresh();
            onFormChange();
        });

        refresh();
        return { wrap: wrap, refresh: refresh };
    }

    FIELDS.forEach(function (f) {
        var sec = buildFieldSection(f);
        fieldSections[f.key] = sec;
        formArea.appendChild(sec.wrap);
    });

    function renderExecutions(expr) {
        var list = getNextExecutions(expr, 5);
        execList.innerHTML = '';
        if (list.length === 0) {
            execList.appendChild(Tools.el('li', {}, [
                Tools.el('span', { class: 'label', text: '提示' }),
                Tools.el('span', { class: 'value', text: '无法计算(表达式无效或过于稀疏)' })
            ]));
            return;
        }
        list.forEach(function (t, i) {
            execList.appendChild(Tools.el('li', {}, [
                Tools.el('span', { class: 'label', text: '第 ' + (i + 1) + ' 次' }),
                Tools.el('span', { class: 'value tool-monospace', text: t })
            ]));
        });
    }

    function onFormChange() {
        var expr = generateExpr();
        exprInput.value = expr;
        exprDesc.textContent = describeCron(expr);
        renderExecutions(expr);
    }

    // ===== 解析表达式到表单 =====
    function parseFieldToState(raw, f) {
        raw = String(raw).trim();
        if (raw === '*' || raw === '?') return { state: { type: 'every' }, note: '' };
        if (raw.indexOf('/') !== -1) {
            var sp = raw.split('/');
            var start = sp[0];
            var step = parseInt(sp[1], 10) || 1;
            var startVal = (start === '*' || start === '?') ? '' : parseInt(start, 10);
            if (isNaN(startVal) && start !== '*' && start !== '?') startVal = '';
            return { state: { type: 'step', start: startVal, step: step }, note: '' };
        }
        if (raw.indexOf(',') !== -1) {
            var first = raw.split(',')[0];
            var v = parseInt(first, 10);
            return { state: { type: 'specific', value: isNaN(v) ? first : v }, note: '列表取首个值 (' + raw + ')' };
        }
        if (raw.indexOf('-') !== -1) {
            var rp = raw.split('-');
            return { state: { type: 'range', start: parseInt(rp[0], 10), end: parseInt(rp[1], 10) }, note: '' };
        }
        var n = parseInt(raw, 10);
        return { state: { type: 'specific', value: isNaN(n) ? raw : n }, note: '' };
    }

    function parseExpression(expr) {
        var parts = String(expr).trim().split(/\s+/);
        if (parts.length !== 5) {
            Tools.showBanner('banner-box', 'error', '表达式需为 5 个字段: 分 时 日 月 周');
            return;
        }
        var notes = [];
        FIELDS.forEach(function (f, idx) {
            var raw = idx === 4 ? weekToNumbers(parts[idx]) : parts[idx];
            var r = parseFieldToState(raw, f);
            state[f.key] = r.state;
            if (r.note) notes.push(f.label + ': ' + r.note);
        });
        FIELDS.forEach(function (f) { fieldSections[f.key].refresh(); });
        onFormChange();
        if (notes.length) {
            Tools.showBanner('banner-box', 'warn', notes.join('; '));
        } else {
            Tools.showBanner('banner-box', 'success', '解析成功');
        }
    }

    Tools.$('parse-btn').addEventListener('click', function () {
        var v = parseInput.value.trim();
        if (!v) {
            Tools.showBanner('banner-box', 'warn', '请输入要解析的表达式');
            return;
        }
        parseExpression(v);
    });
    parseInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') Tools.$('parse-btn').click();
    });

    Tools.$('expr-copy').addEventListener('click', function () {
        if (!exprInput.value) {
            Tools.showBanner('banner-box', 'warn', '没有可复制的表达式');
            return;
        }
        Tools.copyText(exprInput.value, this, '已复制');
    });

    // 初始化
    onFormChange();
});
