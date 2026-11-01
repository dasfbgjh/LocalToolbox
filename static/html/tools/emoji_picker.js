/* ===== Emoji Picker ===== */
(function () {
    'use strict';

    var CATEGORIES = [
        {
            code: 'smileys', name: '表情', keywords: 'face smile laugh cry 表情 笑脸 笑 哭 开心 难过',
            emojis: '😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗☺️😚😙🥲😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬🤥😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵🤯🤠🥳😎🤓🧐😕😟🙁☹️😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖'
        },
        {
            code: 'gestures', name: '手势', keywords: 'hand wave thumbs gesture 手 手势 挥手 点赞 ok 胜利',
            emojis: '👋🤚🖐✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏'
        },
        {
            code: 'animals', name: '动物', keywords: 'animal dog cat bird fish 动物 狗 猫 鸟 鱼 熊 猴',
            emojis: '🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐽🐸🐵🙈🙉🙊🐒🐔🐧🐦🐤🐣🐥🦆🦅🦉🦇🐺🐗🐴🦄🐝🐛🦋🐌🐞🐜🦟🦗🕷🕸🦂🐢🐍🦎🦖🦕🐙🦑🦐🦞🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🦧🐘🦛🦏🐪🐫🦒🦘🐃🐂🐄🐎🐖🐏🐑🦙🐐🦌🐕🐩🦮🐈🐓🦃🦚🦜🦢🦩🕊🐇🦝🦨🦡🦦🦥🐁🐀🐿🦔'
        },
        {
            code: 'food', name: '食物', keywords: 'food fruit drink eat 食物 水果 饮料 吃 喝 蛋糕 咖啡',
            emojis: '🍏🍎🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶🫑🌽🥕🫒🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥩🍗🍖🦴🌭🍔🍟🍕🥪🥙🧆🌮🌯🫔🥗🥘🫕🥫🍝🍜🍲🍛🍣🍱🥟🦪🍤🍙🍚🍘🍥🥠🥮🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🍯🥛🍼☕🫖🍵🍶🍾🍷🍸🍹🍺🍻🥂🥃🥤🧋🧃🧉🧊'
        },
        {
            code: 'activities', name: '活动', keywords: 'sport game activity ball 运动 活动 游戏 球 比赛',
            emojis: '⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🪀🏓🏸🏒🏑🥍🏏🪃🥅⛳🪁🏹🎣🤿🥊🥋🎽🛹🛼🛷⛸🥌🎿⛷🏂🪂🏋️🤼🤸⛹️🤺🤾🏌️🏇🧘🏄🏊🤽🚣🧗🚴🚵🎯🪀🪁🎮🕹️🎲🧩♟️🎭🎨'
        },
        {
            code: 'objects', name: '物品', keywords: 'object tool phone computer 物品 物件 工具 手机 电脑 钥匙',
            emojis: '⌚📱📲💻⌨️🖥️🖨️🖱️🖲️🕹️🗜️💽💾💿📀📼📷📸📹🎥📽️🎞️📞☎️📟📠📺📻🎙️🎚️🎛️🧭⏱️⏲️⏰🕰️⌛⏳📡🔋🔌💡🔦🕯️🪔🧯🛢️💸💵💴💶💷🪙💰💳💎⚖️🪜🧰🪛🔧🔨⚒️🛠️⛏️🪚🔩⚙️🪤🧱⛓️🧲🔫💣🧨🪓🔪🗡️⚔️🛡️🚬⚰️🪦⚱️🏺🔮📿🧿💈⚗️🔭🔬🕳️🩹🩺💊💉🩸🧬🦠🧫🧪🌡️🧹🧺🧻🚽🚰🚿🛁🛀🧼🪒🧽🧴🛎️🔑🗝️🚪🪑🛋️🛏️🛌🧸🪆🖼️🪞🪟🛍️🛒🎁🎈🎏🎀🪄🪅🎊🎉🎎🏮🎐🧧✉️📩📨📧💌📥📤📦🏷️🪧📪📫📬📭📮📯📜📃📄📑🧾📊📈📉🗒️🗓️📆📅🗑️📇🗃️🗳️🗄️📋📁📂🗂️🗞️📰📓📔📒📕📗📘📙📚📖🔖🧷🔗📎🖇️📐📏🧮📌📍✂️🖊️🖋️✒️🖌️🖍️📝✏️🔍🔎🔏🔐🔒🔓❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝'
        },
        {
            code: 'symbols', name: '符号', keywords: 'symbol sign check cross heart 符号 标志 对 错 心 圆',
            emojis: '♻️✅❌❓❗⚠️🚫✨🎉🎊💯🔆🔅〽️⚠️🚮🚯🚱🚷🚭🔞📵🚭❗🔴🟠🟡🟢🔵🟣🟤⚫⚪🟥🟧🟨🟩🟦🟪🟫⬛⬜◼️◻️◾◽▪️▫️🔶🔷🔸🔹🔺🔻💠🔘🔲🔳'
        }
    ];

    var RECENT_KEY = 'emoji-picker-recent';
    var RECENT_MAX = 20;

    // Split a string into individual emoji grapheme clusters.
    function splitEmojis(str) {
        if (typeof Intl !== 'undefined' && Intl.Segmenter) {
            try {
                var seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
                var out = [];
                var iter = seg.segment(str);
                for (var item of iter) {
                    var s = item.segment;
                    if (s && s !== ' ' && s !== '\n' && s !== '\t') out.push(s);
                }
                return out;
            } catch (e) { /* fall through */ }
        }
        // Fallback: regex matching pictographic sequences (with ZWJ and FE0F)
        var re = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}](?:\u200D[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}])*\uFE0F?/gu;
        return str.match(re) || [];
    }

    // Pre-split each category's emojis once.
    var CAT_DATA = CATEGORIES.map(function (c) {
        return { code: c.code, name: c.name, keywords: c.keywords, emojis: splitEmojis(c.emojis) };
    });

    function loadRecent() {
        try {
            var raw = localStorage.getItem(RECENT_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function saveRecent(list) {
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { }
    }

    function addRecent(emoji) {
        var list = loadRecent().filter(function (e) { return e !== emoji; });
        list.unshift(emoji);
        if (list.length > RECENT_MAX) list = list.slice(0, RECENT_MAX);
        saveRecent(list);
        return list;
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var tabsEl = $('tabs');
        var gridEl = $('grid');
        var searchEl = $('search');
        var hintEl = $('hint');

        var state = {
            activeCat: 'smileys',
            searchTerm: '',
            recent: loadRecent()
        };

        function buildTabs() {
            tabsEl.innerHTML = '';
            var tabs = [{ code: 'recent', name: '⏱ 最近' }].concat(CAT_DATA.map(function (c) {
                return { code: c.code, name: c.name };
            }));
            tabs.forEach(function (t) {
                if (t.code === 'recent' && state.recent.length === 0) return;
                var btn = Tools.el('button', {
                    class: 'emoji-tab' + (state.activeCat === t.code ? ' active' : ''),
                    type: 'button',
                    text: t.name,
                    onclick: function () {
                        state.activeCat = t.code;
                        state.searchTerm = '';
                        searchEl.value = '';
                        buildTabs();
                        renderGrid();
                    }
                });
                tabsEl.appendChild(btn);
            });
        }

        function getActiveEmojis() {
            if (state.searchTerm) {
                var term = state.searchTerm.toLowerCase();
                var matched = [];
                CAT_DATA.forEach(function (c) {
                    var hay = (c.name + ' ' + c.keywords).toLowerCase();
                    if (hay.indexOf(term) !== -1) {
                        c.emojis.forEach(function (e) { matched.push(e); });
                    }
                });
                return matched;
            }
            if (state.activeCat === 'recent') return state.recent.slice();
            for (var i = 0; i < CAT_DATA.length; i++) {
                if (CAT_DATA[i].code === state.activeCat) return CAT_DATA[i].emojis;
            }
            return [];
        }

        function renderGrid() {
            Tools.clearBanner('banner');
            var emojis = getActiveEmojis();
            gridEl.innerHTML = '';

            if (emojis.length === 0) {
                var empty = Tools.el('div', { class: 'emoji-empty' });
                if (state.searchTerm) {
                    var msg = Tools.el('div', { class: 'emoji-empty-msg', text: '没找到匹配项，试试：' });
                    empty.appendChild(msg);
                    var chips = Tools.el('div', { class: 'emoji-empty-chips' });
                    [ '动物', '食物', '手势', '符号' ].forEach(function (kw) {
                        var chip = Tools.el('button', {
                            type: 'button',
                            class: 'emoji-empty-chip',
                            text: kw
                        });
                        chip.addEventListener('click', function () {
                            var input = document.getElementById('search');
                            if (input) {
                                input.value = kw;
                                state.searchTerm = kw;
                                renderGrid();
                            }
                        });
                        chips.appendChild(chip);
                    });
                    empty.appendChild(chips);
                } else {
                    empty.appendChild(Tools.el('div', { class: 'emoji-empty-msg', text: '暂无 emoji' }));
                }
                gridEl.appendChild(empty);
                hintEl.textContent = '点击任意 emoji 即可复制到剪贴板';
                return;
            }

            emojis.forEach(function (e) {
                gridEl.appendChild(Tools.el('div', {
                    class: 'emoji-cell',
                    text: e,
                    title: '点击复制：' + e,
                    onclick: function () {
                        var self = this;
                        Tools.copyText(e, null, '已复制').then(function (ok) {
                            if (ok) {
                                state.recent = addRecent(e);
                                Tools.showBanner('banner', 'success', '已复制 ' + e + ' 到剪贴板');
                                if (state.activeCat === 'recent') renderGrid();
                                buildTabs();
                            } else {
                                Tools.showBanner('banner', 'error', '复制失败，请手动选择');
                            }
                        });
                    }
                }));
            });

            hintEl.textContent = '共 ' + emojis.length + ' 个 emoji，点击即可复制';
        }

        var searchTimer = null;
        searchEl.addEventListener('input', function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () {
                state.searchTerm = searchEl.value.trim();
                if (state.searchTerm) state.activeCat = '';
                else state.activeCat = state.recent.length ? 'recent' : 'smileys';
                buildTabs();
                renderGrid();
            }, 120);
        });

        buildTabs();
        renderGrid();
    });
})();
