/* ===== Password Strength Analyser ===== */
(function () {
    'use strict';

    // Character set sizes
    var SIZE_LOWER = 26;
    var SIZE_UPPER = 26;
    var SIZE_DIGIT = 10;
    var SIZE_SYMBOL = 33; // common printable ASCII special chars
    var GUESSES_PER_SEC = 1e9; // 10 亿次/秒

    var RE_LOWER = /[a-z]/g;
    var RE_UPPER = /[A-Z]/g;
    var RE_DIGIT = /[0-9]/g;
    var RE_SYMBOL = /[^a-zA-Z0-9]/g;

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var passwordEl = $('password');
        var toggleEl = $('toggle-visibility');
        var fillEl = $('strength-fill');
        var labelEl = $('strength-label');

        function analyze() {
            var pwd = passwordEl.value;
            var len = pwd.length;

            var lower = (pwd.match(RE_LOWER) || []).length;
            var upper = (pwd.match(RE_UPPER) || []).length;
            var digit = (pwd.match(RE_DIGIT) || []).length;
            var symbol = (pwd.match(RE_SYMBOL) || []).length;

            var charsetSize = 0;
            if (lower > 0) charsetSize += SIZE_LOWER;
            if (upper > 0) charsetSize += SIZE_UPPER;
            if (digit > 0) charsetSize += SIZE_DIGIT;
            if (symbol > 0) charsetSize += SIZE_SYMBOL;

            var entropy = charsetSize > 0 ? len * Math.log2(charsetSize) : 0;

            // unique chars
            var unique = {};
            for (var i = 0; i < pwd.length; i++) unique[pwd.charAt(i)] = true;
            var uniqueCount = Object.keys(unique).length;

            // crack time: average = 2^entropy / 2 guesses
            var totalGuesses = charsetSize > 0 ? Math.pow(2, entropy) / 2 : 0;
            var seconds = totalGuesses / GUESSES_PER_SEC;

            renderStats(len, charsetSize, entropy, seconds, uniqueCount);
            renderCharTypes(lower, upper, digit, symbol);
            renderStrength(entropy, charsetSize);
            renderSuggestions(pwd, len, lower, upper, digit, symbol);
        }

        function renderStats(len, charsetSize, entropy, seconds, uniqueCount) {
            $('r-length').textContent = len;
            $('r-charset').textContent = charsetSize;
            $('r-entropy').textContent = entropy.toFixed(1) + ' bits';
            $('r-crack').textContent = formatTime(seconds);
            $('r-unique').textContent = uniqueCount;
        }

        function formatTime(sec) {
            if (sec <= 0) return '—';
            if (sec < 1) return '不到 1 秒';
            if (sec < 60) return Math.round(sec) + ' 秒';
            if (sec < 3600) return Math.round(sec / 60) + ' 分钟';
            if (sec < 86400) return Math.round(sec / 3600) + ' 小时';
            if (sec < 31536000) return Math.round(sec / 86400) + ' 天';
            var years = sec / 31536000;
            if (years < 1000) return Math.round(years) + ' 年';
            if (years < 1e6) return Math.round(years / 1000) + ' 千年';
            if (years < 1e9) return Math.round(years / 1e6) + ' 百万年';
            if (years < 1e12) return Math.round(years / 1e9) + ' 亿年';
            return '几乎不可能破解';
        }

        function renderCharTypes(lower, upper, digit, symbol) {
            setCharType('ct-lower', lower);
            setCharType('ct-upper', upper);
            setCharType('ct-digit', digit);
            setCharType('ct-symbol', symbol);
        }

        function setCharType(id, count) {
            var item = $(id);
            var val = $(id + '-val');
            val.textContent = count;
            if (count > 0) {
                item.classList.add('on');
                item.classList.remove('off');
            } else {
                item.classList.add('off');
                item.classList.remove('on');
            }
        }

        function renderStrength(entropy, charsetSize) {
            var cls, label, pct;
            if (charsetSize === 0) {
                cls = ''; label = '—'; pct = 0;
            } else if (entropy < 40) {
                cls = 'weak'; label = '弱'; pct = 25;
            } else if (entropy < 60) {
                cls = 'medium'; label = '中'; pct = 50;
            } else if (entropy < 80) {
                cls = 'strong'; label = '强'; pct = 75;
            } else {
                cls = 'very-strong'; label = '很强'; pct = 100;
            }
            fillEl.className = 'strength-fill' + (cls ? ' ' + cls : '');
            fillEl.style.width = pct + '%';
            labelEl.className = 'strength-label' + (cls ? ' ' + cls : '');
            labelEl.textContent = label;
        }

        function renderSuggestions(pwd, len, lower, upper, digit, symbol) {
            var list = $('suggestion-list');
            list.innerHTML = '';
            var items = [];

            if (len === 0) {
                items.push({ ok: false, text: '请输入密码以获取改进建议' });
            } else {
                if (len < 8) {
                    items.push({ ok: false, text: '密码长度过短，建议至少使用 8 位字符' });
                } else if (len < 12) {
                    items.push({ ok: false, text: '密码长度一般，建议使用 12 位以上字符更安全' });
                } else {
                    items.push({ ok: true, text: '密码长度充足（' + len + ' 位）' });
                }

                if (lower === 0) items.push({ ok: false, text: '缺少小写字母，添加 a-z 可增强强度' });
                else items.push({ ok: true, text: '包含小写字母' });

                if (upper === 0) items.push({ ok: false, text: '缺少大写字母，添加 A-Z 可增强强度' });
                else items.push({ ok: true, text: '包含大写字母' });

                if (digit === 0) items.push({ ok: false, text: '缺少数字，添加 0-9 可增强强度' });
                else items.push({ ok: true, text: '包含数字' });

                if (symbol === 0) items.push({ ok: false, text: '缺少特殊字符，添加 !@#$%^&* 等可大幅增强强度' });
                else items.push({ ok: true, text: '包含特殊字符' });

                // check common sequences / repeats
                if (/(.)\1{2,}/.test(pwd)) {
                    items.push({ ok: false, text: '检测到连续重复字符，建议避免如 aaa、111 等模式' });
                }
                if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf|zxcv)/i.test(pwd)) {
                    items.push({ ok: false, text: '检测到常见键盘序列，建议避免顺序字符' });
                }
            }

            items.forEach(function (it) {
                var li = Tools.el('li', { class: it.ok ? 'ok' : '' }, [
                    Tools.el('span', { class: 'ic', text: it.ok ? '✓' : '⚠' }),
                    Tools.el('span', { text: it.text })
                ]);
                list.appendChild(li);
            });
        }

        toggleEl.addEventListener('click', function () {
            if (passwordEl.type === 'password') {
                passwordEl.type = 'text';
                toggleEl.textContent = '🙈';
            } else {
                passwordEl.type = 'password';
                toggleEl.textContent = '👁';
            }
        });

        passwordEl.addEventListener('input', analyze);

        analyze();
    });
})();
