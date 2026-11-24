// Mirehollow — boot, game loop, new game / load / save.
'use strict';
(function (MH) {
  MH.now = 0;
  MH.titleMode = true;
  let last = 0, saveT = 0;

  MH.save = function () {
    if (!MH.state || MH.titleMode) return;
    const st = MH.state;
    if (st.log.length > 400) st.log = st.log.slice(-400);
    MH.store.set('save', st);
  };
  MH.onPause = () => MH.save();
  window.addEventListener('pagehide', () => MH.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) MH.save(); });

  function migrate(st) {
    const fresh = MH.social.newState(st.player);
    for (const id in fresh.npcs) if (!st.npcs[id]) st.npcs[id] = fresh.npcs[id];
    st.today = st.today || {};
    st.grapevine = st.grapevine || [];
    st.picked = st.picked || {};
    st.player.deeds = st.player.deeds || [];
    st.player.rep = Object.assign({ kind: 0, funny: 0, chaotic: 0, generous: 0, brave: 0, rude: 0, violent: 0 }, st.player.rep || {});
    for (const id in st.npcs) { const n = st.npcs[id]; n.perceived = Object.assign({ violent: 0 }, n.perceived || {}); }
    st.player.wardrobe = st.player.wardrobe || []; st.player.decor = st.player.decor || []; st.player.violence = st.player.violence || 0;
    st.quests = st.quests || []; st.jobsDone = st.jobsDone || {}; if (st.job === undefined) st.job = null;
    st.plans = st.plans || []; st.parties = st.parties || []; st.joined = st.joined || {}; st.companions = st.companions || [];
    if (st.lastApproach == null) st.lastApproach = -99999;
    if ((st.version || 1) < 2) { st.version = 2; st.player.tx = 37; st.player.ty = 33; } // new, bigger town
    if (st.player.look) { delete st.player.look.ears; delete st.player.look.tail; }
    return st;
  }

  MH.loadState = function (st) {
    MH.state = migrate(st);
    if (MH.state.today.nimbus == null || !MH.state.today.announced) MH.sim.newDay(true);
    MH.makePlayer();
    MH.titleMode = false;
    MH.sim.placeEveryone();
    MH.sim.restoreCompanions();
    MH.render.clearFocus();
    MH.render.snap();
    document.body.classList.remove('title');
    afterLoad();
    MH.ui.updateHud();
    MH.emit('companions');
  };
  // things that live in the world but are driven by the save (decor, job litter)
  function afterLoad() {
    MH.shop && MH.shop.placeDecor();
    MH.jobs && MH.jobs.restore();
    const snap = MH.store.get('dayStart', null);
    if (!snap || snap.day !== MH.state.time.day || snap.created !== MH.state.created) MH.daySnapshot();
  }

  // ---------- "Reset today": a snapshot of the game at the start of each day
  MH.daySnapshot = function () {
    if (!MH.state || MH.titleMode) return;
    try { MH.store.set('dayStart', { day: MH.state.time.day, created: MH.state.created, state: JSON.parse(JSON.stringify(MH.state)) }); } catch (e) { console.warn('snapshot', e); }
  };
  MH.dayReset = {
    canRewind() { const s2 = MH.store.get('dayStart', null); return !!(s2 && s2.state && s2.day === MH.state.time.day && s2.created === MH.state.created); },
    // undo everything since the start of the day
    rewind() {
      const s2 = MH.store.get('dayStart', null); if (!s2 || !s2.state) return false;
      if (MH.chat.active) MH.chat.end();
      MH.loadState(JSON.parse(JSON.stringify(s2.state)));
      MH.save();
      return true;
    },
    // keep money, items, bonds etc. — only forget what was remembered today
    forget() {
      const st = MH.state, from = st.time.day * 1440;
      let n = 0;
      for (const id in st.npcs) { const m = st.npcs[id].memories; const keep = m.filter((x) => x.t < from || x.kind === 'summary'); n += m.length - keep.length; st.npcs[id].memories = keep; }
      st.grapevine = (st.grapevine || []).filter((g) => g.t < from);
      st.player.deeds = (st.player.deeds || []).filter((d) => d.t < from);
      MH.save();
      return n;
    },
  };

  MH.startGame = function (st) {
    MH.loadState(st);
    setTimeout(() => MH.ui.vibe(`Welcome back to Mirehollow. ${MH.WEEKDAYS[MH.weekday()]}, ${MH.clockStr()}.`), 400);
  };

  MH.newGame = function (opts) {
    MH.state = MH.social.newState(opts);
    MH.state.version = 2;
    MH.sim.newDay(true);
    MH.state.weather = 'sunny';
    MH.makePlayer();
    MH.titleMode = false;
    MH.sim.placeEveryone();
    MH.render.clearFocus();
    MH.render.snap();
    document.body.classList.remove('title');
    afterLoad();
    MH.save();
    MH.ui.updateHud();
    setTimeout(() => MH.ui.vibe('You\'ve just moved into a little house by the railway crossing in Mirehollow. The swamp is past the last lamp post. Bring bug spray.'), 500);
    if (!MH.store.get('seenHelp', false)) { setTimeout(() => { MH.ui.openHelp(); MH.store.set('seenHelp', true); }, 1500); }
    // The Mayor comes to welcome you.
    setTimeout(() => {
      const m = MH.npcById.mayor;
      if (!m || MH.chat.active) return;
      const s = MH.world.nearestWalkable(MH.player.tile().tx + 6, MH.player.tile().ty - 3);
      m.setTile(s.tx, s.ty); m.hidden = false; m.busy = null;
      MH.state.lastApproach = MH.absMinutes(); MH.social.npc('mayor').lastApproach = MH.absMinutes();
      m.approachReason = `Mayor Ringo hurries over to officially welcome ${opts.name}, the newcomer who just moved into the empty house by the west railway crossing, clipboard in hand. He is flustered, notes that they're the only human in town ("which is FINE, very exciting, we're very inclusive"), mentions a couple of the town's "quirks" (the swamp, the lab, the Scarecrow), and hopes they won't cause trouble.`;
      m.approachT = 40; m.repath = 0; m.hurry = true; m.showEmote('!', 2);
      MH.sim.approaching = m;
    }, 6000);
  };

  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    MH.now += dt;
    try {
      if (MH.titleMode) {
        MH.render.focus(79 * 16 + Math.sin(MH.now * 0.1) * 140, 50 * 16 + Math.cos(MH.now * 0.08) * 120);
        for (const e of MH.npcs) if (!e.hidden && !e.busy) { if (e.path && e.path.length) MH.npcWalk(e, dt); else if (Math.random() < dt * 0.15) { const s = MH.world.randomSpot(e.plan ? e.plan.loc : e.ch.home); MH.npcGoTo(e, s.tx, s.ty); } }
      } else {
        MH.updatePlayer(dt);
        MH.sim.update(dt);
        saveT += dt;
        if (saveT > 45) { saveT = 0; MH.save(); }
      }
      MH.render.draw(dt);
      MH.chat.updateBubbles(dt);
    } catch (err) { console.error(err); }
    requestAnimationFrame(loop);
  }

  MH.boot = function () {
    MH.applyCharEdits();
    MH.loadCustomPortraits();
    MH.world.gen();
    MH.state = MH.social.newState();
    MH.state.version = 2;
    MH.state.time.minutes = 10 * 60;
    MH.sim.newDay(true);
    MH.state.weather = 'sunny';
    MH.makePlayer();
    MH.makeNpcs();
    MH.render.init(document.getElementById('cv'));
    MH.sim.placeEveryone();
    MH.render.snap();
    MH.input.bindTouch(document.getElementById('joyZone'), document.getElementById('joyBase'), document.getElementById('joyKnob'));
    MH.chat.init();
    MH.ui.init();
    document.body.classList.add('title');
    requestAnimationFrame((t) => { last = t; loop(t); });
    MH.ui.showTitle();
    if (MH.isNative()) document.body.classList.add('native');
    const g = document.getElementById('game');
    g.addEventListener('scroll', () => { g.scrollLeft = 0; g.scrollTop = 0; });
  };

  window.addEventListener('load', () => {
    try { MH.boot(); }
    catch (e) { document.body.innerHTML = '<pre style="color:#fff;padding:20px;white-space:pre-wrap">Mirehollow failed to start:\n' + (e.stack || e) + '</pre>'; }
  });
})(window.MH);
