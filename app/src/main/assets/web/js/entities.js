// Mirehollow — player & villager entities, movement, collision.
'use strict';
(function (MH) {
  const T = MH.TILE;
  MH.npcs = [];
  MH.npcById = {};

  const SPEED = { bunny: 85, patty: 30, kira: 42, box: 55, chuckles: 62, mole: 38, owl: 34, gertie: 46, zahra: 40, darkborn: 38, nimbus: 36, sable: 36, scarecrow: 0 };

  function Entity(opts) {
    Object.assign(this, {
      x: 0, y: 0, dir: 'down', frame: 0, animT: 0, moving: false, speed: 50, path: null, pathGoal: null,
      hidden: false, asleep: false, emote: null, state: 'idle', idleT: 0, bubble: null,
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

  const HB = 4; // half hitbox width
  function blockedAt(x, y) {
    const pts = [[x - HB, y - 4], [x + HB, y - 4], [x - HB, y], [x + HB, y]];
    for (const [px, py] of pts) if (!MH.world.walkable(Math.floor(px / T), Math.floor(py / T))) return true;
    return false;
  }
  MH.blockedAt = blockedAt;

  function tryMove(e, dx, dy) {
    let moved = false;
    if (dx && !blockedAt(e.x + dx, e.y)) { e.x += dx; moved = true; }
    else if (dx) {
      // slide around corners
      for (const s of [-1, 1]) if (!blockedAt(e.x + dx, e.y + s * 2)) { e.y += s * 0.6; break; }
    }
    if (dy && !blockedAt(e.x, e.y + dy)) { e.y += dy; moved = true; }
    else if (dy) {
      for (const s of [-1, 1]) if (!blockedAt(e.x + s * 2, e.y + dy)) { e.x += s * 0.6; break; }
    }
    return moved;
  }

  function animate(e, dt, moving) {
    e.moving = moving;
    if (moving) {
      e.animT += dt * (e.running ? 11 : 7);
      e.frame = 1 + (Math.floor(e.animT) % 2);
    } else { e.frame = 0; e.animT = 0; }
  }

  // ------------------------------------------------------------ player
  MH.makePlayer = function () {
    const st = MH.state.player;
    const p = new Entity({ id: 'player', isPlayer: true, speed: 72 });
    p.setTile(st.tx, st.ty);
    if (!MH.world.walkable(st.tx, st.ty)) { const n = MH.world.nearestWalkable(st.tx, st.ty); p.setTile(n.tx, n.ty); }
    p.sprite = MH.art.chibi({ id: 'player_' + MH.uid(), species: 'player', look: MH.art.playerLook(st.look) });
    MH.player = p;
    return p;
  };
  MH.refreshPlayerSprite = function () {
    MH.player.sprite = MH.art.chibi({ id: 'player_' + MH.uid(), species: 'player', look: MH.art.playerLook(MH.state.player.look) });
  };

  MH.updatePlayer = function (dt) {
    const p = MH.player, inp = MH.input;
    if (MH.chat && MH.chat.active) { animate(p, dt, false); return; }
    if (MH.ui && MH.ui.modalOpen) { animate(p, dt, false); return; }
    let { mx, my, run } = inp.move();
    const mag = Math.hypot(mx, my);
    if (mag > 0.15) {
      p.running = run || mag > 0.92;
      const sp = p.speed * (p.running ? 1.65 : 1) * Math.min(1, mag);
      const nx = mx / mag, ny = my / mag;
      tryMove(p, nx * sp * dt, ny * sp * dt);
      if (Math.abs(nx) > Math.abs(ny)) p.dir = nx < 0 ? 'left' : 'right'; else p.dir = ny < 0 ? 'up' : 'down';
      animate(p, dt, true);
    } else animate(p, dt, false);
    // soft push away from villagers
    for (const e of MH.npcs) {
      if (e.hidden) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 9 && d > 0.01) { const k = (9 - d) / d * 0.5; tryMove(p, (p.x - e.x) * k, (p.y - e.y) * k); }
    }
    const t = p.tile();
    MH.state.player.tx = t.tx; MH.state.player.ty = t.ty;
  };

  // ------------------------------------------------------------ villagers
  MH.makeNpcs = function () {
    MH.npcs.length = 0;
    MH.CHARS.forEach((ch) => {
      const e = new Entity({ id: ch.id, ch, speed: SPEED[ch.id] || 48 });
      e.sprite = MH.art.chibi(ch);
      const spot = MH.world.randomSpot(ch.home) || { tx: 47, ty: 34 };
      e.setTile(spot.tx, spot.ty);
      MH.npcs.push(e);
      MH.npcById[ch.id] = e;
    });
  };

  // Walk along a path toward goal tile. Returns true when arrived.
  MH.npcWalk = function (e, dt) {
    if (!e.path || !e.path.length) { animate(e, dt, false); return true; }
    const n = e.path[0];
    const gx = n.tx * T + T / 2, gy = n.ty * T + T - 3;
    const dx = gx - e.x, dy = gy - e.y, d = Math.hypot(dx, dy);
    const sp = e.speed * (e.hurry ? 1.6 : 1) * dt;
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
    if (path === null) { // stuck: teleport-ish to nearest walkable then retry later
      const n = MH.world.nearestWalkable(t.tx, t.ty); e.setTile(n.tx, n.ty); e.path = []; return false;
    }
    e.path = path; e.pathGoal = { tx, ty };
    return true;
  };

  MH.distTiles = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / T;
})(window.MH);
