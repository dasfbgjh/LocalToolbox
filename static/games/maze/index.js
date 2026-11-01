(function () {
    var canvas = document.getElementById('mazeCanvas');
    var ctx = canvas.getContext('2d');
    var algoSelect = document.getElementById('algoSelect');
    var sizeSelect = document.getElementById('sizeSelect');
    var solveAlgoSelect = document.getElementById('solveAlgoSelect');
    var stepCountEl = document.getElementById('stepCount');
    var timeDisplayEl = document.getElementById('timeDisplay');
    var solveBtn = document.getElementById('solveBtn');
    var stopBtn = document.getElementById('stopBtn');
    var boardOverlay = document.getElementById('boardOverlay');
    var overlayTitle = document.getElementById('overlayTitle');
    var overlayDetail = document.getElementById('overlayDetail');
    var algoDescEl = document.getElementById('algoDesc');

    var ALGO_DESCRIPTIONS = {
        dfs: '深度优先搜索，随机选择未访问邻居打通墙壁，生成具有长走廊特征的迷宫。',
        prim: '随机Prim算法，从边界墙中随机选择并打通，生成较多短分支的迷宫。',
        kruskal: '随机Kruskal算法，随机打通墙壁并合并集合，生成均匀分布的迷宫。',
        eller: 'Eller算法，逐行生成并合并集合，内存效率高，适合无限长迷宫。',
        division: '递归分割算法，从空房间开始递归添加墙壁，生成具有明显区域特征的迷宫。'
    };

    var mazeSize = 21;
    var cellSize = 0;
    var maze = null;
    var playerRow = 1;
    var playerCol = 1;
    var endRow = 0;
    var endCol = 0;
    var steps = 0;
    var startTime = 0;
    var timerInterval = null;
    var gameWon = false;
    var autoSolving = false;
    var autoSolveTimeout = null;
    var solvePath = [];
    var solveVisited = [];
    var solveAnimIndex = 0;
    var solveAnimPhase = 'explore';
    var trailCells = [];

    var generating = false;
    var genTimeout = null;
    var genSteps = [];
    var genAnimIndex = 0;
    var genGrid = null;
    var genInitFill = 1;

    algoSelect.addEventListener('change', function () {
        algoDescEl.textContent = ALGO_DESCRIPTIONS[algoSelect.value] || '';
    });

    sizeSelect.addEventListener('change', function () {
        mazeSize = parseInt(sizeSelect.value);
    });

    function createGrid(size, fill) {
        var grid = [];
        for (var r = 0; r < size; r++) {
            grid[r] = [];
            for (var c = 0; c < size; c++) {
                grid[r][c] = fill;
            }
        }
        return grid;
    }

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
    }

    function generateDFS(size) {
        var grid = createGrid(size, 1);
        var steps = [];
        grid[1][1] = 0;
        steps.push([1, 1, 0]);
        var stack = [[1, 1]];
        while (stack.length > 0) {
            var current = stack[stack.length - 1];
            var r = current[0], c = current[1];
            var neighbors = [];
            var dirs = [[-2, 0], [2, 0], [0, -2], [0, 2]];
            for (var i = 0; i < dirs.length; i++) {
                var nr = r + dirs[i][0], nc = c + dirs[i][1];
                if (nr > 0 && nr < size - 1 && nc > 0 && nc < size - 1 && grid[nr][nc] === 1) {
                    neighbors.push([nr, nc, r + dirs[i][0] / 2, c + dirs[i][1] / 2]);
                }
            }
            if (neighbors.length > 0) {
                var chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
                grid[chosen[2]][chosen[3]] = 0;
                grid[chosen[0]][chosen[1]] = 0;
                steps.push([chosen[2], chosen[3], 0]);
                steps.push([chosen[0], chosen[1], 0]);
                stack.push([chosen[0], chosen[1]]);
            } else {
                stack.pop();
            }
        }
        return { grid: grid, steps: steps, initFill: 1 };
    }

    function generatePrim(size) {
        var grid = createGrid(size, 1);
        var steps = [];
        grid[1][1] = 0;
        steps.push([1, 1, 0]);
        var walls = [];
        function addWalls(r, c) {
            var dirs = [[-2, 0], [2, 0], [0, -2], [0, 2]];
            for (var i = 0; i < dirs.length; i++) {
                var nr = r + dirs[i][0], nc = c + dirs[i][1];
                if (nr > 0 && nr < size - 1 && nc > 0 && nc < size - 1) {
                    walls.push([nr, nc, r + dirs[i][0] / 2, c + dirs[i][1] / 2]);
                }
            }
        }
        addWalls(1, 1);
        while (walls.length > 0) {
            var idx = Math.floor(Math.random() * walls.length);
            var wall = walls[idx];
            walls.splice(idx, 1);
            if (grid[wall[0]][wall[1]] === 1) {
                grid[wall[0]][wall[1]] = 0;
                grid[wall[2]][wall[3]] = 0;
                steps.push([wall[2], wall[3], 0]);
                steps.push([wall[0], wall[1], 0]);
                addWalls(wall[0], wall[1]);
            }
        }
        return { grid: grid, steps: steps, initFill: 1 };
    }

    function generateKruskal(size) {
        var grid = createGrid(size, 1);
        var steps = [];
        var parent = {};
        function find(key) {
            if (parent[key] !== key) parent[key] = find(parent[key]);
            return parent[key];
        }
        function union(a, b) {
            var ra = find(a), rb = find(b);
            if (ra === rb) return false;
            parent[ra] = rb;
            return true;
        }
        var cells = [];
        for (var r = 1; r < size - 1; r += 2) {
            for (var c = 1; c < size - 1; c += 2) {
                var key = r + ',' + c;
                parent[key] = key;
                grid[r][c] = 0;
                steps.push([r, c, 0]);
                cells.push([r, c]);
            }
        }
        var edges = [];
        for (var i = 0; i < cells.length; i++) {
            var cr = cells[i][0], cc = cells[i][1];
            if (cr + 2 < size - 1) edges.push([cr, cc, cr + 2, cc, cr + 1, cc]);
            if (cc + 2 < size - 1) edges.push([cr, cc, cr, cc + 2, cr, cc + 1]);
        }
        shuffle(edges);
        for (var i = 0; i < edges.length; i++) {
            var e = edges[i];
            if (union(e[0] + ',' + e[1], e[2] + ',' + e[3])) {
                grid[e[4]][e[5]] = 0;
                steps.push([e[4], e[5], 0]);
            }
        }
        return { grid: grid, steps: steps, initFill: 1 };
    }

    function generateEller(size) {
        var grid = createGrid(size, 1);
        var steps = [];
        var setCount = 0;
        var rowSets = [];
        var cols = Math.floor((size - 1) / 2);
        for (var c = 0; c < cols; c++) rowSets[c] = ++setCount;
        for (var r = 1; r < size - 1; r += 2) {
            grid[r][1] = 0;
            for (var c = 1; c < size - 1; c += 2) {
                grid[r][c] = 0;
                steps.push([r, c, 0]);
            }
            for (var c = 0; c < cols - 1; c++) {
                var col1 = 1 + c * 2, col2 = 1 + (c + 1) * 2;
                if (rowSets[c] !== rowSets[c + 1] && (r + 2 >= size - 1 || Math.random() < 0.5)) {
                    grid[r][col1 + 1] = 0;
                    steps.push([r, col1 + 1, 0]);
                    var oldSet = rowSets[c + 1], newSet = rowSets[c];
                    for (var k = 0; k < cols; k++) {
                        if (rowSets[k] === oldSet) rowSets[k] = newSet;
                    }
                }
            }
            if (r + 2 < size - 1) {
                var nextRowSets = [];
                for (var c = 0; c < cols; c++) nextRowSets[c] = rowSets[c];
                var setMembers = {};
                for (var c = 0; c < cols; c++) {
                    var s = rowSets[c];
                    if (!setMembers[s]) setMembers[s] = [];
                    setMembers[s].push(c);
                }
                for (var s in setMembers) {
                    var members = setMembers[s];
                    shuffle(members);
                    var downCount = 1 + Math.floor(Math.random() * members.length);
                    for (var i = 0; i < downCount; i++) {
                        var mc = members[i];
                        grid[r + 1][1 + mc * 2] = 0;
                        grid[r + 2][1 + mc * 2] = 0;
                        steps.push([r + 1, 1 + mc * 2, 0]);
                        steps.push([r + 2, 1 + mc * 2, 0]);
                    }
                    for (var i = downCount; i < members.length; i++) {
                        nextRowSets[members[i]] = ++setCount;
                    }
                }
                rowSets = nextRowSets;
            }
        }
        return { grid: grid, steps: steps, initFill: 1 };
    }

    function generateDivision(size) {
        var grid = createGrid(size, 1);
        var steps = [];
        for (var r = 1; r < size - 1; r++) {
            for (var c = 1; c < size - 1; c++) {
                grid[r][c] = 0;
                steps.push([r, c, 0]);
            }
        }
        function divide(x, y, w, h) {
            if (w < 2 || h < 2) return;
            var horizontal = (h > w) || (h === w && Math.random() < 0.5);
            if (horizontal) {
                var evenRows = [];
                for (var r = y + 1; r < y + h - 1; r++) {
                    if (r % 2 === 0) evenRows.push(r);
                }
                if (evenRows.length === 0) return;
                var wallY = evenRows[Math.floor(Math.random() * evenRows.length)];
                var oddCols = [];
                for (var c = x; c < x + w; c++) {
                    if (c % 2 !== 0) oddCols.push(c);
                }
                if (oddCols.length === 0) return;
                var passX = oddCols[Math.floor(Math.random() * oddCols.length)];
                for (var c = x; c < x + w; c++) {
                    if (c !== passX) {
                        grid[wallY][c] = 1;
                        steps.push([wallY, c, 1]);
                    }
                }
                divide(x, y, w, wallY - y);
                divide(x, wallY + 1, w, y + h - wallY - 1);
            } else {
                var evenCols = [];
                for (var c = x + 1; c < x + w - 1; c++) {
                    if (c % 2 === 0) evenCols.push(c);
                }
                if (evenCols.length === 0) return;
                var wallX = evenCols[Math.floor(Math.random() * evenCols.length)];
                var oddRows = [];
                for (var r = y; r < y + h; r++) {
                    if (r % 2 !== 0) oddRows.push(r);
                }
                if (oddRows.length === 0) return;
                var passY = oddRows[Math.floor(Math.random() * oddRows.length)];
                for (var r = y; r < y + h; r++) {
                    if (r !== passY) {
                        grid[r][wallX] = 1;
                        steps.push([r, wallX, 1]);
                    }
                }
                divide(x, y, wallX - x, h);
                divide(wallX + 1, y, x + w - wallX - 1, h);
            }
        }
        divide(1, 1, size - 2, size - 2);
        grid[1][1] = 0;
        grid[size - 2][size - 2] = 0;
        return { grid: grid, steps: steps, initFill: 1 };
    }

    function generateMazeWithSteps(algo, size) {
        switch (algo) {
            case 'dfs': return generateDFS(size);
            case 'prim': return generatePrim(size);
            case 'kruskal': return generateKruskal(size);
            case 'eller': return generateEller(size);
            case 'division': return generateDivision(size);
            default: return generateDFS(size);
        }
    }

    function dfsSolve(grid, sr, sc, er, ec) {
        var size = grid.length;
        var visited = [];
        for (var r = 0; r < size; r++) {
            visited[r] = [];
            for (var c = 0; c < size; c++) visited[r][c] = false;
        }
        var stack = [[sr, sc]];
        visited[sr][sc] = true;
        var parent = {};
        parent[sr + ',' + sc] = null;
        var explored = [];
        var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        while (stack.length > 0) {
            var current = stack.pop();
            var r = current[0], c = current[1];
            explored.push([r, c]);
            if (r === er && c === ec) {
                var path = [];
                var key = er + ',' + ec;
                while (key !== null) {
                    var parts = key.split(',');
                    path.unshift([parseInt(parts[0]), parseInt(parts[1])]);
                    key = parent[key];
                }
                return { path: path, explored: explored };
            }
            for (var i = dirs.length - 1; i >= 0; i--) {
                var nr = r + dirs[i][0], nc = c + dirs[i][1];
                if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === 0 && !visited[nr][nc]) {
                    visited[nr][nc] = true;
                    parent[nr + ',' + nc] = r + ',' + c;
                    stack.push([nr, nc]);
                }
            }
        }
        return { path: [], explored: explored };
    }

    function bfsSolve(grid, sr, sc, er, ec) {
        var size = grid.length;
        var visited = [];
        for (var r = 0; r < size; r++) {
            visited[r] = [];
            for (var c = 0; c < size; c++) visited[r][c] = false;
        }
        var queue = [[sr, sc]];
        visited[sr][sc] = true;
        var parent = {};
        parent[sr + ',' + sc] = null;
        var explored = [];
        var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        while (queue.length > 0) {
            var current = queue.shift();
            var r = current[0], c = current[1];
            explored.push([r, c]);
            if (r === er && c === ec) {
                var path = [];
                var key = er + ',' + ec;
                while (key !== null) {
                    var parts = key.split(',');
                    path.unshift([parseInt(parts[0]), parseInt(parts[1])]);
                    key = parent[key];
                }
                return { path: path, explored: explored };
            }
            for (var i = 0; i < dirs.length; i++) {
                var nr = r + dirs[i][0], nc = c + dirs[i][1];
                if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === 0 && !visited[nr][nc]) {
                    visited[nr][nc] = true;
                    parent[nr + ',' + nc] = r + ',' + c;
                    queue.push([nr, nc]);
                }
            }
        }
        return { path: [], explored: explored };
    }

    function calcCellSize() {
        var maxCanvasSize = Math.min(window.innerHeight - 120, window.innerWidth - 360);
        if (maxCanvasSize < 300) maxCanvasSize = 300;
        if (maxCanvasSize > 620) maxCanvasSize = 620;
        cellSize = Math.floor(maxCanvasSize / mazeSize);
        if (cellSize < 4) cellSize = 4;
        canvas.width = cellSize * mazeSize;
        canvas.height = cellSize * mazeSize;
    }

    function drawMaze() {
        if (!maze) return;
        var size = maze.length;
        ctx.fillStyle = '#0a0e1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (var r = 0; r < size; r++) {
            for (var c = 0; c < size; c++) {
                var x = c * cellSize, y = r * cellSize;
                if (maze[r][c] === 1) {
                    ctx.fillStyle = '#2a2a5a';
                    ctx.fillRect(x, y, cellSize, cellSize);
                    ctx.fillStyle = '#3a3a7a';
                    ctx.fillRect(x, y, cellSize, 1);
                    ctx.fillRect(x, y, 1, cellSize);
                } else {
                    ctx.fillStyle = '#0f1025';
                    ctx.fillRect(x, y, cellSize, cellSize);
                }
            }
        }

        for (var i = 0; i < trailCells.length; i++) {
            var tr = trailCells[i][0], tc = trailCells[i][1];
            ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
            ctx.fillRect(tc * cellSize, tr * cellSize, cellSize, cellSize);
        }

        if (solveVisited.length > 0) {
            var limit = solveAnimPhase === 'explore' ? solveAnimIndex : solveVisited.length;
            for (var i = 0; i < limit && i < solveVisited.length; i++) {
                var vr = solveVisited[i][0], vc = solveVisited[i][1];
                ctx.fillStyle = 'rgba(107, 203, 119, 0.25)';
                ctx.fillRect(vc * cellSize, vr * cellSize, cellSize, cellSize);
            }
        }

        if (solvePath.length > 0 && solveAnimPhase === 'path') {
            var pathLimit = Math.min(solveAnimIndex, solvePath.length);
            if (pathLimit > 0) {
                ctx.save();
                ctx.strokeStyle = '#6bcb77';
                ctx.lineWidth = Math.max(cellSize * 0.6, 4);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.shadowColor = 'rgba(107, 203, 119, 0.7)';
                ctx.shadowBlur = cellSize * 0.5;
                ctx.beginPath();
                ctx.moveTo(
                    solvePath[0][1] * cellSize + cellSize / 2,
                    solvePath[0][0] * cellSize + cellSize / 2
                );
                for (var i = 1; i < pathLimit; i++) {
                    ctx.lineTo(
                        solvePath[i][1] * cellSize + cellSize / 2,
                        solvePath[i][0] * cellSize + cellSize / 2
                    );
                }
                ctx.stroke();
                ctx.restore();

                ctx.save();
                ctx.fillStyle = '#a5f3a8';
                ctx.shadowColor = 'rgba(107, 203, 119, 0.5)';
                ctx.shadowBlur = cellSize * 0.3;
                for (var i = 0; i < pathLimit; i++) {
                    var pr = solvePath[i][0], pc = solvePath[i][1];
                    var dotR = Math.max(cellSize * 0.18, 2);
                    ctx.beginPath();
                    ctx.arc(pc * cellSize + cellSize / 2, pr * cellSize + cellSize / 2, dotR, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }

        var startX = 1 * cellSize, startY = 1 * cellSize;
        ctx.fillStyle = '#00e5ff';
        ctx.fillRect(startX + 2, startY + 2, cellSize - 4, cellSize - 4);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.3)';
        ctx.fillRect(startX - 1, startY - 1, cellSize + 2, cellSize + 2);

        var endX = endCol * cellSize, endY = endRow * cellSize;
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(endX + 2, endY + 2, cellSize - 4, cellSize - 4);
        ctx.fillStyle = 'rgba(255, 107, 107, 0.3)';
        ctx.fillRect(endX - 1, endY - 1, cellSize + 2, cellSize + 2);

        var px = playerCol * cellSize, py = playerRow * cellSize;
        var glow = ctx.createRadialGradient(
            px + cellSize / 2, py + cellSize / 2, 0,
            px + cellSize / 2, py + cellSize / 2, cellSize
        );
        glow.addColorStop(0, 'rgba(255, 217, 61, 0.4)');
        glow.addColorStop(1, 'rgba(255, 217, 61, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(px - cellSize / 2, py - cellSize / 2, cellSize * 2, cellSize * 2);
        ctx.fillStyle = '#ffd93d';
        var pad = Math.max(1, Math.floor(cellSize * 0.15));
        ctx.fillRect(px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2);
    }

    function drawGeneratingMaze() {
        if (!genGrid) return;
        var size = genGrid.length;
        ctx.fillStyle = '#0a0e1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (var r = 0; r < size; r++) {
            for (var c = 0; c < size; c++) {
                var x = c * cellSize, y = r * cellSize;
                if (genGrid[r][c] === 1) {
                    ctx.fillStyle = '#2a2a5a';
                    ctx.fillRect(x, y, cellSize, cellSize);
                    ctx.fillStyle = '#3a3a7a';
                    ctx.fillRect(x, y, cellSize, 1);
                    ctx.fillRect(x, y, 1, cellSize);
                } else {
                    ctx.fillStyle = '#0f1025';
                    ctx.fillRect(x, y, cellSize, cellSize);
                }
            }
        }

        if (genAnimIndex > 0 && genAnimIndex <= genSteps.length) {
            var lastIdx = genAnimIndex - 1;
            var lr = genSteps[lastIdx][0], lc = genSteps[lastIdx][1];
            var lval = genSteps[lastIdx][2];
            ctx.save();
            var glowR = cellSize * 1.2;
            var glow = ctx.createRadialGradient(
                lc * cellSize + cellSize / 2, lr * cellSize + cellSize / 2, 0,
                lc * cellSize + cellSize / 2, lr * cellSize + cellSize / 2, glowR
            );
            if (lval === 0) {
                glow.addColorStop(0, 'rgba(0, 229, 255, 0.35)');
                glow.addColorStop(1, 'rgba(0, 229, 255, 0)');
            } else {
                glow.addColorStop(0, 'rgba(255, 107, 107, 0.35)');
                glow.addColorStop(1, 'rgba(255, 107, 107, 0)');
            }
            ctx.fillStyle = glow;
            ctx.fillRect(
                lc * cellSize + cellSize / 2 - glowR,
                lr * cellSize + cellSize / 2 - glowR,
                glowR * 2, glowR * 2
            );
            ctx.restore();
        }
    }

    function movePlayer(dr, dc) {
        if (gameWon || autoSolving || generating) return;
        var nr = playerRow + dr, nc = playerCol + dc;
        if (nr >= 0 && nr < mazeSize && nc >= 0 && nc < mazeSize && maze[nr][nc] === 0) {
            playerRow = nr;
            playerCol = nc;
            steps++;
            stepCountEl.textContent = steps;
            trailCells.push([nr, nc]);
            drawMaze();
            if (playerRow === endRow && playerCol === endCol) winGame();
        }
    }

    function winGame() {
        gameWon = true;
        stopTimer();
        var elapsed = getElapsedTime();
        overlayTitle.textContent = '恭喜通关！';
        overlayDetail.textContent = '步数: ' + steps + '\n用时: ' + formatTime(elapsed);
        boardOverlay.style.display = 'flex';
    }

    function startTimer() {
        startTime = Date.now();
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(function () {
            timeDisplayEl.textContent = formatTime(getElapsedTime());
        }, 100);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function getElapsedTime() { return Date.now() - startTime; }

    function formatTime(ms) {
        var totalSec = Math.floor(ms / 1000);
        var min = Math.floor(totalSec / 60);
        var sec = totalSec % 60;
        return min + ':' + (sec < 10 ? '0' : '') + sec;
    }

    function stopGenAnim() {
        generating = false;
        if (genTimeout) {
            clearTimeout(genTimeout);
            genTimeout = null;
        }
    }

    function animateGeneration() {
        if (!generating) return;
        var batchSize = Math.max(1, Math.floor(genSteps.length / 150));
        for (var i = 0; i < batchSize && genAnimIndex < genSteps.length; i++) {
            var step = genSteps[genAnimIndex];
            genGrid[step[0]][step[1]] = step[2];
            genAnimIndex++;
        }

        if (genAnimIndex >= genSteps.length) {
            maze = genGrid;
            genGrid = null;
            generating = false;
            drawMaze();
            startTimer();
            return;
        }

        drawGeneratingMaze();
        genTimeout = setTimeout(animateGeneration, 30);
    }

    window.generateNewMaze = function () {
        stopAutoSolve();
        stopGenAnim();
        stopTimer();
        boardOverlay.style.display = 'none';
        gameWon = false;
        mazeSize = parseInt(sizeSelect.value);
        calcCellSize();

        var algo = algoSelect.value;
        var result = generateMazeWithSteps(algo, mazeSize);

        genSteps = result.steps;
        genInitFill = result.initFill;
        genGrid = createGrid(mazeSize, genInitFill);
        genAnimIndex = 0;
        generating = true;

        playerRow = 1;
        playerCol = 1;
        endRow = mazeSize - 2;
        endCol = mazeSize - 2;
        steps = 0;
        stepCountEl.textContent = '0';
        timeDisplayEl.textContent = '0:00';
        trailCells = [[1, 1]];
        solvePath = [];
        solveVisited = [];
        solveAnimIndex = 0;
        solveAnimPhase = 'explore';
        maze = null;

        animateGeneration();
    };

    window.startAutoSolve = function () {
        if (gameWon || autoSolving || !maze || generating) return;
        autoSolving = true;
        solveBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        var solveAlgo = solveAlgoSelect.value;
        var result;
        if (solveAlgo === 'dfs') {
            result = dfsSolve(maze, playerRow, playerCol, endRow, endCol);
        } else {
            result = bfsSolve(maze, playerRow, playerCol, endRow, endCol);
        }
        solvePath = result.path;
        solveVisited = result.explored;
        solveAnimIndex = 0;
        solveAnimPhase = 'explore';
        animateSolve();
    };

    function animateSolve() {
        if (!autoSolving) return;
        if (solveAnimPhase === 'explore') {
            var batchSize = Math.max(1, Math.floor(solveVisited.length / 60));
            solveAnimIndex += batchSize;
            if (solveAnimIndex >= solveVisited.length) {
                solveAnimIndex = solveVisited.length;
                solveAnimPhase = 'path';
                solveAnimIndex = 0;
            }
            drawMaze();
            autoSolveTimeout = setTimeout(animateSolve, 30);
        } else if (solveAnimPhase === 'path') {
            var pathBatch = Math.max(1, Math.floor(solvePath.length / 40));
            solveAnimIndex += pathBatch;
            if (solveAnimIndex >= solvePath.length) {
                solveAnimIndex = solvePath.length;
                drawMaze();
                for (var i = 0; i < solvePath.length; i++) {
                    playerRow = solvePath[i][0];
                    playerCol = solvePath[i][1];
                    trailCells.push([playerRow, playerCol]);
                }
                steps += solvePath.length - 1;
                stepCountEl.textContent = steps;
                drawMaze();
                autoSolving = false;
                solveBtn.style.display = 'block';
                stopBtn.style.display = 'none';
                return;
            }
            drawMaze();
            autoSolveTimeout = setTimeout(animateSolve, 50);
        }
    }

    window.stopAutoSolve = function () {
        autoSolving = false;
        if (autoSolveTimeout) {
            clearTimeout(autoSolveTimeout);
            autoSolveTimeout = null;
        }
        solveBtn.style.display = 'block';
        stopBtn.style.display = 'none';
        solvePath = [];
        solveVisited = [];
        solveAnimIndex = 0;
        drawMaze();
    };

    document.addEventListener('keydown', function (e) {
        if (gameWon || autoSolving || generating) return;
        switch (e.key) {
            case 'ArrowUp': case 'w': case 'W':
                e.preventDefault(); movePlayer(-1, 0); break;
            case 'ArrowDown': case 's': case 'S':
                e.preventDefault(); movePlayer(1, 0); break;
            case 'ArrowLeft': case 'a': case 'A':
                e.preventDefault(); movePlayer(0, -1); break;
            case 'ArrowRight': case 'd': case 'D':
                e.preventDefault(); movePlayer(0, 1); break;
            case 'r': case 'R':
                generateNewMaze(); break;
            case 'f': case 'F':
                startAutoSolve(); break;
        }
    });

    window.addEventListener('resize', function () {
        if (maze) {
            calcCellSize();
            drawMaze();
        }
    });

    generateNewMaze();
})();