const TILE_TYPES = [
    { emoji: '🥕', color: '#f97316', name: '胡萝卜' },
    { emoji: '🔥', color: '#ef4444', name: '火焰' },
    { emoji: '🔔', color: '#eab308', name: '铃铛' },
    { emoji: '🧴', color: '#3b82f6', name: '奶瓶' },
    { emoji: '✂️', color: '#8b5cf6', name: '剪刀' },
    { emoji: '🌲', color: '#16a34a', name: '小树' },
    { emoji: '🌾', color: '#d97706', name: '麦穗' },
    { emoji: '🌸', color: '#ec4899', name: '小花' },
    { emoji: '🐟', color: '#06b6d4', name: '小鱼' },
    { emoji: '🍎', color: '#dc2626', name: '苹果' },
    { emoji: '🍇', color: '#7c3aed', name: '葡萄' },
    { emoji: '🍒', color: '#e11d48', name: '樱桃' },
    { emoji: '🥚', color: '#a16207', name: '鸡蛋' },
    { emoji: '🍀', color: '#059669', name: '叶子' },
    { emoji: '⭐', color: '#f59e0b', name: '星星' },
];

function tileIcon(typeIdx, size) {
    const t = TILE_TYPES[typeIdx];
    return `<span style="font-size:${size * 0.56}px;line-height:1;">${t.emoji}</span>`;
}

const UNITS_W = 16;
const UNITS_H = 13;
const TILE_U = 2;
const TRAY_SIZE = 7;

function levelConfig(level) {
    if (level <= 1) return { types: 4, layers: 2 };
    if (level === 2) return { types: 8, layers: 4 };
    if (level === 3) return { types: 11, layers: 5 };
    const types = Math.min(15, 9 + level);
    const layers = Math.min(7, 3 + level);
    return { types, layers };
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function tilesOverlap(ax, ay, bx, by) {
    return Math.abs(ax - bx) < TILE_U && Math.abs(ay - by) < TILE_U;
}

function sampleCoord(lo, hi) {
    const steps = Math.max(0, Math.round((hi - lo) / 0.5));
    const mid = (lo + hi) / 2;
    const range = (hi - lo) / 2;
    const u = Math.random() * 2 - 1;
    const biased = Math.sign(u) * Math.pow(Math.abs(u), 0.55);
    const val = mid + biased * range;
    const step = Math.round((val - lo) / 0.5);
    return lo + Math.max(0, Math.min(step, steps)) * 0.5;
}

function distribute(total, layers) {
    const weights = Array.from({ length: layers }, (_, i) =>
        1 + 2.2 * Math.sin(((i + 0.5) / layers) * Math.PI),
    );
    const sum = weights.reduce((a, b) => a + b, 0);
    const counts = new Array(layers).fill(0);
    for (let i = 0; i < total; i++) {
        let r = Math.random() * sum;
        let l = 0;
        while (l < layers - 1 && (r -= weights[l]) > 0) l++;
        counts[l]++;
    }
    return counts;
}

function generateBoard(level) {
    const cfg = levelConfig(level);
    const total = cfg.types * 3;
    const counts = distribute(total, cfg.layers);
    const tiles = [];
    let id = 0;

    const cx = UNITS_W / 2 - TILE_U / 2;
    const cy = UNITS_H / 2 - TILE_U / 2;

    for (let z = 0; z < cfg.layers; z++) {
        const t = cfg.layers === 1 ? 0 : z / (cfg.layers - 1);
        const shrink = 0.18 + t * 0.42;
        const xMin = 0.7 + shrink * cx;
        const xMax = UNITS_W - TILE_U - 0.7 - shrink * (UNITS_W - TILE_U - 0.7 - cx);
        const yMin = 0.5 + shrink * cy;
        const yMax = UNITS_H - TILE_U - 0.5 - shrink * (UNITS_H - TILE_U - 0.5 - cy);

        const placed = [];
        let attempts = 0;
        while (placed.length < counts[z]) {
            attempts++;
            const x = sampleCoord(xMin, xMax);
            const y = sampleCoord(yMin, yMax);
            const clash = placed.some((p) => tilesOverlap(x, y, p.x, p.y));
            if (!clash || attempts > 400) {
                placed.push({ x, y });
                tiles.push({ id: id++, type: 0, x, y, z, state: 'board' });
            }
        }
    }

    for (let z = 1; z < cfg.layers; z++) {
        const upper = tiles.filter((t) => t.z === z);
        const lower = tiles.filter((t) => t.z === z - 1);
        if (!upper.length || !lower.length) continue;
        const hasCover = upper.some((u) => lower.some((l) => tilesOverlap(u.x, u.y, l.x, l.y)));
        if (!hasCover) {
            const u = upper[Math.floor(Math.random() * upper.length)];
            const l = lower[Math.floor(Math.random() * lower.length)];
            const nx = l.x + 0.5;
            const ny = l.y + 0.5;
            const clash = upper.some((o) => o.id !== u.id && tilesOverlap(nx, ny, o.x, o.y));
            if (!clash) {
                u.x = nx;
                u.y = ny;
            }
        }
    }

    const bag = shuffle(
        Array.from({ length: cfg.types }, (_, i) => [i, i, i]).flat(),
    );
    shuffle(tiles).forEach((tile, i) => {
        tile.type = bag[i];
    });

    return tiles;
}

function isBlocked(tile, tiles) {
    if (tile.state !== 'board') return false;
    return tiles.some(
        (o) =>
            o.state === 'board' &&
            o.z > tile.z &&
            tilesOverlap(o.x, o.y, tile.x, tile.y),
    );
}

class SheepGame {
    constructor() {
        this.level = 1;
        this.status = 'ready';
        this.tiles = [];
        this.tray = [];
        this.parked = [];
        this.props = { undo: 1, out: 1, shuffle: 1 };
        this.revived = false;
        this.history = [];
        this.unit = 24;
        this.timers = [];

        this.boardEl = document.getElementById('boardTiles');
        this.trayEl = document.getElementById('traySlots');
        this.parkedEl = document.getElementById('parkedRow');
        this.burstEl = document.getElementById('burstEffect');
        this.overlayEl = document.getElementById('overlay');
        this.modalEl = document.getElementById('modal');

        this.init();
    }

    init() {
        this.calculateUnit();
        window.addEventListener('resize', () => {
            this.calculateUnit();
            this.renderAll();
        });
        this.showStartModal();
    }

    calculateUnit() {
        const container = document.getElementById('boardContainer');
        if (container) {
            this.unit = container.clientWidth / UNITS_W;
            container.style.height = `${UNITS_H * this.unit}px`;
        }
    }

    later(fn, ms) {
        const t = setTimeout(fn, ms);
        this.timers.push(t);
    }

    clearTimers() {
        this.timers.forEach(clearTimeout);
        this.timers = [];
    }

    pushHistory() {
        this.history.push({
            tiles: JSON.parse(JSON.stringify(this.tiles)),
            tray: [...this.tray],
            parked: [...this.parked],
        });
        if (this.history.length > 80) this.history.shift();
    }

    start(level) {
        this.clearTimers();
        this.history = [];
        this.level = level;
        this.tiles = generateBoard(level);
        this.tray = [];
        this.parked = [];
        this.props = { undo: 1, out: 1, shuffle: 1 };
        this.revived = false;
        this.status = 'playing';

        this.calculateUnit();
        this.updateUI();
        this.hideOverlay();
        this.renderAll();
    }

    restart() {
        this.start(this.level);
    }

    get remaining() {
        return this.tiles.filter((t) => t.state === 'board').length;
    }

    updateUI() {
        document.getElementById('levelBadge').textContent = `第 ${this.level} 关`;
        document.getElementById('remainingBadge').textContent = `剩余 ${this.remaining} 张`;
        document.getElementById('countUndo').textContent = this.props.undo;
        document.getElementById('countOut').textContent = this.props.out;
        document.getElementById('countShuffle').textContent = this.props.shuffle;

        document.getElementById('btnUndo').disabled = this.status !== 'playing' || this.props.undo <= 0 || this.history.length === 0;
        document.getElementById('btnOut').disabled = this.status !== 'playing' || this.props.out <= 0 || this.tray.length === 0;
        document.getElementById('btnShuffle').disabled = this.status !== 'playing' || this.props.shuffle <= 0;
    }

    checkEnd() {
        if (this.tray.length >= TRAY_SIZE) {
            this.later(() => {
                this.status = 'lost';
                sfx.lose();
                this.showLostModal();
                this.updateUI();
            }, 480);
            return;
        }

        const anyLeft = this.tiles.some((t) => t.state !== 'gone');
        if (!anyLeft && this.tray.length === 0 && this.parked.length === 0) {
            this.later(() => {
                this.status = 'won';
                sfx.win();
                this.showWonModal();
                this.updateUI();
            }, 520);
        }
    }

    insertIntoTray(tileId, fromRect) {
        const tile = this.tiles.find((t) => t.id === tileId);
        if (!tile) return null;

        const trayTypes = this.tray.map((id) => this.tiles.find((t) => t.id === id).type);
        const lastSame = trayTypes.lastIndexOf(tile.type);
        const insertIdx = lastSame >= 0 ? lastSame + 1 : this.tray.length;

        if (fromRect && this.trayEl) {
            const slotEl = this.trayEl.children[insertIdx];
            if (slotEl) {
                const slotRect = slotEl.getBoundingClientRect();
                tile.fly = {
                    dx: fromRect.left + fromRect.width / 2 - (slotRect.left + slotRect.width / 2),
                    dy: fromRect.top + fromRect.height / 2 - (slotRect.top + slotRect.height / 2),
                };
            }
        }

        tile.state = 'tray';
        let nextTray = [...this.tray.slice(0, insertIdx), tileId, ...this.tray.slice(insertIdx)];

        const sameIds = nextTray.filter(
            (id) => this.tiles.find((t) => t.id === id).type === tile.type,
        );

        if (sameIds.length === 3) {
            this.later(() => sfx.match(), 180);
            this.showBurst(insertIdx);
            sameIds.forEach((id) => {
                const t = this.tiles.find((tt) => tt.id === id);
                t.state = 'gone';
            });
            nextTray = nextTray.filter((id) => !sameIds.includes(id));
        } else {
            sfx.click();
        }

        this.tray = nextTray;
        return nextTray;
    }

    clickBoardTile(tileId, el) {
        if (this.status !== 'playing') return;
        const tile = this.tiles.find((t) => t.id === tileId);
        if (!tile || tile.state !== 'board' || isBlocked(tile, this.tiles)) return;

        this.pushHistory();
        const rect = el.getBoundingClientRect();
        this.insertIntoTray(tileId, rect);
        this.updateUI();
        this.renderAll();
        this.checkEnd();
    }

    clickParkedTile(tileId, el) {
        if (this.status !== 'playing') return;
        const tile = this.tiles.find((t) => t.id === tileId);
        if (!tile || tile.state !== 'parked') return;

        this.pushHistory();
        this.parked = this.parked.filter((id) => id !== tileId);
        const rect = el.getBoundingClientRect();
        this.insertIntoTray(tileId, rect);
        this.updateUI();
        this.renderAll();
        this.checkEnd();
    }

    useUndo() {
        if (this.status !== 'playing' || this.props.undo <= 0 || this.history.length === 0) return;
        const snap = this.history.pop();
        this.tiles = snap.tiles;
        this.tray = snap.tray;
        this.parked = snap.parked;
        this.props.undo--;
        sfx.undo();
        this.updateUI();
        this.renderAll();
    }

    useMoveOut() {
        if (this.status !== 'playing' || this.props.out <= 0 || this.tray.length === 0) return;
        this.pushHistory();
        const moved = this.tray.slice(0, 3);
        moved.forEach((id) => {
            const t = this.tiles.find((tt) => tt.id === id);
            if (t) t.state = 'parked';
        });
        this.tray = this.tray.slice(moved.length);
        this.parked = [...this.parked, ...moved];
        this.props.out--;
        sfx.shuffle();
        this.updateUI();
        this.renderAll();
    }

    useShuffle() {
        if (this.status !== 'playing' || this.props.shuffle <= 0) return;
        const board = this.tiles.filter((t) => t.state === 'board');
        if (board.length < 2) return;
        this.pushHistory();
        const types = board.map((t) => t.type);
        for (let i = types.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [types[i], types[j]] = [types[j], types[i]];
        }
        let idx = 0;
        this.tiles.forEach((t) => {
            if (t.state === 'board') t.type = types[idx++];
        });
        this.props.shuffle--;
        sfx.shuffle();
        this.updateUI();
        this.renderBoard();
    }

    revive() {
        if (this.status !== 'lost' || this.revived) return;
        const moved = this.tray.slice(0, 3);
        moved.forEach((id) => {
            const t = this.tiles.find((tt) => tt.id === id);
            if (t) t.state = 'parked';
        });
        this.tray = this.tray.slice(moved.length);
        this.parked = [...this.parked, ...moved];
        this.revived = true;
        this.status = 'playing';
        sfx.shuffle();
        this.updateUI();
        this.hideOverlay();
        this.renderAll();
    }

    renderAll() {
        this.renderBoard();
        this.renderTray();
        this.renderParked();
    }

    renderBoard() {
        if (!this.boardEl) return;
        const size = this.unit * 2;
        const boardTiles = this.tiles.filter((t) => t.state === 'board');

        this.boardEl.innerHTML = boardTiles.map((tile) => {
            const type = TILE_TYPES[tile.type];
            const blocked = isBlocked(tile, this.tiles);
            return `
        <button class="tile-face ${blocked ? 'tile-blocked' : 'tile-clickable'}"
                style="left: ${tile.x * this.unit}px; top: ${tile.y * this.unit}px;
                       width: ${size}px; height: ${size}px; z-index: ${tile.z + 1};"
                data-id="${tile.id}"
                aria-label="${type.name}">
          ${tileIcon(tile.type, size)}
        </button>
      `;
        }).join('');

        this.boardEl.querySelectorAll('.tile-face.tile-clickable').forEach((el) => {
            el.addEventListener('click', () => {
                this.clickBoardTile(parseInt(el.dataset.id), el);
            });
        });
    }

    renderTray() {
        if (!this.trayEl) return;
        const tileSize = this.unit * 2;
        const gap = this.unit * 0.18;

        this.trayEl.style.gap = `${gap}px`;

        this.trayEl.innerHTML = Array.from({ length: TRAY_SIZE }, (_, i) => {
            const tileId = this.tray[i];
            const tile = tileId != null ? this.tiles.find((t) => t.id === tileId) : undefined;

            return `
        <div class="tray-slot" data-slot="${i}" style="width: ${tileSize}px; height: ${tileSize}px;">
          ${tile ? `
            <div class="tray-tile ${tile.fly ? 'animate-tray-in' : 'animate-pop-in'}"
                 style="${tile.fly ? `--fx: ${tile.fly.dx}px; --fy: ${tile.fly.dy}px` : ''}">
              ${tileIcon(tile.type, tileSize)}
            </div>
          ` : ''}
        </div>
      `;
        }).join('');

        this.tiles.forEach(t => { if (t.fly) delete t.fly; });
    }

    renderParked() {
        if (!this.parkedEl) return;
        const size = this.unit * 2;
        const gap = this.unit * 0.18;

        if (this.parked.length === 0) {
            this.parkedEl.innerHTML = '';
            return;
        }

        this.parkedEl.innerHTML = `
      <span class="parked-label">移出区</span>
      <div class="parked-tiles" style="gap: ${gap}px;">
        ${this.parked.map((id) => {
            const tile = this.tiles.find((t) => t.id === id);
            if (!tile) return '';
            const type = TILE_TYPES[tile.type];
            return `
            <button class="parked-tile animate-pop-in"
                    style="width: ${size}px; height: ${size}px;"
                    data-id="${id}"
                    aria-label="${type.name}">
              ${tileIcon(tile.type, size)}
            </button>
          `;
        }).join('')}
      </div>
    `;

        this.parkedEl.querySelectorAll('.parked-tile').forEach((el) => {
            el.addEventListener('click', (e) => {
                this.clickParkedTile(parseInt(el.dataset.id), el);
            });
        });
    }

    showBurst(slotIdx) {
        if (!this.burstEl || !this.trayEl) return;
        const slotEl = this.trayEl.children[slotIdx];
        if (!slotEl) return;

        const slotRect = slotEl.getBoundingClientRect();
        const containerRect = this.trayEl.parentElement.getBoundingClientRect();

        const x = slotRect.left + slotRect.width / 2 - containerRect.left;
        const y = slotRect.top + slotRect.height / 2 - containerRect.top;

        const colors = ['#fe99d9', '#ff6502', '#ffd93d', '#ffffff', '#8ed06c'];

        this.burstEl.innerHTML = Array.from({ length: 10 }, (_, i) => {
            const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
            const dist = 34 + Math.random() * 42;
            const w = 7 + Math.random() * 6;
            const h = 7 + Math.random() * 6;
            return `<div class="burst-particle"
                      style="left: ${x}px; top: ${y}px;
                             width: ${w}px; height: ${h}px;
                             background: ${colors[i % colors.length]};
                             --bx: ${Math.cos(angle) * dist}px;
                             --by: ${Math.sin(angle) * dist}px;"></div>`;
        }).join('');

        setTimeout(() => {
            this.burstEl.innerHTML = '';
        }, 600);
    }

    showOverlay() {
        this.overlayEl.classList.add('active');
    }

    hideOverlay() {
        this.overlayEl.classList.remove('active');
    }

    showStartModal() {
        this.modalEl.innerHTML = `
      <div class="modal-sheep">
        <svg width="88" height="88" viewBox="0 0 96 96">
          <g stroke="#2b2118" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="22" cy="52" rx="9" ry="6" fill="#f5d7b0" transform="rotate(-24 22 52)" />
            <ellipse cx="74" cy="52" rx="9" ry="6" fill="#f5d7b0" transform="rotate(24 74 52)" />
            <circle cx="30" cy="30" r="13" fill="#ffffff" />
            <circle cx="48" cy="23" r="14" fill="#ffffff" />
            <circle cx="66" cy="30" r="13" fill="#ffffff" />
            <circle cx="24" cy="44" r="12" fill="#ffffff" />
            <circle cx="72" cy="44" r="12" fill="#ffffff" />
            <ellipse cx="48" cy="54" rx="23" ry="21" fill="#f5d7b0" />
            <circle cx="39" cy="50" r="3.4" fill="#2b2118" stroke="none" />
            <circle cx="57" cy="50" r="3.4" fill="#2b2118" stroke="none" />
            <circle cx="33" cy="59" r="3.6" fill="#fe99d9" stroke="none" opacity="0.85" />
            <circle cx="63" cy="59" r="3.6" fill="#fe99d9" stroke="none" opacity="0.85" />
            <path d="M45 58 Q48 61 51 58" fill="none" stroke-width="3" />
            <path d="M48 61 Q48 66 43 66" fill="none" stroke-width="3" />
            <path d="M48 61 Q48 66 53 66" fill="none" stroke-width="3" />
          </g>
        </svg>
      </div>
      <h2 class="modal-title orange">羊了个羊</h2>
      <p class="modal-desc">
        点击牌放入下方槽位，凑齐 3 张相同图案即可消除。<br>
        槽位只有 7 格，放满就输了——清空全部牌才能过关！
      </p>
      <div class="modal-buttons">
        <button class="modal-btn green" onclick="game.start(1)">开始游戏</button>
      </div>
    `;
        this.showOverlay();
    }

    showWonModal() {
        this.modalEl.innerHTML = `
      <div class="modal-sheep">
        <svg width="80" height="80" viewBox="0 0 96 96">
          <g stroke="#2b2118" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="22" cy="52" rx="9" ry="6" fill="#f5d7b0" transform="rotate(-24 22 52)" />
            <ellipse cx="74" cy="52" rx="9" ry="6" fill="#f5d7b0" transform="rotate(24 74 52)" />
            <circle cx="30" cy="30" r="13" fill="#ffffff" />
            <circle cx="48" cy="23" r="14" fill="#ffffff" />
            <circle cx="66" cy="30" r="13" fill="#ffffff" />
            <circle cx="24" cy="44" r="12" fill="#ffffff" />
            <circle cx="72" cy="44" r="12" fill="#ffffff" />
            <ellipse cx="48" cy="54" rx="23" ry="21" fill="#f5d7b0" />
            <circle cx="39" cy="50" r="3.4" fill="#2b2118" stroke="none" />
            <circle cx="57" cy="50" r="3.4" fill="#2b2118" stroke="none" />
            <circle cx="33" cy="59" r="3.6" fill="#fe99d9" stroke="none" opacity="0.85" />
            <circle cx="63" cy="59" r="3.6" fill="#fe99d9" stroke="none" opacity="0.85" />
            <path d="M45 58 Q48 61 51 58" fill="none" stroke-width="3" />
            <path d="M48 61 Q48 66 43 66" fill="none" stroke-width="3" />
            <path d="M48 61 Q48 66 53 66" fill="none" stroke-width="3" />
          </g>
        </svg>
      </div>
      <h2 class="modal-title green">过关啦！</h2>
      <p class="modal-desc">第 ${this.level} 关已完成，羊圈被你清空了！</p>
      <div class="modal-buttons">
        <button class="modal-btn green" onclick="game.start(${this.level + 1})">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2b2118" stroke-width="2.8"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          挑战第 ${this.level + 1} 关
        </button>
        <button class="modal-btn yellow" onclick="game.restart()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2b2118" stroke-width="2.8"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          重玩本关
        </button>
      </div>
    `;
        this.showOverlay();
    }

    showLostModal() {
        const trayArea = document.getElementById('trayArea');
        if (trayArea) {
            trayArea.classList.add('animate-shake');
            setTimeout(() => trayArea.classList.remove('animate-shake'), 450);
        }

        this.modalEl.innerHTML = `
      <h2 class="modal-title orange">槽位满了！</h2>
      <p class="modal-desc">7 个槽位全部被占满，挑战失败……</p>
      <div class="modal-buttons">
        ${!this.revived ? `
          <button class="modal-btn pink" onclick="game.revive()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2b2118" stroke-width="2.8"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            复活（移出 3 张牌）
          </button>
        ` : ''}
        <button class="modal-btn yellow" onclick="game.restart()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2b2118" stroke-width="2.8"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          重新开始
        </button>
      </div>
    `;
        this.showOverlay();
    }
}

const sfx = (() => {
    let ctx = null;

    function getCtx() {
        try {
            if (!ctx) {
                ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (ctx.state === 'suspended') ctx.resume();
            return ctx;
        } catch {
            return null;
        }
    }

    function tone(freq, dur, type = 'triangle', gain = 0.12, delay = 0) {
        const c = getCtx();
        if (!c) return;
        const t0 = c.currentTime + delay;
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(gain, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        osc.connect(g).connect(c.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    return {
        click() { tone(620, 0.08, 'triangle', 0.14); },
        match() {
            tone(660, 0.1, 'triangle', 0.14);
            tone(880, 0.12, 'triangle', 0.14, 0.08);
            tone(1320, 0.18, 'sine', 0.12, 0.16);
        },
        undo() { tone(420, 0.09, 'sine', 0.12); },
        shuffle() {
            tone(300, 0.06, 'square', 0.06);
            tone(460, 0.06, 'square', 0.06, 0.07);
            tone(620, 0.08, 'square', 0.06, 0.14);
        },
        win() {
            [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.15, i * 0.11));
        },
        lose() {
            [392, 311, 233].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.07, i * 0.14));
        },
    };
})();

const game = new SheepGame();