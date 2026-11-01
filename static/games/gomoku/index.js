(function () {
    var SIZE = 15;
    var CELL_SIZE = 36;
    var PADDING = 24;
    var STONE_RADIUS = 15;
    var CANVAS_SIZE = PADDING * 2 + CELL_SIZE * (SIZE - 1);

    var canvas, ctx;
    var board = [];
    var moveHistory = [];
    var currentPlayer = 1;
    var gameOver = false;
    var gameStarted = false;
    var blackType = 'human';
    var whiteType = 'human';
    var firstMove = 'black';
    var aiLevel = 'medium';
    var winLine = null;
    var hoverPos = null;
    var timerInterval = null;
    var elapsedSeconds = 0;
    var aiThinking = false;

    var COLS = 'ABCDEFGHIJKLMNO';

    function init() {
        canvas = document.getElementById('boardCanvas');
        canvas.width = CANVAS_SIZE;
        canvas.height = CANVAS_SIZE;
        ctx = canvas.getContext('2d');
        canvas.addEventListener('click', onCanvasClick);
        canvas.addEventListener('mousemove', onCanvasMouseMove);
        canvas.addEventListener('mouseleave', onCanvasMouseLeave);
    }

    function startGame() {
        blackType = document.getElementById('blackType').value;
        whiteType = document.getElementById('whiteType').value;
        firstMove = document.getElementById('firstMove').value;
        aiLevel = document.getElementById('aiLevel').value;

        document.getElementById('setupPanel').style.display = 'none';
        document.getElementById('gameBody').style.display = 'flex';

        document.getElementById('blackTypeLabel').textContent = blackType === 'human' ? '人' : '机器';
        document.getElementById('whiteTypeLabel').textContent = whiteType === 'human' ? '人' : '机器';

        resetBoard();
        gameStarted = true;
        currentPlayer = firstMove === 'black' ? 1 : 2;
        updatePlayerCards();
        drawBoard();

        startTimer();

        if (isCurrentAI()) {
            scheduleAI();
        }
    }

    function resetBoard() {
        board = [];
        for (var i = 0; i < SIZE; i++) {
            board[i] = [];
            for (var j = 0; j < SIZE; j++) {
                board[i][j] = 0;
            }
        }
        moveHistory = [];
        gameOver = false;
        winLine = null;
        hoverPos = null;
        aiThinking = false;
        document.getElementById('boardOverlay').style.display = 'none';
        document.getElementById('moveCount').textContent = '0';
        document.getElementById('historyList').innerHTML = '';
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        elapsedSeconds = 0;
        updateTimerDisplay();
        timerInterval = setInterval(function () {
            if (!gameOver) {
                elapsedSeconds++;
                updateTimerDisplay();
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        var m = Math.floor(elapsedSeconds / 60);
        var s = elapsedSeconds % 60;
        document.getElementById('timeDisplay').textContent =
            (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    function isCurrentAI() {
        if (currentPlayer === 1) return blackType === 'ai';
        if (currentPlayer === 2) return whiteType === 'ai';
        return false;
    }

    function scheduleAI() {
        if (gameOver || aiThinking) return;
        aiThinking = true;
        var delay = aiLevel === 'easy' ? 300 : aiLevel === 'medium' ? 500 : 700;
        setTimeout(function () {
            aiThinking = false;
            if (!gameOver && isCurrentAI()) {
                var move = findAIMove();
                if (move) {
                    placeStone(move[0], move[1]);
                }
            }
        }, delay);
    }

    function onCanvasClick(e) {
        if (gameOver || !gameStarted || isCurrentAI() || aiThinking) return;
        var pos = getGridPos(e);
        if (pos && board[pos[0]][pos[1]] === 0) {
            placeStone(pos[0], pos[1]);
        }
    }

    function onCanvasMouseMove(e) {
        if (gameOver || !gameStarted || isCurrentAI()) return;
        var pos = getGridPos(e);
        if (pos && board[pos[0]][pos[1]] === 0) {
            hoverPos = pos;
        } else {
            hoverPos = null;
        }
        drawBoard();
    }

    function onCanvasMouseLeave() {
        hoverPos = null;
        drawBoard();
    }

    function getGridPos(e) {
        var rect = canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var col = Math.round((x - PADDING) / CELL_SIZE);
        var row = Math.round((y - PADDING) / CELL_SIZE);
        if (col < 0 || col >= SIZE || row < 0 || row >= SIZE) return null;
        var cx = PADDING + col * CELL_SIZE;
        var cy = PADDING + row * CELL_SIZE;
        var dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
        if (dist > CELL_SIZE * 0.45) return null;
        return [row, col];
    }

    function placeStone(row, col) {
        board[row][col] = currentPlayer;
        moveHistory.push({ row: row, col: col, player: currentPlayer });
        updateMoveInfo();
        addHistoryItem(row, col, currentPlayer, moveHistory.length);

        var win = checkWin(row, col, currentPlayer);
        if (win) {
            gameOver = true;
            winLine = win;
            drawBoard();
            clearInterval(timerInterval);
            showOverlay(currentPlayer === 1 ? '黑棋获胜！' : '白棋获胜！', '共 ' + moveHistory.length + ' 步');
            return;
        }

        if (moveHistory.length >= SIZE * SIZE) {
            gameOver = true;
            drawBoard();
            clearInterval(timerInterval);
            showOverlay('平局！', '棋盘已满');
            return;
        }

        currentPlayer = currentPlayer === 1 ? 2 : 1;
        updatePlayerCards();
        drawBoard();

        if (isCurrentAI()) {
            scheduleAI();
        }
    }

    function updateMoveInfo() {
        document.getElementById('moveCount').textContent = moveHistory.length;
    }

    function updatePlayerCards() {
        var bc = document.getElementById('blackCard');
        var wc = document.getElementById('whiteCard');
        if (currentPlayer === 1) {
            bc.classList.add('active');
            wc.classList.remove('active');
        } else {
            bc.classList.remove('active');
            wc.classList.add('active');
        }
    }

    function addHistoryItem(row, col, player, num) {
        var list = document.getElementById('historyList');
        var items = list.querySelectorAll('.history-item');
        for (var i = 0; i < items.length; i++) {
            items[i].classList.remove('last-move');
        }
        var div = document.createElement('div');
        div.className = 'history-item last-move';
        var icon = document.createElement('span');
        icon.className = 'stone-icon ' + (player === 1 ? 'black' : 'white');
        var numSpan = document.createElement('span');
        numSpan.className = 'move-num';
        numSpan.textContent = num + '.';
        var text = document.createElement('span');
        text.textContent = COLS[col] + (row + 1);
        div.appendChild(icon);
        div.appendChild(numSpan);
        div.appendChild(text);
        list.appendChild(div);
        list.scrollTop = list.scrollHeight;
    }

    function checkWin(row, col, player) {
        var dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (var d = 0; d < dirs.length; d++) {
            var dr = dirs[d][0], dc = dirs[d][1];
            var count = 1;
            var line = [[row, col]];
            for (var i = 1; i < 5; i++) {
                var r = row + dr * i, c = col + dc * i;
                if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === player) {
                    count++;
                    line.push([r, c]);
                } else break;
            }
            for (var i = 1; i < 5; i++) {
                var r = row - dr * i, c = col - dc * i;
                if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === player) {
                    count++;
                    line.push([r, c]);
                } else break;
            }
            if (count >= 5) return line;
        }
        return null;
    }

    function showOverlay(title, subtitle) {
        document.getElementById('overlayTitle').textContent = title;
        document.getElementById('overlaySubtitle').textContent = subtitle;
        document.getElementById('boardOverlay').style.display = 'flex';
    }

    function undoMove() {
        if (gameOver || moveHistory.length === 0 || aiThinking) return;

        var undoCount = 0;
        var maxUndo;
        if (blackType === 'ai' && whiteType === 'ai') {
            maxUndo = 2;
        } else if (isCurrentAI()) {
            maxUndo = 1;
        } else {
            var opponentType = currentPlayer === 1 ? whiteType : blackType;
            maxUndo = opponentType === 'ai' ? 2 : 1;
        }

        for (var u = 0; u < maxUndo; u++) {
            if (moveHistory.length === 0) break;
            var last = moveHistory.pop();
            board[last.row][last.col] = 0;
            currentPlayer = last.player;
            undoCount++;
        }

        var list = document.getElementById('historyList');
        for (var u = 0; u < undoCount; u++) {
            if (list.lastChild) list.removeChild(list.lastChild);
        }
        var items = list.querySelectorAll('.history-item');
        if (items.length > 0) items[items.length - 1].classList.add('last-move');

        updateMoveInfo();
        updatePlayerCards();
        drawBoard();

        if (isCurrentAI()) {
            scheduleAI();
        }
    }

    function resetToSetup() {
        gameStarted = false;
        gameOver = true;
        if (timerInterval) clearInterval(timerInterval);
        document.getElementById('setupPanel').style.display = 'flex';
        document.getElementById('gameBody').style.display = 'none';
    }

    function restartGame() {
        resetBoard();
        gameStarted = true;
        currentPlayer = firstMove === 'black' ? 1 : 2;
        updatePlayerCards();
        drawBoard();
        startTimer();
        if (isCurrentAI()) {
            scheduleAI();
        }
    }

    function drawBoard() {
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        ctx.fillStyle = '#dcb35c';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        var grad = ctx.createRadialGradient(CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE * 0.7);
        grad.addColorStop(0, 'rgba(255,255,255,0.03)');
        grad.addColorStop(1, 'rgba(0,0,0,0.08)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        ctx.strokeStyle = '#8b6914';
        ctx.lineWidth = 1;
        for (var i = 0; i < SIZE; i++) {
            var pos = PADDING + i * CELL_SIZE;
            ctx.beginPath();
            ctx.moveTo(PADDING, pos);
            ctx.lineTo(PADDING + (SIZE - 1) * CELL_SIZE, pos);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(pos, PADDING);
            ctx.lineTo(pos, PADDING + (SIZE - 1) * CELL_SIZE);
            ctx.stroke();
        }

        var starPoints = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
        ctx.fillStyle = '#8b6914';
        for (var s = 0; s < starPoints.length; s++) {
            var sr = starPoints[s][0], sc = starPoints[s][1];
            ctx.beginPath();
            ctx.arc(PADDING + sc * CELL_SIZE, PADDING + sr * CELL_SIZE, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(139, 105, 20, 0.5)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (var c = 0; c < SIZE; c++) {
            ctx.fillText(COLS[c], PADDING + c * CELL_SIZE, PADDING - 12);
        }
        ctx.textAlign = 'right';
        for (var r = 0; r < SIZE; r++) {
            ctx.fillText('' + (r + 1), PADDING - 10, PADDING + r * CELL_SIZE);
        }

        for (var r = 0; r < SIZE; r++) {
            for (var c = 0; c < SIZE; c++) {
                if (board[r][c] !== 0) {
                    var isLast = moveHistory.length > 0 &&
                        moveHistory[moveHistory.length - 1].row === r &&
                        moveHistory[moveHistory.length - 1].col === c;
                    drawStone(r, c, board[r][c], isLast);
                }
            }
        }

        if (winLine) {
            drawWinLine();
        }

        if (hoverPos && !gameOver && board[hoverPos[0]][hoverPos[1]] === 0) {
            drawHoverStone(hoverPos[0], hoverPos[1], currentPlayer);
        }
    }

    function drawStone(row, col, player, isLast) {
        var x = PADDING + col * CELL_SIZE;
        var y = PADDING + row * CELL_SIZE;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        if (player === 1) {
            var grad = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, STONE_RADIUS);
            grad.addColorStop(0, '#555');
            grad.addColorStop(0.5, '#222');
            grad.addColorStop(1, '#111');
            ctx.fillStyle = grad;
        } else {
            var grad = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, STONE_RADIUS);
            grad.addColorStop(0, '#fff');
            grad.addColorStop(0.5, '#eee');
            grad.addColorStop(1, '#ccc');
            ctx.fillStyle = grad;
        }

        ctx.beginPath();
        ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (player === 2) {
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (isLast) {
            ctx.fillStyle = player === 1 ? '#ff4444' : '#ff4444';
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawHoverStone(row, col, player) {
        var x = PADDING + col * CELL_SIZE;
        var y = PADDING + row * CELL_SIZE;
        ctx.globalAlpha = 0.35;
        if (player === 1) {
            ctx.fillStyle = '#333';
        } else {
            ctx.fillStyle = '#ddd';
        }
        ctx.beginPath();
        ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawWinLine() {
        if (!winLine || winLine.length < 2) return;

        var sorted = winLine.slice().sort(function (a, b) {
            return a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1];
        });
        var first = sorted[0];
        var last = sorted[sorted.length - 1];

        var x1 = PADDING + first[1] * CELL_SIZE;
        var y1 = PADDING + first[0] * CELL_SIZE;
        var x2 = PADDING + last[1] * CELL_SIZE;
        var y2 = PADDING + last[0] * CELL_SIZE;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 68, 68, 0.7)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(255, 68, 68, 0.5)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
    }

    function findAIMove() {
        var empty = [];
        for (var r = 0; r < SIZE; r++) {
            for (var c = 0; c < SIZE; c++) {
                if (board[r][c] === 0) empty.push([r, c]);
            }
        }
        if (empty.length === 0) return null;

        if (moveHistory.length === 0) {
            return [7, 7];
        }

        var candidates = getCandidates();
        if (candidates.length === 0) return empty[Math.floor(Math.random() * empty.length)];

        var bestScore = -Infinity;
        var bestMoves = [];

        for (var i = 0; i < candidates.length; i++) {
            var r = candidates[i][0], c = candidates[i][1];
            var score = evaluateMove(r, c, currentPlayer);
            if (score > bestScore) {
                bestScore = score;
                bestMoves = [[r, c]];
            } else if (score === bestScore) {
                bestMoves.push([r, c]);
            }
        }

        return bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }

    function getCandidates() {
        var range = aiLevel === 'easy' ? 1 : 2;
        var seen = {};
        var candidates = [];
        for (var r = 0; r < SIZE; r++) {
            for (var c = 0; c < SIZE; c++) {
                if (board[r][c] !== 0) {
                    for (var dr = -range; dr <= range; dr++) {
                        for (var dc = -range; dc <= range; dc++) {
                            var nr = r + dr, nc = c + dc;
                            if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === 0) {
                                var key = nr * SIZE + nc;
                                if (!seen[key]) {
                                    seen[key] = true;
                                    candidates.push([nr, nc]);
                                }
                            }
                        }
                    }
                }
            }
        }
        return candidates;
    }

    function evaluateMove(row, col, player) {
        var opponent = player === 1 ? 2 : 1;
        var attackScore = evaluatePoint(row, col, player);
        var defenseScore = evaluatePoint(row, col, opponent);

        var attackWeight, defenseWeight;
        if (aiLevel === 'easy') {
            attackWeight = 1.0;
            defenseWeight = 0.8;
        } else if (aiLevel === 'medium') {
            attackWeight = 1.0;
            defenseWeight = 1.05;
        } else {
            attackWeight = 1.0;
            defenseWeight = 1.1;
        }

        var totalScore = attackScore * attackWeight + defenseScore * defenseWeight;

        if (aiLevel === 'hard') {
            board[row][col] = player;
            var threatScore = 0;
            var cands = getCandidates();
            for (var i = 0; i < cands.length && i < 15; i++) {
                var oppScore = evaluatePoint(cands[i][0], cands[i][1], opponent);
                if (oppScore >= 100000) threatScore += oppScore * 0.1;
            }
            board[row][col] = 0;
            totalScore -= threatScore;
        }

        return totalScore;
    }

    function evaluatePoint(row, col, player) {
        var score = 0;
        var dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (var d = 0; d < dirs.length; d++) {
            score += evaluateDirection(row, col, dirs[d][0], dirs[d][1], player);
        }
        return score;
    }

    function evaluateDirection(row, col, dr, dc, player) {
        var count = 1;
        var openEnds = 0;

        var r = row + dr, c = col + dc;
        while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === player) {
            count++;
            r += dr;
            c += dc;
        }
        if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === 0) {
            openEnds++;
        }

        r = row - dr;
        c = col - dc;
        while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === player) {
            count++;
            r -= dr;
            c -= dc;
        }
        if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === 0) {
            openEnds++;
        }

        return getPatternScore(count, openEnds);
    }

    function getPatternScore(count, openEnds) {
        if (count >= 5) return 1000000;
        if (openEnds === 0) return 0;

        if (count === 4) {
            if (openEnds === 2) return 100000;
            if (openEnds === 1) return 10000;
        }
        if (count === 3) {
            if (openEnds === 2) return 5000;
            if (openEnds === 1) return 500;
        }
        if (count === 2) {
            if (openEnds === 2) return 200;
            if (openEnds === 1) return 50;
        }
        if (count === 1) {
            if (openEnds === 2) return 10;
            if (openEnds === 1) return 2;
        }
        return 0;
    }

    window.startGame = startGame;
    window.undoMove = undoMove;
    window.resetToSetup = resetToSetup;
    window.restartGame = restartGame;

    init();
})();