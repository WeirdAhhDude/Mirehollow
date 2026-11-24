// Mirehollow — renderer: low-res pixel canvas scaled up, y-sorted sprites, lighting, weather, particles.
'use strict';
(function (MH) {
  const T = MH.TILE;
  const R = (MH.render = { cam: { x: 0, y: 0, tx: null, ty: null }, zoom: 3, fx: [] });
  let canvas, ctx, ground, light, lctx;

  R.init = function (cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    ground = MH.art.renderGround();
    [light, lctx] = MH.art.mk(8, 8);
    R.resize();
    window.addEventListener('resize', R.resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', R.resize);
  };
  R.rebuildGround = () => { ground = MH.art.renderGround(); };

  R.resize = function () {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.parentElement.clientWidth || window.innerWidth, cssH = canvas.parentElement.clientHeight || window.innerHeight;
    const pw = cssW * dpr, ph = cssH * dpr;
    const target = Math.min(ph, pw * 0.75);
    R.zoom = Math.max(1, Math.round(target / 250));
    canvas.width = Math.ceil(pw / R.zoom);
    canvas.height = Math.ceil(ph / R.zoom);
    canvas.style.width = (canvas.width * R.zoom) / dpr + 'px';
    canvas.style.height = (canvas.height * R.zoom) / dpr + 'px';
    ctx.imageSmoothingEnabled = false;
    light.width = canvas.width; light.height = canvas.height;
    R.cssScale = R.zoom / dpr;
  };

  R.worldToScreen = (x, y) => ({ x: (x - R.cam.x) * R.cssScale, y: (y - R.cam.y) * R.cssScale });
  R.viewW = () => canvas.width;
  R.viewH = () => canvas.height;

  R.focus = function (x, y) { R.cam.tx = x; R.cam.ty = y; };
  R.clearFocus = function () { R.cam.tx = null; R.cam.ty = null; };

  function updateCamera(dt, snap) {
    const p = MH.player;
    let fx = R.cam.tx != null ? R.cam.tx : p.x, fy = R.cam.ty != null ? R.cam.ty : p.y - 10;
    // keep focus above the chat UI when chatting
    const chatting = MH.chat && MH.chat.active;
    const yOff = chatting ? canvas.height * 0.16 : 0;
    const xOff = chatting && canvas.width > canvas.height * 1.2 ? canvas.width * 0.14 : 0;
    let tx = fx - canvas.width / 2 + xOff, ty = fy - canvas.height / 2 + yOff;
    const maxX = MH.world.W * T - canvas.width, maxY = MH.world.H * T - canvas.height;
    tx = MH.clamp(tx, 0, Math.max(0, maxX)); ty = MH.clamp(ty, 0, Math.max(0, maxY));
    if (snap) { R.cam.x = tx; R.cam.y = ty; }
    else { const k = 1 - Math.pow(0.0015, dt); R.cam.x += (tx - R.cam.x) * k; R.cam.y += (ty - R.cam.y) * k; }
  }
  R.snap = () => updateCamera(0, true);

  // ------------------------------------------------------------ lighting
  function darkness() {
    const m = MH.state.time.minutes, h = m / 60;
    if (h >= 7.5 && h < 17.5) return 0;
    if (h >= 17.5 && h < 21) return ((h - 17.5) / 3.5) * 0.62;
    if (h >= 21 || h < 4.5) return 0.62;
    return 0.62 * (1 - (h - 4.5) / 3);
  }
  function duskTint() {
    const h = MH.state.time.minutes / 60;
    if (h > 16.5 && h < 20.5) return Math.sin(((h - 16.5) / 4) * Math.PI) * 0.18;
    if (h > 5 && h < 8) return Math.sin(((h - 5) / 3) * Math.PI) * 0.1;
    return 0;
  }

  // ------------------------------------------------------------ particles
  R.burst = function (x, y, kind, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = MH.rand(20, 70);
      R.fx.push({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === 'crow' ? 40 : 20), life: MH.rand(0.8, 1.6), t: 0 });
    }
  };
  function updateFx(dt) {
    R.fx = R.fx.filter((f) => (f.t += dt) < f.life);
    for (const f of R.fx) { f.x += f.vx * dt; f.y += f.vy * dt; if (f.kind === 'heart' || f.kind === 'sparkle') f.vy -= 10 * dt; }
  }
  function drawFx(cx, cy) {
    for (const f of R.fx) {
      const x = Math.round(f.x - cx), y = Math.round(f.y - cy), a = 1 - f.t / f.life;
      ctx.globalAlpha = a;
      if (f.kind === 'crow') { ctx.fillStyle = '#1a1420'; ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1); ctx.fillRect(x, y + 1, 1, 1); }
      else if (f.kind === 'heart') { ctx.fillStyle = '#ff5a8a'; ctx.fillRect(x - 1, y, 3, 2); ctx.fillRect(x, y + 2, 1, 1); }
      else if (f.kind === 'sparkle') { ctx.fillStyle = '#fff6a0'; ctx.fillRect(x, y - 1, 1, 3); ctx.fillRect(x - 1, y, 3, 1); }
      else if (f.kind === 'glitter') { ctx.fillStyle = ['#ff6ad0', '#6af0ff', '#fff06a'][Math.floor(f.x) % 3]; ctx.fillRect(x, y, 1, 1); }
      else { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 1, 1); }
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ weather
  const drops = [];
  function drawWeather(dt) {
    const w = MH.state.weather;
    if (w !== 'rain' && w !== 'storm') { drops.length = 0; return; }
    const want = w === 'storm' ? 160 : 90;
    while (drops.length < want) drops.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, s: MH.rand(140, 220) });
    ctx.fillStyle = 'rgba(190,215,255,0.55)';
    for (const d of drops) {
      d.y += d.s * dt; d.x -= d.s * 0.25 * dt;
      if (d.y > canvas.height) { d.y = -4; d.x = Math.random() * (canvas.width + 40); }
      ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 4);
    }
    ctx.fillStyle = 'rgba(40,60,90,0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (w === 'storm' && Math.random() < 0.004) R.flash = 0.25;
  }

  // ------------------------------------------------------------ main draw
  R.draw = function (dt) {
    updateCamera(dt);
    updateFx(dt);
    const cx = Math.round(R.cam.x), cy = Math.round(R.cam.y);
    const vw = canvas.width, vh = canvas.height;
    ctx.fillStyle = '#1e3a24';
    ctx.fillRect(0, 0, vw, vh);
    ctx.drawImage(ground, cx, cy, vw, vh, 0, 0, vw, vh);

    // water shimmer
    const t = MH.now;
    const tx0 = Math.floor(cx / T), ty0 = Math.floor(cy / T), tx1 = tx0 + Math.ceil(vw / T) + 1, ty1 = ty0 + Math.ceil(vh / T) + 1;
    for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
      const g = MH.world.g(tx, ty);
      if (g !== MH.G.WATER && g !== MH.G.DEEP && g !== MH.G.SWAMP) continue;
      const ph = MH.hash2(tx, ty, 77) * 6.28;
      const v = Math.sin(t * 1.6 + ph);
      if (v > 0.6) {
        ctx.fillStyle = g === MH.G.SWAMP ? 'rgba(160,200,120,0.35)' : 'rgba(230,248,255,0.6)';
        const ox = Math.floor(MH.hash2(tx, ty, 5) * 10), oy = Math.floor(MH.hash2(tx, ty, 6) * 12) + 2;
        ctx.fillRect(tx * T - cx + ox, ty * T - cy + oy, 3 + Math.round(v * 2), 1);
      }
    }

    const inView = (x, y, m = 48) => x > cx - m && x < cx + vw + m && y > cy - m && y < cy + vh + m * 2;

    // flat props
    for (const p of MH.world.props) {
      if (!p.flat || !inView(p.x, p.y)) continue;
      if (p.pick && MH.isPicked(p)) continue;
      const s = MH.art.prop(p);
      ctx.drawImage(s, Math.round(p.x - s.width / 2 - cx), Math.round(p.y - s.height + 2 - cy));
    }

    // sortables
    const list = [];
    for (const p of MH.world.props) if (!p.flat && inView(p.x, p.y)) list.push({ y: p.y, p });
    for (const b of MH.world.buildings) {
      const bx = b.x * T, by = (b.y + b.h) * T;
      if (bx + b.w * T < cx - 20 || bx > cx + vw + 20 || by < cy - 10 || by - b.h * T - 40 > cy + vh) continue;
      list.push({ y: by - 1, b });
    }
    for (const e of MH.npcs) if (!e.hidden && inView(e.x, e.y, 80)) list.push({ y: e.y, e });
    if (!MH.titleMode) list.push({ y: MH.player.y, e: MH.player });
    list.sort((a, b) => a.y - b.y);

    for (const it of list) {
      if (it.p) {
        const p = it.p;
        if (p.pick && MH.isPicked(p) && p.type !== 'corn' && p.type !== 'bush') continue;
        const s = MH.art.prop(p);
        ctx.drawImage(s, Math.round(p.x - s.width / 2 - cx + (p.w === 2 ? 8 : 0)), Math.round(p.y - s.height + 3 - cy));
      } else if (it.b) {
        const b = it.b, s = MH.art.building(b), o = MH.art.buildingOffset(b);
        ctx.drawImage(s, Math.round(o.ox - cx), Math.round(o.oy - cy));
      } else drawEntity(it.e, cx, cy);
    }

    // talk target indicator
    const tgt = MH.sim && MH.sim.target;
    if (tgt && !(MH.chat && MH.chat.active)) {
      const bob = Math.round(Math.sin(t * 6) * 1.5);
      const hy = tgt.e ? headTop(tgt.e) : tgt.y - 20;
      const x = Math.round((tgt.e ? tgt.e.x : tgt.x) - cx), y = Math.round(hy - cy - 6 + bob);
      ctx.fillStyle = '#1a1420'; ctx.fillRect(x - 3, y - 1, 7, 4); ctx.fillRect(x - 2, y + 3, 5, 1); ctx.fillRect(x - 1, y + 4, 3, 1);
      ctx.fillStyle = '#ffd23a'; ctx.fillRect(x - 2, y, 5, 2); ctx.fillRect(x - 1, y + 2, 3, 1); ctx.fillRect(x, y + 3, 1, 1);
    }

    // swarm near Maggie at dusk / swamp
    drawSwarm(cx, cy);
    drawFx(cx, cy);
    drawWeather(dt);

    // lighting
    const dark = darkness();
    const dusk = duskTint();
    if (dusk > 0) { ctx.fillStyle = `rgba(255,120,60,${dusk})`; ctx.fillRect(0, 0, vw, vh); }
    if (dark > 0.02) {
      lctx.globalCompositeOperation = 'source-over';
      lctx.clearRect(0, 0, vw, vh);
      lctx.fillStyle = `rgba(14,18,52,${dark})`;
      lctx.fillRect(0, 0, vw, vh);
      lctx.globalCompositeOperation = 'destination-out';
      const lights = MH.world.lights.slice();
      lights.push({ x: MH.player.x, y: MH.player.y - 8, r: 30 });
      for (const L of lights) {
        if (!inView(L.x, L.y, L.r + 10)) continue;
        if (L.window && L.b && L.b.cave) continue;
        const flick = L.lamp ? 1 + Math.sin(t * 7 + L.x) * 0.04 : 1;
        const g = lctx.createRadialGradient(L.x - cx, L.y - cy, 0, L.x - cx, L.y - cy, L.r * flick);
        g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.5, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = g;
        lctx.fillRect(L.x - cx - L.r, L.y - cy - L.r, L.r * 2, L.r * 2);
      }
      // glowing villagers (Solaris)
      const sol = MH.npcById.solaris;
      if (sol && !sol.hidden) {
        const g = lctx.createRadialGradient(sol.x - cx, sol.y - 14 - cy, 0, sol.x - cx, sol.y - 14 - cy, 70);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = g; lctx.fillRect(sol.x - cx - 70, sol.y - cy - 84, 140, 140);
      }
      ctx.drawImage(light, 0, 0);
      // warm glow on lamps
      ctx.globalCompositeOperation = 'lighter';
      for (const L of MH.world.lights) {
        if (!L.lamp || !inView(L.x, L.y)) continue;
        const g = ctx.createRadialGradient(L.x - cx, L.y - cy, 0, L.x - cx, L.y - cy, 18);
        g.addColorStop(0, `rgba(255,200,110,${0.35 * dark})`); g.addColorStop(1, 'rgba(255,200,110,0)');
        ctx.fillStyle = g; ctx.fillRect(L.x - cx - 18, L.y - cy - 18, 36, 36);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // Solaris glow by day
    const sol = MH.npcById.solaris;
    if (sol && !sol.hidden && inView(sol.x, sol.y)) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sol.x - cx, sol.y - 16 - cy, 0, sol.x - cx, sol.y - 16 - cy, 40);
      g.addColorStop(0, 'rgba(255,210,90,0.35)'); g.addColorStop(1, 'rgba(255,210,90,0)');
      ctx.fillStyle = g; ctx.fillRect(sol.x - cx - 40, sol.y - cy - 56, 80, 80);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (R.flash) { ctx.fillStyle = `rgba(255,255,255,${R.flash})`; ctx.fillRect(0, 0, vw, vh); R.flash = Math.max(0, R.flash - dt); }
  };

  function headTop(e) {
    const s = e.sprite, sc = s.scale || 1;
    const lookT = (e.ch && e.ch.look && e.ch.look.tall) || 0;
    return e.y - (24 + lookT) * sc;
  }
  R.headTop = headTop;

  function drawEntity(e, cx, cy) {
    const s = e.sprite; if (!s) return;
    const sc = s.scale || 1;
    const frames = s[e.dir] || s.down;
    const img = frames[e.asleep ? 0 : e.frame] || frames[0];
    const w = img.width * sc, h = img.height * sc;
    const x = Math.round(e.x - w / 2 - cx), y = Math.round(e.y - h + 3 * sc - cy);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    const sw = 7 * sc;
    for (let i = -2; i <= 1; i++) { const ww = Math.round(sw * Math.sqrt(1 - (i * i) / 5)); ctx.fillRect(Math.round(e.x - cx) - ww, Math.round(e.y - cy) + i + 1, ww * 2, 1); }
    if (e.id === 'nimbus' || e.id === 'zahra') { /* floating */ }
    if (e.asleep && e.id !== 'scarecrow') {
      ctx.save();
      ctx.translate(Math.round(e.x - cx), Math.round(e.y - cy - 4));
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, -h + 6 * sc, -w / 2, h, w);
      ctx.restore();
    } else {
      const floatY = e.id === 'zahra' || e.id === 'nimbus' || e.id === 'darkborn' ? Math.round(Math.sin(MH.now * 2 + e.x) * 1.5) - 2 : 0;
      ctx.drawImage(img, x, y + floatY, w, h);
    }
    // emote
    if (e.asleep && Math.floor(MH.now * 1.2) % 3 !== 0) {
      const em = MH.art.emote('zzz');
      ctx.drawImage(em, Math.round(e.x - cx + 4), Math.round(e.y - cy - 26 - (MH.now * 4) % 4));
    } else if (e.emote && e.emote.until > MH.now) {
      const em = MH.art.emote(e.emote.name);
      const bob = Math.round(Math.sin(MH.now * 8) * 1);
      ctx.drawImage(em, Math.round(e.x - cx - em.width / 2), Math.round(headTop(e) - cy - 14 + bob));
    }
  }

  // Maggie's swarm: little dark dots buzzing around her or in the swamp at dusk.
  const swarm = Array.from({ length: 18 }, () => ({ a: Math.random() * 6.28, r: MH.rand(6, 18), s: MH.rand(2, 5), o: Math.random() * 6 }));
  function drawSwarm(cx, cy) {
    const m = MH.npcById.maggie;
    if (!m || m.hidden) return;
    ctx.fillStyle = '#2a2430';
    for (const b of swarm) {
      const a = b.a + MH.now * b.s;
      const x = Math.round(m.x + Math.cos(a) * b.r + Math.sin(MH.now * 3 + b.o) * 3 - cx);
      const y = Math.round(m.y - 26 + Math.sin(a * 1.3) * b.r * 0.6 - cy);
      ctx.fillRect(x, y, 1, 1);
    }
  }
})(window.MH);
