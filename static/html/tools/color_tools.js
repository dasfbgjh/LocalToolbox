'use strict';
document.addEventListener('DOMContentLoaded', function () {
    var mainColor = Tools.$('main-color');
    var pickerHex = Tools.$('picker-hex');
    var colorPreview = Tools.$('color-preview');
    var previewText = Tools.$('preview-text');
    var fmtHex = Tools.$('fmt-hex');
    var fmtRgb = Tools.$('fmt-rgb');
    var fmtHsl = Tools.$('fmt-hsl');
    var fmtHsv = Tools.$('fmt-hsv');
    var fmtCmyk = Tools.$('fmt-cmyk');
    var shadesRow = Tools.$('shades-row');
    var complementaryRow = Tools.$('complementary-row');
    var triadicRow = Tools.$('triadic-row');
    var analogousRow = Tools.$('analogous-row');
    var paletteRow = Tools.$('palette-row');

    // ========== Color conversion functions ==========
    function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

    function hexToRgb(hex) {
        if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
        };
    }

    function rgbToHex(r, g, b) {
        r = clamp(Math.round(r), 0, 255);
        g = clamp(Math.round(g), 0, 255);
        b = clamp(Math.round(b), 0, 255);
        return '#' +
            r.toString(16).padStart(2, '0') +
            g.toString(16).padStart(2, '0') +
            b.toString(16).padStart(2, '0').toUpperCase();
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var diff = max - min;
        var h = 0, s = 0, l = (max + min) / 2;
        if (diff !== 0) {
            s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
            if (max === r) h = ((g - b) / diff + (g < b ? 6 : 0));
            else if (max === g) h = ((b - r) / diff + 2);
            else h = ((r - g) / diff + 4);
            h *= 60;
        }
        return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    function hslToRgb(h, s, l) {
        h = ((h % 360) + 360) % 360 / 360;
        s = clamp(s, 0, 100) / 100;
        l = clamp(l, 0, 100) / 100;
        var r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            var hue2rgb = function (p, q, t) {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }

    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var diff = max - min;
        var h = 0, s = max === 0 ? 0 : diff / max, v = max;
        if (diff !== 0) {
            if (max === r) h = ((g - b) / diff + (g < b ? 6 : 0));
            else if (max === g) h = ((b - r) / diff + 2);
            else h = ((r - g) / diff + 4);
            h *= 60;
        }
        return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(v * 100) };
    }

    function rgbToCmyk(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var k = 1 - Math.max(r, g, b);
        if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
        var c = (1 - r - k) / (1 - k);
        var m = (1 - g - k) / (1 - k);
        var y = (1 - b - k) / (1 - k);
        return {
            c: Math.round(c * 100), m: Math.round(m * 100),
            y: Math.round(y * 100), k: Math.round(k * 100)
        };
    }

    // ========== Parsers ==========
    function parseHex(s) {
        s = s.trim();
        if (s.length > 0 && s[0] !== '#') s = '#' + s;
        if (/^#[0-9A-Fa-f]{6}$/.test(s)) return hexToRgb(s);
        return null;
    }

    function parseRgb(s) {
        var m = s.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
        if (!m) return null;
        return {
            r: clamp(parseInt(m[1], 10), 0, 255),
            g: clamp(parseInt(m[2], 10), 0, 255),
            b: clamp(parseInt(m[3], 10), 0, 255)
        };
    }

    function parseHsl(s) {
        var m = s.match(/hsl\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)/i);
        if (!m) return null;
        return hslToRgb(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
    }

    function parseHsv(s) {
        var m = s.match(/hsv\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)/i);
        if (!m) return null;
        var h = parseInt(m[1], 10);
        var s = parseInt(m[2], 10) / 100;
        var v = parseInt(m[3], 10) / 100;
        var c = v * s;
        var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        var m2 = v - c;
        var r, g, b;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        return {
            r: Math.round((r + m2) * 255),
            g: Math.round((g + m2) * 255),
            b: Math.round((b + m2) * 255)
        };
    }

    function parseCmyk(s) {
        var m = s.match(/cmyk\(\s*(\d+)%?\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)/i);
        if (!m) return null;
        var c = parseInt(m[1], 10) / 100;
        var mm = parseInt(m[2], 10) / 100;
        var y = parseInt(m[3], 10) / 100;
        var k = parseInt(m[4], 10) / 100;
        return {
            r: Math.round(255 * (1 - c) * (1 - k)),
            g: Math.round(255 * (1 - mm) * (1 - k)),
            b: Math.round(255 * (1 - y) * (1 - k))
        };
    }

    // ========== Update logic ==========
    // source: 'picker' | 'hex' | 'rgb' | 'hsl' | 'hsv' | 'cmyk' | null
    function updateAll(rgb, source) {
        if (!rgb) return;
        var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        var hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        var cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);

        // Update picker
        if (source !== 'picker') mainColor.value = hex.toLowerCase();

        // Update text inputs (skip the one being edited)
        if (source !== 'hex') fmtHex.value = hex;
        if (source !== 'rgb') fmtRgb.value = 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')';
        if (source !== 'hsl') fmtHsl.value = 'hsl(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%)';
        if (source !== 'hsv') fmtHsv.value = 'hsv(' + hsv.h + ', ' + hsv.s + '%, ' + hsv.v + '%)';
        if (source !== 'cmyk') fmtCmyk.value = 'cmyk(' + cmyk.c + '%, ' + cmyk.m + '%, ' + cmyk.y + '%, ' + cmyk.k + '%)';

        pickerHex.textContent = hex;
        colorPreview.style.backgroundColor = hex;
        previewText.textContent = hex;

        renderShades(hsl);
        renderHarmony(hsl);
        renderPalette(hsl);
    }

    function renderShades(hsl) {
        shadesRow.innerHTML = '';
        // 5 darker + 5 lighter + current in middle, total 11 cells (深 → 浅)
        var ordered = [10, 20, 30, 40, 50, hsl.l, 60, 70, 80, 90, 95];
        ordered.forEach(function (l) {
            var rgb = hslToRgb(hsl.h, hsl.s, l);
            var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
            var cell = Tools.el('div', {
                class: 'swatch-cell',
                style: { background: hex },
                title: '点击复制 ' + hex
            });
            cell.appendChild(Tools.el('span', { class: 'swatch-label', text: hex }));
            cell.addEventListener('click', function () {
                Tools.copyText(hex, null, '已复制 ' + hex);
                updateAll(rgb, null);
            });
            shadesRow.appendChild(cell);
        });
    }

    function renderHarmony(hsl) {
        // Complementary: hue + 180
        complementaryRow.innerHTML = '';
        var compRgb = hslToRgb(hsl.h + 180, hsl.s, hsl.l);
        var compHex = rgbToHex(compRgb.r, compRgb.g, compRgb.b);
        var compCell = makeHarmonyCell(compHex);
        complementaryRow.appendChild(compCell);

        // Triadic: hue, hue + 120, hue + 240
        triadicRow.innerHTML = '';
        [0, 120, 240].forEach(function (offset) {
            var rgb = hslToRgb(hsl.h + offset, hsl.s, hsl.l);
            var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
            triadicRow.appendChild(makeHarmonyCell(hex));
        });

        // Analogous: -60, -30, 0, +30, +60
        analogousRow.innerHTML = '';
        [-60, -30, 0, 30, 60].forEach(function (offset) {
            var rgb = hslToRgb(hsl.h + offset, hsl.s, hsl.l);
            var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
            analogousRow.appendChild(makeHarmonyCell(hex));
        });
    }

    function makeHarmonyCell(hex) {
        var cell = Tools.el('div', {
            class: 'harmony-cell',
            style: { background: hex },
            title: '点击复制 ' + hex
        });
        cell.appendChild(Tools.el('span', { class: 'h-label', text: hex }));
        cell.addEventListener('click', function () {
            Tools.copyText(hex, null, '已复制 ' + hex);
            var rgb = hexToRgb(hex);
            if (rgb) updateAll(rgb, null);
        });
        return cell;
    }

    function renderPalette(hsl) {
        // 5 colors based on harmony scheme: complementary, triadic, analogous split, etc.
        paletteRow.innerHTML = '';
        var offsets = [0, 30, 180, 210, 330];
        offsets.forEach(function (offset) {
            var rgb = hslToRgb(hsl.h + offset, hsl.s, hsl.l);
            var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
            paletteRow.appendChild(makeHarmonyCell(hex));
        });
    }

    // ========== Event bindings ==========
    mainColor.addEventListener('input', function () {
        var rgb = hexToRgb(mainColor.value);
        if (rgb) updateAll(rgb, 'picker');
    });

    fmtHex.addEventListener('input', function () {
        var rgb = parseHex(fmtHex.value);
        if (rgb) updateAll(rgb, 'hex');
    });
    fmtRgb.addEventListener('input', function () {
        var rgb = parseRgb(fmtRgb.value);
        if (rgb) updateAll(rgb, 'rgb');
    });
    fmtHsl.addEventListener('input', function () {
        var rgb = parseHsl(fmtHsl.value);
        if (rgb) updateAll(rgb, 'hsl');
    });
    fmtHsv.addEventListener('input', function () {
        var rgb = parseHsv(fmtHsv.value);
        if (rgb) updateAll(rgb, 'hsv');
    });
    fmtCmyk.addEventListener('input', function () {
        var rgb = parseCmyk(fmtCmyk.value);
        if (rgb) updateAll(rgb, 'cmyk');
    });

    // Copy buttons
    Tools.$$('.copy-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var key = btn.getAttribute('data-copy');
            var text = '';
            if (key === 'hex') text = fmtHex.value;
            else if (key === 'rgb') text = fmtRgb.value;
            else if (key === 'hsl') text = fmtHsl.value;
            else if (key === 'hsv') text = fmtHsv.value;
            else if (key === 'cmyk') text = fmtCmyk.value;
            Tools.copyText(text, btn, '已复制');
        });
    });

    // Random color
    Tools.$('btn-random').addEventListener('click', function () {
        var hex = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
        var rgb = hexToRgb(hex);
        if (rgb) updateAll(rgb, null);
    });

    // Initial render
    var initRgb = hexToRgb('#6366F1');
    if (initRgb) updateAll(initRgb, null);
});
