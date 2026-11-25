// Mirehollow — health & fights.
// The player has HP. Fights are a reflex minigame (tap the circles when the ring closes, drag the sliders),
// harder the tougher the opponent. Fights can be friendly spars or the real thing; villagers fight each
// other too. At 0 HP you black out: robbed, rescued to the clinic, or — rarely — you die and the day restarts.
'use strict';
(function (MH) {
  const F = (MH.fight = { active: null });
  const P = () => MH.state.player;
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const nm = (id) => (MH.CHAR[id] ? MH.CHAR[id].name : id);

  // ---------------------------------------------------------------- weapons
  // dmg = damage multiplier, lethal = can kill (raises the stakes for whoever it's used on)
  MH.WEAPONS = {
    fists: { name: 'bare fists', dmg: 1 },
    pan: { name: 'Frying pan', dmg: 1.35, icon: '🍳' },
    bat: { name: 'Baseball bat', dmg: 1.6, icon: '🏏' },
    knuckles: { name: 'Brass knuckles', dmg: 1.5, icon: '🥊' },
    crowbar: { name: 'Crowbar', dmg: 1.8, icon: '🔧', lethal: true },
    knife: { name: 'Knife', dmg: 2, icon: '🔪', lethal: true },
    baton: { name: 'Stun baton', dmg: 1.75, icon: '⚡' },
    cane: { name: 'Silver-tipped cane', dmg: 1.4 },
    bhsniper: { name: 'Black Hole Sniper 3000', dmg: 99, icon: '🕳️', special: true },
  };
  F.weaponOf = (who) => {
    if (who === 'player') { const w = P().weapon; return w && MH.WEAPONS[w] ? w : 'fists'; }
    const ch = MH.CHAR[who]; return (ch && ch.weapon && MH.WEAPONS[ch.weapon]) ? ch.weapon : 'fists';
  };
  F.power = (id) => (MH.CHAR[id] ? MH.CHAR[id].power || 2 : 1);
  F.DIFF = ['', 'Easy', 'Normal', 'Hard', 'Very hard', 'VERY HARD ☠️'];

  // ---------------------------------------------------------------- health
  F.maxHp = () => 100;
  F.hp = () => (P().hp == null ? (P().hp = 100) : P().hp);
  F.heal = function (n, quiet) {
    const p = P(); const before = F.hp();
    p.hp = MH.clamp(before + n, 0, F.maxHp());
    if (!quiet && p.hp > before) MH.ui.toast(`❤️ +${Math.round(p.hp - before)} HP`, 1.8);
    F.updateHud();
  };
  F.damage = function (n, ctx) {
    const p = P();
    p.hp = MH.clamp(F.hp() - n, 0, F.maxHp());
    F.updateHud();
    if (p.hp <= 0 && !(ctx && ctx.inFight)) F.knockout(ctx || {});
  };
  F.updateHud = function () {
    const el = document.getElementById('hpBar'); if (!el || !MH.state) return;
    const hp = Math.round(F.hp());
    el.querySelector('i').style.width = hp + '%';
    el.querySelector('i').style.background = hp > 60 ? '#6ad06a' : hp > 30 ? '#f0c040' : '#e0524a';
    el.querySelector('b').textContent = hp;
    el.classList.toggle('low', hp <= 30);
  };
  // slow regeneration; called about once a second of real time
  F.tick = function () {
    if (!MH.state || F.active) return;
    const p = P(), now = MH.absMinutes();
    if (p.hpT == null) p.hpT = now;
    const dm = now - p.hpT;
    if (dm >= 6) { p.hpT = now; if (F.hp() < F.maxHp()) F.heal(Math.floor(dm / 6), true); }
    F.updateHud();
  };

  // ---------------------------------------------------------------- blacking out
  F.knockout = function (ctx) {
    if (F._ko) return; F._ko = true;
    MH.ui.modalOpen = true; MH.fading = true; // freeze the world while you're out cold
    const p = P(), by = ctx.by, byCh = by && MH.CHAR[by];
    if (MH.chat.active) MH.chat.end();
    const bandit = by && MH.CHAR[by] && (MH.CHAR[by].bandit || MH.CHAR[by].villain);
    const lethal = ctx.lethal || (by && MH.WEAPONS[F.weaponOf(by)].lethal && ctx.kind !== 'spar');
    const hostile = by ? MH.social.attitude(by) <= -50 : false;
    let die = ctx.kind === 'spar' ? 0 : (lethal ? 0.15 : 0.04) + (hostile ? 0.06 : 0);
    let rob = bandit || ctx.kind === 'mugging' ? 0.75 : 0.15;
    const r = Math.random();
    const outcome = r < die ? 'die' : r < die + rob * (1 - die) ? 'robbed' : 'rescued';
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    const card = h(`<div class="kocard"><h2>You lost consciousness…</h2><p class="kowhy"></p><button class="btn big">Continue</button></div>`);
    let text = '';
    const where = MH.world.placeAt(MH.player.x, MH.player.y).name;
    if (outcome === 'die') {
      text = `Everything goes cold and quiet${byCh ? ` — ${byCh.name} went too far` : ''}. <b>You died.</b><br><small>The day starts over from this morning.</small>`;
    } else if (outcome === 'robbed') {
      const lost = Math.round(p.coins * MH.rand(0.5, 1));
      const items = p.inv.filter((x) => !x.quest);
      const took = MH.shuffle(items.slice()).slice(0, Math.min(items.length, MH.randi(1, 3)));
      p.coins -= lost; took.forEach((x) => p.inv.splice(p.inv.indexOf(x), 1));
      p.hp = 25;
      MH.state.time.minutes += MH.randi(120, 240); if (MH.state.time.minutes >= 1440) { MH.state.time.minutes -= 1440; MH.state.time.day++; MH.sim.newDay(); }
      text = `You wake up near ${where}, hours later, head pounding. Your pockets are lighter: <b>−${lost} coins</b>${took.length ? ' and your ' + took.map((x) => x.name).join(', ') : ''}.${byCh ? ` ${byCh.name} is long gone.` : ''}`;
      if (by) MH.social.addMemory(by, `Knocked ${p.name} out and took ${lost} coins${took.length ? ' and their ' + took.map((x) => x.name).join(', ') : ''}. Easy pickings.`, { imp: 3 });
      MH.social.grapevine(`${p.name} was found knocked out near ${where}${byCh ? ' — people say ' + byCh.name + ' did it' : ''}.`, by ? [by] : []);
      const s = MH.world.nearestWalkable(MH.player.tile().tx, MH.player.tile().ty + 1); MH.player.setTile(s.tx, s.ty);
    } else {
      // rescued: the friendliest villager nearby (or Doctor Owl) carries you to the clinic
      const friends = MH.npcs.filter((e) => !e.hidden && !e.folk && MH.distTiles(e, MH.player) < 30 && e.id !== by && MH.social.attitude(e.id) > 0).sort((a, b) => MH.social.attitude(b.id) - MH.social.attitude(a.id));
      const hero = friends[0] ? friends[0].id : 'owl';
      const fee = Math.min(p.coins, 15);
      p.coins -= fee; p.hp = 60;
      MH.state.time.minutes += MH.randi(90, 180); if (MH.state.time.minutes >= 1440) { MH.state.time.minutes -= 1440; MH.state.time.day++; MH.sim.newDay(); }
      const R = MH.world.rooms.clinic; MH.player.setTile(R.x0 + 3, R.y0 + 4);
      text = `You wake up in a clinic bed. ${hero === 'owl' ? 'Doctor Owl found you' : nm(hero) + ' carried you all the way here'}${by ? ` after ${nm(by)} knocked you out` : ''}. Doctor Owl patched you up${fee ? ` (−${fee} coins)` : ''}. <i>"Hoo. Rest."</i>`;
      if (hero !== 'owl') { MH.social.addMemory(hero, `Found ${p.name} knocked out near ${where} and carried them to the clinic.`, { imp: 3 }); MH.social.changeBond(hero, 3); }
      MH.social.grapevine(`${p.name} ended up in the clinic${by ? ' after a run-in with ' + nm(by) : ''}.`, [hero]);
    }
    card.querySelector('.kowhy').innerHTML = text;
    setTimeout(() => {
      document.getElementById('game').appendChild(card);
      card.querySelector('button').onclick = () => {
        card.remove(); F._ko = false; MH.ui.modalOpen = false; MH.fading = false;
        if (outcome === 'die') {
          if (!(MH.dayReset && MH.dayReset.rewind())) { p.hp = 100; p.coins = Math.floor(p.coins / 2); MH.sim.goInside && MH.sim.goInside(); }
          else MH.state.player.hp = 100;
          MH.ui.toast('☀️ A new chance. The day starts over.', 4);
        }
        MH.render.snap(); fade.classList.remove('on'); F.updateHud(); MH.ui.updateHud(); MH.save();
      };
    }, 700);
  };

  // ---------------------------------------------------------------- the fight minigame
  // opts: { opp, kind: 'spar'|'brawl'|'mugging', starter: 'player'|'npc', why, onEnd(result) }
  F.start = function (opts) {
    if (F.active || !MH.CHAR[opts.opp]) return;
    const opp = opts.opp, ch = MH.CHAR[opp], pow = MH.clamp(F.power(opp), 1, 5);
    const spar = opts.kind === 'spar';
    const pw = F.weaponOf('player'), ow = F.weaponOf(opp);
    const st = {
      opts, opp, pow, spar, pw, ow,
      oppMax: 60 + pow * 25, oppHp: 60 + pow * 25,
      notes: 10 + pow * 3, spawned: 0, hits: 0, perfect: 0, misses: 0, over: false,
      appr: 1450 - pow * 180, rad: 44 - pow * 3.5, gap: 880 - pow * 105, sliderP: 0.12 + pow * 0.07,
    };
    F.active = st;
    const ui = h(`<div class="fightui ${spar ? 'spar' : ''}"><div class="fbars">
        <div class="fb me"><span>You${pw !== 'fists' ? ' · ' + MH.esc(MH.WEAPONS[pw].name) : ''}</span><div class="bar"><i></i></div></div>
        <div class="fvs">${spar ? '🤝 SPAR' : '⚔️'}<small>${F.DIFF[pow]}</small></div>
        <div class="fb them"><span>${MH.esc(ch.name)}${ow !== 'fists' ? ' · ' + MH.esc(MH.WEAPONS[ow].name) : ''}</span><div class="bar"><i></i></div></div></div>
      <div class="fplay"></div><div class="fmsg">Get ready…</div>
      <div class="fbtns">${(P().bhCharges || 0) > 0 && !spar ? '<button class="btn small fbh">🕳️ Black Hole Sniper 3000</button>' : ''}<button class="btn small ghost frun">${spar ? 'Give up' : 'Run away'}</button></div></div>`);
    document.getElementById('game').appendChild(ui);
    st.ui = ui; st.play = ui.querySelector('.fplay'); st.msg = ui.querySelector('.fmsg');
    document.body.classList.add('fighting');
    const bars = () => {
      ui.querySelector('.me i').style.width = F.hp() + '%';
      ui.querySelector('.them i').style.width = Math.max(0, st.oppHp / st.oppMax * 100) + '%';
    };
    st.bars = bars; bars();
    ui.querySelector('.frun').onclick = () => {
      if (st.over) return;
      if (spar || Math.random() < 0.75 - pow * 0.1) end(spar ? 'gaveup' : 'fled');
      else { say('Blocked! You can\'t get away!', 'bad'); hurt(1); }
    };
    const bh = ui.querySelector('.fbh');
    if (bh) bh.onclick = () => {
      if (st.over) return;
      P().bhCharges = (P().bhCharges || 1) - 1;
      const flash = h('<div class="bhole"></div>'); st.play.appendChild(flash);
      say(`FWOOOMP. A tiny black hole swallows ${ch.name}… and spits them out somewhere near the swamp.`, 'ok');
      st.oppHp = 0; bars(); st.blackhole = true;
      setTimeout(() => end('win'), 1400);
    };
    const say = (t, cls) => { st.msg.textContent = t; st.msg.className = 'fmsg ' + (cls || ''); };
    st.say = say;
    const dmgTo = (mult) => { st.oppHp -= 10 * MH.WEAPONS[pw].dmg * mult; bars(); if (st.oppHp <= 0) end('win'); };
    const hurt = (mult) => {
      let d = (4 + pow * 3) * MH.WEAPONS[ow].dmg * mult * (spar ? 0.5 : 1);
      if (spar && F.hp() - d < 15) d = Math.max(0, F.hp() - 15);
      F.damage(d, { inFight: true, by: opp });
      bars(); st.ui.classList.remove('shake'); void st.ui.offsetWidth; st.ui.classList.add('shake');
      if (F.hp() <= (spar ? 15 : 0)) end('lose');
    };
    // spawn notes: tap circles (ring closes in) and sliders (drag the ball to the end)
    const spawn = () => {
      if (st.over) return;
      if (st.spawned >= st.notes) { if (!st.play.querySelector('.note')) end(st.oppHp / st.oppMax <= F.hp() / 100 ? 'win' : 'lose'); else setTimeout(spawn, 300); return; }
      st.spawned++;
      const W = st.play.clientWidth, H = st.play.clientHeight, R = st.rad;
      const x = MH.rand(R + 6, W - R - 6), y = MH.rand(R + 6, H - R - 6);
      const slider = Math.random() < st.sliderP && W > 200;
      const n = h(`<div class="note ${slider ? 'slider' : ''}" style="left:${x - R}px;top:${y - R}px;width:${R * 2}px;height:${R * 2}px"><div class="ring"></div><span>${st.spawned}</span></div>`);
      const born = performance.now();
      let done = false;
      const resolve = (ok, perfect) => {
        if (done) return; done = true;
        n.classList.add(ok ? 'hit' : 'miss'); setTimeout(() => n.remove(), 260);
        if (st.over) return;
        if (ok) { st.hits++; if (perfect) st.perfect++; say(perfect ? MH.pick(['PERFECT!', 'CRITICAL HIT!', 'Clean hit!']) : MH.pick(['Hit!', 'Good!', 'Got them!']), 'ok'); dmgTo(perfect ? 1.5 : 1); }
        else { st.misses++; say(MH.pick([`${ch.name} hits you!`, 'Ouch!', 'Too slow!', 'Blocked — and countered!']), 'bad'); hurt(1); }
      };
      if (!slider) {
        n.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const t = (performance.now() - born) / st.appr; // 1 = ring meets the circle
          resolve(t > 0.55 && t < 1.18, t > 0.82 && t < 1.08);
        });
        setTimeout(() => resolve(false), st.appr * 1.2);
      } else {
        // slider: a path to drag along
        const ang = Math.random() * Math.PI * 2, len = Math.min(W, H) * 0.38;
        let ex = MH.clamp(x + Math.cos(ang) * len, R, W - R), ey = MH.clamp(y + Math.sin(ang) * len, R, H - R);
        const track = h(`<div class="track"></div>`);
        const dx = ex - x, dy = ey - y, L = Math.hypot(dx, dy);
        track.style.cssText = `left:${x}px;top:${y - R * 0.55}px;width:${L}px;height:${R * 1.1}px;transform:rotate(${Math.atan2(dy, dx)}rad);border-radius:${R}px`;
        const end2 = h(`<div class="sliderend" style="left:${ex - R * 0.6}px;top:${ey - R * 0.6}px;width:${R * 1.2}px;height:${R * 1.2}px"></div>`);
        st.play.appendChild(track); st.play.appendChild(end2);
        let drag = false;
        const cleanup = () => { track.remove(); end2.remove(); };
        n.addEventListener('pointerdown', (e) => { e.preventDefault(); const t = (performance.now() - born) / st.appr; if (t < 0.5) { cleanup(); resolve(false); return; } drag = true; n.setPointerCapture(e.pointerId); n.classList.add('held'); });
        n.addEventListener('pointermove', (e) => {
          if (!drag) return;
          const r = st.play.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
          // keep the ball on the track
          const k = MH.clamp(((px - x) * dx + (py - y) * dy) / (L * L), 0, 1), bx = x + dx * k, by = y + dy * k;
          if (Math.hypot(px - bx, py - by) > R * 1.8) { drag = false; cleanup(); resolve(false); return; }
          n.style.left = (bx - R) + 'px'; n.style.top = (by - R) + 'px';
          if (k > 0.94) { drag = false; cleanup(); resolve(true, true); }
        });
        n.addEventListener('pointerup', () => { if (drag) { drag = false; cleanup(); resolve(false); } });
        setTimeout(() => { if (!done) { cleanup(); resolve(false); } }, st.appr * 1.25 + 1500 - pow * 150);
      }
      st.play.appendChild(n);
      requestAnimationFrame(function ringLoop() {
        if (done) return;
        const t = (performance.now() - born) / st.appr;
        const ring = n.querySelector('.ring'); if (ring) ring.style.transform = `scale(${Math.max(1, 2.6 - 1.6 * t)})`;
        if (t < 1.3) requestAnimationFrame(ringLoop);
      });
      setTimeout(spawn, st.gap * MH.rand(0.8, 1.25));
    };
    setTimeout(() => { say(spar ? `Friendly spar with ${ch.name}! Tap the circles when the ring closes, drag the sliders.` : `${ch.name} attacks! Tap the circles when the ring closes, drag the sliders.`); }, 50);
    setTimeout(spawn, 1300);

    function end(res) {
      if (st.over) return; st.over = true;
      const ko = res === 'lose' && !spar && F.hp() <= 0; // decided now (no regen sneaking in before the card)
      const result = { res, win: res === 'win', opp, kind: opts.kind, spar, perfect: st.perfect, hits: st.hits, misses: st.misses, blackhole: !!st.blackhole, weapon: pw };
      say(res === 'win' ? (spar ? `You win the spar!` : `${ch.name} goes down!`) : res === 'lose' ? (spar ? `${ch.name} wins the spar.` : `You're beaten…`) : res === 'fled' ? 'You got away!' : 'You give up.', res === 'win' || res === 'fled' ? 'ok' : 'bad');
      setTimeout(() => {
        ui.remove(); document.body.classList.remove('fighting');
        F.active = null;
        if (ko) P().hp = 0;
        F.after(result);
        opts.onEnd && opts.onEnd(result);
        if (ko) F.knockout({ by: opp, kind: opts.kind });
      }, 1300);
    }
  };

  // consequences of a fight with the player
  F.after = function (r) {
    const S = MH.social, p = P(), opp = r.opp, ch = MH.CHAR[opp], e = MH.npcById[opp];
    const where = MH.world.placeAt(MH.player.x, MH.player.y).name;
    const playerStarted = r.starter === 'player' || (F.lastStarter === 'player');
    if (r.spar) {
      S.changeBond(opp, r.win ? 4 : 2);
      S.addMemory(opp, r.win ? `Sparred with ${p.name} — they beat me. Not bad at all.` : `Sparred with ${p.name} and won. They've got guts.`, { imp: 2 });
      if (r.win && F.power(opp) >= 3) S.applyRep({ brave: 2 }, [opp]);
      S.grapevine(`${p.name} had a sparring match with ${ch.name} near ${where} (${r.win ? p.name : ch.name} won).`, [opp]);
      return;
    }
    if (r.res === 'fled') { S.addMemory(opp, `${p.name} ran away from a fight with me.`, { imp: 2 }); S.applyRep({ brave: -2 }, [opp]); return; }
    const bandit = ch.bandit || ch.villain;
    if (r.win) {
      if (e) { e.hurtUntil = MH.absMinutes() + 240; e.asleep = false; }
      S.npc(opp).mood = 'beaten';
      S.addMemory(opp, r.blackhole ? `${p.name} shot me with a BLACK HOLE. I woke up in the swamp.` : `${p.name} beat me in a fight near ${where}. Humiliating.`, { imp: 4 });
      if (bandit) { S.applyRep({ brave: 3 }, []); S.witness(`${p.name} beat ${ch.name} in a fight near ${where}!`, MH.player.x, MH.player.y, [opp], { brave: 2 }, 12); }
      else S.witness(`${p.name} beat up ${ch.name} near ${where}.`, MH.player.x, MH.player.y, [opp], { violent: 2, kind: -1 }, 12);
      if (r.blackhole) { S.addMemory('penelope', `${p.name} used my Black Hole Sniper 3000 on ${ch.name}. IT WORKS!!`, { imp: 2 }); S.applyRep({ chaotic: 3 }, []); }
      if (e && r.blackhole) { const s = MH.world.randomSpot('swamp'); e.setTile(s.tx, s.ty); }
      MH.ui.toast(`🏆 You beat ${ch.name}!`, 3);
    } else {
      S.addMemory(opp, `Beat ${p.name} in a fight near ${where}.`, { imp: 3 });
      S.witness(`${ch.name} beat ${p.name} in a fight near ${where}.`, MH.player.x, MH.player.y, [opp], { brave: 1 }, 12);
      if (r.kind === 'mugging' && F.hp() > 0) { const lost = Math.min(p.coins, MH.randi(15, 40)); p.coins -= lost; MH.ui.toast(`${ch.name} takes ${lost} coins from you.`, 3.5); S.addMemory(opp, `Took ${lost} coins off ${p.name}.`, { imp: 2 }); }
    }
  };

  // ---------------------------------------------------------------- villagers fighting each other (simulated)
  F.npcFight = async function (a, b, why) {
    if (a.busy || b.busy) return;
    const pa = F.power(a.id) + Math.random() * 2.2, pb = F.power(b.id) + Math.random() * 2.2;
    const [win, lose] = pa >= pb ? [a, b] : [b, a];
    const where = MH.world.placeAt(a.x, a.y).name;
    const pl = MH.player;
    const visible = Math.min(MH.distTiles(a, pl), MH.distTiles(b, pl)) < 14 && MH.roomOf(a) === MH.roomOf(pl) && !MH.chat.active;
    a.busy = b.busy = 'smalltalk'; a.face(b.x, b.y); b.face(a.x, a.y);
    if (visible) {
      a.showEmote('anger', 3); b.showEmote('anger', 3);
      MH.sim.vibeNow(`${a.ch.name} and ${b.ch.name} are FIGHTING near ${where}!`);
      for (let i = 0; i < 5; i++) { MH.render.burst((a.x + b.x) / 2 + MH.rand(-8, 8), (a.y + b.y) / 2 - 20, 'sparkle', 4); await new Promise((r) => setTimeout(r, 380)); }
      MH.chat.showBubble(win, win.ch.mute ? '*stands over them*' : MH.pick(['And STAY down.', 'That\'s what I thought.', 'Hmph.']), { dur: 3 });
      MH.chat.showBubble(lose, lose.ch.mute ? '*limps away*' : MH.pick(['Ow… OW…', 'This isn\'t over!', '*groans*']), { dur: 3 });
    } else if (!MH.chat.active) MH.sim.vibeNow(MH.pick([`You hear a scuffle near ${where}.`, `Somebody is brawling near ${where}.`]));
    lose.hurtUntil = MH.absMinutes() + 240; MH.social.npc(lose.id).mood = 'bruised';
    MH.social.changeRel(a.id, b.id, -8); MH.social.changeRel(b.id, a.id, -10);
    MH.social.addMemory(win.id, `Got into a fight with ${lose.ch.name} near ${where}${why ? ' (' + why + ')' : ''}. I won.`, { imp: 3, about: 'town' });
    MH.social.addMemory(lose.id, `${win.ch.name} beat me up near ${where}${why ? ' (' + why + ')' : ''}.`, { imp: 3, about: 'town' });
    MH.npcs.forEach((o) => { if (o !== a && o !== b && !o.hidden && MH.distTiles(o, a) < 10 && MH.roomOf(o) === MH.roomOf(a)) MH.social.addMemory(o.id, `Saw ${a.ch.name} and ${b.ch.name} get into a real fight near ${where}. ${win.ch.name} won.`, { imp: 2, kind: 'witness', about: 'town' }); });
    MH.social.grapevine(`${a.ch.name} and ${b.ch.name} had a fight near ${where} — ${win.ch.name} won.`, [a.id, b.id]);
    if (visible) MH.social.log({ kind: 'sys', text: `⚔️ ${a.ch.name} vs ${b.ch.name} near ${where} — ${win.ch.name} won.` });
    a.busy = b.busy = null; lose.planKey = null; lose.planDelay = 0;
  };

  // a hurt villager heads to the clinic for a while
  F.isHurt = (e) => e && e.hurtUntil && e.hurtUntil > MH.absMinutes();

  // ---------------------------------------------------------------- "⚔️ wants to fight" prompt in a conversation
  F.offer = function (c, f) {
    const old = document.getElementById('fightCard'); if (old) old.remove();
    const ch = MH.CHAR[f.with]; if (!ch) return;
    const spar = f.kind === 'spar', mug = f.kind === 'mugging';
    const card = h(`<div id="fightCard" class="questcard fightcard"><div class="qh">${spar ? '🤝 Sparring match' : mug ? '💰 Mugging' : '⚔️ Fight'} · ${F.DIFF[MH.clamp(F.power(f.with), 1, 5)]}</div><b>${MH.esc(ch.name)} ${spar ? 'wants to spar with you' : mug ? 'wants your money' : 'is coming at you'}</b><div class="row"><button class="btn small ghost" data-v="0">${spar ? 'Not now' : mug ? 'Hand over coins' : 'Back off'}</button><button class="btn small" data-v="1">${spar ? 'Let\'s spar!' : 'Fight!'}</button></div></div>`);
    card.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => {
      card.remove();
      if (b.dataset.v === '1') F.inChat(c, f);
      else if (mug) { const lost = Math.min(P().coins, MH.randi(15, 35)); P().coins -= lost; MH.chat.sendText(`*reluctantly hands over ${lost} coins*`); MH.social.addMemory(f.with, `${P().name} paid up when I mugged them (${lost} coins).`, { imp: 2 }); }
      else MH.chat.sendText(spar ? '*shakes head — maybe another time*' : '*backs off, hands raised*');
    }));
    document.getElementById('chat').appendChild(card);
  };
  F.hideOffer = () => { const old = document.getElementById('fightCard'); if (old) old.remove(); };
  // run the fight inside a conversation, then tell the storyteller how it went
  F.inChat = function (c, f) {
    F.lastStarter = f.starter || 'npc';
    F.start({ opp: f.with, kind: f.kind, starter: f.starter, onEnd: (r) => {
      if (!MH.chat.active || MH.chat.convo !== c) return;
      const P2 = P().name, n2 = nm(f.with);
      const txt = r.spar ? `SPARRING RESULT: ${r.win ? P2 + ' won the friendly spar against ' + n2 : n2 + ' won the friendly spar'}${r.res === 'gaveup' ? ' (the player gave up)' : ''}. It was friendly — react in kind.`
        : r.res === 'fled' ? `FIGHT RESULT: ${P2} ran away from the fight with ${n2}.`
        : r.blackhole ? `FIGHT RESULT: ${P2} fired Penelope's Black Hole Sniper 3000 — ${n2} got sucked into a tiny black hole and spat out near the swamp (dazed, unhurt, furious).`
        : `FIGHT RESULT: ${r.win ? P2 + ' beat ' + n2 : n2 + ' beat ' + P2}${r.weapon !== 'fists' ? ' (the player fought with a ' + MH.WEAPONS[r.weapon].name.toLowerCase() + ')' : ''}. ${r.win ? n2 + ' is hurt and beaten.' : P2 + ' is hurt.'}`;
      c.lines.push({ who: 'system', text: txt });
      MH.social.log({ kind: 'sys', text: '⚔️ ' + txt.replace(/^\w+ RESULT: /, ''), convo: c.id });
      if (r.blackhole && c.members.includes(f.with)) MH.chat.removeMember(f.with, 'vanishes into a tiny black hole');
      if (F.hp() > 0 && MH.chat.convo === c && c.members.length) MH.chat.letThemTalk();
    } });
  };
})(window.MH);
