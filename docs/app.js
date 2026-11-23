(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var SPEEDS = [
    { label: '慢速', backtracking: { delay: 240, batch: 1 }, local: { delay: 620, batch: 1 } },
    { label: '慢',   backtracking: { delay: 70,  batch: 1 }, local: { delay: 320, batch: 1 } },
    { label: '中速', backtracking: { delay: 20,  batch: 1 }, local: { delay: 150, batch: 1 } },
    { label: '快',   backtracking: { delay: 5,   batch: 4 }, local: { delay: 60,  batch: 1 } },
    { label: '极速', backtracking: { delay: 0,   batch: 150 }, local: { delay: 10, batch: 1 } }
  ];

  var MODE_META = {
    backtracking: {
      kicker: 'BACKTRACKING / 01',
      title: '逐行放置，走不通就退回',
      badge: '回溯',
      codeTitle: '搜索骨架',
      hint: '点击“开始”自动演示，或“单步”逐帧观察。'
    },
    local: {
      kicker: 'MIN-CONFLICTS / 02',
      title: '先摆满棋盘，再把它修好',
      badge: '局部',
      codeTitle: '最小冲突',
      hint: '观察冲突皇后如何被选中、移动，以及卡住后的重启。'
    }
  };

  var CODE = {
    backtracking: [
      'function dfs(row) {',
      '  if (row === n) {',
      '    record(solution);',
      '    return;',
      '  }',
      '  for (let col = 0; col < n; col++) {',
      '    if (conflict(row, col)) continue;',
      '    place(row, col);',
      '    dfs(row + 1);',
      '    remove(row, col);',
      '  }',
      '}'
    ],
    local: [
      'while (conflicts > 0) {',
      '  const row = pickConflicted();',
      '  const old = board[row];',
      '  remove(row, old);',
      '  const scores = scoreRow(row);',
      '  move(row, argmin(scores));',
      '  if (stuck) restart();',
      '}'
    ]
  };

  var state = {
    mode: 'backtracking',
    n: 8,
    target: 'first',
    seed: 2026,
    speed: 2,
    solver: null,
    running: false,
    finished: false,
    hasStarted: false,
    timer: null,
    board: [],
    current: null,
    solved: false,
    previewIndex: null,
    stats: null,
    solutions: [],
    history: [],
    eventCount: 0,
    lastEvent: null,
    activeLine: 0,
    action: null,
    candidates: null,
    moveFromConflicts: 0,
    galleryDirty: true,
    cells: [],
    codeLineEls: [],
    attackCells: new Set(),
    conflictQueens: new Set(),
    lines: []
  };

  var el = {};

  function zeroStats() {
    return {
      solutions: 0, nodes: 0, attempts: 0, undos: 0,
      steps: 0, restarts: 0, conflicts: 0, best: null
    };
  }

  function defaultAction() {
    if (state.mode === 'backtracking') {
      return {
        tag: 'READY',
        title: '准备开始',
        text: '选择规模后点击“开始”，观察皇后如何被放置、剪枝和撤销。'
      };
    }
    return {
      tag: 'READY',
      title: '准备开始',
      text: '先随机摆满每一行，再让冲突皇后移动到冲突最少的位置。'
    };
  }

  function fmt(value) {
    if (value === null || value === undefined || value === '') return '—';
    return Number(value).toLocaleString('zh-CN');
  }

  function cacheElements() {
    el.heroN = $('#heroN');
    el.heroSolutions = $('#heroSolutions');
    el.heroSolutionLabel = $('#heroSolutionLabel');
    el.heroDistinct = $('#heroDistinct');
    el.tabs = $$('.mode-tab');
    el.boardKicker = $('#boardKicker');
    el.boardTitle = $('#boardTitle');
    el.statusPill = $('#statusPill');
    el.statusText = $('#statusText');
    el.colLabels = $('#colLabels');
    el.rowLabels = $('#rowLabels');
    el.board = $('#board');
    el.overlay = $('#overlay');
    el.boardFlash = $('#boardFlash');
    el.boardArea = $('.board-area');
    el.boardShell = $('.board-shell');
    el.boardHint = $('#boardHint');
    el.nSelect = $('#nSelect');
    el.solutionModeField = $('#solutionModeField');
    el.solutionMode = $('#solutionMode');
    el.seedField = $('#seedField');
    el.seedInput = $('#seedInput');
    el.speedRange = $('#speedRange');
    el.speedLabel = $('#speedLabel');
    el.modeBadge = $('#modeBadge');
    el.playBtn = $('#playBtn');
    el.playIcon = $('#playIcon');
    el.playLabel = $('#playLabel');
    el.stepBtn = $('#stepBtn');
    el.resetBtn = $('#resetBtn');
    el.statsGrid = $('#statsGrid');
    el.eventTag = $('#eventTag');
    el.eventCount = $('#eventCount');
    el.actionTitle = $('#actionTitle');
    el.actionText = $('#actionText');
    el.candidateWrap = $('#candidateWrap');
    el.candidateBest = $('#candidateBest');
    el.candidates = $('#candidates');
    el.sparkWrap = $('#sparkWrap');
    el.sparkNow = $('#sparkNow');
    el.sparkline = $('#sparkline');
    el.codeTitle = $('#codeTitle');
    el.codeBlock = $('#codeBlock');
    el.gallerySection = $('#gallerySection');
    el.galleryCount = $('#galleryCount');
    el.gallery = $('#gallery');
    el.toast = $('#toast');
  }

  function updateHero() {
    var count = NQueens.solutionCount(state.n);
    el.heroN.textContent = state.n;
    el.heroSolutions.textContent = count === null ? '—' : fmt(count);
    el.heroSolutionLabel.textContent = 'N = ' + state.n + ' 时解的总数';
    el.heroDistinct.textContent = state.n === 8 ? '12' : '—';
  }

  function updateSpeedLabel() {
    el.speedLabel.textContent = SPEEDS[state.speed].label;
  }

  function setStatus(text, tone) {
    el.statusText.textContent = text;
    el.statusPill.className = 'status-pill' + (tone ? ' is-' + tone : '');
  }

  function setAction(tag, title, text) {
    state.action = { tag: tag, title: title, text: text };
  }

  function codeHTML(lines) {
    return lines.map(function (line, index) {
      var number = String(index + 1);
      if (number.length < 2) number = '0' + number;
      return '<span class="code-line" data-line="' + (index + 1) + '">' +
        '<span class="ln">' + number + '</span>' +
        escapeHTML(line) +
        '</span>';
    }).join('');
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderCode() {
    var lines = CODE[state.mode];
    el.codeBlock.innerHTML = codeHTML(lines);
    state.codeLineEls = $$('.code-line', el.codeBlock);
    highlightCode(state.activeLine);
  }

  function highlightCode(line) {
    state.activeLine = line || 0;
    state.codeLineEls.forEach(function (node) {
      node.classList.toggle('active', Number(node.getAttribute('data-line')) === state.activeLine);
    });
  }

  function syncModeUI() {
    var meta = MODE_META[state.mode];
    el.tabs.forEach(function (tab) {
      var active = tab.getAttribute('data-mode') === state.mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    el.boardKicker.textContent = meta.kicker;
    el.boardTitle.textContent = meta.title;
    el.modeBadge.textContent = meta.badge;
    el.codeTitle.textContent = meta.codeTitle;
    el.boardHint.textContent = meta.hint;
    el.solutionModeField.hidden = state.mode !== 'backtracking';
    el.seedField.hidden = state.mode !== 'local';
    renderCode();
  }

  function buildBoard() {
    var n = state.n;
    var fragment = document.createDocumentFragment();

    el.board.innerHTML = '';
    el.board.style.setProperty('--n', n);
    el.boardShell.style.setProperty('--n', n);
    el.colLabels.innerHTML = '';
    el.rowLabels.innerHTML = '';
    el.overlay.setAttribute('viewBox', '0 0 ' + n + ' ' + n);

    for (var c = 0; c < n; c++) {
      var label = document.createElement('span');
      label.textContent = c + 1;
      el.colLabels.appendChild(label);
    }
    for (var r = 0; r < n; r++) {
      var rowLabel = document.createElement('span');
      rowLabel.textContent = r + 1;
      el.rowLabels.appendChild(rowLabel);
    }

    state.cells = [];
    for (var row = 0; row < n; row++) {
      for (var col = 0; col < n; col++) {
        var cell = document.createElement('div');
        cell.className = 'cell ' + (((row + col) % 2) ? 'dark' : 'light');
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', '第 ' + (row + 1) + ' 行，第 ' + (col + 1) + ' 列');

        var queen = document.createElement('span');
        queen.className = 'queen';
        queen.setAttribute('aria-hidden', 'true');
        queen.textContent = '♛';
        cell.appendChild(queen);

        fragment.appendChild(cell);
        state.cells.push({ el: cell, queen: queen, row: row, col: col });
      }
    }
    el.board.appendChild(fragment);
    el.board.setAttribute('aria-rowcount', String(n));
    el.board.setAttribute('aria-colcount', String(n));
    updateCellSize();
  }

  function updateCellSize() {
    if (!state.n) return;
    var width = el.board.getBoundingClientRect().width;
    if (width > 0) {
      el.board.style.setProperty('--cell-size', (width / state.n) + 'px');
    }
  }

  function computeVisuals() {
    state.attackCells.clear();
    state.conflictQueens.clear();
    state.lines = [];

    if (state.solved) return;

    if (state.mode === 'backtracking') {
      var ev = state.lastEvent;
      if (!ev || ev.type !== 'try' || !ev.conflict || !state.current) return;

      var n = state.n;
      var row = state.current.row;
      var col = state.current.col;
      var d1 = row + col;
      var d2 = row - col;

      state.lines.push({ x1: col + .5, y1: -1, x2: col + .5, y2: n + 1, kind: 'attack-line' });
      state.lines.push({ x1: -1, y1: d1 + 1, x2: d1 + 1, y2: -1, kind: 'attack-line' });
      state.lines.push({ x1: -1, y1: d2 - 1, x2: n + 1, y2: n + d2 + 1, kind: 'attack-line' });

      for (var c = 0; c < n; c++) state.attackCells.add(row + ',' + c);
      for (var r = 0; r < n; r++) state.attackCells.add(r + ',' + col);

      for (var k = -n; k <= n; k++) {
        var r1 = row + k;
        var c1 = col + k;
        if (r1 >= 0 && r1 < n && c1 >= 0 && c1 < n) state.attackCells.add(r1 + ',' + c1);

        var r2 = row + k;
        var c2 = col - k;
        if (r2 >= 0 && r2 < n && c2 >= 0 && c2 < n) state.attackCells.add(r2 + ',' + c2);
      }
      return;
    }

    var pairs = conflictPairs(state.board);
    pairs.forEach(function (pair) {
      var a = pair[0];
      var b = pair[1];
      state.conflictQueens.add(a.row + ',' + a.col);
      state.conflictQueens.add(b.row + ',' + b.col);
      state.lines.push({
        x1: a.col + .5,
        y1: a.row + .5,
        x2: b.col + .5,
        y2: b.row + .5,
        kind: 'conflict-line'
      });
    });
  }

  function conflictPairs(board) {
    var n = board.length;
    var pairs = [];
    for (var i = 0; i < n; i++) {
      if (board[i] < 0) continue;
      for (var j = i + 1; j < n; j++) {
        if (board[j] < 0) continue;
        if (board[i] === board[j] || Math.abs(board[i] - board[j]) === j - i) {
          pairs.push([
            { row: i, col: board[i] },
            { row: j, col: board[j] }
          ]);
        }
      }
    }
    return pairs;
  }

  function paintBoard() {
    var solved = state.solved;
    var current = state.current;
    var board = state.board;

    state.cells.forEach(function (cell) {
      var key = cell.row + ',' + cell.col;
      var hasQueen = board[cell.row] === cell.col;
      var isCurrent = !solved && current && current.row === cell.row && current.col === cell.col;

      cell.el.classList.toggle('has-queen', hasQueen);
      cell.el.classList.toggle('is-attacked', state.attackCells.has(key));
      cell.el.classList.toggle('is-conflict', state.conflictQueens.has(key));
      cell.el.classList.toggle('current', !!isCurrent);
      cell.el.classList.toggle('is-solution', solved && hasQueen);
      cell.el.classList.toggle('is-row-focus',
        !solved && state.mode === 'local' && current && current.row === cell.row);
      cell.el.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    });

    el.boardArea.classList.toggle('is-solved', solved);
  }

  function drawOverlay() {
    el.overlay.innerHTML = '';
    state.lines.forEach(function (line) {
      var node = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      node.setAttribute('x1', line.x1);
      node.setAttribute('y1', line.y1);
      node.setAttribute('x2', line.x2);
      node.setAttribute('y2', line.y2);
      node.setAttribute('class', line.kind || 'conflict-line');
      el.overlay.appendChild(node);
    });
  }

  function flashCell(row, col, className) {
    var target = state.cells[row * state.n + col];
    if (!target) return;
    var cell = target.el;
    cell.classList.remove(className);
    void cell.offsetWidth;
    cell.classList.add(className);
    window.setTimeout(function () { cell.classList.remove(className); }, 420);
  }

  function flashBoard() {
    el.boardFlash.classList.remove('is-backtracking');
    void el.boardFlash.offsetWidth;
    el.boardFlash.classList.add('is-backtracking');
    window.setTimeout(function () { el.boardFlash.classList.remove('is-backtracking'); }, 420);
  }

  function renderStats() {
    var stats = state.stats;
    var cards;

    if (state.mode === 'backtracking') {
      cards = [
        { label: '已找到解', value: fmt(stats.solutions), cls: 'accent' },
        { label: '有效结点', value: fmt(stats.nodes), cls: '' },
        { label: '尝试落子', value: fmt(stats.attempts), cls: '' },
        { label: '回溯次数', value: fmt(stats.undos), cls: 'teal' }
      ];
    } else {
      cards = [
        { label: '当前冲突', value: fmt(stats.conflicts), cls: 'accent' },
        { label: '移动步数', value: fmt(stats.steps), cls: '' },
        { label: '重启次数', value: fmt(stats.restarts), cls: 'teal' },
        { label: '最优冲突', value: fmt(stats.best), cls: '' }
      ];
    }

    el.statsGrid.innerHTML = cards.map(function (card) {
      return '<div class="stat ' + card.cls + '">' +
        '<span class="stat-value">' + card.value + '</span>' +
        '<span class="stat-label">' + card.label + '</span>' +
        '</div>';
    }).join('');
  }

  function renderAction() {
    var action = state.action || defaultAction();
    el.eventTag.textContent = action.tag;
    el.actionTitle.textContent = action.title;
    el.actionText.textContent = action.text;
    el.eventCount.textContent = fmt(state.eventCount) + ' 事件';

    el.candidateWrap.hidden = !state.candidates;
    if (state.candidates) {
      renderCandidates();
    }

    var showSpark = state.mode === 'local' && state.history.length > 0;
    el.sparkWrap.hidden = !showSpark;
    if (showSpark) {
      renderSparkline();
    }
  }

  function renderCandidates() {
    var data = state.candidates;
    if (!data) return;
    el.candidates.style.setProperty('--n', state.n);
    el.candidateBest.textContent = '最小 ' + data.bestScore;
    el.candidates.innerHTML = data.scores.map(function (score, index) {
      var classes = 'candidate';
      if (score === data.bestScore) classes += ' is-best';
      if (data.picked === index) classes += ' is-picked';
      return '<div class="' + classes + '" data-col="' + index + '">' +
        '<span>c' + (index + 1) + '</span><b>' + score + '</b></div>';
    }).join('');
  }

  function renderSparkline() {
    var svg = el.sparkline;
    var history = state.history.slice(-160);
    if (!history.length) {
      svg.innerHTML = '';
      return;
    }

    var width = 320;
    var height = 64;
    var pad = 6;
    var max = Math.max.apply(null, history);
    max = Math.max(1, max);
    var points = history.length === 1 ? [history[0], history[0]] : history;
    var coords = points.map(function (value, index) {
      var x = pad + (width - pad * 2) * index / (points.length - 1);
      var y = height - pad - (height - pad * 2) * value / max;
      return [x, y];
    });

    var linePath = 'M ' + coords.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L ');
    var areaPath = linePath +
      ' L ' + coords[coords.length - 1][0].toFixed(1) + ' ' + (height - pad) +
      ' L ' + coords[0][0].toFixed(1) + ' ' + (height - pad) + ' Z';
    var last = coords[coords.length - 1];

    var grid = '';
    [0, 0.5, 1].forEach(function (fraction) {
      var y = pad + (height - pad * 2) * fraction;
      grid += '<line class="spark-grid" x1="' + pad + '" y1="' + y + '" x2="' + (width - pad) + '" y2="' + y + '"></line>';
    });

    svg.innerHTML =
      grid +
      '<path class="spark-area" d="' + areaPath + '"></path>' +
      '<path class="spark-path" d="' + linePath + '"></path>' +
      '<circle class="spark-dot" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3"></circle>';
    el.sparkNow.textContent = state.stats.conflicts + ' 对';
  }

  function renderGallery() {
    var solutions = state.solutions;
    el.galleryCount.textContent = fmt(solutions.length);

    if (!solutions.length) {
      el.gallery.innerHTML = '<div class="gallery-empty">还没有解。点击“开始”，让搜索跑起来。</div>';
      return;
    }

    var max = state.n <= 8 ? solutions.length : 60;
    var fragment = document.createDocumentFragment();
    var total = Math.min(max, solutions.length);

    for (var index = 0; index < total; index++) {
      var board = solutions[index];
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'solution-thumb' + (state.previewIndex === index ? ' is-active' : '');
      button.setAttribute('aria-label', '查看第 ' + (index + 1) + ' 个解');
      button.title = '查看解 #' + (index + 1);

      var mini = document.createElement('span');
      mini.className = 'mini-board';
      mini.style.setProperty('--n', state.n);
      for (var r = 0; r < state.n; r++) {
        for (var c = 0; c < state.n; c++) {
          var pixel = document.createElement('i');
          if ((r + c) % 2) pixel.className = 'dark';
          if (board[r] === c) pixel.className += ' q';
          mini.appendChild(pixel);
        }
      }

      var label = document.createElement('span');
      label.className = 'thumb-index';
      label.textContent = '#' + (index + 1);

      button.appendChild(mini);
      button.appendChild(label);
      (function (i) {
        button.addEventListener('click', function () { previewSolution(i); });
      })(index);
      fragment.appendChild(button);
    }

    el.gallery.innerHTML = '';
    el.gallery.appendChild(fragment);

    if (solutions.length > max) {
      var more = document.createElement('div');
      more.className = 'gallery-more';
      more.textContent = '还有 ' + (solutions.length - max) + ' 个解';
      el.gallery.appendChild(more);
    }

    if (state.running) {
      requestAnimationFrame(function () {
        el.gallery.scrollLeft = el.gallery.scrollWidth;
      });
    }
  }

  function previewSolution(index) {
    var board = state.solutions[index];
    if (!board) return;

    if (state.running) pause();
    state.previewIndex = index;
    state.board = board.slice();
    state.current = null;
    state.solved = true;
    state.candidates = null;
    state.lastEvent = { type: 'preview', index: index };
    setStatus('回看解 #' + (index + 1), 'solved');
    setAction('PREVIEW', '第 ' + (index + 1) + ' 个解', '这是一个合法解。点击“继续”回到搜索过程，或点击另一个缩略图继续回看。');
    renderFrame(true);
    updatePlayButton();
  }

  function updatePlayButton() {
    if (state.running) {
      el.playIcon.textContent = '❚❚';
      el.playLabel.textContent = '暂停';
    } else if (state.finished) {
      el.playIcon.textContent = '↻';
      el.playLabel.textContent = '重新开始';
    } else if (state.hasStarted) {
      el.playIcon.textContent = '▶';
      el.playLabel.textContent = '继续';
    } else {
      el.playIcon.textContent = '▶';
      el.playLabel.textContent = '开始';
    }

    el.stepBtn.disabled = state.running || state.finished;
    el.nSelect.disabled = state.running;
    el.solutionMode.disabled = state.running;
    el.seedInput.disabled = state.running;
  }

  function renderFrame(forceGallery) {
    computeVisuals();
    paintBoard();
    drawOverlay();
    renderStats();
    renderAction();
    highlightCode(state.activeLine);
    if (forceGallery || state.galleryDirty) {
      renderGallery();
      state.galleryDirty = false;
    }
    updatePlayButton();
  }

  function makeSolver() {
    if (state.mode === 'backtracking') {
      return NQueens.backtracking(state.n, {
        limit: state.target === 'first' ? 1 : 0
      });
    }
    return NQueens.localSearch(state.n, {
      seed: state.seed
    });
  }

  function resetRun(notify) {
    stopTimer();
    state.running = false;
    state.finished = false;
    state.hasStarted = false;
    state.solver = null;
    state.board = new Array(state.n).fill(-1);
    state.current = null;
    state.solved = false;
    state.previewIndex = null;
    state.stats = zeroStats();
    state.solutions = [];
    state.history = [];
    state.eventCount = 0;
    state.lastEvent = null;
    state.activeLine = 0;
    state.candidates = null;
    state.moveFromConflicts = 0;
    state.galleryDirty = true;
    state.attackCells.clear();
    state.conflictQueens.clear();
    state.lines = [];

    state.action = defaultAction();
    buildBoard();
    renderCode();
    setStatus('待运行', '');
    renderFrame(true);

    if (notify) toast('演示已重置');
  }

  function stopTimer() {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function schedule() {
    stopTimer();
    if (!state.running) return;

    var pace = SPEEDS[state.speed][state.mode];
    var delay = pace.delay;
    var batch = pace.batch;

    function tick() {
      if (!state.running) return;
      for (var i = 0; i < batch && state.running; i++) {
        advance(false);
      }
      renderFrame(false);
      if (state.running) {
        state.timer = setTimeout(tick, delay);
      }
    }

    state.timer = setTimeout(tick, delay);
  }

  function play() {
    if (state.running) {
      pause();
      return;
    }
    if (state.finished) {
      resetRun(false);
    }
    if (state.previewIndex !== null) {
      state.previewIndex = null;
      state.solved = false;
    }
    if (!state.solver) {
      state.solver = makeSolver();
    }
    state.running = true;
    state.hasStarted = true;
    setStatus('运行中', 'running');
    updatePlayButton();
    schedule();
  }

  function pause() {
    state.running = false;
    stopTimer();
    if (!state.finished) {
      setStatus('已暂停', 'paused');
    }
    updatePlayButton();
  }

  function stepOnce() {
    if (state.running) return;
    if (state.finished) resetRun(false);
    if (state.previewIndex !== null) {
      state.previewIndex = null;
      state.solved = false;
    }
    if (!state.solver) state.solver = makeSolver();
    state.hasStarted = true;
    setStatus('单步演示', 'paused');
    advance(true);
    updatePlayButton();
  }

  function advance(render) {
    if (state.finished) return;
    if (!state.solver) state.solver = makeSolver();

    var result = state.solver.next();
    if (result.done) {
      if (!state.finished) finishRun('搜索完成', 'solved');
      if (render) renderFrame(false);
      return;
    }

    applyEvent(result.value);
    if (render) renderFrame(false);
  }

  function finishRun(text, tone) {
    state.running = false;
    state.finished = true;
    stopTimer();
    setStatus(text, tone);
    if (state.solutions.length) {
      state.board = state.solutions[state.solutions.length - 1].slice();
      state.solved = true;
      state.current = null;
    }
    updatePlayButton();
  }

  function applyEvent(ev) {
    state.eventCount += 1;
    state.lastEvent = ev;
    if (ev.stats) state.stats = Object.assign({}, ev.stats);

    if (state.mode === 'backtracking') {
      applyBacktracking(ev);
    } else {
      applyLocal(ev);
    }
  }

  function applyBacktracking(ev) {
    var n = state.n;

    if (ev.type === 'start') {
      state.board = new Array(n).fill(-1);
      state.current = null;
      state.solved = false;
      state.activeLine = 1;
      setAction('START', '从第 1 行开始', '逐行放置皇后；每一行都从第 1 列开始尝试。');
      return;
    }

    if (ev.type === 'try') {
      state.solved = false;
      state.current = { row: ev.row, col: ev.col };
      state.candidates = null;
      state.activeLine = ev.conflict ? 7 : 8;
      if (ev.conflict) {
        setAction(
          'TRY',
          '第 ' + (ev.row + 1) + ' 行第 ' + (ev.col + 1) + ' 列：冲突',
          ev.reason === 'column'
            ? '这一列已经有皇后，直接剪枝，换下一列。'
            : '这一格与已有皇后在同一条斜线上，直接剪枝，换下一列。'
        );
      } else {
        setAction(
          'TRY',
          '第 ' + (ev.row + 1) + ' 行第 ' + (ev.col + 1) + ' 列：安全',
          '列和两条斜线都没有冲突，可以落子。'
        );
      }
      if (state.running) setStatus('运行中', 'running');
      return;
    }

    if (ev.type === 'place') {
      state.board[ev.row] = ev.col;
      state.current = { row: ev.row, col: ev.col };
      state.solved = false;
      state.activeLine = 9;
      flashCell(ev.row, ev.col, 'flash-place');
      setAction(
        'PLACE',
        '皇后落在 (' + (ev.row + 1) + ', ' + (ev.col + 1) + ')',
        ev.row === n - 1
          ? '最后一行也放好了，准备记录解。'
          : '进入第 ' + (ev.row + 2) + ' 行，继续向下搜索。'
      );
      if (state.running) setStatus('运行中', 'running');
      return;
    }

    if (ev.type === 'solution') {
      state.board = ev.board.slice();
      state.current = null;
      state.solved = true;
      state.solutions.push(ev.board.slice());
      state.galleryDirty = true;
      state.candidates = null;
      state.activeLine = 3;
      setAction(
        'SOLUTION',
        '找到一个解！',
        '第 ' + ev.index + ' 个合法解已收入下方解画廊。'
      );
      setStatus('已找到 ' + state.solutions.length + ' 个解', 'solved');

      if (state.target === 'first') {
        finishRun('已找到解', 'solved');
      }
      return;
    }

    if (ev.type === 'backtrack') {
      state.board[ev.row] = -1;
      state.current = null;
      state.solved = false;
      state.activeLine = 10;
      flashCell(ev.row, ev.col, 'flash-backtrack');
      flashBoard();
      setAction(
        'BACKTRACK',
        '撤销第 ' + (ev.row + 1) + ' 行',
        '这一行没有可用的列了，退回上一行，换下一个选项。'
      );
      if (state.running) setStatus('运行中', 'running');
      return;
    }

    if (ev.type === 'done') {
      state.activeLine = 12;
      state.current = null;
      if (state.solutions.length) {
        state.board = state.solutions[state.solutions.length - 1].slice();
        state.solved = true;
        setAction('DONE', '搜索完成', '共找到 ' + state.solutions.length + ' 个解，全部合法。');
        finishRun('搜索完成', 'solved');
      } else {
        state.solved = false;
        setAction('DONE', '搜索完成', '没有找到解。n = 2 或 3 时，N 皇后问题本身无解。');
        finishRun('无解', 'error');
      }
    }
  }

  function applyLocal(ev) {
    var n = state.n;

    if (ev.type === 'start') {
      state.activeLine = 1;
      state.solved = false;
      setAction('START', '随机开局', '先让每一行、每一列各有一个皇后，再开始修复冲突。');
      return;
    }

    if (ev.type === 'initial') {
      state.board = ev.board.slice();
      state.history = ev.history || [];
      state.current = null;
      state.solved = false;
      state.candidates = null;
      state.activeLine = 1;
      setAction(
        'INIT',
        '第 ' + ev.restart + ' 次随机开局',
        '当前有 ' + ev.conflicts + ' 对冲突。只移动正在冲突的皇后。'
      );
      if (state.running) setStatus('运行中', 'running');
      return;
    }

    if (ev.type === 'pick') {
      state.current = { row: ev.row, col: ev.col };
      state.moveFromConflicts = ev.conflicts;
      state.candidates = null;
      state.solved = false;
      state.activeLine = 2;
      setAction(
        'PICK',
        '选中第 ' + (ev.row + 1) + ' 行皇后',
        '它正处在冲突中。接下来比较这一行每个候选列的冲突分数。'
      );
      if (state.running) setStatus('运行中', 'running');
      return;
    }

    if (ev.type === 'candidates') {
      state.current = { row: ev.row, col: state.board[ev.row] };
      state.candidates = {
        row: ev.row,
        scores: ev.scores,
        bestScore: ev.bestScore,
        bestCols: ev.bestCols,
        picked: null
      };
      state.solved = false;
      state.activeLine = 5;
      setAction(
        'SCORE',
        '给第 ' + (ev.row + 1) + ' 行打分',
        '最小冲突分数是 ' + ev.bestScore + '；并列最优时随机选一个，避免原地打转。'
      );
      return;
    }

    if (ev.type === 'move') {
      state.board[ev.row] = ev.to;
      state.history = ev.history || state.history;
      state.current = { row: ev.row, col: ev.to };
      state.solved = false;
      state.activeLine = 6;
      if (state.candidates && state.candidates.row === ev.row) {
        state.candidates.picked = ev.to;
      }
      flashCell(ev.row, ev.to, 'flash-place');
      setAction(
        'MOVE',
        '第 ' + (ev.row + 1) + ' 行：' + (ev.from + 1) + ' → ' + (ev.to + 1),
        '冲突数从 ' + state.moveFromConflicts + ' 变为 ' + ev.conflicts + '。'
      );
      state.moveFromConflicts = ev.conflicts;
      if (state.running) setStatus('运行中', 'running');
      return;
    }

    if (ev.type === 'restart') {
      state.current = null;
      state.candidates = null;
      state.history = ev.history || state.history;
      state.solved = false;
      state.activeLine = 7;
      setAction(
        'RESTART',
        '准备第 ' + ev.restart + ' 次重启',
        '连续多步没有降低冲突数，可能卡在局部最优；换一个初始局面再试。'
      );
      setStatus('重新开始', 'paused');
      return;
    }

    if (ev.type === 'solution') {
      state.board = ev.board.slice();
      state.history = ev.history || state.history;
      state.current = null;
      state.solved = true;
      state.candidates = null;
      state.solutions = [ev.board.slice()];
      state.galleryDirty = true;
      state.activeLine = 1;
      setAction(
        'SOLUTION',
        '冲突归零',
        '找到一个合法解：' + ev.stats.steps + ' 步、' + ev.stats.restarts + ' 次重启。'
      );
      finishRun('找到合法解', 'solved');
      return;
    }

    if (ev.type === 'failed') {
      state.current = null;
      state.solved = false;
      state.candidates = null;
      state.activeLine = 1;
      setAction(
        'FAILED',
        '没有找到解',
        ev.message || '达到步数或重启上限，局部搜索不能保证成功。'
      );
      finishRun('未找到解', 'error');
    }
  }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('is-visible');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () {
      el.toast.classList.remove('is-visible');
    }, 1800);
  }

  function bindEvents() {
    el.tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var mode = tab.getAttribute('data-mode');
        if (mode === state.mode) return;
        if (state.running) pause();
        state.mode = mode;
        syncModeUI();
        resetRun(false);
      });
    });

    el.nSelect.addEventListener('change', function () {
      state.n = Number(el.nSelect.value) || 8;
      updateHero();
      resetRun(false);
    });

    el.solutionMode.addEventListener('change', function () {
      state.target = el.solutionMode.value;
      resetRun(false);
    });

    el.seedInput.addEventListener('change', function () {
      state.seed = Number(el.seedInput.value) || 0;
      resetRun(false);
    });

    el.speedRange.addEventListener('input', function () {
      state.speed = Number(el.speedRange.value) || 0;
      updateSpeedLabel();
    });

    el.playBtn.addEventListener('click', play);
    el.stepBtn.addEventListener('click', stepOnce);
    el.resetBtn.addEventListener('click', function () { resetRun(true); });

    document.addEventListener('keydown', function (event) {
      var tag = (event.target && event.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (event.code === 'Space') {
        event.preventDefault();
        play();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepOnce();
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        resetRun(true);
      }
    });

    var resizeFrame = null;
    window.addEventListener('resize', function () {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(function () {
        updateCellSize();
        resizeFrame = null;
      });
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.running) pause();
    });
  }

  function init() {
    cacheElements();
    state.stats = zeroStats();
    state.action = defaultAction();
    updateHero();
    updateSpeedLabel();
    syncModeUI();
    bindEvents();
    resetRun(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
