// Mirehollow — player & villager entities, movement, collision, entering/leaving the house.
'use strict';
(function (MH) {
  const T = MH.TILE;
  MH.npcs = [];
  MH.npcById = {};

  const SPEED = { bunny: 85, patty: 30, kira: 42, box: 55, chuckles: 62, mole: 38, owl: 34, gertie: 46, zahra: 40, darkborn: 38, nimbus: 36, sable: 36, scarecrow: 0 };

  function Entity(opts) {
    Object.assign(this, {
      x: 0, y: 0, dir: 'down', frame: 0, animT: 0, moving: false, speed: 50, path: null, pathGoal: null,
      hidden: false, asleep: false, emote: null, state: 'idle', idleT: 0,
    }, opts);
  }
  Entity.prototype.tile = function () { return { tx: Math.floor(this.x / T), ty: Math.floor((this.y - 2) / T) }; };
  Entity.prototype.setTile = function (tx, ty) { this.x = tx * T + T / 2; this.y = ty * T + T - 3; };
  Entity.prototype.face = function (tx, ty) {
    const dx = tx - this.x, dy = ty - this.y;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx < 0 ? 'left' : 'right';
    else this.dir = dy < 0 ? 'up' : 'down';
  };
  Entity.prototype.showEmote = function (name, secs = 2.5) { this.emote = { name, until: MH.now + secs }; };
  MH.Entity = Entity;

  const HB = 4;
  const walk = (tx, ty) => MH.world.walkable(tx, ty) && !MH.world.crossingBlocked(tx, ty);
  function blockedAt(x, y, e) {
    if (e && e.isPlayer && MH.state && (MH.state.player.flyUntil || 0) > MH.absMinutes() && !MH.roomOf(e)) {
      const tx = Math.floor(x / T), ty = Math.floor((y - 2) / T);
      return tx < 1 || ty < 1 || tx >= MH.world.TOWN_W - 1 || ty >= MH.world.H - 1; // the sky is open
    }
    const pts = [[x - HB, y - 4], [x + HB, y - 4], [x - HB, y], [x + HB, y]];
    for (const [px, py] of pts) if (!walk(Math.floor(px / T), Math.floor(py / T))) return true;
    return false;
  }
  MH.blockedAt = blockedAt;

  function tryMove(e, dx, dy) {
    let moved = false;
    if (dx && !blockedAt(e.x + dx, e.y, e)) { e.x += dx; moved = true; }
    else if (dx) { for (const s of [-1, 1]) if (!blockedAt(e.x + dx, e.y + s * 2, e)) { e.y += s * 0.6; break; } }
    if (dy && !blockedAt(e.x, e.y + dy, e)) { e.y += dy; moved = true; }
    else if (dy) { for (const s of [-1, 1]) if (!blockedAt(e.x + s * 2, e.y + dy, e)) { e.x += s * 0.6; break; } }
    return moved;
  }
  function animate(e, dt, moving) {
    e.moving = moving;
    if (moving) { e.animT += dt * (e.running ? 10 : 6.5); e.frame = 1 + (Math.floor(e.animT) % 2); }
    else { e.frame = 0; e.animT = 0; }
  }
  MH.animate = animate;

  // ------------------------------------------------------------ player
  MH.playerChar = function () {
    const st = MH.state.player;
    return { id: 'player', name: st.name, species: 'human', look: MH.art.playerLook(st.look || {}), _v: (MH._pv = (MH._pv || 0) + 1) };
  };
  MH.makePlayer = function () {
    const st = MH.state.player;
    const p = new Entity({ id: 'player', isPlayer: true, speed: 74 });
    p.setTile(st.tx, st.ty);
    if (!MH.world.walkable(st.tx, st.ty)) { const n = MH.world.nearestWalkable(st.tx, st.ty); p.setTile(n.tx, n.ty); }
    p.ch = MH.playerChar();
    MH.player = p;
    return p;
  };
  MH.refreshPlayerSprite = function () { MH.player.ch = MH.playerChar(); };

  MH.updatePlayer = function (dt) {
    const p = MH.player, inp = MH.input;
    if ((MH.chat && MH.chat.active) || (MH.ui && MH.ui.modalOpen) || MH.fading) { animate(p, dt, false); return; }
    const { mx, my, run } = inp.move();
    const mag = Math.hypot(mx, my);
    if (mag > 0.15) {
      p.running = run || mag > 0.92;
      const sp = p.speed * (p.running ? 1.7 : 1) * Math.min(1, mag);
      const nx = mx / mag, ny = my / mag;
      tryMove(p, nx * sp * dt, ny * sp * dt);
      if (Math.abs(nx) > Math.abs(ny)) p.dir = nx < 0 ? 'left' : 'right'; else p.dir = ny < 0 ? 'up' : 'down';
      animate(p, dt, true);
    } else animate(p, dt, false);
    for (const e of MH.npcs) {
      if (e.hidden) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 9 && d > 0.01) { const k = ((9 - d) / d) * 0.5; tryMove(p, (p.x - e.x) * k, (p.y - e.y) * k); }
    }
    const t = p.tile();
    MH.state.player.tx = t.tx; MH.state.player.ty = t.ty;
  };

  // ------------------------------------------------------------ villagers & townsfolk
  MH.makeNpcs = function () {
    MH.npcs.length = 0;
    MH.ALL.forEach((ch) => {
      const e = new Entity({ id: ch.id, ch, speed: SPEED[ch.id] || (ch.folk ? 40 + Math.random() * 14 : 48), folk: !!ch.folk });
      const spot = MH.world.randomSpot(ch.folk ? MH.pick(ch.haunts) : ch.home) || { tx: 78, ty: 58 };
      e.setTile(spot.tx, spot.ty);
      MH.npcs.push(e);
      MH.npcById[ch.id] = e;
    });
  };

  MH.npcWalk = function (e, dt) {
    if (!e.path || !e.path.length) { animate(e, dt, false); return true; }
    const n = e.path[0];
    if (MH.world.crossingBlocked(n.tx, n.ty)) { animate(e, dt, false); return false; } // wait for the train
    const gx = n.tx * T + T / 2, gy = n.ty * T + T - 3;
    const dx = gx - e.x, dy = gy - e.y, d = Math.hypot(dx, dy);
    const sp = Math.max(e.speed, e.chase ? 48 : 0) * (e.hurry ? (e.chase ? 2.2 : 1.6) : 1) * dt; // chasers sprint
    if (d <= sp + 0.5) {
      e.x = gx; e.y = gy; e.path.shift();
      if (!e.path.length) { animate(e, dt, false); return true; }
    } else {
      e.x += (dx / d) * sp; e.y += (dy / d) * sp;
      if (Math.abs(dx) > Math.abs(dy)) e.dir = dx < 0 ? 'left' : 'right'; else e.dir = dy < 0 ? 'up' : 'down';
    }
    e.running = !!e.hurry;
    animate(e, dt, true);
    return false;
  };

  MH.npcGoTo = function (e, tx, ty) {
    const t = e.tile();
    const path = MH.world.findPath(t.tx, t.ty, tx, ty);
    if (path === null) { e.setTile(tx, ty); e.path = []; return false; } // unreachable: just arrive (off-screen shortcut)
    e.path = path; e.pathGoal = { tx, ty };
    return true;
  };

  MH.distTiles = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / T;

  // ------------------------------------------------------------ the player's house
  MH.roomOf = (e) => { const R = MH.world.roomAt(Math.floor(e.x / T), Math.floor((e.y - 2) / T)); return R ? R.id : null; };
  MH.isInside = (e) => MH.roomOf(e) === 'home';
  MH.fadeTo = function (fn) {
    const f = document.getElementById('fade');
    MH.fading = true; f.classList.add('on');
    setTimeout(() => { fn(); MH.render.snap(); setTimeout(() => { f.classList.remove('on'); MH.fading = false; }, 150); }, 450);
  };
  MH.enterRoom = function (id) {
    const R = MH.world.rooms[id];
    MH.fadeTo(() => { MH.player.setTile(R.doorX, R.y1 - 1); MH.player.dir = 'up'; MH.emit('room', { id, inside: true }); });
  };
  MH.exitRoom = function (id) {
    const R = MH.world.rooms[id], b = MH.world.buildingById[R.building];
    MH.fadeTo(() => { const f = MH.world.nearestWalkable(b.doorX, b.doorY + 1); MH.player.setTile(f.tx, f.ty); MH.player.dir = 'down'; MH.emit('room', { id, inside: false }); });
  };
  MH.enterHome = () => MH.enterRoom('home');
  MH.exitHome = () => MH.exitRoom('home');
  // a villager walks in through your door
  MH.npcEnterHome = function (e) {
    const spots = [[159, 11], [162, 11], [158, 10], [163, 9], [159, 8], [162, 8], [157, 11], [164, 11], [156, 10], [165, 8], [163, 12], [158, 12]];
    const taken = new Set(MH.npcs.filter((o) => o !== e && !o.hidden && MH.isInside(o)).map((o) => o.tile().tx + ',' + o.tile().ty));
    const s = spots.find(([x, y]) => !taken.has(x + ',' + y)) || [160, 11];
    e.setTile(s[0], s[1]); e.hidden = false; e.path = null; e.dir = 'down';
  };
})(window.MH);
