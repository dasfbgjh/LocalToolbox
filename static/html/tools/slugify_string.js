/* ===== Slugify String ===== */
(function () {
    'use strict';

    // Minimal pinyin mapping for common Chinese characters
    // Covers frequently used chars; fallback uses unicode for unmapped
    var PINYIN = {
        '的': 'de', '是': 'shi', '了': 'le', '在': 'zai', '有': 'you', '和': 'he',
        '人': 'ren', '这': 'zhe', '中': 'zhong', '大': 'da', '为': 'wei', '上': 'shang',
        '个': 'ge', '国': 'guo', '我': 'wo', '以': 'yi', '要': 'yao', '他': 'ta',
        '时': 'shi', '来': 'lai', '用': 'yong', '们': 'men', '生': 'sheng', '到': 'dao',
        '作': 'zuo', '地': 'di', '于': 'yu', '出': 'chu', '会': 'hui', '三': 'san',
        '二': 'er', '一': 'yi', '四': 'si', '五': 'wu', '六': 'liu', '七': 'qi',
        '八': 'ba', '九': 'jiu', '十': 'shi', '百': 'bai', '千': 'qian', '万': 'wan',
        '你': 'ni', '她': 'ta', '它': 'ta', '们': 'men', '那': 'na', '些': 'xie',
        '可': 'ke', '以': 'yi', '对': 'dui', '与': 'yu', '或': 'huo', '但': 'dan',
        '不': 'bu', '没': 'mei', '把': 'ba', '被': 'bei', '让': 'rang', '使': 'shi',
        '给': 'gei', '到': 'dao', '从': 'cong', '向': 'xiang', '里': 'li', '外': 'wai',
        '下': 'xia', '前': 'qian', '后': 'hou', '左': 'zuo', '右': 'you', '内': 'nei',
        '多': 'duo', '少': 'shao', '高': 'gao', '低': 'di', '长': 'chang', '短': 'duan',
        '好': 'hao', '坏': 'huai', '新': 'xin', '旧': 'jiu', '快': 'kuai', '慢': 'man',
        '开': 'kai', '关': 'guan', '进': 'jin', '退': 'tui', '买': 'mai', '卖': 'mai',
        '看': 'kan', '听': 'ting', '说': 'shuo', '读': 'du', '写': 'xie', '想': 'xiang',
        '做': 'zuo', '吃': 'chi', '喝': 'he', '穿': 'chuan', '住': 'zhu', '行': 'xing',
        '玩': 'wan', '乐': 'le', '爱': 'ai', '恨': 'hen', '怕': 'pa', '急': 'ji',
        '段': 'duan', '节': 'jie', '章': 'zhang', '页': 'ye', '本': 'ben', '册': 'ce',
        '技': 'ji', '巧': 'qiao', '性': 'xing', '能': 'neng', '对': 'dui', '比': 'bi',
        '语': 'yu', '言': 'yan', '文': 'wen', '字': 'zi', '数': 'shu', '据': 'ju',
        '表': 'biao', '图': 'tu', '片': 'pian', '形': 'xing', '状': 'zhuang',
        '标': 'biao', '题': 'ti', '内': 'nei', '容': 'rong', '分': 'fen', '类': 'lei',
        '工': 'gong', '具': 'ju', '程': 'cheng', '序': 'xu', '代': 'dai', '码': 'ma',
        '测': 'ce', '试': 'shi', '调': 'diao', '整': 'zheng', '修': 'xiu', '改': 'gai',
        '添': 'tian', '加': 'jia', '删': 'shan', '除': 'chu', '移': 'yi', '动': 'dong',
        '静': 'jing', '态': 'tai', '方': 'fang', '法': 'fa', '式': 'shi', '类': 'lei',
        '型': 'xing', '结': 'jie', '果': 'guo', '原': 'yuan', '因': 'yin', '条': 'tiao',
        '件': 'jian', '状': 'zhuang', '态': 'tai', '目': 'mu', '录': 'lu', '路': 'lu',
        '径': 'jing', '文': 'wen', '件': 'jian', '夹': 'jia', '配': 'pei', '置': 'zhi'
    };

    function isChinese(ch) {
        var code = ch.charCodeAt(0);
        return code >= 0x4e00 && code <= 0x9fff;
    }

    function isEmoji(ch) {
        var code = ch.charCodeAt(0);
        return code >= 0x1f000 || (code >= 0x2600 && code <= 0x27bf);
    }

    function transliterateChar(ch) {
        if (PINYIN[ch]) return PINYIN[ch];
        // Fallback: use unicode escape without the \u prefix
        return 'u' + ch.charCodeAt(0).toString(16);
    }

    function slugify(text, opts) {
        if (!text) return '';
        var result = '';
        for (var i = 0; i < text.length; i++) {
            var ch = text[i];
            if (opts.stripEmoji && isEmoji(ch)) continue;
            if (isChinese(ch)) {
                if (opts.transliterate) {
                    result += (result && result[result.length - 1] !== opts.sep ? opts.sep : '') + transliterateChar(ch) + opts.sep;
                } else {
                    result += ch;
                }
                continue;
            }
            if (/[a-zA-Z0-9]/.test(ch)) {
                result += ch;
            } else if (ch === ' ' || ch === '\t' || ch === '\n') {
                if (result && result[result.length - 1] !== opts.sep) result += opts.sep;
            } else if (ch === opts.sep) {
                if (result && result[result.length - 1] !== opts.sep) result += opts.sep;
            }
            // else: skip other special chars
        }
        if (opts.lowercase) result = result.toLowerCase();
        if (opts.collapse) {
            var re = new RegExp('\\' + (opts.sep === ' ' ? ' ' : opts.sep) + '+', 'g');
            result = result.replace(re, opts.sep);
        }
        // trim leading/trailing separator
        var trimRe = new RegExp('^\\' + (opts.sep === ' ' ? ' ' : opts.sep) + '+|\\' + (opts.sep === ' ' ? ' ' : opts.sep) + '+$', 'g');
        result = result.replace(trimRe, '');
        return result;
    }

    document.addEventListener('DOMContentLoaded', function () {
        var input = Tools.$('input');
        var separator = Tools.$('separator');
        var lowercase = Tools.$('lowercase');
        var transliterate = Tools.$('transliterate');
        var stripEmoji = Tools.$('strip-emoji');
        var collapse = Tools.$('collapse');
        var output = Tools.$('output');
        var stats = Tools.$('stats');

        function run() {
            var opts = {
                sep: separator.value,
                lowercase: lowercase.checked,
                transliterate: transliterate.checked,
                stripEmoji: stripEmoji.checked,
                collapse: collapse.checked
            };
            var result = slugify(input.value, opts);
            output.textContent = result || '（空）';
            output.classList.toggle('empty', !result);
            stats.textContent = result ? '长度: ' + result.length + ' 字符' : '';
        }

        input.addEventListener('input', run);
        separator.addEventListener('change', run);
        lowercase.addEventListener('change', run);
        transliterate.addEventListener('change', run);
        stripEmoji.addEventListener('change', run);
        collapse.addEventListener('change', run);

        Tools.$('btn-copy').addEventListener('click', function () {
            if (!output.textContent || output.classList.contains('empty')) return;
            Tools.copyText(output.textContent, this, '已复制');
        });

        Tools.$$('.example-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                input.value = btn.getAttribute('data-text');
                run();
            });
        });

        run();
    });
})();
