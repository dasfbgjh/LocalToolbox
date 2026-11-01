/* ===== Chmod Calculator ===== */
(function () {
    'use strict';

    var GROUPS = ['owner', 'group', 'public'];
    var SCOPES = ['read', 'write', 'execute'];
    var VALUES = { read: 4, write: 2, execute: 1 };

    var perms = {
        owner: { read: false, write: false, execute: false },
        group: { read: false, write: false, execute: false },
        public: { read: false, write: false, execute: false }
    };

    function computeOctal() {
        var octal = '';
        GROUPS.forEach(function (g) {
            var n = 0;
            SCOPES.forEach(function (s) {
                if (perms[g][s]) n += VALUES[s];
            });
            octal += n.toString(8);
        });
        return octal;
    }

    function computeSymbolic() {
        var sym = '';
        GROUPS.forEach(function (g) {
            sym += perms[g].read ? 'r' : '-';
            sym += perms[g].write ? 'w' : '-';
            sym += perms[g].execute ? 'x' : '-';
        });
        return sym;
    }

    function setFromOctal(octal) {
        if (!/^[0-7]{3}$/.test(octal)) return false;
        for (var i = 0; i < 3; i++) {
            var n = parseInt(octal[i], 8);
            perms[GROUPS[i]].read = !!(n & 4);
            perms[GROUPS[i]].write = !!(n & 2);
            perms[GROUPS[i]].execute = !!(n & 1);
        }
        return true;
    }

    document.addEventListener('DOMContentLoaded', function () {
        var octalEl = Tools.$('octal');
        var symbolicEl = Tools.$('symbolic');
        var cmdEl = Tools.$('cmd');
        var checkboxes = Tools.$$('.chmod-check input');

        function syncCheckboxes() {
            checkboxes.forEach(function (cb) {
                var g = cb.getAttribute('data-group');
                var s = cb.getAttribute('data-scope');
                cb.checked = perms[g][s];
            });
        }

        function render() {
            var octal = computeOctal();
            var symbolic = computeSymbolic();
            octalEl.textContent = octal;
            symbolicEl.textContent = symbolic;
            cmdEl.textContent = 'chmod ' + octal + ' path';
        }

        checkboxes.forEach(function (cb) {
            cb.addEventListener('change', function () {
                var g = cb.getAttribute('data-group');
                var s = cb.getAttribute('data-scope');
                perms[g][s] = cb.checked;
                render();
            });
        });

        Tools.$$('.preset-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var octal = btn.getAttribute('data-octal');
                if (setFromOctal(octal)) {
                    syncCheckboxes();
                    render();
                }
            });
        });

        // Default to 755
        setFromOctal('755');
        syncCheckboxes();
        render();

        Tools.$('btn-copy').addEventListener('click', function () {
            Tools.copyText(cmdEl.textContent, this, '已复制');
        });
    });
})();
