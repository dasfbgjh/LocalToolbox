/* ===== Safelink Decoder ===== */
(function () {
    'use strict';

    // ===== Try to decode a string as Base64 (standard or URL-safe) =====
    function tryBase64Url(input) {
        var trimmed = input.trim();
        // Must consist only of base64 characters (no whitespace, length >= 8)
        if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(trimmed)) return null;
        if (trimmed.length < 8) return null;

        // Convert URL-safe base64 to standard
        var b64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
        // Add padding
        while (b64.length % 4 !== 0) b64 += '=';

        try {
            var binary = atob(b64);
            var bytes = new Uint8Array(binary.length);
            for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            var text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
            // Only accept if the decoded content looks like a URL
            if (/^https?:\/\//i.test(text)) return text;
        } catch (e) {
            return null;
        }
        return null;
    }

    // ===== Detect format label from the original input =====
    function detectFormat(input) {
        var trimmed = input.trim();
        try {
            var url = new URL(trimmed);
            var host = url.hostname.toLowerCase();
            var path = url.pathname;
            if (host.indexOf('google.com') !== -1 && (path === '/url' || path === '/interstitial')) {
                return 'Google Safe Link';
            }
            if (host.indexOf('safelinks.protection.outlook.com') !== -1) {
                return 'Outlook SafeLinks';
            }
            if (host.indexOf('weixin110.qq.com') !== -1 || host.indexOf('weixin.qq.com') !== -1) {
                return '微信安全链接';
            }
            if (url.searchParams.get('url') || url.searchParams.get('q')) {
                return '通用 URL 参数';
            }
            return '普通链接';
        } catch (e) {
            if (tryBase64Url(trimmed)) return 'Base64 编码';
            return '未知格式';
        }
    }

    // ===== Recursively decode a single link, recording each step =====
    function decodeStep(input, steps) {
        var trimmed = input.trim();
        if (!trimmed) return '';

        // Try parsing as a URL
        var url = null;
        try { url = new URL(trimmed); } catch (e) { url = null; }

        if (url) {
            var host = url.hostname.toLowerCase();
            var path = url.pathname;
            var extracted = null;
            var label = '';

            // Google Safe Link: /url?q=... or /interstitial?url=...
            if (host.indexOf('google.com') !== -1 && (path === '/url' || path === '/interstitial')) {
                extracted = url.searchParams.get('q') || url.searchParams.get('url');
                label = '提取 q= / url= 参数';
            }
            // Outlook SafeLinks
            else if (host.indexOf('safelinks.protection.outlook.com') !== -1) {
                extracted = url.searchParams.get('url');
                label = '提取 Outlook url= 参数';
            }
            // WeChat safe links
            else if (host.indexOf('weixin110.qq.com') !== -1 || host.indexOf('weixin.qq.com') !== -1) {
                extracted = url.searchParams.get('url') || url.searchParams.get('u');
                label = '提取微信 url= 参数';
            }

            if (extracted) {
                steps.push({ label: label, value: extracted });
                return decodeStep(extracted, steps);
            }

            // Generic: if a url= or q= param itself looks like a URL, follow it
            var generic = url.searchParams.get('url') || url.searchParams.get('q');
            if (generic && /^https?:\/\//i.test(generic)) {
                steps.push({ label: '提取 url= / q= 参数', value: generic });
                return decodeStep(generic, steps);
            }

            // No further unwrap possible — return canonical URL
            return url.href;
        }

        // Not a URL — try Base64
        var b64 = tryBase64Url(trimmed);
        if (b64) {
            steps.push({ label: 'Base64 解码', value: b64 });
            return decodeStep(b64, steps);
        }

        // Cannot decode further
        return trimmed;
    }

    function decodeOne(input) {
        var trimmed = input.trim();
        if (!trimmed) return { format: '空行', result: '', steps: [], empty: true };

        var steps = [];
        steps.push({ label: '原始输入', value: trimmed });
        var result = decodeStep(trimmed, steps);
        var format = detectFormat(trimmed);

        // If nothing changed, no real decoding happened
        if (result === trimmed && steps.length <= 1) {
            format = format === '普通链接' ? '无法解码' : format;
        }

        return { format: format, result: result, steps: steps, empty: false };
    }

    // ===== Escape HTML for safe rendering =====
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var banner = 'banner';

        var inputEl = $('input-links');
        var resultList = $('result-list');

        function renderResults(results) {
            resultList.innerHTML = '';
            if (results.length === 0) {
                resultList.appendChild(Tools.el('div', { class: 'safelink-empty', text: '输入链接后点击「解码」查看结果' }));
                return;
            }

            results.forEach(function (r, idx) {
                var item = Tools.el('div', { class: 'safelink-result-item' });

                var header = Tools.el('div', { class: 'safelink-result-header' }, [
                    Tools.el('span', { class: 'safelink-idx', text: '#' + (idx + 1) }),
                    Tools.el('span', {
                        class: 'safelink-format-tag' + (r.format === '无法解码' || r.format === '未知格式' ? ' unknown' : ''),
                        text: r.format
                    })
                ]);
                item.appendChild(header);

                if (r.empty) {
                    item.appendChild(Tools.el('div', { class: 'safelink-decoded empty', text: '空行已跳过' }));
                    resultList.appendChild(item);
                    return;
                }

                // Show original input (truncated if too long)
                item.appendChild(Tools.el('div', { class: 'safelink-original', text: r.steps[0].value }));

                // Decoded result
                var decodedText = r.result;
                var decodedEl = Tools.el('div', {
                    class: 'safelink-decoded' + (decodedText === r.steps[0].value ? ' empty' : ''),
                    text: decodedText === r.steps[0].value ? '（未能进一步解码）' : decodedText
                });
                item.appendChild(decodedEl);

                // Steps
                if (r.steps.length > 1) {
                    var ol = document.createElement('ol');
                    ol.className = 'safelink-steps';
                    for (var i = 1; i < r.steps.length; i++) {
                        var li = document.createElement('li');
                        li.appendChild(Tools.el('span', { class: 'step-label', text: r.steps[i].label + ':' }));
                        li.appendChild(document.createTextNode(r.steps[i].value));
                        ol.appendChild(li);
                    }
                    item.appendChild(ol);
                }

                // Actions
                var actions = Tools.el('div', { class: 'safelink-actions' });
                if (decodedText && decodedText !== r.steps[0].value) {
                    var copyBtn = Tools.el('button', {
                        class: 'btn btn-ghost btn-sm', type: 'button', text: '复制结果',
                        onclick: function () { Tools.copyText(decodedText, copyBtn, '已复制'); }
                    });
                    actions.appendChild(copyBtn);

                    if (/^https?:\/\//i.test(decodedText)) {
                        var openLink = Tools.el('a', {
                            class: 'btn btn-outline btn-sm', href: decodedText, target: '_blank', rel: 'noopener', text: '打开链接'
                        });
                        actions.appendChild(openLink);
                    }
                }
                item.appendChild(actions);

                resultList.appendChild(item);
            });
        }

        function decode() {
            Tools.clearBanner(banner);
            var raw = inputEl.value;
            if (!raw.trim()) {
                Tools.showBanner(banner, 'warn', '请输入至少一个安全链接');
                renderResults([]);
                return;
            }
            var lines = raw.split(/\r?\n/);
            var results = lines.map(function (line) { return decodeOne(line); });
            renderResults(results);

            var successCount = results.filter(function (r) { return !r.empty && r.result !== r.steps[0].value; }).length;
            var total = results.filter(function (r) { return !r.empty; }).length;
            Tools.showBanner(banner, 'success', '已解码 ' + successCount + ' / ' + total + ' 个链接');
        }

        function copyAll() {
            var items = resultList.querySelectorAll('.safelink-result-item');
            if (items.length === 0) {
                Tools.showBanner(banner, 'warn', '请先解码');
                return;
            }
            var lines = [];
            items.forEach(function (item) {
                var decoded = item.querySelector('.safelink-decoded:not(.empty)');
                if (decoded) lines.push(decoded.textContent);
            });
            if (lines.length === 0) {
                Tools.showBanner(banner, 'warn', '没有可复制的结果');
                return;
            }
            Tools.copyText(lines.join('\n'), $('btn-copy-all'), '已复制 ' + lines.length + ' 个结果');
        }

        $('btn-decode').addEventListener('click', decode);
        $('btn-copy-all').addEventListener('click', copyAll);
        $('btn-clear').addEventListener('click', function () {
            inputEl.value = '';
            renderResults([]);
            Tools.clearBanner(banner);
        });

        $('btn-sample').addEventListener('click', function () {
            inputEl.value = [
                'https://www.google.com/url?q=https://example.com/page&sa=U&ved=2ahUKEwj',
                'https://nam01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com%2Fpath&data=05%7C01',
                'https://weixin110.qq.com/cgi-bin/mmspamsupport-bin/newredirectconfirmurl?url=https%3A%2F%2Fexample.com%2Fwechat',
                'aHR0cHM6Ly9leGFtcGxlLmNvbS9iYXNlNjQ=',
                'https://example.com/redirect?url=https%3A%2F%2Ftarget.com'
            ].join('\n');
            Tools.clearBanner(banner);
        });

        // Decode on Ctrl+Enter in textarea
        inputEl.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') decode();
        });
    });
})();
