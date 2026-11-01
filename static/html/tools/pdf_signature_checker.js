(function () {
    'use strict';

    /* ===== PDF 签名检查器 =====
     * 纯前端实现:
     *   - 通过 FileReader 读取 PDF 二进制(Latin1 字符串化后做模式匹配)
     *   - 检测 /Type /Sig 与 /Type /DocTimeStamp 签名字典
     *   - 提取 /Filter /SubFilter /M /ByteRange /Contents /Cert 等字段
     *   - 对 /Contents(PKCS#7 DER)做轻量 ASN.1 解析,提取证书主体/颁发者/有效期
     * 注意: 不验证签名本身的有效性,仅做结构与信息检测。
     */

    // ===== 常量 =====
    var OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
    var OID_LABELS = {
        '2.5.4.3': 'CN',
        '2.5.4.6': 'C',
        '2.5.4.7': 'L',
        '2.5.4.8': 'ST',
        '2.5.4.9': 'STREET',
        '2.5.4.10': 'O',
        '2.5.4.11': 'OU',
        '2.5.4.5': 'serialNumber',
        '1.2.840.113549.1.9.1': 'emailAddress',
        '0.9.2342.19200300.100.1.25': 'DC',
        '2.5.4.12': 'title',
        '2.5.4.4': 'SN'
    };

    // ===== 通用工具 =====
    function formatSize(bytes) {
        if (!bytes && bytes !== 0) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function bytesToLatin1(bytes) {
        // 将 Uint8Array 转为 Latin1 字符串以便做正则模式匹配
        var chunks = [];
        var chunkSize = 0x8000;
        for (var i = 0; i < bytes.length; i += chunkSize) {
            chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, bytes.length))));
        }
        return chunks.join('');
    }

    function hexToBytes(hex) {
        var clean = hex.replace(/[^0-9a-fAF]/g, '');
        var len = Math.floor(clean.length / 2);
        var out = new Uint8Array(len);
        for (var i = 0; i < len; i++) {
            out[i] = parseInt(clean.substr(i * 2, 2), 16);
        }
        return out;
    }

    // ===== PDF 日期解析 (D:YYYYMMDDHHmmSS...) =====
    function parsePdfDate(dateStr) {
        if (!dateStr) return '';
        var s = dateStr.replace(/^D:/, '');
        var y = s.substr(0, 4);
        var mo = s.substr(4, 2);
        var d = s.substr(6, 2);
        var h = s.substr(8, 2) || '00';
        var mi = s.substr(10, 2) || '00';
        var se = s.substr(12, 2) || '00';
        if (!y || !mo || !d) return '';
        return y + '-' + mo + '-' + d + ' ' + h + ':' + mi + ':' + se;
    }

    function classifySigType(subFilter, type) {
        if (type === 'DocTimeStamp') return '时间戳 (RFC 3161)';
        if (!subFilter) return '数字签名';
        var sf = subFilter.toLowerCase();
        if (sf.indexOf('etsi.rfc3161') === 0) return '时间戳 (RFC 3161)';
        if (sf.indexOf('adbe.pkcs7') === 0) return 'PKCS#7 数字签名';
        if (sf.indexOf('adbe.x509') === 0) return 'X.509 数字签名';
        if (sf.indexOf('etsi.cades') === 0) return 'CAdES 数字签名';
        return '数字签名';
    }

    // ===== 对象表 & 页码映射 =====
    function findAllObjects(str) {
        var objs = [];
        var re = /(\d+)\s+(\d+)\s+obj\b/g;
        var m;
        while ((m = re.exec(str)) !== null) {
            objs.push({ pos: m.index, objNum: m[1] });
        }
        return objs;
    }

    function findObjNumBefore(objs, pos) {
        var lo = 0, hi = objs.length - 1, result = null;
        while (lo <= hi) {
            var mid = (lo + hi) >> 1;
            if (objs[mid].pos <= pos) { result = objs[mid]; lo = mid + 1; }
            else { hi = mid - 1; }
        }
        return result ? result.objNum : null;
    }

    function buildPageMap(str, objs) {
        var map = {};
        var rePage = /\/Type\s*\/Page\b/g;
        var m;
        var idx = 0;
        while ((m = rePage.exec(str)) !== null) {
            var objNum = findObjNumBefore(objs, m.index);
            if (objNum && !map[objNum]) {
                idx++;
                map[objNum] = idx;
            }
        }
        return map;
    }

    function findSignaturePage(str, sigPos, objs, pageMap) {
        var sigObjNum = findObjNumBefore(objs, sigPos);
        if (!sigObjNum) return null;
        // 查找引用此签名的 Widget:/V <objNum> <gen> R
        var reV = new RegExp('/V\\s+' + sigObjNum + '\\s+\\d+\\s+R', 'g');
        var vm = reV.exec(str);
        if (!vm) return null;
        var widgetPos = vm.index;
        var start = Math.max(0, widgetPos - 1500);
        var end = Math.min(str.length, widgetPos + 2000);
        var sub = str.substring(start, end);
        var pm = sub.match(/\/P\s+(\d+)\s+\d+\s+R/);
        if (pm && pageMap[pm[1]]) return pageMap[pm[1]];
        return null;
    }

    // ===== 字段提取 =====
    function extractField(chunk, pattern) {
        var m = chunk.match(pattern);
        return m ? m[1] : '';
    }

    function findContentsHex(str, sigPos) {
        // /Contents <hex> 可能跨多行且很长,查找距离签名最近的 /Contents 以避免多签名误匹配
        var searchStart = Math.max(0, sigPos - 2000);
        var searchEnd = Math.min(str.length, sigPos + 4000);
        var best = null;
        var bestDist = Infinity;
        var from = searchStart;
        while (from < searchEnd) {
            var idx = str.indexOf('/Contents', from);
            if (idx === -1 || idx > searchEnd) break;
            var pos = idx + 9;
            while (pos < str.length && /\s/.test(str[pos])) pos++;
            if (str[pos] === '<') {
                var end = str.indexOf('>', pos + 1);
                if (end !== -1) {
                    var dist = Math.abs(idx - sigPos);
                    if (dist < bestDist) {
                        best = { hex: str.substring(pos + 1, end), offset: idx };
                        bestDist = dist;
                    }
                }
            }
            from = idx + 9;
        }
        return best;
    }

    // ===== ASN.1 解析 =====
    function parseTlv(bytes, pos) {
        if (pos >= bytes.length) return null;
        var startPos = pos;
        var tag = bytes[pos++];
        if ((tag & 0x1f) === 0x1f) {
            while (pos < bytes.length && (bytes[pos] & 0x80)) pos++;
            pos++;
        }
        if (pos >= bytes.length) return null;
        var len = bytes[pos++];
        if (len & 0x80) {
            var numBytes = len & 0x7f;
            if (numBytes === 0) return null;
            len = 0;
            for (var i = 0; i < numBytes; i++) {
                if (pos >= bytes.length) return null;
                len = (len << 8) | bytes[pos++];
            }
        }
        var valueStart = pos;
        var valueEnd = pos + len;
        if (valueEnd > bytes.length) return null;
        return { tag: tag, start: startPos, valueStart: valueStart, valueEnd: valueEnd, nextPos: valueEnd };
    }

    function parseChildren(bytes, tlv) {
        var children = [];
        var pos = tlv.valueStart;
        while (pos < tlv.valueEnd) {
            var child = parseTlv(bytes, pos);
            if (!child || child.valueEnd > tlv.valueEnd) break;
            children.push(child);
            pos = child.nextPos;
        }
        return children;
    }

    function parseOid(bytes, tlv) {
        if (tlv.tag !== 0x06) return '';
        var parts = [];
        var pos = tlv.valueStart;
        var end = tlv.valueEnd;
        if (pos >= end) return '';
        var first = bytes[pos++];
        parts.push(Math.floor(first / 40));
        parts.push(first % 40);
        while (pos < end) {
            var n = 0;
            var more = false;
            do {
                if (pos >= end) break;
                var b = bytes[pos++];
                more = (b & 0x80) !== 0;
                n = (n << 7) | (b & 0x7f);
            } while (more);
            parts.push(n);
        }
        return parts.join('.');
    }

    function parseStringValue(bytes, tlv) {
        if (tlv.tag === 0x1e) {
            var r = '';
            for (var i = tlv.valueStart; i + 1 < tlv.valueEnd; i += 2) {
                r += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
            }
            return r;
        }
        if (tlv.tag === 0x0c) {
            try {
                return new TextDecoder('utf-8').decode(bytes.subarray(tlv.valueStart, tlv.valueEnd));
            } catch (e) { /* fallthrough */ }
        }
        var s = '';
        for (var j = tlv.valueStart; j < tlv.valueEnd; j++) {
            s += String.fromCharCode(bytes[j]);
        }
        return s;
    }

    function oidToLabel(oid) {
        return OID_LABELS[oid] || oid;
    }

    function parseDn(bytes, nameTlv) {
        var rdns = parseChildren(bytes, nameTlv);
        var parts = [];
        for (var i = 0; i < rdns.length; i++) {
            var atvs = parseChildren(bytes, rdns[i]);
            for (var j = 0; j < atvs.length; j++) {
                var atv = parseChildren(bytes, atvs[j]);
                if (atv.length >= 2) {
                    var label = oidToLabel(parseOid(bytes, atv[0]));
                    var val = parseStringValue(bytes, atv[1]).trim();
                    if (val) parts.push(label + '=' + val);
                }
            }
        }
        return parts.join(', ');
    }

    function parseAsn1Time(s, tag) {
        if (!s) return '';
        s = s.trim();
        var year, rest;
        if (tag === 0x17) {
            year = s.substr(0, 2);
            year = (parseInt(year, 10) >= 50) ? ('19' + year) : ('20' + year);
            rest = s.substr(2);
        } else {
            year = s.substr(0, 4);
            rest = s.substr(4);
        }
        var mo = rest.substr(0, 2);
        var d = rest.substr(2, 2);
        var h = rest.substr(4, 2) || '00';
        var mi = rest.substr(6, 2) || '00';
        var se = rest.substr(8, 2) || '00';
        return year + '-' + mo + '-' + d + ' ' + h + ':' + mi + ':' + se;
    }

    function parseValidity(bytes, tlv) {
        var children = parseChildren(bytes, tlv);
        var result = { notBefore: '', notAfter: '' };
        if (children.length >= 1) result.notBefore = parseAsn1Time(parseStringValue(bytes, children[0]), children[0].tag);
        if (children.length >= 2) result.notAfter = parseAsn1Time(parseStringValue(bytes, children[1]), children[1].tag);
        return result;
    }

    function parseCert(bytes, certTlv) {
        try {
            var certChildren = parseChildren(bytes, certTlv);
            if (certChildren.length < 1) return null;
            var tbs = certChildren[0];
            var tbsChildren = parseChildren(bytes, tbs);
            var idx = 0;
            // 跳过可选的 version [0]
            if (tbsChildren.length > 0 && (tbsChildren[0].tag & 0xc0) === 0x80) idx = 1;
            idx++; // serialNumber
            idx++; // signature AlgorithmIdentifier
            var issuerTlv = tbsChildren[idx++];
            var validityTlv = tbsChildren[idx++];
            var subjectTlv = tbsChildren[idx++];
            if (!subjectTlv) return null;
            var validity = parseValidity(bytes, validityTlv);
            return {
                subject: parseDn(bytes, subjectTlv),
                issuer: parseDn(bytes, issuerTlv),
                notBefore: validity.notBefore,
                notAfter: validity.notAfter
            };
        } catch (e) {
            return null;
        }
    }

    function extractCertsFromPkcs7(bytes) {
        var certs = [];
        try {
            var ci = parseTlv(bytes, 0);
            if (!ci || ci.tag !== 0x30) return certs;
            var ciChildren = parseChildren(bytes, ci);
            if (ciChildren.length < 2) return certs;
            var oid = parseOid(bytes, ciChildren[0]);
            if (oid !== OID_SIGNED_DATA) return certs;
            var explicit0 = ciChildren[1];
            if ((explicit0.tag & 0xc0) !== 0x80) return certs;
            var signedData = parseTlv(bytes, explicit0.valueStart);
            if (!signedData || signedData.tag !== 0x30) return certs;
            var sdChildren = parseChildren(bytes, signedData);
            // 0:version 1:digestAlgorithms 2:encapContentInfo 3:certificates[0](可选)
            if (sdChildren.length < 4) return certs;
            var k = 3;
            while (k < sdChildren.length && (sdChildren[k].tag & 0xc0) !== 0x80) k++;
            if (k >= sdChildren.length) return certs;
            var certsTlv = sdChildren[k];
            // [0] 为证书, [1] 为 crl
            if ((certsTlv.tag & 0x1f) !== 0) return certs;
            var pos = certsTlv.valueStart;
            while (pos < certsTlv.valueEnd) {
                var t = parseTlv(bytes, pos);
                if (!t || t.valueEnd > certsTlv.valueEnd) break;
                if (t.tag === 0x30) {
                    var cert = parseCert(bytes, t);
                    if (cert) certs.push(cert);
                }
                pos = t.nextPos;
            }
        } catch (e) {
            /* 忽略,返回已解析的 */
        }
        return certs;
    }

    // ===== 单个签名信息提取 =====
    function extractSignature(str, sp, idx, objs, pageMap) {
        var pos = sp.pos;
        var start = Math.max(0, pos - 1500);
        var end = Math.min(str.length, pos + 3000);
        var chunk = str.substring(start, end);

        var sig = {
            index: idx + 1,
            type: sp.type === 'DocTimeStamp' ? '时间戳 (RFC 3161)' : '数字签名',
            typeKey: sp.type,
            filter: '',
            subFilter: '',
            signingTime: '',
            byteRange: '',
            hasCert: false,
            hasContents: false,
            contentsBytes: 0,
            isMDP: false,
            page: '',
            certs: []
        };

        var filter = extractField(chunk, /\/Filter\s*\/([A-Za-z0-9._-]+)/);
        if (filter) sig.filter = filter;

        var subFilter = extractField(chunk, /\/SubFilter\s*\/([A-Za-z0-9._-]+)/);
        if (subFilter) {
            sig.subFilter = subFilter;
            sig.type = classifySigType(subFilter, sp.type);
        }

        var mMatch = chunk.match(/\/M\s*\(D:([^)]+)\)/);
        if (mMatch) sig.signingTime = parsePdfDate(mMatch[1]);

        var brMatch = chunk.match(/\/ByteRange\s*\[([^\]]+)\]/);
        if (brMatch) sig.byteRange = brMatch[1].trim();

        if (/\/Cert\b/.test(chunk)) sig.hasCert = true;

        if (/\/DocMDP/.test(chunk) || /\/TransformMethod\s*\/DocMDP/.test(chunk)) {
            sig.isMDP = true;
        }

        var contents = findContentsHex(str, pos);
        if (contents && contents.hex) {
            sig.hasContents = true;
            sig.contentsBytes = Math.floor(contents.hex.replace(/\s/g, '').length / 2);
            // 仅对 PKCS#7 类型尝试解析证书
            if (sig.contentsBytes > 0 && (!sig.subFilter || /pkcs7|cades/i.test(sig.subFilter))) {
                var pkcs7Bytes = hexToBytes(contents.hex);
                if (pkcs7Bytes.length > 0) {
                    sig.certs = extractCertsFromPkcs7(pkcs7Bytes);
                }
            }
        }

        var pageIdx = findSignaturePage(str, pos, objs, pageMap);
        if (pageIdx) sig.page = '第 ' + pageIdx + ' 页';

        return sig;
    }

    // ===== 主解析函数 =====
    function parsePdf(bytes, file) {
        var str = bytesToLatin1(bytes);

        var info = {
            fileName: file.name,
            fileSize: file.size,
            version: '',
            pageCount: 0,
            encrypted: false,
            hasAcroForm: false,
            linearized: false,
            objCount: 0,
            hasSignature: false,
            signatureCount: 0,
            signatures: [],
            errors: []
        };

        // 1. PDF 头部
        var headerMatch = str.match(/%PDF-(\d+\.\d+)/);
        if (!headerMatch) {
            info.errors.push('不是有效的 PDF 文件(缺少 %PDF- 头)');
            return info;
        }
        info.version = headerMatch[1];

        // 2. 对象表 & 页码映射
        var objs = findAllObjects(str);
        info.objCount = objs.length;
        var pageMap = buildPageMap(str, objs);

        // 3. 总页数:优先取最大 /Count,否则用 /Type /Page 计数
        var maxCount = 0;
        var reCount = /\/Count\s+(\d+)/g;
        var cm;
        while ((cm = reCount.exec(str)) !== null) {
            var c = parseInt(cm[1], 10);
            if (c > maxCount) maxCount = c;
        }
        if (maxCount > 0) {
            info.pageCount = maxCount;
        } else {
            var pageMatches = str.match(/\/Type\s*\/Page\b/g);
            info.pageCount = pageMatches ? pageMatches.length : 0;
        }

        // 4. 加密 / AcroForm / 线性化
        info.encrypted = /\/Encrypt\s+\d+\s+\d+\s+R/.test(str);
        info.hasAcroForm = /\/AcroForm\s/.test(str) || /\/AcroForm\s*<<</.test(str);
        info.linearized = /\/Linearized\s+1/.test(str);

        // 5. 查找签名字典
        var sigPositions = [];
        var reSig = /\/Type\s*\/(Sig|DocTimeStamp)\b/g;
        var m;
        while ((m = reSig.exec(str)) !== null) {
            sigPositions.push({ pos: m.index, type: m[1] });
        }

        info.signatureCount = sigPositions.length;
        info.hasSignature = sigPositions.length > 0;

        for (var i = 0; i < sigPositions.length; i++) {
            try {
                info.signatures.push(extractSignature(str, sigPositions[i], i, objs, pageMap));
            } catch (e) {
                info.signatures.push({
                    index: i + 1,
                    type: '解析失败',
                    typeKey: 'Sig',
                    filter: '',
                    subFilter: '',
                    signingTime: '',
                    byteRange: '',
                    hasCert: false,
                    hasContents: false,
                    contentsBytes: 0,
                    isMDP: false,
                    page: '',
                    certs: [],
                    error: (e && e.message) || String(e)
                });
            }
        }

        return info;
    }

    // ===== 渲染 =====
    function makeInfoCell(label, value) {
        return Tools.el('div', { class: 'info-item' }, [
            Tools.el('div', { class: 'info-label', text: label }),
            Tools.el('div', { class: 'info-value', text: value == null || value === '' ? '—' : String(value) })
        ]);
    }

    function makeDetailRow(label, value, valueClass) {
        var valEl = Tools.el('span', { class: 'value' + (valueClass ? ' ' + valueClass : '') },
            value == null || value === '' ? '—' : String(value));
        return Tools.el('li', {}, [
            Tools.el('span', { class: 'label', text: label }),
            valEl
        ]);
    }

    function certStatusBadge(notBefore, notAfter) {
        var now = Date.now();
        var nb = notBefore ? Date.parse(notBefore.replace(/-/g, '/')) : NaN;
        var na = notAfter ? Date.parse(notAfter.replace(/-/g, '/')) : NaN;
        if (!isNaN(nb) && now < nb) {
            return Tools.el('span', { class: 'cert-badge notyet', text: '尚未生效' });
        }
        if (!isNaN(na) && now > na) {
            return Tools.el('span', { class: 'cert-badge expired', text: '已过期' });
        }
        if (!isNaN(na) && !isNaN(nb)) {
            return Tools.el('span', { class: 'cert-badge valid', text: '有效期内' });
        }
        return null;
    }

    function renderCertItem(cert, idx) {
        var header = Tools.el('div', { class: 'cert-row' }, [
            Tools.el('span', { class: 'cert-key', text: '证书 #' + (idx + 1) }),
            Tools.el('span', { class: 'cert-val' }, [certStatusBadge(cert.notBefore, cert.notAfter)])
        ]);
        var rows = [header];
        if (cert.subject) {
            rows.push(Tools.el('div', { class: 'cert-row' }, [
                Tools.el('span', { class: 'cert-key', text: '主体' }),
                Tools.el('span', { class: 'cert-val', text: cert.subject })
            ]));
        }
        if (cert.issuer) {
            rows.push(Tools.el('div', { class: 'cert-row' }, [
                Tools.el('span', { class: 'cert-key', text: '颁发者' }),
                Tools.el('span', { class: 'cert-val', text: cert.issuer })
            ]));
        }
        if (cert.notBefore || cert.notAfter) {
            rows.push(Tools.el('div', { class: 'cert-row' }, [
                Tools.el('span', { class: 'cert-key', text: '有效期' }),
                Tools.el('span', {
                    class: 'cert-val',
                    text: (cert.notBefore || '?') + ' ~ ' + (cert.notAfter || '?')
                })
            ]));
        }
        return Tools.el('div', { class: 'cert-item' }, rows);
    }

    function renderSignature(sig) {
        var headerChildren = [
            Tools.el('span', { class: 'sig-num', text: '#' + sig.index }),
            Tools.el('span', { class: 'sig-type', text: sig.type })
        ];
        if (sig.isMDP) {
            headerChildren.push(Tools.el('span', { class: 'sig-tag mdp', text: '文档修改限制 (MDP)' }));
        }
        if (sig.error) {
            headerChildren.push(Tools.el('span', { class: 'sig-tag', text: '解析异常' }));
        }

        var list = Tools.el('ul', { class: 'sig-detail-list' });
        list.appendChild(makeDetailRow('过滤器 Filter', sig.filter || '—'));
        list.appendChild(makeDetailRow('子过滤器 SubFilter', sig.subFilter || '—'));
        list.appendChild(makeDetailRow('签名时间', sig.signingTime || '—'));
        list.appendChild(makeDetailRow('签名位置', sig.page || '未知'));
        if (sig.byteRange) {
            list.appendChild(makeDetailRow('字节范围 ByteRange', sig.byteRange, 'mono'));
        }
        list.appendChild(makeDetailRow('签名数据大小', sig.hasContents ? formatSize(sig.contentsBytes) + ' (' + sig.contentsBytes + ' 字节)' : '—'));
        list.appendChild(makeDetailRow('包含独立证书 (/Cert)', sig.hasCert ? '是' : '否'));
        if (sig.error) {
            list.appendChild(makeDetailRow('错误', sig.error, 'dim'));
        }

        var cardChildren = [Tools.el('div', { class: 'sig-card-header' }, headerChildren), list];

        // 证书信息(可折叠)
        if (sig.hasContents) {
            var certBody = Tools.el('div', { class: 'cert-list hidden' });
            if (sig.certs && sig.certs.length) {
                sig.certs.forEach(function (c, i) { certBody.appendChild(renderCertItem(c, i)); });
            } else {
                certBody.appendChild(Tools.el('div', {
                    class: 'cert-empty',
                    text: '未解析到证书信息(可能未内嵌证书或非 PKCS#7 结构)'
                }));
            }
            var toggle = Tools.el('div', { class: 'cert-toggle' }, [
                Tools.el('span', { text: '证书信息 ' + (sig.certs && sig.certs.length ? '(' + sig.certs.length + ' 个)' : '') }),
                Tools.el('span', { class: 'arrow', text: '▸' })
            ]);
            (function (tog, body) {
                tog.addEventListener('click', function () {
                    tog.classList.toggle('open');
                    body.classList.toggle('hidden');
                });
            })(toggle, certBody);
            cardChildren.push(toggle);
            cardChildren.push(certBody);
        }

        return Tools.el('div', { class: 'sig-card' }, cardChildren);
    }

    function renderSummary(info) {
        var box = Tools.$('summary-box');
        box.innerHTML = '';

        // 状态横幅
        var statusEl;
        if (info.hasSignature) {
            statusEl = Tools.el('div', { class: 'sig-status signed' }, [
                Tools.el('span', { class: 'sig-status-icon', text: '✍️' }),
                Tools.el('div', { class: 'sig-status-text' }, [
                    document.createTextNode('检测到 ' + info.signatureCount + ' 个数字签名'),
                    Tools.el('span', {
                        class: 'sig-status-sub',
                        text: '注意: 本工具仅检测签名存在性,不验证签名有效性。'
                    })
                ])
            ]);
        } else {
            statusEl = Tools.el('div', { class: 'sig-status unsigned' }, [
                Tools.el('span', { class: 'sig-status-icon', text: '📄' }),
                Tools.el('div', { class: 'sig-status-text' }, [
                    document.createTextNode('未检测到数字签名'),
                    Tools.el('span', {
                        class: 'sig-status-sub',
                        text: '该 PDF 文件不包含数字签名或时间戳。'
                    })
                ])
            ]);
        }
        box.appendChild(statusEl);

        if (info.errors && info.errors.length) {
            info.errors.forEach(function (e) {
                Tools.showBanner('banner', 'warn', e);
            });
        }

        // 信息网格
        var grid = Tools.el('div', { class: 'info-grid' });
        grid.appendChild(makeInfoCell('文件名', info.fileName));
        grid.appendChild(makeInfoCell('文件大小', formatSize(info.fileSize)));
        grid.appendChild(makeInfoCell('PDF 版本', info.version ? 'PDF ' + info.version : '—'));
        grid.appendChild(makeInfoCell('总页数', info.pageCount || '—'));
        grid.appendChild(makeInfoCell('签名数量', info.signatureCount));
        grid.appendChild(makeInfoCell('加密状态', info.encrypted ? '已加密' : '未加密'));
        box.appendChild(grid);
    }

    function renderSignatures(info) {
        var section = Tools.$('signatures-section');
        var box = Tools.$('signatures-box');
        box.innerHTML = '';
        if (!info.hasSignature) {
            section.classList.add('hidden');
            return;
        }
        section.classList.remove('hidden');
        info.signatures.forEach(function (sig) { box.appendChild(renderSignature(sig)); });
    }

    function renderRaw(info) {
        var box = Tools.$('raw-box');
        box.innerHTML = '';
        var grid = Tools.el('div', { class: 'info-grid' });
        grid.appendChild(makeInfoCell('PDF 版本', info.version ? 'PDF ' + info.version : '—'));
        grid.appendChild(makeInfoCell('总页数', info.pageCount || '—'));
        grid.appendChild(makeInfoCell('对象数量', info.objCount));
        grid.appendChild(makeInfoCell('加密 /Encrypt', info.encrypted ? '是' : '否'));
        grid.appendChild(makeInfoCell('AcroForm', info.hasAcroForm ? '是' : '否'));
        grid.appendChild(makeInfoCell('线性化 /Linearized', info.linearized ? '是' : '否'));
        grid.appendChild(makeInfoCell('签名字典数量', info.signatureCount));
        box.appendChild(grid);
    }

    function renderResult(info) {
        var area = Tools.$('result-area');
        area.classList.remove('hidden');
        renderSummary(info);
        renderSignatures(info);
        renderRaw(info);
    }

    // ===== 初始化 =====
    document.addEventListener('DOMContentLoaded', function () {
        var uploadArea = Tools.$('upload-area');
        var fileInput = Tools.$('file-input');
        var fileInfo = Tools.$('file-info');
        var fileNameEl = Tools.$('file-name');
        var fileSizeEl = Tools.$('file-size');
        var fileRemove = Tools.$('file-remove');
        var btnCheck = Tools.$('btn-check');
        var progressWrap = Tools.$('progress-wrap');
        var progressFill = Tools.$('progress-fill');
        var progressText = Tools.$('progress-text');
        var resultArea = Tools.$('result-area');
        var rawToggle = Tools.$('raw-toggle');
        var rawBox = Tools.$('raw-box');

        var currentFile = null;
        var MAX_SIZE = 100 * 1024 * 1024; // 100MB

        function isPdf(file) {
            return file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
        }

        function setFile(file) {
            if (!isPdf(file)) {
                Tools.showBanner('banner', 'error', '请上传 PDF 文件');
                return;
            }
            Tools.clearBanner('banner');
            currentFile = file;
            fileNameEl.textContent = file.name;
            fileSizeEl.textContent = formatSize(file.size);
            fileInfo.classList.remove('hidden');
            btnCheck.disabled = false;
            resultArea.classList.add('hidden');
        }

        function clearFile() {
            currentFile = null;
            fileInfo.classList.add('hidden');
            btnCheck.disabled = true;
            fileInput.value = '';
            resultArea.classList.add('hidden');
            Tools.clearBanner('banner');
        }

        uploadArea.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', function (e) {
            if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
        });
        uploadArea.addEventListener('dragover', function (e) {
            e.preventDefault(); uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', function (e) {
            e.preventDefault(); uploadArea.classList.remove('dragover');
        });
        uploadArea.addEventListener('drop', function (e) {
            e.preventDefault(); uploadArea.classList.remove('dragover');
            var files = e.dataTransfer && e.dataTransfer.files;
            if (files && files[0]) setFile(files[0]);
        });
        fileRemove.addEventListener('click', clearFile);

        rawToggle.addEventListener('click', function () {
            rawToggle.classList.toggle('open');
            rawBox.classList.toggle('hidden');
        });

        btnCheck.addEventListener('click', function () {
            if (!currentFile) return;
            if (currentFile.size > MAX_SIZE) {
                Tools.showBanner('banner', 'error', '文件超过 100MB 限制');
                return;
            }
            Tools.clearBanner('banner');
            btnCheck.disabled = true;
            progressWrap.classList.remove('hidden');
            progressFill.style.width = '10%';
            progressText.textContent = '读取文件中...';

            // 延迟一帧,让进度条先渲染
            setTimeout(function () {
                Tools.readFile(currentFile, 'arrayBuffer').then(function (buf) {
                    progressFill.style.width = '50%';
                    progressText.textContent = '解析 PDF 结构中...';
                    setTimeout(function () {
                        try {
                            var info = parsePdf(new Uint8Array(buf), currentFile);
                            progressFill.style.width = '100%';
                            progressText.textContent = '解析完成';
                            renderResult(info);
                            setTimeout(function () {
                                progressWrap.classList.add('hidden');
                                btnCheck.disabled = false;
                            }, 600);
                        } catch (e) {
                            Tools.showBanner('banner', 'error', '解析失败: ' + ((e && e.message) || e));
                            progressWrap.classList.add('hidden');
                            btnCheck.disabled = false;
                        }
                    }, 0);
                }).catch(function (err) {
                    Tools.showBanner('banner', 'error', '读取文件失败: ' + ((err && err.message) || err));
                    progressWrap.classList.add('hidden');
                    btnCheck.disabled = false;
                });
            }, 0);
        });
    });
})();
