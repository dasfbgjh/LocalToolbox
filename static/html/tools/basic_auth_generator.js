/* ===== Basic Auth Generator ===== */
(function () {
    'use strict';

    function utf8ToBase64(str) {
        // Handle UTF-8 properly
        var bytes = new TextEncoder().encode(str);
        var binary = '';
        for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    function base64ToUtf8(b64) {
        var binary = atob(b64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var username = $('username');
        var password = $('password');
        var headerOutput = $('header-output');
        var tokenOutput = $('token-output');
        var decodeInput = $('decode-input');
        var decodedUser = $('decoded-user');
        var decodedPwd = $('decoded-pwd');
        var banner = 'banner-container';

        function generate() {
            Tools.clearBanner(banner);
            var user = username.value;
            var pwd = password.value;
            if (!user && !pwd) {
                Tools.showBanner(banner, 'warn', '请输入用户名或密码');
                return;
            }
            var token = utf8ToBase64(user + ':' + pwd);
            tokenOutput.textContent = token;
            headerOutput.textContent = 'Authorization: Basic ' + token;
        }

        function decode() {
            Tools.clearBanner(banner);
            var input = decodeInput.value.trim();
            if (!input) {
                decodedUser.textContent = '—';
                decodedPwd.textContent = '—';
                return;
            }
            // Strip "Authorization: Basic " prefix if present
            var token = input.replace(/^Authorization:\s*Basic\s+/i, '').replace(/^Basic\s+/i, '').trim();
            try {
                var decoded = base64ToUtf8(token);
                var idx = decoded.indexOf(':');
                if (idx === -1) {
                    decodedUser.textContent = decoded;
                    decodedPwd.textContent = '（无）';
                } else {
                    decodedUser.textContent = decoded.substring(0, idx);
                    decodedPwd.textContent = decoded.substring(idx + 1);
                }
            } catch (e) {
                Tools.showBanner(banner, 'error', '无效的 Base64 编码');
                decodedUser.textContent = '解析失败';
                decodedPwd.textContent = '—';
            }
        }

        username.addEventListener('input', generate);
        password.addEventListener('input', generate);
        $('btn-generate').addEventListener('click', generate);
        $('btn-decode').addEventListener('click', decode);
        decodeInput.addEventListener('input', decode);

        $('btn-copy-header').addEventListener('click', function () {
            Tools.copyText(headerOutput.textContent, this, '已复制');
        });
        $('btn-copy-token').addEventListener('click', function () {
            Tools.copyText(tokenOutput.textContent, this, '已复制');
        });

        var pwdVisible = true;
        $('btn-toggle-pwd').addEventListener('click', function () {
            pwdVisible = !pwdVisible;
            password.type = pwdVisible ? 'text' : 'password';
            this.textContent = pwdVisible ? '👁' : '🙈';
        });

        generate();
        decode();
    });
})();
