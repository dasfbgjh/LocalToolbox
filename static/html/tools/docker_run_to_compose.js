/* ===== Docker Run to Docker Compose =====
 * 将 docker run 命令解析为结构化参数，再序列化为 docker-compose.yml
 * 内置简化解析器（不依赖外部库）
 */
(function () {
    'use strict';

    /* ============ Tokenizer ============ */
    // 将命令拆分为 token，支持单/双引号与行尾续行符
    function tokenize(cmd) {
        // 拼接行尾续行符
        cmd = cmd.replace(/\\\n\s*/g, ' ');
        var tokens = [];
        var buf = '';
        var inSingle = false, inDouble = false;
        for (var i = 0; i < cmd.length; i++) {
            var c = cmd.charAt(i);
            if (inSingle) {
                if (c === "'") inSingle = false;
                buf += c;
            } else if (inDouble) {
                if (c === '\\' && i + 1 < cmd.length) {
                    buf += c + cmd.charAt(i + 1);
                    i++;
                } else if (c === '"') {
                    inDouble = false;
                    buf += c;
                } else {
                    buf += c;
                }
            } else {
                if (c === "'") { inSingle = true; buf += c; }
                else if (c === '"') { inDouble = true; buf += c; }
                else if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
                    if (buf) { tokens.push(buf); buf = ''; }
                } else { buf += c; }
            }
        }
        if (buf) tokens.push(buf);
        return tokens;
    }

    // 去除 token 外层引号（用于取值）
    function unquote(s) {
        if (s.length >= 2) {
            var f = s.charAt(0), l = s.charAt(s.length - 1);
            if (f === '"' && l === '"') return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            if (f === "'" && l === "'") return s.slice(1, -1).replace(/''/g, "'");
        }
        return s;
    }

    /* ============ Parser ============ */
    // 需要取值的参数（下一个 token 作为值）
    var VALUE_FLAGS = {
        '--name': 'name',
        '--publish': 'publish', '-p': 'publish',
        '--env': 'env', '-e': 'env',
        '--volume': 'volume', '-v': 'volume',
        '--restart': 'restart',
        '--network': 'network', '--net': 'network',
        '--workdir': 'workdir', '-w': 'workdir',
        '--user': 'user', '-u': 'user',
        '--entrypoint': 'entrypoint',
        '--cap-add': 'cap_add',
        '--dns': 'dns',
        '--hostname': 'hostname',
        '--label': 'label', '-l': 'label'
    };
    // 布尔型参数（无值）
    var BOOL_FLAGS = {
        '-d': 'detach', '--detach': 'detach',
        '--rm': 'rm',
        '--privileged': 'privileged',
        '-i': 'interactive', '--interactive': 'interactive',
        '-t': 'tty', '--tty': 'tty'
    };

    function parseDockerRun(cmd) {
        var tokens = tokenize(cmd);
        var i = 0;

        // 跳过 sudo / docker / run 前缀：优先定位 'run' 关键字
        var runIdx = -1;
        for (var j = 0; j < tokens.length; j++) {
            if (tokens[j] === 'run') { runIdx = j; break; }
        }
        if (runIdx !== -1) {
            i = runIdx + 1;
        } else {
            // 无 run 关键字时，跳过开头的 sudo / docker / container 等前缀
            while (i < tokens.length && (tokens[i] === 'sudo' || tokens[i] === 'docker' || tokens[i] === 'container' || tokens[i] === 'podman')) {
                i++;
            }
        }

        var result = {
            image: null,
            command: [],
            name: null,
            publish: [],
            env: [],
            volume: [],
            detach: false,
            restart: null,
            network: [],
            workdir: null,
            user: null,
            entrypoint: null,
            cap_add: [],
            dns: [],
            hostname: null,
            label: [],
            privileged: false,
            rm: false,
            ignored: []
        };

        while (i < tokens.length) {
            var tok = tokens[i];
            if (tok.charAt(0) !== '-' || tok === '-' || tok === '--') {
                // 非参数：第一个为镜像，其余为命令
                if (result.image === null) {
                    result.image = unquote(tok);
                } else {
                    result.command.push(unquote(tok));
                }
                i++;
                continue;
            }

            // 处理 = 形式：--name=foo 或 -e=BAR=baz
            var eqIdx = tok.indexOf('=');
            var flag = tok, inlineVal = null;
            if (eqIdx > 0 && tok.charAt(0) === '-') {
                flag = tok.slice(0, eqIdx);
                inlineVal = tok.slice(eqIdx + 1);
            }

            // 合并短参数：-it / -dit 等（不含 = 的短参数组合）
            if (inlineVal === null && flag.charAt(0) === '-' && flag.charAt(1) !== '-' && flag.length > 2) {
                var chars = flag.slice(1).split('');
                for (var k = 0; k < chars.length; k++) {
                    var ch = '-' + chars[k];
                    if (ch === '-d') result.detach = true;
                    else if (ch === '-i') result.ignored.push('-i');
                    else if (ch === '-t') result.ignored.push('-t');
                    else if (ch === '-p' || ch === '-e' || ch === '-v' || ch === '-w' || ch === '-u' || ch === '-l') {
                        // 这类带值参数若被合并，剩余字符作为值
                        var valStr = flag.slice(k + 2);
                        if (valStr) {
                            applyValueFlag(result, ch, unquote(valStr));
                        }
                        break;
                    } else {
                        result.ignored.push(ch);
                    }
                }
                i++;
                continue;
            }

            if (BOOL_FLAGS[flag]) {
                var key = BOOL_FLAGS[flag];
                if (key === 'detach') result.detach = true;
                else if (key === 'rm') result.rm = true;
                else if (key === 'privileged') result.privileged = true;
                else if (key === 'interactive' || key === 'tty') result.ignored.push(flag);
                i++;
                continue;
            }

            if (VALUE_FLAGS[flag]) {
                var value;
                if (inlineVal !== null) {
                    value = unquote(inlineVal);
                } else {
                    i++;
                    if (i >= tokens.length) {
                        throw new Error('参数 ' + flag + ' 缺少值');
                    }
                    value = unquote(tokens[i]);
                }
                applyValueFlag(result, flag, value);
                i++;
                continue;
            }

            // 未知参数：跳过其可能的值（若下一个 token 不以 - 开头且像值）
            result.ignored.push(flag);
            i++;
        }

        if (result.image === null) {
            throw new Error('未找到镜像名称');
        }
        return result;
    }

    function applyValueFlag(result, flag, value) {
        switch (flag) {
            case '--name': result.name = value; break;
            case '-p': case '--publish': result.publish.push(value); break;
            case '-e': case '--env': result.env.push(value); break;
            case '-v': case '--volume': result.volume.push(value); break;
            case '--restart': result.restart = value; break;
            case '--network': case '--net': result.network.push(value); break;
            case '-w': case '--workdir': result.workdir = value; break;
            case '-u': case '--user': result.user = value; break;
            case '--entrypoint': result.entrypoint = value; break;
            case '--cap-add': result.cap_add.push(value); break;
            case '--dns': result.dns.push(value); break;
            case '--hostname': result.hostname = value; break;
            case '-l': case '--label': result.label.push(value); break;
        }
    }

    /* ============ Service name ============ */
    function deriveServiceName(image, name) {
        if (name) {
            return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
        }
        // 取 image 最后一段，去掉 tag
        var base = image;
        var slash = base.lastIndexOf('/');
        if (slash !== -1) base = base.slice(slash + 1);
        var colon = base.lastIndexOf(':');
        if (colon !== -1) base = base.slice(0, colon);
        if (!base) base = 'service';
        base = base.replace(/[^a-zA-Z0-9_.-]/g, '_');
        if (/^[0-9]/.test(base)) base = 's_' + base;
        return base;
    }

    /* ============ YAML serializer ============ */
    function yamlNeedsQuote(s) {
        if (s === '') return true;
        if (s === 'true' || s === 'false' || s === 'null' || s === 'yes' || s === 'no' || s === '~') return true;
        if (/^-?\d+(\.\d+)?$/.test(s)) return true;
        // 以指示符开头
        if (/^[,\[\]{}#&*!|>'"%@`]/.test(s)) return true;
        // 以 - ? : 后接空格或结尾开头
        if (/^[?:-](\s|$)/.test(s)) return true;
        // 包含 ": "（映射指示符）、行尾 ":" 或 " #"（注释）
        if (/:\s/.test(s) || /:\s*$/.test(s) || /\s#/.test(s)) return true;
        if (/^\s|\s$/.test(s)) return true;
        // 避免以数字开头的含冒号值被 YAML 1.1 误解析为六十进制（如端口 8080:80）
        if (/^\d.*:/.test(s)) return true;
        return false;
    }

    function yamlScalar(v) {
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'boolean') return v ? 'true' : 'false';
        if (typeof v === 'number') return String(v);
        var s = String(v);
        if (yamlNeedsQuote(s)) return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        return s;
    }

    function pad(indent) {
        return new Array(indent + 1).join('  ');
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

    /* ============ Build compose object ============ */
    function buildCompose(r) {
        var serviceName = deriveServiceName(r.image, r.name);
        var service = {};
        service['image'] = r.image;
        if (r.name) service['container_name'] = r.name;
        if (r.publish.length) service['ports'] = r.publish.map(function (p) { return String(p); });
        if (r.env.length) service['environment'] = r.env.map(function (e) { return String(e); });
        if (r.volume.length) service['volumes'] = r.volume.map(function (v) { return String(v); });
        if (r.restart) service['restart'] = r.restart;
        if (r.network.length) service['networks'] = r.network.map(function (n) { return String(n); });
        if (r.workdir) service['working_dir'] = r.workdir;
        if (r.user) service['user'] = r.user;
        if (r.entrypoint) service['entrypoint'] = r.entrypoint;
        if (r.privileged) service['privileged'] = true;
        if (r.cap_add.length) service['cap_add'] = r.cap_add.map(function (c) { return String(c); });
        if (r.dns.length) service['dns'] = r.dns.map(function (d) { return String(d); });
        if (r.hostname) service['hostname'] = r.hostname;
        if (r.label.length) service['labels'] = r.label.map(function (l) { return String(l); });
        if (r.command.length) service['command'] = r.command.map(function (c) { return String(c); });

        var compose = { services: {} };
        compose.services[serviceName] = service;

        // 顶层 networks 声明
        if (r.network.length) {
            var nets = {};
            r.network.forEach(function (n) { nets[n] = {}; });
            compose.networks = nets;
        }
        return compose;
    }

    function generateYaml(r) {
        var compose = buildCompose(r);
        var out = [];
        toYamlLines(compose, 0, out);
        var yaml = out.join('\n');
        // 顶层 networks 空对象输出为 "name: {}" 已经由序列化处理
        // 若有 --rm，追加注释说明
        if (r.rm) {
            yaml += '\n# 注意：原命令含 --rm（运行后删除容器），compose 无直接等价项；' +
                '如需类似行为可使用 docker-compose run --rm，默认 restart 为 "no"。';
        }
        return yaml + '\n';
    }

    /* ============ YAML syntax highlight ============ */
    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function findCommentIndex(line) {
        var inSingle = false, inDouble = false;
        for (var i = 0; i < line.length; i++) {
            var c = line.charAt(i);
            if (inSingle) { if (c === "'") inSingle = false; }
            else if (inDouble) { if (c === '\\') i++; else if (c === '"') inDouble = false; }
            else {
                if (c === "'") inSingle = true;
                else if (c === '"') inDouble = true;
                else if (c === '#') {
                    if (i === 0 || /\s/.test(line.charAt(i - 1))) return i;
                }
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
        // 整行注释
        var full = /^(\s*)(#.*)$/.exec(line);
        if (full) return full[1] + '<span class="yaml-comment">' + full[2] + '</span>';
        // 拆出行尾注释
        var main = line, commentHtml = '';
        var ci = findCommentIndex(line);
        if (ci !== -1) {
            commentHtml = '<span class="yaml-comment">' + escapeHtml(line.slice(ci)) + '</span>';
            main = line.slice(0, ci);
        }
        main = escapeHtml(main);
        // - key: value
        var m1 = /^(\s*)(-)(\s+)([A-Za-z_][\w.\-]*)(:)(\s*)(.*)$/.exec(main);
        if (m1) {
            return m1[1] + '<span class="yaml-dash">' + m1[2] + '</span>' + m1[3] +
                '<span class="yaml-key">' + m1[4] + '</span>' + m1[5] + m1[6] + highlightValue(m1[7]) + commentHtml;
        }
        // key: value
        var m2 = /^(\s*)([A-Za-z_][\w.\-]*)(:)(\s*)(.*)$/.exec(main);
        if (m2) {
            return m2[1] + '<span class="yaml-key">' + m2[2] + '</span>' + m2[3] + m2[4] + highlightValue(m2[5]) + commentHtml;
        }
        // - value
        var m3 = /^(\s*)(-)(\s*)(.*)$/.exec(main);
        if (m3) {
            return m3[1] + '<span class="yaml-dash">' + m3[2] + '</span>' + m3[3] + highlightValue(m3[4]) + commentHtml;
        }
        return main + commentHtml;
    }

    function highlightYamlText(yamlStr) {
        return yamlStr.split('\n').map(function (line) {
            return highlightYamlLine(line);
        }).join('\n');
    }

    /* ============ Parse summary ============ */
    function joinArr(arr) {
        return arr.map(function (x) { return String(x); }).join(', ');
    }

    function renderSummary(r) {
        var rows = [];
        function row(key, val, isNone) {
            rows.push({ key: key, val: val, none: !!isNone });
        }
        row('镜像', r.image, !r.image);
        row('容器名称', r.name, !r.name);
        row('端口映射', r.publish.length ? joinArr(r.publish) : null, !r.publish.length);
        row('环境变量', r.env.length ? joinArr(r.env) : null, !r.env.length);
        row('卷挂载', r.volume.length ? joinArr(r.volume) : null, !r.volume.length);
        row('后台运行', r.detach ? '是 (-d)' : null, !r.detach);
        row('重启策略', r.restart, !r.restart);
        row('网络', r.network.length ? joinArr(r.network) : null, !r.network.length);
        row('工作目录', r.workdir, !r.workdir);
        row('用户', r.user, !r.user);
        row('入口点', r.entrypoint, !r.entrypoint);
        row('命令', r.command.length ? joinArr(r.command) : null, !r.command.length);
        row('特权模式', r.privileged ? '是' : null, !r.privileged);
        row('添加能力', r.cap_add.length ? joinArr(r.cap_add) : null, !r.cap_add.length);
        row('DNS', r.dns.length ? joinArr(r.dns) : null, !r.dns.length);
        row('主机名', r.hostname, !r.hostname);
        row('标签', r.label.length ? joinArr(r.label) : null, !r.label.length);
        row('运行后删除', r.rm ? '是 (--rm，compose 无直接对应)' : null, !r.rm);
        row('忽略参数', r.ignored.length ? joinArr(r.ignored) : null, !r.ignored.length);

        var html = '';
        rows.forEach(function (r) {
            html += '<div class="pk">' + escapeHtml(r.key) + '</div>';
            if (r.none) {
                html += '<div class="pv none">—</div>';
            } else {
                html += '<div class="pv">' + escapeHtml(r.val) + '</div>';
            }
        });
        return html;
    }

    /* ============ UI ============ */
    var SAMPLE = 'docker run -d \\\n' +
        '  --name mynginx \\\n' +
        '  -p 8080:80 -p 8443:443 \\\n' +
        '  -e DEBUG=true -e API_KEY=secret123 \\\n' +
        '  -v ./html:/usr/share/nginx/html:ro \\\n' +
        '  -v /var/log/nginx:/var/log/nginx \\\n' +
        '  --restart always \\\n' +
        '  --network mynet \\\n' +
        '  -w /app \\\n' +
        '  -u nginx \\\n' +
        '  --hostname mynginx.local \\\n' +
        '  --cap-add NET_ADMIN \\\n' +
        '  --dns 8.8.8.8 --dns 8.8.4.4 \\\n' +
        '  -l com.example.role=web -l com.example.env=prod \\\n' +
        '  nginx:latest \\\n' +
        '  nginx -g "daemon off;"';

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var inputEl = $('input');
        var outputEl = $('output');
        var summaryEl = $('summary');

        var lastYaml = '';

        function convert() {
            Tools.clearBanner('banner');
            var raw = inputEl.value;
            if (!raw || !raw.trim()) {
                outputEl.textContent = '';
                outputEl.classList.add('empty');
                summaryEl.innerHTML = '<div class="pk">镜像</div><div class="pv none">尚未解析</div>';
                Tools.showBanner('banner', 'warn', '请输入 docker run 命令');
                return;
            }
            try {
                var parsed = parseDockerRun(raw);
                var yaml = generateYaml(parsed);
                lastYaml = yaml;
                outputEl.innerHTML = highlightYamlText(yaml);
                outputEl.classList.remove('empty');
                summaryEl.innerHTML = renderSummary(parsed);
                Tools.showBanner('banner', 'success', '✓ 已生成 docker-compose.yml');
            } catch (err) {
                lastYaml = '';
                outputEl.textContent = '';
                outputEl.classList.add('empty');
                Tools.showBanner('banner', 'error', '✗ 解析失败：' + (err && err.message ? err.message : String(err)));
            }
        }

        function clearAll() {
            inputEl.value = '';
            outputEl.textContent = '';
            outputEl.classList.add('empty');
            summaryEl.innerHTML = '<div class="pk">镜像</div><div class="pv none">尚未解析</div>';
            Tools.clearBanner('banner');
            lastYaml = '';
            inputEl.focus();
        }

        function loadSample() {
            inputEl.value = SAMPLE;
            Tools.clearBanner('banner');
            convert();
        }

        $('btn-convert').addEventListener('click', convert);
        $('btn-sample').addEventListener('click', loadSample);
        $('btn-clear').addEventListener('click', clearAll);
        $('btn-copy').addEventListener('click', function () {
            if (!lastYaml) {
                Tools.showBanner('banner', 'warn', '没有可复制的结果');
                return;
            }
            Tools.copyText(lastYaml, this, '已复制');
        });
    });
})();
