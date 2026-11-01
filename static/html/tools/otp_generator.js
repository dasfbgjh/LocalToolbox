/* ===== OTP Generator (TOTP / HOTP) ===== */
(function () {
    'use strict';

    var BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    // ===== Base32 decode (RFC 4648, tolerant of spaces / lowercase / padding) =====
    function base32Decode(input) {
        if (!input) return new Uint8Array(0);
        var clean = input.replace(/\s+/g, '').replace(/=+$/g, '').toUpperCase();
        var bits = '';
        for (var i = 0; i < clean.length; i++) {
            var ch = clean.charAt(i);
            var idx = BASE32_ALPHABET.indexOf(ch);
            if (idx === -1) {
                throw new Error('无效的 Base32 字符：' + ch);
            }
            bits += idx.toString(2).padStart(5, '0');
        }
        var byteLen = Math.floor(bits.length / 8);
        var bytes = new Uint8Array(byteLen);
        for (var j = 0; j < byteLen; j++) {
            bytes[j] = parseInt(bits.substr(j * 8, 8), 2);
        }
        return bytes;
    }

    // ===== Base32 encode (with padding) =====
    function base32Encode(bytes) {
        var bits = '';
        for (var i = 0; i < bytes.length; i++) {
            bits += bytes[i].toString(2).padStart(8, '0');
        }
        var result = '';
        for (var i = 0; i < bits.length; i += 5) {
            var chunk = bits.substr(i, 5);
            if (chunk.length < 5) chunk = chunk.padEnd(5, '0');
            result += BASE32_ALPHABET.charAt(parseInt(chunk, 2));
        }
        while (result.length % 8 !== 0) result += '=';
        return result;
    }

    // ===== HMAC via Web Crypto API =====
    function hmac(keyBytes, messageBytes, algorithm) {
        var algo = { name: 'HMAC', hash: { name: algorithm } };
        return crypto.subtle.importKey('raw', keyBytes, algo, false, ['sign'])
            .then(function (cryptoKey) {
                return crypto.subtle.sign('HMAC', cryptoKey, messageBytes);
            })
            .then(function (sig) { return new Uint8Array(sig); });
    }

    // ===== HOTP (RFC 4226) =====
    function generateHOTP(keyBytes, counter, digits, algorithm) {
        var buffer = new ArrayBuffer(8);
        var view = new DataView(buffer);
        // Split 64-bit counter into high/low 32-bit (counter may exceed 32-bit range)
        view.setUint32(0, Math.floor(counter / 0x100000000));
        view.setUint32(4, counter >>> 0);
        var counterBytes = new Uint8Array(buffer);

        return hmac(keyBytes, counterBytes, algorithm).then(function (hash) {
            // Dynamic truncation
            var offset = hash[hash.length - 1] & 0x0f;
            var binary = ((hash[offset] & 0x7f) << 24) |
                ((hash[offset + 1] & 0xff) << 16) |
                ((hash[offset + 2] & 0xff) << 8) |
                (hash[offset + 3] & 0xff);
            var modulo = Math.pow(10, digits);
            var otp = binary % modulo;
            return otp.toString().padStart(digits, '0');
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var banner = 'banner';

        var secretEl = $('secret');
        var modeEl = $('mode');
        var algorithmEl = $('algorithm');
        var digitsEl = $('digits');
        var periodEl = $('period');
        var counterEl = $('counter');
        var counterRow = $('counter-row');
        var issuerEl = $('issuer');
        var labelEl = $('label');

        var otpCodeEl = $('otp-code');
        var otpProgressFill = $('otp-progress-fill');
        var otpSecondsEl = $('otp-seconds');
        var totpCountdownEl = $('totp-countdown');
        var otpUriEl = $('otp-uri');

        var verifyInputEl = $('verify-input');
        var verifyResultEl = $('verify-result');

        var currentOtp = '';
        var tickTimer = null;
        var lastTotpCounter = -1;

        // ===== Generate random Base32 key (20 bytes) =====
        function generateRandomKey() {
            var arr = new Uint8Array(20);
            crypto.getRandomValues(arr);
            return base32Encode(arr);
        }

        // ===== Build otpauth:// URI =====
        function buildUri(secret) {
            var mode = modeEl.value;
            var algo = algorithmEl.value;
            var digits = parseInt(digitsEl.value, 10);
            var issuer = issuerEl.value.trim();
            var label = labelEl.value.trim() || 'default';
            var labelPart = issuer ? (issuer + ':' + label) : label;
            var params = ['secret=' + secret, 'algorithm=' + algo, 'digits=' + digits];
            if (mode === 'totp') {
                var period = parseInt(periodEl.value, 10) || 30;
                params.push('period=' + period);
            } else {
                var counter = parseInt(counterEl.value, 10) || 0;
                params.push('counter=' + counter);
            }
            if (issuer) params.push('issuer=' + encodeURIComponent(issuer));
            return 'otpauth://' + mode + '/' + encodeURIComponent(labelPart) + '?' + params.join('&');
        }

        // ===== Refresh display =====
        function refresh(showBannerFlag) {
            Tools.clearBanner(banner);
            var secretRaw = secretEl.value.trim();
            if (!secretRaw) {
                currentOtp = '';
                otpCodeEl.textContent = '请输入密钥';
                otpCodeEl.classList.add('empty');
                otpSecondsEl.textContent = '—';
                otpProgressFill.style.width = '0%';
                otpUriEl.textContent = '—';
                return;
            }

            var keyBytes;
            try {
                keyBytes = base32Decode(secretRaw);
            } catch (e) {
                currentOtp = '';
                otpCodeEl.textContent = '密钥无效';
                otpCodeEl.classList.add('empty');
                otpUriEl.textContent = '—';
                if (showBannerFlag) Tools.showBanner(banner, 'error', e.message);
                return;
            }
            if (keyBytes.length === 0) {
                currentOtp = '';
                otpCodeEl.textContent = '请输入密钥';
                otpCodeEl.classList.add('empty');
                otpUriEl.textContent = '—';
                return;
            }

            var digits = parseInt(digitsEl.value, 10) || 6;
            var algo = algorithmEl.value;
            var mode = modeEl.value;
            var cleanSecret = base32Encode(keyBytes).replace(/=+$/, '');

            otpUriEl.textContent = buildUri(cleanSecret);

            if (mode === 'totp') {
                var period = parseInt(periodEl.value, 10) || 30;
                var counter = Math.floor(Date.now() / 1000 / period);
                generateHOTP(keyBytes, counter, digits, algo).then(function (otp) {
                    currentOtp = otp;
                    otpCodeEl.textContent = otp;
                    otpCodeEl.classList.remove('empty');
                    lastTotpCounter = counter;
                    updateCountdown(period);
                });
            } else {
                var counter = parseInt(counterEl.value, 10) || 0;
                generateHOTP(keyBytes, counter, digits, algo).then(function (otp) {
                    currentOtp = otp;
                    otpCodeEl.textContent = otp;
                    otpCodeEl.classList.remove('empty');
                });
            }
        }

        // ===== Countdown / progress for TOTP =====
        function updateCountdown(period) {
            var now = Math.floor(Date.now() / 1000);
            var elapsed = now % period;
            var remaining = period - elapsed;
            var pct = (remaining / period) * 100;
            otpProgressFill.style.width = pct + '%';
            otpSecondsEl.textContent = remaining + 's';
            otpProgressFill.classList.remove('warn', 'danger');
            if (remaining <= 5) otpProgressFill.classList.add('danger');
            else if (remaining <= 10) otpProgressFill.classList.add('warn');
        }

        // ===== Tick loop: update countdown every second, regenerate when period rolls over =====
        function startTick() {
            stopTick();
            tickTimer = setInterval(function () {
                if (modeEl.value !== 'totp') return;
                var period = parseInt(periodEl.value, 10) || 30;
                var now = Math.floor(Date.now() / 1000);
                var counter = Math.floor(now / period);
                if (counter !== lastTotpCounter) {
                    refresh(false);
                } else {
                    updateCountdown(period);
                }
            }, 1000);
        }

        function stopTick() {
            if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        }

        // ===== Toggle counter row visibility =====
        function syncCounterRow() {
            if (modeEl.value === 'hotp') {
                counterRow.hidden = false;
                totpCountdownEl.style.display = 'none';
            } else {
                counterRow.hidden = true;
                totpCountdownEl.style.display = 'flex';
            }
        }

        // ===== Verify OTP =====
        function verify() {
            Tools.clearBanner(banner);
            verifyResultEl.textContent = '';
            verifyResultEl.className = 'otp-verify-result';

            var input = verifyInputEl.value.trim();
            var secretRaw = secretEl.value.trim();
            if (!secretRaw) {
                Tools.showBanner(banner, 'warn', '请先配置密钥');
                return;
            }
            if (!input) {
                Tools.showBanner(banner, 'warn', '请输入待验证的 OTP 码');
                return;
            }
            if (!/^\d+$/.test(input)) {
                verifyResultEl.textContent = '✗ OTP 码只能包含数字';
                verifyResultEl.classList.add('fail');
                return;
            }

            var keyBytes;
            try { keyBytes = base32Decode(secretRaw); }
            catch (e) {
                Tools.showBanner(banner, 'error', e.message);
                return;
            }

            var digits = parseInt(digitsEl.value, 10) || 6;
            var algo = algorithmEl.value;
            var mode = modeEl.value;

            if (mode === 'totp') {
                var period = parseInt(periodEl.value, 10) || 30;
                var baseCounter = Math.floor(Date.now() / 1000 / period);
                // Check ±1 window
                var counters = [baseCounter - 1, baseCounter, baseCounter + 1];
                var promises = counters.map(function (c) {
                    return generateHOTP(keyBytes, c, digits, algo);
                });
                Promise.all(promises).then(function (codes) {
                    var matched = -1;
                    for (var i = 0; i < codes.length; i++) {
                        if (codes[i] === input) { matched = i; break; }
                    }
                    if (matched >= 0) {
                        var offsetLabel = matched === 0 ? '上一周期' : (matched === 1 ? '当前周期' : '下一周期');
                        verifyResultEl.textContent = '✓ 验证通过（' + offsetLabel + '）';
                        verifyResultEl.classList.add('ok');
                    } else {
                        verifyResultEl.textContent = '✗ 验证失败，OTP 码不匹配';
                        verifyResultEl.classList.add('fail');
                    }
                });
            } else {
                var counter = parseInt(counterEl.value, 10) || 0;
                generateHOTP(keyBytes, counter, digits, algo).then(function (code) {
                    if (code === input) {
                        verifyResultEl.textContent = '✓ 验证通过（计数器 ' + counter + '）';
                        verifyResultEl.classList.add('ok');
                    } else {
                        verifyResultEl.textContent = '✗ 验证失败，OTP 码不匹配';
                        verifyResultEl.classList.add('fail');
                    }
                });
            }
        }

        // ===== Event wiring =====
        var refreshDebounced = (function () {
            var t = null;
            return function () {
                if (t) clearTimeout(t);
                t = setTimeout(function () { refresh(false); }, 200);
            };
        })();

        secretEl.addEventListener('input', refreshDebounced);
        algorithmEl.addEventListener('change', function () { refresh(false); });
        digitsEl.addEventListener('change', function () { refresh(false); });
        periodEl.addEventListener('input', refreshDebounced);
        counterEl.addEventListener('input', function () { refresh(false); });
        issuerEl.addEventListener('input', function () { refresh(false); });
        labelEl.addEventListener('input', function () { refresh(false); });

        modeEl.addEventListener('change', function () {
            syncCounterRow();
            refresh(false);
        });

        $('btn-gen-key').addEventListener('click', function () {
            secretEl.value = generateRandomKey();
            refresh(true);
            Tools.showBanner(banner, 'success', '已生成新的随机密钥（20 字节）');
        });

        $('btn-inc-counter').addEventListener('click', function () {
            var c = parseInt(counterEl.value, 10) || 0;
            counterEl.value = c + 1;
            refresh(false);
        });

        $('btn-refresh').addEventListener('click', function () { refresh(true); });

        $('btn-copy-otp').addEventListener('click', function () {
            if (!currentOtp) {
                Tools.showBanner(banner, 'warn', '暂无 OTP 码可复制');
                return;
            }
            Tools.copyText(currentOtp, this, '已复制');
        });

        $('btn-copy-uri').addEventListener('click', function () {
            var uri = otpUriEl.textContent;
            if (!uri || uri === '—') {
                Tools.showBanner(banner, 'warn', '暂无 URI 可复制');
                return;
            }
            Tools.copyText(uri, this, '已复制');
        });

        $('btn-verify').addEventListener('click', verify);
        verifyInputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') verify();
        });

        // ===== Init =====
        syncCounterRow();
        refresh(false);
        startTick();
    });
})();
