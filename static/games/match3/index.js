(function () {
    var COLS = 8;
    var ROWS = 8;
    var BLOCK_SIZE = 60;
    var NUM_COLORS = 6;
    var MAX_MOVES = 30;
    var TARGET_SCORE = 1000;

    var canvas = document.getElementById('gameCanvas');
    var ctx = canvas.getContext('2d');

    var COLORS = [
        { color: '#ff1744', highlight: '#ff809c', shadow: '#b31030', name: 'red' },
        { color: '#00e676', highlight: '#80f0b8', shadow: '#009e52', name: 'green' },
        { color: '#2979ff', highlight: '#80b0ff', shadow: '#1c54b3', name: 'blue' },
        { color: '#ffd600', highlight: '#ffeb80', shadow: '#b39700', name: 'yellow' },
        { color: '#aa00ff', highlight: '#d580ff', shadow: '#7700b3', name: 'purple' },
        { color: '#ff9100', highlight: '#ffc080', shadow: '#b36500', name: 'orange' }
    ];

    var SHAPES = ['circle', 'diamond', 'square', 'triangle', 'star', 'hexagon'];

    var board = [];
    var score = 0;
    var combo = 0;
    var moves = MAX_MOVES;
    var gameOver = false;
    var paused = false;
    var gameStarted = false;
    var animating = false;
    var animationId = null;

    var animations = [];
    var particles = [];

    var isDragging = false;
    var dragPath = [];
    var dragColor = -1;

    var audioCtx = null;
    function getAudioCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    function playMatchSound(comboLevel) {
        try {
            var ctx = getAudioCtx();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'sine';
            var baseFreq = 400 + comboLevel * 100;
            osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) { }
    }

    function playSwipeSound() {
        try {
            var ctx = getAudioCtx();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.06);
            gain.gain.setValueAtTime(0.06, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.06);
        } catch (e) { }
    }

    function playFailSound() {
        try {
            var ctx = getAudioCtx();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        } catch (e) { }
    }

    function playGameOverSound() {
        try {
            var ctx = getAudioCtx();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.8);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.8);
        } catch (e) { }
    }

    function initBoard() {
        board = [];
        for (var r = 0; r < ROWS; r++) {
            board[r] = [];
            for (var c = 0; c < COLS; c++) {
                board[r][c] = Math.floor(Math.random() * NUM_COLORS);
            }
        }
    }

    function isAdjacent(a, b) {
        return (Math.abs(a.r - b.r) + Math.abs(a.c - b.c)) === 1;
    }

    function cellInPath(path, r, c) {
        for (var i = 0; i < path.length; i++) {
            if (path[i].r === r && path[i].c === c) return true;
        }
        return false;
    }

    function floodFillSameColor(startCells, colorIdx) {
        var visited = {};
        var queue = [];
        for (var i = 0; i < startCells.length; i++) {
            var key = startCells[i].r + ',' + startCells[i].c;
            if (!visited[key]) {
                visited[key] = true;
                queue.push(startCells[i]);
            }
        }
        var result = [];
        var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        while (queue.length > 0) {
            var cell = queue.shift();
            result.push(cell);
            for (var d = 0; d < dirs.length; d++) {
                var nr = cell.r + dirs[d][0];
                var nc = cell.c + dirs[d][1];
                var nkey = nr + ',' + nc;
                if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !visited[nkey] && board[nr][nc] === colorIdx) {
                    visited[nkey] = true;
                    queue.push({ r: nr, c: nc });
                }
            }
        }
        return result;
    }

    function addRemoveAnimation(cells, callback) {
        var startTime = performance.now();
        var duration = 300;
        animations.push({
            type: 'remove',
            cells: cells.slice(),
            startTime: startTime,
            duration: duration,
            callback: callback
        });
    }

    function addFallAnimation(falls, newBoard, callback) {
        var startTime = performance.now();
        var duration = 250;
        animations.push({
            type: 'fall',
            falls: falls.slice(),
            newBoard: newBoard,
            startTime: startTime,
            duration: duration,
            callback: callback
        });
    }

    function addParticles(cells) {
        for (var i = 0; i < cells.length; i++) {
            var cell = cells[i];
            var cx = cell.c * BLOCK_SIZE + BLOCK_SIZE / 2;
            var cy = cell.r * BLOCK_SIZE + BLOCK_SIZE / 2;
            var col = COLORS[board[cell.r][cell.c]] || COLORS[0];
            for (var p = 0; p < 6; p++) {
                var angle = Math.random() * Math.PI * 2;
                var speed = 1 + Math.random() * 3;
                particles.push({
                    x: cx,
                    y: cy,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 1,
                    decay: 0.02 + Math.random() * 0.02,
                    size: 3 + Math.random() * 4,
                    color: col.color
                });
            }
        }
    }

    function eliminateCells(cells) {
        if (cells.length === 0) {
            combo = 0;
            animating = false;
            checkGameState();
            return;
        }

        combo++;
        var matchScore = cells.length * 10 * combo;
        score += matchScore;
        playMatchSound(combo);
        addParticles(cells);

        var capturedColor = board[cells[0].r][cells[0].c];

        addRemoveAnimation(cells, function () {
            for (var i = 0; i < cells.length; i++) {
                board[cells[i].r][cells[i].c] = null;
            }

            var expanded = floodFillSameColor(cells, capturedColor);
            var newCells = [];
            for (var i = 0; i < expanded.length; i++) {
                if (board[expanded[i].r][expanded[i].c] !== null) {
                    newCells.push(expanded[i]);
                }
            }

            if (newCells.length > 0) {
                setTimeout(function () {
                    eliminateCells(newCells);
                }, 150);
            } else {
                applyGravity(function () {
                    updateUI();
                    animating = false;
                    checkGameState();
                });
            }
        });

        updateUI();
    }

    function applyGravity(callback) {
        var falls = [];
        var newBoard = [];
        for (var r = 0; r < ROWS; r++) {
            newBoard[r] = board[r].slice();
        }

        for (var c = 0; c < COLS; c++) {
            var emptyRow = ROWS - 1;
            for (var r = ROWS - 1; r >= 0; r--) {
                if (newBoard[r][c] !== null) {
                    if (r !== emptyRow) {
                        falls.push({ fromR: r, toR: emptyRow, c: c, color: newBoard[r][c] });
                        newBoard[emptyRow][c] = newBoard[r][c];
                        newBoard[r][c] = null;
                    }
                    emptyRow--;
                }
            }
            for (var r = emptyRow; r >= 0; r--) {
                var newColor = Math.floor(Math.random() * NUM_COLORS);
                newBoard[r][c] = newColor;
                falls.push({ fromR: r - (emptyRow + 1), toR: r, c: c, color: newColor, isNew: true });
            }
        }

        if (falls.length > 0) {
            addFallAnimation(falls, newBoard, function () {
                if (callback) callback();
            });
        } else {
            if (callback) callback();
        }
    }

    function checkGameState() {
        if (score >= TARGET_SCORE) {
            gameOver = true;
            playMatchSound(5);
            showOverlay('恭喜过关', '最终得分: ' + score);
        } else if (moves <= 0) {
            gameOver = true;
            playGameOverSound();
            showOverlay('游戏结束', '得分: ' + score);
        }
    }

    function onDragStart(r, c) {
        if (animating || gameOver || paused || !gameStarted) return;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
        if (board[r][c] === null) return;

        isDragging = true;
        dragColor = board[r][c];
        dragPath = [{ r: r, c: c }];
    }

    function onDragMove(r, c) {
        if (!isDragging || animating || gameOver || paused) return;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
        if (board[r][c] !== dragColor) return;

        if (dragPath.length >= 2) {
            var prev = dragPath[dragPath.length - 2];
            if (prev.r === r && prev.c === c) {
                dragPath.pop();
                playSwipeSound();
                return;
            }
        }

        var last = dragPath[dragPath.length - 1];
        if (last.r === r && last.c === c) return;

        if (isAdjacent(last, { r: r, c: c }) && !cellInPath(dragPath, r, c)) {
            dragPath.push({ r: r, c: c });
            playSwipeSound();
        }
    }

    function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;

        if (dragPath.length >= 2) {
            animating = true;
            moves--;
            combo = 0;
            var cells = dragPath.slice();
            dragPath = [];
            eliminateCells(cells);
        } else {
            dragPath = [];
        }
    }

    function drawBlock(context, x, y, colorIdx, size, alpha) {
        var col = COLORS[colorIdx];
        if (!col) return;
        var s = size || BLOCK_SIZE;
        var a = alpha || 1;
        var px = x;
        var py = y;
        var bevel = Math.max(1, s * 0.1);

        context.globalAlpha = a;

        context.fillStyle = col.shadow;
        context.fillRect(px, py, s, s);

        context.fillStyle = col.color;
        context.fillRect(px + bevel, py + bevel, s - bevel * 2, s - bevel * 2);

        context.fillStyle = col.highlight;
        context.globalAlpha = a * 0.65;
        context.beginPath();
        context.moveTo(px, py);
        context.lineTo(px + s, py);
        context.lineTo(px + s - bevel, py + bevel);
        context.lineTo(px + bevel, py + bevel);
        context.lineTo(px + bevel, py + s - bevel);
        context.lineTo(px, py + s);
        context.closePath();
        context.fill();

        context.fillStyle = col.shadow;
        context.globalAlpha = a * 0.45;
        context.beginPath();
        context.moveTo(px + s, py);
        context.lineTo(px + s, py + s);
        context.lineTo(px, py + s);
        context.lineTo(px + bevel, py + s - bevel);
        context.lineTo(px + s - bevel, py + s - bevel);
        context.lineTo(px + s - bevel, py + bevel);
        context.closePath();
        context.fill();

        context.fillStyle = 'rgba(255,255,255,0.3)';
        context.globalAlpha = a * 0.5;
        context.fillRect(px + bevel + 2, py + bevel + 2, s * 0.25, s * 0.12);

        var cx = px + s / 2;
        var cy = py + s / 2;
        var shapeSize = s * 0.22;
        var shapeType = SHAPES[colorIdx];

        context.fillStyle = 'rgba(255,255,255,0.35)';
        context.globalAlpha = a * 0.7;
        context.beginPath();

        if (shapeType === 'circle') {
            context.arc(cx, cy, shapeSize, 0, Math.PI * 2);
        } else if (shapeType === 'diamond') {
            context.moveTo(cx, cy - shapeSize);
            context.lineTo(cx + shapeSize, cy);
            context.lineTo(cx, cy + shapeSize);
            context.lineTo(cx - shapeSize, cy);
        } else if (shapeType === 'square') {
            var hs = shapeSize * 0.75;
            context.rect(cx - hs, cy - hs, hs * 2, hs * 2);
        } else if (shapeType === 'triangle') {
            context.moveTo(cx, cy - shapeSize);
            context.lineTo(cx + shapeSize, cy + shapeSize * 0.7);
            context.lineTo(cx - shapeSize, cy + shapeSize * 0.7);
        } else if (shapeType === 'star') {
            for (var i = 0; i < 5; i++) {
                var angle = -Math.PI / 2 + (i * 2 * Math.PI / 5);
                var outerX = cx + Math.cos(angle) * shapeSize;
                var outerY = cy + Math.sin(angle) * shapeSize;
                var innerAngle = angle + Math.PI / 5;
                var innerX = cx + Math.cos(innerAngle) * shapeSize * 0.4;
                var innerY = cy + Math.sin(innerAngle) * shapeSize * 0.4;
                if (i === 0) context.moveTo(outerX, outerY);
                else context.lineTo(outerX, outerY);
                context.lineTo(innerX, innerY);
            }
        } else if (shapeType === 'hexagon') {
            for (var i = 0; i < 6; i++) {
                var angle = i * Math.PI / 3 - Math.PI / 6;
                var hx = cx + Math.cos(angle) * shapeSize;
                var hy = cy + Math.sin(angle) * shapeSize;
                if (i === 0) context.moveTo(hx, hy);
                else context.lineTo(hx, hy);
            }
        }
        context.closePath();
        context.fill();

        context.globalAlpha = 1;
    }

    function drawTrail(timestamp) {
        if (dragPath.length < 1) return;

        for (var i = 0; i < dragPath.length; i++) {
            var cell = dragPath[i];
            var px = cell.c * BLOCK_SIZE;
            var py = cell.r * BLOCK_SIZE;

            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.5 + 0.3 * Math.sin(timestamp / 150 + i * 0.5);
            ctx.strokeRect(px + 3, py + 3, BLOCK_SIZE - 6, BLOCK_SIZE - 6);
            ctx.globalAlpha = 1;

            ctx.shadowColor = COLORS[dragColor].color;
            ctx.shadowBlur = 12;
            ctx.strokeStyle = COLORS[dragColor].highlight;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.6;
            ctx.strokeRect(px + 3, py + 3, BLOCK_SIZE - 6, BLOCK_SIZE - 6);
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }

        if (dragPath.length >= 2) {
            ctx.strokeStyle = COLORS[dragColor].highlight;
            ctx.lineWidth = 4;
            ctx.globalAlpha = 0.7;
            ctx.shadowColor = COLORS[dragColor].color;
            ctx.shadowBlur = 15;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(
                dragPath[0].c * BLOCK_SIZE + BLOCK_SIZE / 2,
                dragPath[0].r * BLOCK_SIZE + BLOCK_SIZE / 2
            );
            for (var i = 1; i < dragPath.length; i++) {
                ctx.lineTo(
                    dragPath[i].c * BLOCK_SIZE + BLOCK_SIZE / 2,
                    dragPath[i].r * BLOCK_SIZE + BLOCK_SIZE / 2
                );
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.globalAlpha = 0.9;
            var last = dragPath[dragPath.length - 1];
            ctx.fillText(
                'x' + dragPath.length,
                last.c * BLOCK_SIZE + BLOCK_SIZE / 2,
                last.r * BLOCK_SIZE + BLOCK_SIZE / 2
            );
            ctx.globalAlpha = 1;
        }
    }

    function drawBoard(timestamp) {
        ctx.fillStyle = '#0a0a1e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                var px = c * BLOCK_SIZE;
                var py = r * BLOCK_SIZE;
                ctx.strokeStyle = 'rgba(80, 60, 120, 0.12)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(px, py, BLOCK_SIZE, BLOCK_SIZE);
            }
        }

        var skipCells = {};
        var moveCells = {};

        for (var ai = animations.length - 1; ai >= 0; ai--) {
            var anim = animations[ai];
            var elapsed = timestamp - anim.startTime;
            var progress = Math.min(1, elapsed / anim.duration);
            var eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            if (anim.type === 'remove') {
                for (var i = 0; i < anim.cells.length; i++) {
                    var cell = anim.cells[i];
                    skipCells[cell.r + ',' + cell.c] = true;
                    if (board[cell.r][cell.c] !== null) {
                        var scale = 1 - eased;
                        var offset = (1 - scale) * BLOCK_SIZE / 2;
                        drawBlock(ctx, cell.c * BLOCK_SIZE + offset, cell.r * BLOCK_SIZE + offset, board[cell.r][cell.c], BLOCK_SIZE * scale, 1 - eased * 0.5);
                    }
                }
            } else if (anim.type === 'fall') {
                for (var i = 0; i < anim.falls.length; i++) {
                    var fall = anim.falls[i];
                    if (fall.fromR >= 0) {
                        skipCells[fall.fromR + ',' + fall.c] = true;
                    }
                    var fromY = fall.fromR * BLOCK_SIZE;
                    var toY = fall.toR * BLOCK_SIZE;
                    var curY = fromY + (toY - fromY) * eased;
                    moveCells[fall.toR + ',' + fall.c] = { y: curY, color: fall.color };
                }
            }

            if (progress >= 1) {
                if (anim.type === 'fall' && anim.newBoard) {
                    board = anim.newBoard;
                }
                if (anim.callback) anim.callback();
                animations.splice(ai, 1);
            }
        }

        for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                var key = r + ',' + c;
                if (moveCells[key]) {
                    drawBlock(ctx, c * BLOCK_SIZE, moveCells[key].y, moveCells[key].color);
                    continue;
                }
                if (skipCells[key]) continue;
                if (board[r][c] !== null) {
                    drawBlock(ctx, c * BLOCK_SIZE, r * BLOCK_SIZE, board[r][c]);
                }
            }
        }

        drawTrail(timestamp);

        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1;
            p.life -= p.decay;
            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function updateUI() {
        document.getElementById('score').textContent = score;
        document.getElementById('combo').textContent = combo;
        document.getElementById('moves').textContent = moves;
        var progress = Math.min(100, Math.floor(score / TARGET_SCORE * 100));
        document.getElementById('progressFill').style.width = progress + '%';
    }

    function showOverlay(title, subtitle) {
        var overlay = document.getElementById('boardOverlay');
        var titleEl = document.getElementById('overlayTitle');
        var scoreEl = document.getElementById('overlayScore');
        var btn = document.getElementById('overlayBtn');
        titleEl.textContent = title;
        scoreEl.textContent = subtitle;
        btn.textContent = '重新开始';
        btn.style.display = '';
        overlay.classList.add('show');
    }

    function showStartScreen() {
        var overlay = document.getElementById('boardOverlay');
        var titleEl = document.getElementById('overlayTitle');
        var scoreEl = document.getElementById('overlayScore');
        var btn = document.getElementById('overlayBtn');
        titleEl.textContent = '消消乐';
        scoreEl.textContent = '按回车或点击开始';
        btn.textContent = '开始游戏';
        btn.style.display = '';
        overlay.classList.add('show');
    }

    function startGame() {
        initBoard();
        score = 0;
        combo = 0;
        moves = MAX_MOVES;
        gameOver = false;
        paused = false;
        gameStarted = true;
        animating = false;
        isDragging = false;
        dragPath = [];
        animations = [];
        particles = [];

        updateUI();

        var overlay = document.getElementById('boardOverlay');
        overlay.classList.remove('show');
    }

    function togglePause() {
        if (gameOver || !gameStarted) return;
        paused = !paused;
        if (paused) {
            showOverlay('已暂停', '按空格继续');
        } else {
            var overlay = document.getElementById('boardOverlay');
            overlay.classList.remove('show');
        }
    }

    window.restartGame = function () {
        startGame();
    };

    function getCellFromEvent(e) {
        var rect = canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var scaleX = canvas.width / rect.width;
        var scaleY = canvas.height / rect.height;
        var c = Math.floor(x * scaleX / BLOCK_SIZE);
        var r = Math.floor(y * scaleY / BLOCK_SIZE);
        return { r: r, c: c };
    }

    canvas.addEventListener('mousedown', function (e) {
        var cell = getCellFromEvent(e);
        onDragStart(cell.r, cell.c);
    });

    canvas.addEventListener('mousemove', function (e) {
        var cell = getCellFromEvent(e);
        onDragMove(cell.r, cell.c);
    });

    canvas.addEventListener('mouseup', function (e) {
        onDragEnd();
    });

    canvas.addEventListener('mouseleave', function (e) {
        onDragEnd();
    });

    canvas.addEventListener('touchstart', function (e) {
        e.preventDefault();
        var touch = e.touches[0];
        var cell = getCellFromEvent(touch);
        onDragStart(cell.r, cell.c);
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
        e.preventDefault();
        var touch = e.touches[0];
        var cell = getCellFromEvent(touch);
        onDragMove(cell.r, cell.c);
    }, { passive: false });

    canvas.addEventListener('touchend', function (e) {
        e.preventDefault();
        onDragEnd();
    }, { passive: false });

    document.addEventListener('keydown', function (e) {
        if (!gameStarted) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                startGame();
            }
            return;
        }

        if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            togglePause();
            return;
        }
    });

    function gameLoop(timestamp) {
        drawBoard(timestamp);
        animationId = requestAnimationFrame(gameLoop);
    }

    initBoard();
    showStartScreen();
    animationId = requestAnimationFrame(gameLoop);
})();