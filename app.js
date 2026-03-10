/* =============================================
   SudokuX — App Logic (UI, State, Sound, etc.)
   ============================================= */

(() => {
  'use strict';

  // ─── STATE ─────────────────────────────────────
  const state = {
    puzzle:      null,   // 9×9 array (original given cells, 0=empty)
    solution:    null,   // 9×9 solved answer
    board:       null,   // current working board (numbers)
    notes:       null,   // 9×9 array of Set<number>
    given:       null,   // bool 9×9 — is cell a given?
    selected:    null,   // {r,c} or null
    difficulty:  'medium',
    isDaily:     false,
    paused:      false,
    gameOver:    false,
    notesMode:   false,
    learnMode:   false,
    soundOn:     true,
    highlightErrors: true,
    autoNotes:   true,
    animIntensity: 1,
    volume:      0.5,
    errors:      0,
    maxErrors:   3,
    hintsUsed:   0,
    streak:      0,
    timer:       0,
    timerInterval: null,
    hlNumber:    0,
    undoStack:   [],
    redoStack:   [],
    sessionWins: 0,
    bestTimes:   {},
    totalErrors: 0,
    leaderboard: [],
    achievements: new Set(),
  };

  // ─── AUDIO ENGINE ──────────────────────────────
  const Audio = (() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    function beep(freq, type, dur, vol, delay = 0) {
      if (!state.soundOn) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(vol * state.volume, ctx.currentTime + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + dur + 0.05);
    }

    function resume() { if (ctx.state === 'suspended') ctx.resume(); }

    return {
      click: () => { resume(); beep(800, 'sine', 0.05, 0.12); },
      correct: () => { resume(); beep(523, 'sine', 0.15, 0.18); beep(659, 'sine', 0.15, 0.18, 0.1); beep(784, 'sine', 0.2, 0.18, 0.2); },
      error: () => { resume(); beep(200, 'sawtooth', 0.18, 0.15); beep(180, 'sawtooth', 0.1, 0.1, 0.1); },
      streak: () => { resume(); [523,659,784,1046].forEach((f,i)=>beep(f,'sine',0.15,0.2,i*0.08)); },
      victory: () => { resume(); [523,659,784,1046,1318].forEach((f,i)=>beep(f,'sine',0.3,0.25,i*0.12)); },
      hint: () => { resume(); beep(440, 'triangle', 0.2, 0.15); beep(550, 'triangle', 0.2, 0.15, 0.15); },
    };
  })();

  // ─── TIMERS ────────────────────────────────────
  function startTimer() {
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      if (!state.paused && !state.gameOver) {
        state.timer++;
        updateTimerDisplay();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const m = String(Math.floor(state.timer / 60)).padStart(2,'0');
    const s = String(state.timer % 60).padStart(2,'0');
    document.getElementById('timer-display').textContent = `${m}:${s}`;
  }

  function formatTime(t) {
    return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  }

  // ─── GAME INIT ─────────────────────────────────
  function newGame(daily = false) {
    Audio.click();
    clearInterval(state.timerInterval);

    let puzzle, solution;
    if (daily) {
      const d = SudokuEngine.getDailyPuzzle();
      puzzle = d.puzzle; solution = d.solution;
      state.isDaily = true;
    } else {
      const d = SudokuEngine.generatePuzzle(state.difficulty);
      puzzle = d.puzzle; solution = d.solution;
      state.isDaily = false;
    }

    state.puzzle    = puzzle;
    state.solution  = solution;
    state.board     = SudokuEngine.clone(puzzle);
    state.notes     = Array.from({length:9}, ()=>Array.from({length:9}, ()=>new Set()));
    state.given     = puzzle.map(r=>r.map(v=>v!==0));
    state.selected  = null;
    state.paused    = false;
    state.gameOver  = false;
    state.errors    = 0;
    state.hintsUsed = 0;
    state.streak    = 0;
    state.timer     = 0;
    state.hlNumber  = 0;
    state.undoStack = [];
    state.redoStack = [];
    state.notesMode = false;

    document.getElementById('btn-pause').textContent = '⏸';
    document.getElementById('pause-overlay').style.display = 'none';
    document.getElementById('victory-overlay').style.display = 'none';
    document.getElementById('app').classList.remove('victory-glowing');

    // Clear hint highlights
    document.querySelectorAll('.cell').forEach(c => {
      c.classList.remove('hint-target','hint-related','pair-highlight');
    });

    updateErrorDots();
    updateProgressBar();
    updateStreakDisplay();
    clearHintPanel();
    renderGrid();
    updateNumpadCompletion();
    startTimer();
  }

  // ─── GRID RENDER ───────────────────────────────
  function renderGrid() {
    const grid = document.getElementById('sudoku-grid');
    grid.innerHTML = '';
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.setAttribute('role', 'gridcell');

        if (state.given[r][c]) cell.classList.add('given');

        const val = state.board[r][c];
        if (val) {
          const span = document.createElement('span');
          span.className = 'cell-value';
          span.textContent = val;
          cell.appendChild(span);
        } else {
          renderNotes(cell, r, c);
        }

        cell.addEventListener('click', () => onCellClick(r, c));
        grid.appendChild(cell);
      }
    }
    applyHighlights();
  }

  function renderNotes(cell, r, c) {
    const nset = state.notes[r][c];
    if (!nset || nset.size === 0) return;
    const ng = document.createElement('div');
    ng.className = 'notes-grid';
    for (let n = 1; n <= 9; n++) {
      const nd = document.createElement('span');
      nd.className = 'note-digit';
      nd.textContent = nset.has(n) ? n : '';
      ng.appendChild(nd);
    }
    cell.appendChild(ng);
  }

  function getCell(r, c) {
    return document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  }

  // ─── HIGHLIGHTS ────────────────────────────────
  function applyHighlights() {
    document.querySelectorAll('.cell').forEach(cell => {
      cell.classList.remove('selected','related','same-num','hl-number');
      const r = +cell.dataset.r, c = +cell.dataset.c;
      const val = state.board[r][c];

      // Highlight selected number
      if (state.hlNumber && val === state.hlNumber) cell.classList.add('hl-number');

      if (!state.selected) return;
      const {r: sr, c: sc} = state.selected;
      const sval = state.board[sr][sc];

      if (r===sr && c===sc) {
        cell.classList.add('selected');
      } else if (r===sr || c===sc || (Math.floor(r/3)===Math.floor(sr/3) && Math.floor(c/3)===Math.floor(sc/3))) {
        cell.classList.add('related');
        // Same number highlight
        if (sval && val===sval) cell.classList.add('same-num');
      } else if (sval && val===sval) {
        cell.classList.add('same-num');
      }
    });
  }

  // ─── CELL INTERACTION ──────────────────────────
  function onCellClick(r, c) {
    if (state.paused || state.gameOver) return;
    Audio.click();
    state.selected = {r, c};
    state.hlNumber = 0;
    document.querySelectorAll('.hl-btn').forEach(b=>b.classList.remove('active'));
    // Clear hint highlights when new cell is selected
    document.querySelectorAll('.cell').forEach(cl=>cl.classList.remove('hint-target','hint-related','pair-highlight'));
    applyHighlights();
  }

  function enterNumber(num) {
    if (!state.selected || state.paused || state.gameOver) return;
    const {r, c} = state.selected;
    if (state.given[r][c]) return;

    Audio.click();

    if (state.notesMode) {
      pushUndo();
      const nset = state.notes[r][c];
      if (nset.has(num)) nset.delete(num); else nset.add(num);
      updateCell(r, c);
      return;
    }

    // Check if already correct (don't re-enter)
    if (state.board[r][c] === num) return;

    pushUndo();
    state.board[r][c] = num;

    const correct = num === state.solution[r][c];

    // Auto-remove notes from related cells
    if (state.autoNotes && correct) {
      for (let i = 0; i < 9; i++) {
        state.notes[r][i].delete(num);
        state.notes[i][c].delete(num);
      }
      const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
      for (let dr=0;dr<3;dr++) for (let dc=0;dc<3;dc++) state.notes[br+dr][bc+dc].delete(num);
    }

    updateCell(r, c);
    applyHighlights();

    if (correct) {
      Audio.correct();
      // Trigger ripple on row/col
      triggerRipple(r, c);
      // Streak
      state.streak++;
      updateStreakDisplay();
      if (state.streak > 0 && state.streak % 5 === 0) Audio.streak();
      // Progress
      updateProgressBar();
      // Update numpad completion
      updateNumpadCompletion();
      // Learning mode annotation
      if (state.learnMode) showLearningAnnotation(r, c, num);
      // Check win
      if (SudokuEngine.isSolved(state.board)) { setTimeout(triggerVictory, 400); }
    } else if (state.highlightErrors) {
      state.errors++;
      state.totalErrors++;
      state.streak = 0;
      updateStreakDisplay();
      updateErrorDots();
      Audio.error();
      const cell = getCell(r, c);
      cell.classList.add('shake','error');
      setTimeout(() => { cell.classList.remove('shake'); }, 400);
      if (state.errors >= state.maxErrors) triggerGameOver();
    } else {
      // Highlight errors off — just show
      state.streak = 0;
      updateStreakDisplay();
    }
  }

  function eraseCell() {
    if (!state.selected || state.paused || state.gameOver) return;
    const {r, c} = state.selected;
    if (state.given[r][c]) return;
    Audio.click();
    pushUndo();
    state.board[r][c] = 0;
    state.notes[r][c].clear();
    updateCell(r, c);
    applyHighlights();
    updateProgressBar();
  }

  // ─── SINGLE-CELL UPDATE (no full re-render) ────
  function updateCell(r, c) {
    const cell = getCell(r, c);
    if (!cell) return;
    const val = state.board[r][c];

    // Remove classes
    cell.classList.remove('error','user-filled','popin');
    cell.innerHTML = '';

    if (val) {
      const span = document.createElement('span');
      span.className = 'cell-value';
      span.textContent = val;
      cell.appendChild(span);
      cell.classList.add('user-filled','popin');
      setTimeout(() => cell.classList.remove('popin'), 300);
      if (state.highlightErrors && val !== state.solution[r][c]) {
        cell.classList.add('error');
      }
    } else {
      renderNotes(cell, r, c);
    }
  }

  function triggerRipple(r, c) {
    if (state.animIntensity === 0) return;
    // Ripple on same row and col
    for (let i = 0; i < 9; i++) {
      const delay = Math.abs(i - c) * 40;
      setTimeout(() => {
        const cl = getCell(r, i);
        if (cl) { cl.classList.add('ripple'); setTimeout(()=>cl.classList.remove('ripple'), 450); }
      }, delay);
    }
    for (let i = 0; i < 9; i++) {
      if (i === r) continue;
      const delay = Math.abs(i - r) * 40;
      setTimeout(() => {
        const cl = getCell(i, c);
        if (cl) { cl.classList.add('ripple'); setTimeout(()=>cl.classList.remove('ripple'), 450); }
      }, delay);
    }
  }

  // ─── UNDO / REDO ───────────────────────────────
  function pushUndo() {
    state.undoStack.push({
      board: state.board.map(r=>[...r]),
      notes: state.notes.map(r=>r.map(s=>new Set(s))),
      errors: state.errors,
      streak: state.streak,
    });
    state.redoStack = [];
    if (state.undoStack.length > 100) state.undoStack.shift();
  }

  function undo() {
    if (!state.undoStack.length) return;
    Audio.click();
    const snap = state.undoStack.pop();
    state.redoStack.push({ board:state.board.map(r=>[...r]), notes:state.notes.map(r=>r.map(s=>new Set(s))), errors:state.errors, streak:state.streak });
    state.board  = snap.board;
    state.notes  = snap.notes;
    state.errors = snap.errors;
    state.streak = snap.streak;
    renderGrid();
    updateErrorDots();
    updateProgressBar();
    updateStreakDisplay();
    updateNumpadCompletion();
  }

  function redo() {
    if (!state.redoStack.length) return;
    Audio.click();
    const snap = state.redoStack.pop();
    state.undoStack.push({ board:state.board.map(r=>[...r]), notes:state.notes.map(r=>r.map(s=>new Set(s))), errors:state.errors, streak:state.streak });
    state.board  = snap.board;
    state.notes  = snap.notes;
    state.errors = snap.errors;
    state.streak = snap.streak;
    renderGrid();
    updateErrorDots();
    updateProgressBar();
    updateStreakDisplay();
    updateNumpadCompletion();
  }

  // ─── HUD UPDATES ───────────────────────────────
  function updateErrorDots() {
    ['err1','err2','err3'].forEach((id, i) => {
      document.getElementById(id).classList.toggle('active', i < state.errors);
    });
    document.getElementById('error-count').textContent = `${state.errors} / ${state.maxErrors}`;
  }

  function updateProgressBar() {
    let filled = 0;
    for (let r=0;r<9;r++) for (let c=0;c<9;c++) if (state.board[r][c]===state.solution[r][c] && state.board[r][c]) filled++;
    const pct = Math.round((filled / 81) * 100);
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-pct').textContent = pct + '%';
  }

  function updateStreakDisplay() {
    const el = document.getElementById('streak-count');
    el.textContent = state.streak;
    const icon = document.getElementById('streak-icon');
    if (state.streak >= 10) icon.textContent = '⚡';
    else if (state.streak >= 5) icon.textContent = '🔥';
    else icon.textContent = '🔥';
    if (state.streak > 0) {
      icon.classList.add('streak-pulse');
      setTimeout(()=>icon.classList.remove('streak-pulse'),500);
    }
    document.getElementById('stat-streak').textContent = state.streak;
  }

  function updateNumpadCompletion() {
    for (let n = 1; n <= 9; n++) {
      let count = 0;
      for (let r=0;r<9;r++) for (let c=0;c<9;c++) if (state.board[r][c]===n && state.solution[r][c]===n) count++;
      const btn = document.querySelector(`.num-btn[data-num="${n}"]`);
      if (btn) btn.classList.toggle('complete', count === 9);
    }
  }

  // ─── HINT SYSTEM ───────────────────────────────
  function showHint() {
    if (state.paused || state.gameOver || !state.board) return;
    Audio.hint();
    state.hintsUsed++;

    // Clear previous hint highlights
    document.querySelectorAll('.cell').forEach(cl=>cl.classList.remove('hint-target','hint-related','pair-highlight'));

    const hint = SudokuEngine.getHint(state.board);
    if (!hint) { showHintPanel('<p>No hint available — the puzzle may already be solved!</p>', null); return; }

    // Show hint panel
    showHintPanel(`<p>${hint.explanation}</p>`, hint.strategy);

    // Highlight cells
    hint.highlights.forEach(({row, col, type}) => {
      const cell = getCell(row, col);
      if (!cell) return;
      if (type === 'target') cell.classList.add('hint-target');
      else if (type === 'pair') cell.classList.add('pair-highlight');
      else cell.classList.add('hint-related');
    });

    // Select target cell
    state.selected = {r: hint.row, c: hint.col};
    applyHighlights();

    // Learning mode: show lesson
    if (state.learnMode) {
      const strats = {
        'Naked Single': 'A <b>Naked Single</b> is the simplest strategy: when only one digit can fit in a cell.',
        'Hidden Single (Row)': 'A <b>Hidden Single</b> means a digit has only one possible cell within a unit (row, column, or box).',
        'Hidden Single (Column)':`A <b>Hidden Single</b> in a column: one digit has only one valid placement.`,
        'Hidden Single (Box)': 'A <b>Hidden Single</b> in a 3×3 box.',
        'Naked Pair': 'A <b>Naked Pair</b>: two cells share exactly two candidates, eliminating those digits from the rest of the unit.',
        'Backtracking': 'Advanced constraint analysis was used to determine the correct placement.',
      };
      document.getElementById('learn-content').innerHTML = strats[hint.strategy] || '';
    }
  }

  function showHintPanel(html, strategy) {
    document.getElementById('hint-content').innerHTML = html;
    const tag = document.getElementById('hint-strategy-tag');
    if (strategy) { tag.textContent = strategy; tag.style.display = 'inline-block'; }
    else tag.style.display = 'none';
  }

  function clearHintPanel() {
    document.getElementById('hint-content').innerHTML = '<p class="hint-placeholder">Select a cell and tap <strong>Hint</strong> to receive an intelligent explanation.</p>';
    document.getElementById('hint-strategy-tag').style.display = 'none';
  }

  function showLearningAnnotation(r, c, num) {
    // Detect strategy used for this move
    const tempBoard = state.board.map(row=>[...row]);
    tempBoard[r][c] = 0;
    const hint = SudokuEngine.getHint(tempBoard);
    if (hint && hint.row===r && hint.col===c) {
      document.getElementById('learn-content').innerHTML =
        `<p><b>Strategy used:</b> ${hint.strategy}</p><p>${hint.explanation}</p>`;
    }
  }

  // ─── AUTO SOLVE ────────────────────────────────
  function autoSolve() {
    if (!state.board || state.gameOver) return;
    if (!confirm('Auto-solve will complete the puzzle for you. Continue?')) return;
    Audio.click();
    state.board = SudokuEngine.clone(state.solution);
    renderGrid();
    updateProgressBar();
    updateNumpadCompletion();
    clearInterval(state.timerInterval);
    state.gameOver = true;
  }

  // ─── VICTORY / GAME OVER ───────────────────────
  function triggerVictory() {
    clearInterval(state.timerInterval);
    state.gameOver = true;
    Audio.victory();

    // Save stats
    state.sessionWins++;
    document.getElementById('stat-won').textContent = state.sessionWins;
    const key = state.difficulty;
    if (!state.bestTimes[key] || state.timer < state.bestTimes[key]) state.bestTimes[key] = state.timer;
    document.getElementById('stat-best').textContent = formatTime(state.bestTimes[key] || state.timer);
    document.getElementById('stat-errors').textContent = state.errors;

    // Leaderboard entry
    state.leaderboard.push({ diff: state.difficulty, time: state.timer, errors: state.errors });
    state.leaderboard.sort((a,b)=>a.time-b.time);

    // Determine badge
    let badge = '';
    if (state.errors === 0 && state.timer < 120) badge = '⚡ Fast Thinker + Perfect Solver!';
    else if (state.errors === 0) badge = '✨ Perfect Solver — No mistakes!';
    else if (state.timer < 120) badge = '⚡ Fast Thinker — Speed run!';
    else if (state.difficulty === 'expert') badge = '👑 Sudoku Master!';
    else badge = '🎉 Puzzle Complete!';

    // Unlock achievements
    if (state.timer < 120) unlockAchiev('fast');
    if (state.errors === 0) unlockAchiev('perfect');
    if (state.difficulty === 'expert') unlockAchiev('master');
    if (state.streak >= 5) unlockAchiev('streak5');
    if (state.errors === 0) unlockAchiev('noerrors');

    document.getElementById('v-time').textContent = formatTime(state.timer);
    document.getElementById('v-errors').textContent = state.errors;
    document.getElementById('v-hints').textContent = state.hintsUsed;
    document.getElementById('victory-title').textContent = state.isDaily ? 'Daily Challenge Done!' : 'Puzzle Complete!';
    document.getElementById('victory-subtitle').textContent = ['Amazing work! 🎊', 'Brilliant solving! 🌟', 'You crushed it! 💜'][Math.floor(Math.random()*3)];
    document.getElementById('victory-badge').textContent = badge;

    document.getElementById('victory-overlay').style.display = 'flex';
    document.getElementById('app').classList.add('victory-glowing');
    launchConfetti();
  }

  function triggerGameOver() {
    clearInterval(state.timerInterval);
    state.gameOver = true;
    // Reveal board briefly with error styling, then show alert
    setTimeout(() => alert('Game Over! You made too many mistakes.\n\nClick OK to start a new game.'), 100);
  }

  // ─── ACHIEVEMENTS ──────────────────────────────
  function unlockAchiev(id) {
    if (state.achievements.has(id)) return;
    state.achievements.add(id);
    const el = document.querySelector(`.achiev-item[data-id="${id}"]`);
    if (el) { el.classList.remove('locked'); el.classList.add('unlocked'); }
  }

  // ─── CONFETTI ──────────────────────────────────
  function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = Array.from({length: 120}, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 100,
      r: 4 + Math.random() * 6,
      d: Math.random() * 20 + 10,
      color: `hsl(${Math.random()*360},90%,65%)`,
      tilt: (Math.random() * 10) - 10,
      tiltAngle: 0,
      tiltIncrement: (Math.random() * 0.07) + 0.05,
      vx: (Math.random() - 0.5) * 2,
    }));

    let frame = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.tiltAngle += p.tiltIncrement;
        p.y += (Math.cos(frame * 0.01 + p.d) + 2) * 1.5;
        p.x += p.vx + Math.sin(frame * 0.01) * 0.5;
        p.tilt = Math.sin(p.tiltAngle) * 12;
        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
        ctx.stroke();
      });
      frame++;
      if (frame < 300) requestAnimationFrame(draw);
      else ctx.clearRect(0,0,canvas.width,canvas.height);
    }
    draw();
  }

  // ─── KEYBOARD ──────────────────────────────────
  document.addEventListener('keydown', e => {
    if (state.paused || state.gameOver) return;
    if (e.key >= '1' && e.key <= '9') { enterNumber(+e.key); return; }
    if (e.key === '0' || e.key === 'Delete' || e.key === 'Backspace') { eraseCell(); return; }
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();
      if (!state.selected) { state.selected = {r:0,c:0}; }
      else {
        let {r,c} = state.selected;
        if (e.key==='ArrowUp') r=Math.max(0,r-1);
        if (e.key==='ArrowDown') r=Math.min(8,r+1);
        if (e.key==='ArrowLeft') c=Math.max(0,c-1);
        if (e.key==='ArrowRight') c=Math.min(8,c+1);
        state.selected={r,c};
      }
      applyHighlights();
      return;
    }
    if (e.ctrlKey && e.key==='z') { undo(); return; }
    if (e.ctrlKey && e.key==='y') { redo(); return; }
  });

  // ─── BUTTON BINDINGS ───────────────────────────
  function bindButtons() {
    // New game
    document.getElementById('btn-new-game').addEventListener('click', () => newGame(false));

    // Difficulty
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        state.difficulty = btn.dataset.diff;
        Audio.click();
      });
    });

    // Number pad
    document.querySelectorAll('.num-btn').forEach(btn => {
      btn.addEventListener('click', () => enterNumber(+btn.dataset.num));
    });

    // Toolbar
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    document.getElementById('btn-erase').addEventListener('click', eraseCell);
    document.getElementById('btn-hint').addEventListener('click', showHint);
    document.getElementById('btn-solve').addEventListener('click', autoSolve);
    document.getElementById('btn-notes').addEventListener('click', () => {
      state.notesMode = !state.notesMode;
      document.getElementById('btn-notes').classList.toggle('active', state.notesMode);
      Audio.click();
    });

    // Pause
    document.getElementById('btn-pause').addEventListener('click', () => {
      state.paused = true;
      document.getElementById('pause-overlay').style.display = 'flex';
      document.getElementById('btn-pause').textContent = '▶';
      Audio.click();
    });
    document.getElementById('btn-resume').addEventListener('click', () => {
      state.paused = false;
      document.getElementById('pause-overlay').style.display = 'none';
      document.getElementById('btn-pause').textContent = '⏸';
      Audio.click();
    });

    // Play again
    document.getElementById('btn-play-again').addEventListener('click', () => {
      document.getElementById('victory-overlay').style.display = 'none';
      newGame(false);
    });

    // Daily
    document.getElementById('btn-daily').addEventListener('click', () => newGame(true));

    // Settings
    document.getElementById('btn-settings').addEventListener('click', () => {
      document.getElementById('settings-overlay').style.display = 'flex';
    });
    document.getElementById('btn-close-settings').addEventListener('click', () => {
      document.getElementById('settings-overlay').style.display = 'none';
    });
    document.getElementById('settings-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('settings-overlay'))
        document.getElementById('settings-overlay').style.display = 'none';
    });

    // Sound toggle
    document.getElementById('toggle-sound').addEventListener('change', e => {
      state.soundOn = e.target.checked;
    });

    // Highlight errors
    document.getElementById('toggle-highlight-errors').addEventListener('change', e => {
      state.highlightErrors = e.target.checked;
      renderGrid();
    });

    // Auto notes
    document.getElementById('toggle-autonotes').addEventListener('change', e => {
      state.autoNotes = e.target.checked;
    });

    // Animation intensity
    const animLabels = ['Off','Medium','High'];
    document.getElementById('anim-intensity').addEventListener('input', e => {
      state.animIntensity = +e.target.value;
      document.getElementById('anim-label').textContent = animLabels[state.animIntensity];
    });

    // Volume
    document.getElementById('vol-slider').addEventListener('input', e => {
      state.volume = +e.target.value;
    });

    // Theme toggle
    document.getElementById('btn-theme-toggle').addEventListener('click', () => {
      const html = document.documentElement;
      const isDark = html.getAttribute('data-theme') === 'dark';
      html.setAttribute('data-theme', isDark ? 'light' : 'dark');
      document.getElementById('btn-theme-toggle').textContent = isDark ? '☀️' : '🌙';
      Audio.click();
    });

    // Theme pills
    document.querySelectorAll('.theme-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.theme-pill').forEach(p=>p.classList.remove('active'));
        pill.classList.add('active');
        document.documentElement.setAttribute('data-color', pill.dataset.color);
        Audio.click();
      });
    });

    // Number highlight
    document.querySelectorAll('.hl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = +btn.dataset.n;
        if (state.hlNumber === n) {
          state.hlNumber = 0;
          btn.classList.remove('active');
        } else {
          state.hlNumber = n;
          document.querySelectorAll('.hl-btn').forEach(b=>b.classList.remove('active'));
          btn.classList.add('active');
        }
        Audio.click();
        applyHighlights();
      });
    });

    // Learning mode
    document.getElementById('toggle-learn').addEventListener('change', e => {
      state.learnMode = e.target.checked;
    });

    // Leaderboard
    document.getElementById('btn-leaderboard').addEventListener('click', () => {
      renderLeaderboard();
      document.getElementById('lb-overlay').style.display = 'flex';
    });
    document.getElementById('btn-close-lb').addEventListener('click', () => {
      document.getElementById('lb-overlay').style.display = 'none';
    });
    document.getElementById('lb-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('lb-overlay'))
        document.getElementById('lb-overlay').style.display = 'none';
    });
  }

  function renderLeaderboard() {
    const body = document.getElementById('lb-body');
    if (!state.leaderboard.length) {
      body.innerHTML = '<tr><td colspan="4" style="text-align:center;opacity:0.5;padding:1rem">No records yet — complete a puzzle!</td></tr>';
      return;
    }
    body.innerHTML = state.leaderboard.slice(0,10).map((e,i)=>
      `<tr><td>${i+1}</td><td style="text-transform:capitalize">${e.diff}</td><td>${formatTime(e.time)}</td><td>${e.errors}</td></tr>`
    ).join('');
  }

  // ─── INIT ──────────────────────────────────────
  function init() {
    bindButtons();
    newGame(false);
  }

  // Wait for DOM
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
