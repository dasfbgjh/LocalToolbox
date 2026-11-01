/* ===== Lorem Ipsum Generator ===== */
(function () {
    'use strict';

    var VOCABULARY = [
        'a', 'ac', 'accumsan', 'ad', 'adipiscing', 'aenean', 'aliquam', 'aliquet', 'amet', 'ante',
        'aptent', 'arcu', 'at', 'auctor', 'bibendum', 'blandit', 'class', 'commodo', 'condimentum',
        'congue', 'consectetur', 'consequat', 'conubia', 'convallis', 'cras', 'cubilia', 'cum',
        'curabitur', 'curae', 'dapibus', 'diam', 'dictum', 'dictumst', 'dignissim', 'dolor', 'donec',
        'dui', 'duis', 'egestas', 'eget', 'eleifend', 'elementum', 'elit', 'enim', 'erat', 'eros',
        'est', 'et', 'etiam', 'eu', 'euismod', 'facilisi', 'faucibus', 'felis', 'fermentum', 'feugiat',
        'fringilla', 'fusce', 'gravida', 'habitant', 'habitasse', 'hac', 'hendrerit', 'himenaeos',
        'iaculis', 'id', 'imperdiet', 'in', 'inceptos', 'integer', 'interdum', 'ipsum', 'justo',
        'lacinia', 'lacus', 'laoreet', 'lectus', 'leo', 'ligula', 'litora', 'lobortis', 'lorem',
        'luctus', 'maecenas', 'magna', 'magnis', 'malesuada', 'massa', 'mattis', 'mauris', 'metus',
        'mi', 'molestie', 'mollis', 'montes', 'morbi', 'mus', 'nam', 'nascetur', 'natoque', 'nec',
        'neque', 'netus', 'nisi', 'nisl', 'non', 'nostra', 'nulla', 'nullam', 'nunc', 'odio', 'orci',
        'ornare', 'parturient', 'pellentesque', 'penatibus', 'per', 'pharetra', 'phasellus',
        'placerat', 'platea', 'porta', 'porttitor', 'posuere', 'potenti', 'praesent', 'pretium',
        'primis', 'proin', 'pulvinar', 'purus', 'quam', 'quis', 'quisque', 'rhoncus', 'ridiculus',
        'risus', 'rutrum', 'sagittis', 'sapien', 'scelerisque', 'sed', 'sem', 'semper', 'senectus',
        'sit', 'sociis', 'sociosqu', 'sodales', 'sollicitudin', 'suscipit', 'suspendisse', 'taciti',
        'tellus', 'tempor', 'tempus', 'tincidunt', 'torquent', 'tortor', 'turpis', 'ullamcorper',
        'ultrices', 'ultricies', 'urna', 'varius', 'vehicula', 'vel', 'velit', 'venenatis',
        'vestibulum', 'vitae', 'vivamus', 'viverra', 'volutpat', 'vulputate'
    ];

    var FIRST_SENTENCE = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

    function randInt(max) {
        var arr = new Uint32Array(1);
        crypto.getRandomValues(arr);
        return arr[0] % max;
    }

    function generateSentence(wordCount) {
        var words = [];
        for (var i = 0; i < wordCount; i++) {
            words.push(VOCABULARY[randInt(VOCABULARY.length)]);
        }
        var s = words.join(' ');
        return s.charAt(0).toUpperCase() + s.slice(1) + '.';
    }

    function generate(opts) {
        var paragraphs = [];
        for (var p = 0; p < opts.paragraphCount; p++) {
            var sentences = [];
            for (var s = 0; s < opts.sentencePerParagraph; s++) {
                sentences.push(generateSentence(opts.wordCount));
            }
            paragraphs.push(sentences);
        }
        if (opts.startWithLoremIpsum && paragraphs.length > 0) {
            paragraphs[0][0] = FIRST_SENTENCE;
        }
        if (opts.asHTML) {
            return paragraphs.map(function (s) { return '<p>' + s.join(' ') + '</p>'; }).join('\n\n');
        }
        return paragraphs.map(function (s) { return s.join(' '); }).join('\n\n');
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var paragraphsEl = $('paragraphs');
        var sentencesEl = $('sentences');
        var wordsEl = $('words');
        var startLoremEl = $('start-lorem');
        var asHtmlEl = $('as-html');
        var outputEl = $('output');
        var statsEl = $('stats');

        function syncLabel(slider, label) {
            slider.addEventListener('input', function () { label.textContent = slider.value; });
        }
        syncLabel(paragraphsEl, $('paragraphs-val'));
        syncLabel(sentencesEl, $('sentences-val'));
        syncLabel(wordsEl, $('words-val'));

        function run() {
            var text = generate({
                paragraphCount: parseInt(paragraphsEl.value, 10) || 1,
                sentencePerParagraph: parseInt(sentencesEl.value, 10) || 1,
                wordCount: parseInt(wordsEl.value, 10) || 5,
                startWithLoremIpsum: startLoremEl.checked,
                asHTML: asHtmlEl.checked
            });
            outputEl.value = text;
            var charCount = text.length;
            var wordCount = text.split(/\s+/).filter(Boolean).length;
            statsEl.textContent = '共 ' + wordCount + ' 词，' + charCount + ' 字符';
        }

        [paragraphsEl, sentencesEl, wordsEl].forEach(function (el) { el.addEventListener('change', run); });
        startLoremEl.addEventListener('change', run);
        asHtmlEl.addEventListener('change', run);
        $('btn-generate').addEventListener('click', run);
        $('btn-copy').addEventListener('click', function () {
            if (!outputEl.value) return;
            Tools.copyText(outputEl.value, this, '已复制');
        });
        $('btn-clear').addEventListener('click', function () {
            outputEl.value = '';
            statsEl.textContent = '';
        });

        run();
    });
})();
