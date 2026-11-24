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
    st.player.rep = Object.assign({ kind: 0, funny: 0, chaotic: 0, generous: 0, brave: 0, rude: 0 }, st.player.rep || {});
    return st;
  }

  MH.loadState = function (st) {
    MH.state = migrate(st);
    if (MH.state.today.nimbus == null) MH.sim.newDay(true);
    MH.makePlayer();
    MH.titleMode = false;
    MH.sim.placeEveryone();
    MH.render.clearFocus();
    MH.render.snap();
    document.body.classList.remove('title');
    MH.ui.updateHud();
  };

  MH.startGame = function (st) {
    MH.loadState(st);
    setTimeout(() => MH.ui.vibe(`Welcome back to Mirehollow. ${MH.WEEKDAYS[MH.weekday()]}, ${MH.clockStr()}.`), 400);
  };

  MH.newGame = function (opts) {
    MH.state = MH.social.newState(opts);
    MH.sim.newDay(true);
    MH.state.weather = 'sunny';
    MH.makePlayer();
    MH.titleMode = false;
    MH.sim.placeEveryone();
    MH.render.clearFocus();
    MH.render.snap();
    document.body.classList.remove('title');
    MH.save();
    MH.ui.updateHud();
    setTimeout(() => MH.ui.vibe('You\'ve just moved into a little cottage in Mirehollow. The swamp is past the last lamp post. Bring bug spray.'), 500);
    if (!MH.store.get('seenHelp', false)) { setTimeout(() => { MH.ui.openHelp(); MH.store.set('seenHelp', true); }, 1500); }
    // The Mayor comes to welcome you.
    setTimeout(() => {
      const m = MH.npcById.mayor;
      if (!m || MH.chat.active) return;
      const s = MH.world.nearestWalkable(MH.player.tile().tx + 6, MH.player.tile().ty - 3);
      m.setTile(s.tx, s.ty); m.hidden = false; m.busy = null;
      m.approachReason = `Mayor Ringo hurries over to officially welcome ${opts.name}, the newcomer who just moved into the empty cottage, clipboard in hand. He is flustered, mentions a couple of the town's "quirks" (the swamp, the lab, the Scarecrow), and hopes they won't cause trouble.`;
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
        MH.render.focus(47 * 16 + Math.sin(MH.now * 0.12) * 110, 32 * 16 + Math.cos(MH.now * 0.09) * 40);
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
    MH.world.gen();
    MH.state = MH.social.newState();
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
