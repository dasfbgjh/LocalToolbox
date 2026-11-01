/* ===== Math Evaluator - safe recursive descent parser ===== */
(function () {
    'use strict';

    var CONSTANTS = {
        pi: Math.PI,
        e: Math.E,
        tau: Math.PI * 2,
        phi: (1 + Math.sqrt(5)) / 2
    };

    var FUNCTIONS = {
        sqrt: Math.sqrt,
        abs: Math.abs,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        asin: Math.asin,
        acos: Math.acos,
        atan: Math.atan,
        log: Math.log10,
        ln: Math.log,
        log2: Math.log2,
        exp: Math.exp,
        round: Math.round,
        floor: Math.floor,
        ceil: Math.ceil,
        sign: Math.sign,
        max: Math.max,
        min: Math.min,
        pow: Math.pow
    };

    function tokenize(input) {
        var tokens = [];
        var i = 0;
        while (i < input.length) {
            var c = input[i];
            if (/\s/.test(c)) { i++; continue; }
            if (/[0-9.]/.test(c)) {
                var num = '';
                while (i < input.length && /[0-9.]/.test(input[i])) {
                    num += input[i];
                    i++;
                }
                // scientific notation
                if (input[i] === 'e' || input[i] === 'E') {
                    if (i + 1 < input.length && (/[0-9+\-]/.test(input[i + 1]))) {
                        num += input[i];
                        i++;
                        if (input[i] === '+' || input[i] === '-') { num += input[i]; i++; }
                        while (i < input.length && /[0-9]/.test(input[i])) { num += input[i]; i++; }
                    }
                }
                tokens.push({ type: 'num', value: parseFloat(num) });
                continue;
            }
            if (/[a-zA-Z_]/.test(c)) {
                var name = '';
                while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
                    name += input[i];
                    i++;
                }
                tokens.push({ type: 'ident', value: name });
                continue;
            }
            if ('+-*/%^(),'.indexOf(c) !== -1) {
                tokens.push({ type: 'op', value: c });
                i++;
                continue;
            }
            if (c === '!') {
                tokens.push({ type: 'op', value: '!' });
                i++;
                continue;
            }
            throw new Error('无法识别的字符: ' + c);
        }
        return tokens;
    }

    function Parser(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    Parser.prototype.peek = function () { return this.tokens[this.pos]; };
    Parser.prototype.next = function () { return this.tokens[this.pos++]; };
    Parser.prototype.expect = function (val) {
        var t = this.next();
        if (!t || t.value !== val) throw new Error('期望 "' + val + '"');
        return t;
    };

    Parser.prototype.parseExpression = function () {
        return this.parseAddSub();
    };

    Parser.prototype.parseAddSub = function () {
        var left = this.parseMulDiv();
        while (this.peek() && (this.peek().value === '+' || this.peek().value === '-')) {
            var op = this.next().value;
            var right = this.parseMulDiv();
            left = op === '+' ? left + right : left - right;
        }
        return left;
    };

    Parser.prototype.parseMulDiv = function () {
        var left = this.parsePower();
        while (this.peek() && (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%')) {
            var op = this.next().value;
            var right = this.parsePower();
            if (op === '*') left = left * right;
            else if (op === '/') left = left / right;
            else left = left % right;
        }
        return left;
    };

    Parser.prototype.parsePower = function () {
        var left = this.parseUnary();
        if (this.peek() && this.peek().value === '^') {
            this.next();
            var right = this.parsePower(); // right associative
            left = Math.pow(left, right);
        }
        return left;
    };

    Parser.prototype.parseUnary = function () {
        if (this.peek() && (this.peek().value === '-' || this.peek().value === '+')) {
            var op = this.next().value;
            var val = this.parseUnary();
            return op === '-' ? -val : val;
        }
        return this.parseFactorial();
    };

    Parser.prototype.parseFactorial = function () {
        var val = this.parsePrimary();
        while (this.peek() && this.peek().value === '!') {
            this.next();
            if (val < 0 || val !== Math.floor(val)) throw new Error('阶乘需要非负整数');
            if (val > 170) throw new Error('阶乘数值过大');
            var result = 1;
            for (var i = 2; i <= val; i++) result *= i;
            val = result;
        }
        return val;
    };

    Parser.prototype.parsePrimary = function () {
        var t = this.peek();
        if (!t) throw new Error('意外的表达式结尾');
        if (t.type === 'num') { this.next(); return t.value; }
        if (t.value === '(') {
            this.next();
            var val = this.parseExpression();
            this.expect(')');
            return val;
        }
        if (t.type === 'ident') {
            this.next();
            var name = t.value.toLowerCase();
            // function call
            if (this.peek() && this.peek().value === '(') {
                this.next();
                var args = [];
                if (this.peek() && this.peek().value !== ')') {
                    args.push(this.parseExpression());
                    while (this.peek() && this.peek().value === ',') {
                        this.next();
                        args.push(this.parseExpression());
                    }
                }
                this.expect(')');
                var fn = FUNCTIONS[name];
                if (!fn) throw new Error('未知函数: ' + name);
                return fn.apply(null, args);
            }
            // constant
            if (name in CONSTANTS) return CONSTANTS[name];
            throw new Error('未知标识符: ' + name);
        }
        throw new Error('意外的符号: ' + t.value);
    };

    function evaluate(expr) {
        if (!expr || !expr.trim()) return null;
        var tokens = tokenize(expr);
        if (tokens.length === 0) return null;
        var parser = new Parser(tokens);
        var result = parser.parseExpression();
        if (parser.pos < tokens.length) throw new Error('表达式不完整');
        return result;
    }

    function formatResult(val) {
        if (val === null || val === undefined) return '';
        if (typeof val !== 'number') return String(val);
        if (!isFinite(val)) return String(val);
        if (Number.isInteger(val)) return String(val);
        // Round to avoid floating point noise
        var rounded = Math.round(val * 1e10) / 1e10;
        return String(rounded);
    }

    document.addEventListener('DOMContentLoaded', function () {
        var $ = Tools.$;
        var input = $('input');
        var resultEl = $('result');
        var historyEl = $('history');
        var HISTORY_KEY = 'math_evaluator_history';
        var HISTORY_MAX = 20;

        function loadHistory() {
            try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; }
        }

        function saveHistory(expr, result) {
            var items = loadHistory();
            if (items.length > 0 && items[0].expr === expr) return;
            items.unshift({ expr: expr, result: result, time: Date.now() });
            if (items.length > HISTORY_MAX) items = items.slice(0, HISTORY_MAX);
            try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); } catch (e) { }
        }

        function renderHistory() {
            var items = loadHistory();
            historyEl.innerHTML = '';
            if (items.length === 0) {
                historyEl.appendChild(Tools.el('div', { class: 'math-history-empty', text: '暂无历史记录' }));
                return;
            }
            items.forEach(function (it) {
                var item = Tools.el('div', { class: 'math-history-item', onclick: function () {
                    input.value = it.expr;
                    compute();
                    input.focus();
                } }, [
                    Tools.el('span', { class: 'expr', text: it.expr }),
                    Tools.el('span', { class: 'eq', text: '=' }),
                    Tools.el('span', { class: 'val', text: it.result })
                ]);
                historyEl.appendChild(item);
            });
        }

        function compute() {
            var expr = input.value.trim();
            if (!expr) {
                resultEl.textContent = '输入表达式后自动计算';
                resultEl.className = 'math-result empty';
                return;
            }
            try {
                var val = evaluate(expr);
                if (val === null || val === undefined) {
                    resultEl.textContent = '输入表达式后自动计算';
                    resultEl.className = 'math-result empty';
                    return;
                }
                var formatted = formatResult(val);
                resultEl.textContent = formatted;
                resultEl.className = 'math-result';
                saveHistory(expr, formatted);
                renderHistory();
            } catch (e) {
                resultEl.textContent = e.message;
                resultEl.className = 'math-result error';
            }
        }

        var debounceTimer;
        input.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(compute, 150);
        });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); compute(); }
        });

        Tools.$$('.example-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                input.value = btn.getAttribute('data-expr');
                compute();
                input.focus();
            });
        });

        $('btn-copy').addEventListener('click', function () {
            if (resultEl.classList.contains('empty') || resultEl.classList.contains('error')) return;
            Tools.copyText(resultEl.textContent, this, '已复制');
        });

        renderHistory();
        compute();
    });
})();
