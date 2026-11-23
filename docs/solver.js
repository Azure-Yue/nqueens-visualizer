/*
 * N-Queens Lab · 纯 JavaScript 算法内核
 * 同时供浏览器页面和 Node 测试使用。
 *
 * 两个算法都以“事件生成器”的形式实现：
 *   - 每走一步 yield 一个事件；
 *   - UI 可以单步、暂停、调速，而不是等算法算完才看到结果。
 */
(function (global) {
  'use strict';

  var SOLUTION_COUNTS = {
    1: 1, 2: 0, 3: 0, 4: 2, 5: 10, 6: 4, 7: 40,
    8: 92, 9: 352, 10: 724, 11: 2680, 12: 14200
  };

  function solutionCount(n) {
    return Object.prototype.hasOwnProperty.call(SOLUTION_COUNTS, n)
      ? SOLUTION_COUNTS[n]
      : null;
  }

  // 可复现的伪随机数：同一个 seed 得到同一段局部搜索过程。
  function mulberry32(seed) {
    var a = (Number(seed) || 0) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function snapshot(state) {
    return {
      solutions: state.solutions,
      nodes: state.nodes,
      attempts: state.attempts,
      undos: state.undos,
      steps: state.steps,
      restarts: state.restarts,
      conflicts: state.conflicts,
      best: state.best
    };
  }

  function boardIsValid(board) {
    var n = board.length;
    var cols = new Array(n).fill(false);
    var d1 = new Array(2 * n - 1).fill(false);
    var d2 = new Array(2 * n - 1).fill(false);
    for (var r = 0; r < n; r++) {
      var c = board[r];
      if (c < 0 || c >= n || cols[c] || d1[r + c] || d2[r - c + n - 1]) {
        return false;
      }
      cols[c] = true;
      d1[r + c] = true;
      d2[r - c + n - 1] = true;
    }
    return true;
  }

  /**
   * 回溯法事件流。
   * options.limit = 0 表示枚举全部解，1 表示找到第一个解就停。
   */
  function* backtracking(n, options) {
    options = options || {};
    var limit = Math.max(0, Number(options.limit) || 0);

    var cols = new Array(n).fill(-1);
    var usedCol = new Uint8Array(n);
    var usedD1 = new Uint8Array(2 * n - 1);
    var usedD2 = new Uint8Array(2 * n - 1);
    var stop = false;

    var state = {
      solutions: 0, nodes: 0, attempts: 0, undos: 0,
      steps: 0, restarts: 0, conflicts: 0, best: n
    };

    function* place(row) {
      if (row === n) {
        state.solutions += 1;
        yield {
          type: 'solution',
          n: n,
          board: cols.slice(),
          index: state.solutions,
          stats: snapshot(state)
        };
        if (limit > 0 && state.solutions >= limit) {
          stop = true;
        }
        return;
      }

      for (var col = 0; col < n; col++) {
        if (stop) return;

        state.attempts += 1;
        state.steps += 1;
        var d1 = row + col;
        var d2 = row - col + n - 1;
        var reason = null;
        if (usedCol[col]) reason = 'column';
        else if (usedD1[d1] || usedD2[d2]) reason = 'diagonal';

        yield {
          type: 'try',
          n: n,
          row: row,
          col: col,
          conflict: !!reason,
          reason: reason,
          stats: snapshot(state)
        };

        if (reason) continue;

        cols[row] = col;
        usedCol[col] = 1;
        usedD1[d1] = 1;
        usedD2[d2] = 1;
        state.nodes += 1;

        yield {
          type: 'place',
          n: n,
          row: row,
          col: col,
          stats: snapshot(state)
        };

        yield* place(row + 1);
        if (stop) return;

        usedCol[col] = 0;
        usedD1[d1] = 0;
        usedD2[d2] = 0;
        cols[row] = -1;
        state.undos += 1;

        yield {
          type: 'backtrack',
          n: n,
          row: row,
          col: col,
          stats: snapshot(state)
        };
      }
    }

    yield {
      type: 'start',
      n: n,
      limit: limit,
      stats: snapshot(state)
    };

    yield* place(0);

    yield {
      type: 'done',
      n: n,
      stats: snapshot(state),
      stoppedByLimit: limit > 0 && state.solutions >= limit
    };
  }

  /**
   * 最小冲突局部搜索事件流。
   * 初始状态是“每行、每列各一个皇后”的随机排列，
   * 因此一开始只可能有斜线冲突，过程更像“修棋盘”。
   */
  function* localSearch(n, options) {
    options = options || {};
    var seed = Number(options.seed);
    if (!Number.isFinite(seed)) seed = 2026;
    var maxSteps = Math.max(200, Number(options.maxSteps) || Math.max(1200, n * 160));
    var maxRestarts = Math.max(1, Number(options.maxRestarts) || 30);
    var staleLimit = Math.max(30, Number(options.staleLimit) || Math.max(60, n * 8));
    var rng = mulberry32(seed);

    var state = {
      solutions: 0, nodes: 0, attempts: 0, undos: 0,
      steps: 0, restarts: 0, conflicts: 0, best: n
    };
    var history = [];
    var initialConflicts = 0;

    function shuffledBoard() {
      var board = new Array(n);
      for (var i = 0; i < n; i++) board[i] = i;
      for (var j = n - 1; j > 0; j--) {
        var k = Math.floor(rng() * (j + 1));
        var t = board[j];
        board[j] = board[k];
        board[k] = t;
      }
      return board;
    }

    yield {
      type: 'start',
      n: n,
      seed: seed,
      stats: snapshot(state),
      history: []
    };

    for (var restart = 1; restart <= maxRestarts; restart++) {
      state.restarts = restart;

      var board = shuffledBoard();
      var colCnt = new Int32Array(n);
      var d1Cnt = new Int32Array(2 * n - 1);
      var d2Cnt = new Int32Array(2 * n - 1);
      var total = 0;

      function attacksIfPlaced(row, col) {
        return colCnt[col] + d1Cnt[row + col] + d2Cnt[row - col + n - 1];
      }

      function queenAttacks(row, col) {
        return (colCnt[col] - 1) +
          (d1Cnt[row + col] - 1) +
          (d2Cnt[row - col + n - 1] - 1);
      }

      function removeQueen(row, col) {
        total -= queenAttacks(row, col);
        colCnt[col] -= 1;
        d1Cnt[row + col] -= 1;
        d2Cnt[row - col + n - 1] -= 1;
      }

      function addQueen(row, col) {
        total += attacksIfPlaced(row, col);
        colCnt[col] += 1;
        d1Cnt[row + col] += 1;
        d2Cnt[row - col + n - 1] += 1;
      }

      for (var r = 0; r < n; r++) {
        var c = board[r];
        colCnt[c] += 1;
        d1Cnt[r + c] += 1;
        d2Cnt[r - c + n - 1] += 1;
      }
      for (var rr = 0; rr < n; rr++) {
        total += queenAttacks(rr, board[rr]);
      }
      total = Math.floor(total / 2);

      if (restart === 1) initialConflicts = total;
      state.conflicts = total;
      state.best = Math.min(state.best, total);
      history.push(total);

      yield {
        type: 'initial',
        n: n,
        restart: restart,
        board: board.slice(),
        conflicts: total,
        stats: snapshot(state),
        history: history.slice(-160)
      };

      if (total === 0) {
        state.solutions = 1;
        yield {
          type: 'solution',
          n: n,
          board: board.slice(),
          stats: snapshot(state),
          history: history.slice(-160),
          initialConflicts: initialConflicts
        };
        return;
      }

      var bestTotal = total;
      var stale = 0;
      var restartNeeded = false;

      for (var step = 0; step < maxSteps; step++) {
        var conflicted = [];
        for (var row = 0; row < n; row++) {
          if (queenAttacks(row, board[row]) > 0) conflicted.push(row);
        }
        if (conflicted.length === 0) break;

        var pick = conflicted[Math.floor(rng() * conflicted.length)];
        var oldCol = board[pick];

        yield {
          type: 'pick',
          n: n,
          row: pick,
          col: oldCol,
          conflicts: total,
          stats: snapshot(state),
          history: history.slice(-160)
        };

        removeQueen(pick, oldCol);

        var scores = [];
        var bestScore = Infinity;
        var bestCols = [];
        for (var col = 0; col < n; col++) {
          var score = attacksIfPlaced(pick, col);
          scores.push(score);
          if (score < bestScore) {
            bestScore = score;
            bestCols = [col];
          } else if (score === bestScore) {
            bestCols.push(col);
          }
        }

        yield {
          type: 'candidates',
          n: n,
          row: pick,
          scores: scores,
          bestScore: bestScore,
          bestCols: bestCols.slice(),
          stats: snapshot(state),
          history: history.slice(-160)
        };

        var newCol = bestCols[Math.floor(rng() * bestCols.length)];
        board[pick] = newCol;
        addQueen(pick, newCol);
        state.steps += 1;
        history.push(total);
        state.conflicts = total;
        state.best = Math.min(state.best, total);

        yield {
          type: 'move',
          n: n,
          row: pick,
          from: oldCol,
          to: newCol,
          conflicts: total,
          stats: snapshot(state),
          history: history.slice(-160)
        };

        if (total === 0) {
          state.solutions = 1;
          yield {
            type: 'solution',
            n: n,
            board: board.slice(),
            stats: snapshot(state),
            history: history.slice(-160),
            initialConflicts: initialConflicts
          };
          return;
        }

        if (total < bestTotal) {
          bestTotal = total;
          stale = 0;
        } else {
          stale += 1;
          if (stale >= staleLimit) {
            restartNeeded = true;
            break;
          }
        }
      }

      if (restart < maxRestarts) {
        yield {
          type: 'restart',
          n: n,
          restart: restart + 1,
          conflicts: total,
          stats: snapshot(state),
          history: history.slice(-160)
        };
      }

      if (!restartNeeded && total > 0 && restart === maxRestarts) {
        break;
      }
    }

    yield {
      type: 'failed',
      n: n,
      stats: snapshot(state),
      history: history.slice(-160),
      message: n === 2 || n === 3
        ? 'n = 2 或 3 时，N 皇后问题本身无解。'
        : '达到步数或重启上限，局部搜索没有找到解。'
    };
  }

  var api = {
    backtracking: backtracking,
    localSearch: localSearch,
    solutionCount: solutionCount,
    boardIsValid: boardIsValid,
    mulberry32: mulberry32
  };

  global.NQueens = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
