/* ===== MIME Types Reference ===== */
(function () {
    'use strict';

    var MIME_DATA = [
        // 文档
        { ext: '.html', mime: 'text/html', cat: '文档' },
        { ext: '.htm', mime: 'text/html', cat: '文档' },
        { ext: '.css', mime: 'text/css', cat: '文档' },
        { ext: '.js', mime: 'application/javascript', cat: '文档' },
        { ext: '.json', mime: 'application/json', cat: '文档' },
        { ext: '.xml', mime: 'application/xml', cat: '文档' },
        { ext: '.txt', mime: 'text/plain', cat: '文档' },
        { ext: '.csv', mime: 'text/csv', cat: '文档' },
        { ext: '.md', mime: 'text/markdown', cat: '文档' },
        { ext: '.pdf', mime: 'application/pdf', cat: '文档' },
        { ext: '.doc', mime: 'application/msword', cat: '文档' },
        { ext: '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', cat: '文档' },
        { ext: '.xls', mime: 'application/vnd.ms-excel', cat: '文档' },
        { ext: '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', cat: '文档' },
        { ext: '.ppt', mime: 'application/vnd.ms-powerpoint', cat: '文档' },
        { ext: '.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', cat: '文档' },
        { ext: '.rtf', mime: 'application/rtf', cat: '文档' },
        { ext: '.odt', mime: 'application/vnd.oasis.opendocument.text', cat: '文档' },
        // 图片
        { ext: '.jpg', mime: 'image/jpeg', cat: '图片' },
        { ext: '.jpeg', mime: 'image/jpeg', cat: '图片' },
        { ext: '.png', mime: 'image/png', cat: '图片' },
        { ext: '.gif', mime: 'image/gif', cat: '图片' },
        { ext: '.bmp', mime: 'image/bmp', cat: '图片' },
        { ext: '.webp', mime: 'image/webp', cat: '图片' },
        { ext: '.svg', mime: 'image/svg+xml', cat: '图片' },
        { ext: '.tiff', mime: 'image/tiff', cat: '图片' },
        { ext: '.ico', mime: 'image/x-icon', cat: '图片' },
        { ext: '.heic', mime: 'image/heic', cat: '图片' },
        { ext: '.avif', mime: 'image/avif', cat: '图片' },
        // 音频
        { ext: '.mp3', mime: 'audio/mpeg', cat: '音频' },
        { ext: '.wav', mime: 'audio/wav', cat: '音频' },
        { ext: '.ogg', mime: 'audio/ogg', cat: '音频' },
        { ext: '.flac', mime: 'audio/flac', cat: '音频' },
        { ext: '.aac', mime: 'audio/aac', cat: '音频' },
        { ext: '.m4a', mime: 'audio/mp4', cat: '音频' },
        { ext: '.wma', mime: 'audio/x-ms-wma', cat: '音频' },
        { ext: '.mid', mime: 'audio/midi', cat: '音频' },
        // 视频
        { ext: '.mp4', mime: 'video/mp4', cat: '视频' },
        { ext: '.webm', mime: 'video/webm', cat: '视频' },
        { ext: '.avi', mime: 'video/x-msvideo', cat: '视频' },
        { ext: '.mov', mime: 'video/quicktime', cat: '视频' },
        { ext: '.wmv', mime: 'video/x-ms-wmv', cat: '视频' },
        { ext: '.flv', mime: 'video/x-flv', cat: '视频' },
        { ext: '.mkv', mime: 'video/x-matroska', cat: '视频' },
        { ext: '.mpeg', mime: 'video/mpeg', cat: '视频' },
        { ext: '.3gp', mime: 'video/3gpp', cat: '视频' },
        // 压缩包
        { ext: '.zip', mime: 'application/zip', cat: '压缩包' },
        { ext: '.rar', mime: 'application/vnd.rar', cat: '压缩包' },
        { ext: '.7z', mime: 'application/x-7z-compressed', cat: '压缩包' },
        { ext: '.tar', mime: 'application/x-tar', cat: '压缩包' },
        { ext: '.gz', mime: 'application/gzip', cat: '压缩包' },
        { ext: '.bz2', mime: 'application/x-bzip2', cat: '压缩包' },
        { ext: '.xz', mime: 'application/x-xz', cat: '压缩包' },
        { ext: '.iso', mime: 'application/x-iso9660-image', cat: '压缩包' },
        // 代码
        { ext: '.py', mime: 'text/x-python', cat: '代码' },
        { ext: '.java', mime: 'text/x-java-source', cat: '代码' },
        { ext: '.c', mime: 'text/x-c', cat: '代码' },
        { ext: '.cpp', mime: 'text/x-c++', cat: '代码' },
        { ext: '.cs', mime: 'text/x-csharp', cat: '代码' },
        { ext: '.php', mime: 'application/x-httpd-php', cat: '代码' },
        { ext: '.rb', mime: 'text/x-ruby', cat: '代码' },
        { ext: '.go', mime: 'text/x-go', cat: '代码' },
        { ext: '.rs', mime: 'text/rust', cat: '代码' },
        { ext: '.swift', mime: 'text/swift', cat: '代码' },
        { ext: '.kt', mime: 'text/x-kotlin', cat: '代码' },
        { ext: '.ts', mime: 'application/typescript', cat: '代码' },
        { ext: '.sh', mime: 'application/x-sh', cat: '代码' },
        { ext: '.sql', mime: 'application/sql', cat: '代码' },
        { ext: '.yml', mime: 'text/yaml', cat: '代码' },
        { ext: '.yaml', mime: 'text/yaml', cat: '代码' },
        { ext: '.toml', mime: 'application/toml', cat: '代码' },
        { ext: '.ini', mime: 'text/plain', cat: '代码' },
        { ext: '.conf', mime: 'text/plain', cat: '代码' },
        // 字体
        { ext: '.ttf', mime: 'font/ttf', cat: '字体' },
        { ext: '.otf', mime: 'font/otf', cat: '字体' },
        { ext: '.woff', mime: 'font/woff', cat: '字体' },
        { ext: '.woff2', mime: 'font/woff2', cat: '字体' },
        { ext: '.eot', mime: 'application/vnd.ms-fontobject', cat: '字体' },
        // 其他
        { ext: '.bin', mime: 'application/octet-stream', cat: '其他' },
        { ext: '.exe', mime: 'application/octet-stream', cat: '其他' },
        { ext: '.dmg', mime: 'application/octet-stream', cat: '其他' },
        { ext: '.apk', mime: 'application/vnd.android.package-archive', cat: '其他' },
        { ext: '.ipa', mime: 'application/octet-stream', cat: '其他' },
        { ext: '.msi', mime: 'application/x-msi', cat: '其他' },
        { ext: '.deb', mime: 'application/vnd.debian.binary-package', cat: '其他' },
        { ext: '.rpm', mime: 'application/x-rpm', cat: '其他' },
        { ext: '.torrent', mime: 'application/x-bittorrent', cat: '其他' },
        { ext: '.eml', mime: 'message/rfc822', cat: '其他' },
        { ext: '.mjs', mime: 'text/javascript', cat: '其他' },
        { ext: '.map', mime: 'application/json', cat: '其他' },
        { ext: '.wasm', mime: 'application/wasm', cat: '其他' },
        { ext: '.jar', mime: 'application/java-archive', cat: '其他' },
        { ext: '.class', mime: 'application/java-vm', cat: '其他' },
        { ext: '.swf', mime: 'application/x-shockwave-flash', cat: '其他' }
    ];

    var CAT_KEY = {
        '文档': 'doc', '图片': 'img', '音频': 'audio', '视频': 'video',
        '压缩包': 'archive', '代码': 'code', '字体': 'font', '其他': 'other'
    };

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var searchEl = $('search');
        var catsEl = $('cats');
        var tbody = $('tbody');
        var countEl = $('count');
        var emptyEl = $('mime-empty');

        var state = { q: '', cat: '全部' };
        var total = MIME_DATA.length;

        function filter() {
            var q = state.q.trim().toLowerCase();
            return MIME_DATA.filter(function (item) {
                if (state.cat !== '全部' && item.cat !== state.cat) return false;
                if (!q) return true;
                return item.ext.toLowerCase().indexOf(q) !== -1 ||
                    item.mime.toLowerCase().indexOf(q) !== -1 ||
                    item.cat.toLowerCase().indexOf(q) !== -1;
            });
        }

        function render() {
            var list = filter();
            tbody.innerHTML = '';

            if (list.length === 0) {
                emptyEl.style.display = '';
                countEl.innerHTML = '匹配 <strong>0</strong> / ' + total + ' 项';
                return;
            }
            emptyEl.style.display = 'none';

            if (list.length === total) {
                countEl.innerHTML = '共 <strong>' + total + '</strong> 项';
            } else {
                countEl.innerHTML = '匹配 <strong>' + list.length + '</strong> / ' + total + ' 项';
            }

            var frag = document.createDocumentFragment();
            list.forEach(function (item) {
                var row = Tools.el('tr', { class: 'mime-row', title: '点击复制 MIME 类型' }, [
                    Tools.el('td', { class: 'mime-ext', text: item.ext }),
                    Tools.el('td', { class: 'mime-mime', text: item.mime }),
                    Tools.el('td', {}, [
                        Tools.el('span', { class: 'mime-badge cat-' + CAT_KEY[item.cat], text: item.cat })
                    ])
                ]);
                row.addEventListener('click', function () {
                    Tools.copyText(item.mime, null, '已复制').then(function (ok) {
                        if (!ok) return;
                        row.classList.add('copied');
                        setTimeout(function () { row.classList.remove('copied'); }, 1200);
                    });
                });
                frag.appendChild(row);
            });
            tbody.appendChild(frag);
        }

        searchEl.addEventListener('input', function () {
            state.q = searchEl.value;
            render();
        });

        catsEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.tool-cat-btn');
            if (!btn) return;
            state.cat = btn.getAttribute('data-cat');
            catsEl.querySelectorAll('.tool-cat-btn').forEach(function (b) {
                b.classList.toggle('active', b === btn);
            });
            render();
        });

        render();
    });
})();
