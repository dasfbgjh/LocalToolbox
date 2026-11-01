/* ===== UUID Generator ===== */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var versionEl = $('version');
        var countEl = $('count');
        var countValEl = $('count-val');
        var uppercaseEl = $('uppercase');
        var noHyphensEl = $('no-hyphens');
        var addBracesEl = $('add-braces');
        var resultList = $('result-list');

        // ===== Random helpers =====
        function randomBytes(n) {
            var arr = new Uint8Array(n);
            crypto.getRandomValues(arr);
            return arr;
        }

        function bytesToHex(bytes) {
            var hex = '';
            for (var i = 0; i < bytes.length; i++) {
                hex += bytes[i].toString(16).padStart(2, '0');
            }
            return hex;
        }

        // ===== UUID v4 =====
        function uuidv4() {
            if (crypto.randomUUID) return crypto.randomUUID();
            var b = randomBytes(16);
            b[6] = (b[6] & 0x0f) | 0x40;
            b[8] = (b[8] & 0x3f) | 0x80;
            return formatUUID(bytesToHex(b));
        }

        // ===== UUID v1 (time-based) =====
        function uuidv1() {
            var b = randomBytes(16);
            var now = Date.now();
            var gregorian = 0x01b21dd213814000;
            var ts = now * 10000 + gregorian;
            var timeLow = ts & 0xffffffff;
            var timeMid = (ts >>> 32) & 0xffff;
            var timeHi = (ts >>> 48) & 0x0fff;
            b[0] = (timeLow >>> 24) & 0xff;
            b[1] = (timeLow >>> 16) & 0xff;
            b[2] = (timeLow >>> 8) & 0xff;
            b[3] = timeLow & 0xff;
            b[4] = (timeMid >>> 8) & 0xff;
            b[5] = timeMid & 0xff;
            b[6] = ((timeHi >>> 8) & 0x0f) | 0x10;
            b[7] = timeHi & 0xff;
            b[8] = (b[8] & 0x3f) | 0x80;
            return formatUUID(bytesToHex(b));
        }

        // ===== UUID v7 (time-ordered) =====
        function uuidv7() {
            var b = randomBytes(16);
            var now = Date.now();
            b[0] = (now >>> 40) & 0xff;
            b[1] = (now >>> 32) & 0xff;
            b[2] = (now >>> 24) & 0xff;
            b[3] = (now >>> 16) & 0xff;
            b[4] = (now >>> 8) & 0xff;
            b[5] = now & 0xff;
            b[6] = (b[6] & 0x0f) | 0x70;
            b[8] = (b[8] & 0x3f) | 0x80;
            return formatUUID(bytesToHex(b));
        }

        function formatUUID(hex) {
            return hex.substring(0, 8) + '-' +
                hex.substring(8, 12) + '-' +
                hex.substring(12, 16) + '-' +
                hex.substring(16, 20) + '-' +
                hex.substring(20, 32);
        }

        // ===== ULID =====
        var ULID_ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

        function ulid() {
            var now = Date.now();
            var time = [0, 0, 0, 0, 0, 0];
            time[0] = (now >>> 40) & 0xff;
            time[1] = (now >>> 32) & 0xff;
            time[2] = (now >>> 24) & 0xff;
            time[3] = (now >>> 16) & 0xff;
            time[4] = (now >>> 8) & 0xff;
            time[5] = now & 0xff;

            var rand = randomBytes(10);
            var bytes = new Uint8Array(16);
            for (var i = 0; i < 6; i++) bytes[i] = time[i];
            for (var j = 0; j < 10; j++) bytes[6 + j] = rand[j];

            var output = '';
            // 10 chars from timestamp (48 bits)
            output += ULID_ENCODING[(bytes[0] & 224) >> 5];
            output += ULID_ENCODING[bytes[0] & 31];
            output += ULID_ENCODING[(bytes[1] & 248) >> 3];
            output += ULID_ENCODING[((bytes[1] & 7) << 2) | ((bytes[2] & 192) >> 6)];
            output += ULID_ENCODING[(bytes[2] & 62) >> 1];
            output += ULID_ENCODING[((bytes[2] & 1) << 4) | ((bytes[3] & 240) >> 4)];
            output += ULID_ENCODING[((bytes[3] & 15) << 1) | ((bytes[4] & 128) >> 7)];
            output += ULID_ENCODING[(bytes[4] & 124) >> 2];
            output += ULID_ENCODING[((bytes[4] & 3) << 3) | ((bytes[5] & 224) >> 5)];
            output += ULID_ENCODING[bytes[5] & 31];
            // 16 chars from random (80 bits)
            output += ULID_ENCODING[(bytes[6] & 248) >> 3];
            output += ULID_ENCODING[((bytes[6] & 7) << 2) | ((bytes[7] & 192) >> 6)];
            output += ULID_ENCODING[(bytes[7] & 62) >> 1];
            output += ULID_ENCODING[((bytes[7] & 1) << 4) | ((bytes[8] & 240) >> 4)];
            output += ULID_ENCODING[((bytes[8] & 15) << 1) | ((bytes[9] & 128) >> 7)];
            output += ULID_ENCODING[(bytes[9] & 124) >> 2];
            output += ULID_ENCODING[((bytes[9] & 3) << 3) | ((bytes[10] & 224) >> 5)];
            output += ULID_ENCODING[bytes[10] & 31];
            output += ULID_ENCODING[(bytes[11] & 248) >> 3];
            output += ULID_ENCODING[((bytes[11] & 7) << 2) | ((bytes[12] & 192) >> 6)];
            output += ULID_ENCODING[(bytes[12] & 62) >> 1];
            output += ULID_ENCODING[((bytes[12] & 1) << 4) | ((bytes[13] & 240) >> 4)];
            output += ULID_ENCODING[((bytes[13] & 15) << 1) | ((bytes[14] & 128) >> 7)];
            output += ULID_ENCODING[(bytes[14] & 124) >> 2];
            output += ULID_ENCODING[((bytes[14] & 3) << 3) | ((bytes[15] & 224) >> 5)];
            output += ULID_ENCODING[bytes[15] & 31];
            return output;
        }

        function generateOne() {
            var v = versionEl.value;
            var id;
            if (v === 'v4') id = uuidv4();
            else if (v === 'v1') id = uuidv1();
            else if (v === 'v7') id = uuidv7();
            else if (v === 'nil') id = '00000000-0000-0000-0000-000000000000';
            else if (v === 'ulid') id = ulid();
            else id = uuidv4();

            if (v !== 'ulid' && noHyphensEl.checked) id = id.replace(/-/g, '');
            if (uppercaseEl.checked) id = id.toUpperCase();
            if (addBracesEl.checked && v !== 'ulid') id = '{' + id + '}';
            return id;
        }

        function generate() {
            var count = parseInt(countEl.value, 10) || 1;
            if (count < 1) count = 1;
            if (count > 100) count = 100;

            var ids = [];
            for (var i = 0; i < count; i++) ids.push(generateOne());

            resultList.innerHTML = '';
            if (ids.length === 0) {
                resultList.appendChild(Tools.el('div', { class: 'uuid-empty', text: '点击「生成」按钮创建' }));
                return;
            }
            ids.forEach(function (id, idx) {
                var copyBtn = Tools.el('button', {
                    class: 'btn btn-ghost btn-sm btn-copy-item', type: 'button', text: '复制', onclick: function () {
                        Tools.copyText(id, copyBtn, '已复制');
                    }
                });
                resultList.appendChild(Tools.el('div', { class: 'uuid-item' }, [
                    Tools.el('span', { class: 'uuid-idx', text: (idx + 1) }),
                    Tools.el('span', { class: 'uuid-text', text: id }),
                    copyBtn
                ]));
            });
        }

        function copyAll() {
            var items = resultList.querySelectorAll('.uuid-text');
            if (items.length === 0) {
                Tools.showBanner('banner-container', 'warn', '请先生成');
                return;
            }
            var text = '';
            items.forEach(function (el) { text += el.textContent + '\n'; });
            Tools.copyText(text.trim(), $('btn-copy-all'), '已复制全部');
        }

        countEl.addEventListener('input', function () { countValEl.textContent = countEl.value; });
        countEl.addEventListener('change', generate);
        versionEl.addEventListener('change', generate);
        uppercaseEl.addEventListener('change', generate);
        noHyphensEl.addEventListener('change', generate);
        addBracesEl.addEventListener('change', generate);
        $('btn-generate').addEventListener('click', generate);
        $('btn-copy-all').addEventListener('click', copyAll);
        $('btn-clear').addEventListener('click', function () {
            resultList.innerHTML = '';
            resultList.appendChild(Tools.el('div', { class: 'uuid-empty', text: '点击「生成」按钮创建' }));
        });

        generate();
    });
})();
