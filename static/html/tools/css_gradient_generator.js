document.addEventListener('DOMContentLoaded', function () {
    var state = {
        type: 'linear',
        angle: 0,
        shape: 'circle',
        position: 'center',
        stops: [
            { id: 's1', color: '#6366F1', position: 0 },
            { id: 's2', color: '#8B5CF6', position: 100 }
        ]
    };
    var stopIdCounter = 2;
    var isCustomAngle = false;

    var stopsList = Tools.$('stops-list');
    var previewBox = Tools.$('preview-box');
    var codeOutput = Tools.$('code-output');
    var angleInput = Tools.$('angle');
    var angleValue = Tools.$('angle-value');
    var linearSection = Tools.$('linear-section');
    var radialSection = Tools.$('radial-section');
    var presetRow = Tools.$('preset-row');
    var applyAngleBtn = Tools.$('btn-apply-angle');

    var presets = [
        ['#6366F1', '#8B5CF6'],
        ['#F472B6', '#EC4899'],
        ['#10B981', '#059669'],
        ['#3B82F6', '#2563EB'],
        ['#F59E0B', '#F97316'],
        ['#6B7280', '#374151'],
        ['#1E293B', '#0F172A']
    ];

    function showMsg(type, text) { Tools.showBanner('msg-banner', type, text); }

    // Type buttons
    Tools.$$('button[data-type]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            Tools.$$('button[data-type]').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            state.type = btn.getAttribute('data-type');
            linearSection.classList.toggle('hidden', state.type !== 'linear');
            radialSection.classList.toggle('hidden', state.type !== 'radial');
            update();
        });
    });

    // Direction buttons (8 preset directions)
    function updateDirButtonsActive() {
        Tools.$$('.dir-btn').forEach(function (btn) {
            var a = parseInt(btn.getAttribute('data-angle'), 10);
            btn.classList.toggle('active', !isCustomAngle && state.angle === a);
        });
    }
    Tools.$$('.dir-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var a = parseInt(btn.getAttribute('data-angle'), 10);
            state.angle = a;
            isCustomAngle = false;
            angleInput.value = a;
            angleValue.textContent = a + '°';
            applyAngleBtn.classList.remove('btn-primary');
            applyAngleBtn.classList.add('btn-secondary');
            updateDirButtonsActive();
            update();
        });
    });

    // Angle slider + apply button
    angleInput.addEventListener('input', function () {
        var a = parseInt(angleInput.value, 10);
        angleValue.textContent = a + '°';
    });
    applyAngleBtn.addEventListener('click', function () {
        var a = parseInt(angleInput.value, 10);
        state.angle = a;
        isCustomAngle = true;
        applyAngleBtn.classList.remove('btn-secondary');
        applyAngleBtn.classList.add('btn-primary');
        updateDirButtonsActive();
        update();
    });

    // Radial shape
    Tools.$$('button[data-shape]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            Tools.$$('button[data-shape]').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            state.shape = btn.getAttribute('data-shape');
            update();
        });
    });
    // Radial position
    Tools.$$('button[data-pos]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            Tools.$$('button[data-pos]').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            state.position = btn.getAttribute('data-pos');
            update();
        });
    });

    // Stops list rendering
    function renderStops() {
        stopsList.innerHTML = '';
        var sorted = state.stops.slice().sort(function (a, b) { return a.position - b.position; });
        sorted.forEach(function (stop) {
            var row = Tools.el('div', { class: 'stop-row' });

            var colorInput = Tools.el('input', { type: 'color', value: stop.color });
            colorInput.addEventListener('input', function () {
                stop.color = colorInput.value;
                hexInput.value = colorInput.value;
                update();
            });

            var hexInput = Tools.el('input', { type: 'text', class: 'tool-input stop-hex', value: stop.color });
            hexInput.addEventListener('input', function () {
                var v = hexInput.value.trim();
                if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
                    stop.color = v;
                    colorInput.value = v;
                    update();
                }
            });

            var posInput = Tools.el('input', { type: 'number', class: 'tool-input stop-pos', value: stop.position, min: '0', max: '100' });
            posInput.addEventListener('input', function () {
                var n = parseInt(posInput.value, 10);
                if (isNaN(n)) n = 0;
                n = Math.max(0, Math.min(100, n));
                stop.position = n;
                update();
            });

            var delBtn = Tools.el('button', { class: 'stop-del', type: 'button', title: '删除', text: '×' });
            delBtn.disabled = state.stops.length <= 2;
            delBtn.addEventListener('click', function () {
                if (state.stops.length <= 2) return;
                state.stops = state.stops.filter(function (s) { return s.id !== stop.id; });
                renderStops();
                update();
            });

            row.appendChild(colorInput);
            row.appendChild(hexInput);
            row.appendChild(posInput);
            row.appendChild(delBtn);
            stopsList.appendChild(row);
        });
    }

    Tools.$('btn-add-stop').addEventListener('click', function () {
        stopIdCounter++;
        var sorted = state.stops.slice().sort(function (a, b) { return a.position - b.position; });
        var maxGap = 0;
        var insertPos = 50;
        for (var i = 0; i < sorted.length - 1; i++) {
            var gap = sorted[i + 1].position - sorted[i].position;
            if (gap > maxGap) {
                maxGap = gap;
                insertPos = Math.round(sorted[i].position + gap / 2);
            }
        }
        state.stops.push({ id: 's' + stopIdCounter, color: '#818CF8', position: insertPos });
        renderStops();
        update();
    });

    Tools.$('btn-random').addEventListener('click', function () {
        function randColor() {
            var letters = '0123456789ABCDEF';
            var c = '#';
            for (var i = 0; i < 6; i++) c += letters[Math.floor(Math.random() * 16)];
            return c;
        }
        state.stops.forEach(function (s) { s.color = randColor(); });
        state.type = Math.random() > 0.5 ? 'linear' : 'radial';
        if (state.type === 'linear') {
            var dirs = [0, 45, 90, 135, 180, 225, 270, 315];
            state.angle = dirs[Math.floor(Math.random() * dirs.length)];
            isCustomAngle = false;
            angleInput.value = state.angle;
            angleValue.textContent = state.angle + '°';
            applyAngleBtn.classList.remove('btn-primary');
            applyAngleBtn.classList.add('btn-secondary');
        } else {
            state.shape = Math.random() > 0.5 ? 'circle' : 'ellipse';
            var positions = ['center', 'top', 'right', 'bottom', 'left', 'top right', 'bottom right', 'bottom left', 'top left'];
            state.position = positions[Math.floor(Math.random() * positions.length)];
        }
        Tools.$$('button[data-type]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-type') === state.type);
        });
        linearSection.classList.toggle('hidden', state.type !== 'linear');
        radialSection.classList.toggle('hidden', state.type !== 'radial');
        Tools.$$('button[data-shape]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-shape') === state.shape);
        });
        Tools.$$('button[data-pos]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-pos') === state.position);
        });
        updateDirButtonsActive();
        renderStops();
        update();
    });

    // Presets
    presets.forEach(function (colors) {
        var div = Tools.el('div', {
            class: 'preset-color',
            style: { background: 'linear-gradient(to right, ' + colors[0] + ', ' + colors[1] + ')' },
            title: colors[0] + ' → ' + colors[1]
        });
        div.addEventListener('click', function () {
            for (var i = 0; i < Math.min(colors.length, state.stops.length); i++) {
                state.stops[i].color = colors[i];
            }
            renderStops();
            update();
        });
        presetRow.appendChild(div);
    });

    function buildStopsString() {
        var sorted = state.stops.slice().sort(function (a, b) { return a.position - b.position; });
        return sorted.map(function (s) { return s.color + ' ' + s.position + '%'; }).join(', ');
    }

    function buildGradient() {
        var stopsStr = buildStopsString();
        if (state.type === 'linear') {
            return 'linear-gradient(' + state.angle + 'deg, ' + stopsStr + ')';
        }
        return 'radial-gradient(' + state.shape + ' at ' + state.position + ', ' + stopsStr + ')';
    }

    function buildCssCode() {
        var stopsStr = buildStopsString();
        var firstColor = state.stops.slice().sort(function (a, b) { return a.position - b.position; })[0].color;
        var lines = [];
        lines.push('/* CSS 渐变代码 */');
        lines.push('background: ' + firstColor + ';');
        if (state.type === 'linear') {
            var dir = state.angle + 'deg';
            lines.push('background: -webkit-linear-gradient(' + dir + ', ' + stopsStr + ');');
            lines.push('background: linear-gradient(' + dir + ', ' + stopsStr + ');');
        } else {
            lines.push('background: -webkit-radial-gradient(' + state.position + ', ' + state.shape + ', ' + stopsStr + ');');
            lines.push('background: radial-gradient(' + state.shape + ' at ' + state.position + ', ' + stopsStr + ');');
        }
        return lines.join('\n');
    }

    function update() {
        var g = buildGradient();
        previewBox.style.background = g;
        codeOutput.textContent = buildCssCode();
    }

    Tools.$('btn-copy').addEventListener('click', function () {
        var fullCss = buildCssCode();
        Tools.copyText(fullCss, Tools.$('btn-copy'), '已复制');
    });

    renderStops();
    updateDirButtonsActive();
    update();
});
