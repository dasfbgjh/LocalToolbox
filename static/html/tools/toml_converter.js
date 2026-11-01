/* ===== TOML Converter =====
 * 合并 4 种转换：TOML↔JSON、TOML↔YAML
 * 内置简化版 TOML 解析器与序列化器（不依赖外部库）
 */
(function () {
    'use strict';

    /* ============ TOML Parser ============ */
    function parseToml(src) {
        src = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        var pos = 0;
        var len = src.length;

        function error(msg) {
            var line = 1;
            for (var i = 0; i < pos && i < len; i++) {
                if (src.charAt(i) === '\n') line++;
            }
            throw new Error('TOML解析错误（第' + line + '行）：' + msg);
        }

        function peek(off) {
            off = off || 0;
            var idx = pos + off;
            return idx < len ? src.charAt(idx) : '';
        }

        function startsWith(s) {
            return src.substr(pos, s.length) === s;
        }

        function skipInlineWs() {
            while (pos < len) {
                var c = src.charAt(pos);
                if (c === ' ' || c === '\t') pos++;
                else break;
            }
        }

        function skipWsAndComments() {
            while (pos < len) {
                var c = src.charAt(pos);
                if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
                    pos++;
                } else if (c === '#') {
                    while (pos < len && src.charAt(pos) !== '\n') pos++;
                } else {
                    break;
                }
            }
        }

        function skipToLineEnd() {
            skipInlineWs();
            if (peek() === '#') {
                while (pos < len && src.charAt(pos) !== '\n') pos++;
            }
            if (peek() === '\r') pos++;
            if (peek() === '\n') pos++;
        }

        function parseBareKey() {
            var key = '';
            while (pos < len) {
                var ch = src.charAt(pos);
                if (/[A-Za-z0-9_-]/.test(ch)) {
                    key += ch;
                    pos++;
                } else break;
            }
            if (!key) error('期望键名');
            return key;
        }

        function parseKey() {
            skipInlineWs();
            var c = peek();
            if (c === '"') return parseBasicString();
            if (c === '\'') return parseLiteralString();
            return parseBareKey();
        }

        function parseDottedKey() {
            var keys = [parseKey()];
            while (true) {
                skipInlineWs();
                if (peek() === '.') {
                    pos++;
                    keys.push(parseKey());
                } else break;
            }
            return keys;
        }

        function parseEscape() {
            var c = src.charAt(pos);
            pos++;
            switch (c) {
                case 'b': return '\b';
                case 't': return '\t';
                case 'n': return '\n';
                case 'f': return '\f';
                case 'r': return '\r';
                case '"': return '"';
                case '\\': return '\\';
                case 'u':
                    {
                        var hex = src.substr(pos, 4);
                        pos += 4;
                        return String.fromCharCode(parseInt(hex, 16));
                    }
                case 'U':
                    {
                        var hex2 = src.substr(pos, 8);
                        pos += 8;
                        var cp = parseInt(hex2, 16);
                        // surrogate pair for code points > 0xffff
                        if (cp > 0xffff) {
                            cp -= 0x10000;
                            return String.fromCharCode(0xd800 + (cp >> 10)) +
                                String.fromCharCode(0xdc00 + (cp & 0x3ff));
                        }
                        return String.fromCharCode(cp);
                    }
                default:
                    error('无效的转义字符：\\' + c);
            }
        }

        function parseBasicString() {
            if (startsWith('"""')) return parseMultilineBasicString();
            pos++; // skip "
            var result = '';
            while (pos < len) {
                var c = src.charAt(pos);
                if (c === '"') { pos++; return result; }
                if (c === '\n') error('基本字符串不能换行');
                if (c === '\\') {
                    pos++;
                    result += parseEscape();
                } else {
                    result += c;
                    pos++;
                }
            }
            error('字符串未闭合');
        }

        function parseMultilineBasicString() {
            pos += 3; // skip """
            if (peek() === '\r' && peek(1) === '\n') pos += 2;
            else if (peek() === '\n') pos++;
            var result = '';
            while (pos < len) {
                if (startsWith('"""')) {
                    pos += 3;
                    if (peek() === '"') { result += '"'; pos++; if (peek() === '"') { result += '"'; pos++; } }
                    return result;
                }
                var c = src.charAt(pos);
                if (c === '\\' && (peek(1) === '\n' || peek(1) === '\r')) {
                    pos++;
                    while (pos < len && /[ \t\r\n]/.test(src.charAt(pos))) pos++;
                    continue;
                }
                if (c === '\\') {
                    pos++;
                    result += parseEscape();
                } else {
                    result += c;
                    pos++;
                }
            }
            error('多行字符串未闭合');
        }

        function parseLiteralString() {
            if (startsWith("'''")) return parseMultilineLiteralString();
            pos++; // skip '
            var result = '';
            while (pos < len) {
                var c = src.charAt(pos);
                if (c === '\'') { pos++; return result; }
                if (c === '\n') error('字面字符串不能换行');
                result += c;
                pos++;
            }
            error('字符串未闭合');
        }

        function parseMultilineLiteralString() {
            pos += 3; // skip '''
            if (peek() === '\r' && peek(1) === '\n') pos += 2;
            else if (peek() === '\n') pos++;
            var result = '';
            while (pos < len) {
                if (startsWith("'''")) {
                    pos += 3;
                    if (peek() === '\'') { result += '\''; pos++; if (peek() === '\'') { result += '\''; pos++; } }
                    return result;
                }
                result += src.charAt(pos);
                pos++;
            }
            error('多行字符串未闭合');
        }

        var DATETIME_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;
        var TIME_RE = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/;
        var DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

        function parseScalar() {
            var raw = '';
            while (pos < len) {
                var c = src.charAt(pos);
                if (c === '\n' || c === '\r' || c === ',' || c === ']' || c === '}' || c === '#') break;
                raw += c;
                pos++;
            }
            raw = raw.trim();
            if (!raw) error('期望值');

            if (raw === 'true') return true;
            if (raw === 'false') return false;

            // datetime / date / time
            if (DATETIME_RE.test(raw) || TIME_RE.test(raw)) return raw;

            var cleaned = raw.replace(/_/g, '');

            // hex / octal / binary
            if (/^[+-]?0x[0-9a-fA-F]+$/.test(cleaned)) return parseInt(cleaned, 16);
            if (/^[+-]?0o[0-7]+$/.test(cleaned)) return parseInt(cleaned.replace(/^([+-]?)0o/, '$1'), 8);
            if (/^[+-]?0b[01]+$/.test(cleaned)) return parseInt(cleaned.replace(/^([+-]?)0b/, '$1'), 2);

            // integer
            if (/^[+-]?\d+$/.test(cleaned)) {
                var n = parseInt(cleaned, 10);
                if (!isNaN(n)) return n;
            }

            // float
            if (/^[+-]?(\d+\.\d+([eE][+-]?\d+)?|\d+[eE][+-]?\d+|\d+\.\d*[eE][+-]?\d+)$/.test(cleaned)) {
                var f = parseFloat(cleaned);
                if (!isNaN(f)) return f;
            }

            // special floats
            if (/^[+-]?(inf|nan)$/i.test(raw)) return raw;

            error('无法解析的值：' + raw);
        }

        function parseValue() {
            skipInlineWs();
            var c = peek();
            if (c === '"') return parseBasicString();
            if (c === '\'') return parseLiteralString();
            if (c === '[') return parseArray();
            if (c === '{') return parseInlineTable();
            return parseScalar();
        }

        function parseArray() {
            pos++; // skip [
            var arr = [];
            while (true) {
                skipWsAndComments();
                if (peek() === ']') { pos++; return arr; }
                if (pos >= len) error('数组未闭合');
                var val = parseValue();
                arr.push(val);
                skipWsAndComments();
                if (peek() === ',') { pos++; continue; }
                if (peek() === ']') { pos++; return arr; }
                error('数组中期望逗号或右括号');
            }
        }

        function assignDotted(root, keys, value) {
            var cur = root;
            for (var i = 0; i < keys.length - 1; i++) {
                var k = keys[i];
                if (cur[k] === undefined || cur[k] === null || typeof cur[k] !== 'object') {
                    cur[k] = {};
                }
                cur = cur[k];
            }
            cur[keys[keys.length - 1]] = value;
        }

        function parseInlineTable() {
            pos++; // skip {
            var obj = {};
            skipInlineWs();
            if (peek() === '}') { pos++; return obj; }
            while (true) {
                skipInlineWs();
                var keys = parseDottedKey();
                skipInlineWs();
                if (peek() !== '=') error('内联表期望 =');
                pos++;
                var val = parseValue();
                assignDotted(obj, keys, val);
                skipInlineWs();
                if (peek() === ',') { pos++; continue; }
                if (peek() === '}') { pos++; return obj; }
                error('内联表期望逗号或右花括号');
            }
        }

        function parseKeyValue(table) {
            var keys = parseDottedKey();
            skipInlineWs();
            if (peek() !== '=') error('期望 =');
            pos++;
            var val = parseValue();
            assignDotted(table, keys, val);
            skipToLineEnd();
        }

        function parseTableHeader(root) {
            if (startsWith('[[')) {
                pos += 2;
                skipInlineWs();
                var aKeys = parseDottedKey();
                skipInlineWs();
                if (!startsWith(']]')) error('期望 ]]');
                pos += 2;
                skipToLineEnd();
                var cur = root;
                for (var i = 0; i < aKeys.length - 1; i++) {
                    var k = aKeys[i];
                    if (cur[k] === undefined || cur[k] === null) cur[k] = [];
                    if (!Array.isArray(cur[k])) error('键冲突：' + k);
                    var arr = cur[k];
                    if (arr.length === 0 || typeof arr[arr.length - 1] !== 'object' || Array.isArray(arr[arr.length - 1])) {
                        var ni = {};
                        arr.push(ni);
                    }
                    cur = arr[arr.length - 1];
                }
                var lastKey = aKeys[aKeys.length - 1];
                if (cur[lastKey] === undefined) cur[lastKey] = [];
                if (!Array.isArray(cur[lastKey])) error('键冲突：' + lastKey);
                var item = {};
                cur[lastKey].push(item);
                return item;
            } else {
                pos++; // skip [
                skipInlineWs();
                var keys = parseDottedKey();
                skipInlineWs();
                if (peek() !== ']') error('期望 ]');
                pos++;
                skipToLineEnd();
                var cur2 = root;
                for (var j = 0; j < keys.length; j++) {
                    var kj = keys[j];
                    if (cur2[kj] === undefined || cur2[kj] === null || typeof cur2[kj] !== 'object') {
                        cur2[kj] = {};
                    } else if (Array.isArray(cur2[kj])) {
                        // descend into last element of array of tables
                        var a = cur2[kj];
                        cur2 = a[a.length - 1];
                        continue;
                    }
                    cur2 = cur2[kj];
                }
                return cur2;
            }
        }

        var root = {};
        var current = root;
        while (true) {
            skipWsAndComments();
            if (pos >= len) break;
            if (peek() === '[') {
                current = parseTableHeader(root);
            } else {
                parseKeyValue(current);
            }
        }
        return root;
    }

    /* ============ TOML Serializer ============ */
    function toToml(obj) {
        if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
            throw new Error('TOML根节点必须是对象');
        }

        var lines = [];

        function formatKey(k) {
            if (/^[A-Za-z0-9_-]+$/.test(k)) return k;
            return '"' + k.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        }

        function formatString(s) {
            var out = '"';
            for (var i = 0; i < s.length; i++) {
                var c = s.charAt(i);
                switch (c) {
                    case '"': out += '\\"'; break;
                    case '\\': out += '\\\\'; break;
                    case '\n': out += '\\n'; break;
                    case '\r': out += '\\r'; break;
                    case '\t': out += '\\t'; break;
                    case '\b': out += '\\b'; break;
                    case '\f': out += '\\f'; break;
                    default:
                        if (c.charCodeAt(0) < 0x20) {
                            out += '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
                        } else {
                            out += c;
                        }
                }
            }
            return out + '"';
        }

        function isDatetimeLike(s) {
            return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/.test(s)
                || /^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s);
        }

        function formatScalar(v) {
            if (v === null || v === undefined) throw new Error('TOML不支持null值');
            if (typeof v === 'boolean') return v ? 'true' : 'false';
            if (typeof v === 'number') {
                if (isNaN(v)) return 'nan';
                if (!isFinite(v)) return v > 0 ? 'inf' : '-inf';
                return String(v);
            }
            if (typeof v === 'string') {
                if (isDatetimeLike(v)) return v;
                return formatString(v);
            }
            throw new Error('不支持的标量类型：' + typeof v);
        }

        function isTable(v) {
            return v !== null && typeof v === 'object' && !Array.isArray(v);
        }

        function isArrayOfTables(arr) {
            if (!Array.isArray(arr) || arr.length === 0) return false;
            return arr.every(function (item) { return isTable(item); });
        }

        function formatInlineArray(arr) {
            if (arr.length === 0) return '[]';
            var parts = arr.map(function (v) {
                if (v === null || v === undefined) throw new Error('TOML数组不支持null');
                if (Array.isArray(v)) return formatInlineArray(v);
                if (isTable(v)) return formatInlineTable(v);
                return formatScalar(v);
            });
            return '[' + parts.join(', ') + ']';
        }

        function formatInlineTable(obj) {
            var keys = Object.keys(obj);
            if (keys.length === 0) return '{}';
            var parts = keys.map(function (k) {
                var v = obj[k];
                if (Array.isArray(v)) return formatKey(k) + ' = ' + formatInlineArray(v);
                if (isTable(v)) return formatKey(k) + ' = ' + formatInlineTable(v);
                return formatKey(k) + ' = ' + formatScalar(v);
            });
            return '{ ' + parts.join(', ') + ' }';
        }

        function classify(table) {
            var scalars = [];
            var tables = [];
            var aots = [];
            Object.keys(table).forEach(function (k) {
                var v = table[k];
                if (isTable(v)) tables.push(k);
                else if (isArrayOfTables(v)) aots.push(k);
                else if (v === null || v === undefined) throw new Error('TOML不支持null值（键：' + k + '）');
                else scalars.push(k);
            });
            return { scalars: scalars, tables: tables, aots: aots };
        }

        function emitScalars(table, scalars) {
            scalars.forEach(function (k) {
                var v = table[k];
                if (Array.isArray(v)) lines.push(formatKey(k) + ' = ' + formatInlineArray(v));
                else if (isTable(v)) lines.push(formatKey(k) + ' = ' + formatInlineTable(v));
                else lines.push(formatKey(k) + ' = ' + formatScalar(v));
            });
        }

        function pushBlankIfNeeded() {
            if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
        }

        function emitTable(path, table) {
            var c = classify(table);
            if (path.length > 0) {
                pushBlankIfNeeded();
                lines.push('[' + path.map(formatKey).join('.') + ']');
            }
            emitScalars(table, c.scalars);
            c.tables.forEach(function (k) { emitTable(path.concat(k), table[k]); });
            c.aots.forEach(function (k) {
                table[k].forEach(function (item) { emitAot(path.concat(k), item); });
            });
        }

        function emitAot(path, table) {
            pushBlankIfNeeded();
            lines.push('[[' + path.map(formatKey).join('.') + ']]');
            var c = classify(table);
            emitScalars(table, c.scalars);
            c.tables.forEach(function (k) { emitTable(path.concat(k), table[k]); });
            c.aots.forEach(function (k) {
                table[k].forEach(function (item) { emitAot(path.concat(k), item); });
            });
        }

        emitTable([], obj);

        var result = lines.join('\n');
        result = result.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
        return result + '\n';
    }

    /* ============ YAML (basic) ============ */
    function yamlNeedsQuote(s) {
        if (s === '') return true;
        if (/^\s|\s$/.test(s)) return true;
        if (/[:#\-?,&*!|>'"%@`{}[\]]/.test(s)) return true;
        if (/^-?\d+(\.\d+)?$/.test(s)) return true;
        if (s === 'true' || s === 'false' || s === 'null' || s === 'yes' || s === 'no' || s === '~') return true;
        return false;
    }

    function yamlScalar(v) {
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'boolean') return v ? 'true' : 'false';
        if (typeof v === 'number') return String(v);
        var s = String(v);
        if (yamlNeedsQuote(s)) return "'" + s.replace(/'/g, "''") + "'";
        return s;
    }

    function toYaml(value, indent) {
        indent = indent || 0;
        var pad = new Array(indent + 1).join('  ');
        if (value === null || value === undefined) return pad + 'null';
        if (Array.isArray(value)) {
            if (value.length === 0) return pad + '[]';
            var lines = value.map(function (item) {
                if (item !== null && typeof item === 'object') {
                    var sub = toYaml(item, indent + 1);
                    return pad + '- ' + sub.replace(/^\s+/, '');
                }
                return pad + '- ' + yamlScalar(item);
            });
            return lines.join('\n');
        }
        if (typeof value === 'object') {
            var keys = Object.keys(value);
            if (keys.length === 0) return pad + '{}';
            var out = keys.map(function (k) {
                var v = value[k];
                if (v !== null && typeof v === 'object') {
                    return pad + k + ':\n' + toYaml(v, indent + 1);
                }
                return pad + k + ': ' + yamlScalar(v);
            });
            return out.join('\n');
        }
        return pad + yamlScalar(value);
    }

    function parseYaml(src) {
        var lines = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        var idx = 0;

        function getIndent(line) {
            var m = /^(\s*)/.exec(line);
            return m ? m[1].length : 0;
        }

        function parseScalar(s) {
            s = s.trim();
            if (s === '' ) return '';
            if (s === 'null' || s === '~' || s === 'Null' || s === 'NULL') return null;
            if (s === 'true' || s === 'True' || s === 'TRUE' || s === 'yes') return true;
            if (s === 'false' || s === 'False' || s === 'FALSE' || s === 'no') return false;
            if (/^-?\d+$/.test(s)) return parseInt(s, 10);
            if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
            if (s.length >= 2 && s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") {
                return s.slice(1, -1).replace(/''/g, "'");
            }
            if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
                return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            }
            var hashIdx = s.indexOf(' #');
            if (hashIdx !== -1) s = s.slice(0, hashIdx).trim();
            return s;
        }

        function skipBlanks() {
            while (idx < lines.length && (/^\s*$/.test(lines[idx]) || /^\s*#/.test(lines[idx]))) idx++;
        }

        function parseDeeper(expectedIndent) {
            var saved = idx;
            skipBlanks();
            if (idx >= lines.length) { idx = saved; return ''; }
            if (getIndent(lines[idx]) < expectedIndent) { idx = saved; return ''; }
            return parseValue(getIndent(lines[idx]));
        }

        function parseValue(indent) {
            var result = null;
            while (idx < lines.length) {
                var raw = lines[idx];
                if (/^\s*$/.test(raw) || /^\s*#/.test(raw)) { idx++; continue; }
                var curIndent = getIndent(raw);
                if (curIndent < indent) break;
                if (curIndent > indent) { idx++; continue; }
                var content = raw.slice(curIndent);

                if (content.charAt(0) === '-') {
                    if (result === null) result = [];
                    if (!Array.isArray(result)) throw new Error('YAML解析失败：混合类型');
                    var rest = content.slice(1).replace(/^\s+/, '');
                    if (rest === '') {
                        idx++;
                        result.push(parseValue(indent + 2));
                    } else {
                        var km = /^([^:]+):\s*(.*)$/.exec(rest);
                        if (km) {
                            var obj = {};
                            var val = km[2];
                            idx++;
                            if (val === '' || val === '#') obj[km[1].trim()] = parseDeeper(indent + 2);
                            else obj[km[1].trim()] = parseScalar(val);
                            var more = parseValue(indent + 2);
                            if (more && typeof more === 'object' && !Array.isArray(more)) {
                                for (var mk in more) obj[mk] = more[mk];
                            }
                            result.push(obj);
                        } else {
                            result.push(parseScalar(rest));
                            idx++;
                        }
                    }
                } else if (/^[^:]+:/.test(content)) {
                    if (result === null) result = {};
                    if (Array.isArray(result)) throw new Error('YAML解析失败：混合类型');
                    var km2 = /^([^:]+):\s*(.*)$/.exec(content);
                    var val2 = km2[2];
                    idx++;
                    if (val2 === '' || val2 === '#') result[km2[1].trim()] = parseDeeper(indent + 2);
                    else result[km2[1].trim()] = parseScalar(val2);
                } else {
                    idx++;
                }
            }
            return result;
        }

        var res = parseValue(0);
        return res;
    }

    /* ============ UI ============ */
    var DIR_META = {
        toml2json: { inLabel: 'TOML 输入', outLabel: 'JSON 输出', desc: '将 TOML 解析为 JSON 对象' },
        toml2yaml: { inLabel: 'TOML 输入', outLabel: 'YAML 输出', desc: '将 TOML 转换为 YAML' },
        json2toml: { inLabel: 'JSON 输入', outLabel: 'TOML 输出', desc: '将 JSON 序列化为 TOML' },
        yaml2toml: { inLabel: 'YAML 输入', outLabel: 'TOML 输出', desc: '将 YAML 转换为 TOML' }
    };

    var REVERSE_DIR = {
        toml2json: 'json2toml',
        toml2yaml: 'yaml2toml',
        json2toml: 'toml2json',
        yaml2toml: 'toml2yaml'
    };

    var SAMPLE = '# TOML 示例\n' +
        'title = "TOML 示例"\n' +
        '\n' +
        '[owner]\n' +
        'name = "Tom Preston-Werner"\n' +
        'dob = 1979-05-27T07:32:00Z\n' +
        '\n' +
        '[database]\n' +
        'server = "192.168.1.1"\n' +
        'ports = [8001, 8001, 8002]\n' +
        'connection_max = 5000\n' +
        'enabled = true\n' +
        '\n' +
        '[servers.alpha]\n' +
        'ip = "10.0.0.1"\n' +
        'dc = "eqdc10"\n' +
        '\n' +
        '[servers.beta]\n' +
        'ip = "10.0.0.2"\n' +
        'dc = "eqdc10"\n' +
        '\n' +
        '[[products]]\n' +
        'name = "Hammer"\n' +
        'sku = 738594937\n' +
        '\n' +
        '[[products]]\n' +
        'name = "Nail"\n' +
        'sku = 284758393\n' +
        'color = "gray"\n';

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var inputEl = $('input');
        var outputEl = $('output');
        var inputLabel = $('input-label');
        var outputLabel = $('output-label');
        var dirSelect = $('direction');
        var dirDesc = $('dir-desc');

        function applyDirection(dir) {
            var meta = DIR_META[dir];
            inputLabel.textContent = meta.inLabel;
            outputLabel.textContent = meta.outLabel;
            dirDesc.textContent = meta.desc;
            inputEl.placeholder = '请输入 ' + meta.inLabel.replace(' 输入', '') + ' 内容...';
            outputEl.placeholder = meta.outLabel + '将显示在这里...';
        }

        function getDir() { return dirSelect.value; }

        function convert() {
            Tools.clearBanner('banner-container');
            var raw = inputEl.value;
            if (!raw || !raw.trim()) {
                outputEl.value = '';
                Tools.showBanner('banner-container', 'warn', '请输入需要转换的内容');
                return;
            }
            var dir = getDir();
            try {
                var result = '';
                switch (dir) {
                    case 'toml2json':
                        result = JSON.stringify(parseToml(raw), null, 2);
                        break;
                    case 'toml2yaml':
                        result = toYaml(parseToml(raw), 0) + '\n';
                        break;
                    case 'json2toml':
                        result = toToml(JSON.parse(raw));
                        break;
                    case 'yaml2toml':
                        result = toToml(parseYaml(raw));
                        break;
                }
                outputEl.value = result;
                Tools.showBanner('banner-container', 'success', '✓ 转换成功（' + DIR_META[dir].desc + '）');
            } catch (e) {
                outputEl.value = '';
                Tools.showBanner('banner-container', 'error', '✗ ' + (e && e.message ? e.message : String(e)));
            }
        }

        function swap() {
            if (!outputEl.value) {
                Tools.showBanner('banner-container', 'warn', '没有可交换的输出');
                return;
            }
            inputEl.value = outputEl.value;
            outputEl.value = '';
            dirSelect.value = REVERSE_DIR[getDir()];
            applyDirection(getDir());
            Tools.clearBanner('banner-container');
            inputEl.focus();
        }

        function clearAll() {
            inputEl.value = '';
            outputEl.value = '';
            Tools.clearBanner('banner-container');
            inputEl.focus();
        }

        function copyResult(btn) {
            if (!outputEl.value) {
                Tools.showBanner('banner-container', 'warn', '没有可复制的结果');
                return;
            }
            Tools.copyText(outputEl.value, btn, '已复制');
        }

        function loadSample() {
            inputEl.value = SAMPLE;
            dirSelect.value = 'toml2json';
            applyDirection('toml2json');
            outputEl.value = '';
            Tools.clearBanner('banner-container');
            convert();
        }

        dirSelect.addEventListener('change', function () { applyDirection(getDir()); });
        $('btn-convert').addEventListener('click', convert);
        $('btn-swap').addEventListener('click', swap);
        $('btn-clear').addEventListener('click', clearAll);
        $('btn-copy').addEventListener('click', function () { copyResult($('btn-copy')); });
        $('btn-sample').addEventListener('click', loadSample);

        applyDirection(getDir());
    });
})();
