(function () {
    var ROWS = 9;
    var COLS = 9;
    var MINES = 10;
    var board = [];
    var revealed = [];
    var flagged = [];
    var questioned = [];
    var gameOver = false;
    var gameWon = false;
    var firstClick = true;
    var timerInterval = null;
    var timerValue = 0;
    var minesLeft = MINES;
    var questionMarkEnabled = true;
    var currentDifficulty = 'beginner';

    var difficulties = {
        beginner: { rows: 9, cols: 9, mines: 10 },
        intermediate: { rows: 16, cols: 16, mines: 40 },
        expert: { rows: 16, cols: 30, mines: 99 }
    };

    var numberColors = {
        1: '#0000ff', 2: '#008000', 3: '#ff0000', 4: '#000080',
        5: '#800000', 6: '#008080', 7: '#000000', 8: '#808080'
    };

    var audioCtx = null;
    function getAudioCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    function playRevealSound() {
        try {
            var ctx = getAudioCtx();
            var now = ctx.currentTime;

            var bufferSize = Math.floor(ctx.sampleRate * 0.06);
            var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            var data = buffer.getChannelData(0);
            for (var i = 0; i < bufferSize; i++) {
                var t = i / bufferSize;
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 4) * 0.6;
            }
            var noise = ctx.createBufferSource();
            noise.buffer = buffer;
            var noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(0.18, now);
            var noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(3000, now);
            noiseFilter.Q.setValueAtTime(1.5, now);
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(ctx.destination);
            noise.start(now);
            noise.stop(now + 0.06);

            var osc = ctx.createOscillator();
            var oscGain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.04);
            oscGain.gain.setValueAtTime(0.08, now);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
            osc.connect(oscGain);
            oscGain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.06);
        } catch (e) { }
    }

    function playFlagSound() {
        try {
            var ctx = getAudioCtx();
            var now = ctx.currentTime;

            var bufferSize = Math.floor(ctx.sampleRate * 0.08);
            var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            var data = buffer.getChannelData(0);
            for (var i = 0; i < bufferSize; i++) {
                var t = i / bufferSize;
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 6) * 0.8;
            }
            var noise = ctx.createBufferSource();
            noise.buffer = buffer;
            var noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(0.22, now);
            var noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = 'highpass';
            noiseFilter.frequency.setValueAtTime(4000, now);
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(ctx.destination);
            noise.start(now);
            noise.stop(now + 0.08);

            var osc1 = ctx.createOscillator();
            var osc1Gain = ctx.createGain();
            osc1.type = 'square';
            osc1.frequency.setValueAtTime(1800, now);
            osc1.frequency.exponentialRampToValueAtTime(2400, now + 0.02);
            osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
            osc1Gain.gain.setValueAtTime(0.06, now);
            osc1Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc1.connect(osc1Gain);
            osc1Gain.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.08);

            var osc2 = ctx.createOscillator();
            var osc2Gain = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(3600, now);
            osc2.frequency.exponentialRampToValueAtTime(2000, now + 0.05);
            osc2Gain.gain.setValueAtTime(0.04, now);
            osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc2.connect(osc2Gain);
            osc2Gain.connect(ctx.destination);
            osc2.start(now);
            osc2.stop(now + 0.05);
        } catch (e) { }
    }

    function playUnflagSound() {
        try {
            var ctx = getAudioCtx();
            var now = ctx.currentTime;

            var bufferSize = Math.floor(ctx.sampleRate * 0.07);
            var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            var data = buffer.getChannelData(0);
            for (var i = 0; i < bufferSize; i++) {
                var t = i / bufferSize;
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 5) * 0.5;
            }
            var noise = ctx.createBufferSource();
            noise.buffer = buffer;
            var noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(0.12, now);
            var noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(2500, now);
            noiseFilter.Q.setValueAtTime(2, now);
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(ctx.destination);
            noise.start(now);
            noise.stop(now + 0.07);

            var osc = ctx.createOscillator();
            var oscGain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.07);
            oscGain.gain.setValueAtTime(0.1, now);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
            osc.connect(oscGain);
            oscGain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.07);
        } catch (e) { }
    }

    function playExplodeSound(times) {
        try {
            var ctx = getAudioCtx();
            times.forEach(function (timeMs, rep) {
                var offset = timeMs / 1000;
                var now = ctx.currentTime + offset;

                var crackSize = Math.floor(ctx.sampleRate * 0.12);
                var crackBuffer = ctx.createBuffer(1, crackSize, ctx.sampleRate);
                var crackData = crackBuffer.getChannelData(0);
                for (var i = 0; i < crackSize; i++) {
                    var t = i / crackSize;
                    crackData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 8);
                }
                var crack = ctx.createBufferSource();
                crack.buffer = crackBuffer;
                var crackGain = ctx.createGain();
                crackGain.gain.setValueAtTime(0.35, now);
                crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                var crackFilter = ctx.createBiquadFilter();
                crackFilter.type = 'highpass';
                crackFilter.frequency.setValueAtTime(2000, now);
                crackFilter.frequency.exponentialRampToValueAtTime(500, now + 0.1);
                crack.connect(crackFilter);
                crackFilter.connect(crackGain);
                crackGain.connect(ctx.destination);
                crack.start(now);
                crack.stop(now + 0.12);

                var rumbleSize = Math.floor(ctx.sampleRate * 1.0);
                var rumbleBuffer = ctx.createBuffer(1, rumbleSize, ctx.sampleRate);
                var rumbleData = rumbleBuffer.getChannelData(0);
                for (var i = 0; i < rumbleSize; i++) {
                    var t = i / rumbleSize;
                    rumbleData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2);
                }
                var rumble = ctx.createBufferSource();
                rumble.buffer = rumbleBuffer;
                var rumbleGain = ctx.createGain();
                rumbleGain.gain.setValueAtTime(0, now);
                rumbleGain.gain.linearRampToValueAtTime(0.3, now + 0.02);
                rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
                var rumbleFilter = ctx.createBiquadFilter();
                rumbleFilter.type = 'lowpass';
                rumbleFilter.frequency.setValueAtTime(600, now);
                rumbleFilter.frequency.exponentialRampToValueAtTime(80, now + 0.8);
                rumbleFilter.Q.setValueAtTime(1.5, now);
                rumble.connect(rumbleFilter);
                rumbleFilter.connect(rumbleGain);
                rumbleGain.connect(ctx.destination);
                rumble.start(now);
                rumble.stop(now + 1.0);

                var osc = ctx.createOscillator();
                var oscGain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
                oscGain.gain.setValueAtTime(0.12, now);
                oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                var oscFilter = ctx.createBiquadFilter();
                oscFilter.type = 'lowpass';
                oscFilter.frequency.setValueAtTime(300, now);
                oscFilter.frequency.exponentialRampToValueAtTime(60, now + 0.5);
                osc.connect(oscFilter);
                oscFilter.connect(oscGain);
                oscGain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.5);
            });
        } catch (e) { }
    }

    function playWinSound() {
        try {
            var ctx = getAudioCtx();
            var now = ctx.currentTime;
            var notes = [523, 659, 784, 1047, 784, 1047];
            var durations = [0.35, 0.35, 0.35, 0.5, 0.25, 0.6];

            notes.forEach(function (freq, i) {
                var start = now + i * 0.18;
                var dur = durations[i];

                var osc1 = ctx.createOscillator();
                var gain1 = ctx.createGain();
                osc1.type = 'sine';
                osc1.frequency.setValueAtTime(freq, start);
                gain1.gain.setValueAtTime(0, start);
                gain1.gain.linearRampToValueAtTime(0.2, start + 0.02);
                gain1.gain.setValueAtTime(0.2, start + dur * 0.6);
                gain1.gain.exponentialRampToValueAtTime(0.001, start + dur);
                osc1.connect(gain1);
                gain1.connect(ctx.destination);
                osc1.start(start);
                osc1.stop(start + dur);

                var osc2 = ctx.createOscillator();
                var gain2 = ctx.createGain();
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(freq * 2, start);
                gain2.gain.setValueAtTime(0, start);
                gain2.gain.linearRampToValueAtTime(0.06, start + 0.02);
                gain2.gain.exponentialRampToValueAtTime(0.001, start + dur * 0.7);
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.start(start);
                osc2.stop(start + dur * 0.7);

                var osc3 = ctx.createOscillator();
                var gain3 = ctx.createGain();
                osc3.type = 'sine';
                osc3.frequency.setValueAtTime(freq * 3, start);
                gain3.gain.setValueAtTime(0, start);
                gain3.gain.linearRampToValueAtTime(0.025, start + 0.02);
                gain3.gain.exponentialRampToValueAtTime(0.001, start + dur * 0.5);
                osc3.connect(gain3);
                gain3.connect(ctx.destination);
                osc3.start(start);
                osc3.stop(start + dur * 0.5);
            });

            var sparkleStart = now + notes.length * 0.18 + 0.1;
            for (var s = 0; s < 5; s++) {
                var sparkleTime = sparkleStart + s * 0.08;
                var sparkleSize = Math.floor(ctx.sampleRate * 0.15);
                var sparkleBuffer = ctx.createBuffer(1, sparkleSize, ctx.sampleRate);
                var sparkleData = sparkleBuffer.getChannelData(0);
                for (var i = 0; i < sparkleSize; i++) {
                    var t = i / sparkleSize;
                    sparkleData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3);
                }
                var sparkle = ctx.createBufferSource();
                sparkle.buffer = sparkleBuffer;
                var sparkleGain = ctx.createGain();
                sparkleGain.gain.setValueAtTime(0.08, sparkleTime);
                sparkleGain.gain.exponentialRampToValueAtTime(0.001, sparkleTime + 0.15);
                var sparkleFilter = ctx.createBiquadFilter();
                sparkleFilter.type = 'bandpass';
                sparkleFilter.frequency.setValueAtTime(6000 + s * 800, sparkleTime);
                sparkleFilter.Q.setValueAtTime(5, sparkleTime);
                sparkle.connect(sparkleFilter);
                sparkleFilter.connect(sparkleGain);
                sparkleGain.connect(ctx.destination);
                sparkle.start(sparkleTime);
                sparkle.stop(sparkleTime + 0.15);
            }
        } catch (e) { }
    }

    function init() {
        var diff = difficulties[currentDifficulty];
        ROWS = diff.rows;
        COLS = diff.cols;
        MINES = diff.mines;
        minesLeft = MINES;
        gameOver = false;
        gameWon = false;
        firstClick = true;
        timerValue = 0;

        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        board = [];
        revealed = [];
        flagged = [];
        questioned = [];

        for (var r = 0; r < ROWS; r++) {
            board[r] = [];
            revealed[r] = [];
            flagged[r] = [];
            questioned[r] = [];
            for (var c = 0; c < COLS; c++) {
                board[r][c] = 0;
                revealed[r][c] = false;
                flagged[r][c] = false;
                questioned[r][c] = false;
            }
        }

        updateMineCounter();
        updateTimer();
        document.getElementById('faceBtn').textContent = '🙂';
        updateDifficultyMenu();
        renderBoard();
        resizeBoard();
    }

    function placeMines(safeRow, safeCol) {
        var placed = 0;
        while (placed < MINES) {
            var r = Math.floor(Math.random() * ROWS);
            var c = Math.floor(Math.random() * COLS);
            if (board[r][c] === -1) continue;
            if (Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1) continue;
            board[r][c] = -1;
            placed++;
        }

        for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                if (board[r][c] === -1) continue;
                var count = 0;
                for (var dr = -1; dr <= 1; dr++) {
                    for (var dc = -1; dc <= 1; dc++) {
                        var nr = r + dr;
                        var nc = c + dc;
                        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === -1) {
                            count++;
                        }
                    }
                }
                board[r][c] = count;
            }
        }
    }

    function resizeBoard() {
        var container = document.querySelector('.game-container');
        var menuBar = document.querySelector('.menu-bar');
        var headerPanel = document.querySelector('.header-panel');
        var statusBar = document.querySelector('.status-bar');

        var containerH = container.getBoundingClientRect().height;
        var usedH = 0;
        if (menuBar) usedH += menuBar.offsetHeight;
        if (headerPanel) usedH += headerPanel.offsetHeight;
        if (statusBar) usedH += statusBar.offsetHeight;

        var availHeight = containerH - usedH;
        var availWidth = window.innerWidth - 20;

        var cellByH = Math.floor(availHeight / ROWS);
        var cellByW = Math.floor(availWidth / COLS);

        var cellSize = Math.min(cellByH, cellByW);
        cellSize = Math.max(cellSize, 20);

        document.documentElement.style.setProperty('--cell-size', cellSize + 'px');
    }

    function renderBoard() {
        var table = document.getElementById('mineTable');
        table.innerHTML = '';

        for (var r = 0; r < ROWS; r++) {
            var tr = document.createElement('tr');
            for (var c = 0; c < COLS; c++) {
                var td = document.createElement('td');
                td.className = 'cell anim-init';
                td.dataset.row = r;
                td.dataset.col = c;
                var delay = (r + c) * 20;
                td.style.animationDelay = delay + 'ms';

                (function (cellTd) {
                    setTimeout(function () {
                        cellTd.classList.remove('anim-init');
                    }, delay + 260);
                })(td);

                td.addEventListener('mousedown', function (e) {
                    if (gameOver || gameWon) return;
                    if (e.button === 0) {
                        var row = parseInt(this.dataset.row);
                        var col = parseInt(this.dataset.col);
                        if (!revealed[row][col] && !flagged[row][col]) {
                            document.getElementById('faceBtn').textContent = '😮';
                        }
                    }
                });

                td.addEventListener('mouseup', function (e) {
                    if (gameOver || gameWon) return;
                    document.getElementById('faceBtn').textContent = '🙂';
                });

                td.addEventListener('click', function (e) {
                    var row = parseInt(this.dataset.row);
                    var col = parseInt(this.dataset.col);
                    handleLeftClick(row, col);
                });

                td.addEventListener('contextmenu', function (e) {
                    e.preventDefault();
                    var row = parseInt(this.dataset.row);
                    var col = parseInt(this.dataset.col);
                    handleRightClick(row, col);
                });

                td.addEventListener('dblclick', function (e) {
                    var row = parseInt(this.dataset.row);
                    var col = parseInt(this.dataset.col);
                    handleDoubleClick(row, col);
                });

                tr.appendChild(td);
            }
            table.appendChild(tr);
        }
    }

    function handleLeftClick(row, col) {
        if (gameOver || gameWon) return;
        if (flagged[row][col]) return;
        if (questioned[row][col]) return;

        if (firstClick) {
            firstClick = false;
            placeMines(row, col);
            startTimer();
        }

        if (revealed[row][col]) return;

        if (board[row][col] === -1) {
            gameOver = true;
            revealed[row][col] = true;
            stopTimer();
            document.getElementById('faceBtn').textContent = '😵';
            var faceBtn = document.getElementById('faceBtn');
            faceBtn.classList.add('anim-bounce');
            setTimeout(function () { faceBtn.classList.remove('anim-bounce'); }, 300);
            var counterEl = document.getElementById('mineCounter');
            counterEl.classList.add('anim-flash');
            setTimeout(function () { counterEl.classList.remove('anim-flash'); }, 1500);
            revealAllMines(row, col);
            return;
        }

        reveal(row, col);
        processRevealQueue();
        playRevealSound();
        checkWin();
    }

    function handleRightClick(row, col) {
        if (gameOver || gameWon) return;
        if (revealed[row][col]) return;

        var animClass = '';
        if (!flagged[row][col] && !questioned[row][col]) {
            flagged[row][col] = true;
            minesLeft--;
            animClass = 'anim-flag';
            playFlagSound();
        } else if (flagged[row][col]) {
            flagged[row][col] = false;
            minesLeft++;
            playUnflagSound();
            if (questionMarkEnabled) {
                questioned[row][col] = true;
                animClass = 'anim-question';
            }
        } else if (questioned[row][col]) {
            questioned[row][col] = false;
        }

        updateMineCounter();
        updateCellAnimated(row, col, animClass);
    }

    function handleDoubleClick(row, col) {
        if (gameOver || gameWon) return;
        if (!revealed[row][col]) return;
        if (board[row][col] <= 0) return;

        var flagCount = 0;
        for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
                var nr = row + dr;
                var nc = col + dc;
                if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && flagged[nr][nc]) {
                    flagCount++;
                }
            }
        }

        if (flagCount === board[row][col]) {
            var hitMine = false;
            for (var dr = -1; dr <= 1; dr++) {
                for (var dc = -1; dc <= 1; dc++) {
                    var nr = row + dr;
                    var nc = col + dc;
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                        if (!revealed[nr][nc] && !flagged[nr][nc]) {
                            if (board[nr][nc] === -1) {
                                hitMine = true;
                                revealed[nr][nc] = true;
                            } else {
                                reveal(nr, nc);
                            }
                        }
                    }
                }
            }

            if (hitMine) {
                gameOver = true;
                stopTimer();
                document.getElementById('faceBtn').textContent = '😵';
                var faceBtn = document.getElementById('faceBtn');
                faceBtn.classList.add('anim-bounce');
                setTimeout(function () { faceBtn.classList.remove('anim-bounce'); }, 300);
                revealAllMines(row, col);
            } else {
                processRevealQueue();
                playRevealSound();
                checkWin();
            }
        }
    }

    var revealQueue = [];
    var revealTimer = null;

    function reveal(row, col) {
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
        if (revealed[row][col] || flagged[row][col]) return;

        revealed[row][col] = true;
        questioned[row][col] = false;
        revealQueue.push({ row: row, col: col });

        if (board[row][col] === 0) {
            for (var dr = -1; dr <= 1; dr++) {
                for (var dc = -1; dc <= 1; dc++) {
                    reveal(row + dr, col + dc);
                }
            }
        }
    }

    function processRevealQueue() {
        var idx = 0;
        function step() {
            if (idx >= revealQueue.length) {
                revealQueue = [];
                return;
            }
            var item = revealQueue[idx];
            updateCellAnimated(item.row, item.col, 'anim-reveal');
            idx++;
            if (idx < revealQueue.length) {
                setTimeout(step, 15);
            } else {
                revealQueue = [];
            }
        }
        step();
    }

    function updateCellAnimated(row, col, animClass) {
        var table = document.getElementById('mineTable');
        var td = table.rows[row].cells[col];

        td.classList.remove('anim-reveal', 'anim-flag', 'anim-question', 'anim-explode', 'anim-init', 'anim-number', 'anim-win');
        void td.offsetWidth;

        td.className = 'cell';
        td.innerHTML = '';

        if (revealed[row][col]) {
            td.classList.add('revealed');
            if (animClass) td.classList.add(animClass);
            if (board[row][col] === -1) {
                td.innerHTML = '<span class="cell-content">💣</span>';
            } else if (board[row][col] > 0) {
                td.classList.add('anim-number');
                td.innerHTML = '<span class="cell-content" style="color:' + numberColors[board[row][col]] + '">' + board[row][col] + '</span>';
            }
        } else {
            if (animClass) td.classList.add(animClass);
            if (flagged[row][col]) {
                td.classList.add('flagged');
            } else if (questioned[row][col]) {
                td.classList.add('questioned');
            }
        }
    }

    function updateCell(row, col) {
        var table = document.getElementById('mineTable');
        var td = table.rows[row].cells[col];
        td.className = 'cell';
        td.innerHTML = '';

        if (revealed[row][col]) {
            td.classList.add('revealed');
            if (board[row][col] === -1) {
                td.innerHTML = '<span class="cell-content">💣</span>';
            } else if (board[row][col] > 0) {
                td.innerHTML = '<span class="cell-content" style="color:' + numberColors[board[row][col]] + '">' + board[row][col] + '</span>';
            }
        } else {
            if (flagged[row][col]) {
                td.classList.add('flagged');
            } else if (questioned[row][col]) {
                td.classList.add('questioned');
            }
        }
    }

    function revealAllMines(explodedRow, explodedCol) {
        var minePositions = [];
        var wrongFlags = [];

        for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                if (board[r][c] === -1) {
                    if (r === explodedRow && c === explodedCol) {
                        revealed[r][c] = true;
                        var td = document.getElementById('mineTable').rows[r].cells[c];
                        td.className = 'cell revealed mine-exploded anim-explode';
                        td.innerHTML = '<span class="cell-content">💣</span>';
                    } else if (!flagged[r][c]) {
                        revealed[r][c] = true;
                        minePositions.push({ row: r, col: c });
                    }
                } else if (flagged[r][c]) {
                    wrongFlags.push({ row: r, col: c });
                }
            }
        }

        var allItems = [];
        minePositions.forEach(function (pos) { allItems.push({ row: pos.row, col: pos.col, type: 'mine' }); });
        wrongFlags.forEach(function (pos) { allItems.push({ row: pos.row, col: pos.col, type: 'wrong' }); });

        var totalCount = allItems.length;
        if (totalCount === 0) return;

        var stepDelay = 150;
        var maxDuration = 6000;
        var itemsPerStep = [];
        var remaining = totalCount;
        var batchSize = 1;
        var totalSteps = 0;

        while (remaining > 0) {
            var take = Math.min(batchSize, remaining);
            itemsPerStep.push(take);
            remaining -= take;
            batchSize = Math.floor(batchSize * 1.4) + 1;
            totalSteps++;
        }

        var actualDuration = Math.min(totalSteps * stepDelay, maxDuration);
        var adjustedDelay = totalSteps > 0 ? actualDuration / totalSteps : stepDelay;

        var soundTimes = [];
        var idx = 0;
        itemsPerStep.forEach(function (count, step) {
            var time = step * adjustedDelay;
            for (var j = 0; j < count; j++) {
                (function (itemIdx, t) {
                    setTimeout(function () {
                        var item = allItems[itemIdx];
                        if (item.type === 'mine') {
                            updateCellAnimated(item.row, item.col, 'anim-explode');
                        } else {
                            var td = document.getElementById('mineTable').rows[item.row].cells[item.col];
                            td.className = 'cell revealed anim-explode';
                            td.innerHTML = '<span class="cell-content">❌</span>';
                        }
                    }, t);
                })(idx + j, time);
            }
            soundTimes.push(time);
            idx += count;
        });

        playExplodeSound(soundTimes);
    }

    function checkWin() {
        var unrevealedCount = 0;
        for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                if (!revealed[r][c]) unrevealedCount++;
            }
        }

        if (unrevealedCount === MINES) {
            gameWon = true;
            stopTimer();
            playWinSound();
            document.getElementById('faceBtn').textContent = '😎';

            var faceBtn = document.getElementById('faceBtn');
            faceBtn.classList.add('anim-bounce');
            setTimeout(function () { faceBtn.classList.remove('anim-bounce'); }, 300);

            var timerEl = document.getElementById('timerDisplay');
            timerEl.classList.add('anim-flash');
            setTimeout(function () { timerEl.classList.remove('anim-flash'); }, 1500);

            for (var r = 0; r < ROWS; r++) {
                for (var c = 0; c < COLS; c++) {
                    if (!revealed[r][c] && !flagged[r][c]) {
                        flagged[r][c] = true;
                        updateCellAnimated(r, c, 'anim-flag');
                    }
                    if (revealed[r][c]) {
                        (function (rr, cc) {
                            setTimeout(function () {
                                var td = document.getElementById('mineTable').rows[rr].cells[cc];
                                td.classList.add('anim-win');
                            }, (rr + cc) * 30);
                        })(r, c);
                    }
                }
            }
            minesLeft = 0;
            updateMineCounter();

            spawnConfetti();
        }
    }

    function spawnConfetti() {
        var colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#ff69b4'];
        var container = document.querySelector('.game-container');
        var rect = container.getBoundingClientRect();

        for (var i = 0; i < 60; i++) {
            (function (index) {
                setTimeout(function () {
                    var piece = document.createElement('div');
                    piece.className = 'confetti-piece';
                    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                    piece.style.left = (rect.left + Math.random() * rect.width) + 'px';
                    piece.style.top = (rect.top + rect.height * 0.3 + Math.random() * rect.height * 0.4) + 'px';
                    piece.style.width = (4 + Math.random() * 8) + 'px';
                    piece.style.height = (4 + Math.random() * 8) + 'px';
                    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
                    piece.style.animationDuration = (1 + Math.random() * 1.5) + 's';
                    document.body.appendChild(piece);
                    setTimeout(function () {
                        if (piece.parentNode) piece.parentNode.removeChild(piece);
                    }, 2500);
                }, index * 30);
            })(i);
        }
    }

    function startTimer() {
        if (timerInterval) return;
        timerInterval = setInterval(function () {
            timerValue++;
            if (timerValue > 999) timerValue = 999;
            updateTimer();
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function updateTimer() {
        document.getElementById('timerDisplay').textContent = pad3(timerValue);
    }

    function updateMineCounter() {
        var val = minesLeft;
        if (val < 0) {
            document.getElementById('mineCounter').textContent = '-' + pad2(Math.abs(val));
        } else {
            document.getElementById('mineCounter').textContent = pad3(val);
        }
    }

    function pad3(n) {
        return String(n).padStart(3, '0');
    }

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function updateDifficultyMenu() {
        document.getElementById('difficultySelect').value = currentDifficulty;
        document.getElementById('questionCheckbox').checked = questionMarkEnabled;
    }

    window.setDifficulty = function (diff) {
        currentDifficulty = diff;
        init();
    };

    window.toggleQuestionMark = function () {
        questionMarkEnabled = document.getElementById('questionCheckbox').checked;

        if (!questionMarkEnabled) {
            for (var r = 0; r < ROWS; r++) {
                for (var c = 0; c < COLS; c++) {
                    if (questioned[r][c]) {
                        questioned[r][c] = false;
                        updateCell(r, c);
                    }
                }
            }
        }
    };

    window.resetGame = function () {
        var faceBtn = document.getElementById('faceBtn');
        faceBtn.classList.add('anim-bounce');
        setTimeout(function () { faceBtn.classList.remove('anim-bounce'); }, 300);
        init();
    };

    window.addEventListener('resize', function () {
        resizeBoard();
    });

    init();
})();