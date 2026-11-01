/* ===== ASCII Text Drawer ===== */
(function () {
    'use strict';

    // 5x5 dot-matrix font. Each glyph = 5 rows, each row = 5 chars ('#' = on).
    var FONT = {
        'A': [' ### ', '#   #', '#####', '#   #', '#   #'],
        'B': ['#### ', '#   #', '#### ', '#   #', '#### '],
        'C': [' ####', '#    ', '#    ', '#    ', ' ####'],
        'D': ['###  ', '#   #', '#   #', '#   #', '###  '],
        'E': ['#####', '#    ', '#### ', '#    ', '#####'],
        'F': ['#####', '#    ', '#### ', '#    ', '#    '],
        'G': [' ####', '#    ', '#  ##', '#   #', ' ####'],
        'H': ['#   #', '#   #', '#####', '#   #', '#   #'],
        'I': ['#####', '  #  ', '  #  ', '  #  ', '#####'],
        'J': ['    #', '    #', '    #', '#   #', ' ### '],
        'K': ['#   #', '#  # ', '###  ', '#  # ', '#   #'],
        'L': ['#    ', '#    ', '#    ', '#    ', '#####'],
        'M': ['#   #', '## ##', '# # #', '#   #', '#   #'],
        'N': ['#   #', '##  #', '# # #', '#  ##', '#   #'],
        'O': [' ### ', '#   #', '#   #', '#   #', ' ### '],
        'P': ['#### ', '#   #', '#### ', '#    ', '#    '],
        'Q': [' ### ', '#   #', '#   #', '#  ##', '### #'],
        'R': ['#### ', '#   #', '#### ', '#  # ', '#   #'],
        'S': [' ####', '#    ', ' ### ', '    #', '#### '],
        'T': ['#####', '  #  ', '  #  ', '  #  ', '  #  '],
        'U': ['#   #', '#   #', '#   #', '#   #', ' ### '],
        'V': ['#   #', '#   #', '#   #', ' # # ', '  #  '],
        'W': ['#   #', '#   #', '# # #', '## ##', '#   #'],
        'X': ['#   #', ' # # ', '  #  ', ' # # ', '#   #'],
        'Y': ['#   #', '#   #', ' ### ', '  #  ', '  #  '],
        'Z': ['#####', '   # ', '  #  ', ' #   ', '#####'],
        '0': [' ### ', '#   #', '#   #', '#   #', ' ### '],
        '1': ['  #  ', ' ##  ', '  #  ', '  #  ', '#####'],
        '2': [' ### ', '#   #', '   # ', '  #  ', '#####'],
        '3': [' ### ', '    #', '  ## ', '    #', ' ### '],
        '4': ['#   #', '#   #', '#####', '    #', '    #'],
        '5': ['#####', '#    ', '#### ', '    #', '#### '],
        '6': [' ### ', '#    ', '#### ', '#   #', ' ### '],
        '7': ['#####', '    #', '   # ', '  #  ', ' #   '],
        '8': [' ### ', '#   #', ' ### ', '#   #', ' ### '],
        '9': [' ### ', '#   #', ' ####', '    #', ' ### '],
        ' ': ['     ', '     ', '     ', '     ', '     '],
        '?': [' ### ', '    #', '  ## ', '     ', '  #  ']
    };

    var GLYPH_ROWS = 5;
    var GLYPH_COLS = 5;

    function repeat(ch, n) {
        var s = '';
        for (var i = 0; i < n; i++) s += ch;
        return s;
    }

    function draw(text, pen, scale) {
        var upper = text.toUpperCase();
        var chars = [];
        var ignored = 0;
        for (var i = 0; i < upper.length; i++) {
            var ch = upper.charAt(i);
            if (FONT[ch]) {
                chars.push(ch);
            } else if (ch !== '\n' && ch !== '\t' && ch.trim() === '') {
                chars.push(' ');
            } else {
                chars.push('?');
                ignored++;
            }
        }

        var gap = repeat(' ', scale); // one blank column between letters
        var lines = [];
        for (var r = 0; r < GLYPH_ROWS; r++) {
            // Vertical scaling: repeat each row `scale` times
            for (var vr = 0; vr < scale; vr++) {
                var line = '';
                for (var c = 0; c < chars.length; c++) {
                    var glyph = FONT[chars[c]];
                    var row = glyph[r];
                    for (var p = 0; p < GLYPH_COLS; p++) {
                        var on = row.charAt(p) === '#';
                        line += repeat(on ? pen : ' ', scale);
                    }
                    line += gap;
                }
                lines.push(line.replace(/\s+$/, ''));
            }
        }
        return { art: lines.join('\n'), count: chars.length, ignored: ignored };
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var inputEl = $('input');
        var penEl = $('pen');
        var scaleEl = $('scale');
        var scaleValEl = $('scale-val');
        var outputEl = $('output');
        var statsEl = $('stats');

        function update() {
            Tools.clearBanner('banner');
            var text = inputEl.value;
            var pen = penEl.value;
            var scale = parseInt(scaleEl.value, 10) || 1;

            if (!text) {
                outputEl.textContent = '在上方输入文本即可生成 ASCII 艺术字';
                outputEl.classList.add('empty');
                statsEl.textContent = '';
                return;
            }

            var res = draw(text, pen, scale);
            outputEl.textContent = res.art;
            outputEl.classList.remove('empty');

            var parts = ['共 ' + res.count + ' 个字符'];
            if (res.ignored > 0) parts.push('已忽略 ' + res.ignored + ' 个不支持字符并显示为 ?');
            parts.push('像素大小 ' + scale + 'x' + scale);
            statsEl.textContent = parts.join('，');
        }

        inputEl.addEventListener('input', update);
        penEl.addEventListener('change', update);
        scaleEl.addEventListener('input', function () {
            scaleValEl.textContent = scaleEl.value;
            update();
        });

        $('btn-copy').addEventListener('click', function () {
            if (outputEl.classList.contains('empty')) {
                Tools.showBanner('banner', 'warn', '没有可复制的结果');
                return;
            }
            Tools.copyText(outputEl.textContent, this, '已复制');
        });

        $('btn-clear').addEventListener('click', function () {
            inputEl.value = '';
            update();
            inputEl.focus();
        });

        update();
    });
})();
