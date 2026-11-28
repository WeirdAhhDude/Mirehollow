// Mirehollow — minigames and books.
// Connect 4, Memory, Math duels, Quizzes (about books you bought, or the Mayor's town trivia), Rock-Paper-Scissors
// and Fishing. They show up in context: villagers challenge you (or accept your challenge) in conversation,
// some jobs are minigames, the bookseller quizzes you on books, the mall has an arcade, and you can fish with a rod.
'use strict';
(function (MH) {
  const G = (MH.games = {});
  const P = () => MH.state.player;
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const nm = (id) => (MH.CHAR[id] ? MH.CHAR[id].name : id);
  const esc = (s) => MH.esc(String(s));

  // how good each villager is at games (1..5)
  const SMARTS = { penelope: 5, brenda: 5, darkborn: 5, zahra: 4, sable: 4, owl: 4, rook: 4, vesper: 4, mortimer: 4, thistle: 4, juniper: 3, marina: 3, dionne: 3, clucky: 3, vix: 3, chuckles: 3, beaver: 3, snitch: 3, solaris: 3, scarecrow: 3, maggie: 3, sunny: 2, lily: 2, kira: 2, box: 2, bunny: 2, sheep: 2, mayor: 2, nimbus: 2, gertie: 1, patty: 1, mole: 1, gristle: 1 };
  G.skill = (id) => (!id ? 3 : SMARTS[id] || (MH.CHAR[id] && MH.CHAR[id].folk ? 2 : 3));
  G.NAMES = { connect4: 'Connect 4', memory: 'Memory', math: 'Math duel', quiz: 'Quiz', rps: 'Rock-Paper-Scissors', fishing: 'Fishing' };
  G.has = (g) => !!GAMES[g];

  // a modal "table" every game is played on. Closing it early counts as giving up.
  function table(title, sub) {
    const body = h(`<div class="mgame"><div class="mgsub">${sub || ''}</div><div class="mgarea"></div><div class="mgstatus">&nbsp;</div></div>`);
    let quit = null;
    MH.ui.modal(title, body, { keep: true, onClose: () => { if (quit) quit(); else MH.ui.closeModal(); } });
    return { body, area: body.querySelector('.mgarea'), status: (t, cls) => { const s = body.querySelector('.mgstatus'); s.innerHTML = t; s.className = 'mgstatus ' + (cls || ''); }, onQuit: (f) => (quit = f) };
  }
  const finishBtn = (T, label, cb) => { const b = h(`<button class="btn big mgdone">${label}</button>`); b.onclick = cb; T.body.appendChild(b); };

  // ================================================================ CONNECT 4
  const ROWS = 6, COLS = 7;
  const c4drop = (b, col, p) => { for (let r = ROWS - 1; r >= 0; r--) if (!b[r][col]) { b[r][col] = p; return r; } return -1; };
  const c4undo = (b, col) => { for (let r = 0; r < ROWS; r++) if (b[r][col]) { b[r][col] = 0; return; } };
  const c4valid = (b) => [3, 2, 4, 1, 5, 0, 6].filter((c) => !b[0][c]);
  function c4win(b, p) {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (b[r][c] !== p) continue;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        let k = 1; while (k < 4 && b[r + dr * k] && b[r + dr * k][c + dc * k] === p) k++;
        if (k === 4) return [[r, c], [r + dr, c + dc], [r + dr * 2, c + dc * 2], [r + dr * 3, c + dc * 3]];
      }
    }
    return null;
  }
  function c4eval(b, p) {
    const o = 3 - p; let s = 0;
    for (let r = 0; r < ROWS; r++) if (b[r][3] === p) s += 3;
    const win4 = (cells) => { let mine = 0, theirs = 0, empty = 0; cells.forEach(([r, c]) => { const v = b[r][c]; if (v === p) mine++; else if (v === o) theirs++; else empty++; });
      if (mine === 4) return 1000; if (mine === 3 && empty === 1) return 6; if (mine === 2 && empty === 2) return 2; if (theirs === 3 && empty === 1) return -8; return 0; };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
      if (cells.every(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS)) s += win4(cells);
    }
    return s;
  }
  function negamax(b, depth, alpha, beta, p) {
    if (c4win(b, 3 - p)) return -100000 - depth;
    const moves = c4valid(b);
    if (!moves.length) return 0;
    if (depth === 0) return c4eval(b, p);
    let best = -Infinity;
    for (const c of moves) { c4drop(b, c, p); const v = -negamax(b, depth - 1, -beta, -alpha, 3 - p); c4undo(b, c); if (v > best) best = v; if (v > alpha) alpha = v; if (alpha >= beta) break; }
    return best;
  }
  function c4ai(b, skill) {
    const moves = c4valid(b);
    if (Math.random() < [0, 0.5, 0.25, 0.12, 0.05, 0.02][skill]) return MH.pick(moves); // a careless moment
    const depth = [0, 1, 2, 3, 4, 5][skill];
    let best = moves[0], bv = -Infinity;
    for (const c of moves) { c4drop(b, c, 2); const v = -negamax(b, depth - 1, -Infinity, Infinity, 1) + Math.random() * 0.5; c4undo(b, c); if (v > bv) { bv = v; best = c; } }
    return best;
  }
  function connect4(o) {
    return new Promise((done) => {
      const skill = o.skill || 3, who = o.vs ? nm(o.vs) : 'The arcade machine';
      const T = table('🔴 Connect 4 🟡', `You 🔴 vs ${esc(who)} 🟡 · ${['', 'easy', 'casual', 'decent', 'sharp', 'brilliant'][skill]}${o.stakes ? ' · ' + o.stakes + ' 🪙 on it' : ''}`);
      const b = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
      const grid = h('<div class="c4"></div>');
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) grid.appendChild(h(`<button class="c4c" data-r="${r}" data-c="${c}"><i></i></button>`));
      T.area.appendChild(grid);
      let turn = 1, over = false;
      const paint = (line) => grid.querySelectorAll('.c4c').forEach((el) => { const v = b[+el.dataset.r][+el.dataset.c]; el.className = 'c4c' + (v === 1 ? ' p1' : v === 2 ? ' p2' : '') + (line && line.some(([r, c]) => r === +el.dataset.r && c === +el.dataset.c) ? ' win' : ''); });
      const end = (res, line) => { over = true; paint(line); T.status(res === 'win' ? '🎉 You win!' : res === 'lose' ? `${esc(who)} wins!` : 'A draw.', res === 'win' ? 'ok' : res === 'lose' ? 'bad' : ''); finishBtn(T, 'Continue', () => { MH.ui.closeModal(); done({ win: res === 'win', draw: res === 'draw', score: res === 'win' ? 1 : res === 'draw' ? 0.5 : 0 }); }); };
      const after = (p) => { const L = c4win(b, p); if (L) return end(p === 1 ? 'win' : 'lose', L), true; if (!c4valid(b).length) return end('draw'), true; return false; };
      T.status('Your turn — tap a column.');
      grid.onclick = (e) => {
        const cell = e.target.closest('.c4c'); if (!cell || over || turn !== 1) return;
        if (c4drop(b, +cell.dataset.c, 1) < 0) return;
        paint(); if (after(1)) return;
        turn = 2; T.status(`${esc(who)} is thinking…`);
        setTimeout(() => { if (over) return; c4drop(b, c4ai(b, skill), 2); paint(); if (after(2)) return; turn = 1; T.status('Your turn.'); }, 500 + Math.random() * 500);
      };
      T.onQuit(() => { MH.ui.closeModal(); if (!over) done({ win: false, gaveUp: true, score: 0 }); });
    });
  }

  // ================================================================ MEMORY (solo, or a duel against a villager)
  const THEMES = { default: ['🍎', '🐸', '🌻', '🍄', '🐚', '⭐', '🎈', '🍰'], mail: ['✉️', '📦', '📮', '🏠', '🗞️', '📜', '🎁', '💌'], fish: ['🐟', '🐠', '🐡', '🦐', '🦀', '🐙', '🐚', '🦑'], stars: ['⭐', '🌙', '☀️', '☁️', '⚡', '🌈', '❄️', '🔥'] };
  function memory(o) {
    return new Promise((done) => {
      const duel = !!o.vs, skill = o.skill || 3, who = duel ? nm(o.vs) : '';
      const icons = MH.shuffle((THEMES[o.theme] || THEMES.default).slice()).slice(0, 8);
      const deck = MH.shuffle(icons.concat(icons)).map((ic, i) => ({ i, ic, open: false, done: false, by: 0 }));
      const limit = duel ? 99 : o.limit || 22;
      const T = table('🃏 Memory', duel ? `You vs ${esc(who)} — find pairs; a match lets you go again${o.stakes ? ' · ' + o.stakes + ' 🪙 on it' : ''}` : `Find all 8 pairs in ${limit} tries`);
      const grid = h('<div class="mem"></div>');
      deck.forEach((d) => grid.appendChild(h(`<button class="memc" data-i="${d.i}"><span>${d.ic}</span></button>`)));
      T.area.appendChild(grid);
      const seen = new Map(); // what the villager remembers: index -> icon
      let first = null, busy = false, turn = 1, me = 0, them = 0, tries = 0, over = false;
      const el = (d) => grid.querySelector(`[data-i="${d.i}"]`);
      const show = (d, on) => el(d).classList.toggle('open', on);
      const score = () => T.status(duel ? `You ${me} · ${esc(who)} ${them} — ${turn === 1 ? 'your turn' : esc(who) + '\'s turn'}` : `Pairs ${me}/8 · tries ${tries}/${limit}`);
      const remember = (d) => { if (duel && Math.random() < 0.2 + skill * 0.15) seen.set(d.i, d.ic); };
      const finish = () => {
        over = true; const win = duel ? me > them : me === 8;
        T.status(win ? '🎉 You win!' : duel ? (me === them ? 'A draw.' : `${esc(who)} wins!`) : 'Out of tries!', win ? 'ok' : 'bad');
        finishBtn(T, 'Continue', () => { MH.ui.closeModal(); done({ win, draw: duel && me === them, score: duel ? me / 8 : me / 8 }); });
      };
      const resolvePair = (a, b2, who2) => {
        busy = true;
        setTimeout(() => {
          if (a.ic === b2.ic) { a.done = b2.done = true; el(a).classList.add('done', who2 === 1 ? 'mine' : 'theirs'); el(b2).classList.add('done', who2 === 1 ? 'mine' : 'theirs'); seen.delete(a.i); seen.delete(b2.i); if (who2 === 1) me++; else them++; }
          else { show(a, false); show(b2, false); if (duel) turn = 3 - turn; }
          busy = false; score();
          if (deck.every((d) => d.done) || (!duel && tries >= limit)) return finish();
          if (duel && turn === 2) setTimeout(aiTurn, 600);
        }, 750);
      };
      const aiTurn = () => {
        if (over) return;
        const hidden = deck.filter((d) => !d.done);
        // a known pair?
        const byIcon = {}; let pick = null;
        seen.forEach((ic, i) => { if (deck[i].done) return; if (byIcon[ic] != null) pick = [deck[byIcon[ic]], deck[i]]; else byIcon[ic] = i; });
        let a, b2;
        if (pick) [a, b2] = pick;
        else {
          a = MH.pick(hidden.filter((d) => !seen.has(d.i)).length ? hidden.filter((d) => !seen.has(d.i)) : hidden);
          const known = [...seen.entries()].find(([i, ic]) => ic === a.ic && i !== a.i && !deck[i].done);
          b2 = known ? deck[known[0]] : MH.pick(hidden.filter((d) => d !== a));
        }
        show(a, true); remember(a);
        setTimeout(() => { show(b2, true); remember(b2); resolvePair(a, b2, 2); }, 550);
      };
      grid.onclick = (e) => {
        const c = e.target.closest('.memc'); if (!c || busy || over || turn !== 1) return;
        const d = deck[+c.dataset.i]; if (d.done || d === first) return;
        show(d, true); remember(d);
        if (!first) { first = d; return; }
        const a = first; first = null; tries++;
        resolvePair(a, d, 1);
      };
      score();
      T.onQuit(() => { MH.ui.closeModal(); if (!over) done({ win: false, gaveUp: true, score: me / 8 }); });
    });
  }

  // ================================================================ MATH (duel or solo, multiple choice)
  function mathQ(level, flavour) {
    const r = (a, b) => MH.randi(a, b);
    let q, a;
    const kind = level <= 1 ? MH.pick(['+', '-']) : level === 2 ? MH.pick(['+', '-', '×']) : MH.pick(['+', '-', '×', '÷']);
    if (kind === '+') { const x = r(3, level * 30), y = r(2, level * 25); q = `${x} + ${y}`; a = x + y; }
    else if (kind === '-') { const x = r(10, level * 40), y = r(1, x); q = `${x} − ${y}`; a = x - y; }
    else if (kind === '×') { const x = r(2, 4 + level * 3), y = r(2, 9); q = `${x} × ${y}`; a = x * y; }
    else { const y = r(2, 9), a0 = r(2, 12); q = `${a0 * y} ÷ ${y}`; a = a0; }
    if (flavour === 'cashier' && kind === '-') q = `A customer pays ${q.split(' − ')[0]} for something costing ${q.split(' − ')[1]}. Change?`;
    if (flavour === 'forms' && kind === '+') q = `Budget line: ${q}`;
    const opts = new Set([a]); while (opts.size < 4) { const d = a + MH.randi(-12, 12); if (d !== a && d >= 0) opts.add(d); }
    return { q, a, opts: MH.shuffle([...opts]) };
  }
  function math(o) {
    return new Promise((done) => {
      const duel = !!o.vs, skill = o.skill || 3, n = o.n || 8, level = o.level || (duel ? Math.min(3, 1 + Math.floor(skill / 2)) : 2);
      const who = duel ? nm(o.vs) : '';
      const T = table(o.title || '🧮 Math', duel ? `First to the right answer scores · You vs ${esc(who)}${o.stakes ? ' · ' + o.stakes + ' 🪙 on it' : ''}` : `${n} questions — be quick and right`);
      const box = h(`<div class="mathq"><div class="mq"></div><div class="mopts"></div><div class="mtimer"><i></i></div></div>`);
      T.area.appendChild(box);
      let k = 0, me = 0, them = 0, over = false, timer = null, tick = null;
      const next = () => {
        if (k >= n) return finish();
        k++;
        const Q = mathQ(level, o.flavour);
        box.querySelector('.mq').textContent = Q.q + ' = ?';
        const ob = box.querySelector('.mopts'); ob.innerHTML = '';
        let locked = false, answered = false;
        const limit = duel ? 9000 : 7000, t0 = performance.now();
        const bar = box.querySelector('.mtimer i');
        clearInterval(tick); tick = setInterval(() => { bar.style.width = Math.max(0, 100 - (performance.now() - t0) / limit * 100) + '%'; }, 60);
        const resolve = (winner) => { if (answered) return; answered = true; clearTimeout(timer); clearInterval(tick); if (winner === 1) me++; else if (winner === 2) them++; T.status(winner === 1 ? '✔ Yours!' : winner === 2 ? `${esc(who)} got it first! (${Q.a})` : `It was ${Q.a}.`, winner === 1 ? 'ok' : 'bad'); score(); setTimeout(next, 900); };
        Q.opts.forEach((v) => { const b = h(`<button class="btn mopt">${v}</button>`); b.onclick = () => { if (locked || answered) return; if (v === Q.a) resolve(1); else { locked = true; b.classList.add('wrong'); if (!duel) resolve(0); } }; ob.appendChild(b); });
        // the villager's answer arrives after a while (faster and more often right if they're clever)
        if (duel) { const t = (7.5 - skill * 1.1 + Math.random() * 2) * 1000; timer = setTimeout(() => { if (Math.random() < 0.55 + skill * 0.08) resolve(2); else if (locked) resolve(0); }, t); }
        setTimeout(() => { if (!answered && !over) resolve(0); }, limit);
      };
      const score = () => T.body.querySelector('.mgsub').innerHTML = duel ? `You ${me} · ${esc(who)} ${them} · question ${k}/${n}` : `Correct ${me}/${n}`;
      const finish = () => {
        over = true; clearInterval(tick);
        const win = duel ? me > them : me / n >= 0.6;
        box.innerHTML = '';
        T.status(win ? '🎉 Well done!' : duel ? (me === them ? 'A draw.' : `${esc(who)} wins.`) : 'Not quite.', win ? 'ok' : 'bad');
        finishBtn(T, 'Continue', () => { MH.ui.closeModal(); done({ win, draw: duel && me === them, score: me / n }); });
      };
      T.onQuit(() => { over = true; clearTimeout(timer); clearInterval(tick); MH.ui.closeModal(); done({ win: false, gaveUp: true, score: me / n }); });
      next();
    });
  }

  // ================================================================ QUIZ (multiple choice)
  function quiz(o) {
    return new Promise((done) => {
      const qs = o.questions.slice(0, o.n || o.questions.length);
      const T = table(o.title || '❓ Quiz', o.sub || `${qs.length} questions`);
      const box = h(`<div class="quiz"><div class="qq"></div><div class="qopts"></div></div>`);
      T.area.appendChild(box);
      let k = 0, right = 0, over = false;
      const next = () => {
        if (k >= qs.length) return finish();
        const Q = qs[k++];
        box.querySelector('.qq').textContent = `${k}. ${Q.q}`;
        const ob = box.querySelector('.qopts'); ob.innerHTML = ''; ob.dataset.done = '';
        const opts = MH.shuffle(Q.o.map((t, i) => ({ t, ok: i === 0 })));
        opts.forEach((op) => { const b = h(`<button class="btn ghost qopt">${esc(op.t)}</button>`); b.onclick = () => {
          if (ob.dataset.done) return; ob.dataset.done = '1';
          if (op.ok) { right++; b.classList.add('right'); T.status('✔ Correct!', 'ok'); } else { b.classList.add('wrong'); ob.querySelectorAll('.qopt').forEach((x) => { if (x.textContent === Q.o[0]) x.classList.add('right'); }); T.status('✘ Not quite.', 'bad'); }
          setTimeout(next, 1100); }; ob.appendChild(b); });
      };
      const finish = () => { over = true; box.innerHTML = `<p class="qres">${right}/${qs.length} correct</p>`; const win = right / qs.length >= (o.pass || 0.6); T.status(win ? '🎉 Passed!' : 'Better luck next time.', win ? 'ok' : 'bad'); finishBtn(T, 'Continue', () => { MH.ui.closeModal(); done({ win, score: right / qs.length, right, n: qs.length }); }); };
      T.onQuit(() => { MH.ui.closeModal(); if (!over) done({ win: false, gaveUp: true, score: right / qs.length, right, n: qs.length }); });
      next();
    });
  }

  // ================================================================ ROCK-PAPER-SCISSORS (best of 3)
  const RPS_BIAS = { kira: 'rock', box: 'rock', gristle: 'rock', gertie: 'rock', mayor: 'paper', mortimer: 'paper', penelope: 'paper', sheep: 'scissors', vesper: 'scissors', snitch: 'scissors' };
  function rps(o) {
    return new Promise((done) => {
      const who = nm(o.vs), skill = o.skill || 3, bias = RPS_BIAS[o.vs];
      const T = table('✊ Rock · Paper · Scissors', `Best of 3 vs ${esc(who)}${o.stakes ? ' · ' + o.stakes + ' 🪙 on it' : ''}`);
      const ICON = { rock: '✊', paper: '✋', scissors: '✌️' }, BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      const box = h(`<div class="rps"><div class="rpsshow"><span class="me">❔</span><b>vs</b><span class="them">❔</span></div><div class="rpsbtns">${Object.keys(ICON).map((k) => `<button class="btn big" data-k="${k}">${ICON[k]}</button>`).join('')}</div></div>`);
      T.area.appendChild(box);
      let me = 0, them = 0, last = null, over = false;
      const theirPick = () => {
        if (last && Math.random() < skill * 0.1) return Object.keys(BEATS).find((k) => BEATS[k] === BEATS[BEATS[last]]) || MH.pick(Object.keys(ICON)); // reads you
        if (bias && Math.random() < 0.5) return bias;
        return MH.pick(Object.keys(ICON));
      };
      box.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
        if (over) return;
        const mine = b.dataset.k, theirs = theirPick(); last = mine;
        box.querySelector('.me').textContent = ICON[mine]; box.querySelector('.them').textContent = ICON[theirs];
        if (BEATS[mine] === theirs) { me++; T.status('You take the round!', 'ok'); } else if (BEATS[theirs] === mine) { them++; T.status(`${esc(who)} takes it!`, 'bad'); } else T.status('Tie — again!');
        T.body.querySelector('.mgsub').textContent = `You ${me} · ${who} ${them}`;
        if (me === 2 || them === 2) { over = true; finishBtn(T, 'Continue', () => { MH.ui.closeModal(); done({ win: me === 2, score: me / 2 }); }); }
      }));
      T.onQuit(() => { MH.ui.closeModal(); if (!over) done({ win: false, gaveUp: true, score: 0 }); });
    });
  }

  // ================================================================ FISHING (keep the green bar on the fish)
  const FISH = {
    pond: [['Bluegill', '🐟', 6, 1], ['Pond carp', '🐟', 11, 2], ['Golden koi', '🐠', 45, 4]],
    river: [['Minnow', '🐟', 4, 1], ['River trout', '🐟', 13, 2], ['Rainbow trout', '🐠', 24, 3]],
    falls: [['Mountain char', '🐟', 18, 3], ['Crystal trout', '🐠', 42, 4]],
    swamp: [['Mudskipper', '🐟', 8, 2], ['Swamp eel', '🐍', 16, 3], ['Ghost catfish', '🐡', 60, 5]],
  };
  G.fishAt = (key) => FISH[{ pond: 'pond', tower: 'pond', lilycottage: 'pond', river: 'river', falls: 'falls', swamp: 'swamp', stilthouse: 'swamp', gatorgrove: 'swamp', eastlane: 'swamp' }[key] || 'river'];
  function fishing(o) {
    return new Promise((done) => {
      const pool = o.pool, night = MH.hour() >= 19 || MH.hour() < 5;
      const roll = Math.random();
      const f = roll < (night ? 0.12 : 0.06) ? pool[pool.length - 1] : roll < 0.45 ? pool[Math.min(1, pool.length - 1)] : pool[0];
      const lvl = f[3];
      const T = table('🎣 Fishing', 'Hold to raise the green bar (or drag it on the water) · keep the fish inside it');
      const box = h(`<div class="fishg"><div class="fwater"><div class="fbar"></div><div class="ffish">🐟</div></div><div class="fprog"><i></i></div></div>`);
      const btn = h('<button class="btn big fhold">HOLD</button>');
      T.area.appendChild(box); T.area.appendChild(btn);
      const H = 240, barH = 76 - lvl * 7;
      let bar = H - barH, vel = 0, fish = H / 2, ft = H / 2, prog = 32, holding = false, over = false, last = performance.now(), dragY = null;
      const set = (v) => (holding = v);
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); set(true); }); btn.addEventListener('pointerup', () => set(false)); btn.addEventListener('pointerleave', () => set(false));
      // drag directly on the water: the bar follows your finger
      const water = box.querySelector('.fwater');
      const ptY = (e) => e.clientY - water.getBoundingClientRect().top;
      water.addEventListener('pointerdown', (e) => { e.preventDefault(); dragY = ptY(e); try { water.setPointerCapture(e.pointerId); } catch (er) { /* fine */ } });
      water.addEventListener('pointermove', (e) => { if (dragY != null) dragY = ptY(e); });
      water.addEventListener('pointerup', () => (dragY = null)); water.addEventListener('pointercancel', () => (dragY = null));
      T.status('Something nibbles…');
      const loop = (now) => {
        if (over) return;
        if (!document.body.contains(box)) { over = true; done({ win: false, gaveUp: true, score: 0 }); return; }
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        // snappy: the bar reaches its speed almost at once and stops almost at once (no long slide after you let go)
        if (dragY != null) { vel = 0; bar += (MH.clamp(dragY - barH / 2, 0, H - barH) - bar) * Math.min(1, dt * 16); }
        else { vel += ((holding ? -230 : 200) - vel) * Math.min(1, dt * 11); bar += vel * dt; }
        if (bar < 0) { bar = 0; vel = Math.max(0, vel); } if (bar > H - barH) { bar = H - barH; vel = Math.min(0, vel); }
        if (Math.random() < dt * (0.8 + lvl * 0.6)) ft = MH.rand(10, H - 10);
        fish += (ft - fish) * Math.min(1, dt * (1.2 + lvl * 0.7));
        const inside = fish > bar && fish < bar + barH;
        prog += (inside ? 22 : -16 - lvl * 2) * dt;
        box.querySelector('.fbar').style.cssText = `top:${bar}px;height:${barH}px`;
        box.querySelector('.ffish').style.top = (fish - 12) + 'px';
        box.querySelector('.fprog i').style.height = MH.clamp(prog, 0, 100) + '%';
        box.querySelector('.fbar').classList.toggle('on', inside);
        if (prog >= 100 || prog <= 0) {
          over = true; const win = prog >= 100;
          T.status(win ? `🎉 You caught a ${f[0]}!` : 'It got away…', win ? 'ok' : 'bad');
          finishBtn(T, 'Continue', () => { MH.ui.closeModal(); done({ win, score: win ? 1 : 0, fish: win ? { name: f[0], icon: f[1], value: f[2] } : null }); });
          return;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      T.onQuit(() => { over = true; MH.ui.closeModal(); done({ win: false, gaveUp: true, score: 0 }); });
    });
  }

  const GAMES = { connect4, memory, math, quiz, rps, fishing };
  G.busy = 0; // while a minigame is open, time crawls (see sim.timeFactor)
  G.play = (game, opts = {}) => { if (!GAMES[game]) return Promise.resolve({ win: false, score: 0 }); G.busy++; return GAMES[game](opts).finally(() => { G.busy = Math.max(0, G.busy - 1); }); };

  // ================================================================ BOOKS (sold at the bookstore; the seller quizzes you)
  MH.BOOKS = {
    swamp: { title: 'A Field Guide to the Mirehollow Swamp', by: 'Dr. Penelope', price: 12, icon: '📗', pages: [
      'The Mirehollow Swamp begins where the last lamp post ends, east of town. Its waters are warm, green and humming — mostly with mosquitoes.',
      'The swamp\'s most famous resident is Maggie, a very tall mosquito who lives in the Stilt House. She has named her favourite mosquito Steve.',
      'Glowcap mushrooms grow on the muddy banks and glow faintly at night. They are perfectly safe to eat (results may vary). Gertie\'s family lives in the Gator Grove to the south.',
      'Field tip: bug spray from the General Store keeps the swarm away for one night. Bring two cans. Bring three.'],
      quiz: [['What is the name of Maggie\'s favourite mosquito?', 'Steve', 'Kevin', 'Buzz', 'Gary'], ['Where does the swamp begin?', 'Where the last lamp post ends', 'At the shrine gate', 'Behind the bakery', 'Under the railway'], ['What do Glowcap mushrooms do at night?', 'Glow faintly', 'Sing', 'Walk around', 'Explode']] },
    cinnamon: { title: 'Cinnamon Secrets', by: 'Sunny of the Golden Loaf', price: 10, icon: '📙', pages: [
      'Every great cinnamon roll starts at 5 a.m., while the Golden Loaf\'s ovens are still waking up. The dough should feel "like a sleepy cheek."',
      'Secret one: brown butter, never plain. Secret two: a pinch of cardamom. Secret three: let the rolls rest for exactly as long as it takes to hum two songs.',
      'My cousin Vix is no longer allowed near the icing bag after The Incident of last spring. We do not talk about The Incident.',
      'Serve warm. Share with your neighbours. Hide one for yourself.'],
      quiz: [['What time does a great cinnamon roll start?', '5 a.m.', 'Noon', 'Midnight', '9 a.m.'], ['Which spice is secret number two?', 'Cardamom', 'Pepper', 'Nutmeg', 'Saffron'], ['Who isn\'t allowed near the icing bag?', 'Vix', 'Kira', 'Gertie', 'The Mayor']] },
    scarecrow: { title: 'The Legend of the Scarecrow', by: 'Anonymous', price: 15, icon: '📕', pages: [
      'Nobody planted the Scarecrow in the rice paddies. One misty morning she was simply there, straw hat and all, watching.',
      'Farmers say she never moves while you\'re looking. Turn your back and she is three paddies closer. Turn again and she is gone in a burst of crows.',
      'She guards the cornfield. Take an ear of corn without asking, and the paddies go very, very quiet.',
      'Some say she is lonely. Some say she is waiting for someone. Nobody has asked her. She doesn\'t talk.'],
      quiz: [['What does the Scarecrow turn into when she vanishes?', 'A burst of crows', 'Smoke', 'A pile of straw', 'A black cat'], ['What does she guard?', 'The cornfield', 'The shrine', 'The bakery', 'The station'], ['How does the Scarecrow speak?', 'She doesn\'t talk', 'In riddles', 'Only at night', 'In whispers']] },
    sinks: { title: 'Dimensional Sinks for Beginners', by: 'Dr. Penelope', price: 20, icon: '📘', pages: [
      'A dimensional sink is a hole in reality, usually found in the floors of laboratories posing as bookstores. Ours hums in B-flat.',
      'Rule one: never drop anything you want back. Rule two: Mailman Mole fell in once and loved the echo. Rule three: see rule one.',
      'Safety equipment: lab goggles (essential), a long stick (recommended), an understanding of non-Euclidean geometry (optional).',
      'The author accepts no responsibility for lost socks, lost afternoons or lost mailmen.'],
      quiz: [['What note does the sink hum in?', 'B-flat', 'C-sharp', 'A minor', 'It doesn\'t hum'], ['Who fell in once?', 'Mailman Mole', 'The Mayor', 'Box', 'Lily'], ['Which safety equipment is "essential"?', 'Lab goggles', 'A long stick', 'A helmet', 'Bug spray']] },
    hollow: { title: 'The Hollow Gang: True Tales of the Valley\'s Worst Bandits', by: 'A. Crow', price: 14, icon: '📓', pages: [
      'Rook, a crow in a feathered hat, leads the Hollow Gang from a cave on the Hollow Crags. He charges a "road toll" to anyone on the valley road after dark.',
      'His enforcer Gristle is a huge rat who, rumour says, secretly wants Sunny\'s cinnamon roll recipe.',
      'Snitch the ferret steals from pockets around the mall. He is banned from the General Store for life.',
      'Rook has one rule: never rob children or the very old. Granny Thistle once babysat him, and he still can\'t refuse her soup.'],
      quiz: [['Where is the Hollow Gang\'s cave?', 'The Hollow Crags', 'Kira\'s Den', 'The swamp', 'Under the station'], ['What does Gristle secretly want?', 'Sunny\'s cinnamon roll recipe', 'A crown', 'Kira\'s den', 'A boat'], ['Who babysat Rook?', 'Granny Thistle', 'Clucky', 'Zahra', 'Doctor Owl']] },
    civic: { title: 'Mayor Ringo\'s Guide to Civic Excellence', by: 'Mayor Ringo', price: 8, icon: '📒', pages: [
      'Welcome to Mirehollow, founded long ago by a raccoon with a dream and a very shiny bottle cap. I, Mayor Ringo, am that raccoon\'s great-great-grandson.',
      'Civic rule one: the Grapevine board is for official notices ONLY (and gossip). Civic rule two: the train always has right of way.',
      'Town events: the Sunday Potluck at the Coop, LAN Night at the Honeycomb on Fridays, and Lantern Evening at the shrine.',
      'Shiny bottle caps may be donated to Town Hall at any time. For civic reasons.'],
      quiz: [['What did Mirehollow\'s founder have?', 'A very shiny bottle cap', 'A golden goose', 'A treasure map', 'A train'], ['Who always has right of way?', 'The train', 'The Mayor', 'Kira', 'The ducks'], ['Where is the Sunday Potluck?', 'The Coop', 'The shrine', 'The bakery', 'Town Hall']] },
  };
  const toQ = (arr) => arr.map(([q, ...o]) => ({ q, o }));
  G.bookOf = (inv) => (inv && inv.shop && inv.shop.startsWith('book_') ? inv.shop.slice(5) : Object.keys(MH.BOOKS).find((k) => MH.BOOKS[k].title === (inv && inv.name)));
  G.booksBought = () => P().inv.map(G.bookOf).filter(Boolean);
  G.readBook = function (id) {
    const B = MH.BOOKS[id]; if (!B) return;
    let page = 0;
    const body = h(`<div class="book"><div class="bpage"></div><div class="row bnav"><button class="btn small ghost bprev">‹ Back</button><span class="bnum"></span><button class="btn small bnext">Next ›</button></div></div>`);
    const draw = () => {
      body.querySelector('.bpage').innerHTML = page === 0 ? `<p class="bby">by ${esc(B.by)}</p><p>${esc(B.pages[0])}</p>` : `<p>${esc(B.pages[page])}</p>`;
      body.querySelector('.bnum').textContent = `${page + 1} / ${B.pages.length}`;
      body.querySelector('.bprev').disabled = page === 0;
      body.querySelector('.bnext').textContent = page === B.pages.length - 1 ? 'Close the book' : 'Next ›';
      if (page === B.pages.length - 1) { const r = (P().booksRead = P().booksRead || {}); if (!r[id]) { r[id] = MH.absMinutes(); MH.ui.toast(`📖 Finished "${B.title}"`, 3); } }
    };
    body.querySelector('.bprev').onclick = () => { page--; draw(); };
    body.querySelector('.bnext').onclick = () => { if (page === B.pages.length - 1) MH.ui.closeModal(); else { page++; draw(); } };
    MH.ui.modal(`${B.icon} ${esc(B.title)}`, body, { cls: 'wide' });
    draw();
  };
  // the bookseller (Dr. Penelope, behind the "bookstore" counter) asks you about a book you read
  G.bookQuiz = async function (id, seller = 'penelope') {
    const B = MH.BOOKS[id]; if (!B) return null;
    const S = MH.social, p = P();
    const key = MH.state.time.day + '|quiz|' + id;
    if ((MH.state.jobsDone || {})[key]) { MH.ui.toast(`${nm(seller)}: "We already talked about that one today."`); return null; }
    (MH.state.jobsDone = MH.state.jobsDone || {})[key] = true;
    const r = await quiz({ title: `📚 ${nm(seller)} quizzes you`, sub: `"So, you read <i>${esc(B.title)}</i>? Let's see…"`, questions: toQ(B.quiz) });
    if (r.gaveUp) return r;
    if (r.win) { S.changeBond(seller, 3); S.addCoins(8); MH.ui.toast(`📚 ${nm(seller)} is impressed! (+8 🪙 store credit)`, 3.5); }
    else S.changeBond(seller, -1);
    S.addMemory(seller, r.win ? `${p.name} actually read "${B.title}" — got ${r.right}/${r.n} of my questions right!` : `${p.name} claims they read "${B.title}". Got ${r.right}/${r.n}. Hmm.`, { imp: 2 });
    return r;
  };
  // the Mayor's town trivia at Town Hall
  const TRIVIA = () => [
    [`Who runs the Golden Loaf Bakery?`, nm('sunny'), nm('vix'), nm('clucky'), nm('brenda')],
    [`What kind of animal is ${nm('kira')}?`, 'A tiger', 'A lion', 'A fox', 'A bear'],
    [`Where does ${nm('maggie')} live?`, 'The Stilt House', 'The Coop', 'Kira\'s Den', 'Vale Manor'],
    [`What does ${nm('box')} have instead of a head?`, 'A cube', 'A pumpkin', 'A cloud', 'Nothing at all'],
    ['Who runs the onsen on Crag Heights?', nm('thistle'), nm('juniper'), nm('zahra'), nm('patty')],
    ['What is the club in town called?', 'The Velvet Antler', 'The Golden Loaf', 'The Honeycomb', 'The Burrow'],
    [`What is ${nm('penelope')}'s lab disguised as?`, 'A bookstore', 'A bakery', 'A barbershop', 'A post office'],
    ['Who watches the valley from the lookout tower?', nm('juniper'), nm('marina'), nm('rook'), nm('mayor')],
    ['Which villager is a cloud?', nm('nimbus'), nm('solaris'), nm('zahra'), nm('darkborn')],
    ['Who is the town\'s lifeguard?', nm('marina'), nm('bunny'), nm('lily'), nm('gertie')],
    [`Who delivers letters to the wrong houses?`, nm('mole'), nm('sheep'), nm('owl'), nm('beaver')],
    ['What runs through town and has right of way?', 'The train', 'The river', 'The Mayor', 'The ducks'],
  ];
  G.trivia = async function () {
    const key = MH.state.time.day + '|trivia';
    if ((MH.state.jobsDone || {})[key]) { MH.ui.toast(`${nm('mayor')}: "One trivia session per day! Civic rules!"`); return; }
    (MH.state.jobsDone = MH.state.jobsDone || {})[key] = true;
    const r = await quiz({ title: '🧠 Mayor\'s Town Trivia', sub: '5 questions. 4 right wins 15 coins!', questions: MH.shuffle(toQ(TRIVIA())).slice(0, 5), pass: 0.8 });
    if (r.win) { MH.social.addCoins(15); MH.ui.toast('🧠 Trivia champion! +15 🪙', 3); MH.social.applyRep({ funny: 1 }, ['mayor']); }
    MH.social.addMemory('mayor', `${P().name} scored ${r.right}/${r.n} at my town trivia.`, { imp: 1 });
  };
  // the mall arcade: 3 coins a go, win coins back
  G.arcade = function () {
    const body = h(`<div class="menu"><p class="muted small">3 🪙 a game · win 10 🪙</p><button class="btn" data-g="connect4">🔴 Connect 4 vs the machine</button><button class="btn" data-g="memory">🃏 Memory challenge</button><button class="btn" data-g="math">🧮 Math blitz</button></div>`);
    body.querySelectorAll('[data-g]').forEach((b) => (b.onclick = async () => {
      if (P().coins < 3) { MH.ui.toast('Not enough coins.'); return; }
      MH.social.addCoins(-3);
      const r = await G.play(b.dataset.g, { skill: 3, theme: 'stars', n: 8 });
      if (r.win) { MH.social.addCoins(10); MH.ui.toast('🕹️ WINNER! +10 🪙', 3); }
    }));
    MH.ui.modal('🕹️ Arcade', body);
  };
  // fishing at the water's edge
  G.goFish = async function (placeKey) {
    const r = await fishing({ pool: G.fishAt(placeKey) });
    if (r.win && r.fish) {
      MH.social.giveItem(r.fish.name, null);
      const it = P().inv[P().inv.length - 1]; if (it) { it.icon = r.fish.icon; it.sell = r.fish.value; it.fish = true; }
      MH.ui.toast(`${r.fish.icon} Caught a ${r.fish.name}! (Sable pays ${r.fish.value} 🪙)`, 3.5);
      if (r.fish.value >= 40) MH.social.witness(`${P().name} caught a ${r.fish.name}!`, MH.player.x, MH.player.y, [], { brave: 0 }, 10);
    }
  };

  // ================================================================ challenges inside a conversation
  // (you challenge someone from the 🎲 button, or a villager proposes a game; the storyteller hears the result)
  G.offer = function (c, m) {
    const old = document.getElementById('gameCard'); if (old) old.remove();
    const card = h(`<div id="gameCard" class="questcard"><div class="qh">🎲 ${esc(G.NAMES[m.game] || m.game)}${m.stakes ? ' · ' + m.stakes + ' 🪙 on it' : ''}</div><b>${esc(nm(m.with))} wants to play!</b><div class="row"><button class="btn small ghost" data-v="0">Not now</button><button class="btn small" data-v="1">Let's play</button></div></div>`);
    card.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { card.remove(); if (b.dataset.v === '1') G.inChat(c, m); else MH.chat.sendText('*shakes head — not right now*'); }));
    document.getElementById('chat').appendChild(card);
  };
  G.hideOffer = () => { const old = document.getElementById('gameCard'); if (old) old.remove(); };
  G.inChat = async function (c, m) {
    const S = MH.social, p = P();
    const stakes = Math.min(m.stakes || 0, p.coins);
    let r;
    if (m.game === 'quiz') {
      const book = m.topic && MH.BOOKS[m.topic] ? m.topic : G.booksBought().find((b) => (p.booksRead || {})[b]);
      if (book) r = await quiz({ title: `📚 ${nm(m.with)} quizzes you`, sub: `About <i>${esc(MH.BOOKS[book].title)}</i>`, questions: toQ(MH.BOOKS[book].quiz) });
      else r = await quiz({ title: `🧠 ${nm(m.with)}'s quiz`, sub: 'Town trivia', questions: MH.shuffle(toQ(TRIVIA())).slice(0, 4) });
    } else r = await G.play(m.game, { vs: m.with, skill: G.skill(m.with), stakes, theme: m.with === 'lily' ? 'default' : m.with === 'mole' ? 'mail' : m.with === 'marina' ? 'fish' : m.with === 'zahra' ? 'stars' : 'default' });
    if (!MH.chat.active || MH.chat.convo !== c) return;
    if (stakes && !r.draw && !r.gaveUp) S.addCoins(r.win ? stakes : -stakes);
    if (stakes && r.gaveUp) S.addCoins(-stakes);
    S.changeBond(m.with, r.win ? 1 : 2); // being a good sport counts
    S.addMemory(m.with, `Played ${G.NAMES[m.game]} with ${p.name}${stakes ? ' for ' + stakes + ' coins' : ''} — ${r.gaveUp ? 'they gave up' : r.draw ? 'a draw' : r.win ? 'they won' : 'I won'}.`, { imp: 1 });
    const txt = `MINIGAME RESULT: ${p.name} and ${nm(m.with)} played ${G.NAMES[m.game]}${stakes ? ' for ' + stakes + ' coins' : ''} — ${r.gaveUp ? p.name + ' gave up' : r.draw ? 'it was a draw' : r.win ? p.name + ' won' : nm(m.with) + ' won'}${r.right != null ? ' (' + r.right + '/' + r.n + ' right)' : ''}. React in character.`;
    c.lines.push({ who: 'system', text: txt });
    S.log({ kind: 'sys', text: '🎲 ' + txt.replace(/^MINIGAME RESULT: /, '').replace(/ React in character\.$/, ''), convo: c.id });
    if (!MH.chat.waiting) MH.chat.letThemTalk();
  };
  // books this villager sold you (for the storyteller)
  G.charNote = function (id) {
    if (id !== 'penelope' || !MH.state) return '';
    const b = G.booksBought(); if (!b.length) return '';
    return 'Sold the player these books at her "bookstore": ' + b.map((k) => `"${MH.BOOKS[k].title}" (${(P().booksRead || {})[k] ? 'they read it' : 'not read yet'} — about: ${MH.BOOKS[k].pages[0].slice(0, 90)}…)`).join('; ') + '. She may quiz them ("minigame" game "quiz", topic = the book key: ' + b.join(', ') + ').';
  };
})(window.MH);
