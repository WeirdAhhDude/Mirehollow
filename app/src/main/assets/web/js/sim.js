// Mirehollow — world simulation: time, weather, schedules & haunts, outings, villager brains,
// small talk & gossip, (rare) approaches, train & crossings, gatherings, visits, meetups and parties.
'use strict';
(function (MH) {
  const T = MH.TILE;
  const sim = (MH.sim = { target: null, smalltalkTimer: 20, approachTimer: 60, vibeTimer: 25, folkTimer: 8, approaching: null, pairCool: {}, lastVibe: '' });

  // ------------------------------------------------------------ days
  sim.currentGathering = function () {
    const d = MH.weekday(), h = MH.hour();
    return MH.GATHERINGS.find((g) => g.day === d && h >= g.from && h < g.to) || null;
  };

  sim.newDay = function (silent) {
    const st = MH.state;
    const r = Math.random();
    st.weather = r < 0.55 ? 'sunny' : r < 0.75 ? 'cloudy' : r < 0.95 ? 'rain' : 'storm';
    const outings = MH.shuffle(MH.OUTINGS.slice()).slice(0, 3).map((o) => {
      const from = MH.randi(10, 17);
      return { who: o.who, loc: MH.pick(o.locs), from, to: from + MH.randi(2, 3), name: o.name };
    });
    const gojo = Math.random() < 0.2, sukuna = Math.random() < 0.16;
    const clash = gojo && sukuna && Math.random() < 0.5 ? (() => { const from = MH.randi(11, 19); return { loc: MH.pick(['scrub', 'pines', 'falls', 'foothills']), from, to: from + 2 }; })() : null;
    st.today = { gojo, sukuna, clash, nimbus: Math.random() < 0.3, solaris: (st.weather === 'sunny' && Math.random() < 0.5) || (st.weather === 'cloudy' && Math.random() < 0.12), scarecrowSpot: 'paddies', outings, fridge: false, announced: {} };
    MH.ALL.forEach((c) => { const n = st.npcs[c.id]; if (n && Math.random() < 0.6) n.mood = c.start.mood; });
    for (const k in st.picked) if (st.picked[k] < st.time.day) delete st.picked[k];
    st.plans = (st.plans || []).filter((p) => p.until > MH.absMinutes());
    // the tide brings a message in a bottle (sometimes two)
    if (MH.world.beachShore && MH.world.beachShore.length) {
      MH.world.props.filter((p) => p.type === 'bottle').forEach((p) => { MH.world.props.splice(MH.world.props.indexOf(p), 1); MH.render.removeProp && MH.render.removeProp(p); });
      for (let i = 0; i < (Math.random() < 0.35 ? 2 : 1); i++) { const [bx, by] = MH.pick(MH.world.beachShore); const p = MH.world.prop('bottle', bx, by, { flat: true, solid: false, pick: 'bottle', temp: true }); MH.render.addProp && MH.render.addProp(p); }
    }
    if (!silent) MH.emit('newday', { gatherings: MH.GATHERINGS.filter((x) => x.day === MH.weekday()) });
  };

  // things that happen once per day, after the day has rolled over
  function dayChores() {
    const p = MH.state.player;
    if (p.labHair) { p.look.hair = p.labHair; p.labHair = null; MH.refreshPlayerSprite && MH.player && MH.refreshPlayerSprite(); }
    MH.quests && MH.quests.tick();
    MH.social.compactAll(); // fuse long memory lists (AI summary when available), in the background
    MH.daySnapshot();
    MH.backup.snapshot('new day').catch(() => {});
    MH.backup.autoSave(true);
  }
  sim.advance = function (dtReal) {
    const st = MH.state;
    st.time.minutes += dtReal * (MH.settings.timeScale || 1) * sim.timeFactor();
    if (st.time.minutes >= 1440) { st.time.minutes -= 1440; st.time.day++; sim.newDay(); dayChores(); }
    if (st.stormUntil && MH.absMinutes() > st.stormUntil) { st.weather = 'cloudy'; st.stormUntil = 0; }
  };

  // How fast the clock runs right now: it crawls while you talk, play a game or fight, and slows down at
  // parties and town gatherings so they actually last.
  sim.timeFactor = function () {
    let f = 1;
    const party = (MH.state.parties || []).find((x) => x.status === 'active');
    if (party && (party.loc === 'home' ? MH.isInside(MH.player) : MH.world.placeAt(MH.player.x, MH.player.y).key === party.loc)) f = Math.min(f, 0.45);
    const g = sim.currentGathering();
    if (g && MH.world.placeAt(MH.player.x, MH.player.y).key === g.at) f = Math.min(f, 0.55);
    if (MH.chat && MH.chat.active) f = Math.min(f, MH.chat.convo && MH.chat.convo.phone ? 0.4 : 0.25);
    if ((MH.games && MH.games.busy) || document.body.classList.contains('fighting') || document.querySelector('.mg, .book')) f = Math.min(f, 0.15);
    return f;
  };

  // Sleeping skips to the next part of the day: morning → noon → late afternoon → late evening → next morning.
  sim.SLEEP_STOPS = [[7, 'morning'], [12, 'noon'], [17, 'late afternoon'], [21, 'late evening']];
  sim.nextWake = function () {
    const m = MH.state.time.minutes;
    const stop = sim.SLEEP_STOPS.find(([h]) => h * 60 > m + 20);
    return stop ? { min: stop[0] * 60, label: stop[1], nextDay: false } : { min: 7 * 60, label: 'morning', nextDay: true };
  };
  sim.sleepUntil = function (toMorning) {
    const st = MH.state, w = toMorning ? (st.time.minutes < 7 * 60 - 20 ? { min: 7 * 60, label: 'morning', nextDay: false } : { min: 7 * 60, label: 'morning', nextDay: true }) : sim.nextWake();
    if (w.nextDay || w.label === 'morning') (st.companions || []).slice().forEach((id) => sim.stopFollow(id, 'goes home for the night'));
    if (w.nextDay) { st.time.day++; sim.newDay(); }
    st.time.minutes = w.min;
    sim.placeEveryone();
    if (w.nextDay) dayChores(); else MH.daySnapshot();
    return w;
  };
  sim.sleepUntilMorning = () => sim.sleepUntil(true);

  // ------------------------------------------------------------ plans (visits, meetups, parties)
  sim.addPlan = function (p) {
    MH.state.plans = MH.state.plans || [];
    MH.state.plans = MH.state.plans.filter((q) => !(q.id === p.id && Math.abs(q.at - p.at) < 30));
    MH.state.plans.push(Object.assign({ arrived: false, met: false }, p));
  };
  sim.activePlan = function (id) {
    const now = MH.absMinutes();
    return (MH.state.plans || []).find((p) => p.id === id && now >= p.at && now < p.until && !p.done) || null;
  };

  // ------------------------------------------------------------ schedules
  const inRange = (h, a, b) => (a <= b ? h >= a && h < b : h >= a || h < b);
  function pickHaunt(ch, salt = 0) {
    const hs = ch.haunts && ch.haunts.length ? ch.haunts : [ch.home];
    const k = MH.hash2(ch.id.length * 13 + ch.id.charCodeAt(0), MH.state.time.day * 12 + Math.floor(MH.hour() / 2), 5 + salt);
    return hs[Math.floor(k * hs.length)];
  }
  sim.plan = function (id) {
    const ch = MH.CHAR[id], h = MH.hour(), d = MH.weekday();
    const ap = sim.activePlan(id);
    if (ap) return { mode: 'plan', loc: ap.loc, plan: ap };
    if (MH.fight && MH.fight.isHurt(MH.npcById[id]) && id !== 'owl') return { mode: 'out', loc: 'clinic', hurt: true };
    if (ch.visitor && !MH.state.today[ch.visitor]) return { mode: 'away', loc: 'sky' };
    if (id === 'scarecrow') return { mode: 'out', loc: MH.state.today.scarecrowSpot || 'paddies' };
    if (id === 'gojo' || id === 'sukuna') { const cl = MH.state.today.clash; if (cl && h >= cl.from && h < cl.to) return { mode: 'out', loc: cl.loc, clash: true }; }
    const g = MH.GATHERINGS.find((x) => x.day === d && h >= x.from && h < x.to && x.who.includes(id));
    if (g) return { mode: 'out', loc: g.at, gathering: g.name };
    let sched = ch.schedule;
    if (d === 1 && ch.tuesday) sched = ch.tuesday.concat(sched);
    if (d === 4 && ch.friday) sched = ch.friday.concat(sched);
    for (const [a, b, where] of sched) {
      if (!inRange(h, a, b)) continue;
      if (where.startsWith('inside:')) return { mode: 'inside', loc: where.slice(7) };
      const nap = where.startsWith('nap:');
      let loc = nap ? where.slice(4) : where;
      if (loc === 'roam') {
        const o = (MH.state.today.outings || []).find((x) => x.who.includes(id) && h >= x.from && h < x.to);
        if (o) return { mode: 'out', loc: o.loc, outing: o.name };
        loc = pickHaunt(ch);
        return { mode: nap ? 'nap' : 'out', loc, roam: true };
      }
      return { mode: nap ? 'nap' : 'out', loc };
    }
    return { mode: 'inside', loc: ch.home };
  };
  const planKey = (p) => p.mode + ':' + p.loc + (p.plan ? ':' + p.plan.at : '');

  function activityText(e, plan) {
    const L = MH.world.locations[plan.loc];
    const name = L ? L.name : 'somewhere';
    if (plan.mode === 'plan') return plan.plan.kind === 'party' ? 'heading to the player\'s party' : plan.plan.kind === 'visit' ? 'visiting the player\'s house as arranged' : 'waiting at ' + name + ' for the player, as arranged (' + (plan.plan.what || 'a meetup') + ')';
    if (plan.hurt) return 'limping to the clinic after a fight, bruised and sore';
    if (plan.clash) return `in the middle of a cataclysmic fight with ${e.id === 'gojo' ? 'Sukuna' : 'Gojo'} at ${name} — the ground is cracking and the air is splitting`;
    if (plan.gathering) return 'at the ' + plan.gathering;
    if (plan.outing) return 'out with friends (' + plan.outing + ') at ' + name;
    if (plan.mode === 'nap') return 'napping at ' + name;
    if (plan.loc === e.ch.home) return 'at their own place (' + name + ')';
    return 'hanging around ' + name;
  }

  function hide(e) { e.hidden = true; e.path = null; e.asleep = false; e.guest = false; }
  function unhideAt(e, loc) { const s = MH.world.doorFront(loc); e.setTile(s.tx, s.ty); e.hidden = false; }
  function destFor(plan) {
    if (plan.mode === 'inside') return MH.world.doorFront(plan.loc);
    if (plan.mode === 'plan' && plan.loc === 'home') return MH.world.doorFront('home');
    return MH.world.randomSpot(plan.loc);
  }

  sim.placeEveryone = function () {
    MH.npcs.forEach((e) => {
      if (e.busy) return;
      const p = sim.plan(e.id);
      e.plan = p; e.planKey = planKey(p); e.activity = activityText(e, p);
      e.path = null; e.asleep = false; e.guest = false;
      if (p.mode === 'away' || p.mode === 'inside') { hide(e); e.insideLoc = p.loc; return; }
      e.hidden = false;
      const s = destFor(p); e.setTile(s.tx, s.ty);
      if (p.mode === 'nap') e.asleep = true;
      e.state = 'idle'; e.idleT = MH.rand(2, 8);
    });
  };

  // ------------------------------------------------------------ villager brain
  function updateNpc(e, dt) {
    if (e.busy) {
      e.moving = false; e.frame = 0;
      if (e.walkToChat) { if (MH.npcWalk(e, dt)) e.walkToChat = null; }
      return;
    }
    if (e.chase) return chaseTick(e, dt);
    if (sim.approaching === e) return updateApproach(e, dt);
    if (e.following) return companionTick(e, dt);
    if (fearTick(e, dt)) return;
    if (e.seek) return seekTick(e, dt);
    const farFromPlayer = MH.distTiles(e, MH.player) > 50;
    const p = sim.plan(e.id);
    const key = planKey(p);
    if (key !== e.planKey) {
      if (e.planDelay == null) e.planDelay = MH.rand(0, 6) / Math.max(1, MH.settings.timeScale || 1);
      e.planDelay -= dt;
      if (e.planDelay > 0) { idleWander(e, dt); return; }
      e.planDelay = null;
      if (e.inRoom) { const R = MH.world.rooms[e.inRoom]; e.inRoom = null; e.staffSpot = null; const f = MH.world.doorFront(R.building); e.setTile(f.tx, f.ty); }
      const wasGuest = e.guest;
      e.plan = p; e.planKey = key; e.activity = activityText(e, p); e.asleep = false;
      if (wasGuest && !(p.mode === 'plan' && p.loc === 'home')) { e.guest = false; unhideAt(e, 'home'); }
      if (p.mode === 'away') { if (!e.hidden) { MH.render.burst(e.x, e.y - 20, 'sparkle', 10); hide(e); } return; }
      if (e.hidden) {
        if (p.mode === 'inside') { e.insideLoc = p.loc; return; }
        if (e.ch.visitor) {
          const s = MH.world.randomSpot(p.loc); e.setTile(s.tx, s.ty); e.hidden = false; MH.render.burst(e.x, e.y - 20, 'sparkle', 14);
          const where = MH.world.locations[p.loc] ? MH.world.locations[p.loc].name : 'town';
          if (e.ch.rare) { if (MH.distTiles(e, MH.player) < 30 && !MH.state.today.announced[e.id]) { MH.state.today.announced[e.id] = true; sim.vibeNow(e.id === 'gojo' ? 'The air goes very still. Somewhere close, someone is humming and crunching a candy.' : 'Every bird in the area goes silent at once. Something terrible is nearby.'); } }
          else {
          const msg = e.id === 'nimbus' ? `A huge cloud drifts down over ${where}. Nimbus is visiting!` : e.id === 'solaris' ? `The whole sky turns golden — Solaris has come down to visit, near ${where}!` : `${e.ch.name} has shown up near ${where}.`;
          if (!MH.state.today.announced[e.id]) { MH.state.today.announced[e.id] = true; sim.vibeNow(msg); MH.social.log({ kind: 'sys', text: '✨ ' + msg }); }
          }
        }
        else unhideAt(e, e.insideLoc || e.ch.home);
      }
      const dest = destFor(p);
      e.dest = dest;
      if (farFromPlayer && Math.hypot(dest.tx * T - MH.player.x, dest.ty * T - MH.player.y) / T > 50) { e.setTile(dest.tx, dest.ty); e.path = []; }
      else {
        MH.npcGoTo(e, dest.tx, dest.ty);
        // going to a party / visit / meetup from far away: skip ahead (off-screen) so they arrive in minutes, not hours
        if (p.mode === 'plan' && e.path && e.path.length > 30 && MH.distTiles(e, MH.player) > 20) {
          let k = e.path.length - 24;
          while (k > 0 && Math.hypot(e.path[k].tx * T - MH.player.x, e.path[k].ty * T - MH.player.y) / T < 18) k--;
          if (k > 0) { const n0 = e.path[k]; e.setTile(n0.tx, n0.ty); e.path = e.path.slice(k + 1); }
        }
      }
      e.state = 'travel';
      return;
    }
    if (e.hidden) return;
    if (e.state === 'travel') {
      if (MH.npcWalk(e, dt)) {
        if (e.plan.mode === 'inside') { hide(e); e.insideLoc = e.plan.loc; return; }
        if (e.plan.mode === 'nap') e.asleep = true;
        if (e.plan.mode === 'plan') arrivedForPlan(e, e.plan.plan);
        e.state = 'idle'; e.idleT = MH.rand(3, 9);
      }
      return;
    }
    if (e.plan && e.plan.mode === 'plan') return planWait(e, dt, e.plan.plan);
    if (!farFromPlayer) idleWander(e, dt);
  }

  function idleWander(e, dt) {
    if (e.hidden) return;
    if (e.path && e.path.length) { MH.npcWalk(e, dt); return; }
    e.moving = false; e.frame = 0;
    if (e.asleep || e.id === 'scarecrow' || e.id === 'sable') return;
    e.idleT -= dt;
    if (e.idleT > 0) return;
    e.idleT = MH.rand(5, 14);
    if (e.staffSpot) { // shop staff potter about behind their counter
      const R = MH.world.rooms[e.inRoom];
      if (R && Math.random() < 0.5) { const sp = MH.pick(R.staff); if (!MH.npcs.some((o) => o !== e && o.inRoom === e.inRoom && o.tile().tx === sp[0] && o.tile().ty === sp[1])) { MH.npcGoTo(e, sp[0], sp[1]); e.staffSpot = sp; } }
      else e.dir = MH.pick(['down', 'down', 'left', 'right']);
      return;
    }
    if (e.id === 'patty' && Math.random() < 0.25) { e.asleep = true; return; }
    const loc = e.inRoom ? 'in_' + e.inRoom : e.guest ? 'myroom' : e.plan ? e.plan.loc : e.ch.home;
    const s = MH.world.randomSpot(loc === 'home' ? 'myroom' : loc);
    if (Math.hypot(s.tx * T - e.x, s.ty * T - e.y) / T < 10) MH.npcGoTo(e, s.tx, s.ty);
    else if (Math.random() < 0.3) e.dir = MH.pick(['down', 'left', 'right', 'up']);
  }

  // arrived at the place they agreed on
  function arrivedForPlan(e, plan) {
    plan.arrived = true;
    if (plan.loc === 'home') {
      if (MH.isInside(MH.player)) { sim.guestArrives(e, plan); }
      else e.showEmote('?', 2);
    }
  }
  function planWait(e, dt, plan) {
    if (plan.loc === 'home') {
      if (e.guest) { idleWander(e, dt); return; }
      // waiting at the door: come in if the player is home or walks up
      if (MH.isInside(MH.player)) { sim.guestArrives(e, plan); return; }
      if (!plan.met && MH.distTiles(e, MH.player) < 4 && !MH.chat.active) {
        plan.met = true;
        MH.chat.start([e.id], 'opener', `${e.ch.name} came to ${MH.state.player.name}'s house for the ${plan.kind === 'party' ? 'party' : 'visit'} they agreed on and finds them outside the door.`);
      }
      return;
    }
    // meetup somewhere: wait, then walk up when the player arrives
    idleWander(e, dt);
    if (!plan.met && MH.distTiles(e, MH.player) < 6 && !MH.chat.active && !MH.ui.modalOpen) {
      plan.met = true;
      e.approachReason = `${e.ch.name} agreed earlier to meet ${MH.state.player.name} at ${MH.world.locations[plan.loc] ? MH.world.locations[plan.loc].name : 'this spot'} around ${MH.clockStr(plan.at % 1440)} (${plan.what || 'to hang out'}). The player just showed up — they greet them.`;
      e.approachT = 25; e.repath = 0; e.showEmote('!', 2);
      sim.approaching = e;
    }
  }
  sim.guestArrives = function (e, plan) {
    if (e.guest) return;
    MH.npcEnterHome(e);
    e.guest = true; plan.arrived = true;
    const P = MH.state.player;
    const crash = plan.kind === 'crash';
    const party = plan.partyId ? (MH.state.parties || []).find((x) => x.id === plan.partyId) : null;
    if (party) { party.arrived = party.arrived || []; if (!party.arrived.includes(e.id)) party.arrived.push(e.id); if (crash) (party.crashers = party.crashers || []).push(e.id); }
    MH.ui.toast(crash ? `😱 ${e.ch.name} crashed your party!` : `🚪 ${e.ch.name} arrived${party ? ' for your party' : ''}!`, crash ? 4 : 2.8);
    e.showEmote(crash ? '!' : party ? 'note' : 'heart', 2.5);
    if (MH.chat.active && MH.isInside(MH.player)) { MH.chat.addMember(e.id, crash ? 'barges in uninvited' : party ? 'arrives for the party' : 'arrives for the visit'); return; }
    if (!plan.met && !MH.chat.active) {
      plan.met = true;
      MH.chat.start([e.id], 'opener', crash
        ? `${e.ch.name} barges into ${P.name}'s party uninvited (they weren't invited and they know it). Drama is possible.`
        : party
        ? `${e.ch.name} arrives at ${P.name}'s ${party.theme ? '"' + party.theme + '" ' : ''}party at their house.`
        : `${e.ch.name} arrives at ${P.name}'s house for the visit they agreed on, and steps inside.`);
    }
  };

  // ------------------------------------------------------------ fear: villagers who think you're violent keep their distance
  function fearTick(e, dt) {
    if (e.fleeT > 0) {
      e.fleeT -= dt; e.hurry = true;
      if (!e.path || !e.path.length || MH.npcWalk(e, dt)) { e.fleeT = 0; e.hurry = false; e.idleT = MH.rand(3, 6); }
      return true;
    }
    if (e.hidden || e.asleep || e.guest || e.staffSpot || e.seek) return false;
    if (!MH.social.isAfraid(e.id)) return false;
    const pl = MH.player;
    if (MH.distTiles(e, pl) > 3.2 || MH.roomOf(e) !== MH.roomOf(pl) || (MH.chat.active && MH.chat.convo && MH.chat.convo.members.includes(e.id))) return false;
    sim.flee(e);
    return true;
  }
  sim.flee = function (e, from) {
    const pl = from || MH.player, t = e.tile();
    const dx = e.x - pl.x, dy = e.y - pl.y, L = Math.hypot(dx, dy) || 1;
    let tx = Math.round(t.tx + (dx / L) * 7), ty = Math.round(t.ty + (dy / L) * 7);
    const R = MH.world.roomAt(t.tx, t.ty);
    if (R) { tx = MH.clamp(tx, R.x0 + 1, R.x1 - 1); ty = MH.clamp(ty, R.y0 + 2, R.y1 - 2); }
    const sp = MH.world.nearestWalkable(tx, ty);
    MH.npcGoTo(e, sp.tx, sp.ty); e.fleeT = 4; e.hurry = true; e.asleep = false;
    e.showEmote(Math.random() < 0.5 ? 'sweat' : '!', 1.8);
    if (Math.random() < 0.35 && !e.ch.mute && !(MH.chat.active)) MH.chat.showBubble(e, MH.pick(['Eek!', 'S-stay back!', '*hurries away*', 'Don\'t hurt me!', 'Nope. Nope nope nope.', '*flinches*']), { dur: 2.2 });
  };

  // ------------------------------------------------------------ chases: someone runs after the player
  // kind: 'brawl' (wants a fight), 'mugging' (wants your money), 'playful' (a game of tag)
  const SHOUT = { brawl: ['GET BACK HERE!', 'You can\'t run forever!', 'Oi! We\'re not done!', 'Come here, coward!'], mugging: ['Your wallet, pigeon!', 'Toll\'s not paid yet!', 'Run, run… I like a chase.'], playful: ['Tag, you\'re it! Wait— no, I\'M it!', 'Hehe, come back!', 'Can\'t catch me— I mean, I\'ll catch YOU!'] };
  sim.startChase = function (e, opts) {
    if (!e || e.hidden || e.chase || e.following || e.id === 'scarecrow' || (e.ch.visitor && e.plan && e.plan.mode === 'away') || (MH.fight && MH.fight.isHurt(e))) return false;
    const kind = opts.kind || 'brawl';
    // someone right next to you needs a moment to wind up — that's your head start
    e.chase = Object.assign({ t: 0, max: kind === 'playful' ? 30 : 45, lost: 0, kind, delay: MH.distTiles(e, MH.player) < 4 ? 1.8 : 0.4 }, opts);
    e.busy = null; e.asleep = false; e.path = null; e.seek = null; e.inRoom = null; e.staffSpot = null; e.guest = false; e.fleeT = 0;
    if (sim.approaching === e) sim.approaching = null;
    e.showEmote(kind === 'playful' ? 'note' : 'anger', 2.5);
    if (!e.ch.mute) MH.chat.showBubble(e, opts.shout || MH.pick(SHOUT[kind]), { dur: 2.5 });
    MH.ui.toast(kind === 'playful' ? `🏃 ${e.ch.name} is chasing you (playfully)!` : `🏃 ${e.ch.name} is chasing you! Run!`, 3);
    MH.social.log({ kind: 'sys', text: `🏃 ${e.ch.name} ${opts.ally ? 'joined the chase' : 'started chasing you'}${opts.reason ? ' (' + opts.reason + ')' : ''}.` });
    if (kind !== 'playful' && !opts.ally) {
      // friends of the chaser join in…
      MH.npcs.filter((o) => o !== e && !o.hidden && !o.busy && !o.chase && !o.following && !o.asleep && MH.distTiles(o, e) < 14 && MH.roomOf(o) === MH.roomOf(e)
        && ((MH.social.npc(o.id).rel[e.id] || 0) >= 40 || (MH.BANDITS.includes(o.id) && MH.BANDITS.includes(e.id)))
        && MH.fight.power(o.id) >= 2 && !MH.social.isAfraid(o.id) && MH.social.attitude(o.id) < 30)
        .slice(0, 2).forEach((o) => setTimeout(() => sim.startChase(o, { kind, ally: e.id, reason: 'helping ' + e.ch.name }), 600 + Math.random() * 900));
      // …and timid bystanders scatter
      MH.npcs.forEach((o) => { if (o !== e && !o.hidden && !o.busy && !o.chase && !o.following && MH.distTiles(o, e) < 8 && MH.roomOf(o) === MH.roomOf(e) && !MH.social.isTough(o.id) && MH.fight.power(o.id) <= 2 && Math.random() < 0.6) sim.flee(o, e); });
    }
    return true;
  };
  function chaseTick(e, dt) {
    const c = e.chase, pl = MH.player, P = MH.state.player, now = MH.absMinutes();
    c.t += dt;
    if (MH.fight && (MH.fight.active || MH.fight._ko)) { MH.animate(e, dt, false); return; }
    const d = MH.distTiles(e, pl), same = MH.roomOf(e) === MH.roomOf(pl);
    const flying = (P.flyUntil || 0) > now, invis = (P.invisUntil || 0) > now;
    if (!same || invis || flying || d > 26) c.lost += dt; else c.lost = Math.max(0, c.lost - dt * 0.5);
    if (c.t > c.max || c.lost > 6) return chaseOver(e, false);
    if (c.t < c.delay) { e.face(pl.x, pl.y); MH.animate(e, dt, false); return; }
    if (d < 2.1 && same && !flying) return chaseOver(e, true);
    e.repath = (e.repath || 0) - dt;
    if (e.repath <= 0 || !e.path || !e.path.length) { e.repath = 0.4; const t = pl.tile(); MH.npcGoTo(e, t.tx, t.ty); if (e.path && e.path.length) e.path.pop(); }
    e.hurry = true;
    MH.npcWalk(e, dt);
    if (!e.ch.mute && Math.random() < dt * 0.12 && !MH.chat.active) MH.chat.showBubble(e, MH.pick(SHOUT[c.kind]), { dur: 2 });
  }
  function chaseOver(e, caught) {
    const c = e.chase; e.chase = null; e.hurry = false; e.path = null;
    const P = MH.state.player;
    if (!caught) {
      e.planKey = null; e.planDelay = 0;
      if (!e.ch.mute) MH.chat.showBubble(e, c.kind === 'playful' ? '*pants* Okay okay, you win!' : MH.pick(['*panting* …Next time.', 'This isn\'t over!', 'Tch. Got away.']), { dur: 3 });
      if (!c.ally) { MH.ui.toast(`${e.ch.name} gave up chasing you.`, 2.5); MH.social.addMemory(e.id, c.kind === 'playful' ? `Chased ${P.name} for fun; they got away.` : `Chased ${P.name} but they got away. Next time.`, { imp: 2 }); }
      return;
    }
    // caught: the scene continues (usually as a fight); allies who are close arrive too
    const crew = MH.npcs.filter((o) => o.chase && o.chase.ally === e.id && MH.distTiles(o, MH.player) < 6);
    crew.forEach((o) => { o.chase = null; o.hurry = false; o.path = null; });
    const ids = [e.id].concat(crew.map((o) => o.id));
    const fightKind = c.kind === 'mugging' ? 'mugging' : 'brawl';
    if (MH.chat.active) {
      if (MH.chat.convo.phone) { MH.chat.end(); }
      else { ids.forEach((id) => MH.chat.addMember(id, 'catches up with you, out of breath')); if (c.kind !== 'playful') MH.fight.offer(MH.chat.convo, { with: e.id, kind: fightKind }); return; }
    }
    if (sim.approaching) sim.approaching = null;
    MH.player.face(e.x, e.y); e.face(MH.player.x, MH.player.y);
    const reason = c.kind === 'playful'
      ? `${e.ch.name} was chasing ${P.name} for fun and just caught them (tag!). Playful, breathless.`
      : `${e.ch.name}${crew.length ? ' (with ' + crew.map((o) => o.ch.name).join(' and ') + ')' : ''} chased ${P.name} down and caught them${c.reason ? ' — ' + c.reason : ''}. Out of breath and ready to ${c.kind === 'mugging' ? 'take their money' : 'fight'}.`;
    MH.chat.start(ids, 'opener', reason);
    if (MH.chat.convo) {
      if (c.kind !== 'playful') MH.chat.convo.pendingFight = { with: e.id, kind: fightKind };
      // you just got caught: no running off again (playful catches hold you for a moment too)
      MH.chat.convo.lock = { by: e.id, why: c.kind === 'playful' ? `${e.ch.name} is holding on to you, laughing` : `${e.ch.name} has you cornered`, turns: c.kind === 'playful' ? 1 : 4 };
    }
  }
  sim.chasers = () => MH.npcs.filter((e) => e.chase);

  // ------------------------------------------------------------ companions (villagers following the player)
  function nearPlayerSpot() {
    const t = MH.player.tile();
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, 0], [-1, 0], [0, 1], [2, 1], [-2, 1], [0, 2], [1, 2], [-1, 2]]) if (MH.world.walkable(t.tx + dx, t.ty + dy)) return { tx: t.tx + dx, ty: t.ty + dy };
    return MH.world.nearestWalkable(t.tx, t.ty);
  }
  function companionTick(e, dt) {
    const pl = MH.player;
    e.hidden = false; e.asleep = false; e.inRoom = null; e.staffSpot = null;
    const d = MH.distTiles(e, pl);
    if (MH.roomOf(e) !== MH.roomOf(pl) || d > 26) { const s = nearPlayerSpot(); e.setTile(s.tx, s.ty); e.path = null; e.dir = 'up'; return; }
    if (d > 2.4) {
      e.repath = (e.repath || 0) - dt;
      if (e.repath <= 0 || !e.path || !e.path.length) { e.repath = 0.6; const t = pl.tile(); MH.npcGoTo(e, t.tx, t.ty); if (e.path && e.path.length) e.path.pop(); }
      e.hurry = d > 5;
      MH.npcWalk(e, dt);
    } else { e.path = null; e.hurry = false; MH.animate(e, dt, false); if (Math.random() < dt * 0.5) e.face(pl.x, pl.y); }
  }
  // texted to come over: they head to wherever the player is right now
  sim.summon = function (id) {
    const ch = MH.CHAR[id], e = MH.npcById[id]; if (!ch || !e) return;
    const R = MH.roomOf(MH.player);
    const loc = R === 'home' ? 'home' : R ? 'in_' + R : MH.world.placeAt(MH.player.x, MH.player.y).key;
    const now = MH.absMinutes();
    sim.addPlan({ id, kind: loc === 'home' ? 'visit' : 'meet', loc: MH.world.locations[loc] || loc === 'home' ? loc : 'square', at: now, until: now + 150, what: 'came over because the player texted them' });
    e.planKey = null; if (e.hidden && e.plan && e.plan.mode === 'inside') e.planDelay = 0;
    MH.ui.toast(`📱 ${ch.name} is on their way!`, 3.5);
    MH.social.addMemory(id, `${MH.state.player.name} texted me to come over to ${loc === 'home' ? 'their house' : (MH.world.locations[loc] || {}).name || 'them'}. I'm going.`, { imp: 2 });
  };
  sim.startFollow = function (id) {
    const e = MH.npcById[id]; if (!e || e.following) return;
    MH.state.companions = MH.state.companions || [];
    if (!MH.state.companions.includes(id)) MH.state.companions.push(id);
    e.following = true; e.guest = false; e.inRoom = null; e.planKey = null;
    MH.social.addMemory(id, `Went along with ${MH.state.player.name} — following them around for a bit.`, { imp: 1 });
    MH.ui.toast(`🚶 ${e.ch.name} is coming with you`, 3);
    MH.emit('companions');
  };
  sim.stopFollow = function (id, how) {
    const e = MH.npcById[id];
    MH.state.companions = (MH.state.companions || []).filter((x) => x !== id);
    if (e && e.following) { e.following = false; e.path = null; e.planKey = null; e.planDelay = 0; MH.ui.toast(`${e.ch.name} ${how || 'heads off on their own'}`, 3); }
    MH.emit('companions');
  };
  sim.restoreCompanions = function () { (MH.state.companions || []).forEach((id) => { const e = MH.npcById[id]; if (e) { e.following = true; const s = nearPlayerSpot(); e.setTile(s.tx, s.ty); e.hidden = false; } }); };

  // ------------------------------------------------------------ villagers' own drama: rivals seek each other out and argue
  function seekTick(e, dt) {
    const t = MH.npcById[e.seek.target];
    e.seek.t -= dt;
    if (!t || t.hidden || t.busy || e.seek.t <= 0 || MH.chat.active && MH.chat.convo && (MH.chat.convo.members.includes(e.id))) { e.seek = null; e.hurry = false; e.planKey = null; return; }
    if (MH.distTiles(e, t) < 2) { const why = e.seek.why; e.seek = null; e.hurry = false; sim.argue(e, t, why); return; }
    e.repath = (e.repath || 0) - dt;
    if (e.repath <= 0 || !e.path || !e.path.length) { e.repath = 1; const tt = t.tile(); MH.npcGoTo(e, tt.tx, tt.ty); if (e.path && e.path.length) e.path.pop(); }
    e.hurry = true;
    MH.npcWalk(e, dt);
  }
  sim.considerDrama = function () {
    if (MH.settings.ambient === 'off') return;
    const pl = MH.player, now = MH.absMinutes();
    const free = MH.npcs.filter((e) => !e.hidden && !e.asleep && !e.busy && !e.following && !e.guest && !e.seek && !e.ch.mute && !e.folk && sim.approaching !== e);
    const pairs = [];
    for (const a of free) for (const b of free) {
      if (a === b) continue;
      const r = MH.social.npc(a.id).rel[b.id];
      if (r == null || r > -25) continue;
      const d = MH.distTiles(a, b);
      if (d > 34 || MH.roomOf(a) !== MH.roomOf(b)) continue;
      const k = 'd|' + [a.id, b.id].sort().join('|');
      if ((sim.pairCool[k] || -1e9) > now) continue;
      pairs.push({ a, b, k, r, near: Math.min(MH.distTiles(a, pl), MH.distTiles(b, pl)) });
    }
    if (!pairs.length) return;
    pairs.sort((x, y) => x.near - y.near + (x.r - y.r) * 0.05);
    const p = pairs[0].near < 20 || Math.random() < 0.4 ? pairs[0] : MH.pick(pairs);
    sim.pairCool[p.k] = now + 720;
    const note = MH.CHAR[p.a.id].relations && MH.CHAR[p.a.id].relations[p.b.id] ? MH.CHAR[p.a.id].relations[p.b.id][1] : 'an old grudge';
    p.a.seek = { target: p.b.id, t: 40, why: note };
    p.a.showEmote('anger', 2);
  };
  // the Hollow Gang and the town's bullies go after other villagers now and then
  const HARASS = {
    rook: (b) => `Rook corners ${b} and demands a "road toll", twirling his knife`,
    gristle: (b) => `Gristle shakes ${b} down for "protection money", cracking his knuckles`,
    snitch: (b) => `Snitch tries to pickpocket ${b} and gets caught red-handed`,
    mortimer: (b) => `Mortimer Vale hounds ${b} about money they supposedly owe him, coldly threatening them`,
    vesper: (b) => `Vesper sweetly spreads a cruel rumour about ${b} to their face, trying to make them cry`,
  };
  sim.considerHarass = function () {
    if (MH.settings.ambient === 'off') return;
    const bullies = MH.npcs.filter((e) => MH.VILLAINS.includes(e.id) && !e.hidden && !e.asleep && !e.busy && !e.following && !e.guest && !e.seek && sim.approaching !== e && !(MH.fight && MH.fight.isHurt(e)));
    if (!bullies.length) return;
    const a = MH.pick(bullies);
    const victims = MH.npcs.filter((v) => v !== a && !v.hidden && !v.busy && !v.asleep && !v.following && !v.guest && !MH.VILLAINS.includes(v.id) && !MH.social.isTough(v.id) && v.id !== 'scarecrow' && !v.ch.visitor && MH.roomOf(v) === MH.roomOf(a) && MH.distTiles(v, a) < 30);
    if (!victims.length) return;
    victims.sort((x, y) => MH.distTiles(x, a) - MH.distTiles(y, a));
    const b = MH.pick(victims.slice(0, 4));
    const why = HARASS[a.id] ? HARASS[a.id](b.ch.name) : `${a.ch.name} picks on ${b.ch.name}`;
    a.seek = { target: b.id, t: 45, why, harass: true };
    if (Math.min(MH.distTiles(a, MH.player), MH.distTiles(b, MH.player)) < 22 && !MH.chat.active) sim.vibeNow(`${a.ch.name} is heading for ${b.ch.name}… that can't be good.`);
  };
  sim.argue = async function (a, b, why) {
    if (a.busy || b.busy) return;
    a.busy = b.busy = 'smalltalk'; a.path = b.path = null;
    a.face(b.x, b.y); b.face(a.x, a.y);
    const pl = MH.player;
    const near = Math.min(MH.distTiles(a, pl), MH.distTiles(b, pl));
    const visible = near < 13 && !MH.chat.active && MH.roomOf(a) === MH.roomOf(pl);
    let res;
    try { res = visible && MH.ai.hasKey() ? await MH.ai.smallTalk(a.id, b.id, null, why) : MH.ai.offlineSmallTalk(a.id, b.id, null, why); }
    catch (err) { res = MH.ai.offlineSmallTalk(a.id, b.id, null, why); }
    const where = MH.world.placeAt(a.x, a.y).name;
    if (res && res.lines.length) {
      MH.social.changeRel(a.id, b.id, Math.min(-1, res.rel)); MH.social.changeRel(b.id, a.id, Math.min(-1, res.rel));
      MH.social.grapevine(res.summary || `${a.ch.name} and ${b.ch.name} argued ${where}.`, [a.id, b.id]);
      // bystanders remember the scene
      MH.npcs.forEach((o) => { if (o !== a && o !== b && !o.hidden && MH.distTiles(o, a) < 9 && MH.roomOf(o) === MH.roomOf(a)) MH.social.addMemory(o.id, `Saw ${a.ch.name} and ${b.ch.name} have a row ${where}.`, { imp: 1, kind: 'witness', about: 'town' }); });
      MH.social.addMemory(a.id, `Had it out with ${b.ch.name} ${where}.`, { imp: 2, about: 'town' });
      MH.social.addMemory(b.id, `${a.ch.name} came at me ${where}. Ugh.`, { imp: 2, about: 'town' });
      if (visible) { MH.social.log({ kind: 'overheard', text: `⚡ ${a.ch.name} vs ${b.ch.name} — ${where}`, lines: res.lines }); a.showEmote('anger', 3); await MH.chat.playAmbient(res.lines); }
      else if (!MH.chat.active) sim.vibeNow(MH.pick([`You hear shouting near ${where}.`, `Somebody is having a row near ${where}.`, `Raised voices drift over from ${where}.`]));
    }
    a.busy = b.busy = null;
    // sometimes it doesn't stay verbal
    const rel = MH.social.npc(a.id).rel[b.id] || 0;
    const bully = MH.VILLAINS.includes(a.id) && a.id !== 'vesper' && a.id !== 'snitch';
    if (MH.fight && ((bully && Math.random() < 0.3) || (rel <= -50 && MH.fight.power(a.id) >= 2 && MH.fight.power(b.id) >= 2 && Math.random() < 0.15))) { await MH.fight.npcFight(a, b, why); return; }
    if (bully && visible) sim.vibeNow(`${b.ch.name} looks shaken after that run-in with ${a.ch.name}.`);
    // the loser of the argument storms off
    const loser = Math.random() < 0.5 ? a : b; loser.planKey = null; loser.planDelay = 0;
    a.idleT = b.idleT = MH.rand(3, 8);
  };

  // ------------------------------------------------------------ approaching the player (rare)
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
    if (e.repath <= 0 || !e.path || !e.path.length) { e.repath = 0.8; const t = pl.tile(); MH.npcGoTo(e, t.tx, t.ty); if (e.path && e.path.length) e.path.pop(); }
    MH.npcWalk(e, dt);
  }

  sim.considerApproach = function () {
    if (MH.chat.active || sim.approaching || MH.ui.modalOpen || MH.roomOf(MH.player) || (MH.fight && (MH.fight.active || MH.fight._ko))) return;
    const now = MH.absMinutes();
    if (now - (MH.state.lastApproach || -99999) < 300) return; // at most one every ~5 game hours
    const pl = MH.player;
    let best = null, bestScore = 0.9;
    for (const e of MH.npcs) {
      if (e.hidden || e.asleep || e.busy || e.folk || e.ch.elusive || e.id === 'sable' || e.guest || e.following || e.seek || MH.social.isAfraid(e.id) || (MH.fight && MH.fight.isHurt(e))) continue;
      if ((MH.state.player.invisUntil || 0) > now) continue;
      const d = MH.distTiles(e, pl);
      if (d > 14 || d < 2) continue;
      const n = MH.social.npc(e.id);
      if (now - n.lastTalk < 360 || now - (n.lastApproach || -99999) < 1440) continue;
      const att = MH.social.attitude(e.id);
      const fresh = n.memories.filter((m) => m.about === 'player' && now - m.t < 360 && !m.discussed && m.kind !== 'self' && m.imp >= 2);
      let score = Math.random() * 0.3;
      if (fresh.length) score += 0.55;
      if (att >= 55) score += 0.45;
      if (att <= -40 && fresh.length) score += 0.3;
      const favour = !e.ch.bandit && att >= 8 && MH.quests && MH.quests.canOffer(e.id) && Math.random() < 0.35;
      if (favour) score += 0.7;
      const quiet = MH.hour() >= 19 || MH.hour() < 5 || !['square', 'well', 'bakery', 'station', 'mall', 'myroom'].includes(MH.world.placeAt(pl.x, pl.y).key);
      const mug = e.ch.bandit && e.id !== 'snitch' && att < 15 && quiet && Math.random() < 0.5;
      if (mug) score += 0.9;
      if (e.ch.mute) score -= 0.4;
      if (score > bestScore) { bestScore = score; best = { e, fresh, n, att, favour, mug }; }
    }
    if (!best || Math.random() < 0.4) return;
    const { e, fresh, n, att, favour, mug } = best;
    const P = MH.state.player;
    let reason;
    if (mug) { n.lastApproach = now; MH.state.lastApproach = now; sim.startChase(e, { kind: 'mugging', reason: 'a "road toll"' }); return; }
    else if (favour && (!fresh.length || Math.random() < 0.5)) reason = `${e.ch.name} came over because they need a favour from ${P.name}: they ask the player to help with something specific to their life (offer it as a "quest" — the player may refuse).`;
    else if (fresh.length) { const m = fresh[fresh.length - 1]; m.discussed = true; reason = `${e.ch.name} walked up to ${P.name} on purpose because of this: "${m.text}". They want to bring it up.`; }
    else if (att >= 55) reason = `${e.ch.name} spotted ${P.name}, whom they really like, and came over to chat.`;
    else reason = `${e.ch.name} came over to ${P.name} with something on their mind.`;
    e.approachReason = reason;
    e.approachT = 30; e.repath = 0; e.hurry = MH.distTiles(e, pl) > 6;
    e.showEmote(att <= -25 ? 'anger' : '!', 2.5);
    n.lastApproach = now; MH.state.lastApproach = now;
    sim.approaching = e;
  };

  // ------------------------------------------------------------ small talk & gossip
  sim.considerSmallTalk = async function () {
    if (MH.settings.ambient === 'off') return;
    const pl = MH.player;
    const free = MH.npcs.filter((e) => !e.hidden && !e.asleep && !e.busy && sim.approaching !== e && !(e.path && e.path.length > 3) && e.id !== 'scarecrow' && !e.guest && !e.following && !e.seek);
    const pairs = [];
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const a = free[i], b = free[j];
      if (MH.distTiles(a, b) > 4) continue;
      const k = [a.id, b.id].sort().join('|');
      if ((sim.pairCool[k] || -1e9) > MH.absMinutes()) continue;
      if (a.ch.mute && b.ch.mute) continue;
      pairs.push({ a, b, k, near: Math.min(MH.distTiles(a, pl), MH.distTiles(b, pl)) });
    }
    if (!pairs.length) return;
    pairs.sort((x, y) => x.near - y.near);
    const pick = pairs[0].near < 14 ? pairs[0] : MH.pick(pairs);
    let { a, b } = pick;
    if (a.ch.mute || (a.folk && !b.folk)) [a, b] = [b, a];
    sim.pairCool[pick.k] = MH.absMinutes() + 300;
    const visible = pick.near < 12 && !MH.chat.active && MH.roomOf(a) === MH.roomOf(pl);
    const gm = MH.social.pickGossip(a.id, b.id) || null;
    a.busy = b.busy = 'smalltalk';
    a.path = b.path = null;
    a.face(b.x, b.y); b.face(a.x, a.y);
    let res;
    const useAI = visible && MH.ai.hasKey() && !(a.folk && b.folk);
    try { res = useAI ? await MH.ai.smallTalk(a.id, b.id, gm) : MH.ai.offlineSmallTalk(a.id, b.id, gm); }
    catch (err) { res = MH.ai.offlineSmallTalk(a.id, b.id, gm); }
    if (!res || !res.lines.length) { a.busy = b.busy = null; return; }
    if (res.shared && gm) MH.social.spreadGossip(a.id, b.id, gm.text);
    if (res.rel) { MH.social.changeRel(a.id, b.id, res.rel); MH.social.changeRel(b.id, a.id, res.rel); }
    if (res.summary && !(a.folk && b.folk)) MH.social.grapevine(res.summary, [a.id, b.id]);
    const where = MH.world.placeAt(a.x, a.y).name;
    if (visible) {
      MH.social.log({ kind: 'overheard', text: `${a.ch.name} & ${b.ch.name} — ${where}`, lines: res.lines });
      await MH.chat.playAmbient(res.lines, [a, b]);
    } else if (!MH.chat.active && Math.random() < 0.35 && !(a.folk && b.folk)) {
      sim.vibeNow(MH.pick([`You hear voices near ${where}.`, `Laughter drifts over from ${where}.`, `Someone is arguing near ${where}.`, `You hear some noises near ${where}.`]));
    }
    a.busy = b.busy = null;
    a.idleT = b.idleT = MH.rand(4, 10);
  };

  // townsfolk muttering as you pass by
  function folkChatter() {
    if (MH.chat.active) return;
    const near = MH.npcs.filter((e) => e.folk && !e.hidden && !e.busy && !e.asleep && MH.distTiles(e, MH.player) < 7);
    if (!near.length) return;
    const e = MH.pick(near);
    MH.chat.showBubble(e, MH.pick(e.ch.offline), { dur: 3.4 });
  }

  // ------------------------------------------------------------ vibes
  sim.vibeNow = function (text) { if (text && text !== sim.lastVibe) { sim.lastVibe = text; MH.emit('vibe', text); } };
  function randomVibe() {
    const h = MH.hour(), w = MH.state.weather;
    const room = MH.roomOf(MH.player);
    if (room === 'home') return MH.pick(['The house creaks softly.', 'A train rumbles past outside; the windows hum.', 'Somewhere outside, cicadas.', 'The fridge hums contentedly.']);
    if (room) return MH.pick(({ bakery: ['The ovens tick as they heat.', 'A tray of cinnamon rolls comes out. Everyone pretends not to stare.'], gym: ['Somebody drops a weight. Box doesn\'t flinch.', 'The punching bag creaks on its chain.'], lab: ['Something in a vial goes "blorp".', 'The dimensional sink hums a low note.'], store: ['The drinks fridge hums.', 'A price tag judges you silently.'], club: ['The bass thumps through the floor.', 'The dance floor lights shift colour.'], townhall: ['Papers rustle in a draft.', 'A clock ticks, slightly wrong.'], clinic: ['It smells of mint and antiseptic.', 'Somewhere, a quiet "hoo".'], barber: ['Snip, snip. Snip.', 'Hair drifts across the floor.'] })[room] || ['It\'s cozy in here.']);
    const place = MH.world.placeAt(MH.player.x, MH.player.y).key;
    let pool;
    if (w === 'storm') pool = MH.VIBES.storm;
    else if (w === 'rain' && Math.random() < 0.5) pool = MH.VIBES.rain;
    else if (['swamp', 'stilthouse', 'gatorgrove', 'eastlane'].includes(place) && Math.random() < 0.7) pool = MH.VIBES.swamp;
    else if (['woods', 'den', 'shrine'].includes(place) && Math.random() < 0.7) pool = MH.VIBES.woods;
    else if (['paddies', 'field'].includes(place) && Math.random() < 0.7) pool = MH.VIBES.field;
    else pool = h < 5 || h >= 22 ? MH.VIBES.night : h < 10 ? MH.VIBES.morning : h < 18 ? MH.VIBES.day : MH.VIBES.evening;
    const gath = sim.currentGathering();
    if (gath && Math.random() < 0.35) return `The ${gath.name} is in full swing at ${MH.world.locations[gath.at].name}.`;
    const busy = MH.npcs.filter((e) => !e.hidden && !e.folk && MH.distTiles(e, MH.player) > 14);
    if (busy.length > 3 && Math.random() < 0.25) return `You hear some noises near ${MH.world.placeAt(MH.pick(busy).x, MH.pick(busy).y).name}.`;
    return MH.pick(pool);
  }
  function swarmBite() {
    const h = MH.hour();
    const place = MH.world.placeAt(MH.player.x, MH.player.y).key;
    if (MH.state.today.bugspray) return false;
    if (!(h >= 18 || h < 5) || !['swamp', 'stilthouse', 'gatorgrove', 'eastlane', 'pond', 'tower', 'river'].includes(place) || MH.chat.active) return false;
    if (Math.random() < 0.3) {
      sim.vibeNow(MH.pick(['Something bit you. Somewhere, someone giggles.', 'A mosquito lands on your neck. Steve, probably.', 'VRRRMMM. You slap your arm. Too late.']));
      MH.social.addMemory('maggie', 'My darlings got a taste of ' + MH.state.player.name + ' tonight. Hehehe. Delicious.', { imp: 1, kind: 'self' });
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ Clucky's chicks: not characters, just tiny chaos
  // They stick near Clucky (or the Coop), swarm the player's feet when they get close, peep a lot, and one
  // occasionally tags along across town until Clucky notices.
  const CHICK_NAMES = ['Pippa', 'Nugget', 'Peep', 'Omelette', 'Sprout', 'Bean'];
  MH.chicks = [];
  function chickAnchor() {
    const cl = MH.npcById.clucky, R = MH.world.rooms.coop;
    if (cl && !cl.hidden && !cl.busy && MH.roomOf(cl) !== 'coop') return { x: cl.x, y: cl.y, inside: false };
    const night = MH.hour() >= 21 || MH.hour() < 6;
    if (night || (cl && (cl.hidden || MH.roomOf(cl) === 'coop'))) return { x: (R.x0 + R.x1) / 2 * T, y: (R.y0 + 5) * T, inside: true, asleep: night };
    const f = MH.world.doorFront('coop'); return { x: f.tx * T + 8, y: (f.ty + 1) * T, inside: false };
  }
  function chickTick(dt) {
    if (!MH.chicks.length) MH.chicks = CHICK_NAMES.map((name, i) => ({ name, x: 0, y: 0, vx: 0, vy: 0, t: MH.rand(0, 3), peep: 0, i, placed: false }));
    const A = chickAnchor(), pl = MH.player, now = MH.now;
    for (const c of MH.chicks) {
      if (c.tag && (now > c.tag || MH.distTiles(c, pl) > 30)) { c.tag = 0; if (MH.distTiles(c, pl) < 16) { MH.ui.toast(`🐔 Clucky (somewhere): "${c.name.toUpperCase()}! GET BACK HERE!"`, 3); } c.placed = false; }
      const anchorFar = Math.hypot(c.x - A.x, c.y - A.y) > 26 * T;
      if (!c.placed || (anchorFar && !c.tag)) { c.x = A.x + MH.rand(-28, 28); c.y = A.y + MH.rand(-16, 16); c.placed = true; }
      c.asleep = A.asleep && !c.tag;
      if (c.asleep) { c.vx = c.vy = 0; continue; }
      const dp = MH.distTiles(c, pl);
      let tx, ty, sp = 34;
      if (c.tag || (dp < 4.5 && !MH.chat.active && MH.roomOf(pl) === MH.roomOf({ x: c.x, y: c.y + 2 }))) {
        // swarm the player's feet: little circles around them
        const a = now * (1.6 + c.i * 0.13) + c.i * 1.1; tx = pl.x + Math.cos(a) * (10 + c.i % 3 * 4); ty = pl.y + 2 + Math.sin(a) * 5; sp = c.tag ? 70 : 52;
        if (!c.tag && dp < 3 && Math.random() < dt * 0.012 && !MH.chicks.some((o) => o.tag)) { c.tag = now + MH.rand(60, 150); }
      } else {
        c.t -= dt; if (c.t <= 0 || c.tx == null) { c.t = MH.rand(1, 3.5); c.tx = A.x + MH.rand(-34, 34); c.ty = A.y + MH.rand(-14, 18); }
        tx = c.tx; ty = c.ty;
      }
      const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
      if (d > 2) { const nx = c.x + dx / d * Math.min(d, sp * dt), ny = c.y + dy / d * Math.min(d, sp * dt); if (MH.world.walkable(Math.floor(nx / T), Math.floor((ny - 2) / T)) || c.tag) { c.x = nx; c.y = ny; } c.moving = true; c.dir = dx < 0 ? -1 : 1; } else c.moving = false;
      c.peep = Math.max(0, c.peep - dt);
      if (dp < 6 && Math.random() < dt * 0.25) c.peep = 1.1;
    }
  }
  sim.chicksAroundPlayer = () => MH.chicks.filter((c) => !c.asleep && MH.distTiles(c, MH.player) < 4).length;

  // ------------------------------------------------------------ Gojo vs Sukuna (rare): a fight you can stumble upon
  function clashTick(dt) {
    const cl = MH.state.today.clash, g = MH.npcById.gojo, k = MH.npcById.sukuna;
    if (!cl || !g || !k || g.hidden || k.hidden || g.busy || k.busy || !(g.plan && g.plan.clash) || !(k.plan && k.plan.clash)) return;
    sim.clashT = (sim.clashT || 0) - dt;
    if (MH.distTiles(g, k) > 3 && !(g.path && g.path.length) && !(k.path && k.path.length)) { const s2 = MH.world.nearestWalkable(Math.round(g.x / T) + 2, Math.round(g.y / T)); MH.npcGoTo(k, s2.tx, s2.ty); }
    g.face(k.x, k.y); k.face(g.x, g.y);
    const d = MH.distTiles(MH.player, g);
    if (sim.clashT <= 0) {
      sim.clashT = MH.rand(0.6, 1.4);
      if (d < 30) { MH.render.burst((g.x + k.x) / 2 + MH.rand(-20, 20), (g.y + k.y) / 2 - 20, MH.pick(['sparkle', 'crow']), 8); MH.render.shake && MH.render.shake(d < 12 ? 4 : 2); }
      if (d < 26 && !cl.seen) { cl.seen = true; sim.vibeNow('The ground shakes. Gojo and Sukuna are FIGHTING — the air itself is tearing apart around them.'); MH.social.grapevine(`Gojo and Sukuna fought near ${MH.world.locations[cl.loc].name}. Half the area is rubble.`, []); }
      if (d < 4 && !MH.chat.active && Math.random() < 0.3 && MH.fight) { MH.fight.damage(MH.randi(8, 16), { by: 'sukuna' }); sim.vibeNow(MH.pick(['A stray slash grazes you. You were standing too close.', 'The shockwave knocks you off your feet.'])); }
    }
  }

  // ------------------------------------------------------------ the Scarecrow
  function scarecrowTick(dt) {
    const e = MH.npcById.scarecrow;
    if (!e || e.busy) return;
    sim.scareT = (sim.scareT || 40) - dt;
    const pl = MH.player, d = MH.distTiles(e, pl);
    const bond = MH.social.npc('scarecrow').bond;
    // she only rarely bursts into crows when you walk up (never twice in a day, almost never once you've talked)
    const met = MH.social.npc('scarecrow').met, today = MH.state.today;
    if (!e.hidden && d < 2.6 && !e.dodged && bond < 15 && !today.scareVanished && !MH.chat.active) { e.dodged = true; if (Math.random() < (met ? 0.08 : 0.2)) { today.scareVanished = true; vanishScarecrow(e); return; } }
    if (d > 3.5) e.dodged = false;
    if (sim.scareT <= 0) {
      sim.scareT = MH.rand(60, 160);
      const loc = MH.pick(['paddies', 'paddies', 'paddies', 'field', 'crossing', 'lanes', 'shrine', 'northlane', 'woods', 'home', 'river']);
      const s = MH.world.randomSpot(loc);
      if (d > 14 && Math.hypot(s.tx * T - pl.x, s.ty * T - pl.y) / T > 12) {
        MH.state.today.scarecrowSpot = loc;
        e.setTile(s.tx, s.ty); e.plan = { mode: 'out', loc }; e.planKey = 'out:' + loc; e.activity = 'standing perfectly still near ' + MH.world.locations[loc].name + ', watching';
        e.hidden = false;
      }
    }
  }
  function vanishScarecrow(e) {
    MH.render.burst(e.x, e.y - 20, 'crow', 16);
    sim.vibeNow(MH.pick(['The Scarecrow bursts into a flurry of crows.', 'You blink. The Scarecrow is gone. A feather drifts down.', 'Crows scatter. Where she stood, there is only straw.']));
    const loc = MH.pick(['paddies', 'woods', 'eastlane', 'shrine']);
    MH.state.today.scarecrowSpot = loc;
    const s = MH.world.randomSpot(loc);
    const f = MH.world.prop('feather', Math.floor(e.x / T), Math.floor(e.y / T), { flat: true, solid: false, pick: 'feather', temp: true });
    MH.render.addProp(f);
    e.setTile(s.tx, s.ty);
  }

  // ------------------------------------------------------------ the train
  MH.train = { active: false, x: 0, dir: 1, cars: 2, stopT: 0, next: 6 * 60 + 10 };
  function trainTick(dt) {
    const tr = MH.train, now = MH.state.time.minutes;
    const W = MH.world.TOWN_W * T;
    if (!tr.active) {
      const h = now / 60;
      if (h >= 5.5 && h < 23.5 && Math.abs(now - tr.next) < 2) {
        tr.active = true; tr.dir = Math.random() < 0.5 ? 1 : -1; tr.x = tr.dir > 0 ? -260 : W + 260; tr.stopT = 0; tr.stopped = false;
        tr.next = (now + MH.randi(70, 130)) % 1440;
      } else if (now > tr.next + 5 && now < tr.next + 200) tr.next = (now + MH.randi(30, 90)) % 1440;
    } else {
      const station = 91.5 * T;
      const speed = 150;
      if (!tr.stopped && Math.abs(tr.x - station) < speed * dt * 1.5) { tr.stopped = true; tr.stopT = 6; tr.x = station; if (MH.distTiles({ x: station, y: 36 * T }, MH.player) < 16) sim.vibeNow('The little train sighs to a stop at Mirehollow Station.'); }
      if (tr.stopT > 0) tr.stopT -= dt;
      else tr.x += tr.dir * speed * dt;
      if (tr.x < -400 || tr.x > W + 400) tr.active = false;
    }
    for (const c of MH.world.crossings) {
      const cxp = (c.x0 + 1) * T;
      const was = c.active;
      c.active = tr.active && Math.abs(tr.x - cxp) < 30 * T && !(tr.stopT > 0 && Math.abs(tr.x - cxp) > 16 * T);
      if (c.active && !was) {
        if (Math.hypot(cxp - MH.player.x, 36 * T - MH.player.y) / T < 16) sim.vibeNow('Kan-kan-kan… the crossing bells ring. A train is coming.');
        // anyone standing on the tracks steps back
        [MH.player].concat(MH.npcs).forEach((e) => { const t = e.tile(); if (t.tx >= c.x0 && t.tx <= c.x1 && t.ty >= 36 && t.ty <= 37) e.setTile(t.tx, t.ty === 36 ? 35 : 38); });
      }
    }
  }

  // ------------------------------------------------------------ gatherings & parties
  function gatheringTick() {
    const st = MH.state, g = sim.currentGathering();
    // heads-up before events
    const h = MH.hour(), mins = st.time.minutes % 60;
    MH.GATHERINGS.forEach((x) => {
      const k = st.time.day + '|' + x.name;
      if (x.day === MH.weekday() && h === x.from - 1 && mins > 30 && !st.today.announced[k]) {
        st.today.announced[k] = true;
        sim.vibeNow(`The ${x.name} starts soon at ${MH.world.locations[x.at].name}. Anyone can join.`);
      }
    });
    if (!g) return;
    const k = st.time.day + '|' + g.name;
    if (st.joined[k]) return;
    const L = MH.world.locations[g.at];
    const t = MH.player.tile();
    if (t.tx >= L.r[0] - 2 && t.tx <= L.r[2] + 2 && t.ty >= L.r[1] - 2 && t.ty <= L.r[3] + 2) {
      st.joined[k] = true;
      MH.ui.toast(`🎉 You joined the ${g.name}!`, 4);
      const here = MH.npcs.filter((e) => !e.hidden && MH.distTiles(e, MH.player) < 12);
      here.forEach((e) => { MH.social.addMemory(e.id, `${st.player.name} came to the ${g.name}.`, { imp: 1, kind: 'witness' }); if (!e.folk) MH.social.changeBond(e.id, 1); });
      MH.social.grapevine(`${st.player.name} showed up to the ${g.name}.`, here.map((e) => e.id));
      MH.render.burst(MH.player.x, MH.player.y - 20, 'note', 6);
    }
  }

  // host a party: invitations go out with Mailman Mole, RSVPs trickle back.
  sim.hostParty = function ({ dayOffset, hour, loc, theme, invited }) {
    const st = MH.state;
    const at = (st.time.day + dayOffset) * 1440 + hour * 60;
    const party = { id: MH.uid(), at, until: at + 300, loc, theme, invited: invited.slice(), rsvp: {}, status: 'planned', arrived: [], kit: MH.shop ? MH.shop.usePartyKit() : 0 };
    // Mole mixes up an address now and then
    if (invited.length && Math.random() < 0.15) {
      const others = MH.CHARS.filter((c) => !invited.includes(c.id) && !c.mute && !c.visitor);
      if (others.length) { const wrong = MH.pick(others).id, lost = MH.pick(invited); party.invited = invited.filter((x) => x !== lost).concat([wrong]); party.mixup = { lost, wrong }; }
    }
    party.invited.forEach((id) => (party.rsvp[id] = 'pending'));
    st.parties.push(party);
    sim.vibeNow('Mailman Mole sets off with your invitations… probably to the right houses.');
    party.invited.forEach((id, i) => { party.rsvp[id] = 'pending'; party['due_' + id] = MH.absMinutes() + 20 + i * 12 + MH.randi(0, 40); });
    return party;
  };
  async function partyTick() {
    const st = MH.state, now = MH.absMinutes();
    for (const party of st.parties) {
      if (party.status === 'done') continue;
      // RSVPs
      const due = party.invited.filter((id) => party.rsvp[id] === 'pending' && now >= party['due_' + id]);
      if (due.length && !party._busy) {
        party._busy = true;
        for (const id of due) {
          const ch = MH.CHAR[id], att = MH.social.attitude(id);
          const themeHit = party.theme && ch.bio && party.theme.split(/\s+/).some((w) => w.length > 3 && ch.bio.toLowerCase().includes(w.toLowerCase())) ? 0.2 : 0;
          const p = 0.45 + att / 120 + (ch.partyLove || 0) * 0.35 + themeHit + (party.kit || 0) - (MH.social.isAfraid(id) ? 0.4 : 0);
          party.rsvp[id] = Math.random() < p ? 'yes' : 'no';
          if (party.rsvp[id] === 'yes') sim.addPlan({ id, kind: 'party', loc: party.loc, at: party.at - 10 + MH.randi(0, 25), until: party.until, partyId: party.id, what: 'the player\'s party' });
          MH.social.addMemory(id, `${st.player.name} invited me to a ${party.theme || ''} party ${party.loc === 'home' ? 'at their house' : 'at ' + MH.world.locations[party.loc].name}. I said ${party.rsvp[id]}.`, { imp: 2, kind: 'self' });
        }
        const notes = await MH.ai.rsvpNotes(party, due).catch(() => null);
        due.forEach((id) => {
          const note = (notes && notes[id]) || MH.ai.offlineRsvp(id, party.rsvp[id]);
          party.notes = party.notes || {}; party.notes[id] = note;
          MH.social.log({ kind: 'sys', text: `💌 RSVP from ${MH.CHAR[id].name} (${party.rsvp[id] === 'yes' ? 'coming' : 'not coming'}): “${note}”` });
          MH.ui.toast(`💌 ${MH.CHAR[id].name}: ${party.rsvp[id] === 'yes' ? 'coming!' : 'can\'t make it'}`, 3.5);
        });
        if (party.mixup && due.includes(party.mixup.wrong)) MH.ui.toast(`📮 Uh oh — Mole delivered ${MH.CHAR[party.mixup.lost].name}'s invitation to ${MH.CHAR[party.mixup.wrong].name} by mistake.`, 5);
        party._busy = false;
      }
      if (party.status === 'planned' && now >= party.at - 30 && !party.warned) { party.warned = true; sim.vibeNow(`Your party starts at ${MH.clockStr(party.at % 1440)} ${party.loc === 'home' ? 'at your house' : 'at ' + MH.world.locations[party.loc].name}!`); }
      if (party.status === 'planned' && now >= party.at) { party.status = 'active'; MH.ui.toast('🎉 Your party has started!', 4); }
      if (party.status === 'active') {
        const hostHere = party.loc === 'home' ? MH.isInside(MH.player) : MH.world.placeAt(MH.player.x, MH.player.y).key === party.loc;
        if (hostHere) party.hostTime = (party.hostTime || 0) + 1;
        if (Math.random() < 0.02 && hostHere) MH.render.burst(MH.player.x + MH.rand(-40, 40), MH.player.y - 30, 'note', 3);
        // uninvited guests sometimes crash the party (rivals of the guests, or the town's chaos agents)
        if (party.loc === 'home' && hostHere && (party.crashes || 0) < 2 && Math.random() < 1 / 150) {
          const came = party.arrived || [];
          const pool = MH.CHARS.filter((c) => !party.invited.includes(c.id) && !c.visitor && !c.mute && !(sim.activePlan(c.id)) && !MH.npcById[c.id].busy && !MH.npcById[c.id].following);
          const score = (c) => (['maggie', 'chuckles', 'dionne', 'gertie', 'kira'].includes(c.id) ? 2 : 0) + came.filter((g) => ((MH.social.npc(c.id).rel[g] || 0) <= -30)).length * 2 + Math.random() * 2;
          const pick = pool.sort((a, b) => score(b) - score(a))[0];
          if (pick) { party.crashes = (party.crashes || 0) + 1; sim.addPlan({ id: pick.id, kind: 'crash', loc: 'home', at: now, until: party.until, partyId: party.id, what: 'crash the party' }); }
        }
        if (now >= party.until) finishParty(party);
      }
    }
  }
  function finishParty(party) {
    party.status = 'done';
    const st = MH.state;
    const came = (party.arrived || []).filter((id) => MH.CHAR[id]);
    const hostWasThere = (party.hostTime || 0) > 40;
    const where = party.loc === 'home' ? 'their house' : MH.world.locations[party.loc].name;
    came.forEach((id) => {
      MH.social.addMemory(id, hostWasThere ? `Went to ${st.player.name}'s ${party.theme || ''} party at ${where}.` : `Went to ${st.player.name}'s party and they weren't even there?!`, { imp: 2, kind: 'self' });
      MH.social.changeBond(id, hostWasThere ? 3 : -5);
    });
    if (hostWasThere && came.length) {
      MH.social.applyRep({ generous: 2, funny: 1, chaotic: came.length > 5 ? 1 : 0 }, came);
      MH.social.grapevine(`${st.player.name} threw a ${party.theme ? '"' + party.theme + '" ' : ''}party at ${where} — ${came.length} guest${came.length > 1 ? 's' : ''} came (${came.map((id) => MH.CHAR[id].name).slice(0, 5).join(', ')}).`, came);
      MH.ui.toast(`🎉 Party over! ${came.length} guest${came.length > 1 ? 's' : ''} came.`, 5);
    } else if (!came.length) { MH.ui.toast('Nobody came to your party… 🥲', 5); MH.social.grapevine(`Nobody showed up to ${st.player.name}'s party. Ouch.`, []); }
    MH.npcs.forEach((e) => { if (e.guest && (!sim.activePlan(e.id))) { e.guest = false; e.planKey = null; } });
  }

  // ------------------------------------------------------------ interaction target
  MH.isPicked = (p) => MH.state.picked[p.tx + ',' + p.ty] != null;
  function findTarget() {
    const pl = MH.player;
    if (MH.chat.active) return null;
    const jt = MH.jobs && MH.jobs.target(); if (jt) return jt;
    const t = pl.tile();
    // doors / furniture you're standing on (or right next to) win over people nearby
    let door = null, dd = 9;
    for (const it of MH.world.interactables) {
      if (Math.abs(it.tx - t.tx) > 1 || Math.abs(it.ty - t.ty) > 1) continue;
      const d = Math.hypot(it.tx * T + 8 - pl.x, it.ty * T + 13 - pl.y) / T;
      if (d < dd) { dd = d; door = it; }
    }
    let best = null, bd = 2.1;
    for (const e of MH.npcs) {
      if (e.hidden) continue;
      const d = MH.distTiles(e, pl) - (MH.art.chibiScale(e.ch) > 1 ? 0.8 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    const doorFirst = door && (dd < 0.75 || !best || dd < bd - 0.3);
    if (best && !doorFirst) return { kind: 'npc', e: best, label: (best.asleep ? 'Wake ' : 'Talk to ') + best.ch.name };
    if (door) {
      const it = door;
      let label = it.type === 'door' ? (it.b.generic ? 'Knock on the door' : (MH.jobs && MH.jobs.listAt(it.b.id).length ? '💼 ' : 'Knock: ') + it.b.name) : it.label;
      if (it.type === 'enter' && MH.world.rooms[it.room].private) label = '🏠 ' + it.b.name;
      else if (it.type === 'enter' && it.room !== 'home' && !MH.world.isOpen(MH.world.rooms[it.room])) label = 'Knock: ' + it.b.name + ' (closed, opens ' + MH.world.rooms[it.room].open[0] + ':00)';
      return { kind: it.type, it, x: it.tx * T + 8, y: it.ty * T, label };
    }
    // fishing: with a rod, at the water's edge
    if (!MH.roomOf(pl) && MH.state.player.inv.some((x) => x.name === 'Fishing rod')) {
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const g = MH.world.g(t.tx + dx, t.ty + dy);
        if (g === MH.G.WATER || g === MH.G.DEEP || g === MH.G.SWAMP) { const key = MH.world.placeAt(pl.x + dx * T, pl.y + dy * T).key; return { kind: 'fish', place: key, x: (t.tx + dx) * T + 8, y: (t.ty + dy) * T, label: '🎣 Fish' }; }
      }
    }
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
    if (!t || MH.chat.active || MH.fading) return;
    const P = MH.state.player;
    if (t.kind === 'job') { MH.jobs.act(t); return; }
    if (t.kind === 'counter') { MH.ui.openCounter(t.it); return; }
    if (t.kind === 'npc') {
      const e = t.e;
      // someone who's scared of you may just bolt
      if (!e.asleep && MH.social.isAfraid(e.id) && !sim.activePlan(e.id) && Math.random() < 0.45) { sim.flee(e); sim.vibeNow(`${e.ch.name} backs away from you, eyes wide, and hurries off.`); return; }
      if (sim.approaching === e) sim.approaching = null;
      const plan = sim.activePlan(e.id); if (plan) plan.met = true;
      // asleep, or you came up behind them: they don't speak first — you do
      const behind = !e.asleep && e.busy !== 'smalltalk' && sim.isBehind(e, MH.player);
      if (e.asleep || behind) { MH.chat.start([e.id], 'quiet', { asleep: e.asleep, behind }); return; }
      MH.chat.start([e.id], 'greet');
    } else if (t.kind === 'pick') {
      const p = t.p, it = MH.ITEMS[p.pick];
      MH.state.picked[p.tx + ',' + p.ty] = MH.state.time.day;
      MH.social.giveItem(it.name, null);
      MH.render.burst(p.x, p.y - 6, 'sparkle', 6);
      if (p.temp) { MH.world.props.splice(MH.world.props.indexOf(p), 1); MH.render.removeProp(p); }
      if (p.pick === 'bottle') sim.readBottle();
      if (p.pick === 'corn' || p.pick === 'rose') {
        const owner = p.pick === 'corn' ? 'the Scarecrow\'s field' : 'someone\'s garden';
        MH.social.witness(`${P.name} helped themselves to a ${it.name.toLowerCase()} from ${owner}.`, p.x, p.y, [], { chaotic: 1 }, 6);
        if (p.pick === 'corn') sim.vibeNow('Somewhere in the paddies, something turns its head toward you.');
      }
    } else if (t.kind === 'sleep') MH.ui.sleepPrompt();
    else if (t.kind === 'board') MH.ui.openGrapevine();
    else if (t.kind === 'well') MH.ui.wellPrompt();
    else if (t.kind === 'door') { if (MH.jobs && MH.jobs.listAt(t.it.b.id).length) MH.ui.openCounter({ room: t.it.b.id, door: t.it.b }); else sim.knock(t.it.b); }
    else if (t.kind === 'enter') {
      const R = MH.world.rooms[t.it.room];
      if (R.id === 'home') sim.goInside();
      else if (R.private) sim.homeDoor(t.it);
      else if (MH.world.isOpen(R)) { MH.enterRoom(R.id); setTimeout(() => sim.vibeNow(R.id === 'club' && MH.hour() < 21 ? 'The Velvet Antler is just warming up.' : 'You step ' + R.name.replace(/^inside /, 'into ') + '.'), 600); }
      else sim.knock(t.it.b);
    }
    else if (t.kind === 'exit') { if (t.it.room === 'home') sim.goOutside(); else MH.exitRoom(t.it.room); }
    else if (t.kind === 'party') MH.ui.openPartyPlanner();
    else if (t.kind === 'fridge') sim.fridge();
    else if (t.kind === 'spring') sim.soak();
    else if (t.kind === 'fish') MH.games.goFish(t.place);
  };

  // what's inside a bottle from the sea
  const BOTTLES = [
    ['"To whoever finds this: I buried something shiny under the third parasol. — R." (You dig. Coins!)', 25],
    ['"Day 41 on this island. The coconuts are unionising." No signature. Worrying.', 0],
    ['A child\'s drawing of a giant shark wearing a lifeguard whistle. Very accurate.', 0],
    ['"If you are reading this, Mirehollow still exists. Good. Stay weird." — the Darkborn (probably)', 0],
    ['A soggy coupon: "ONE FREE CINNAMON ROLL — Golden Loaf". Sunny might honour it.', 0],
    ['A tiny treasure map. X marks... the spot right where you\'re standing. You find a few coins in the sand.', 12],
    ['"I\'m sorry I ate your sandwich. — the seagull." Seagulls can write now?', 0],
    ['A love letter, smudged by seawater: "...and every Tuesday I bake you a shark..." The signature is gone.', 0],
  ];
  sim.readBottle = function () {
    const [text, coins] = MH.pick(BOTTLES);
    MH.ui.vibe('🍾 You uncork the bottle. ' + text);
    if (coins) MH.social.addCoins(coins);
    MH.social.log({ kind: 'sys', text: '🍾 Message in a bottle: ' + text });
  };
  // the Saturday bonfire glows on the beach
  sim.bonfireTick = function (dt) {
    const g = sim.currentGathering(), f = MH.world.firepit;
    if (!f || !g || g.at !== 'beach') return;
    sim.fireT = (sim.fireT || 0) - dt;
    if (sim.fireT <= 0 && Math.hypot(f.x - MH.player.x, f.y - MH.player.y) / T < 30) { sim.fireT = 0.35; MH.render.burst(f.x + MH.rand(-4, 4), f.y - 8, Math.random() < 0.7 ? 'fire' : 'sparkle', 3); }
  };

  // is the player standing behind this villager (outside their field of view)?
  sim.isBehind = function (e, pl) {
    const f = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[e.dir] || [0, 1];
    const dx = pl.x - e.x, dy = pl.y - e.y, L = Math.hypot(dx, dy) || 1;
    return (dx * f[0] + dy * f[1]) / L < -0.35;
  };
  sim.goInside = function () {
    MH.enterHome();
    setTimeout(() => {
      // guests waiting at the door come in with you
      MH.npcs.forEach((e) => { const p = sim.activePlan(e.id); if (p && p.loc === 'home' && !e.guest && !e.hidden && MH.distTiles(e, { x: MH.world.buildingById.home.doorX * T, y: (MH.world.buildingById.home.doorY + 1) * T }) < 6) sim.guestArrives(e, p); });
    }, 600);
  };
  sim.goOutside = function () { MH.exitHome(); };
  sim.fridge = function () {
    if (MH.state.today.fridge) { sim.vibeNow('The fridge is empty except for a lonely jar of pickles. Tomorrow.'); return; }
    MH.state.today.fridge = true;
    const snack = MH.pick(['Rice ball', 'Lemonade', 'Strawberry cake slice', 'Bottle of ramune', 'Leftover cinnamon roll', 'Cold watermelon slice']);
    MH.social.giveItem(snack, null);
    MH.ui.toast(`${MH.itemIcon(snack)} Took a ${snack.toLowerCase()} from the fridge`);
  };

  sim.soak = function () {
    const P = MH.state.player;
    if (P.coins < 5) { sim.vibeNow('Granny Thistle: "Five coins, sprout. The water isn\'t free and neither am I."'); return; }
    MH.social.addCoins(-5);
    const f = document.getElementById('fade'); f.classList.add('on');
    setTimeout(() => {
      MH.state.time.minutes += 45; MH.fight.heal(100); f.classList.remove('on');
      sim.vibeNow('You soak in the steaming water until every ache melts away. (Full health, −5 coins)');
      const g = MH.npcById.thistle; if (g && !g.hidden && MH.distTiles(g, MH.player) < 14) { MH.social.addMemory('thistle', `${P.name} paid for a soak at the onsen. Good manners.`, { imp: 1 }); MH.social.changeBond('thistle', 1); }
    }, 700);
  };
  sim.knock = function (b) {
    const inside = MH.npcs.filter((e) => e.hidden && !e.busy && e.insideLoc === b.id && !e.ch.visitor);
    if (!inside.length) { sim.vibeNow(`You knock on the door of ${b.generic ? 'the house' : b.name}. Nobody answers.`); return; }
    const e = inside[0];
    const h = MH.hour(), late = h >= 22 || h < 6;
    unhideAt(e, b.id);
    e.state = 'idle';
    e.face(MH.player.x, MH.player.y);
    MH.chat.start([e.id], 'opener', `${MH.state.player.name} knocked on the door of ${b.generic ? e.ch.name + '\'s house' : b.name} ${late ? 'in the middle of the night' : 'at ' + MH.clockStr()}, and ${e.ch.name} opened it${late ? ' (they were asleep)' : ''}. They react in character.`);
  };

  // ------------------------------------------------------------ shops & public interiors
  // When the player is inside a shop, whoever is hanging around that shop comes in too.
  function roomTick() {
    const R = MH.world.roomAt(Math.floor(MH.player.x / T), Math.floor((MH.player.y - 2) / T));
    const id = R && R.id !== 'home' ? R.id : null;
    if (sim.curRoom && sim.curRoom !== id) {
      const left = MH.world.rooms[sim.curRoom];
      MH.npcs.forEach((e) => {
        if (e.inRoom !== left.id || e.busy) return;
        if (e.homeIn) { e.inRoom = null; e.homeIn = false; e.staffSpot = null; hide(e); e.insideLoc = left.building; return; }
        e.inRoom = null; e.staffSpot = null; const sp = MH.world.randomSpot(left.building); e.setTile(sp.tx, sp.ty); e.path = null;
      });
      if (MH.state.player.sneak && MH.state.player.sneak.room === left.id) MH.state.player.sneak = null;
    }
    sim.curRoom = id;
    if (!id) return;
    const b = R.building;
    if (R.private) { homeTick(R); return; }
    for (const e of MH.npcs) {
      if (e.inRoom || e.hidden || e.busy || e.guest || e.following || e.seek || !e.plan || sim.approaching === e) continue;
      if (e.plan.loc !== b || (e.plan.mode !== 'out' && e.plan.mode !== 'nap')) continue;
      if (e.state === 'travel' && e.path && e.path.length > 3) continue; // still on the way
      const staff = e.ch.home === b;
      let spot = null;
      if (staff && R.staff.length) { const used = new Set(MH.npcs.filter((o) => o.inRoom === id && o.staffSpot).map((o) => o.staffSpot.join())); spot = R.staff.find((s2) => !used.has(s2.join())); }
      if (!spot) { const r = MH.world.randomSpot('in_' + id); spot = [r.tx, r.ty]; }
      e.setTile(spot[0], spot[1]); e.inRoom = id; e.staffSpot = staff ? spot : null; e.asleep = false; e.path = null; e.state = 'idle'; e.dir = 'down';
    }
  }

  // ------------------------------------------------------------ villagers' homes: residents, sleepers, sneaking in
  // when each villager sleeps (default 22:00-7:00); night owls are up while everyone else snores
  const SLEEP = { brenda: [3, 11], maggie: [5, 13], rook: [5, 12], gristle: [4, 12], snitch: [4, 11], vesper: [2, 10], kira: [20, 10], patty: [0, 24], juniper: [21, 6], clucky: [21, 6], snap: [7, 15], sukuna: [6, 9], gojo: [3, 9] };
  sim.sleepsNow = function (id) { const [a, b] = SLEEP[id] || [22, 7]; if (a === 0 && b === 24) return true; const h = MH.hour(); return a <= b ? h >= a && h < b : h >= a || h < b; };
  sim.residentsOf = (b) => MH.npcs.filter((e) => e.hidden && !e.busy && e.insideLoc === b && !e.ch.visitor && e.plan && e.plan.mode === 'inside');
  function homeTick(R) {
    // whoever is "inside" this home is actually in here: asleep in bed, or up and about
    let bed = 0;
    for (const e of sim.residentsOf(R.building)) {
      const sleeping = sim.sleepsNow(e.id);
      const usedBeds = new Set(MH.npcs.filter((o) => o.inRoom === R.id && o.asleep).map((o) => o.tile().tx + ',' + o.tile().ty));
      let spot = null;
      if (sleeping) { while (bed < R.beds.length && usedBeds.has(R.beds[bed].join())) bed++; spot = R.beds[bed] || null; }
      if (!spot) { const r = MH.world.randomSpot('in_' + R.id); spot = [r.tx, r.ty]; }
      e.setTile(spot[0], spot[1]); e.hidden = false; e.inRoom = R.id; e.homeIn = true; e.asleep = !!sleeping && !!R.beds.length; e.path = null; e.state = 'idle'; e.dir = 'down'; e.noticeT = 0;
    }
  }
  sim.sneakTick = function (dt) {
    const P = MH.state.player, sn = P.sneak;
    if (!sn || sn.invited || sn.caught || MH.chat.active || MH.fading || MH.ui.modalOpen || sim.curRoom !== sn.room) return;
    const pl = MH.player, moved = sim._lastPos ? Math.hypot(pl.x - sim._lastPos.x, pl.y - sim._lastPos.y) : 0;
    sim._lastPos = { x: pl.x, y: pl.y };
    const late = MH.hour() >= 22 || MH.hour() < 6, R = MH.world.rooms[sn.room], house = R.name.replace(/^inside /, '');
    for (const e of MH.npcs) {
      if (e.inRoom !== sn.room || e.hidden || e.busy) continue;
      const d = MH.distTiles(e, pl);
      if (e.asleep) {
        // creaky floorboards: running near a sleeper is a bad idea
        const p = moved < 0.2 ? 0 : d < 3 ? (pl.running ? 0.35 : 0.035) : d < 5 && pl.running ? 0.1 : 0;
        if (p && Math.random() < p * dt) { e.asleep = false; caught(e, `${e.ch.name} wakes up${late ? ' in the middle of the night' : ''} to find ${P.name} creeping around ${house} — nobody let them in.`); return; }
      } else if (d < 8) {
        e.noticeT = (e.noticeT || 0) + dt;
        if (e.noticeT > 1.3) { caught(e, `${e.ch.name} catches ${P.name} sneaking into ${house}${late ? ' in the middle of the night' : ''}. Nobody let them in.`); return; }
      }
    }
    function caught(e, why) {
      sn.caught = true; e.face(pl.x, pl.y); e.showEmote('!', 2.5);
      MH.social.addMemory(e.id, `${P.name} snuck into ${house}${late ? ' in the middle of the night' : ''} without asking.`, { imp: 3, kind: 'self' });
      MH.chat.start([e.id], 'opener', why);
    }
  };
  // the front door of someone's home: knock, sneak in, or (best friends, daytime) just go in
  sim.homeDoor = function (it) {
    const R = MH.world.rooms[it.room], b = it.b, inside = sim.residentsOf(b.id);
    const awake = inside.filter((e) => !sim.sleepsNow(e.id));
    const night = MH.hour() >= 22 || MH.hour() < 6;
    const friend = !night && awake.find((e) => MH.social.attitude(e.id) >= 35);
    const hint = !inside.length ? 'Nobody seems to be home. The door isn\'t locked…' : awake.length ? 'You can hear someone moving around inside.' : 'All dark and quiet. Someone is snoring.';
    const h = (html) => { const t2 = document.createElement('template'); t2.innerHTML = html.trim(); return t2.content.firstElementChild; };
    const body = h(`<div class="menu"><p class="muted">${hint}</p>${inside.length ? '<button class="btn" data-a="knock">🚪 Knock</button>' : ''}${friend ? `<button class="btn" data-a="go">🏠 Go in — ${MH.esc(friend.ch.name)} won't mind</button>` : ''}<button class="btn ghost" data-a="sneak">🤫 ${inside.length ? 'Sneak in' : 'Let yourself in'}</button></div>`);
    body.querySelectorAll('[data-a]').forEach((x) => (x.onclick = () => {
      MH.ui.closeModal();
      if (x.dataset.a === 'knock') { sim.knock(b); return; }
      MH.state.player.sneak = { room: R.id, at: MH.absMinutes(), invited: x.dataset.a === 'go' };
      MH.enterRoom(R.id);
      setTimeout(() => sim.vibeNow(x.dataset.a === 'go' ? `You let yourself into ${b.name}. "It's me!"` : inside.length ? `You ease the door open and slip into ${b.name}. ${awake.length ? 'Careful…' : 'Somebody is snoring. Walk, don\'t run.'}` : `You let yourself into ${b.name}. Nobody's home… for now.`), 600);
    }));
    MH.ui.modal(MH.esc(b.name), body);
  };

  // Does this villager have somewhere else to be? (used so they can leave conversations on their own)
  sim.mustGo = function (e) {
    const p = sim.plan(e.id), here = MH.world.placeAt(e.x, e.y).key;
    if (e.guest && p.mode === 'plan' && p.loc === 'home') return null;
    if (p.mode === 'inside') return MH.hour() >= 20 || MH.hour() < 6 ? 'it\'s late and they want to get home to bed' : 'they need to get back to ' + (MH.world.locations[p.loc] ? MH.world.locations[p.loc].name : 'their place');
    if (p.gathering && p.loc !== here) return 'they\'re expected at the ' + p.gathering;
    if (p.mode === 'plan' && p.loc !== here && !(p.loc === 'home' && here === 'myroom')) return 'they promised to be at ' + (p.loc === 'home' ? 'the player\'s house' : MH.world.locations[p.loc].name) + ' about now';
    const work = e.ch.schedule && e.ch.home && p.loc === e.ch.home && here !== p.loc && here !== 'in_' + p.loc && !e.ch.folk;
    if (work) return 'they have to get back to ' + MH.world.locations[p.loc].name;
    return null;
  };

  // Snitch lifts things from your pocket if you stand too close (once a day at most)
  function pickpocketTick() {
    const s = MH.npcById.snitch, P = MH.state.player;
    if (!s || s.hidden || s.busy || MH.chat.active || MH.state.today.snitched || (P.invisUntil || 0) > MH.absMinutes()) return;
    if (MH.distTiles(s, MH.player) > 1.7 || Math.random() > 0.12) return;
    MH.state.today.snitched = true;
    const items = P.inv.filter((x) => !x.quest && (x.price || 0) <= 40); // small stuff only
    let what;
    if (items.length && Math.random() < 0.6) { const it = MH.pick(items); P.inv.splice(P.inv.indexOf(it), 1); what = 'your ' + it.name; }
    else { const c = Math.min(P.coins, MH.randi(5, 15)); if (!c) return; P.coins -= c; what = c + ' coins'; }
    MH.social.addMemory('snitch', `Lifted ${what.replace('your ', P.name + "'s ")} without them noticing. Heh.`, { imp: 2 });
    MH.ui.toast(`👛 Your pocket feels lighter… (${what} gone. Was that Snitch?)`, 4.5);
    sim.flee(s);
  }

  // ------------------------------------------------------------ main update
  let slow = 0;
  sim.update = function (dt) {
    sim.advance(dt);
    for (const e of MH.npcs) updateNpc(e, dt);
    scarecrowTick(dt); clashTick(dt); chickTick(dt); sim.bonfireTick(dt);
    trainTick(dt);
    slow += dt;
    if (slow > 1) { slow = 0; gatheringTick(); partyTick(); MH.jobs && MH.jobs.tick(); MH.quests && MH.quests.tick(); MH.fight && MH.fight.tick(); MH.phone && (MH.phone.tick(), MH.phone.updateHud()); pickpocketTick(); }
    const PS = MH.state.player, nowA = MH.absMinutes();
    if (MH.player) MH.player.speed = 74 * ((PS.buffUntil || 0) > nowA ? 1.35 : 1) * (PS.boots ? 1.25 : 1);
    // the jetpack runs out: land somewhere you can stand
    if (PS.flyUntil && PS.flyUntil <= nowA) { PS.flyUntil = 0; const t = MH.player.tile(); if (!MH.world.walkable(t.tx, t.ty)) { const s = MH.world.nearestWalkable(t.tx, t.ty); MH.player.setTile(s.tx, s.ty); } MH.ui.toast('🚀 The jetpack sputters out. You land with a thud.', 3); }
    sim.harassTimer = (sim.harassTimer == null ? 90 : sim.harassTimer) - dt;
    if (sim.harassTimer <= 0) { sim.harassTimer = MH.rand(90, 200); if (Math.random() < 0.55) sim.considerHarass(); }
    roomTick(); sim.sneakTick(dt);
    if (MH.ui.modalOpen) { sim.target = null; MH.emit('target', null); return; }
    sim.target = findTarget();
    MH.emit('target', sim.target);
    const amb = MH.settings.ambient;
    const every = amb === 'high' ? 18 : amb === 'low' ? 90 : amb === 'off' ? 1e9 : 40;
    sim.smalltalkTimer -= dt;
    if (sim.smalltalkTimer <= 0) { sim.smalltalkTimer = every * MH.rand(0.7, 1.3); sim.considerSmallTalk(); }
    sim.dramaTimer = (sim.dramaTimer == null ? 60 : sim.dramaTimer) - dt;
    if (sim.dramaTimer <= 0) { sim.dramaTimer = MH.rand(80, 170); if (Math.random() < 0.6) sim.considerDrama(); }
    sim.approachTimer -= dt;
    if (sim.approachTimer <= 0) { sim.approachTimer = MH.rand(45, 80); sim.considerApproach(); }
    sim.folkTimer -= dt;
    if (sim.folkTimer <= 0) { sim.folkTimer = MH.rand(9, 18); folkChatter(); }
    sim.vibeTimer -= dt;
    if (sim.vibeTimer <= 0) {
      sim.vibeTimer = MH.rand(55, 120);
      if (!MH.chat.active && !(Math.random() < 0.3 && swarmBite())) sim.vibeNow(randomVibe());
    }
  };
})(window.MH);
