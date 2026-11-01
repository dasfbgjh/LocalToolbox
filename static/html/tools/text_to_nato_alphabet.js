/* ===== Text to NATO Alphabet ===== */
(function () {
    'use strict';

    var NATO = {
        A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot',
        G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliet', K: 'Kilo', L: 'Lima',
        M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo',
        S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey',
        X: 'X-ray', Y: 'Yankee', Z: 'Zulu',
        '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four',
        '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Nine'
    };

    var MORSE = {
        A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.',
        G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..',
        M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
        S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
        Y: '-.--', Z: '--..',
        '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
        '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
        '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.',
        '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-',
        '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
        '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.',
        '$': '...-..-', '@': '.--.-.'
    };

    function buildResult(text, showMorse) {
        var lines = text.split('\n');
        var html = '';
        lines.forEach(function (line) {
            if (!line) { html += '<div class="nato-line">&nbsp;</div>'; return; }
            var parts = '';
            for (var i = 0; i < line.length; i++) {
                var ch = line[i];
                var upper = ch.toUpperCase();
                if (ch === ' ') {
                    parts += '<span class="nato-word" style="opacity:0.4">/</span> ';
                    continue;
                }
                var word = NATO[upper];
                var morse = MORSE[upper];
                if (word) {
                    parts += '<span class="nato-char">' + Tools.escapeHtml(ch) + '</span> ';
                    parts += '<span class="nato-word">' + word + '</span>';
                    if (showMorse && morse) parts += ' <span class="nato-morse">(' + morse + ')</span>';
                    parts += '  ';
                } else {
                    parts += '<span class="nato-char">' + Tools.escapeHtml(ch) + '</span> ';
                }
            }
            html += '<div class="nato-line">' + parts + '</div>';
        });
        return html;
    }

    function buildReference() {
        var html = '';
        var keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            html += '<div class="nato-ref-item">' +
                '<span class="letter">' + k + '</span>' +
                '<span class="word">' + NATO[k] + '</span>' +
                '<span class="morse">' + MORSE[k] + '</span>' +
                '</div>';
        }
        return html;
    }

    document.addEventListener('DOMContentLoaded', function () {
        var input = Tools.$('input');
        var result = Tools.$('result');
        var showMorse = Tools.$('show-morse');
        var reference = Tools.$('reference');

        reference.innerHTML = buildReference();

        function render() {
            var text = input.value;
            if (!text) {
                result.innerHTML = '<div class="nato-empty">输入文本后显示音标字母</div>';
                return;
            }
            result.innerHTML = buildResult(text, showMorse.checked);
        }

        input.addEventListener('input', render);
        showMorse.addEventListener('change', render);
        Tools.$('btn-copy').addEventListener('click', function () {
            var text = result.innerText;
            if (!text || text.indexOf('输入文本后') !== -1) return;
            Tools.copyText(text, this, '已复制');
        });
        Tools.$('btn-clear').addEventListener('click', function () {
            input.value = '';
            render();
            input.focus();
        });

        render();
    });
})();
