// Mirehollow — jobs: short shifts around town that pay coins (deliveries, chores, minigames,
// and Maggie's very questionable "blood drive"). One job at a time, each job once a day.
'use strict';
(function (MH) {
  const T = MH.TILE;
  const jobs = (MH.jobs = {});
  const P = () => MH.state.player;

  MH.JOBS = [
    { id: 'bakery_delivery', at: 'bakery', boss: 'sunny', icon: '🥖', title: 'Bread delivery run', desc: 'Sunny needs warm loaves taken to 3 people around town before they go cold.', pay: 35, mins: 150, make: () => deliver(3, 'a warm loaf from the Golden Loaf') },
    { id: 'bakery_knead', at: 'bakery', boss: 'sunny', icon: '🫓', title: 'Knead the dough', desc: 'Help knead tomorrow\'s bread. Tap when the dough is in the sweet spot.', pay: 20, mins: 30, make: () => [game('knead', 6)] },
    { id: 'gym_wipe', at: 'gym', boss: 'box', icon: '🧽', title: 'Wipe down the machines', desc: 'Box wants every machine spotless. Wipe down 4 spots.', pay: 18, mins: 40, make: () => spots('gym', 4, 'Wipe down here') },
    { id: 'gym_spot', at: 'gym', boss: 'bunny', icon: '🏋️', title: 'Spot a lifter', desc: 'Bunny needs a spotter. Help lift when the bar hits the green.', pay: 25, mins: 30, make: () => [game('spot', 6)] },
    { id: 'store_restock', at: 'store', boss: 'sable', icon: '📦', title: 'Restock the shelves', desc: 'Sable points at the boxes. Then at the shelves. Then at you. Restock 4 spots.', pay: 22, mins: 45, make: () => spots('store', 4, 'Restock here') },
    { id: 'club_drinks', at: 'club', boss: 'dionne', icon: '🍹', title: 'Mix drinks at the bar', desc: 'Pour when the shaker is in the zone. The dance floor is thirsty.', pay: 30, mins: 30, make: () => [game('mix', 7)] },
    { id: 'lab_subject', at: 'lab', boss: 'penelope', icon: '🧪', title: 'Be a test subject', desc: 'Dr. Penelope needs a volunteer. Hold very, very still. Side effects are "temporary".', pay: 40, mins: 25, make: () => [game('still', 5)] },
    { id: 'clinic_meds', at: 'clinic', boss: 'owl', icon: '💊', title: 'Deliver medicine', desc: 'Doctor Owl has prescriptions for 2 patients who can\'t come in.', pay: 30, mins: 150, make: () => deliver(2, 'a little bag of medicine from Doctor Owl') },
    { id: 'barber_sweep', at: 'barber', boss: 'sheep', icon: '🧹', title: 'Sweep up the hair', desc: 'So. Much. Hair. Sweep up 4 piles.', pay: 15, mins: 30, make: () => spots('barber', 4, 'Sweep here') },
    { id: 'mayor_litter', at: 'townhall', boss: 'mayor', icon: '🗑️', title: 'Litter patrol', desc: 'The Mayor wants the square and the park tidy (he keeps the shiny bits). Pick up 6 pieces of litter.', pay: 30, mins: 150, make: () => litter(6) },
    { id: 'post_mail', at: 'postoffice', boss: 'mole', icon: '✉️', title: 'Deliver the mail', desc: 'Mailman Mole\'s bag is too heavy today. Deliver 3 letters — to the RIGHT people.', pay: 28, mins: 150, hours: [8, 19], make: () => deliver(3, 'a letter') },
    { id: 'maggie_blood', at: 'stilthouse', boss: 'maggie', icon: '🩸', title: 'The Blood Drive', desc: 'Maggie wants "samples". Sneak up on 3 villagers and take a tiny sip with her special straw. Sleeping or distracted ones are easiest; getting caught is… awkward.', pay: 45, mins: 180, hours: [16, 3], shady: true, make: () => sneak(3) },
  ];
  const JOB = {}; MH.JOBS.forEach((j) => (JOB[j.id] = j));
  const placeName = (at) => (MH.world.rooms[at] ? MH.world.rooms[at].name.replace(/^inside /, '') : (MH.world.buildingById[at] || {}).name || at);

  // ---------------------------------------------------------------- step makers
  const game = (kind, rounds) => ({ type: 'game', game: kind, rounds });
  function deliver(n, item) {
    const pl = MH.player;
    const cand = MH.npcs.filter((e) => !e.hidden && !e.ch.visitor && !e.following && e.id !== 'scarecrow' && !MH.roomOf(e) && !e.guest)
      .map((e) => ({ e, d: MH.distTiles(e, pl) })).filter((x) => x.d > 8 && x.d < 80).sort((a, b) => a.d - b.d).slice(0, 14);
    return MH.shuffle(cand).slice(0, n).map(({ e }) => ({ type: 'deliver', npc: e.id, item }));
  }
  function spots(room, n, label) {
    const R = MH.world.rooms[room], out = [], used = new Set();
    for (let k = 0; k < 200 && out.length < n; k++) {
      const tx = MH.randi(R.x0 + 1, R.x1 - 1), ty = MH.randi(R.y0 + 2, R.y1 - 2);
      if (!MH.world.walkable(tx, ty) || used.has(tx + ',' + ty) || (Math.abs(tx - R.doorX - 0.5) < 2 && ty >= R.y1 - 2)) continue;
      if ([...used].some((u) => { const [a, b] = u.split(',').map(Number); return Math.abs(a - tx) + Math.abs(b - ty) < 3; })) continue;
      used.add(tx + ',' + ty); out.push({ type: 'spot', tx, ty, label });
    }
    return out;
  }
  function litter(n) {
    const out = [];
    for (let k = 0; k < 400 && out.length < n; k++) {
      const L = MH.world.locations[MH.pick(['square', 'square', 'park', 'well', 'station'])];
      const tx = MH.randi(L.r[0], L.r[2]), ty = MH.randi(L.r[1], L.r[3]);
      if (!MH.world.walkable(tx, ty) || out.some((s) => Math.abs(s.tx - tx) + Math.abs(s.ty - ty) < 4)) continue;
      out.push({ type: 'spot', tx, ty, label: 'Pick up the litter', litter: true });
    }
    return out;
  }
  const sneak = (n) => Array.from({ length: n }, () => ({ type: 'sneak' }));

  // ---------------------------------------------------------------- availability
  const inHours = (h, a, b) => (a <= b ? h >= a && h < b : h >= a || h < b);
  jobs.listAt = (at) => MH.JOBS.filter((j) => j.at === at);
  jobs.doneToday = (id) => !!(MH.state.jobsDone || {})[MH.state.time.day + '|' + id];
  jobs.why = function (j) {
    if (jobs.doneToday(j.id)) return 'Already done today — come back tomorrow.';
    const R = MH.world.rooms[j.at];
    if (R && !MH.world.isOpen(R)) return `Closed right now (opens ${R.open[0]}:00).`;
    if (!R && j.hours && !inHours(MH.hour(), j.hours[0], j.hours[1])) return `Only between ${j.hours[0]}:00 and ${j.hours[1]}:00.`;
    if (MH.state.job) return 'You\'re already on a job.';
    return '';
  };
  jobs.active = () => (MH.state && MH.state.job) || null;
  jobs.progress = (job) => { const real = job.steps.filter((s) => s.type !== 'game'); return { done: real.filter((s) => s.done).length, n: real.length }; };

  jobs.start = function (id) {
    const j = JOB[id]; if (!j) return;
    const why = jobs.why(j); if (why) { MH.ui.toast(why); return; }
    const steps = j.make();
    if (!steps.length) { MH.ui.toast('There\'s nobody around to deliver to right now. Try later.'); return; }
    const job = { id, title: j.title, icon: j.icon, boss: j.boss, steps, started: MH.absMinutes(), deadline: MH.absMinutes() + j.mins, score: 1, sampled: [] };
    MH.state.job = job;
    steps.forEach((s) => { if (s.litter) addLitter(s); });
    MH.ui.closeModal();
    MH.ui.toast(`${j.icon} Job started: ${j.title}`, 3);
    MH.social.addMemory(j.boss, `${P().name} took a job for me: ${j.title.toLowerCase()}.`, { imp: 1, kind: 'self' });
    const g = steps.find((s) => s.type === 'game');
    if (g) setTimeout(() => jobs.playGame(g), 300);
    jobs.updatePill();
  };
  jobs.cancel = function () {
    const job = jobs.active(); if (!job) return;
    clearLitter(job);
    MH.state.job = null;
    (MH.state.jobsDone = MH.state.jobsDone || {})[MH.state.time.day + '|' + job.id] = true;
    MH.social.addMemory(job.boss, `${P().name} quit the job I gave them (${job.title.toLowerCase()}) halfway.`, { imp: 2 });
    MH.social.changeBond(job.boss, -2);
    MH.ui.toast('You quit the job.', 2.5);
    jobs.updatePill();
  };
  function finish(ok) {
    const job = jobs.active(); if (!job) return;
    const j = JOB[job.id], p = P();
    clearLitter(job);
    MH.state.job = null;
    (MH.state.jobsDone = MH.state.jobsDone || {})[MH.state.time.day + '|' + job.id] = true;
    const boss = MH.CHAR[job.boss] ? MH.CHAR[job.boss].name : 'your boss';
    if (ok) {
      const pay = Math.max(1, Math.round(j.pay * (0.4 + 0.6 * job.score)));
      MH.social.addCoins(pay);
      MH.social.changeBond(job.boss, job.score >= 0.8 ? 3 : 1);
      MH.social.addMemory(job.boss, job.score >= 0.8 ? `${p.name} did a great job for me: ${j.title.toLowerCase()}.` : `${p.name} worked for me (${j.title.toLowerCase()}). Not their best work, honestly.`, { imp: 2, kind: 'self' });
      MH.social.applyRep(j.shady ? { chaotic: 1 } : { kind: 1, generous: job.score >= 0.8 ? 1 : 0 }, [job.boss]);
      MH.social.grapevine(j.shady ? `${p.name} has been running errands for Maggie. Nobody knows exactly what kind.` : `${p.name} did a shift for ${boss} (${j.title.toLowerCase()}).`, [job.boss]);
      MH.ui.toast(`💼 Job done! +${pay} 🪙${job.score < 1 ? ` (${Math.round(job.score * 100)}%)` : ''}`, 4);
      if (MH.player) MH.render.burst(MH.player.x, MH.player.y - 24, 'sparkle', 14);
    } else {
      MH.social.changeBond(job.boss, -2);
      MH.social.addMemory(job.boss, `${p.name} didn't finish the job I gave them (${j.title.toLowerCase()}) in time.`, { imp: 2 });
      MH.ui.toast(`⏰ Out of time: ${j.title}. ${boss} is not thrilled.`, 4);
    }
    jobs.updatePill();
  }

  // litter = little temporary props on the ground
  function addLitter(s) {
    const pr = MH.world.prop('cap', s.tx, s.ty, { flat: true, solid: false, temp: true, litter: true });
    MH.render.addProp(pr);
    Object.defineProperty(s, 'prop', { value: pr, writable: true, configurable: true, enumerable: false }); // not saved
  }
  function removeProp(pr) { if (!pr) return; MH.render.removeProp(pr); const i = MH.world.props.indexOf(pr); if (i >= 0) MH.world.props.splice(i, 1); }
  function clearLitter(job) { job.steps.forEach((s) => { removeProp(s.prop); s.prop = null; }); }
  // after loading a save, put the litter back
  jobs.restore = function () {
    MH.world.props.filter((pr) => pr.litter).forEach(removeProp);
    const job = jobs.active(); if (job) job.steps.forEach((s) => { if (s.litter && !s.done) addLitter(s); });
    jobs.updatePill();
  };

  // ---------------------------------------------------------------- interaction
  jobs.target = function () {
    const job = jobs.active(); if (!job || (MH.chat && MH.chat.active)) return null;
    const pl = MH.player;
    for (const s of job.steps) {
      if (s.done) continue;
      if (s.type === 'spot' && Math.hypot(s.tx * T + 8 - pl.x, s.ty * T + 10 - pl.y) / T < 1.25) return { kind: 'job', step: s, x: s.tx * T + 8, y: s.ty * T + 6, label: `${job.icon} ${s.label}` };
      if (s.type === 'deliver') { const e = MH.npcById[s.npc]; if (e && !e.hidden && MH.distTiles(e, pl) < 2.1) return { kind: 'job', step: s, e, label: `${job.icon} Deliver to ${e.ch.name}` }; }
    }
    if (job.steps.some((s) => s.type === 'sneak' && !s.done)) {
      let best = null, bd = 1.8;
      for (const e of MH.npcs) {
        if (e.hidden || e.id === job.boss || job.sampled.includes(e.id) || e.ch.visitor || e.id === 'scarecrow') continue;
        const d = MH.distTiles(e, pl); if (d < bd) { bd = d; best = e; }
      }
      if (best) return { kind: 'job', step: job.steps.find((s) => s.type === 'sneak' && !s.done), e: best, label: `🩸 Sneak a sample from ${best.ch.name}` };
    }
    return null;
  };
  jobs.act = function (t) {
    const job = jobs.active(); if (!job || !t.step) return;
    const s = t.step, p = P();
    if (s.type === 'spot') {
      s.done = true; removeProp(s.prop); s.prop = null;
      MH.render.burst(s.tx * T + 8, s.ty * T + 6, 'sparkle', 8);
      const pr = jobs.progress(job); MH.ui.toast(`${job.icon} ${pr.done}/${pr.n}`, 1.5);
      if (s.litter && Math.random() < 0.15) { MH.social.giveItem('Shiny Bottle Cap', null); MH.ui.toast('⚙️ Found a shiny bottle cap. The Mayor would want it…', 3); }
    } else if (s.type === 'deliver') {
      const e = t.e; s.done = true;
      e.face(MH.player.x, MH.player.y); e.showEmote('heart', 2);
      MH.chat.showBubble(e, e.ch.mute ? '*accepts it with a grateful nod*' : MH.pick(['Oh! For me? Thank you!', 'Ooh, perfect timing!', 'Huh? Oh — thanks, newcomer!', '*sniffs it* Lovely.', 'You\'re working for them now? Cute.']), { dur: 3 });
      MH.social.addMemory(e.id, `${p.name} dropped off ${s.item} for me.`, { imp: 1, kind: 'self' });
      MH.social.changeBond(e.id, 1);
      const pr = jobs.progress(job); MH.ui.toast(`${job.icon} Delivered ${pr.done}/${pr.n}`, 1.8);
    } else if (s.type === 'sneak') {
      const e = t.e, pl = MH.player;
      const dx = pl.x - e.x, dy = pl.y - e.y;
      const facing = (e.dir === 'left' && dx < -3) || (e.dir === 'right' && dx > 3) || (e.dir === 'up' && dy < -3) || (e.dir === 'down' && dy > 3);
      let chance = e.asleep ? 0.95 : e.busy ? 0.65 : 0.4;
      chance += facing ? -0.15 : 0.3;
      if (MH.social.isTough(e.id)) chance -= 0.1;
      job.sampled.push(e.id);
      if (Math.random() < chance) {
        s.done = true;
        MH.render.burst(e.x, e.y - 20, 'heart', 3);
        if (e.asleep) MH.chat.showBubble(e, '*mumbles in their sleep* …mosquito…', { dur: 2.5 });
        const pr = jobs.progress(job); MH.ui.toast(`🩸 Sample collected! ${pr.done}/${pr.n}`, 2);
      } else {
        e.asleep = false; e.face(pl.x, pl.y); e.showEmote('anger', 3);
        MH.chat.showBubble(e, e.ch.mute ? '*whips around and glares*' : MH.pick(['HEY! Did you just— EW!', 'Is that a STRAW?!', 'Get away from my neck!', 'Are you… working for MAGGIE?!']), { dur: 3.2 });
        MH.social.changeBond(e.id, -4);
        MH.social.addMemory(e.id, `${p.name} tried to sneak a "blood sample" from me with a straw. For Maggie?! Creepy.`, { imp: 3 });
        MH.social.witness(`${p.name} got caught trying to sip ${e.ch.name}'s blood with a straw (for Maggie).`, e.x, e.y, [e.id], { chaotic: 2, rude: 1 }, 8);
        MH.ui.toast(`Caught! ${e.ch.name} is not amused. Try someone else.`, 3);
      }
    }
    checkDone();
  };
  function checkDone() { const job = jobs.active(); if (job && job.steps.every((s) => s.done)) setTimeout(() => finish(true), 400); jobs.updatePill(); }

  jobs.tick = function () {
    const job = jobs.active(); if (!job) return;
    if (MH.absMinutes() > job.deadline) { finish(false); return; }
    // deliveries to someone who went indoors / left town: pick someone else
    job.steps.forEach((s) => {
      if (s.type !== 'deliver' || s.done) return;
      const e = MH.npcById[s.npc];
      if (e && !e.hidden) { s.hiddenFor = 0; return; }
      s.hiddenFor = (s.hiddenFor || 0) + 1;
      if (s.hiddenFor > 20) {
        const used = job.steps.map((x) => x.npc);
        const alt = deliver(6, s.item).find((x) => !used.includes(x.npc));
        if (alt) { const old = MH.CHAR[s.npc]; s.npc = alt.npc; s.hiddenFor = 0; MH.ui.toast(`${old ? old.name : 'They'} went indoors — deliver to ${MH.CHAR[s.npc].name} instead.`, 3.5); }
      }
    });
    jobs.updatePill();
  };
  jobs.sceneText = function () {
    const job = jobs.active(); if (!job) return '';
    const pr = jobs.progress(job);
    return `The player is in the middle of a job: "${job.title}" for ${MH.CHAR[job.boss] ? MH.CHAR[job.boss].name : job.boss}${pr.n ? ` (${pr.done}/${pr.n} done)` : ''}.` + (P().labHair ? ' Their hair is temporarily bright green (a lab accident).' : '');
  };

  // ---------------------------------------------------------------- HUD pill + off-screen arrow + map markers
  jobs.updatePill = function () {
    const el = document.getElementById('jobPill'); if (!el || !MH.state) return;
    const job = jobs.active();
    el.classList.toggle('hidden', !job);
    if (!job) return;
    const pr = jobs.progress(job), left = Math.max(0, Math.round(job.deadline - MH.absMinutes()));
    el.textContent = `${job.icon} ${job.title}${pr.n ? ' · ' + pr.done + '/' + pr.n : ''} · ${left >= 60 ? Math.floor(left / 60) + 'h ' : ''}${left % 60}m`;
  };
  function targetsOf(job) {
    const out = [];
    job.steps.forEach((s) => {
      if (s.done) return;
      if (s.type === 'spot') out.push({ x: s.tx * T + 8, y: s.ty * T - 4 });
      if (s.type === 'deliver') { const e = MH.npcById[s.npc]; if (e && !e.hidden) out.push({ x: e.x, y: MH.render.headTop(e) - 14, e }); }
    });
    return out;
  }
  jobs.drawWorld = function (ctx, t) {
    const job = jobs.active(); if (!job || MH.titleMode) return;
    const room = MH.roomOf(MH.player);
    ctx.save();
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    targetsOf(job).forEach((m) => {
      if (m.e ? MH.roomOf(m.e) !== room : MH.world.roomAt(Math.floor(m.x / T), Math.floor((m.y + 10) / T)) !== (room ? MH.world.rooms[room] : null)) return;
      const bob = Math.sin(t * 5 + m.x) * 2;
      ctx.fillStyle = 'rgba(255,214,64,0.95)'; ctx.strokeStyle = '#5a3a10'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(m.x, m.y + bob, 6.5, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5a3a10'; ctx.fillText(m.e ? '✉' : '!', m.x, m.y + bob + 0.5);
    });
    ctx.restore();
    // arrow toward the nearest target when it's off-screen
    const arrow = document.getElementById('jobArrow'); if (!arrow) return;
    const pl = MH.player;
    const tg = targetsOf(job).filter((m) => !m.e || MH.roomOf(m.e) === room).sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y))[0];
    if (!tg || (MH.chat && MH.chat.active)) { arrow.style.display = 'none'; return; }
    const sp = MH.render.worldToScreen(tg.x, tg.y), W = window.innerWidth, H = window.innerHeight;
    if (sp.x > 20 && sp.x < W - 20 && sp.y > 70 && sp.y < H - 120) { arrow.style.display = 'none'; return; }
    const cx = W / 2, cy = H / 2, ang = Math.atan2(sp.y - cy, sp.x - cx);
    const k = Math.min((W / 2 - 34) / Math.abs(Math.cos(ang) || 1e-6), (H / 2 - 110) / Math.abs(Math.sin(ang) || 1e-6));
    arrow.style.display = 'block';
    arrow.style.transform = `translate(${Math.round(cx + Math.cos(ang) * k - 18)}px, ${Math.round(cy + Math.sin(ang) * k - 18)}px) rotate(${ang}rad)`;
  };

  // ---------------------------------------------------------------- timing minigame
  const GAMES = {
    knead: { title: '🫓 Knead the dough', tip: 'Tap when the dough is in the golden zone!', hit: ['Perfect knead!', 'Nice and fluffy!', 'Sunny would be proud!'], miss: ['Too lumpy…', 'Flour everywhere!', 'Oops, overworked.'] },
    spot: { title: '🏋️ Spot the lifter', tip: 'Push the bar up when it reaches the green!', hit: ['LIFT! 💪', 'Great spot!', 'Gains!'], miss: ['Wobbly!', 'Bunny strains…', 'Too late!'] },
    mix: { title: '🍹 Mix the drinks', tip: 'Pour when the shaker is in the zone!', hit: ['Cheers! 🍸', 'Perfect pour!', 'The crowd goes wild!'], miss: ['Spilled!', 'Too much ice…', 'That\'s… a new colour.'] },
    still: { title: '🧪 Hold still…', tip: 'Tap exactly when the needle is in the safe zone!', hit: ['Readings stable.', 'Fascinating!', '"Hold that face."'], miss: ['*zap*', 'Something sparked.', '"Interesting. Don\'t move."'] },
  };
  jobs.playGame = function (step) {
    const job = jobs.active(); if (!job) return;
    const G = GAMES[step.game];
    const h = (html) => { const t2 = document.createElement('template'); t2.innerHTML = html.trim(); return t2.content.firstElementChild; };
    const body = h(`<div class="mg"><p class="mgtip">${G.tip}</p><div class="mgbar"><div class="mgzone"></div><div class="mgneedle"></div></div><div class="mgmsg">&nbsp;</div><div class="mgdots"></div><button class="btn big mgtap">TAP!</button></div>`);
    MH.ui.modal(G.title, body, { noClose: false, keep: true });
    const zone = body.querySelector('.mgzone'), needle = body.querySelector('.mgneedle'), msg = body.querySelector('.mgmsg'), dots = body.querySelector('.mgdots');
    let round = 0, hits = 0, pos = 0, dir = 1, z0 = 0, zw = 0, last = performance.now(), locked = false, over = false;
    const newRound = () => { zw = Math.max(0.1, 0.24 - round * 0.022); z0 = MH.rand(0.05, 0.95 - zw); zone.style.left = (z0 * 100) + '%'; zone.style.width = (zw * 100) + '%'; locked = false; };
    for (let i = 0; i < step.rounds; i++) dots.appendChild(h('<i></i>'));
    newRound();
    const speed = () => 0.65 + round * 0.13;
    const frame = (now) => {
      if (over) return;
      if (!document.body.contains(body)) { end(true); return; } // closed early
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!locked) { pos += dir * speed() * dt; if (pos > 1) { pos = 1; dir = -1; } if (pos < 0) { pos = 0; dir = 1; } }
      needle.style.left = (pos * 100) + '%';
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const tap = () => {
      if (locked || over) return;
      locked = true;
      const ok = pos >= z0 - 0.015 && pos <= z0 + zw + 0.015;
      if (ok) hits++;
      dots.children[round].className = ok ? 'hit' : 'miss';
      msg.textContent = MH.pick(ok ? G.hit : G.miss); msg.className = 'mgmsg ' + (ok ? 'ok' : 'bad');
      round++;
      if (round >= step.rounds) setTimeout(() => end(false), 650); else setTimeout(newRound, 550);
    };
    body.querySelector('.mgtap').onclick = tap;
    body.querySelector('.mgbar').onpointerdown = tap;
    function end(early) {
      if (over) return; over = true;
      step.done = true;
      const j = jobs.active(); if (!j) return;
      j.score = MH.clamp(hits / step.rounds, 0, 1);
      if (step.game === 'still' && Math.random() < 0.5) { const p = P(); p.look = p.look || {}; if (!p.labHair) p.labHair = p.look.hair || '#5a3a2a'; p.look.hair = '#5ae05a'; MH.refreshPlayerSprite(); setTimeout(() => MH.ui.toast('🧪 Side effect: your hair is bright green. (Wears off tomorrow.)', 4), 900); }
      if (!early) MH.ui.closeModal();
      checkDone();
    }
  };

  // ---------------------------------------------------------------- UI: job board for a place
  MH.ui.openJobs = function (at, back) {
    MH.ui.modal(at ? '💼 Work at ' + MH.esc(placeName(at)) : '💼 Jobs in town', jobs.boardEl(at, () => MH.ui.openJobs(at, back)), { onClose: back || null });
  };
  jobs.boardEl = function (at, refresh) {
    const h = (html) => { const t2 = document.createElement('template'); t2.innerHTML = html.trim(); return t2.content.firstElementChild; };
    const list = at ? jobs.listAt(at) : MH.JOBS;
    const body = h(`<div class="jobs">${jobs.active() ? `<div class="jobnow">Current job: <b>${MH.esc(jobs.active().icon + ' ' + jobs.active().title)}</b> <button class="btn small danger" id="jbQuit">Quit job</button></div>` : ''}<div class="joblist"></div><p class="muted small">Pay goes up with how well you do. One job at a time; each job once a day.</p></div>`);
    const jl = body.querySelector('.joblist');
    list.forEach((j) => {
      const why = jobs.why(j);
      const row = h(`<div class="jrow"><div class="jhead"><b>${j.icon} ${MH.esc(j.title)}</b><span class="pay">up to ${j.pay} 🪙</span></div><small>${MH.esc(j.desc)}</small><small class="muted">${MH.esc((MH.CHAR[j.boss] || {}).name || '')} · ${MH.esc(placeName(j.at))} · ${j.mins >= 60 ? Math.round(j.mins / 60 * 10) / 10 + 'h' : j.mins + ' min'} to finish</small>${at ? `<button class="btn small" ${why ? 'disabled' : ''}>${why ? MH.esc(why) : 'Take the job'}</button>` : `<small class="where">${why ? MH.esc(why) : 'Go to ' + MH.esc(placeName(j.at)) + ' to take it.'}</small>`}</div>`);
      const b = row.querySelector('button'); if (b) b.onclick = () => jobs.start(j.id);
      jl.appendChild(row);
    });
    const q = body.querySelector('#jbQuit');
    if (q) q.onclick = async () => { if (await MH.ui.confirm('Quit your current job? Your boss will remember.', 'Quit', 'Keep working')) { jobs.cancel(); refresh && refresh(); } };
    return body;
  };
})(window.MH);
