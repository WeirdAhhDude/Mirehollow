// Mirehollow — health & fights.
// The player has HP. Fights are turn-based inside conversations (Undertale-style): you type attacks that hit or
// miss depending on the opponent, then dodge their attacks with a ❤️ in a box. Friendly spars or the real thing;
// group fights; villagers fight each other too. At 0 HP you black out: robbed, rescued, or — rarely — you die
// and the day restarts.
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
    if (!MH.state || F.active || F.inCombat(MH.chat && MH.chat.convo)) return;
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
  // Who takes sides when a fight breaks out near the player: the opponent's friends may jump in against you,
  // your friends may jump in for you, timid bystanders run off, the rest watch.
  F.sides = function (opp) {
    const out = { foes: [], friends: [], fled: [] };
    const pl = MH.player, room = MH.roomOf(pl), convo = MH.chat.convo ? MH.chat.convo.members : [];
    const S = MH.social;
    MH.npcs.forEach((o) => {
      if (o.id === opp || o.hidden || o.asleep || o.chase || F.isHurt(o) || o.ch.visitor || o.id === 'scarecrow') return;
      if (MH.roomOf(o) !== room || MH.distTiles(o, pl) > 10) return;
      if (o.busy && !convo.includes(o.id)) return;
      const toOpp = S.npc(o.id).rel[opp] || 0, att = S.attitude(o.id), pw = F.power(o.id);
      const gang = MH.BANDITS.includes(o.id) && MH.BANDITS.includes(opp);
      if ((toOpp >= 40 || gang) && att < 25 && pw >= 2 && !S.isAfraid(o.id) && out.foes.length < 2) out.foes.push(o.id);
      else if ((att >= 40 || (o.following && att >= 15)) && toOpp <= 20 && pw >= 2 && !S.isAfraid(o.id) && out.friends.length < 2) out.friends.push(o.id);
      else if (!S.isTough(o.id) && pw <= 2 && Math.random() < 0.6) out.fled.push(o.id);
    });
    return out;
  };

  // ================================================================ TURN-BASED FIGHTS (Undertale-style)
  // A fight lives inside the conversation (c.combat). YOUR TURN: type an *attack* — it hits or misses depending on
  // how tough the target is — or just talk, or try to leave. THEIR TURN: dodge their attacks with your ❤️ in the box.
  // Group fights: several enemies (each with HP), allies who land their own hits, friends who drag you out.
  const HIT = [0, 0.92, 0.8, 0.66, 0.52, 0.4];      // chance to land a hit, by target's strength 1..5
  const EHP = [0, 25, 50, 80, 110, 140];            // enemy HP by strength (weak ones can go down in one hit)
  F.inCombat = (c) => !!(c && c.combat && !c.combat.over);
  F.alive = (c) => (c && c.combat ? c.combat.enemies.filter((x) => !x.out && x.hp > 0) : []);
  const pw5 = (id) => MH.clamp(F.power(id), 1, 5);

  F.begin = function (c, f) {
    if (!c || c.phone || !MH.CHAR[f.with] || !MH.chat.active) return;
    if (F.inCombat(c)) { addEnemy(c, f.with, 'joins the fight'); F.renderBar(c); return; }
    const spar = f.kind === 'spar';
    const sides = spar ? { foes: [], friends: [], fled: [] } : F.sides(f.with);
    const cb = (c.combat = { kind: f.kind || 'brawl', spar, starter: f.starter || 'npc', primary: f.with, enemies: [], allies: [], fled: sides.fled.slice(), round: 0, over: false });
    addEnemy(c, f.with);
    sides.foes.forEach((id) => addEnemy(c, id, 'jumps into the fight against you'));
    sides.friends.forEach((id) => { if (!c.members.includes(id)) MH.chat.addMember(id, 'jumps in to help you'); if (!cb.allies.includes(id)) cb.allies.push(id); });
    if (!spar) c.members.forEach((id) => { if (!cb.enemies.some((x) => x.id === id) && !cb.allies.includes(id) && MH.social.attitude(id) >= 40 && F.power(id) >= 2 && !MH.social.isAfraid(id) && (MH.social.npc(id).rel[f.with] || 0) <= 20) cb.allies.push(id); });
    sides.fled.forEach((id) => { const o = MH.npcById[id]; if (c.members.includes(id)) MH.chat.removeMember(id, 'runs off, terrified'); if (o) MH.sim.flee(o, MH.player); });
    const names = cb.enemies.map((x) => nm(x.id)).join(' and ');
    c.lines.push({ who: 'system', text: `${spar ? 'A friendly SPARRING match' : 'A FIGHT'} starts: ${P().name} vs ${names}${cb.allies.length ? ' — ' + cb.allies.map(nm).join(' and ') + ' on the player\'s side' : ''}.` });
    MH.social.log({ kind: 'sys', text: `⚔️ ${spar ? 'Spar' : 'Fight'}: you vs ${names}${cb.allies.length ? ' (with ' + cb.allies.map(nm).join(', ') + ')' : ''}`, convo: c.id });
    MH.chat.combatMode(true); F.renderBar(c);
  };
  function addEnemy(c, id, how) {
    const cb = c.combat; if (!MH.CHAR[id] || cb.enemies.some((x) => x.id === id)) return;
    if (!c.members.includes(id)) MH.chat.addMember(id, how || 'joins the fight');
    cb.allies = cb.allies.filter((a) => a !== id);
    const max = EHP[pw5(id)];
    cb.enemies.push({ id, hp: max, max });
    const e = MH.npcById[id]; if (e) e.showEmote('anger', 3);
  }

  // YOUR TURN — called from chat.submit before the storyteller replies
  F.playerMove = function (c, text, to) {
    const cb = c.combat; if (!cb || cb.over) return;
    cb.round++; cb.lastMove = null;
    const acts = (String(text).match(/\*([^*]+)\*/g) || []).join(' ').replace(/\*/g, '').trim();
    if (!acts || !MH.chat.isAttack(acts)) { cb.lastMove = 'The player did not attack this turn (they talked or did something else).'; return; }
    const alive = F.alive(c), low = acts.toLowerCase();
    const tgt = alive.find((x) => x.id === to) || alive.find((x) => { const n = nm(x.id).toLowerCase(); return low.includes(n) || low.includes(n.split(' ').pop()); }) || alive[0];
    if (!tgt) return;
    const pw = F.weaponOf('player'), W = MH.WEAPONS[pw], p = pw5(tgt.id);
    if (/black hole|sniper/i.test(acts) && (P().bhCharges || 0) > 0 && !cb.spar) {
      P().bhCharges--; tgt.hp = 0; tgt.out = true; tgt.blackhole = true;
      F.popup(tgt.id, '🕳️ GONE', 'hit');
      const e = MH.npcById[tgt.id]; if (e) { const s2 = MH.world.randomSpot('swamp'); setTimeout(() => { e.setTile(s2.tx, s2.ty); }, 900); }
      cb.lastMove = `The player fired Penelope's Black Hole Sniper 3000: ${nm(tgt.id)} was sucked into a tiny black hole and spat out near the swamp (gone from the fight, dazed, unhurt, furious).`;
      setTimeout(() => MH.chat.convo === c && c.members.includes(tgt.id) && MH.chat.removeMember(tgt.id, 'vanishes into a tiny black hole'), 1100);
      F.renderBar(c); return;
    }
    const chance = HIT[p] + (pw !== 'fists' ? 0.06 : 0) + (cb.allies.length ? 0.05 : 0) + Math.min(5, MH.state.player.training || 0) * 0.03; // dojo lessons help
    // Gojo: space itself stops your fist an inch from his fur (almost always)
    const hit = Math.random() < (tgt.id === 'gojo' ? chance * 0.2 : chance), crit = hit && Math.random() < 0.12;
    let dmg = 0;
    if (hit) { dmg = Math.round(26 * W.dmg * MH.rand(0.85, 1.15) * (crit ? 1.6 : 1) * (cb.spar ? 0.75 : 1)); tgt.hp = Math.max(0, tgt.hp - dmg); }
    const down = tgt.hp <= 0 || (cb.spar && tgt.hp <= tgt.max * 0.2);
    if (down) tgt.out = true;
    F.popup(tgt.id, hit ? (crit ? `CRIT −${dmg}` : `−${dmg}`) : 'MISS', hit ? 'hit' : 'miss');
    cb.lastMove = `The player's move "${acts.slice(0, 120)}" ${hit ? (crit ? 'landed a CRITICAL hit on' : 'HIT') : 'MISSED'} ${nm(tgt.id)}${hit ? ` (−${dmg} HP, now ${tgt.hp}/${tgt.max})` : ` (${nm(tgt.id)} dodged or blocked it)`}${down ? (cb.spar ? ` — ${nm(tgt.id)} is beaten and yields` : ` — ${nm(tgt.id)} is KNOCKED OUT and can't fight any more`) : ''}.`;
    F.renderBar(c);
  };

  // after the storyteller's reply: allies' hits, surrenders, end checks, then THEIR TURN
  F.afterTurn = function (c, res) {
    const cb = c.combat; if (!cb || cb.over) return false;
    if (cb.lastMove) { c.lines.push({ who: 'system', text: 'COMBAT: ' + cb.lastMove }); cb.lastMove = null; }
    const hitBy = (by, t, d) => { t.hp = Math.max(0, t.hp - d); F.popup(t.id, `−${d} ${nm(by).split(' ')[0]}`, 'hit'); if (t.hp <= 0 || (cb.spar && t.hp <= t.max * 0.2)) t.out = true; };
    (res.allyAttacks || []).forEach((a) => {
      if (!c.members.includes(a.by) || cb.enemies.some((x) => x.id === a.by)) return;
      if (!cb.allies.includes(a.by)) cb.allies.push(a.by);
      const t = F.alive(c).find((x) => x.id === a.target) || F.alive(c)[0]; if (!t) return;
      hitBy(a.by, t, a.strength === 'finisher' ? Math.max(45, t.hp) : a.strength === 'heavy' ? 28 : 14);
    });
    // no instructions from the storyteller (offline): allies still help now and then
    if (!(res.allyAttacks || []).length && !cb.spar) cb.allies.forEach((id) => { if (c.members.includes(id) && Math.random() < 0.45) { const t = MH.pick(F.alive(c)); if (t) hitBy(id, t, MH.randi(8, 16) + F.power(id) * 3); } });
    (res.surrender || []).forEach((id) => { const t = cb.enemies.find((x) => x.id === id); if (t) { t.out = true; t.surrendered = true; } });
    cb.enemies.forEach((t) => { if (!c.members.includes(t.id) && !t.out) { t.out = true; t.left = true; } });
    cb.allies = cb.allies.filter((id) => c.members.includes(id));
    F.renderBar(c);
    if (res.drag) { F.end(c, 'dragged'); return true; }
    if (res.fightOver) { F.end(c, 'stopped'); return true; }
    if (!F.alive(c).length) { F.end(c, cb.enemies.every((x) => x.left) ? 'theyfled' : 'win'); return true; }
    setTimeout(() => MH.chat.convo === c && F.enemyTurn(c, res.enemyAttack), 450);
    return true;
  };

  // THEIR TURN: everyone still standing attacks; dodge in the box
  F.enemyTurn = function (c, caption) {
    const cb = c.combat; if (!cb || cb.over) return;
    const alive = F.alive(c); if (!alive.length) { F.end(c, 'win'); return; }
    MH.chat.setBusy(true);
    const guard = Math.max(0.6, 1 - 0.2 * cb.allies.length);
    F.dodge({ enemies: alive.map((x) => x.id), spar: cb.spar, guard, caption: caption || defaultCaption(alive.map((x) => x.id)) }, (taken) => {
      if (MH.chat.convo !== c || cb.over) return;
      MH.chat.setBusy(false);
      c.lines.push({ who: 'system', text: `COMBAT: ${alive.map((x) => nm(x.id)).join(' and ')} attacked — the player ${taken ? `took ${taken} damage (HP now ${Math.round(F.hp())}/100)` : 'dodged everything'}.` });
      F.renderBar(c);
      if (F.hp() <= (cb.spar ? 15 : 0)) { F.end(c, 'lose'); return; }
      MH.chat.yourMove();
    });
  };
  function defaultCaption(ids) {
    const a = nm(ids[0]);
    if (ids.length > 1) return `${ids.map(nm).join(' and ')} come at you together!`;
    return MH.pick([`${a} attacks!`, `${a} lunges at you!`, `${a} swings!`, `${a} isn't holding back!`]);
  }

  // trying to run during a fight
  F.tryFlee = function (c) {
    const cb = c.combat; if (!cb || cb.over) return;
    const top = Math.max(...F.alive(c).map((x) => pw5(x.id)), 1);
    if (cb.spar || Math.random() < 0.72 - top * 0.1) { F.end(c, 'fled'); return; }
    const blocker = MH.pick(F.alive(c));
    MH.ui.narrate(`${nm(blocker.id)} blocks your escape!`);
    c.lines.push({ who: 'system', text: `COMBAT: the player tried to run, but ${nm(blocker.id)} blocked the way.` });
    F.enemyTurn(c, `${nm(blocker.id)} blocks your escape and attacks!`);
  };

  F.end = function (c, how) {
    const cb = c.combat; if (!cb || cb.over) return; cb.over = true;
    MH.chat.setBusy(false); MH.chat.combatMode(false); F.renderBar(c);
    const primary = cb.primary, win = how === 'win', lose = how === 'lose';
    const foes = cb.enemies.filter((x) => x.id !== primary).map((x) => x.id);
    if (win || lose || how === 'fled') F.after({ res: win ? 'win' : lose ? 'lose' : 'fled', win, opp: primary, kind: cb.kind, spar: cb.spar, weapon: F.weaponOf('player'), blackhole: cb.enemies.some((x) => x.blackhole && x.id === primary), sides: { foes, friends: cb.allies.slice(), fled: cb.fled } });
    if (win && !cb.spar) cb.enemies.forEach((x) => { const e = MH.npcById[x.id]; if (e && x.hp <= 0) { e.hurtUntil = MH.absMinutes() + 240; MH.social.npc(x.id).mood = 'beaten'; } });
    const P2 = P().name, names = cb.enemies.map((x) => nm(x.id)).join(' and ');
    const txt = how === 'win' ? (cb.spar ? `SPAR OVER: ${P2} won the friendly spar against ${names}. Friendly — react in kind.` : `FIGHT OVER: ${P2} beat ${names}${cb.allies.length ? ' (with help from ' + cb.allies.map(nm).join(' and ') + ')' : ''}. ${cb.enemies.filter((x) => x.hp <= 0).map((x) => nm(x.id)).join(', ') || 'They'} ${cb.enemies.filter((x) => x.hp <= 0).length > 1 ? 'are' : 'is'} down; ${cb.enemies.filter((x) => x.surrendered).map((x) => nm(x.id)).join(', ') || 'nobody'} surrendered.`)
      : how === 'lose' ? (cb.spar ? `SPAR OVER: ${names} won the friendly spar. Friendly — react in kind.` : `FIGHT OVER: ${P2} was beaten.`)
      : how === 'stopped' ? 'The fight stops — talked down or interrupted.'
      : how === 'theyfled' ? `The fight is over — ${names} ran off.`
      : how === 'dragged' ? `The fight is over — ${P2} was dragged out of it.` : '';
    if (txt) { c.lines.push({ who: 'system', text: txt }); MH.social.log({ kind: 'sys', text: '⚔️ ' + txt.replace(/^[A-Z ]+: /, ''), convo: c.id }); }
    if (win) MH.ui.toast(cb.spar ? '🤝 You won the spar!' : `🏆 You won the fight!`, 3);
    if (lose && !cb.spar) { P().hp = 0; F.knockout({ by: primary, kind: cb.kind }); return; }
    if (how === 'fled') {
      MH.chat.end();
      const e = MH.npcById[primary];
      if (e) { const pl = MH.player, dx = pl.x - e.x, dy = pl.y - e.y, L = Math.hypot(dx, dy) || 1, t = pl.tile(); const s2 = MH.world.nearestWalkable(Math.round(t.tx + dx / L * 4), Math.round(t.ty + dy / L * 4)); if (!MH.roomOf(pl) || MH.world.roomAt(s2.tx, s2.ty)) pl.setTile(s2.tx, s2.ty); }
      if (!cb.spar && e && !MH.social.isAfraid(primary) && F.power(primary) >= 2 && Math.random() < 0.75) setTimeout(() => MH.sim.startChase(e, { kind: cb.kind === 'mugging' ? 'mugging' : 'brawl', reason: 'you ran away from the fight' }), 1200);
      else MH.ui.toast('You got away!', 2.5);
      return;
    }
    if (how === 'left' || how === 'dragged') return;
    setTimeout(() => MH.chat.convo === c && !MH.chat.waiting && MH.chat.letThemTalk(), 500);
  };

  // little floating numbers over a portrait
  F.popup = function (id, text, cls) {
    const card = document.querySelector(`#cast .card[data-id="${id}"]`); if (!card) return;
    const d = h(`<div class="dmgpop ${cls || ''}">${MH.esc(text)}</div>`);
    card.appendChild(d); setTimeout(() => d.remove(), 1400);
    if (cls === 'hit') { card.classList.remove('struck'); void card.offsetWidth; card.classList.add('struck'); }
  };
  // the strip above the chat bar: round, your HP, enemies' HP, allies
  F.renderBar = function (c) {
    let bar = document.getElementById('combatBar');
    const cb = c && c.combat;
    if (!cb || cb.over) { if (bar) bar.remove(); return; }
    if (!bar) { bar = h('<div id="combatBar"></div>'); document.getElementById('chat').appendChild(bar); }
    bar.innerHTML = `<div class="cbtop"><b>${cb.spar ? '🤝 SPAR' : '⚔️ FIGHT'}</b> · round ${cb.round + 1} · ❤️ ${Math.round(F.hp())}${cb.allies.length ? ' · 🛡️ ' + cb.allies.map((id) => MH.esc(nm(id).split(' ')[0])).join(', ') : ''}</div>` +
      cb.enemies.map((x) => `<button class="foe ${x.out ? 'out' : ''} ${MH.chat.to === x.id ? 'sel' : ''}" data-id="${x.id}"><span>${MH.esc(nm(x.id).split(' ')[0])} <small>${F.DIFF[pw5(x.id)]}</small></span><i style="width:${Math.max(0, x.hp / x.max * 100)}%"></i></button>`).join('');
    bar.querySelectorAll('.foe').forEach((b) => (b.onclick = () => { if (!b.classList.contains('out')) { MH.chat.setTarget(b.dataset.id); F.renderBar(c); } }));
  };

  // ---------------------------------------------------------------- the dodge box (your ❤️ vs their attacks)
  const STYLE = { gojo: ['homing', 'ring', 'storm', 'bars'], sukuna: ['storm', 'slam', 'bars', 'aimed'], brick: ['slam', 'bouncers'], crunch: ['side', 'aimed', 'slam'], snap: ['aimed', 'aimed'], jawbreaker: ['slam', 'bouncers', 'bars'], jade: ['storm', 'aimed', 'bars', 'slam'], roxy: ['side', 'aimed', 'side', 'slam'], f_rin: ['aimed', 'side'], kira: ['bars', 'aimed', 'slam'], rook: ['aimed', 'aimed', 'side'], gristle: ['slam', 'rain'], snitch: ['pebbles'], mortimer: ['bars', 'aimed'], vesper: ['homing'], box: ['bouncers', 'slam'], bunny: ['side', 'side', 'aimed'], marina: ['waves', 'side'], gertie: ['slam', 'bouncers'], nimbus: ['storm', 'rain'], darkborn: ['ring', 'homing', 'bars'], solaris: ['ring', 'rain'], zahra: ['ring', 'homing'], thistle: ['slam', 'aimed'], maggie: ['swarm', 'homing'], clucky: ['aimed', 'rain'], sable: ['homing', 'bars'], scarecrow: ['ring', 'homing'], dionne: ['waves', 'rain'], chuckles: ['bouncers', 'rain'], brenda: ['slam', 'bouncers'] };
  F.dodge = function (o, done) {
    const pows = o.enemies.map((id) => o.power || pw5(id)), maxP = Math.max(...pows);
    const dur = 3 + maxP * 0.95 + (o.enemies.length - 1) * 1.3;
    const ui = h(`<div class="dodge"><div class="dcap">${MH.esc(o.caption)}</div><canvas></canvas><div class="dinfo"><span>${o.training ? '' : '❤️ '}<b class="dhp">${o.training ? '✋ 0' : Math.round(F.hp())}</b></span><span class="dtime"><i></i></span></div><div class="dhint">Drag anywhere to move your ❤️ · dodge everything</div></div>`);
    document.getElementById('game').appendChild(ui);
    document.body.classList.add('fighting');
    const cv = ui.querySelector('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(Math.min(320, window.innerWidth * 0.86)), H = Math.round(W * 0.78);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const x = cv.getContext('2d'); x.scale(dpr, dpr);
    const heart = { x: W / 2, y: H * 0.62, r: 7 };
    const bullets = [], rects = [];
    let t = 0, inv = 0, taken = 0, over = false, last = performance.now(), pre = 3; // 3-2-1 before anything flies
    const ow = (id) => MH.WEAPONS[F.weaponOf(id)].dmg;
    const dmgOf = (id) => Math.max(2, Math.round((2 + pw5(id) * 1.8) * ow(id) * (o.spar ? 0.5 : 1) * o.guard));
    // --- primitives
    const add = (b) => bullets.push(Object.assign({ r: 5, life: 8, col: '#ffffff' }, b));
    const toward = (sx, sy, sp) => { const dx = heart.x - sx, dy = heart.y - sy, L = Math.hypot(dx, dy) || 1; return { vx: dx / L * sp, vy: dy / L * sp }; };
    const edge = () => { const s = MH.randi(0, 3); return s === 0 ? { x: MH.rand(0, W), y: -8 } : s === 1 ? { x: W + 8, y: MH.rand(0, H) } : s === 2 ? { x: MH.rand(0, W), y: H + 8 } : { x: -8, y: MH.rand(0, H) }; };
    const PRIM = {
      pebbles: (S, p) => { if (S.cd('a', 1.4 - p * 0.15)) add({ x: MH.rand(10, W - 10), y: -6, vx: 0, vy: 55 + p * 15, r: 5 }); },
      rain: (S, p) => { if (S.cd('a', 0.9 / (0.5 + p * 0.5))) add({ x: MH.rand(6, W - 6), y: -6, vx: MH.rand(-12, 12), vy: 70 + p * 30, r: 4.5 }); },
      side: (S, p) => { if (S.cd('a', 1.1 / (0.5 + p * 0.45))) { const l = Math.random() < 0.5; add({ x: l ? -6 : W + 6, y: MH.rand(8, H - 8), vx: (l ? 1 : -1) * (90 + p * 34), vy: 0, r: 4.5 }); } },
      aimed: (S, p) => { if (S.cd('a', 1.5 / (0.5 + p * 0.4))) { const e = edge(); add(Object.assign({ x: e.x, y: e.y, r: 4 }, toward(e.x, e.y, 110 + p * 38))); } },
      homing: (S, p) => { if (S.cd('a', 1.7 / (0.5 + p * 0.35))) { const e = edge(); add(Object.assign({ x: e.x, y: e.y, r: 5, home: 60 + p * 25, col: '#d8a8ff' }, toward(e.x, e.y, 60 + p * 18))); } },
      swarm: (S, p) => { if (S.cd('a', 0.35 / (0.5 + p * 0.3))) { const e = edge(); add(Object.assign({ x: e.x, y: e.y, r: 2.6, home: 40, col: '#c8c0c8' }, toward(e.x, e.y, 90 + p * 25))); } },
      bouncers: (S, p) => { if (S.cd('a', 2.6 - p * 0.25) && bullets.filter((b) => b.bounce).length < 1 + p) add({ x: MH.rand(20, W - 20), y: 10, vx: MH.rand(-1, 1) * (60 + p * 20), vy: 50 + p * 22, r: 10 + p, bounce: true, life: 6, col: '#f4d0a0' }); },
      waves: (S, p) => { if (S.cd('a', 0.5 / (0.5 + p * 0.3))) { const l = S.flip = !S.flip; add({ x: l ? -6 : W + 6, y: H / 2, vx: (l ? 1 : -1) * (70 + p * 20), vy: 0, r: 4, wave: MH.rand(0, 6), amp: H * 0.38, col: '#9ad8f4' }); } },
      ring: (S, p) => { if (S.cd('a', 2.6 - p * 0.3)) { const n = 6 + p * 2, ox = MH.rand(W * 0.3, W * 0.7), oy = MH.rand(H * 0.3, H * 0.7); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; add({ x: ox + Math.cos(a) * 140, y: oy + Math.sin(a) * 140, vx: -Math.cos(a) * (55 + p * 14), vy: -Math.sin(a) * (55 + p * 14), r: 4, col: '#ffd86a' }); } } },
      bars: (S, p) => { if (S.cd('b', 2.2 - p * 0.25)) { const vert = Math.random() < 0.5, gap = Math.max(30, 58 - p * 5), at = MH.rand(gap, (vert ? W : H) - gap), sp = 70 + p * 26; const from = Math.random() < 0.5;
          if (vert) { rects.push({ x: 0, y: from ? -14 : H + 2, w: at - gap / 2, h: 12, vx: 0, vy: from ? sp : -sp }); rects.push({ x: at + gap / 2, y: from ? -14 : H + 2, w: W, h: 12, vx: 0, vy: from ? sp : -sp }); }
          else { rects.push({ x: from ? -14 : W + 2, y: 0, w: 12, h: at - gap / 2, vx: from ? sp : -sp, vy: 0 }); rects.push({ x: from ? -14 : W + 2, y: at + gap / 2, w: 12, h: H, vx: from ? sp : -sp, vy: 0 }); } } },
      slam: (S, p) => { if (S.cd('c', 2.8 - p * 0.3)) { const q = MH.randi(0, 3); const R = q === 0 ? { x: 0, y: 0, w: W / 2, h: H } : q === 1 ? { x: W / 2, y: 0, w: W / 2, h: H } : q === 2 ? { x: 0, y: 0, w: W, h: H / 2 } : { x: 0, y: H / 2, w: W, h: H / 2 }; rects.push(Object.assign({ warn: 0.75 - p * 0.05, live: 0.35, vx: 0, vy: 0 }, R)); } },
      storm: (S, p) => { if (S.cd('c', 1.6 - p * 0.15)) rects.push({ x: MH.rand(0, W - 26), y: 0, w: 26, h: H, warn: 0.6, live: 0.3, vx: 0, vy: 0, col: '#fff6a0' }); },
    };
    // each enemy gets a spawner built from their style; several enemies share the load a bit
    const spawners = o.enemies.map((id, i) => {
      const p = pows[i], styles = STYLE[id] || (p >= 4 ? ['aimed', 'bars', 'rain'] : p >= 3 ? ['rain', 'aimed'] : p >= 2 ? ['rain'] : ['pebbles']);
      const S = { t: {}, cd(k, every) { every = every * Math.sqrt(o.enemies.length); S.t[k] = (S.t[k] == null ? MH.rand(0, every * 0.6) : S.t[k]) - S.dt; if (S.t[k] <= 0) { S.t[k] = every * MH.rand(0.8, 1.2); return true; } return false; }, dt: 0 };
      return { id, p, run: (dt) => { S.dt = dt; styles.slice(0, Math.max(1, Math.min(styles.length, p - 1))).forEach((st) => PRIM[st](S, p)); } };
    });
    // controls: drag anywhere (relative, so your finger never hides the heart) or arrow keys
    let drag = null; const keys = {};
    ui.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; ui.setPointerCapture(e.pointerId); e.preventDefault(); });
    ui.addEventListener('pointermove', (e) => { if (!drag) return; heart.x = MH.clamp(heart.x + (e.clientX - drag.x) * 1.2, heart.r, W - heart.r); heart.y = MH.clamp(heart.y + (e.clientY - drag.y) * 1.2, heart.r, H - heart.r); drag = { x: e.clientX, y: e.clientY }; });
    ui.addEventListener('pointerup', () => (drag = null));
    const kd = (e) => { keys[e.key] = e.type === 'keydown'; }; window.addEventListener('keydown', kd); window.addEventListener('keyup', kd);
    const hitHeart = (id) => {
      if (inv > 0) return;
      if (o.training) { taken += 1; inv = 0.85; ui.classList.remove('hurt'); void ui.offsetWidth; ui.classList.add('hurt'); ui.querySelector('.dhp').textContent = '✋ ' + taken; return; }
      const floor = o.spar ? 15 : 0;
      let d = dmgOf(id); if (F.hp() - d < floor) d = Math.max(0, F.hp() - floor);
      F.damage(d, { inFight: true, by: id }); taken += d; inv = 0.85;
      ui.querySelector('.dhp').textContent = Math.round(F.hp());
      ui.classList.remove('hurt'); void ui.offsetWidth; ui.classList.add('hurt');
      if (F.hp() <= floor) finish();
    };
    function finish() {
      if (over) return; over = true;
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', kd);
      setTimeout(() => { ui.remove(); document.body.classList.remove('fighting'); done(Math.round(taken)); }, 350);
    }
    const owner = (b) => b.owner || o.enemies[0];
    function frame(now) {
      if (over) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (pre > 0) pre -= dt; else { t += dt; inv = Math.max(0, inv - dt); }
      const ks = 150 * dt; if (keys.ArrowLeft) heart.x -= ks; if (keys.ArrowRight) heart.x += ks; if (keys.ArrowUp) heart.y -= ks; if (keys.ArrowDown) heart.y += ks;
      heart.x = MH.clamp(heart.x, heart.r, W - heart.r); heart.y = MH.clamp(heart.y, heart.r, H - heart.r);
      if (pre <= 0 && t < dur - 0.6) spawners.forEach((s) => { const n0 = bullets.length, r0 = rects.length; s.run(dt); for (let i = n0; i < bullets.length; i++) bullets[i].owner = s.id; for (let i = r0; i < rects.length; i++) rects[i].owner = s.id; });
      for (const b of bullets) {
        b.life -= dt;
        if (b.home) { const d = toward(b.x, b.y, 1); b.vx += d.vx * b.home * dt; b.vy += d.vy * b.home * dt; const sp = Math.hypot(b.vx, b.vy), mx = 150; if (sp > mx) { b.vx *= mx / sp; b.vy *= mx / sp; } }
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.wave != null) b.y = H / 2 + Math.sin(b.wave + b.x * 0.035) * b.amp;
        if (b.bounce) { if (b.x < b.r || b.x > W - b.r) b.vx *= -1; if (b.y < b.r || b.y > H - b.r) b.vy *= -1; }
        if (Math.hypot(b.x - heart.x, b.y - heart.y) < b.r + heart.r * 0.6) { b.life = 0; hitHeart(owner(b)); }
      }
      for (const r of rects) {
        if (r.warn != null) { if (r.warn > 0) r.warn -= dt; else r.live -= dt; }
        r.x += r.vx * dt; r.y += r.vy * dt;
        const active = r.warn == null || r.warn <= 0;
        if (active && heart.x > r.x && heart.x < r.x + r.w && heart.y > r.y && heart.y < r.y + r.h) hitHeart(owner(r));
      }
      for (let i = bullets.length - 1; i >= 0; i--) { const b = bullets[i]; if (b.life <= 0 || b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) bullets.splice(i, 1); }
      for (let i = rects.length - 1; i >= 0; i--) { const r = rects[i]; if ((r.live != null && r.live <= 0) || r.x > W + 30 || r.x + r.w < -30 || r.y > H + 30 || r.y + r.h < -30) rects.splice(i, 1); }
      // draw
      x.clearRect(0, 0, W, H); x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
      for (const r of rects) {
        const active = r.warn == null || r.warn <= 0;
        if (!active) { x.strokeStyle = 'rgba(255,70,70,' + (0.5 + 0.5 * Math.sin(t * 30)) + ')'; x.lineWidth = 2; x.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); x.fillStyle = 'rgba(255,60,60,0.12)'; x.fillRect(r.x, r.y, r.w, r.h); }
        else { x.fillStyle = r.col || '#ffffff'; x.fillRect(r.x, r.y, r.w, r.h); }
      }
      for (const b of bullets) { x.fillStyle = b.col; x.beginPath(); x.arc(b.x, b.y, b.r, 0, 7); x.fill(); }
      if (!(inv > 0 && Math.floor(t * 16) % 2)) {
        x.fillStyle = '#ff2a3a'; const hx = heart.x, hy = heart.y, s = heart.r;
        x.beginPath(); x.moveTo(hx, hy + s); x.bezierCurveTo(hx - s * 1.6, hy - s * 0.1, hx - s * 0.7, hy - s * 1.3, hx, hy - s * 0.35); x.bezierCurveTo(hx + s * 0.7, hy - s * 1.3, hx + s * 1.6, hy - s * 0.1, hx, hy + s); x.fill();
      }
      x.strokeStyle = '#fff'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, W - 3, H - 3);
      if (pre > 0) { // the countdown: get your heart in position
        const n = Math.ceil(pre), f = pre - Math.floor(pre);
        x.save(); x.globalAlpha = 0.35 + 0.65 * f; x.fillStyle = '#ffffff'; x.font = `900 ${Math.round(58 + 26 * f)}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(String(n), W / 2, H * 0.4); x.restore();
        x.fillStyle = 'rgba(255,255,255,0.7)'; x.font = '700 12px sans-serif'; x.textAlign = 'center'; x.fillText('get ready…', W / 2, H * 0.4 + 46);
      }
      ui.querySelector('.dtime i').style.width = Math.max(0, 100 - t / dur * 100) + '%';
      if (t >= dur) { finish(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  // old name, still used by a few callers
  F.inChat = (c, f) => F.begin(c, f);

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
    // the ones who jumped in remember it
    const sd = r.sides || { foes: [], friends: [] };
    sd.friends.forEach((id) => { S.addMemory(id, `Jumped into a fight to help ${p.name} against ${ch.name}.`, { imp: 3 }); S.changeBond(id, 3); S.changeRel(id, opp, -10); });
    sd.foes.forEach((id) => { S.addMemory(id, `Helped ${ch.name} fight ${p.name}.`, { imp: 3 }); S.changeBond(id, -4); S.changeRel(id, opp, 5); if (r.win) { const o = MH.npcById[id]; if (o) o.hurtUntil = MH.absMinutes() + 180; } });
    (sd.fled || []).forEach((id) => S.addMemory(id, `Saw ${p.name} get into a fight with ${ch.name} and ran for it.`, { imp: 2, kind: 'witness' }));
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
    let pa = F.power(a.id) + Math.random() * 2.2, pb = F.power(b.id) + Math.random() * 2.2;
    const helper = (x, y) => MH.npcs.find((o) => o !== a && o !== b && !o.hidden && !o.busy && !o.asleep && !o.chase && !F.isHurt(o) && MH.distTiles(o, x) < 9 && MH.roomOf(o) === MH.roomOf(x) && (MH.social.npc(o.id).rel[x.id] || 0) >= 50 && (MH.social.npc(o.id).rel[y.id] || 0) < 10 && F.power(o.id) >= 2);
    const ha = helper(a, b), hb = helper(b, a);
    if (ha) pa += F.power(ha.id) * 0.6; if (hb) pb += F.power(hb.id) * 0.6;
    MH.npcs.forEach((o) => { if (o !== a && o !== b && o !== ha && o !== hb && !o.hidden && !o.busy && !o.chase && MH.distTiles(o, a) < 8 && MH.roomOf(o) === MH.roomOf(a) && !MH.social.isTough(o.id) && F.power(o.id) <= 2 && Math.random() < 0.6) MH.sim.flee(o, a); });
    const [win, lose] = pa >= pb ? [a, b] : [b, a];
    const where = MH.world.placeAt(a.x, a.y).name;
    const pl = MH.player;
    const visible = Math.min(MH.distTiles(a, pl), MH.distTiles(b, pl)) < 14 && MH.roomOf(a) === MH.roomOf(pl) && !MH.chat.active;
    a.busy = b.busy = 'smalltalk'; a.face(b.x, b.y); b.face(a.x, a.y);
    if (visible) {
      a.showEmote('anger', 3); b.showEmote('anger', 3);
      MH.sim.vibeNow(`${a.ch.name} and ${b.ch.name} are FIGHTING near ${where}!${ha ? ' ' + ha.ch.name + ' jumps in for ' + a.ch.name + '!' : ''}${hb ? ' ' + hb.ch.name + ' jumps in for ' + b.ch.name + '!' : ''}`);
      for (let i = 0; i < 5; i++) { MH.render.burst((a.x + b.x) / 2 + MH.rand(-8, 8), (a.y + b.y) / 2 - 20, 'sparkle', 4); await new Promise((r) => setTimeout(r, 380)); }
      MH.chat.showBubble(win, win.ch.mute ? '*stands over them*' : MH.pick(['And STAY down.', 'That\'s what I thought.', 'Hmph.']), { dur: 3 });
      MH.chat.showBubble(lose, lose.ch.mute ? '*limps away*' : MH.pick(['Ow… OW…', 'This isn\'t over!', '*groans*']), { dur: 3 });
    } else if (!MH.chat.active) MH.sim.vibeNow(MH.pick([`You hear a scuffle near ${where}.`, `Somebody is brawling near ${where}.`]));
    lose.hurtUntil = MH.absMinutes() + 240; MH.social.npc(lose.id).mood = 'bruised';
    MH.social.changeRel(a.id, b.id, -8); MH.social.changeRel(b.id, a.id, -10);
    MH.social.addMemory(win.id, `Got into a fight with ${lose.ch.name} near ${where}${why ? ' (' + why + ')' : ''}. I won.`, { imp: 3, about: 'town' });
    MH.social.addMemory(lose.id, `${win.ch.name} beat me up near ${where}${why ? ' (' + why + ')' : ''}.`, { imp: 3, about: 'town' });
    MH.npcs.forEach((o) => { if (o !== a && o !== b && !o.hidden && MH.distTiles(o, a) < 10 && MH.roomOf(o) === MH.roomOf(a)) MH.social.addMemory(o.id, `Saw ${a.ch.name} and ${b.ch.name} get into a real fight near ${where}. ${win.ch.name} won.`, { imp: 2, kind: 'witness', about: 'town' }); });
    [ha, hb].forEach((hx) => { if (hx) MH.social.addMemory(hx.id, `Jumped into ${a.ch.name} and ${b.ch.name}'s fight near ${where} to help ${hx === ha ? a.ch.name : b.ch.name}.`, { imp: 3, about: 'town' }); });
    MH.social.grapevine(`${a.ch.name} and ${b.ch.name} had a fight near ${where}${ha || hb ? ' (' + [ha, hb].filter(Boolean).map((x) => x.ch.name).join(' and ') + ' jumped in)' : ''} — ${win.ch.name} won.`, [a.id, b.id]);
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
      if (b.dataset.v === '1') F.begin(c, Object.assign({}, f, { enemyFirst: false }));
      else if (mug) { const lost = Math.min(P().coins, MH.randi(15, 35)); P().coins -= lost; MH.chat.sendText(`*reluctantly hands over ${lost} coins*`); MH.social.addMemory(f.with, `${P().name} paid up when I mugged them (${lost} coins).`, { imp: 2 }); }
      else MH.chat.sendText(spar ? '*shakes head — maybe another time*' : '*backs off, hands raised*');
    }));
    document.getElementById('chat').appendChild(card);
  };
  F.hideOffer = () => { const old = document.getElementById('fightCard'); if (old) old.remove(); };
})(window.MH);
