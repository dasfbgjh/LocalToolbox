/* ===== YAML Viewer =====
 * 自实现简单 YAML 解析与序列化（不使用外部库）
 * 功能：格式化、转 JSON、压缩、校验、树形查看
 */
(function () {
    'use strict';

    /* ============ YAML Parser ============ */
    function parseYaml(src) {
        src = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        var lines = src.split('\n');
        var state = { lines: lines, idx: 0 };

        function makeError(msg, lineIdx) {
            var li = (lineIdx !== undefined ? lineIdx : state.idx) + 1;
            var e = new Error('第 ' + li + ' 行：' + msg);
            e.line = li;
            return e;
        }

        function indentOf(line) {
            if (line == null) return -1;
            var m = /^(\s*)/.exec(line);
            return m ? m[1].length : 0;
        }

        function isBlank(line) {
            return line == null || /^\s*$/.test(line) || /^\s*#/.test(line);
        }

        function skipBlanks() {
            while (state.idx < lines.length && isBlank(lines[state.idx])) state.idx++;
        }

        function stripComment(s) {
            var inSingle = false, inDouble = false;
            for (var i = 0; i < s.length; i++) {
                var c = s.charAt(i);
                if (inSingle) { if (c === "'") inSingle = false; }
                else if (inDouble) { if (c === '\\') { i++; } else if (c === '"') inDouble = false; }
                else {
                    if (c === "'") inSingle = true;
                    else if (c === '"') inDouble = true;
                    else if (c === '#' && (i === 0 || /\s/.test(s.charAt(i - 1)))) return s.slice(0, i);
                }
            }
            return s;
        }

        function unescapeDouble(s) {
            var out = '';
            for (var i = 0; i < s.length; i++) {
                var c = s.charAt(i);
                if (c === '\\' && i + 1 < s.length) {
                    var n = s.charAt(i + 1);
                    switch (n) {
                        case 'n': out += '\n'; break;
                        case 't': out += '\t'; break;
                        case 'r': out += '\r'; break;
                        case '"': out += '"'; break;
                        case '\\': out += '\\'; break;
                        case '/': out += '/'; break;
                        case '0': out += '\0'; break;
                        case 'b': out += '\b'; break;
                        case 'f': out += '\f'; break;
                        case 'u':
                            out += String.fromCharCode(parseInt(s.substr(i + 2, 4), 16));
                            i += 4;
                            break;
                        default: out += n;
                    }
                    i++;
                } else {
                    out += c;
                }
            }
            return out;
        }

        function parseScalar(str) {
            str = str.trim();
            if (str === '') return null;
            str = stripComment(str).trim();
            if (str === '') return null;
            if (str === 'null' || str === '~' || str === 'Null' || str === 'NULL') return null;
            if (/^(true|True|TRUE|yes|Yes|YES|on|On|ON)$/.test(str)) return true;
            if (/^(false|False|FALSE|no|No|NO|off|Off|OFF)$/.test(str)) return false;
            if (/^[-+]?[0-9]+$/.test(str)) return parseInt(str, 10);
            if (/^[-+]?[0-9]*\.[0-9]+$/.test(str) || /^[-+]?[0-9]+(\.[0-9]*)?[eE][-+]?[0-9]+$/.test(str)) {
                return parseFloat(str);
            }
            if (str.length >= 2 && str.charAt(0) === '"' && str.charAt(str.length - 1) === '"') {
                return unescapeDouble(str.slice(1, -1));
            }
            if (str.length >= 2 && str.charAt(0) === "'" && str.charAt(str.length - 1) === "'") {
                return str.slice(1, -1).replace(/''/g, "'");
            }
            return str;
        }

        // 流式数组 [a, b, c] 或 [a: b]
        function parseFlow(str) {
            str = str.trim();
            if (str.charAt(0) === '[') {
                var inner = str.slice(1, -1).trim();
                if (inner === '') return [];
                return splitFlow(inner).map(function (p) { return parseFlowItem(p); });
            }
            if (str.charAt(0) === '{') {
                var obj = {};
                var body = str.slice(1, -1).trim();
                if (body === '') return obj;
                splitFlow(body).forEach(function (pair) {
                    var ci = pair.indexOf(':');
                    if (ci !== -1) {
                        var k = parseFlowItem(pair.slice(0, ci).trim());
                        var v = parseFlowItem(pair.slice(ci + 1).trim());
                        obj[String(k)] = v;
                    }
                });
                return obj;
            }
            return parseScalar(str);
        }

        function parseFlowItem(str) {
            str = str.trim();
            if (str.charAt(0) === '[' || str.charAt(0) === '{') return parseFlow(str);
            return parseScalar(str);
        }

        // 按逗号分割流式内容（忽略引号内的逗号）
        function splitFlow(s) {
            var parts = [];
            var depth = 0, buf = '', inS = false, inD = false;
            for (var i = 0; i < s.length; i++) {
                var c = s.charAt(i);
                if (inS) { if (c === "'") inS = false; buf += c; }
                else if (inD) { if (c === '\\') i++; else if (c === '"') inD = false; buf += c; }
                else {
                    if (c === "'") inS = true;
                    else if (c === '"') inD = true;
                    else if (c === '[' || c === '{') depth++;
                    else if (c === ']' || c === '}') depth--;
                    else if (c === ',' && depth === 0) { parts.push(buf); buf = ''; continue; }
                    buf += c;
                }
            }
            if (buf.trim()) parts.push(buf);
            return parts;
        }

        function isBlockIndicator(s) {
            s = s.trim();
            return /^\|[\-+0-9]*$/.test(s) || /^>[\-+0-9]*$/.test(s);
        }

        function repeatStr(s, n) { var r = ''; for (var i = 0; i < n; i++) r += s; return r; }

        // 解析块标量（| 与 >）
        // 注意：调用前 state.idx 已指向块内容的第一行（指示符所在行已被消费）
        function parseBlockScalar(indicator, parentIndent) {
            var style = indicator.charAt(0);
            var chomp = '';
            var explicitIndent = 0;
            for (var k = 1; k < indicator.length; k++) {
                var ch = indicator.charAt(k);
                if (ch === '-' || ch === '+') chomp = ch;
                else if (/[0-9]/.test(ch)) explicitIndent = parseInt(ch, 10);
            }

            var rawLines = [];
            var blockIndent = -1;
            while (state.idx < lines.length) {
                var line = lines[state.idx];
                if (/^\s*$/.test(line)) {
                    rawLines.push({ blank: true, content: '' });
                    state.idx++;
                    continue;
                }
                var ind = indentOf(line);
                if (ind <= parentIndent) break;
                if (blockIndent === -1) {
                    blockIndent = explicitIndent > 0 ? parentIndent + explicitIndent : ind;
                }
                if (ind < blockIndent) break;
                rawLines.push({ blank: false, content: line.slice(ind), indent: ind - blockIndent });
                state.idx++;
            }

            if (rawLines.length === 0) return '';

            // 去除末尾空行用于判断
            var content;
            if (style === '|') {
                content = rawLines.map(function (l) { return l.blank ? '' : l.content; }).join('\n');
            } else {
                // folded > : 折叠换行
                content = '';
                for (var i = 0; i < rawLines.length; i++) {
                    var l = rawLines[i];
                    if (l.blank) {
                        content += '\n';
                    } else {
                        if (i > 0) {
                            var prev = rawLines[i - 1];
                            if (!prev.blank && content.length > 0 && content.charAt(content.length - 1) !== '\n') {
                                content += ' ';
                            }
                        }
                        content += l.content;
                    }
                }
            }

            // chomping 处理
            var trailingBlanks = 0;
            for (var t = rawLines.length - 1; t >= 0; t--) {
                if (rawLines[t].blank) trailingBlanks++;
                else break;
            }
            content = content.replace(/\n+$/, '');
            if (chomp === '+') {
                content += repeatStr('\n', trailingBlanks + 1);
            } else if (chomp === '-') {
                // 全部去除，不加
            } else {
                content += '\n';
            }
            return content;
        }

        // 解析一个节点（最小缩进为 minIndent）
        function parseNode(minIndent) {
            skipBlanks();
            if (state.idx >= lines.length) return null;
            var line = lines[state.idx];
            var ind = indentOf(line);
            if (ind < minIndent) return null;
            var content = line.slice(ind);

            if (content === '-' || /^-\s+/.test(content) || /^-$/.test(content)) {
                return parseSequence(ind);
            }
            if (isMappingLine(content)) {
                return parseMapping(ind);
            }
            // 标量（可能是 flow）
            state.idx++;
            if (content.charAt(0) === '[' || content.charAt(0) === '{') {
                return parseFlow(stripComment(content));
            }
            return parseScalar(content);
        }

        function isMappingLine(content) {
            // 形如 key: 或 key: value（含引号 key）
            if (/^[A-Za-z_][\w.\-]*\s*:/.test(content)) return true;
            if (/^"[^"\\]*(\\.[^"\\]*)*"\s*:/.test(content)) return true;
            if (/^'[^']*'\s*:/.test(content)) return true;
            return false;
        }

        function parseKey(content) {
            if (content.charAt(0) === '"') {
                var end = findQuoteEnd(content, '"');
                return { key: unescapeDouble(content.slice(1, end)), rest: content.slice(end + 1) };
            }
            if (content.charAt(0) === "'") {
                var e2 = findQuoteEnd(content, "'");
                return { key: content.slice(1, e2).replace(/''/g, "'"), rest: content.slice(e2 + 1) };
            }
            var m = /^([A-Za-z_][\w.\-]*)\s*(:)(.*)$/.exec(content);
            if (m) return { key: m[1], rest: m[3] };
            return null;
        }

        function findQuoteEnd(s, q) {
            var i = 1;
            while (i < s.length) {
                var c = s.charAt(i);
                if (q === '"' && c === '\\') { i += 2; continue; }
                if (c === q) return i;
                i++;
            }
            return s.length - 1;
        }

        function parseSequence(indent) {
            var arr = [];
            while (state.idx < lines.length) {
                if (/^\s*$/.test(lines[state.idx])) { state.idx++; continue; }
                if (/^\s*#/.test(lines[state.idx])) { state.idx++; continue; }
                var line = lines[state.idx];
                var ind = indentOf(line);
                if (ind < indent) break;
                if (ind > indent) break;
                var content = line.slice(ind);
                if (content !== '-' && !/^-\s+/.test(content) && !/^-$/.test(content)) break;

                var rest = content === '-' ? '' : content.replace(/^-\s+/, '');
                if (rest === '') {
                    state.idx++;
                    arr.push(parseNode(indent + 1));
                } else if (isMappingLine(rest)) {
                    // 数组项是内联对象 "- key: value"
                    var obj = {};
                    var parsed = parseKey(rest);
                    var valStr = parsed.rest.replace(/^\s*:\s*/, '');
                    state.idx++;
                    fillMappingValue(obj, parsed.key, valStr, indent + 2);
                    // 继续解析该对象后续键
                    var more = parseMapping(indent + 2);
                    if (more && typeof more === 'object' && !Array.isArray(more)) {
                        for (var mk in more) obj[mk] = more[mk];
                    }
                    arr.push(obj);
                } else {
                    state.idx++;
                    if (rest.charAt(0) === '[' || rest.charAt(0) === '{') {
                        arr.push(parseFlow(stripComment(rest)));
                    } else {
                        arr.push(parseScalar(rest));
                    }
                }
            }
            return arr;
        }

        function fillMappingValue(obj, key, valStr, childIndent) {
            valStr = valStr.trim();
            if (valStr === '' || valStr === '#') {
                obj[key] = parseNode(childIndent);
            } else if (isBlockIndicator(valStr)) {
                obj[key] = parseBlockScalar(valStr.trim(), childIndent - 1 < 0 ? 0 : childIndent - 1);
            } else if (valStr.charAt(0) === '[' || valStr.charAt(0) === '{') {
                obj[key] = parseFlow(valStr);
            } else {
                obj[key] = parseScalar(valStr);
            }
        }

        function parseMapping(indent) {
            var obj = {};
            while (state.idx < lines.length) {
                if (/^\s*$/.test(lines[state.idx])) { state.idx++; continue; }
                if (/^\s*#/.test(lines[state.idx])) { state.idx++; continue; }
                var line = lines[state.idx];
                var ind = indentOf(line);
                if (ind < indent) break;
                if (ind > indent) { state.idx++; continue; }
                var content = line.slice(ind);
                if (content === '-' || /^-\s+/.test(content)) break;
                if (!isMappingLine(content)) {
                    throw makeError('无法解析的行：' + stripComment(content).trim());
                }
                var parsed = parseKey(content);
                if (!parsed) throw makeError('无法解析键：' + stripComment(content).trim());
                var valStr = parsed.rest.replace(/^\s*:\s*/, '');
                state.idx++;
                fillMappingValue(obj, parsed.key, valStr, indent + 1);
            }
            return obj;
        }

        skipBlanks();
        if (state.idx >= lines.length) return null;
        var result = parseNode(0);
        return result;
    }

    /* ============ YAML Serializer ============ */
    function yamlNeedsQuote(s) {
        if (s === '') return true;
        if (/^(true|false|yes|no|on|off|null|~|True|False|Yes|No|NULL)$/i.test(s)) return true;
        if (/^-?\d+(\.\d+)?$/.test(s)) return true;
        // 以指示符开头
        if (/^[,\[\]{}#&*!|>'"%@`]/.test(s)) return true;
        // 以 - ? : 后接空格或结尾开头
        if (/^[?:-](\s|$)/.test(s)) return true;
        // 包含 ": "（映射指示符）、行尾 ":" 或 " #"（注释）
        if (/:\s/.test(s) || /:\s*$/.test(s) || /\s#/.test(s)) return true;
        if (/^\s|\s$/.test(s)) return true;
        if (/[\n\t]/.test(s)) return true;
        return false;
    }

    function yamlScalar(v) {
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'boolean') return v ? 'true' : 'false';
        if (typeof v === 'number') {
            if (!isFinite(v)) return v > 0 ? '.inf' : '-.inf';
            return String(v);
        }
        var s = String(v);
        if (yamlNeedsQuote(s)) return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
        return s;
    }

    function pad(indent) {
        return new Array(indent + 1).join('  ');
    }

    function sortKeys(obj) {
        var keys = Object.keys(obj);
        keys.sort();
        var sorted = {};
        keys.forEach(function (k) { sorted[k] = obj[k]; });
        return sorted;
    }

    function normalize(value, sort) {
        if (value === null || value === undefined) return value;
        if (Array.isArray(value)) {
            return value.map(function (v) { return normalize(v, sort); });
        }
        if (typeof value === 'object') {
            var out = {};
            var keys = Object.keys(value);
            if (sort) keys.sort();
            keys.forEach(function (k) { out[k] = normalize(value[k], sort); });
            return out;
        }
        return value;
    }

    function isEmptyContainer(v) {
        if (v === null || v === undefined) return false;
        if (Array.isArray(v)) return v.length === 0;
        if (typeof v === 'object') return Object.keys(v).length === 0;
        return false;
    }

    function toYamlLines(value, indent, out) {
        if (value === null || value === undefined) {
            out.push(pad(indent) + 'null');
            return;
        }
        if (Array.isArray(value)) {
            if (value.length === 0) { out.push(pad(indent) + '[]'); return; }
            for (var i = 0; i < value.length; i++) {
                var item = value[i];
                if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                    var keys = Object.keys(item);
                    if (keys.length === 0) {
                        out.push(pad(indent) + '- {}');
                    } else {
                        out.push(pad(indent) + '- ' + keys[0] + ': ' + (isEmptyContainer(item[keys[0]]) ? (Array.isArray(item[keys[0]]) ? '[]' : '{}') : yamlScalar(item[keys[0]])));
                        for (var k = 1; k < keys.length; k++) {
                            var v = item[keys[k]];
                            if (v !== null && typeof v === 'object') {
                                if (isEmptyContainer(v)) {
                                    out.push(pad(indent + 1) + keys[k] + ': ' + (Array.isArray(v) ? '[]' : '{}'));
                                } else {
                                    out.push(pad(indent + 1) + keys[k] + ':');
                                    toYamlLines(v, indent + 2, out);
                                }
                            } else {
                                out.push(pad(indent + 1) + keys[k] + ': ' + yamlScalar(v));
                            }
                        }
                    }
                } else if (Array.isArray(item)) {
                    if (item.length === 0) {
                        out.push(pad(indent) + '- []');
                    } else {
                        out.push(pad(indent) + '-');
                        toYamlLines(item, indent + 1, out);
                    }
                } else {
                    out.push(pad(indent) + '- ' + yamlScalar(item));
                }
            }
            return;
        }
        if (typeof value === 'object') {
            var ks = Object.keys(value);
            if (ks.length === 0) { out.push(pad(indent) + '{}'); return; }
            for (var j = 0; j < ks.length; j++) {
                var vv = value[ks[j]];
                if (vv !== null && typeof vv === 'object') {
                    if (isEmptyContainer(vv)) {
                        out.push(pad(indent) + ks[j] + ': ' + (Array.isArray(vv) ? '[]' : '{}'));
                    } else {
                        out.push(pad(indent) + ks[j] + ':');
                        toYamlLines(vv, indent + 1, out);
                    }
                } else {
                    out.push(pad(indent) + ks[j] + ': ' + yamlScalar(vv));
                }
            }
            return;
        }
        out.push(pad(indent) + yamlScalar(value));
    }

    function toYaml(value, sort) {
        var normalized = normalize(value, sort);
        var out = [];
        toYamlLines(normalized, 0, out);
        return out.join('\n') + '\n';
    }

    /* ============ Compress ============ */
    function compressYaml(src) {
        var lines = src.replace(/\r\n/g, '\n').split('\n');
        var kept = [];
        lines.forEach(function (line) {
            // 去除整行注释
            if (/^\s*#/.test(line)) return;
            // 去除纯空行
            if (/^\s*$/.test(line)) return;
            // 去除行尾注释（简化处理，不区分引号内）
            var stripped = stripInlineCommentSafe(line);
            if (stripped.trim()) kept.push(stripped.replace(/\s+$/, ''));
        });
        if (kept.length === 0) throw new Error('压缩后为空，请检查输入');
        return kept.join('\n') + '\n';
    }

    function stripInlineCommentSafe(line) {
        var inS = false, inD = false;
        for (var i = 0; i < line.length; i++) {
            var c = line.charAt(i);
            if (inS) { if (c === "'") inS = false; }
            else if (inD) { if (c === '\\') i++; else if (c === '"') inD = false; }
            else {
                if (c === "'") inS = true;
                else if (c === '"') inD = true;
                else if (c === '#' && i > 0 && /\s/.test(line.charAt(i - 1))) {
                    return line.slice(0, i);
                }
            }
        }
        return line;
    }

    /* ============ YAML syntax highlight ============ */
    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function findCommentIndex(line) {
        var inS = false, inD = false;
        for (var i = 0; i < line.length; i++) {
            var c = line.charAt(i);
            if (inS) { if (c === "'") inS = false; }
            else if (inD) { if (c === '\\') i++; else if (c === '"') inD = false; }
            else {
                if (c === "'") inS = true;
                else if (c === '"') inD = true;
                else if (c === '#' && (i === 0 || /\s/.test(line.charAt(i - 1)))) return i;
            }
        }
        return -1;
    }

    function highlightValue(v) {
        if (!v) return '';
        return v.replace(
            /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\b(?:true|false|yes|no|on|off)\b)|(\b(?:null|~)\b)/g,
            function (m, str, num, bool, nul) {
                if (str) return '<span class="yaml-string">' + str + '</span>';
                if (num) return '<span class="yaml-number">' + num + '</span>';
                if (bool) return '<span class="yaml-bool">' + bool + '</span>';
                if (nul) return '<span class="yaml-null">' + nul + '</span>';
                return m;
            }
        );
    }

    function highlightYamlLine(line) {
        var full = /^(\s*)(#.*)$/.exec(line);
        if (full) return full[1] + '<span class="yaml-comment">' + escapeHtml(full[2]) + '</span>';
        var main = line, commentHtml = '';
        var ci = findCommentIndex(line);
        if (ci !== -1) {
            commentHtml = '<span class="yaml-comment">' + escapeHtml(line.slice(ci)) + '</span>';
            main = line.slice(0, ci);
        }
        var escaped = escapeHtml(main);
        // - key: value
        var m1 = /^(\s*)(-)(\s+)([A-Za-z_][\w.\-]*)(:)(\s*)(.*)$/.exec(escaped);
        if (m1) {
            return m1[1] + '<span class="yaml-dash">' + m1[2] + '</span>' + m1[3] +
                '<span class="yaml-key">' + m1[4] + '</span>' + m1[5] + m1[6] + highlightValue(m1[7]) + commentHtml;
        }
        // key: value
        var m2 = /^(\s*)([A-Za-z_][\w.\-]*)(:)(\s*)(.*)$/.exec(escaped);
        if (m2) {
            return m2[1] + '<span class="yaml-key">' + m2[2] + '</span>' + m2[3] + m2[4] + highlightValue(m2[5]) + commentHtml;
        }
        // - value
        var m3 = /^(\s*)(-)(\s*)(.*)$/.exec(escaped);
        if (m3) {
            return m3[1] + '<span class="yaml-dash">' + m3[2] + '</span>' + m3[3] + highlightValue(m3[4]) + commentHtml;
        }
        return escaped + commentHtml;
    }

    function highlightYamlText(yamlStr) {
        return yamlStr.split('\n').map(function (line) {
            return highlightYamlLine(line);
        }).join('\n');
    }

    /* ============ Tree renderer ============ */
    function typeOfClass(v) {
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'string') return 'string';
        if (typeof v === 'number') return 'number';
        if (typeof v === 'boolean') return 'boolean';
        return 'object';
    }

    function formatScalarForTree(v) {
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'string') return JSON.stringify(v);
        if (typeof v === 'boolean') return v ? 'true' : 'false';
        return String(v);
    }

    function renderTree(obj) {
        var root = Tools.el('div', { class: 'tree' });
        root.appendChild(renderNode(null, obj));
        return root;
    }

    function renderNode(key, value) {
        var node = Tools.el('div', { class: 'tree-node' });
        var header = Tools.el('div', { class: 'tree-header' });
        var isContainer = value !== null && typeof value === 'object';

        var toggle;
        if (isContainer) {
            toggle = Tools.el('span', { class: 'tree-toggle', text: '▼', title: '点击折叠/展开' });
        } else {
            toggle = Tools.el('span', { class: 'tree-toggle placeholder', text: '·' });
        }
        header.appendChild(toggle);

        if (key !== null) {
            var keyEl;
            if (/^\d+$/.test(String(key))) {
                keyEl = Tools.el('span', { class: 'tree-idx', text: '[' + key + ']:' });
            } else {
                keyEl = Tools.el('span', { class: 'tree-key', text: key + ':' });
            }
            header.appendChild(keyEl);
        }

        if (isContainer) {
            var isArray = Array.isArray(value);
            var size = isArray ? value.length : Object.keys(value).length;
            header.appendChild(Tools.el('span', { class: 'tree-type', text: isArray ? '(' + size + ' 项)' : '(' + size + ' 键)' }));
            if (size === 0) {
                header.appendChild(Tools.el('span', { class: 'tree-value ' + (isArray ? 'null' : 'null'), text: isArray ? '[]' : '{}' }));
            }
            node.appendChild(header);

            var children = Tools.el('div', { class: 'tree-children' });
            if (isArray) {
                value.forEach(function (v, i) {
                    children.appendChild(renderNode(String(i), v));
                });
            } else {
                Object.keys(value).forEach(function (k) {
                    children.appendChild(renderNode(k, value[k]));
                });
            }
            node.appendChild(children);

            if (size > 0) {
                toggle.addEventListener('click', function () {
                    node.classList.toggle('collapsed');
                    toggle.textContent = node.classList.contains('collapsed') ? '▶' : '▼';
                });
            }
        } else {
            var tc = typeOfClass(value);
            header.appendChild(Tools.el('span', { class: 'tree-value ' + tc, text: formatScalarForTree(value) }));
            node.appendChild(header);
        }

        return node;
    }

    /* ============ UI ============ */
    var SAMPLE = '# 应用配置示例\n' +
        'server:\n' +
        '  host: 0.0.0.0\n' +
        '  port: 8080\n' +
        '  workers: 4\n' +
        '  debug: true\n' +
        '\n' +
        'database:\n' +
        '  primary:\n' +
        '    host: db.example.com\n' +
        '    port: 5432\n' +
        '    name: myapp\n' +
        '  replica:\n' +
        '    - host: replica1.example.com\n' +
        '      port: 5432\n' +
        '    - host: replica2.example.com\n' +
        '      port: 5432\n' +
        '\n' +
        'cache:\n' +
        '  engines:\n' +
        '    - redis\n' +
        '    - memcached\n' +
        '  ttl: 3600\n' +
        '\n' +
        'features:\n' +
        '  auth: true\n' +
        '  rate_limit: false\n' +
        '\n' +
        'description: |\n' +
        '  这是一个多行字符串示例。\n' +
        '  第二行内容会保留换行。\n' +
        '\n' +
        'summary: >\n' +
        '  折叠的多行字符串，\n' +
        '  换行会被替换为空格。\n';

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var inputEl = $('input');
        var outputYamlEl = $('output-yaml');
        var outputJsonEl = $('output-json');
        var outputTreeEl = $('output-tree');
        var treeRootEl = $('tree-root');
        var tabGroup = $('tab-group');
        var viewMeta = $('view-meta');
        var sortKeysEl = $('sort-keys');

        var currentView = 'yaml';
        var lastParsed = null;
        var lastYaml = '';
        var lastJson = '';

        function setView(view) {
            currentView = view;
            Tools.$$('.tab-btn', tabGroup).forEach(function (b) {
                b.classList.toggle('active', b.getAttribute('data-view') === view);
            });
            outputYamlEl.style.display = view === 'yaml' ? '' : 'none';
            outputJsonEl.style.display = view === 'json' ? '' : 'none';
            outputTreeEl.style.display = view === 'tree' ? '' : 'none';

            if (view === 'yaml') {
                viewMeta.textContent = lastYaml ? (lastYaml.split('\n').length + ' 行') : '';
            } else if (view === 'json') {
                viewMeta.textContent = lastJson ? (lastJson.split('\n').length + ' 行') : '';
            } else {
                viewMeta.textContent = lastParsed ? '已渲染树形' : '';
            }
        }

        function getSort() { return sortKeysEl.checked; }

        function clearOutputs() {
            outputYamlEl.textContent = '';
            outputYamlEl.classList.add('empty');
            outputJsonEl.textContent = '';
            outputJsonEl.classList.add('empty');
            treeRootEl.innerHTML = '';
            lastParsed = null;
            lastYaml = '';
            lastJson = '';
            viewMeta.textContent = '';
        }

        function doFormat() {
            Tools.clearBanner('banner');
            var raw = inputEl.value;
            if (!raw || !raw.trim()) {
                clearOutputs();
                Tools.showBanner('banner', 'warn', '请输入 YAML 文本');
                return;
            }
            try {
                var parsed = parseYaml(raw);
                lastParsed = parsed;
                var yaml = toYaml(parsed, getSort());
                lastYaml = yaml;
                outputYamlEl.innerHTML = highlightYamlText(yaml);
                outputYamlEl.classList.remove('empty');
                setView(currentView === 'tree' ? 'yaml' : currentView);
                Tools.showBanner('banner', 'success', '✓ YAML 格式化成功');
            } catch (err) {
                clearOutputs();
                Tools.showBanner('banner', 'error', '✗ ' + (err && err.message ? err.message : String(err)));
            }
        }

        function doToJson() {
            Tools.clearBanner('banner');
            var raw = inputEl.value;
            if (!raw || !raw.trim()) {
                clearOutputs();
                Tools.showBanner('banner', 'warn', '请输入 YAML 文本');
                return;
            }
            try {
                var parsed = parseYaml(raw);
                lastParsed = parsed;
                // 转 JSON 时也应用排序
                var normalized = normalize(parsed, getSort());
                var json = JSON.stringify(normalized, null, 2);
                lastJson = json;
                outputJsonEl.innerHTML = Tools.highlightJson(json);
                outputJsonEl.classList.remove('empty');
                setView('json');
                Tools.showBanner('banner', 'success', '✓ 已转换为 JSON');
            } catch (err) {
                clearOutputs();
                Tools.showBanner('banner', 'error', '✗ ' + (err && err.message ? err.message : String(err)));
            }
        }

        function doCompress() {
            Tools.clearBanner('banner');
            var raw = inputEl.value;
            if (!raw || !raw.trim()) {
                clearOutputs();
                Tools.showBanner('banner', 'warn', '请输入 YAML 文本');
                return;
            }
            try {
                var compressed = compressYaml(raw);
                lastYaml = compressed;
                outputYamlEl.innerHTML = highlightYamlText(compressed);
                outputYamlEl.classList.remove('empty');
                setView('yaml');
                Tools.showBanner('banner', 'success', '✓ 已压缩（去除空行与注释）');
            } catch (err) {
                Tools.showBanner('banner', 'error', '✗ ' + (err && err.message ? err.message : String(err)));
            }
        }

        function doValidate() {
            Tools.clearBanner('banner');
            var raw = inputEl.value;
            if (!raw || !raw.trim()) {
                Tools.showBanner('banner', 'warn', '请输入 YAML 文本');
                return;
            }
            try {
                var parsed = parseYaml(raw);
                var count = countNodes(parsed);
                Tools.showBanner('banner', 'success', '✓ YAML 语法正确（共 ' + count + ' 个节点）');
            } catch (err) {
                Tools.showBanner('banner', 'error', '✗ 语法错误：' + (err && err.message ? err.message : String(err)));
            }
        }

        function countNodes(v) {
            if (v === null || v === undefined) return 0;
            if (Array.isArray(v)) {
                var n = v.length;
                v.forEach(function (i) { n += countNodes(i); });
                return n;
            }
            if (typeof v === 'object') {
                var m = 0;
                Object.keys(v).forEach(function (k) { m += countNodes(v[k]); });
                return m + Object.keys(v).length;
            }
            return 1;
        }

        function renderTreeView() {
            treeRootEl.innerHTML = '';
            if (lastParsed === null || lastParsed === undefined) {
                treeRootEl.appendChild(Tools.el('div', { class: 'tool-hint', text: '请先格式化或转换 YAML 以生成树形结构' }));
                viewMeta.textContent = '';
                return;
            }
            var normalized = normalize(lastParsed, getSort());
            treeRootEl.appendChild(renderTree(normalized));
            viewMeta.textContent = '已渲染树形';
        }

        function clearAll() {
            inputEl.value = '';
            clearOutputs();
            Tools.clearBanner('banner');
            inputEl.focus();
        }

        function loadSample() {
            inputEl.value = SAMPLE;
            Tools.clearBanner('banner');
            doFormat();
        }

        function copyResult(btn) {
            var text = '';
            if (currentView === 'yaml') text = lastYaml;
            else if (currentView === 'json') text = lastJson;
            if (!text) {
                Tools.showBanner('banner', 'warn', '没有可复制的结果');
                return;
            }
            Tools.copyText(text, btn, '已复制');
        }

        function expandAll() {
            Tools.$$('.tree-node.collapsed', treeRootEl).forEach(function (n) {
                n.classList.remove('collapsed');
                var t = n.querySelector(':scope > .tree-header > .tree-toggle');
                if (t) t.textContent = '▼';
            });
        }

        function collapseAll() {
            Tools.$$('.tree-node', treeRootEl).forEach(function (n) {
                var children = n.querySelector(':scope > .tree-children');
                if (children && children.children.length > 0) {
                    n.classList.add('collapsed');
                    var t = n.querySelector(':scope > .tree-header > .tree-toggle');
                    if (t) t.textContent = '▶';
                }
            });
        }

        tabGroup.addEventListener('click', function (e) {
            var btn = e.target.closest('.tab-btn');
            if (!btn) return;
            var view = btn.getAttribute('data-view');
            if (view === 'tree' && lastParsed === null) {
                // 若尚未解析，先尝试用当前输入解析
                var raw = inputEl.value;
                if (raw && raw.trim()) {
                    try {
                        lastParsed = parseYaml(raw);
                    } catch (err) {
                        Tools.showBanner('banner', 'error', '✗ ' + (err && err.message ? err.message : String(err)));
                        return;
                    }
                }
            }
            setView(view);
            if (view === 'tree') renderTreeView();
        });

        $('btn-format').addEventListener('click', doFormat);
        $('btn-to-json').addEventListener('click', doToJson);
        $('btn-compress').addEventListener('click', doCompress);
        $('btn-validate').addEventListener('click', doValidate);
        $('btn-sample').addEventListener('click', loadSample);
        $('btn-clear').addEventListener('click', clearAll);
        $('btn-copy').addEventListener('click', function () { copyResult(this); });
        $('btn-expand-all').addEventListener('click', expandAll);
        $('btn-collapse-all').addEventListener('click', collapseAll);
        sortKeysEl.addEventListener('change', function () {
            if (lastParsed !== null && (currentView === 'yaml' || currentView === 'json' || currentView === 'tree')) {
                // 重新生成当前视图
                if (currentView === 'yaml' && lastYaml) {
                    var yaml = toYaml(lastParsed, getSort());
                    lastYaml = yaml;
                    outputYamlEl.innerHTML = highlightYamlText(yaml);
                } else if (currentView === 'json' && lastJson) {
                    doToJson();
                } else if (currentView === 'tree') {
                    renderTreeView();
                }
            }
        });

        setView('yaml');
    });
})();
