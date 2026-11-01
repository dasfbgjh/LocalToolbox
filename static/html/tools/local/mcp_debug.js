(function () {
    'use strict';

    var App = window.App || {};
    App.escapeHtml = App.escapeHtml || function (s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    };
    var Api = window.Api;

    var $ = function (id) { return document.getElementById(id); };

    // ===== 全局状态 =====
    var state = {
        endpoint: '',
        transport: 'auto',
        timeout: 30,
        skipHandshake: false,
        protoVer: '2025-03-26',
        clientName: 'MCP-Debug-Tool-WebUI',
        clientVer: '1.0',
        tools: [],
        resources: [],
        prompts: [],
        selectedTool: null,
        selectedResource: null,
        selectedPrompt: null,
        activeTab: 'tools',
        busy: false
    };

    // ===== UI 引用 =====
    var f = {
        endpoint: $('f-endpoint'),
        transport: $('f-transport'),
        timeout: $('f-timeout'),
        command: $('f-command'),
        env: $('f-env'),
        skip: $('f-skip-handshake'),
        proto: $('f-proto'),
        clientName: $('f-client-name'),
        clientVer: $('f-client-version'),
        toolFilter: $('f-tool-filter'),
        rawMethod: $('f-raw-method'),
        rawParams: $('f-raw-params'),
        rawNotif: $('f-raw-notification')
    };
    var el = {
        connStatus: $('conn-status'),
        cntTools: $('cnt-tools'),
        cntResources: $('cnt-resources'),
        cntPrompts: $('cnt-prompts'),
        toolList: $('tool-list'),
        resourceList: $('resource-list'),
        promptList: $('prompt-list'),
        actionPanel: $('action-panel'),
        actionForm: $('action-form'),
        btnCloseForm: $('btn-close-form'),
        btnClear: $('btn-clear'),
        notif: $('notifications'),
        empty: $('empty-state'),
        steps: $('steps'),
        overview: $('overview'),
        ovAction: $('ov-action'),
        ovEndpoint: $('ov-endpoint'),
        ovSteps: $('ov-steps'),
        ovTransport: $('ov-transport'),
        summary: $('summary-head'),
        sumOk: $('sum-ok'),
        sumElapsed: $('sum-elapsed')
    };

    // ===== 工具函数 =====
    function isLocalhost() {
        var h = location.hostname;
        return h === '127.0.0.1' || h === 'localhost' || h === '::1';
    }
    function prettyJson(v) {
        try {
            if (typeof v === 'string') {
                try { return JSON.stringify(JSON.parse(v), null, 2); }
                catch (e) { return v; }
            }
            return JSON.stringify(v, null, 2);
        } catch (e) { return String(v); }
    }
    function compactJson(v) {
        try {
            if (typeof v === 'string') {
                try { return JSON.stringify(JSON.parse(v)); }
                catch (e) { return v; }
            }
            return JSON.stringify(v);
        } catch (e) { return String(v); }
    }
    function copyText(text, onDone) {
        if (text == null) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () { if (onDone) onDone(); })
                    .catch(function () { fallback(text); });
            } else { fallback(text); }
        } catch (e) { fallback(text); }
        function fallback(t) {
            try {
                var ta = document.createElement('textarea');
                ta.value = t; ta.style.position = 'fixed';
                ta.style.left = '-9999px'; document.body.appendChild(ta);
                ta.select(); document.execCommand('copy');
                document.body.removeChild(ta);
                if (onDone) onDone();
            } catch (e2) { /* ignore */ }
        }
    }
    function showBanner(type, msg) {
        if (!el.notif) return;
        var cls = 'info';
        if (type === 'error') cls = 'error';
        else if (type === 'warn') cls = 'warn';
        else if (type === 'success') cls = 'success';
        el.notif.innerHTML = '<div class="tool-banner ' + cls + '">' + App.escapeHtml(msg) + '</div>';
        el.notif.hidden = false;
        if (type === 'success') setTimeout(clearBanner, 3500);
    }
    function clearBanner() {
        if (el.notif) { el.notif.innerHTML = ''; el.notif.hidden = true; }
    }
    function setConnStatus(text, kind) {
        el.connStatus.textContent = text || '';
        el.connStatus.className = 'md-conn-status' + (kind ? ' ' + kind : '');
    }

    // ===== 传输模式切换 =====
    function isStdioMode() {
        return (f.transport && f.transport.value) === 'stdio';
    }
    function updateTransportUI() {
        var stdio = isStdioMode();
        var rowEndpoint = $('row-endpoint');
        var rowCommand = $('row-command');
        var rowEnv = $('row-env');
        if (rowEndpoint) rowEndpoint.style.display = stdio ? 'none' : '';
        if (rowCommand) rowCommand.style.display = stdio ? '' : 'none';
        if (rowEnv) rowEnv.style.display = stdio ? '' : 'none';
    }

    // ===== 采集连接参数 =====
    function readConnArgs() {
        state.transport = (f.transport && f.transport.value) || 'auto';
        state.timeout = parseInt(f.timeout.value || '30', 10);
        if (isNaN(state.timeout) || state.timeout < 1) state.timeout = 30;
        if (state.timeout > 600) state.timeout = 600;
        state.skipHandshake = !!f.skip.checked;
        state.protoVer = (f.proto.value || '').trim() || '2025-03-26';
        state.clientName = (f.clientName.value || '').trim() || 'MCP-Debug-Tool-WebUI';
        state.clientVer = (f.clientVer.value || '').trim() || '1.0';
        if (isStdioMode()) {
            state.command = (f.command.value || '').trim();
            state.envStr = (f.env.value || '').trim();
            state.endpoint = '';
        } else {
            state.endpoint = (f.endpoint.value || '').trim();
            state.command = '';
            state.envStr = '';
        }
    }
    function baseArgs(action) {
        readConnArgs();
        var args = {
            action: action,
            timeout_seconds: state.timeout,
            skip_handshake: state.skipHandshake,
            protocol_version: state.protoVer,
            client_name: state.clientName,
            client_version: state.clientVer,
            transport: state.transport
        };
        if (isStdioMode()) {
            args.command = state.command;
            if (state.envStr) args.env = state.envStr;
        } else {
            args.endpoint = state.endpoint;
        }
        return args;
    }

    // ===== 调用后端 MCP 调试代理（统一走 Api.localTools.mcpDebug）=====
    function callProxy(args) {
        var t0 = Date.now();
        return Api.localTools.mcpDebug(args).then(function (report) {
            report = report || {};
            report.__elapsedMs = Date.now() - t0;
            return report;
        });
    }

    // ===== 结果渲染 =====
    function renderResult(report) {
        el.empty.hidden = true;
        el.summary.hidden = false;
        el.overview.hidden = false;
        el.btnClear.hidden = false;
        el.steps.style.display = 'block';
        clearBanner();

        var ok = report.ok === true;
        el.sumOk.className = 'ui-badge ' + (ok ? 'ok' : 'err');
        el.sumOk.textContent = ok ? '全部成功' : '存在失败';
        el.sumElapsed.textContent = '总计 ' + (report.__elapsedMs != null ? report.__elapsedMs : '?') + ' ms';

        el.ovAction.textContent = String(report.action || '–');
        el.ovEndpoint.textContent = String(report.target_endpoint || '–');
        el.ovEndpoint.title = el.ovEndpoint.textContent;
        el.ovTransport.textContent = String(report.transport_mode || '–');
        var steps = Array.isArray(report.steps) ? report.steps : [];
        el.ovSteps.textContent = steps.length;

        el.steps.innerHTML = '';

        if (report.error || report.warn || report.fatal_exception) {
            var banner = document.createElement('div');
            var isFatal = !!report.fatal_exception;
            var isError = !!report.error;
            banner.className = 'tool-banner ' + ((isFatal || isError) ? 'error' : 'warn');
            banner.style.margin = '0 0.75rem';
            if (isFatal) banner.innerHTML = '<strong>致命异常：</strong>' + App.escapeHtml(report.fatal_exception);
            else if (isError) banner.innerHTML = '<strong>参数错误：</strong>' + App.escapeHtml(report.error);
            else banner.innerHTML = '<strong>Warn：</strong>' + App.escapeHtml(report.warn);
            el.steps.appendChild(banner);
        }
        if (report.protocol_warning) {
            var pv = document.createElement('div');
            pv.className = 'tool-banner warn';
            pv.style.margin = '0 0.75rem';
            pv.innerHTML = '<strong>协议版本提示：</strong>' + App.escapeHtml(report.protocol_warning);
            el.steps.appendChild(pv);
        }

        if (!steps.length) {
            var es = document.createElement('div');
            es.className = 'admin-empty';
            es.style.padding = '1.5rem';
            es.innerHTML = '<div class="icon">—</div><p>本次调用未产生步骤。</p>';
            el.steps.appendChild(es);
            return;
        }
        steps.forEach(function (step, idx) {
            el.steps.appendChild(renderStepCard(step, idx));
        });
    }

    function renderStepCard(step, idx) {
        var ok = step.ok === true;
        var card = document.createElement('div');
        card.className = 'md-step';
        card.dataset.ok = ok ? 'true' : 'false';
        card.dataset.open = 'false';

        var head = document.createElement('div');
        head.className = 'md-step-head';
        var arrow = document.createElement('span');
        arrow.className = 'md-step-arrow';
        arrow.textContent = '▸';
        head.appendChild(arrow);
        var name = document.createElement('span');
        name.className = 'md-step-name';
        name.textContent = (idx + 1) + '. ' + (step.step || 'request');
        head.appendChild(name);
        var chips = document.createElement('span');
        chips.className = 'md-step-chips';
        var stBadge = document.createElement('span');
        stBadge.className = 'ui-badge ' + (ok ? 'ok' : 'err');
        stBadge.textContent = ok ? 'OK' : 'FAIL';
        chips.appendChild(stBadge);
        if (typeof step.http_status === 'number') {
            var c1 = document.createElement('span');
            var httpOk = step.http_status >= 200 && step.http_status < 300;
            c1.className = 'md-step-chip ' + (httpOk ? 'http-ok' : 'http-err');
            c1.textContent = 'HTTP ' + step.http_status;
            chips.appendChild(c1);
        }
        if (typeof step.elapsed_ms === 'number') {
            var c2 = document.createElement('span');
            c2.className = 'md-step-chip';
            c2.textContent = step.elapsed_ms + ' ms';
            chips.appendChild(c2);
        }
        head.appendChild(chips);
        head.addEventListener('click', function () {
            card.dataset.open = card.dataset.open === 'true' ? 'false' : 'true';
        });

        var body = document.createElement('div');
        body.className = 'md-step-body';
        if (step.error) {
            var errSec = mkSection('错误信息', String(step.error), true);
            body.appendChild(errSec.root);
        }
        if (step.request != null) body.appendChild(mkSection('Request', step.request).root);
        if (step.response != null) body.appendChild(mkSection('Response', step.response).root);

        card.appendChild(head);
        card.appendChild(body);
        return card;
    }

    function mkSection(title, jsonValue, isText) {
        var root = document.createElement('div');
        root.className = 'md-step-sec';
        var head = document.createElement('div');
        head.className = 'md-step-sec-title';
        var label = document.createElement('span');
        label.textContent = title;
        head.appendChild(label);
        var actions = document.createElement('div');
        actions.className = 'md-step-sec-actions';
        head.appendChild(actions);
        var secBody = document.createElement('div');
        root.appendChild(head);
        root.appendChild(secBody);

        var pre = document.createElement('pre');
        pre.className = isText ? 'md-pre err' : 'md-pre';
        var curView = 'pretty';
        function apply() {
            if (isText) {
                pre.textContent = jsonValue;
            } else {
                pre.textContent = curView === 'pretty' ? prettyJson(jsonValue) : compactJson(jsonValue);
            }
        }
        apply();
        secBody.appendChild(pre);

        if (isText) return { root: root, secBody: secBody };

        var btnToggle = document.createElement('button');
        btnToggle.className = 'md-mini-btn';
        btnToggle.textContent = '压缩';
        btnToggle.addEventListener('click', function () {
            curView = (curView === 'pretty') ? 'compact' : 'pretty';
            btnToggle.textContent = (curView === 'pretty') ? '压缩' : '格式化';
            apply();
        });
        actions.appendChild(btnToggle);

        var btnCopy = document.createElement('button');
        btnCopy.className = 'md-mini-btn';
        btnCopy.textContent = '复制';
        btnCopy.addEventListener('click', function () {
            copyText(curView === 'pretty' ? prettyJson(jsonValue) : compactJson(jsonValue), function () {
                btnCopy.textContent = '✓ 已复制';
                setTimeout(function () { btnCopy.textContent = '复制'; }, 1200);
            });
        });
        actions.appendChild(btnCopy);
        return { root: root, secBody: secBody, pre: pre };
    }

    // ===== 标签切换 =====
    function switchTab(tab) {
        state.activeTab = tab;
        var tabs = document.querySelectorAll('.md-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].dataset.tab === tab);
        }
        var panes = document.querySelectorAll('.md-tab-pane');
        for (var j = 0; j < panes.length; j++) {
            panes[j].classList.toggle('active', panes[j].dataset.tab === tab);
        }
        // 切到 raw 时隐藏上下文表单；其它标签保留已选表单
        if (tab === 'raw') hideActionForm();
    }
    document.querySelectorAll('.md-tab').forEach(function (btn) {
        btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    });

    // ===== 连接并加载 =====
    function connectAndLoad() {
        readConnArgs();
        if (isStdioMode()) {
            if (!state.command) { showBanner('error', '请填写启动命令'); return; }
        } else {
            if (!state.endpoint) { showBanner('error', '请填写目标端点 endpoint'); return; }
        }
        if (!isLocalhost()) { showBanner('error', '本工具仅限本机浏览器访问'); return; }
        setBusy(true);
        setConnStatus('加载中…', 'loading');
        clearBanner();
        // 并行拉取三项列表
        var pTools = callProxy(baseArgs('tools_list'));
        var pRes = callProxy(baseArgs('resources_list'));
        var pPrompts = callProxy(baseArgs('prompts_list'));
        Promise.all([pTools, pRes, pPrompts]).then(function (results) {
            var t = results[0], r = results[1], p = results[2];
            if (t && Array.isArray(t.tools)) { state.tools = t.tools; renderToolList(); }
            if (r && Array.isArray(r.resources)) { state.resources = r.resources; renderResourceList(); }
            if (p && Array.isArray(p.prompts)) { state.prompts = p.prompts; renderPromptList(); }
            // 展示工具列表的 report 作为主结果
            renderResult(t);
            var fails = [];
            if (t && !t.ok) fails.push('工具');
            if (r && !r.ok) fails.push('资源');
            if (p && !p.ok) fails.push('提示词');
            var nT = state.tools.length, nR = state.resources.length, nP = state.prompts.length;
            if (fails.length) {
                setConnStatus('部分失败', 'warn');
                showBanner('warn', '已加载 工具 ' + nT + ' / 资源 ' + nR + ' / 提示词 ' + nP +
                    '；' + fails.join('、') + ' 拉取失败，详见结果。');
            } else {
                setConnStatus('已连接 · 工具 ' + nT + ' / 资源 ' + nR + ' / 提示词 ' + nP, 'ok');
                showBanner('success', '连接成功：工具 ' + nT + ' / 资源 ' + nR + ' / 提示词 ' + nP + '。点击列表项即可操作。');
            }
        }).catch(function (err) {
            setConnStatus('连接失败', 'err');
            showBanner('error', '连接失败：' + (err && err.message ? err.message : err));
        }).finally(function () { setBusy(false); });
    }

    function doPing() {
        readConnArgs();
        if (isStdioMode()) {
            if (!state.command) { showBanner('error', '请填写启动命令'); return; }
        } else {
            if (!state.endpoint) { showBanner('error', '请填写目标端点'); return; }
        }
        runAction(baseArgs('ping'), 'ping');
    }

    // ===== 通用动作执行 =====
    function runAction(args, label) {
        if (!isLocalhost()) { showBanner('error', '本工具仅限本机访问'); return; }
        setBusy(true);
        clearBanner();
        callProxy(args).then(function (report) {
            renderResult(report);
            if (report.error) showBanner('error', '参数错误：' + report.error);
            else if (report.ok) showBanner('success', label + ' 完成，共 ' + (report.steps ? report.steps.length : 0) + ' 步');
            else showBanner('warn', label + ' 部分步骤失败，请查看详情。');
        }).catch(function (err) {
            showBanner('error', '请求失败：' + (err && err.message ? err.message : err));
        }).finally(function () { setBusy(false); });
    }
    function setBusy(b) {
        state.busy = b;
        var btns = ['btn-connect', 'btn-ping', 'btn-refresh-tools', 'btn-refresh-resources',
            'btn-refresh-prompts', 'btn-raw-send'];
        btns.forEach(function (id) {
            var bEl = $(id);
            if (bEl) bEl.disabled = b;
        });
    }

    // ===== 工具列表 =====
    function renderToolList() {
        el.cntTools.textContent = state.tools.length;
        var filter = (f.toolFilter.value || '').toLowerCase().trim();
        el.toolList.innerHTML = '';
        var list = state.tools.filter(function (t) {
            if (!filter) return true;
            return (t.name || '').toLowerCase().indexOf(filter) >= 0 ||
                (t.description || '').toLowerCase().indexOf(filter) >= 0;
        });
        if (!list.length) {
            el.toolList.innerHTML = '<div class="md-item-empty">' +
                (state.tools.length ? '无匹配工具' : '尚未加载工具，点击「刷新工具」') + '</div>';
            return;
        }
        list.forEach(function (tool) {
            el.toolList.appendChild(mkToolCard(tool));
        });
    }
    function mkToolCard(tool) {
        var card = document.createElement('div');
        card.className = 'md-item-card';
        if (state.selectedTool && state.selectedTool.name === tool.name) card.classList.add('selected');
        var reqCount = 0, propCount = 0;
        if (tool.inputSchema && tool.inputSchema.properties) {
            propCount = Object.keys(tool.inputSchema.properties).length;
            reqCount = Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required.length : 0;
        }
        card.innerHTML =
            '<div class="md-item-name">' + App.escapeHtml(tool.name || '') + '</div>' +
            '<div class="md-item-desc">' + App.escapeHtml(tool.description || '（无描述）') + '</div>' +
            '<div class="md-item-meta">' +
            (propCount ? '<span class="md-chip">' + propCount + ' 个参数</span>' : '<span class="md-chip">无参数</span>') +
            (reqCount ? '<span class="md-chip warn">' + reqCount + ' 必填</span>' : '') +
            '</div>';
        card.addEventListener('click', function () {
            state.selectedTool = tool;
            state.selectedResource = null;
            state.selectedPrompt = null;
            renderToolList();
            renderToolForm(tool);
        });
        return card;
    }
    f.toolFilter.addEventListener('input', renderToolList);

    // ===== 工具参数表单（根据 inputSchema 自动生成）=====
    function renderToolForm(tool) {
        var schema = tool.inputSchema || {};
        var props = schema.properties || {};
        var required = Array.isArray(schema.required) ? schema.required : [];
        var keys = Object.keys(props);

        var html = '<div class="md-af-head">' +
            '<span class="md-af-tag">工具</span>' +
            '<strong class="md-af-title">' + App.escapeHtml(tool.name || '') + '</strong>' +
            '</div>';
        if (tool.description) {
            html += '<div class="md-af-desc">' + App.escapeHtml(tool.description) + '</div>';
        }
        if (!keys.length) {
            html += '<div class="ui-hint">该工具无需参数，直接点击调用。</div>';
        } else {
            html += '<div class="md-af-grid">';
            keys.forEach(function (key) {
                var p = props[key] || {};
                var isReq = required.indexOf(key) >= 0;
                html += renderSchemaField(key, p, isReq, 'tool');
            });
            html += '</div>';
        }
        html += '<div class="md-af-actions">' +
            '<button class="btn btn-primary btn-sm" id="btn-call-tool">▶ 调用工具</button>' +
            '<label class="ui-toggle" style="margin-left:0.5rem;">' +
            '<input type="checkbox" id="af-skip-handshake"' + (state.skipHandshake ? ' checked' : '') + '>' +
            '<span>跳过握手</span>' +
            '</label>' +
            '</div>';

        el.actionForm.innerHTML = html;
        el.actionPanel.hidden = false;
        $('btn-call-tool').addEventListener('click', function () {
            var args = baseArgs('call_tool');
            args.tool_name = tool.name;
            var argObj = collectFormValues(keys, 'tool');
            if (argObj === null) return; // 校验失败
            if (Object.keys(argObj).length) args.tool_args = argObj;
            args.skip_handshake = !!$('af-skip-handshake').checked;
            runAction(args, '调用工具 ' + tool.name);
        });
    }

    // 根据 JSON Schema 渲染单个字段
    function renderSchemaField(key, prop, isReq, prefix) {
        var type = prop.type || 'string';
        var desc = prop.description || '';
        var id = 'af-' + prefix + '-' + key;
        var label = App.escapeHtml(key) + (isReq ? ' <span class="md-req">*</span>' : '');
        var typeHint = type;
        var h = '<div class="md-field">';
        h += '<label class="md-field-label" for="' + id + '">' + label + '</label>';

        // enum 下拉
        if (Array.isArray(prop.enum) && prop.enum.length) {
            h += '<select class="ui-form-input md-field-input" id="' + id + '" data-key="' + App.escapeHtml(key) + '" data-type="enum"' + (isReq ? ' required' : '') + '>';
            h += '<option value="">' + (isReq ? '请选择…' : '（不传）') + '</option>';
            prop.enum.forEach(function (v) {
                h += '<option value="' + App.escapeHtml(String(v)) + '">' + App.escapeHtml(String(v)) + '</option>';
            });
            h += '</select>';
        } else if (type === 'boolean') {
            h += '<label class="ui-toggle"><input type="checkbox" id="' + id + '" data-key="' + App.escapeHtml(key) + '" data-type="boolean"><span>' + (isReq ? '勾选=true，不勾选=false（必填）' : '勾选=true，不勾选=false') + '</span></label>';
        } else if (type === 'number' || type === 'integer') {
            var step = type === 'integer' ? '1' : 'any';
            h += '<input type="number" class="ui-form-input md-field-input" id="' + id + '" data-key="' + App.escapeHtml(key) + '" data-type="number" step="' + step + '" placeholder="' + typeHint + (isReq ? '（必填）' : '（不传）') + '"' + (isReq ? ' required' : '') + '>';
        } else if (type === 'array' || type === 'object') {
            h += '<textarea class="ui-form-input md-field-input md-jsonarea-sm" id="' + id + '" data-key="' + App.escapeHtml(key) + '" data-type="' + type + '" placeholder="' + typeHint + ' JSON' + (isReq ? '（必填）' : '（不传）') + '"' + (isReq ? ' required' : '') + '></textarea>';
        } else {
            // string / 其它
            h += '<input type="text" class="ui-form-input md-field-input" id="' + id + '" data-key="' + App.escapeHtml(key) + '" data-type="string" placeholder="' + typeHint + (isReq ? '（必填）' : '（不传）') + '"' + (isReq ? ' required' : '') + '>';
        }
        if (desc) h += '<div class="md-field-hint">' + App.escapeHtml(desc) + '</div>';
        h += '</div>';
        return h;
    }

    // 收集表单值
    function collectFormValues(keys, prefix) {
        var obj = {};
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var input = $('af-' + prefix + '-' + key);
            if (!input) continue;
            var dtype = input.dataset.type;
            var raw;
            if (dtype === 'boolean') {
                obj[key] = !!input.checked;
                continue;
            }
            raw = (input.value != null ? input.value : '').trim();
            if (raw === '') {
                if (input.hasAttribute('required')) {
                    showBanner('error', '必填参数「' + key + '」不能为空');
                    input.focus();
                    return null;
                }
                continue;
            }
            if (dtype === 'number') {
                var n = Number(raw);
                if (isNaN(n)) {
                    showBanner('error', '参数「' + key + '」不是合法数字');
                    input.focus();
                    return null;
                }
                obj[key] = n;
            } else if (dtype === 'enum') {
                obj[key] = raw;
            } else if (dtype === 'array') {
                try {
                    var arr = JSON.parse(raw);
                    if (!Array.isArray(arr)) {
                        throw new Error('not array');
                    }
                    obj[key] = arr;
                } catch (e) {
                    showBanner('error', '参数「' + key + '」需为 JSON 数组'); input.focus(); return null;
                }
            } else if (dtype === 'object') {
                try {
                    var o = JSON.parse(raw);
                    if (typeof o !== 'object' || o === null || Array.isArray(o)) {
                        throw new Error('not object');
                    }
                    obj[key] = o;
                } catch (e) {
                    showBanner('error', '参数「' + key + '」需为 JSON 对象'); input.focus(); return null;
                }
            } else {
                try {
                    obj[key] = JSON.parse(raw);
                } catch (e) {
                    obj[key] = raw;
                }
            }
        }
        return obj;
    }

    // ===== 资源列表 =====
    function renderResourceList() {
        el.cntResources.textContent = state.resources.length;
        el.resourceList.innerHTML = '';
        if (!state.resources.length) {
            el.resourceList.innerHTML = '<div class="md-item-empty">尚未加载资源，点击「刷新资源」</div>';
            return;
        }
        state.resources.forEach(function (res) {
            var card = document.createElement('div');
            card.className = 'md-item-card';
            if (state.selectedResource && state.selectedResource.uri === res.uri) card.classList.add('selected');
            card.innerHTML =
                '<div class="md-item-name md-mono">' + App.escapeHtml(res.uri || '') + '</div>' +
                '<div class="md-item-desc">' + App.escapeHtml(res.description || res.name || '') + '</div>' +
                '<div class="md-item-meta"><span class="md-chip">' + App.escapeHtml(res.mimeType || 'resource') + '</span></div>';
            card.addEventListener('click', function () {
                state.selectedResource = res;
                state.selectedTool = null;
                state.selectedPrompt = null;
                renderResourceList();
                renderResourceForm(res);
            });
            el.resourceList.appendChild(card);
        });
    }
    function renderResourceForm(res) {
        var html = '<div class="md-af-head">' +
            '<span class="md-af-tag">资源</span>' +
            '<strong class="md-af-title md-mono">' + App.escapeHtml(res.uri || '') + '</strong>' +
            '</div>';
        if (res.description || res.name) {
            html += '<div class="md-af-desc">' + App.escapeHtml(res.description || res.name) + '</div>';
        }
        html += '<div class="md-af-actions">' +
            '<button class="btn btn-primary btn-sm" id="btn-read-resource">▶ 读取资源</button>' +
            '<label class="ui-toggle" style="margin-left:0.5rem;">' +
            '<input type="checkbox" id="af-skip-handshake"' + (state.skipHandshake ? ' checked' : '') + '>' +
            '<span>跳过握手</span>' +
            '</label></div>';
        el.actionForm.innerHTML = html;
        el.actionPanel.hidden = false;
        $('btn-read-resource').addEventListener('click', function () {
            var args = baseArgs('read_resource');
            args.resource_uri = res.uri;
            args.skip_handshake = !!$('af-skip-handshake').checked;
            runAction(args, '读取资源 ' + res.uri);
        });
    }

    // ===== 提示词列表 =====
    function renderPromptList() {
        el.cntPrompts.textContent = state.prompts.length;
        el.promptList.innerHTML = '';
        if (!state.prompts.length) {
            el.promptList.innerHTML = '<div class="md-item-empty">尚未加载提示词，点击「刷新提示词」</div>';
            return;
        }
        state.prompts.forEach(function (p) {
            var card = document.createElement('div');
            card.className = 'md-item-card';
            if (state.selectedPrompt && state.selectedPrompt.name === p.name) card.classList.add('selected');
            var argCount = (p.arguments && Array.isArray(p.arguments)) ? p.arguments.length : 0;
            card.innerHTML =
                '<div class="md-item-name">' + App.escapeHtml(p.name || '') + '</div>' +
                '<div class="md-item-desc">' + App.escapeHtml(p.description || '（无描述）') + '</div>' +
                '<div class="md-item-meta"><span class="md-chip">' + (argCount ? argCount + ' 个变量' : '无变量') + '</span></div>';
            card.addEventListener('click', function () {
                state.selectedPrompt = p;
                state.selectedTool = null;
                state.selectedResource = null;
                renderPromptList();
                renderPromptForm(p);
            });
            el.promptList.appendChild(card);
        });
    }
    function renderPromptForm(p) {
        var html = '<div class="md-af-head">' +
            '<span class="md-af-tag">提示词</span>' +
            '<strong class="md-af-title">' + App.escapeHtml(p.name || '') + '</strong>' +
            '</div>';
        if (p.description) html += '<div class="md-af-desc">' + App.escapeHtml(p.description) + '</div>';
        var args = Array.isArray(p.arguments) ? p.arguments : [];
        if (!args.length) {
            html += '<div class="ui-hint">该提示词无变量，直接点击获取。</div>';
        } else {
            html += '<div class="md-af-grid">';
            args.forEach(function (a) {
                var prop = { type: 'string', description: a.description || '' };
                if (a.required) prop._req = true;
                html += renderSchemaField(a.name || '', prop, !!a.required, 'prompt');
            });
            html += '</div>';
        }
        html += '<div class="md-af-actions">' +
            '<button class="btn btn-primary btn-sm" id="btn-get-prompt">▶ 获取提示词</button>' +
            '<label class="ui-toggle" style="margin-left:0.5rem;">' +
            '<input type="checkbox" id="af-skip-handshake"' + (state.skipHandshake ? ' checked' : '') + '>' +
            '<span>跳过握手</span>' +
            '</label></div>';
        el.actionForm.innerHTML = html;
        el.actionPanel.hidden = false;
        $('btn-get-prompt').addEventListener('click', function () {
            var reqArgs = baseArgs('get_prompt');
            reqArgs.prompt_name = p.name;
            var keys = args.map(function (a) { return a.name; });
            var argObj = collectFormValues(keys, 'prompt');
            if (argObj === null) return;
            if (Object.keys(argObj).length) reqArgs.prompt_args = argObj;
            reqArgs.skip_handshake = !!$('af-skip-handshake').checked;
            runAction(reqArgs, '获取提示词 ' + p.name);
        });
    }

    function hideActionForm() {
        el.actionForm.innerHTML = '';
        el.actionPanel.hidden = true;
    }
    function clearResults() {
        el.summary.hidden = true;
        el.overview.hidden = true;
        el.btnClear.hidden = true;
        el.steps.innerHTML = '';
        el.steps.style.display = '';
        el.empty.hidden = false;
        clearBanner();
    }

    // ===== 原始请求 =====
    function sendRaw() {
        readConnArgs();
        if (isStdioMode()) {
            if (!state.command) { showBanner('error', '请填写启动命令'); return; }
        } else {
            if (!state.endpoint) { showBanner('error', '请填写目标端点'); return; }
        }
        var method = (f.rawMethod.value || '').trim();
        if (!method) { showBanner('error', '请填写 method'); return; }
        var args = baseArgs('raw');
        args.raw_method = method;
        var paramsRaw = (f.rawParams.value || '').trim();
        if (paramsRaw) {
            try { args.raw_params = JSON.parse(paramsRaw); }
            catch (e) { showBanner('error', 'params 不是合法 JSON：' + e.message); return; }
        }
        args.notification = !!f.rawNotif.checked || method.indexOf('notifications/') === 0;
        runAction(args, '原始请求 ' + method);
    }

    // ===== 按钮绑定 =====
    $('btn-connect').addEventListener('click', connectAndLoad);
    $('btn-ping').addEventListener('click', doPing);
    $('btn-refresh-tools').addEventListener('click', function () {
        readConnArgs();
        if (isStdioMode()) {
            if (!state.command) { showBanner('error', '请填写启动命令'); return; }
        } else {
            if (!state.endpoint) { showBanner('error', '请填写目标端点'); return; }
        }
        setBusy(true); clearBanner();
        callProxy(baseArgs('tools_list')).then(function (report) {
            if (report && Array.isArray(report.tools)) { state.tools = report.tools; renderToolList(); }
            renderResult(report);
            if (report.ok) showBanner('success', '已加载 ' + state.tools.length + ' 个工具');
            else showBanner('warn', '工具列表加载失败，详见结果');
        }).catch(function (err) {
            showBanner('error', '请求失败：' + (err && err.message ? err.message : err));
        }).finally(function () { setBusy(false); });
    });
    $('btn-refresh-resources').addEventListener('click', function () {
        readConnArgs();
        if (isStdioMode()) {
            if (!state.command) { showBanner('error', '请填写启动命令'); return; }
        } else {
            if (!state.endpoint) { showBanner('error', '请填写目标端点'); return; }
        }
        setBusy(true); clearBanner();
        callProxy(baseArgs('resources_list')).then(function (report) {
            if (report && Array.isArray(report.resources)) { state.resources = report.resources; renderResourceList(); }
            renderResult(report);
        }).catch(function (err) {
            showBanner('error', '请求失败：' + (err && err.message ? err.message : err));
        }).finally(function () { setBusy(false); });
    });
    $('btn-refresh-prompts').addEventListener('click', function () {
        readConnArgs();
        if (isStdioMode()) {
            if (!state.command) { showBanner('error', '请填写启动命令'); return; }
        } else {
            if (!state.endpoint) { showBanner('error', '请填写目标端点'); return; }
        }
        setBusy(true); clearBanner();
        callProxy(baseArgs('prompts_list')).then(function (report) {
            if (report && Array.isArray(report.prompts)) { state.prompts = report.prompts; renderPromptList(); }
            renderResult(report);
        }).catch(function (err) {
            showBanner('error', '请求失败：' + (err && err.message ? err.message : err));
        }).finally(function () { setBusy(false); });
    });
    $('btn-raw-send').addEventListener('click', sendRaw);
    el.btnCloseForm.addEventListener('click', hideActionForm);
    el.btnClear.addEventListener('click', clearResults);

    // ===== 初始化 =====
    (function init() {
        if (!isLocalhost()) {
            var panel = document.querySelector('.md-layout');
            if (panel) panel.innerHTML =
                '<div class="admin-empty" style="grid-column:1/-1;"><div class="icon">🚫</div>' +
                '<h3>本页面仅限本机访问</h3><p>请在 127.0.0.1 / localhost 打开</p></div>';
            return;
        }
        if (location.port && !f.endpoint.value) {
            f.endpoint.value = 'http://127.0.0.1:' + location.port + '/mcp';
        }
        updateTransportUI();
        if (f.transport) f.transport.addEventListener('change', updateTransportUI);
        renderToolList();
        renderResourceList();
        renderPromptList();
    })();
})();