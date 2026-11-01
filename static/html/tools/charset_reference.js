(function () {
    'use strict';

    var ASCII_CTRL_NAMES = [
        'NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL',
        'BS',  'HT',  'LF',  'VT',  'FF',  'CR',  'SO',  'SI',
        'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB',
        'CAN', 'EM',  'SUB', 'ESC', 'FS',  'GS',  'RS',  'US'
    ];

    var ASCII_CTRL_DESC = [
        '空字符', '标题开始', '正文开始', '正文结束',
        '传输结束', '请求', '确认应答', '响铃',
        '退格', '水平制表符', '换行', '垂直制表符',
        '换页', '回车', '移出', '移入',
        '数据链路转义', '设备控制1', '设备控制2', '设备控制3',
        '设备控制4', '拒绝应答', '同步空闲', '传输块结束',
        '取消', '媒介结束', '替换', '转义',
        '文件分隔符', '组分隔符', '记录分隔符', '单元分隔符'
    ];

    var ASCII_PRINTABLE_DESC = {};
    (function () {
        var map = {
            32: '空格', 33: '感叹号', 34: '双引号', 35: '井号',
            36: '美元符', 37: '百分号', 38: '与号', 39: '单引号',
            40: '左小括号', 41: '右小括号', 42: '星号', 43: '加号',
            44: '逗号', 45: '连字符', 46: '句号', 47: '斜杠',
            48: '数字0', 49: '数字1', 50: '数字2', 51: '数字3',
            52: '数字4', 53: '数字5', 54: '数字6', 55: '数字7',
            56: '数字8', 57: '数字9', 58: '冒号', 59: '分号',
            60: '小于号', 61: '等号', 62: '大于号', 63: '问号',
            64: '艾特号', 91: '左中括号', 92: '反斜杠', 93: '右中括号',
            94: '脱字符', 95: '下划线', 96: '反引号', 123: '左大括号',
            124: '竖线', 125: '右大括号', 126: '波浪号', 127: 'DEL'
        };
        for (var i = 65; i <= 90; i++) map[i] = '大写字母 ' + String.fromCharCode(i);
        for (var j = 97; j <= 122; j++) map[j] = '小写字母 ' + String.fromCharCode(j);
        ASCII_PRINTABLE_DESC = map;
    })();

    function utf8Encode(codePoint) {
        var bytes = [];
        if (codePoint <= 0x7F) {
            bytes.push(codePoint);
        } else if (codePoint <= 0x7FF) {
            bytes.push(0xC0 | (codePoint >> 6));
            bytes.push(0x80 | (codePoint & 0x3F));
        } else if (codePoint <= 0xFFFF) {
            bytes.push(0xE0 | (codePoint >> 12));
            bytes.push(0x80 | ((codePoint >> 6) & 0x3F));
            bytes.push(0x80 | (codePoint & 0x3F));
        } else if (codePoint <= 0x10FFFF) {
            bytes.push(0xF0 | (codePoint >> 18));
            bytes.push(0x80 | ((codePoint >> 12) & 0x3F));
            bytes.push(0x80 | ((codePoint >> 6) & 0x3F));
            bytes.push(0x80 | (codePoint & 0x3F));
        }
        return bytes;
    }

    function utf16Encode(codePoint) {
        if (codePoint <= 0xFFFF) {
            return [codePoint];
        }
        var hi = Math.floor((codePoint - 0x10000) / 0x400) + 0xD800;
        var lo = ((codePoint - 0x10000) % 0x400) + 0xDC00;
        return [hi, lo];
    }

    function hexStr(n, pad) {
        return '0x' + n.toString(16).toUpperCase().padStart(pad || 2, '0');
    }

    function binStr(n, bits) {
        return n.toString(2).padStart(bits || 8, '0');
    }

    function octStr(n) {
        return n.toString(8).padStart(3, '0');
    }

    function isPrintableAscii(code) {
        return code >= 32 && code <= 126;
    }

    function renderAsciiTable(container, showExtended, filterText) {
        var maxCode = showExtended ? 255 : 127;
        var filter = (filterText || '').toLowerCase().trim();

        var html = '<div class="ascii-table-wrap"><table class="ascii-table">';
        html += '<thead><tr>';
        html += '<th>十进制</th><th>十六进制</th><th>八进制</th><th>二进制</th><th>字符</th><th>描述</th>';
        html += '</tr></thead><tbody>';

        for (var i = 0; i <= maxCode; i++) {
            var desc = '';
            var charDisplay = '';
            var rowClass = '';

            if (i <= 31) {
                desc = ASCII_CTRL_NAMES[i] + ' - ' + ASCII_CTRL_DESC[i];
                charDisplay = ASCII_CTRL_NAMES[i];
                rowClass = 'ctrl-row';
            } else if (i === 127) {
                desc = 'DEL - 删除';
                charDisplay = 'DEL';
                rowClass = 'ctrl-row';
            } else if (i >= 128 && i <= 255) {
                desc = '扩展ASCII ' + i;
                charDisplay = '&#' + i + ';';
                rowClass = 'ext-row';
            } else {
                desc = ASCII_PRINTABLE_DESC[i] || '';
                charDisplay = i === 32 ? 'SP' : String.fromCharCode(i);
                rowClass = 'print-row';
            }

            if (filter) {
                var searchable = (i + ' ' + hexStr(i) + ' ' + octStr(i) + ' ' + binStr(i) + ' ' + charDisplay + ' ' + desc).toLowerCase();
                if (searchable.indexOf(filter) === -1) continue;
            }

            html += '<tr class="' + rowClass + '">';
            html += '<td>' + i + '</td>';
            html += '<td>' + hexStr(i) + '</td>';
            html += '<td>' + octStr(i) + '</td>';
            html += '<td>' + binStr(i) + '</td>';
            html += '<td class="char-cell">' + charDisplay + '</td>';
            html += '<td>' + desc + '</td>';
            html += '</tr>';
        }

        html += '</tbody></table></div>';

        html += '<div class="ascii-legend">';
        html += '<span><span class="dot" style="background:var(--text-light)"></span> 控制字符 (0-31, 127)</span>';
        html += '<span><span class="dot" style="background:var(--primary)"></span> 可打印字符 (32-126)</span>';
        if (showExtended) {
            html += '<span><span class="dot" style="background:var(--text-muted)"></span> 扩展ASCII (128-255)</span>';
        }
        html += '</div>';

        container.innerHTML = html;
    }

    function renderUnicodeLookup(container) {
        var html = '';

        html += '<div class="unicode-detail-row">';
        html += '<div class="tool-card">';
        html += '<h3>字符 → Unicode</h3>';
        html += '<div class="unicode-input-group">';
        html += '<div class="input-wrap"><label>输入字符</label><input type="text" id="uni-char-input" placeholder="输入一个或多个字符..." maxlength="50"></div>';
        html += '<button class="btn btn-sm" id="btn-uni-char-lookup">查询</button>';
        html += '</div>';
        html += '<div id="uni-char-result" style="margin-top:1rem;"></div>';
        html += '</div>';

        html += '<div class="tool-card">';
        html += '<h3>Unicode → 字符</h3>';
        html += '<div class="unicode-input-group">';
        html += '<div class="input-wrap"><label>输入码点</label><input type="text" id="uni-code-input" placeholder="如: 4E2D 或 0x4E2D 或 20013"></div>';
        html += '<button class="btn btn-sm" id="btn-uni-code-lookup">查询</button>';
        html += '</div>';
        html += '<div id="uni-code-result" style="margin-top:1rem;"></div>';
        html += '</div>';
        html += '</div>';

        html += '<div class="tool-card" style="margin-top:1.5rem;">';
        html += '<h3>Unicode 字符浏览</h3>';
        html += '<div class="unicode-range-nav" id="unicode-range-nav"></div>';
        html += '<div class="unicode-char-grid" id="unicode-char-grid"></div>';
        html += '<div id="unicode-grid-detail" style="margin-top:1rem;"></div>';
        html += '</div>';

        container.innerHTML = html;

        var ranges = [
            { label: '基本拉丁', start: 0x0020, end: 0x007F },
            { label: '拉丁-1补充', start: 0x00A0, end: 0x00FF },
            { label: '拉丁扩展-A', start: 0x0100, end: 0x017F },
            { label: '拉丁扩展-B', start: 0x0180, end: 0x024F },
            { label: 'IPA扩展', start: 0x0250, end: 0x02AF },
            { label: '希腊字母', start: 0x0370, end: 0x03FF },
            { label: '西里尔字母', start: 0x0400, end: 0x04FF },
            { label: '亚美尼亚字母', start: 0x0530, end: 0x058F },
            { label: '希伯来字母', start: 0x0590, end: 0x05FF },
            { label: '阿拉伯字母', start: 0x0600, end: 0x06FF },
            { label: '天城文', start: 0x0900, end: 0x097F },
            { label: '泰文', start: 0x0E00, end: 0x0E7F },
            { label: 'CJK部首', start: 0x2E80, end: 0x2EFF },
            { label: '中日韩统一', start: 0x4E00, end: 0x4EFF },
            { label: '平假名', start: 0x3040, end: 0x309F },
            { label: '片假名', start: 0x30A0, end: 0x30FF },
            { label: 'CJK兼容', start: 0x3300, end: 0x33FF },
            { label: '韩文音节', start: 0xAC00, end: 0xAC7F },
            { label: '私用区', start: 0xE000, end: 0xE02F },
            { label: '字母变体', start: 0xFB00, end: 0xFB06 },
            { label: '阿拉伯变体A', start: 0xFB50, end: 0xFB6F },
            { label: '通用标点', start: 0x2000, end: 0x206F },
            { label: '货币符号', start: 0x20A0, end: 0x20CF },
            { label: '字母式符号', start: 0x2100, end: 0x214F },
            { label: '箭头', start: 0x2190, end: 0x21FF },
            { label: '数学运算符', start: 0x2200, end: 0x22FF },
            { label: '杂项技术', start: 0x2300, end: 0x23FF },
            { label: '制表符', start: 0x2500, end: 0x257F },
            { label: '方块元素', start: 0x2580, end: 0x259F },
            { label: '几何形状', start: 0x25A0, end: 0x25FF },
            { label: '杂项符号', start: 0x2600, end: 0x26FF },
            { label: '装饰符号', start: 0x2700, end: 0x27BF },
            { label: '表情符号', start: 0x1F600, end: 0x1F64F },
            { label: '杂项象形', start: 0x1F300, end: 0x1F35F },
            { label: '交通与地图', start: 0x1F680, end: 0x1F6FF },
            { label: '补充箭头-A', start: 0x27F0, end: 0x27FF }
        ];

        var rangeNav = document.getElementById('unicode-range-nav');
        var charGrid = document.getElementById('unicode-char-grid');
        var gridDetail = document.getElementById('unicode-grid-detail');
        var currentRange = ranges[0];

        ranges.forEach(function (r, idx) {
            var btn = document.createElement('button');
            btn.className = 'unicode-range-btn' + (idx === 0 ? ' active' : '');
            btn.textContent = r.label;
            btn.addEventListener('click', function () {
                currentRange = r;
                rangeNav.querySelectorAll('.unicode-range-btn').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                renderCharGrid();
            });
            rangeNav.appendChild(btn);
        });

        function renderCharGrid() {
            var start = currentRange.start;
            var end = Math.min(currentRange.end, start + 255);
            var html = '';
            for (var cp = start; cp <= end; cp++) {
                try {
                    var ch = String.fromCodePoint(cp);
                    html += '<div class="unicode-char-cell" data-cp="' + cp + '">';
                    html += '<span class="char-glyph">' + ch + '</span>';
                    html += '<span class="char-code">' + hexStr(cp, 4).replace('0x', 'U+') + '</span>';
                    html += '</div>';
                } catch (e) { }
            }
            charGrid.innerHTML = html;
            gridDetail.innerHTML = '';

            charGrid.querySelectorAll('.unicode-char-cell').forEach(function (cell) {
                cell.addEventListener('click', function () {
                    var cp = parseInt(cell.getAttribute('data-cp'), 10);
                    charGrid.querySelectorAll('.unicode-char-cell').forEach(function (c) { c.style.borderColor = ''; c.style.background = ''; });
                    cell.style.borderColor = 'var(--primary)';
                    cell.style.background = 'var(--primary-light)';
                    showCharDetail(cp, gridDetail);
                });
            });
        }

        renderCharGrid();

        function showCharDetail(codePoint, target) {
            if (codePoint < 0 || codePoint > 0x10FFFF) {
                target.innerHTML = '<div class="tool-hint" style="color:var(--error)">无效的码点范围 (0 - 0x10FFFF)</div>';
                return;
            }
            try {
                var ch = String.fromCodePoint(codePoint);
                var utf8Bytes = utf8Encode(codePoint);
                var utf16Units = utf16Encode(codePoint);
                var utf8Hex = utf8Bytes.map(function (b) { return hexStr(b); }).join(' ');
                var utf8Bin = utf8Bytes.map(function (b) { return binStr(b); }).join(' ');
                var utf16Hex = utf16Units.map(function (u) { return hexStr(u, 4); }).join(' ');
                var htmlEntity = '&#' + codePoint + ';';
                var htmlEntityHex = '&#x' + codePoint.toString(16).toUpperCase() + ';';
                var cssUnicode = '\\' + codePoint.toString(16).toUpperCase().padStart(4, '0');
                var jsUnicode = '\\u' + codePoint.toString(16).toUpperCase().padStart(4, '0');
                var pyUnicode = '\\u' + codePoint.toString(16).toUpperCase().padStart(4, '0');

                var html = '<div class="unicode-result-card">';
                html += '<table class="unicode-result-table">';
                html += '<tr><td class="char-preview" rowspan="10" style="vertical-align:middle;padding:0.75rem;">' + ch + '</td>';
                html += '<td class="label-col">码点(十进制)</td><td>' + codePoint + '</td></tr>';
                html += '<tr><td class="label-col">码点(十六进制)</td><td>' + hexStr(codePoint, codePoint > 0xFFFF ? 6 : 4) + '</td></tr>';
                html += '<tr><td class="label-col">UTF-8</td><td>' + utf8Hex + ' <span style="color:var(--text-light)">(' + utf8Bytes.length + ' 字节)</span></td></tr>';
                html += '<tr><td class="label-col">UTF-8(二进制)</td><td>' + utf8Bin + '</td></tr>';
                html += '<tr><td class="label-col">UTF-16</td><td>' + utf16Hex + ' <span style="color:var(--text-light)">(' + utf16Units.length + (utf16Units.length === 1 ? ' 单元' : ' 单元(代理对)') + ')</span></td></tr>';
                html += '<tr><td class="label-col">HTML实体</td><td>' + escapeHtml(htmlEntity) + ' → ' + htmlEntity + '</td></tr>';
                html += '<tr><td class="label-col">HTML实体(十六进制)</td><td>' + escapeHtml(htmlEntityHex) + ' → ' + htmlEntityHex + '</td></tr>';
                html += '<tr><td class="label-col">CSS转义</td><td>' + escapeHtml(cssUnicode) + '</td></tr>';
                html += '<tr><td class="label-col">JavaScript转义</td><td>' + escapeHtml(jsUnicode) + '</td></tr>';
                html += '<tr><td class="label-col">Python转义</td><td>' + escapeHtml(pyUnicode) + '</td></tr>';
                html += '</table></div>';

                target.innerHTML = html;
            } catch (e) {
                target.innerHTML = '<div class="tool-hint" style="color:var(--error)">无法渲染该码点: ' + e.message + '</div>';
            }
        }

        function escapeHtml(s) {
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        document.getElementById('btn-uni-char-lookup').addEventListener('click', function () {
            var input = document.getElementById('uni-char-input').value;
            var resultEl = document.getElementById('uni-char-result');
            if (!input) {
                resultEl.innerHTML = '<div class="tool-hint">请输入字符</div>';
                return;
            }
            var chars = Array.from(input);
            var html = '';
            chars.forEach(function (ch, idx) {
                var cp = ch.codePointAt(0);
                html += '<div class="unicode-result-card" style="margin-bottom:0.75rem;">';
                html += '<table class="unicode-result-table">';

                var utf8Bytes = utf8Encode(cp);
                var utf16Units = utf16Encode(cp);
                var utf8Hex = utf8Bytes.map(function (b) { return hexStr(b); }).join(' ');
                var utf16Hex = utf16Units.map(function (u) { return hexStr(u, 4); }).join(' ');

                html += '<tr><td class="char-preview" rowspan="5" style="vertical-align:middle;padding:0.75rem;">' + ch + '</td>';
                html += '<td class="label-col">码点</td><td>' + cp + ' (' + hexStr(cp, cp > 0xFFFF ? 6 : 4) + ')</td></tr>';
                html += '<tr><td class="label-col">UTF-8</td><td>' + utf8Hex + ' <span style="color:var(--text-light)">(' + utf8Bytes.length + ' 字节)</span></td></tr>';
                html += '<tr><td class="label-col">UTF-16</td><td>' + utf16Hex + ' <span style="color:var(--text-light)">(' + utf16Units.length + (utf16Units.length === 1 ? ' 单元' : ' 单元') + ')</span></td></tr>';
                html += '<tr><td class="label-col">HTML实体</td><td>' + escapeHtml('&#' + cp + ';') + '</td></tr>';
                html += '<tr><td class="label-col">JS/CSS转义</td><td>' + escapeHtml('\\u' + cp.toString(16).toUpperCase().padStart(4, '0')) + '</td></tr>';
                html += '</table></div>';
            });
            resultEl.innerHTML = html;
        });

        document.getElementById('uni-char-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') document.getElementById('btn-uni-char-lookup').click();
        });

        document.getElementById('btn-uni-code-lookup').addEventListener('click', function () {
            var input = document.getElementById('uni-code-input').value.trim();
            var resultEl = document.getElementById('uni-code-result');
            if (!input) {
                resultEl.innerHTML = '<div class="tool-hint">请输入码点</div>';
                return;
            }

            var codePoint;
            if (/^0x[0-9a-fA-F]+$/.test(input)) {
                codePoint = parseInt(input, 16);
            } else if (/^[0-9a-fA-F]{2,6}$/.test(input) && !/^\d+$/.test(input)) {
                codePoint = parseInt(input, 16);
            } else if (/^U\+[0-9a-fA-F]{2,6}$/i.test(input)) {
                codePoint = parseInt(input.substring(2), 16);
            } else if (/^\d+$/.test(input)) {
                codePoint = parseInt(input, 10);
            } else {
                resultEl.innerHTML = '<div class="tool-hint" style="color:var(--error)">无法解析输入，支持格式: 十进制、十六进制(0x4E2D / 4E2D / U+4E2D)</div>';
                return;
            }

            showCharDetail(codePoint, resultEl);
        });

        document.getElementById('uni-code-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') document.getElementById('btn-uni-code-lookup').click();
        });
    }

    window.CharsetReference = {
        renderAsciiTable: renderAsciiTable,
        renderUnicodeLookup: renderUnicodeLookup
    };
})();