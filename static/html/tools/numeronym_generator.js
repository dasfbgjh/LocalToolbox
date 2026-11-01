/* ===== Numeronym Generator ===== */
(function () {
    'use strict';

    function toNumeronym(word) {
        if (word.length <= 3) return word;
        return word[0] + (word.length - 2) + word[word.length - 1];
    }

    document.addEventListener('DOMContentLoaded', function () {
        var input = Tools.$('input');
        var result = Tools.$('result');
        var stats = Tools.$('stats');

        function render() {
            var text = input.value.trim();
            result.innerHTML = '';
            if (!text) {
                result.appendChild(Tools.el('div', { class: 'numeronym-empty', text: '输入文本后显示数字缩写' }));
                stats.textContent = '';
                return;
            }
            var words = text.split(/\s+/);
            var abbreviations = [];
            words.forEach(function (word) {
                var abbr = toNumeronym(word);
                abbreviations.push(abbr);
                var same = abbr === word;
                result.appendChild(Tools.el('div', { class: 'numeronym-row' + (same ? ' same' : '') }, [
                    Tools.el('span', { class: 'orig', text: word }),
                    Tools.el('span', { class: 'arrow', text: '→' }),
                    Tools.el('span', { class: 'abbr', text: abbr })
                ]));
            });
            stats.textContent = '共 ' + words.length + ' 个词';
        }

        input.addEventListener('input', render);

        Tools.$('btn-copy').addEventListener('click', function () {
            var abbrs = [];
            Tools.$$('.numeronym-row .abbr').forEach(function (el) { abbrs.push(el.textContent); });
            if (abbrs.length === 0) return;
            Tools.copyText(abbrs.join(' '), this, '已复制');
        });

        render();
    });
})();
