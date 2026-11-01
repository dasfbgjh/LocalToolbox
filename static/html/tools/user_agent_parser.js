/* ===== User Agent Parser ===== */
(function () {
    'use strict';

    function parseBrowser(ua) {
        // Edge (Chromium based) - must check before Chrome
        var m = ua.match(/Edg(?:e|A|iOS)?[/ ](\d[\d.]+)/);
        if (m) return { name: 'Edge', version: m[1] };
        // Opera
        m = ua.match(/OPR[/ ](\d[\d.]+)/);
        if (m) return { name: 'Opera', version: m[1] };
        // Samsung browser
        m = ua.match(/SamsungBrowser[/ ](\d[\d.]+)/);
        if (m) return { name: 'Samsung Internet', version: m[1] };
        // Firefox
        m = ua.match(/Firefox[/ ](\d[\d.]+)/);
        if (m) return { name: 'Firefox', version: m[1] };
        // Chrome
        m = ua.match(/(?:Chrome|CriOS)[/ ](\d[\d.]+)/);
        if (m) return { name: 'Chrome', version: m[1] };
        // Safari (check after Chrome since Chrome UA contains Safari)
        m = ua.match(/Version[/ ](\d[\d.]+).*Safari/);
        if (m) return { name: 'Safari', version: m[1] };
        // IE
        m = ua.match(/MSIE[/ ](\d[\d.]+)/);
        if (m) return { name: 'Internet Explorer', version: m[1] };
        m = ua.match(/Trident\/.*rv:(\d[\d.]+)/);
        if (m) return { name: 'Internet Explorer', version: m[1] };
        return { name: '未知', version: '—' };
    }

    function parseEngine(ua) {
        var m = ua.match(/Gecko\/(\d+)/);
        if (m) {
            var v = ua.match(/rv:([\d.]+)/);
            return { name: 'Gecko', version: v ? v[1] : m[1] };
        }
        m = ua.match(/AppleWebKit\/([\d.]+)/);
        if (m) {
            // Blink if Chrome/Opera/Edge
            if (/Chrome|CriOS|Edg|OPR/.test(ua)) return { name: 'Blink', version: m[1] };
            return { name: 'WebKit', version: m[1] };
        }
        m = ua.match(/Trident\/([\d.]+)/);
        if (m) return { name: 'Trident', version: m[1] };
        return { name: '未知', version: '—' };
    }

    function parseOS(ua) {
        // Windows
        var m = ua.match(/Windows NT (\d+\.\d+)/);
        if (m) {
            var ver = m[1];
            var map = {
                '10.0': '10/11',
                '6.3': '8.1',
                '6.2': '8',
                '6.1': '7',
                '6.0': 'Vista',
                '5.1': 'XP',
                '5.2': 'XP/Server 2003'
            };
            return { name: 'Windows', version: map[ver] || ver };
        }
        // Android
        m = ua.match(/Android (\d[\d.]*)/);
        if (m) return { name: 'Android', version: m[1] };
        // iOS / iPhone / iPad
        m = ua.match(/(?:iPhone|iPad|iPod).*OS (\d+[_\d]*)/);
        if (m) return { name: 'iOS', version: m[1].replace(/_/g, '.') };
        // macOS
        m = ua.match(/Mac OS X (\d+[_\d.]*)/);
        if (m) return { name: 'macOS', version: m[1].replace(/_/g, '.') };
        // ChromeOS
        if (/CrOS/.test(ua)) return { name: 'ChromeOS', version: '—' };
        // Linux
        if (/Linux/.test(ua)) return { name: 'Linux', version: '—' };
        return { name: '未知', version: '—' };
    }

    function parseDevice(ua) {
        // iPad / tablet
        if (/iPad|Tablet|PlayBook|Silk/.test(ua)) return '平板';
        // Mobile
        if (/Mobile|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini/.test(ua)) return '移动';
        // Android without Mobile => tablet
        if (/Android/.test(ua)) return '平板';
        return '桌面';
    }

    function parseArch(ua) {
        if (/WOW64|Win64|x64|x86_64/.test(ua)) return 'x86_64';
        if (/i686|i386|x86/.test(ua)) return 'x86';
        if (/arm|aarch64/.test(ua)) return /aarch64/.test(ua) ? 'ARM64' : 'ARM';
        if (/Macintosh/.test(ua) && /OS X/.test(ua)) {
            // Apple Silicon detection is unreliable via UA; default to ARM on newer macOS
            return 'ARM/x86_64';
        }
        return '—';
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var inputEl = $('ua-input');

        function parse() {
            var ua = inputEl.value.trim();
            Tools.clearBanner('banner');
            if (!ua) {
                setEmpty();
                return;
            }
            var b = parseBrowser(ua);
            var e = parseEngine(ua);
            var os = parseOS(ua);
            var dev = parseDevice(ua);
            var arch = parseArch(ua);

            $('r-browser').textContent = b.name;
            $('r-browser-ver').textContent = b.version;
            $('r-engine').textContent = e.name;
            $('r-engine-ver').textContent = e.version;
            $('r-os').textContent = os.name;
            $('r-os-ver').textContent = os.version;
            $('r-arch').textContent = arch;
            $('r-device').textContent = dev;

            var badgeWrap = $('device-badge-wrap');
            var badge = $('device-badge');
            var icon = dev === '桌面' ? '🖥️' : (dev === '移动' ? '📱' : '📋');
            badge.textContent = icon + ' ' + dev + ' 设备';
            badgeWrap.style.display = 'block';
        }

        function setEmpty() {
            ['r-browser', 'r-browser-ver', 'r-engine', 'r-engine-ver', 'r-os', 'r-os-ver', 'r-arch', 'r-device']
                .forEach(function (id) { $(id).textContent = '—'; });
            $('device-badge-wrap').style.display = 'none';
        }

        $('btn-current').addEventListener('click', function () {
            inputEl.value = navigator.userAgent;
            parse();
        });

        $('btn-copy-ua').addEventListener('click', function () {
            var ua = inputEl.value.trim();
            if (!ua) {
                Tools.showBanner('banner', 'warn', '没有可复制的 UA');
                return;
            }
            Tools.copyText(ua, $('btn-copy-ua'), '已复制');
        });

        inputEl.addEventListener('input', parse);

        // initialize with current browser UA
        inputEl.value = navigator.userAgent;
        parse();
    });
})();
