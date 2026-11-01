/* ===== HTTP Status Codes ===== */
(function () {
    'use strict';

    var STATUS_CODES = [
        // 1xx Informational
        { code: 100, name: 'Continue', desc: '继续请求。服务器已收到请求头,客户端可继续发送请求体' },
        { code: 101, name: 'Switching Protocols', desc: '切换协议。服务器同意切换到客户端指定的协议' },
        { code: 102, name: 'Processing', desc: '处理中。服务器已收到并正在处理请求,尚未完成' },
        { code: 103, name: 'Early Hints', desc: '早期提示。服务器在最终响应前返回部分响应头' },

        // 2xx Success
        { code: 200, name: 'OK', desc: '请求成功。服务器已成功处理请求' },
        { code: 201, name: 'Created', desc: '已创建。请求成功并创建了新资源' },
        { code: 202, name: 'Accepted', desc: '已接受。请求已接收但尚未处理完成' },
        { code: 203, name: 'Non-Authoritative Information', desc: '非权威信息。返回的信息来自第三方而非原始服务器' },
        { code: 204, name: 'No Content', desc: '无内容。请求成功但响应体为空' },
        { code: 205, name: 'Reset Content', desc: '重置内容。请求成功,要求客户端重置文档视图' },
        { code: 206, name: 'Partial Content', desc: '部分内容。服务器成功处理了范围请求' },
        { code: 207, name: 'Multi-Status', desc: '多状态。WebDAV 响应,包含多个独立状态' },
        { code: 208, name: 'Already Reported', desc: '已报告。WebDAV 资源已在前面部分列出' },
        { code: 226, name: 'IM Used', desc: '已使用。服务器已对实例操作执行了相应处理' },

        // 3xx Redirection
        { code: 300, name: 'Multiple Choices', desc: '多种选择。请求对应多个可用资源' },
        { code: 301, name: 'Moved Permanently', desc: '永久重定向。资源已永久移动到新 URI' },
        { code: 302, name: 'Found', desc: '临时重定向。资源临时位于其他 URI' },
        { code: 303, name: 'See Other', desc: '查看其他。应使用 GET 请求访问另一 URI' },
        { code: 304, name: 'Not Modified', desc: '未修改。资源自上次请求后未变化,可使用缓存' },
        { code: 305, name: 'Use Proxy', desc: '使用代理。必须通过指定代理访问' },
        { code: 307, name: 'Temporary Redirect', desc: '临时重定向。请求方法不变,临时跳转到新 URI' },
        { code: 308, name: 'Permanent Redirect', desc: '永久重定向。请求方法不变,永久跳转到新 URI' },

        // 4xx Client Error
        { code: 400, name: 'Bad Request', desc: '错误请求。服务器无法理解请求语法' },
        { code: 401, name: 'Unauthorized', desc: '未授权。需要身份验证才能访问' },
        { code: 402, name: 'Payment Required', desc: '需要付款。预留状态码,用于计费场景' },
        { code: 403, name: 'Forbidden', desc: '禁止访问。服务器拒绝执行请求' },
        { code: 404, name: 'Not Found', desc: '未找到。服务器未找到请求的资源' },
        { code: 405, name: 'Method Not Allowed', desc: '方法不允许。该资源不支持当前请求方法' },
        { code: 406, name: 'Not Acceptable', desc: '不可接受。无法生成符合 Accept 头的响应' },
        { code: 407, name: 'Proxy Authentication Required', desc: '代理认证。需要先通过代理服务器认证' },
        { code: 408, name: 'Request Timeout', desc: '请求超时。客户端未在规定时间内完成请求' },
        { code: 409, name: 'Conflict', desc: '冲突。请求与服务器当前状态冲突' },
        { code: 410, name: 'Gone', desc: '已删除。资源已永久删除且无转发地址' },
        { code: 411, name: 'Length Required', desc: '需要长度。必须提供 Content-Length 头' },
        { code: 412, name: 'Precondition Failed', desc: '前提条件失败。请求的条件头字段校验失败' },
        { code: 413, name: 'Payload Too Large', desc: '负载过大。请求体超过服务器允许的大小' },
        { code: 414, name: 'URI Too Long', desc: 'URI 过长。请求的 URI 超过服务器允许长度' },
        { code: 415, name: 'Unsupported Media Type', desc: '不支持的媒体类型。请求格式不被支持' },
        { code: 416, name: 'Range Not Satisfiable', desc: '范围不满足。请求的 Range 范围无法满足' },
        { code: 417, name: 'Expectation Failed', desc: '期望失败。Expect 头字段无法满足' },
        { code: 418, name: "I'm a Teapot", desc: '茶壶。彩蛋状态码,服务器拒绝煮咖啡' },
        { code: 421, name: 'Misdirected Request', desc: '错误导向。请求被发送到无法响应的服务器' },
        { code: 422, name: 'Unprocessable Entity', desc: '无法处理的实体。语法正确但语义错误' },
        { code: 423, name: 'Locked', desc: '已锁定。WebDAV 资源被锁定' },
        { code: 424, name: 'Failed Dependency', desc: '依赖失败。前序请求失败导致本请求失败' },
        { code: 425, name: 'Too Early', desc: '过早。服务器不愿处理可能重放的请求' },
        { code: 426, name: 'Upgrade Required', desc: '需要升级。客户端需升级到其他协议' },
        { code: 428, name: 'Precondition Required', desc: '需要前提条件。请求必须包含条件头' },
        { code: 429, name: 'Too Many Requests', desc: '请求过多。触发限流,请降低请求频率' },
        { code: 431, name: 'Request Header Fields Too Large', desc: '请求头过大。请求头字段超过服务器限制' },
        { code: 451, name: 'Unavailable For Legal Reasons', desc: '因法律原因不可用。资源因法律要求被禁止访问' },

        // 5xx Server Error
        { code: 500, name: 'Internal Server Error', desc: '服务器内部错误。服务器遇到意外错误' },
        { code: 501, name: 'Not Implemented', desc: '未实现。服务器不支持请求的功能' },
        { code: 502, name: 'Bad Gateway', desc: '网关错误。上游服务器返回无效响应' },
        { code: 503, name: 'Service Unavailable', desc: '服务不可用。服务器暂时过载或维护中' },
        { code: 504, name: 'Gateway Timeout', desc: '网关超时。上游服务器响应超时' },
        { code: 505, name: 'HTTP Version Not Supported', desc: 'HTTP 版本不支持。服务器不支持请求的 HTTP 版本' },
        { code: 506, name: 'Variant Also Negotiates', desc: '变体协商。透明内容协商配置错误' },
        { code: 507, name: 'Insufficient Storage', desc: '存储不足。WebDAV 服务器存储空间不足' },
        { code: 508, name: 'Loop Detected', desc: '检测到循环。WebDAV 操作陷入无限循环' },
        { code: 510, name: 'Not Extended', desc: '未扩展。需要进一步扩展请求才能完成' },
        { code: 511, name: 'Network Authentication Required', desc: '需要网络认证。需先完成网络认证才能访问' }
    ];

    var CATEGORIES = [
        { code: 'all', name: '全部' },
        { code: '1', name: '1xx' },
        { code: '2', name: '2xx' },
        { code: '3', name: '3xx' },
        { code: '4', name: '4xx' },
        { code: '5', name: '5xx' }
    ];

    var state = { cat: 'all', search: '' };

    function catOf(code) { return String(Math.floor(code / 100)); }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var searchInput = $('http-search');
        var catsBox = $('http-cats');
        var tbody = $('http-tbody');
        var countEl = $('http-count');
        var emptyEl = $('http-empty');
        var wrapEl = $('http-table-wrap');
        var banner = 'banner-container';

        function renderCats() {
            catsBox.innerHTML = '';
            CATEGORIES.forEach(function (cat) {
                var active = state.cat === cat.code;
                catsBox.appendChild(Tools.el('button', {
                    class: 'http-cat-btn' + (active ? ' active' : ''),
                    type: 'button',
                    text: cat.name,
                    onclick: function () {
                        state.cat = cat.code;
                        renderCats();
                        renderRows();
                    }
                }));
            });
        }

        function match(item) {
            if (state.cat !== 'all' && catOf(item.code) !== state.cat) return false;
            if (!state.search) return true;
            var term = state.search.toLowerCase();
            if (String(item.code).indexOf(state.search) !== -1) return true;
            if (item.name.toLowerCase().indexOf(term) !== -1) return true;
            if (item.desc.toLowerCase().indexOf(term) !== -1) return true;
            return false;
        }

        function renderRows() {
            tbody.innerHTML = '';
            var matched = STATUS_CODES.filter(match);
            countEl.textContent = '共 ' + matched.length + ' 条结果';
            wrapEl.hidden = matched.length === 0;
            emptyEl.hidden = matched.length !== 0;

            matched.forEach(function (item) {
                var c = catOf(item.code);
                var badge = Tools.el('span', { class: 'http-badge cat-' + c, text: String(item.code) });
                var tr = Tools.el('tr', { 'data-code': String(item.code) }, [
                    Tools.el('td', { 'data-label': '状态码' }, [badge]),
                    Tools.el('td', { 'data-label': '名称', class: 'http-name', text: item.name }),
                    Tools.el('td', { 'data-label': '说明', class: 'http-desc', text: item.desc })
                ]);
                tr.addEventListener('click', function () {
                    var codeStr = String(item.code);
                    Tools.copyText(codeStr).then(function (ok) {
                        if (!ok) {
                            Tools.showBanner(banner, 'error', '复制失败,请手动复制:' + codeStr);
                            setTimeout(function () { Tools.clearBanner(banner); }, 2000);
                            return;
                        }
                        var orig = badge.textContent;
                        badge.textContent = '✓';
                        tr.classList.add('copied');
                        setTimeout(function () {
                            badge.textContent = orig;
                            tr.classList.remove('copied');
                        }, 1000);
                    });
                });
                tbody.appendChild(tr);
            });
        }

        searchInput.addEventListener('input', function (e) {
            state.search = e.target.value.trim();
            renderRows();
        });

        renderCats();
        renderRows();
    });
})();
