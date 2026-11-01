(function () {
    var COLS = 10;
    var ROWS = 20;
    var BLOCK_SIZE = 30;
    var canvas = document.getElementById('gameCanvas');
    var ctx = canvas.getContext('2d');
    var nextCanvas = document.getElementById('nextCanvas');
    var nextCtx = nextCanvas.getContext('2d');
    var holdCanvas = document.getElementById('holdCanvas');
    var holdCtx = holdCanvas.getContext('2d');

    var PIECES = {
        I: { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: '#00e5ff', highlight: '#80f0ff', shadow: '#009db3' },
        O: { shape: [[1,1],[1,1]], color: '#ffd600', highlight: '#ffeb80', shadow: '#b39700' },
        T: { shape: [[0,1,0],[1,1,1],[0,0,0]], color: '#aa00ff', highlight: '#d580ff', shadow: '#7700b3' },
        S: { shape: [[0,1,1],[1,1,0],[0,0,0]], color: '#00e676', highlight: '#80f0b8', shadow: '#009e52' },
        Z: { shape: [[1,1,0],[0,1,1],[0,0,0]], color: '#ff1744', highlight: '#ff809c', shadow: '#b31030' },
        J: { shape: [[1,0,0],[1,1,1],[0,0,0]], color: '#2979ff', highlight: '#80b0ff', shadow: '#1c54b3' },
        L: { shape: [[0,0,1],[1,1,1],[0,0,0]], color: '#ff9100', highlight: '#ffc080', shadow: '#b36500' }
    };

    var PIECE_NAMES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

    var board = [];
    var currentPiece = null;
    var nextPiece = null;
    var holdPiece = null;
    var canHold = true;
    var score = 0;
    var level = 1;
    var lines = 0;
    var gameOver = false;
    var paused = false;
    var dropInterval = 1000;
    var lastDrop = 0;
    var animationId = null;
    var bag = [];

    var lineClearAnimation = null;

    var audioCtx = null;
    function getAudioCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    function playDropSound() {
        try {
            var ctx = getAudioCtx();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.1);
        } catch (e) { }
    }

    function playClearSound() {
        try {
            var ctx = getAudioCtx();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
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
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.8);
        } catch (e) { }
    }

    function playMoveSound() {
        try {
            var ctx = getAudioCtx();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            gain.gain.setValueAtTime(0.06, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.05);
        } catch (e) { }
    }

    function playRotateSound() {
        try {
            var ctx = getAudioCtx();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.08);
        } catch (e) { }
    }

    function initBoard() {
        board = [];
        for (var r = 0; r < ROWS; r++) {
            board[r] = [];
            for (var c = 0; c < COLS; c++) {
                board[r][c] = null;
            }
        }
    }

    function getFromBag() {
        if (bag.length === 0) {
            bag = PIECE_NAMES.slice();
            for (var i = bag.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = bag[i];
                bag[i] = bag[j];
                bag[j] = temp;
            }
        }
        return bag.pop();
    }

    function createPiece(name) {
        var p = PIECES[name];
        var shape = p.shape.map(function (row) { return row.slice(); });
        return {
            name: name,
            shape: shape,
            color: p.color,
            highlight: p.highlight,
            shadow: p.shadow,
            x: Math.floor((COLS - shape[0].length) / 2),
            y: 0
        };
    }

    function rotateMatrix(matrix) {
        var n = matrix.length;
        var result = [];
        for (var i = 0; i < n; i++) {
            result[i] = [];
            for (var j = 0; j < n; j++) {
                result[i][j] = matrix[n - 1 - j][i];
            }
        }
        return result;
    }

    function isValid(shape, px, py) {
        for (var r = 0; r < shape.length; r++) {
            for (var c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    var nx = px + c;
                    var ny = py + r;
                    if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
                    if (ny >= 0 && board[ny][nx]) return false;
                }
            }
        }
        return true;
    }

    function lockPiece() {
        var shape = currentPiece.shape;
        for (var r = 0; r < shape.length; r++) {
            for (var c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    var ny = currentPiece.y + r;
                    var nx = currentPiece.x + c;
                    if (ny < 0) {
                        endGame();
                        return;
                    }
                    board[ny][nx] = {
                        color: currentPiece.color,
                        highlight: currentPiece.highlight,
                        shadow: currentPiece.shadow
                    };
                }
            }
        }
        currentPiece = null;
        playDropSound();
        canHold = true;
        checkLines();
    }

    function checkLines() {
        var clearedRows = [];
        for (var r = 0; r < ROWS; r++) {
            var full = true;
            for (var c = 0; c < COLS; c++) {
                if (!board[r][c]) { full = false; break; }
            }
            if (full) clearedRows.push(r);
        }

        if (clearedRows.length > 0) {
            playClearSound();
            lineClearAnimation = {
                rows: clearedRows,
                startTime: performance.now(),
                duration: 300
            };

            var points = [0, 10, 30, 50, 80];
            score += points[clearedRows.length] * level;
            lines += clearedRows.length;
            level = Math.floor(lines / 10) + 1;
            dropInterval = Math.max(100, 1000 - (level - 1) * 80);

            setTimeout(function () {
                for (var i = clearedRows.length - 1; i >= 0; i--) {
                    board.splice(clearedRows[i], 1);
                }
                for (var i = 0; i < clearedRows.length; i++) {
                    var newRow = [];
                    for (var c = 0; c < COLS; c++) newRow[c] = null;
                    board.unshift(newRow);
                }
                lineClearAnimation = null;
                spawnPiece();
            }, 300);
        } else {
            spawnPiece();
        }

        updateUI();
    }

    function spawnPiece() {
        if (nextPiece) {
            currentPiece = nextPiece;
        } else {
            currentPiece = createPiece(getFromBag());
        }
        nextPiece = createPiece(getFromBag());
        currentPiece.x = Math.floor((COLS - currentPiece.shape[0].length) / 2);
        currentPiece.y = 0;

        if (!isValid(currentPiece.shape, currentPiece.x, currentPiece.y)) {
            endGame();
        }
    }

    function endGame() {
        gameOver = true;
        playGameOverSound();
        var overlay = document.getElementById('boardOverlay');
        var title = document.getElementById('overlayTitle');
        var scoreEl = document.getElementById('overlayScore');
        title.textContent = '游戏结束';
        scoreEl.textContent = '得分: ' + score;
        overlay.classList.add('show');
    }

    function updateUI() {
        document.getElementById('score').textContent = score;
        document.getElementById('level').textContent = level;
        document.getElementById('lines').textContent = lines;
    }

    function getGhostY() {
        var gy = currentPiece.y;
        while (isValid(currentPiece.shape, currentPiece.x, gy + 1)) {
            gy++;
        }
        return gy;
    }

    function drawBlock(context, x, y, color, highlight, shadow, size, alpha) {
        var s = size || BLOCK_SIZE;
        var a = alpha || 1;
        var px = x * s;
        var py = y * s;
        var bevel = Math.max(1, s * 0.12);

        context.globalAlpha = a;

        context.fillStyle = shadow;
        context.fillRect(px, py, s, s);

        context.fillStyle = color;
        context.fillRect(px + bevel, py + bevel, s - bevel * 2, s - bevel * 2);

        context.fillStyle = highlight;
        context.globalAlpha = a * 0.7;
        context.beginPath();
        context.moveTo(px, py);
        context.lineTo(px + s, py);
        context.lineTo(px + s - bevel, py + bevel);
        context.lineTo(px + bevel, py + bevel);
        context.lineTo(px + bevel, py + s - bevel);
        context.lineTo(px, py + s);
        context.closePath();
        context.fill();

        context.fillStyle = shadow;
        context.globalAlpha = a * 0.5;
        context.beginPath();
        context.moveTo(px + s, py);
        context.lineTo(px + s, py + s);
        context.lineTo(px, py + s);
        context.lineTo(px + bevel, py + s - bevel);
        context.lineTo(px + s - bevel, py + s - bevel);
        context.lineTo(px + s - bevel, py + bevel);
        context.closePath();
        context.fill();

        context.fillStyle = 'rgba(255,255,255,0.25)';
        context.globalAlpha = a * 0.6;
        context.fillRect(px + bevel + 1, py + bevel + 1, s * 0.3, s * 0.15);

        context.globalAlpha = 1;
    }

    function drawBoard() {
        ctx.fillStyle = '#0a0a1e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                var px = c * BLOCK_SIZE;
                var py = r * BLOCK_SIZE;
                ctx.strokeStyle = 'rgba(60, 60, 120, 0.15)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(px, py, BLOCK_SIZE, BLOCK_SIZE);
            }
        }

        if (lineClearAnimation) {
            var elapsed = performance.now() - lineClearAnimation.startTime;
            var progress = Math.min(1, elapsed / lineClearAnimation.duration);
            var flashAlpha = Math.abs(Math.sin(progress * Math.PI * 3)) * 0.6;

            for (var r = 0; r < ROWS; r++) {
                for (var c = 0; c < COLS; c++) {
                    if (board[r][c]) {
                        var isClearingRow = lineClearAnimation.rows.indexOf(r) !== -1;
                        if (isClearingRow) {
                            ctx.fillStyle = 'rgba(255, 255, 255, ' + flashAlpha + ')';
                            ctx.fillRect(c * BLOCK_SIZE, r * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                        } else {
                            drawBlock(ctx, c, r, board[r][c].color, board[r][c].highlight, board[r][c].shadow);
                        }
                    }
                }
            }
        } else {
            for (var r = 0; r < ROWS; r++) {
                for (var c = 0; c < COLS; c++) {
                    if (board[r][c]) {
                        drawBlock(ctx, c, r, board[r][c].color, board[r][c].highlight, board[r][c].shadow);
                    }
                }
            }
        }

        if (currentPiece && !gameOver && !paused) {
            var ghostY = getGhostY();
            var shape = currentPiece.shape;
            for (var r = 0; r < shape.length; r++) {
                for (var c = 0; c < shape[r].length; c++) {
                    if (shape[r][c]) {
                        var gx = currentPiece.x + c;
                        var gy = ghostY + r;
                        if (gy >= 0) {
                            drawBlock(ctx, gx, gy, currentPiece.color, currentPiece.highlight, currentPiece.shadow, BLOCK_SIZE, 0.15);
                        }
                    }
                }
            }

            for (var r = 0; r < shape.length; r++) {
                for (var c = 0; c < shape[r].length; c++) {
                    if (shape[r][c]) {
                        var bx = currentPiece.x + c;
                        var by = currentPiece.y + r;
                        if (by >= 0) {
                            drawBlock(ctx, bx, by, currentPiece.color, currentPiece.highlight, currentPiece.shadow);
                        }
                    }
                }
            }
        }
    }

    function drawPreview(context, piece, canvasEl) {
        context.fillStyle = 'rgba(15, 15, 35, 0.9)';
        context.fillRect(0, 0, canvasEl.width, canvasEl.height);

        if (!piece) return;

        var shape = piece.shape;
        var rows = shape.length;
        var cols = shape[0].length;
        var previewSize = 24;
        var offsetX = (canvasEl.width - cols * previewSize) / 2;
        var offsetY = (canvasEl.height - rows * previewSize) / 2;

        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                if (shape[r][c]) {
                    var px = offsetX + c * previewSize;
                    var py = offsetY + r * previewSize;
                    var bevel = Math.max(1, previewSize * 0.12);

                    context.fillStyle = piece.shadow;
                    context.fillRect(px, py, previewSize, previewSize);

                    context.fillStyle = piece.color;
                    context.fillRect(px + bevel, py + bevel, previewSize - bevel * 2, previewSize - bevel * 2);

                    context.fillStyle = piece.highlight;
                    context.globalAlpha = 0.7;
                    context.beginPath();
                    context.moveTo(px, py);
                    context.lineTo(px + previewSize, py);
                    context.lineTo(px + previewSize - bevel, py + bevel);
                    context.lineTo(px + bevel, py + bevel);
                    context.lineTo(px + bevel, py + previewSize - bevel);
                    context.lineTo(px, py + previewSize);
                    context.closePath();
                    context.fill();

                    context.fillStyle = piece.shadow;
                    context.globalAlpha = 0.5;
                    context.beginPath();
                    context.moveTo(px + previewSize, py);
                    context.lineTo(px + previewSize, py + previewSize);
                    context.lineTo(px, py + previewSize);
                    context.lineTo(px + bevel, py + previewSize - bevel);
                    context.lineTo(px + previewSize - bevel, py + previewSize - bevel);
                    context.lineTo(px + previewSize - bevel, py + bevel);
                    context.closePath();
                    context.fill();

                    context.globalAlpha = 1;
                }
            }
        }
    }

    function moveLeft() {
        if (gameOver || paused) return;
        if (isValid(currentPiece.shape, currentPiece.x - 1, currentPiece.y)) {
            currentPiece.x--;
            playMoveSound();
        }
    }

    function moveRight() {
        if (gameOver || paused) return;
        if (isValid(currentPiece.shape, currentPiece.x + 1, currentPiece.y)) {
            currentPiece.x++;
            playMoveSound();
        }
    }

    function moveDown() {
        if (gameOver || paused) return;
        if (isValid(currentPiece.shape, currentPiece.x, currentPiece.y + 1)) {
            currentPiece.y++;
            return true;
        }
        return false;
    }

    function hardDrop() {
        if (gameOver || paused) return;
        while (isValid(currentPiece.shape, currentPiece.x, currentPiece.y + 1)) {
            currentPiece.y++;
        }
        lockPiece();
    }

    function rotate() {
        if (gameOver || paused) return;
        var rotated = rotateMatrix(currentPiece.shape);
        var kicks = [0, -1, 1, -2, 2];
        for (var i = 0; i < kicks.length; i++) {
            if (isValid(rotated, currentPiece.x + kicks[i], currentPiece.y)) {
                currentPiece.shape = rotated;
                currentPiece.x += kicks[i];
                playRotateSound();
                return;
            }
            if (isValid(rotated, currentPiece.x + kicks[i], currentPiece.y - 1)) {
                currentPiece.shape = rotated;
                currentPiece.x += kicks[i];
                currentPiece.y -= 1;
                playRotateSound();
                return;
            }
        }
    }

    function holdCurrentPiece() {
        if (gameOver || paused || !canHold) return;
        canHold = false;
        if (holdPiece) {
            var tempName = holdPiece.name;
            holdPiece = createPiece(currentPiece.name);
            currentPiece = createPiece(tempName);
            currentPiece.x = Math.floor((COLS - currentPiece.shape[0].length) / 2);
            currentPiece.y = 0;
        } else {
            holdPiece = createPiece(currentPiece.name);
            spawnPiece();
        }
    }

    function togglePause() {
        if (gameOver) return;
        paused = !paused;
        var overlay = document.getElementById('boardOverlay');
        var title = document.getElementById('overlayTitle');
        var scoreEl = document.getElementById('overlayScore');
        var btn = document.getElementById('overlayBtn');
        if (paused) {
            title.textContent = '已暂停';
            scoreEl.textContent = '按 空格 继续';
            btn.style.display = 'none';
            overlay.classList.add('show');
        } else {
            overlay.classList.remove('show');
            btn.style.display = '';
        }
    }

    function gameLoop(timestamp) {
        if (!lastDrop) lastDrop = timestamp;

        if (!gameOver && !paused && currentPiece) {
            if (timestamp - lastDrop > dropInterval) {
                if (!moveDown()) {
                    lockPiece();
                }
                lastDrop = timestamp;
            }
        }

        drawBoard();
        drawPreview(nextCtx, nextPiece, nextCanvas);
        drawPreview(holdCtx, holdPiece, holdCanvas);

        animationId = requestAnimationFrame(gameLoop);
    }

    var gameStarted = false;

    function showStartScreen() {
        var overlay = document.getElementById('boardOverlay');
        var title = document.getElementById('overlayTitle');
        var scoreEl = document.getElementById('overlayScore');
        var btn = document.getElementById('overlayBtn');
        title.textContent = '俄罗斯方块';
        scoreEl.textContent = '按回车或点击开始';
        btn.textContent = '开始游戏';
        btn.style.display = '';
        overlay.classList.add('show');
    }

    function startGame() {
        initBoard();
        bag = [];
        score = 0;
        level = 1;
        lines = 0;
        gameOver = false;
        paused = false;
        gameStarted = true;
        canHold = true;
        holdPiece = null;
        dropInterval = 1000;
        lastDrop = 0;
        lineClearAnimation = null;

        currentPiece = createPiece(getFromBag());
        nextPiece = createPiece(getFromBag());

        updateUI();

        var overlay = document.getElementById('boardOverlay');
        overlay.classList.remove('show');

        if (animationId) cancelAnimationFrame(animationId);
        animationId = requestAnimationFrame(gameLoop);
    }

    window.restartGame = function () {
        startGame();
    };

    document.addEventListener('keydown', function (e) {
        if (!gameStarted) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                startGame();
            }
            return;
        }

        if (gameOver && e.key !== 'Enter') return;

        switch (e.key) {
            case 'ArrowLeft':
            case 'a':
            case 'A':
                e.preventDefault();
                moveLeft();
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                e.preventDefault();
                moveRight();
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                e.preventDefault();
                moveDown();
                break;
            case 'ArrowUp':
            case 'w':
            case 'W':
                e.preventDefault();
                rotate();
                break;
            case 'Enter':
                e.preventDefault();
                hardDrop();
                break;
            case ' ':
                e.preventDefault();
                togglePause();
                break;
            case 'c':
            case 'C':
                holdCurrentPiece();
                break;
        }
    });

    initBoard();
    showStartScreen();
    animationId = requestAnimationFrame(gameLoop);
})();