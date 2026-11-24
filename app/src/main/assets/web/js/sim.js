// Mirehollow — world simulation: time, weather, schedules, villager brains, small talk, gossip, approaches, vibes.
'use strict';
(function (MH) {
  const T = MH.TILE;
  const sim = (MH.sim = { target: null, smalltalkTimer: 20, approachTimer: 25, vibeTimer: 25, approaching: null, pairCool: {}, lastVibe: '' });

  // ------------------------------------------------------------ time & days
  sim.currentGathering = function () {
    const d = MH.weekday(), h = MH.hour();
    return MH.GATHERINGS.find((g) => g.day === d && h >= g.from && h < g.to) || null;
  };

  sim.newDay = function (silent) {
    const st = MH.state;
    const r = Math.random();
    st.weather = r < 0.55 ? 'sunny' : r < 0.75 ? 'cloudy' : r < 0.95 ? 'rain' : 'storm';
    st.today = {
      nimbus: Math.random() < 0.3,
      solaris: st.weather === 'sunny' && Math.random() < 0.45,
      scarecrowSpot: 'field',
    };
    // moods drift back to defaults
    MH.CHARS.forEach((c) => { const n = st.npcs[c.id]; if (Math.random() < 0.6) n.mood = c.start.mood; });
    // regrow
    for (const k in st.picked) if (st.picked[k] < st.time.day) delete st.picked[k];
    if (!silent) {
      const g = MH.GATHERINGS.filter((x) => x.day === MH.weekday());
      MH.emit('newday', { gatherings: g });
    }
  };

  sim.advance = function (dtReal) {
    const st = MH.state;
    const chatting = MH.chat && MH.chat.active;
    const scale = (MH.settings.timeScale || 1) * (chatting ? 0.35 : 1);
    st.time.minutes += dtReal * scale;
    if (st.time.minutes >= 1440) { st.time.minutes -= 1440; st.time.day++; sim.newDay(); }
    if (st.stormUntil && MH.absMinutes() > st.stormUntil) { st.weather = 'cloudy'; st.stormUntil = 0; }
  };

  sim.sleepUntilMorning = function () {
    const st = MH.state;
    if (st.time.minutes >= 7 * 60) { st.time.day++; sim.newDay(); }
    st.time.minutes = 7 * 60;
    sim.placeEveryone();
  };

  // ------------------------------------------------------------ schedules
  function inRange(h, a, b) { return a <= b ? h >= a && h < b : h >= a || h < b; }
  sim.plan = function (id) {
    const ch = MH.CHAR[id], h = MH.hour(), d = MH.weekday();
    if (ch.visitor) {
      if (!MH.state.today[ch.visitor]) return { mode: 'away', loc: 'sky' };
    }
    if (id === 'scarecrow') return { mode: 'out', loc: MH.state.today.scarecrowSpot || 'field' };
    const g = MH.GATHERINGS.find((x) => x.day === d && h >= x.from && h < x.to && x.who.includes(id));
    if (g) return { mode: 'out', loc: g.at, gathering: g.name };
    let sched = ch.schedule;
    if (d === 1 && ch.tuesday) sched = ch.tuesday.concat(sched);
    if (d === 6 && ch.sunday) sched = ch.sunday.concat(sched);
    if (d === 4 && ch.friday) sched = ch.friday.concat(sched);
    for (const [a, b, where] of sched) {
      if (!inRange(h, a, b)) continue;
      if (where.startsWith('inside:')) return { mode: 'inside', loc: where.slice(7) };
      if (where.startsWith('nap:')) return { mode: 'nap', loc: where.slice(4) };
      if (MH.state.weather === 'storm' && !['kira', 'marina', 'maggie', 'nimbus', 'scarecrow', 'gertie'].includes(id) && Math.random() < 0.0) return { mode: 'inside', loc: ch.home };
      return { mode: 'out', loc: where };
    }
    return { mode: 'inside', loc: ch.home };
  };
  const planKey = (p) => p.mode + ':' + p.loc;

  function activityText(e, plan) {
    const L = MH.world.locations[plan.loc];
    const name = L ? L.name : plan.loc;
    if (plan.gathering) return 'at the ' + plan.gathering;
    if (plan.mode === 'nap') return 'napping at ' + name;
    if (plan.loc === e.ch.home) return 'at their own place (' + name + ')';
    return 'hanging around ' + name;
  }

  function hide(e) { e.hidden = true; e.path = null; e.asleep = false; }
  function unhideAt(e, loc) {
    const s = MH.world.doorFront(loc);
    e.setTile(s.tx, s.ty); e.hidden = false;
  }

  // Put everyone where they should be right now (load / sleep / big time skip).
  sim.placeEveryone = function () {
    MH.npcs.forEach((e) => {
      if (e.busy) return;
      const p = sim.plan(e.id);
      e.plan = p; e.planKey = planKey(p); e.activity = activityText(e, p);
      e.path = null; e.asleep = false;
      if (p.mode === 'away' || p.mode === 'inside') { hide(e); e.insideLoc = p.loc; return; }
      e.hidden = false;
      const s = MH.world.randomSpot(p.loc); e.setTile(s.tx, s.ty);
      if (p.mode === 'nap') e.asleep = true;
      e.state = 'idle'; e.idleT = MH.rand(2, 8);
    });
  };

  // ------------------------------------------------------------ villager brain
  function updateNpc(e, dt) {
    if (e.busy) { // in a conversation / small talk
      e.moving = false; e.frame = 0;
      if (e.walkToChat) {
        if (MH.npcWalk(e, dt)) { e.walkToChat = null; }
        else if (Math.random() < dt * 0.5) MH.npcGoTo(e, e.walkToChat.tx, e.walkToChat.ty);
      }
      return;
    }
    if (sim.approaching === e) return updateApproach(e, dt);

    const p = sim.plan(e.id);
    const key = planKey(p);
    if (key !== e.planKey) {
      // stagger reactions so the whole town doesn't move on the same frame
      if (e.planDelay == null) e.planDelay = MH.rand(0, 6) / Math.max(1, MH.settings.timeScale || 1);
      e.planDelay -= dt;
      if (e.planDelay > 0) { idleWander(e, dt); return; }
      e.planDelay = null;
      e.plan = p; e.planKey = key; e.activity = activityText(e, p);
      e.asleep = false;
      if (p.mode === 'away') {
        if (!e.hidden) { MH.render.burst(e.x, e.y - 20, e.id === 'nimbus' ? 'sparkle' : 'sparkle', 10); hide(e); }
        return;
      }
      if (e.hidden) {
        if (p.mode === 'inside') { e.insideLoc = p.loc; return; }
        if (e.ch.visitor) { const s = MH.world.randomSpot(p.loc); e.setTile(s.tx, s.ty); e.hidden = false; MH.render.burst(e.x, e.y - 20, 'sparkle', 14); sim.vibeNow(e.id === 'nimbus' ? 'A huge cloud drifts down over the square. Nimbus is in town.' : 'The air turns golden. Solaris has come down to visit.'); }
        else unhideAt(e, e.insideLoc || e.ch.home);
      }
      const dest = p.mode === 'inside' ? MH.world.doorFront(p.loc) : MH.world.randomSpot(p.loc);
      e.dest = dest;
      const far = MH.distTiles(e, MH.player) > 45 && Math.hypot(dest.tx * T - MH.player.x, dest.ty * T - MH.player.y) / T > 45;
      if (far) { e.setTile(dest.tx, dest.ty); e.path = []; }
      else MH.npcGoTo(e, dest.tx, dest.ty);
      e.state = 'travel';
      return;
    }
    if (e.hidden) return;
    if (e.state === 'travel') {
      if (MH.npcWalk(e, dt)) {
        if (e.plan.mode === 'inside') { hide(e); e.insideLoc = e.plan.loc; return; }
        if (e.plan.mode === 'nap') e.asleep = true;
        e.state = 'idle'; e.idleT = MH.rand(3, 9);
      }
      return;
    }
    idleWander(e, dt);
  }

  function idleWander(e, dt) {
    if (e.hidden) return;
    if (e.path && e.path.length) { MH.npcWalk(e, dt); return; }
    e.moving = false; e.frame = 0;
    if (e.asleep || e.id === 'scarecrow' || e.id === 'sable') return;
    e.idleT -= dt;
    if (e.idleT > 0) return;
    e.idleT = MH.rand(5, 14);
    // Patty might just fall asleep wherever she is
    if (e.id === 'patty' && Math.random() < 0.25) { e.asleep = true; return; }
    const loc = e.plan ? e.plan.loc : e.ch.home;
    const s = MH.world.randomSpot(loc);
    if (Math.hypot(s.tx * T - e.x, s.ty * T - e.y) / T < 10) MH.npcGoTo(e, s.tx, s.ty);
    else if (Math.random() < 0.3) e.dir = MH.pick(['down', 'left', 'right', 'up']);
  }

  // ------------------------------------------------------------ approaching the player
  function updateApproach(e, dt) {
    const pl = MH.player;
    e.approachT -= dt;
    if (MH.chat.active || e.approachT <= 0 || e.hidden) { sim.approaching = null; e.hurry = false; e.state = 'idle'; return; }
    if (MH.distTiles(e, pl) < 1.7) {
      sim.approaching = null; e.hurry = false; e.path = null; e.state = 'idle';
      e.face(pl.x, pl.y); pl.face(e.x, e.y);
      MH.chat.start([e.id], 'opener', e.approachReason);
      return;
    }
    e.repath -= dt;
    if (e.repath <= 0 || !e.path || !e.path.length) {
      e.repath = 0.8;
      const t = pl.tile();
      MH.npcGoTo(e, t.tx, t.ty);
      if (e.path && e.path.length) e.path.pop(); // stop next to the player, not on top
    }
    MH.npcWalk(e, dt);
  }

  sim.considerApproach = function () {
    if (MH.chat.active || sim.approaching || (MH.ui && MH.ui.modalOpen)) return;
    const pl = MH.player;
    let best = null, bestScore = 0.5;
    for (const e of MH.npcs) {
      if (e.hidden || e.asleep || e.busy || e.ch.elusive || e.ch.id === 'sable') continue;
      const d = MH.distTiles(e, pl);
      if (d > 16 || d < 1.5) continue;
      const n = MH.social.npc(e.id);
      const sinceTalk = MH.absMinutes() - n.lastTalk;
      if (sinceTalk < 180) continue;
      const att = MH.social.attitude(e.id);
      let score = Math.abs(att) / 160 + Math.random() * 0.35;
      const fresh = n.memories.filter((m) => m.about === 'player' && MH.absMinutes() - m.t < 240 && !m.discussed && m.kind !== 'self');
      if (fresh.length) score += 0.3;
      const outgoing = ['dionne', 'bunny', 'gertie', 'chuckles', 'clucky', 'sunny', 'mayor', 'mole', 'zahra', 'darkborn', 'maggie'].includes(e.id);
      if (!n.met && outgoing) score += 0.3;
      if (e.ch.mute) score -= 0.25;
      if (att < -25 && !fresh.length) score -= 0.25;
      if (score > bestScore) { bestScore = score; best = { e, fresh, n, att }; }
    }
    if (!best) return;
    const { e, fresh, n, att } = best;
    let reason;
    const P = MH.state.player;
    if (fresh.length) {
      const m = fresh[fresh.length - 1]; m.discussed = true;
      reason = `${e.ch.name} walked up to ${P.name} on purpose because of this: "${m.text}". They want to bring it up.`;
    } else if (!n.met) reason = `${e.ch.name} has not met the newcomer ${P.name} yet and walks over to introduce themselves, in character.`;
    else if (att >= 30) reason = `${e.ch.name} spotted ${P.name}, whom they like, and came over to chat.`;
    else if (att <= -25) reason = `${e.ch.name} dislikes ${P.name} and came over to have a word with them.`;
    else reason = `${e.ch.name} wandered over to ${P.name} with something on their mind.`;
    e.approachReason = reason;
    e.approachT = 30; e.repath = 0; e.hurry = MH.distTiles(e, pl) > 6;
    e.showEmote(att <= -25 ? 'anger' : '!', 2.5);
    sim.approaching = e;
  };

  // ------------------------------------------------------------ villager small talk & gossip
  sim.considerSmallTalk = async function () {
    if (MH.settings.ambient === 'off') return;
    const pl = MH.player;
    const free = MH.npcs.filter((e) => !e.hidden && !e.asleep && !e.busy && sim.approaching !== e && !(e.path && e.path.length > 3) && e.id !== 'scarecrow');
    const pairs = [];
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const a = free[i], b = free[j];
      if (MH.distTiles(a, b) > 4) continue;
      const k = [a.id, b.id].sort().join('|');
      if ((sim.pairCool[k] || -1e9) > MH.absMinutes()) continue;
      if (a.ch.mute && b.ch.mute) continue;
      const near = Math.min(MH.distTiles(a, pl), MH.distTiles(b, pl));
      pairs.push({ a, b, k, near });
    }
    if (!pairs.length) return;
    pairs.sort((x, y) => x.near - y.near);
    const pick = pairs[0].near < 14 ? pairs[0] : MH.pick(pairs);
    let { a, b } = pick;
    if (a.ch.mute) [a, b] = [b, a];
    sim.pairCool[pick.k] = MH.absMinutes() + 300;
    const visible = pick.near < 13 && !MH.chat.active;
    const gm = MH.social.pickGossip(a.id, b.id) || null;

    a.busy = b.busy = 'smalltalk';
    a.path = b.path = null;
    a.face(b.x, b.y); b.face(a.x, a.y);
    let res;
    try {
      // Only spend AI calls on chats the player can actually see.
      res = visible && MH.ai.hasKey() ? await MH.ai.smallTalk(a.id, b.id, gm) : MH.ai.offlineSmallTalk(a.id, b.id, gm);
    } catch (err) { res = MH.ai.offlineSmallTalk(a.id, b.id, gm); }
    if (!res || !res.lines.length) { a.busy = b.busy = null; return; }
    if (res.shared && gm) MH.social.spreadGossip(a.id, b.id, gm.text);
    if (res.rel) { MH.social.changeRel(a.id, b.id, res.rel); MH.social.changeRel(b.id, a.id, res.rel); }
    if (res.summary) MH.social.grapevine(res.summary, [a.id, b.id]);
    const where = MH.world.placeAt(a.x, a.y).name;
    if (visible) {
      MH.social.log({ kind: 'overheard', text: `${a.ch.name} & ${b.ch.name} — ${where}`, lines: res.lines });
      await MH.chat.playAmbient(res.lines, [a, b]);
    } else if (!MH.chat.active && Math.random() < 0.6) {
      sim.vibeNow(MH.pick([`You hear voices near ${where}.`, `Laughter drifts over from ${where}.`, `Someone is arguing near ${where}.`, `You hear some noises near ${where}.`]));
    }
    a.busy = b.busy = null;
    a.idleT = b.idleT = MH.rand(4, 10);
  };

  // ------------------------------------------------------------ vibe captions
  sim.vibeNow = function (text) { if (text && text !== sim.lastVibe) { sim.lastVibe = text; MH.emit('vibe', text); } };
  function randomVibe() {
    const h = MH.hour(), w = MH.state.weather;
    const place = MH.world.placeAt(MH.player.x, MH.player.y).key;
    let pool;
    if (w === 'storm') pool = MH.VIBES.storm;
    else if (w === 'rain' && Math.random() < 0.5) pool = MH.VIBES.rain;
    else if ((place === 'swamp' || place === 'stilthouse' || place === 'gatorgrove' || place === 'eastlane') && Math.random() < 0.7) pool = MH.VIBES.swamp;
    else if ((place === 'woods' || place === 'den') && Math.random() < 0.7) pool = MH.VIBES.woods;
    else if (place === 'field' && Math.random() < 0.7) pool = MH.VIBES.field;
    else pool = h < 5 || h >= 22 ? MH.VIBES.night : h < 10 ? MH.VIBES.morning : h < 18 ? MH.VIBES.day : MH.VIBES.evening;
    // event-driven vibes
    const gath = sim.currentGathering();
    if (gath && Math.random() < 0.35) return `The ${gath.name} is in full swing at ${MH.world.locations[gath.at].name}.`;
    const busyPlace = MH.npcs.filter((e) => !e.hidden && MH.distTiles(e, MH.player) > 14);
    if (busyPlace.length > 3 && Math.random() < 0.25) {
      const e = MH.pick(busyPlace);
      return `You hear some noises near ${MH.world.placeAt(e.x, e.y).name}.`;
    }
    return MH.pick(pool);
  }

  // Maggie's "blood runs"
  function swarmBite() {
    const h = MH.hour();
    const place = MH.world.placeAt(MH.player.x, MH.player.y).key;
    const nearSwamp = ['swamp', 'stilthouse', 'gatorgrove', 'eastlane', 'pond', 'tower'].includes(place);
    if (!(h >= 18 || h < 5) || !nearSwamp || MH.chat.active) return;
    if (Math.random() < 0.18) {
      sim.vibeNow(MH.pick(['Something bit you. Somewhere, someone giggles.', 'A mosquito lands on your neck. Steve, probably.', 'VRRRMMM. You slap your arm. Too late.']));
      MH.social.addMemory('maggie', 'My darlings got a taste of ' + MH.state.player.name + ' tonight. Hehehe. Delicious.', { imp: 1, kind: 'self' });
    }
  }

  // Scarecrow: appears in odd places, vanishes in crows when approached.
  function scarecrowTick(dt) {
    const e = MH.npcById.scarecrow;
    if (!e || e.busy) return;
    sim.scareT = (sim.scareT || 40) - dt;
    const pl = MH.player;
    const d = MH.distTiles(e, pl);
    const bond = MH.social.npc('scarecrow').bond;
    if (!e.hidden && d < 2.6 && !e.dodged && bond < 25) {
      e.dodged = true;
      if (Math.random() < 0.45) { vanishScarecrow(e); return; }
    }
    if (d > 3.5) e.dodged = false;
    if (sim.scareT <= 0) {
      sim.scareT = MH.rand(60, 160);
      const spots = ['field', 'field', 'field', 'square', 'lanes', 'pond', 'eastlane', 'woods', 'den', 'home'];
      const loc = MH.pick(spots);
      // only teleport when the player can't see her
      const s = MH.world.randomSpot(loc);
      if (MH.distTiles(e, pl) > 14 && Math.hypot(s.tx * T - pl.x, s.ty * T - pl.y) / T > 12) {
        MH.state.today.scarecrowSpot = loc;
        e.setTile(s.tx, s.ty); e.plan = { mode: 'out', loc }; e.planKey = 'out:' + loc; e.activity = 'standing perfectly still near ' + MH.world.locations[loc].name + ', watching';
        e.hidden = false;
      }
    }
  }
  function vanishScarecrow(e) {
    MH.render.burst(e.x, e.y - 20, 'crow', 16);
    sim.vibeNow(MH.pick(['The Scarecrow bursts into a flurry of crows.', 'You blink. The Scarecrow is gone. A feather drifts down.', 'Crows scatter. Where she stood, there is only straw.']));
    const loc = MH.pick(['field', 'woods', 'eastlane']);
    MH.state.today.scarecrowSpot = loc;
    const s = MH.world.randomSpot(loc);
    // leave a feather behind
    MH.world.props.push({ type: 'cap', x: e.x, y: e.y, tx: Math.floor(e.x / T), ty: Math.floor(e.y / T), flat: true, pick: 'feather', temp: true });
    e.setTile(s.tx, s.ty);
  }

  // ------------------------------------------------------------ interaction target
  MH.isPicked = (p) => MH.state.picked[p.tx + ',' + p.ty] != null;
  function findTarget() {
    const pl = MH.player;
    if (MH.chat.active) return null;
    // villagers
    let best = null, bd = 2.1;
    for (const e of MH.npcs) {
      if (e.hidden) continue;
      const big = (e.sprite.scale || 1) > 1 ? 0.8 : 0;
      const d = MH.distTiles(e, pl) - big;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) return { kind: 'npc', e: best, label: (best.asleep ? 'Wake ' : 'Talk to ') + best.ch.name };
    const t = pl.tile();
    // interactables
    for (const it of MH.world.interactables) {
      if (Math.abs(it.tx - t.tx) <= 1 && Math.abs(it.ty - t.ty) <= 1) {
        const label = it.type === 'door' ? (it.b.id === 'home' ? 'Rest at home' : 'Knock: ' + it.b.name) : it.label;
        return { kind: it.type === 'door' && it.b.id === 'home' ? 'sleep' : it.type, it, x: it.tx * T + 8, y: it.ty * T, label };
      }
    }
    // pickables
    let pb = null, pd = 1.3;
    for (const p of MH.world.props) {
      if (!p.pick || MH.isPicked(p)) continue;
      const d = Math.hypot(p.x - pl.x, p.y - pl.y) / T;
      if (d < pd) { pd = d; pb = p; }
    }
    if (pb) return { kind: 'pick', p: pb, x: pb.x, y: pb.y - 4, label: 'Pick ' + MH.ITEMS[pb.pick].name };
    return null;
  }

  sim.interact = function () {
    const t = sim.target;
    if (!t || MH.chat.active) return;
    const P = MH.state.player;
    if (t.kind === 'npc') {
      const e = t.e;
      let mode = 'player', payload = null;
      if (e.asleep) {
        e.asleep = false;
        payload = `${P.name} just woke ${e.ch.name} up from a nap. ${e.ch.name} reacts (in character — Kira HATES being woken).`;
        mode = 'opener';
      }
      if (sim.approaching === e) sim.approaching = null;
      MH.chat.start([e.id], mode === 'opener' ? 'opener' : 'greet', payload);
    } else if (t.kind === 'pick') {
      const p = t.p, it = MH.ITEMS[p.pick];
      MH.state.picked[p.tx + ',' + p.ty] = MH.state.time.day;
      MH.social.giveItem(it.name, null);
      MH.render.burst(p.x, p.y - 6, 'sparkle', 6);
      if (p.temp) MH.world.props.splice(MH.world.props.indexOf(p), 1);
      if (p.pick === 'corn' || p.pick === 'rose') {
        const sc = MH.npcById.scarecrow;
        const owner = p.pick === 'corn' ? 'the Scarecrow\'s field' : 'someone\'s fence';
        MH.social.witness(`${P.name} helped themselves to a ${it.name.toLowerCase()} from ${owner}.`, p.x, p.y, [], { chaotic: 1 }, 6);
        if (p.pick === 'corn' && sc && !sc.hidden && MH.distTiles(sc, MH.player) < 20) sim.vibeNow('Somewhere in the corn, something turns its head toward you.');
      }
    } else if (t.kind === 'sleep') MH.ui.sleepPrompt();
    else if (t.kind === 'board') MH.ui.openGrapevine();
    else if (t.kind === 'well') MH.ui.wellPrompt();
    else if (t.kind === 'door') sim.knock(t.it.b);
  };

  sim.knock = function (b) {
    const inside = MH.npcs.filter((e) => e.hidden && !e.busy && (e.insideLoc === b.id) && !e.ch.visitor);
    if (!inside.length) { sim.vibeNow(`You knock on the door of ${b.name}. Nobody answers.`); return; }
    const e = inside[0];
    const h = MH.hour();
    const late = h >= 22 || h < 6;
    unhideAt(e, b.id);
    e.state = 'idle';
    e.face(MH.player.x, MH.player.y);
    MH.chat.start([e.id], 'opener', `${MH.state.player.name} knocked on the door of ${b.name} ${late ? 'in the middle of the night' : 'at ' + MH.clockStr()}, and ${e.ch.name} opened it${late ? ' (they were asleep)' : ''}. They react in character.`);
  };

  // ------------------------------------------------------------ main update
  sim.update = function (dt) {
    sim.advance(dt);
    for (const e of MH.npcs) updateNpc(e, dt);
    if (MH.ui.modalOpen) { sim.target = null; MH.emit('target', null); return; }
    scarecrowTick(dt);
    sim.target = findTarget();
    MH.emit('target', sim.target);

    const amb = MH.settings.ambient;
    const every = amb === 'high' ? 18 : amb === 'low' ? 90 : amb === 'off' ? 1e9 : 40;
    sim.smalltalkTimer -= dt;
    if (sim.smalltalkTimer <= 0) { sim.smalltalkTimer = every * MH.rand(0.7, 1.3); sim.considerSmallTalk(); }
    sim.approachTimer -= dt;
    if (sim.approachTimer <= 0) { sim.approachTimer = MH.rand(18, 34); sim.considerApproach(); }
    sim.vibeTimer -= dt;
    if (sim.vibeTimer <= 0) {
      sim.vibeTimer = MH.rand(55, 120);
      if (!MH.chat.active) { if (Math.random() < 0.3) swarmBite(); else sim.vibeNow(randomVibe()); }
    }
  };
})(window.MH);
