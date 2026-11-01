/* ===== Text to Binary ===== */
(function () {
    'use strict';

    function textToBinary(text, sep, useUtf16) {
        if (!text) return '';
        var bits = [];
        for (var i = 0; i < text.length; i++) {
            var code;
            if (useUtf16) {
                code = text.codePointAt(i);
                if (code > 0xffff) i++; // surrogate pair, skip next
                bits.push(code.toString(2).padStart(16, '0'));
            } else {
                code = text.charCodeAt(i) & 0xff;
                bits.push(code.toString(2).padStart(8, '0'));
            }
        }
        var s = sep === '\\n' ? '\n' : sep;
        return bits.join(s);
    }

    function binaryToText(bin) {
        if (!bin) return '';
        var cleaned = bin.replace(/[^01]/g, '');
        if (cleaned.length === 0) return '';
        var result = '';
        // Try 16-bit first if length is multiple of 16, else 8-bit
        var bits = 8;
        if (cleaned.length % 16 === 0 && cleaned.length > 8) bits = 16;
        for (var i = 0; i + bits <= cleaned.length; i += bits) {
            var chunk = cleaned.substring(i, i + bits);
            var code = parseInt(chunk, 2);
            result += String.fromCodePoint(code);
        }
        return result;
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var textInput = $('text-input');
        var binInput = $('bin-input');
        var separator = $('separator');
        var useUtf16 = $('use-utf16');
        var binOutput = $('bin-output');
        var textOutput = $('text-output');
        var banner = 'banner-container';

        function encode() {
            Tools.clearBanner(banner);
            var sep = separator.value;
            var result = textToBinary(textInput.value, sep, useUtf16.checked);
            binOutput.value = result;
            if (!result) Tools.showBanner(banner, 'warn', '请输入文本');
        }

        function decode() {
            Tools.clearBanner(banner);
            try {
                var result = binaryToText(binInput.value);
                textOutput.value = result;
                if (!result) Tools.showBanner(banner, 'warn', '请输入有效的二进制字符串');
            } catch (e) {
                Tools.showBanner(banner, 'error', '解码失败: ' + e.message);
            }
        }

        $('btn-encode').addEventListener('click', encode);
        $('btn-decode').addEventListener('click', decode);
        $('btn-copy-bin').addEventListener('click', function () {
            if (binOutput.value) Tools.copyText(binOutput.value, this, '已复制');
        });
        $('btn-copy-text').addEventListener('click', function () {
            if (textOutput.value) Tools.copyText(textOutput.value, this, '已复制');
        });

        textInput.addEventListener('input', encode);
        binInput.addEventListener('input', decode);
        separator.addEventListener('change', encode);
        useUtf16.addEventListener('change', encode);

        encode();
        decode();
    });
})();
