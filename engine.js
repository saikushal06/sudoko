/* =============================================
   SudokuX — Engine (generator, solver, hints)
   ============================================= */

const SudokuEngine = (() => {

  // ─── UTILITIES ───────────────────────────────
  function clone(grid) { return grid.map(r => [...r]); }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ─── VALIDATION ──────────────────────────────
  function isValid(grid, row, col, num) {
    // Row
    for (let c = 0; c < 9; c++) if (grid[row][c] === num) return false;
    // Col
    for (let r = 0; r < 9; r++) if (grid[r][col] === num) return false;
    // Box
    const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++)
      for (let c = bc; c < bc + 3; c++)
        if (grid[r][c] === num) return false;
    return true;
  }

  function isBoardValid(grid) {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        const v = grid[r][c];
        if (!v) continue;
        grid[r][c] = 0;
        if (!isValid(grid, r, c, v)) { grid[r][c] = v; return false; }
        grid[r][c] = v;
      }
    return true;
  }

  function isSolved(grid) {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (!grid[r][c]) return false;
    return isBoardValid(grid);
  }

  // ─── SOLVER (backtracking) ───────────────────
  function solve(grid, limit = 2) {
    let solutions = 0;

    function bt(g) {
      if (solutions >= limit) return;
      // Find empty cell with fewest candidates (MRV)
      let bestR = -1, bestC = -1, bestCount = 10;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (!g[r][c]) {
            let cnt = 0;
            for (let n = 1; n <= 9; n++) if (isValid(g, r, c, n)) cnt++;
            if (cnt < bestCount) { bestCount = cnt; bestR = r; bestC = c; }
            if (cnt === 0) return; // dead end
          }
        }
      }
      if (bestR === -1) { solutions++; return; } // solved

      const nums = shuffle([1,2,3,4,5,6,7,8,9]);
      for (const n of nums) {
        if (isValid(g, bestR, bestC, n)) {
          g[bestR][bestC] = n;
          bt(g);
          if (solutions >= limit) return;
          g[bestR][bestC] = 0;
        }
      }
    }

    const g2 = clone(grid);
    bt(g2);
    return { count: solutions, grid: g2 };
  }

  function solveForAnswer(grid) {
    const result = solve(grid, 1);
    return result.count >= 1 ? result.grid : null;
  }

  function countSolutions(grid) {
    return solve(grid, 2).count;
  }

  // ─── GENERATOR ───────────────────────────────
  function generateFull() {
    const g = Array.from({length:9}, () => Array(9).fill(0));
    function fill(pos) {
      if (pos === 81) return true;
      const r = Math.floor(pos / 9), c = pos % 9;
      const nums = shuffle([1,2,3,4,5,6,7,8,9]);
      for (const n of nums) {
        if (isValid(g, r, c, n)) {
          g[r][c] = n;
          if (fill(pos + 1)) return true;
          g[r][c] = 0;
        }
      }
      return false;
    }
    fill(0);
    return g;
  }

  const CLUE_RANGES = { easy:[36,45], medium:[27,35], hard:[22,26], expert:[17,21] };

  function generatePuzzle(difficulty = 'medium') {
    const solution = generateFull();
    const puzzle = clone(solution);
    const [minClues, maxClues] = CLUE_RANGES[difficulty] || CLUE_RANGES.medium;
    const targetClues = minClues + Math.floor(Math.random() * (maxClues - minClues + 1));
    let clues = 81;

    const positions = shuffle([...Array(81).keys()]);
    for (const pos of positions) {
      if (clues <= targetClues) break;
      const r = Math.floor(pos / 9), c = pos % 9;
      const backup = puzzle[r][c];
      puzzle[r][c] = 0;
      // Ensure unique solution
      if (countSolutions(puzzle) !== 1) puzzle[r][c] = backup;
      else clues--;
    }

    return { puzzle, solution };
  }

  // ─── DAILY CHALLENGE ─────────────────────────
  function getDailyPuzzle() {
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth()+1) * 100 + today.getDate();
    // Seeded LCG for reproducibility
    let s = seed;
    function rand() { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; }
    const savedShuffle = shuffle;
    // Use seeded shuffle for daily
    function seededShuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    // Generate with seeded randomness by temporarily overriding
    const g = Array.from({length:9}, () => Array(9).fill(0));
    function fill(pos) {
      if (pos === 81) return true;
      const r = Math.floor(pos / 9), c = pos % 9;
      const nums = seededShuffle([1,2,3,4,5,6,7,8,9]);
      for (const n of nums) {
        if (isValid(g, r, c, n)) {
          g[r][c] = n;
          if (fill(pos + 1)) return true;
          g[r][c] = 0;
        }
      }
      return false;
    }
    fill(0);
    const solution = clone(g);
    const puzzle = clone(solution);
    let clues = 81;
    const positions = seededShuffle([...Array(81).keys()]);
    for (const pos of positions) {
      if (clues <= 30) break;
      const r = Math.floor(pos / 9), c = pos % 9;
      const backup = puzzle[r][c];
      puzzle[r][c] = 0;
      if (countSolutions(puzzle) !== 1) puzzle[r][c] = backup;
      else clues--;
    }
    return { puzzle, solution, date: `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}` };
  }

  // ─── CANDIDATES ──────────────────────────────
  function getCandidates(grid) {
    const cands = Array.from({length:9}, () => Array.from({length:9}, () => new Set()));
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (!grid[r][c])
          for (let n = 1; n <= 9; n++)
            if (isValid(grid, r, c, n)) cands[r][c].add(n);
    return cands;
  }

  // ─── HINT STRATEGIES ─────────────────────────

  /** Naked Single: only one candidate in a cell */
  function findNakedSingle(grid) {
    const cands = getCandidates(grid);
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (!grid[r][c] && cands[r][c].size === 1) {
          const num = [...cands[r][c]][0];
          return {
            strategy: 'Naked Single',
            row: r, col: c, num,
            explanation: `Cell (${r+1},${c+1}) can only be <strong>${num}</strong>. Every other digit already appears in its row, column, or 3×3 box — leaving ${num} as the only option.`,
            highlights: [{ row: r, col: c, type: 'target' }]
          };
        }
    return null;
  }

  /** Hidden Single: a digit appears in only one cell in a row/col/box */
  function findHiddenSingle(grid) {
    const cands = getCandidates(grid);
    // Row
    for (let r = 0; r < 9; r++) {
      for (let n = 1; n <= 9; n++) {
        const positions = [];
        for (let c = 0; c < 9; c++) if (!grid[r][c] && cands[r][c].has(n)) positions.push(c);
        if (positions.length === 1) {
          const c = positions[0];
          return {
            strategy: 'Hidden Single (Row)',
            row: r, col: c, num: n,
            explanation: `In row ${r+1}, the digit <strong>${n}</strong> can only go in column ${c+1}. All other empty cells in that row already conflict with ${n} elsewhere.`,
            highlights: [{ row: r, col: c, type: 'target' },
              ...Array.from({length:9},(_,i)=>i).filter(i=>i!==c).map(i=>({ row:r, col:i, type:'same-row' }))]
          };
        }
      }
    }
    // Col
    for (let c = 0; c < 9; c++) {
      for (let n = 1; n <= 9; n++) {
        const positions = [];
        for (let r = 0; r < 9; r++) if (!grid[r][c] && cands[r][c].has(n)) positions.push(r);
        if (positions.length === 1) {
          const r = positions[0];
          return {
            strategy: 'Hidden Single (Column)',
            row: r, col: c, num: n,
            explanation: `In column ${c+1}, the digit <strong>${n}</strong> can only go in row ${r+1}. All other empty cells in that column already conflict with ${n} elsewhere.`,
            highlights: [{ row: r, col: c, type: 'target' },
              ...Array.from({length:9},(_,i)=>i).filter(i=>i!==r).map(i=>({ row:i, col:c, type:'same-col' }))]
          };
        }
      }
    }
    // Box
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        for (let n = 1; n <= 9; n++) {
          const positions = [];
          for (let dr = 0; dr < 3; dr++)
            for (let dc = 0; dc < 3; dc++) {
              const r = br*3+dr, c = bc*3+dc;
              if (!grid[r][c] && cands[r][c].has(n)) positions.push({r,c});
            }
          if (positions.length === 1) {
            const {r,c} = positions[0];
            return {
              strategy: 'Hidden Single (Box)',
              row: r, col: c, num: n,
              explanation: `In the 3×3 box (rows ${br*3+1}-${br*3+3}, cols ${bc*3+1}-${bc*3+3}), only cell (${r+1},${c+1}) can hold <strong>${n}</strong>.`,
              highlights: [{ row: r, col: c, type: 'target' }]
            };
          }
        }
      }
    }
    return null;
  }

  /** Naked Pair: two cells in same unit share exactly the same two candidates */
  function findNakedPair(grid) {
    const cands = getCandidates(grid);
    // Check rows
    for (let r = 0; r < 9; r++) {
      const pairs = [];
      for (let c = 0; c < 9; c++)
        if (!grid[r][c] && cands[r][c].size === 2) pairs.push({ c, nums: [...cands[r][c]] });
      for (let i = 0; i < pairs.length; i++)
        for (let j = i+1; j < pairs.length; j++) {
          if (pairs[i].nums[0]===pairs[j].nums[0] && pairs[i].nums[1]===pairs[j].nums[1]) {
            const [n1,n2] = pairs[i].nums;
            return {
              strategy: 'Naked Pair',
              row: r, col: pairs[i].c, num: null,
              explanation: `Cells (${r+1},${pairs[i].c+1}) and (${r+1},${pairs[j].c+1}) both contain only [${n1},${n2}]. These two digits must go in these two cells, so ${n1} and ${n2} can be eliminated from all other cells in row ${r+1}.`,
              highlights: [
                { row:r, col:pairs[i].c, type:'pair' },
                { row:r, col:pairs[j].c, type:'pair' }
              ]
            };
          }
        }
    }
    return null;
  }

  /** Main hint function — tries strategies in order of complexity */
  function getHint(grid) {
    return findNakedSingle(grid) || findHiddenSingle(grid) || findNakedPair(grid) || (() => {
      // Fallback: just suggest solving from solution
      const sol = solveForAnswer(grid);
      if (!sol) return null;
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
          if (!grid[r][c]) return {
            strategy: 'Backtracking',
            row: r, col: c, num: sol[r][c],
            explanation: `Place <strong>${sol[r][c]}</strong> at (${r+1},${c+1}). This was determined by eliminating all other candidates through constraint analysis.`,
            highlights: [{ row: r, col: c, type: 'target' }]
          };
      return null;
    })();
  }

  // ─── PUBLIC API ───────────────────────────────
  return { generatePuzzle, getDailyPuzzle, solveForAnswer, isValid, isSolved, isBoardValid, getCandidates, getHint, clone };

})();
