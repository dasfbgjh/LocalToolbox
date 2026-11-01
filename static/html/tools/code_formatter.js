'use strict';
document.addEventListener('DOMContentLoaded', function () {
    var $ = Tools.$;
    var inputEl = $('input');
    var outputEl = $('output');
    var langEl = $('language');
    var indentEl = $('indent');
    var uppercaseSqlEl = $('uppercase-sql');
    var lastOutput = '';

    function getIndent() {
        var v = indentEl.value;
        if (v === 'tab') return '\t';
        var n = parseInt(v, 10) || 2;
        return new Array(n + 1).join(' ');
    }

    // ===== JSON =====
    function formatJson(src, compress) {
        var parsed = JSON.parse(src);
        return compress ? JSON.stringify(parsed) : JSON.stringify(parsed, null, getIndent());
    }

    // ===== HTML / XML =====
    var VOID_TAGS = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };

    function formatHtml(src, isXml) {
        var indentUnit = getIndent();
        // Tokenize: tags, comments, text
        var tokens = [];
        var i = 0;
        while (i < src.length) {
            if (src.charAt(i) === '<') {
                if (src.substr(i, 4) === '<!--') {
                    var endC = src.indexOf('-->', i);
                    if (endC === -1) endC = src.length - 3;
                    tokens.push({ type: 'comment', value: src.slice(i, endC + 3) });
                    i = endC + 3;
                } else if (src.charAt(i + 1) === '?') {
                    var endP = src.indexOf('?>', i);
                    if (endP === -1) endP = src.length - 2;
                    tokens.push({ type: 'decl', value: src.slice(i, endP + 2) });
                    i = endP + 2;
                } else if (src.charAt(i + 1) === '!') {
                    var endD = src.indexOf('>', i);
                    if (endD === -1) endD = src.length - 1;
                    tokens.push({ type: 'doctype', value: src.slice(i, endD + 1) });
                    i = endD + 1;
                } else {
                    var endT = src.indexOf('>', i);
                    if (endT === -1) endT = src.length - 1;
                    var tagText = src.slice(i, endT + 1);
                    var selfClose = tagText.charAt(tagText.length - 2) === '/';
                    var nameMatch = /^<\/?\s*([a-zA-Z0-9:_-]+)/.exec(tagText);
                    var name = nameMatch ? nameMatch[1].toLowerCase() : '';
                    tokens.push({
                        type: src.charAt(i + 1) === '/' ? 'close' : 'open',
                        value: tagText,
                        name: name,
                        selfClose: selfClose
                    });
                    i = endT + 1;
                }
            } else {
                var next = src.indexOf('<', i);
                if (next === -1) next = src.length;
                var text = src.slice(i, next);
                if (text.trim()) tokens.push({ type: 'text', value: text.trim() });
                i = next;
            }
        }

        var out = [];
        var depth = 0;
        tokens.forEach(function (tok) {
            if (tok.type === 'close') {
                if (depth > 0) depth--;
            }
            var prefix = '';
            for (var d = 0; d < depth; d++) prefix += indentUnit;
            if (tok.type === 'text') {
                out.push(prefix + tok.value);
            } else {
                out.push(prefix + tok.value);
            }
            if (tok.type === 'open' && !tok.selfClose && !(isXml ? false : VOID_TAGS[tok.name])) {
                depth++;
            }
        });
        return out.join('\n');
    }

    // ===== CSS =====
    function formatCss(src) {
        var indentUnit = getIndent();
        // Normalize whitespace
        var s = src.replace(/\/\*[\s\S]*?\*\//g, function (m) { return '\u0000' + m + '\u0000'; });
        s = s.replace(/\s+/g, ' ').trim();
        var parts = s.split('\u0000');
        var tokens = [];
        parts.forEach(function (p, idx) {
            if (idx % 2 === 1) {
                // comment
                tokens.push({ type: 'comment', value: p });
            } else if (p.trim()) {
                // rule text
                tokens.push({ type: 'rules', value: p.trim() });
            }
        });

        var out = [];
        tokens.forEach(function (tok) {
            if (tok.type === 'comment') {
                out.push(tok.value);
                return;
            }
            // Split into selector {body}
            var re = /([^{ };]+)\{([^ {}] *)\}/g;
            var m;
            var last = 0;
            var matched = false;
            while ((m = re.exec(tok.value)) !== null) {
                matched = true;
                var before = tok.value.slice(last, m.index).trim();
                if (before) out.push(before + ';');
                var selector = m[1].trim().replace(/\s*,\s*/g, ',\n');
                var body = m[2].trim();
                var props = body.split(';').map(function (p) { return p.trim(); }).filter(Boolean);
                out.push(selector + ' {');
                props.forEach(function (prop) {
                    out.push(indentUnit + prop + ';');
                });
                out.push('}');
                last = re.lastIndex;
            }
            if (!matched) {
                var tail = tok.value.slice(last).trim();
                if (tail) out.push(tail);
            }
        });
        return out.join('\n');
    }

    // ===== JavaScript (basic) =====
    function formatJs(src) {
        var indentUnit = getIndent();
        // Remove leading/trailing whitespace per line, collapse
        var s = src.replace(/\r\n/g, '\n');
        // Ensure space after keywords is preserved; just tokenize by chars
        var out = [];
        var depth = 0;
        var cur = '';
        var inStr = null;
        var inLineComment = false;
        var inBlockComment = false;
        var i = 0;
        function flushLine() {
            var line = cur.replace(/^\s+|\s+$/g, '');
            if (line.length) {
                var prefix = '';
                for (var d = 0; d < depth; d++) prefix += indentUnit;
                out.push(prefix + line);
            }
            cur = '';
        }
        while (i < s.length) {
            var ch = s.charAt(i);
            var next = s.charAt(i + 1);
            if (inLineComment) {
                cur += ch;
                if (ch === '\n') { inLineComment = false; flushLine(); }
                i++;
                continue;
            }
            if (inBlockComment) {
                cur += ch;
                if (ch === '*' && next === '/') { cur += '/'; i += 2; inBlockComment = false; continue; }
                if (ch === '\n') { flushLine(); }
                i++;
                continue;
            }
            if (inStr) {
                cur += ch;
                if (ch === '\\') { cur += next; i += 2; continue; }
                if (ch === inStr) inStr = null;
                i++;
                continue;
            }
            if (ch === '/' && next === '/') {
                cur += '//';
                i += 2;
                inLineComment = true;
                continue;
            }
            if (ch === '/' && next === '*') {
                cur += '/*';
                i += 2;
                inBlockComment = true;
                continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') {
                inStr = ch;
                cur += ch;
                i++;
                continue;
            }
            if (ch === '{') {
                cur += ch;
                i++;
                flushLine();
                depth++;
                continue;
            }
            if (ch === '}') {
                if (depth > 0) depth--;
                flushLine();
                cur = '}';
                i++;
                // keep semicolons on same line
                continue;
            }
            if (ch === ';') {
                cur += ';';
                i++;
                flushLine();
                continue;
            }
            if (ch === '\n') {
                // collapse newlines into the buffer trim
                i++;
                continue;
            }
            cur += ch;
            i++;
        }
        flushLine();
        // Clean up empty lines that precede }
        return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    // ===== SQL =====
    var SQL_KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON', 'UNION', 'UNION ALL', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'AND', 'OR', 'EXISTS', 'IN', 'NOT IN'];

    function formatSql(src, uppercase) {
        var indentUnit = getIndent();
        var s = src.replace(/\s+/g, ' ').trim();
        if (uppercase) {
            // Uppercase keywords (word-boundary, case-insensitive)
            SQL_KEYWORDS.forEach(function (kw) {
                var re = new RegExp('\\b' + kw.replace(/ /g, '\\s+') + '\\b', 'gi');
                s = s.replace(re, kw);
            });
        }
        // Normalize spacing around operators
        s = s.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
        s = s.replace(/\s*,\s*/g, ', ');
        s = s.replace(/\s*=\s*/g, ' = ');

        // Insert newlines before major keywords.
        // Note: bare 'JOIN' is omitted to avoid breaking multi-word joins (LEFT JOIN etc.);
        // a plain JOIN will stay inline, which is acceptable for basic formatting.
        var majorKeywords = ['FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON', 'UNION ALL', 'UNION', 'VALUES', 'SET'];
        majorKeywords.forEach(function (kw) {
            // match keyword as standalone, not inside string
            var re = new RegExp('\\s+' + kw.replace(/ /g, '\\s+') + '\\b', 'gi');
            s = s.replace(re, '\n' + kw);
        });
        // SELECT goes first on its own
        s = s.replace(/^\s*SELECT\b/i, 'SELECT');
        s = s.replace(/INSERT\s+INTO/i, 'INSERT INTO');
        s = s.replace(/DELETE\s+FROM/i, 'DELETE FROM');
        s = s.replace(/CREATE\s+TABLE/i, 'CREATE TABLE');
        s = s.replace(/ALTER\s+TABLE/i, 'ALTER TABLE');
        s = s.replace(/DROP\s+TABLE/i, 'DROP TABLE');

        // AND / OR on new indented lines
        s = s.replace(/\s+AND\b/gi, '\n' + indentUnit + 'AND');
        s = s.replace(/\s+OR\b/gi, '\n' + indentUnit + 'OR');

        // Indent the SELECT columns by 2 units after SELECT line
        var lines = s.split('\n');
        var out = [];
        lines.forEach(function (line, idx) {
            var trimmed = line.trim();
            if (idx === 0 && /^SELECT\b/i.test(trimmed)) {
                out.push('SELECT');
                var rest = trimmed.replace(/^SELECT\s*/i, '');
                if (rest) out.push(indentUnit + rest);
            } else if (/^(INSERT INTO|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE|UPDATE)\b/i.test(trimmed)) {
                out.push(trimmed);
            } else if (/^(FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|SET|VALUES|UNION|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|FULL JOIN|CROSS JOIN|JOIN|ON)\b/i.test(trimmed)) {
                out.push(trimmed);
            } else {
                out.push(indentUnit + trimmed);
            }
        });
        return out.join('\n');
    }

    function formatCode(compress) {
        var raw = inputEl.value;
        Tools.clearBanner('banner-container');
        if (!raw || !raw.trim()) {
            Tools.showBanner('banner-container', 'warn', '请输入需要格式化的代码');
            outputEl.textContent = '';
            outputEl.classList.add('empty');
            lastOutput = '';
            return;
        }
        var lang = langEl.value;
        try {
            var result = '';
            switch (lang) {
                case 'json':
                    result = formatJson(raw, compress);
                    break;
                case 'html':
                    result = formatHtml(raw, false);
                    break;
                case 'xml':
                    result = formatHtml(raw, true);
                    break;
                case 'css':
                    result = formatCss(raw);
                    break;
                case 'javascript':
                    result = formatJs(raw);
                    break;
                case 'sql':
                    result = formatSql(raw, uppercaseSqlEl.checked);
                    break;
                default:
                    result = raw;
            }
            lastOutput = result;
            if (lang === 'json' && !compress) {
                outputEl.innerHTML = Tools.highlightJson(result);
            } else {
                outputEl.textContent = result;
            }
            outputEl.classList.remove('empty');
            Tools.showBanner('banner-container', 'success', '✓ 格式化成功');
        } catch (err) {
            lastOutput = '';
            outputEl.textContent = '';
            outputEl.classList.add('empty');
            Tools.showBanner('banner-container', 'error', '✗ 格式化失败：' + (err && err.message ? err.message : String(err)));
        }
    }

    function clearAll() {
        inputEl.value = '';
        outputEl.textContent = '';
        outputEl.classList.add('empty');
        Tools.clearBanner('banner-container');
        lastOutput = '';
        inputEl.focus();
    }

    $('btn-format').addEventListener('click', function () { formatCode(false); });
    $('btn-minify').addEventListener('click', function () {
        if (langEl.value !== 'json') {
            Tools.showBanner('banner-container', 'warn', '压缩目前仅支持 JSON 语言');
            return;
        }
        formatCode(true);
    });
    $('btn-copy').addEventListener('click', function () {
        if (!lastOutput) {
            Tools.showBanner('banner-container', 'warn', '没有可复制的结果');
            return;
        }
        Tools.copyText(lastOutput, this, '已复制');
    });
    $('btn-clear').addEventListener('click', clearAll);
    langEl.addEventListener('change', function () {
        uppercaseSqlEl.style.display = (langEl.value === 'sql') ? '' : 'none';
    });
    uppercaseSqlEl.style.display = 'none';
});
