// Mirehollow — renderer: screen-resolution painted world, chunked ground, y-sorted sprites,
// utility wires, train & crossings, lighting, weather, particles.
'use strict';
(function (MH) {
  const T = MH.TILE;
  const R = (MH.render = { cam: { x: 0, y: 0, tx: null, ty: null }, zoom: 4, fx: [], dpr: 1 });
  let canvas, ctx, light, lctx, buckets = null, BW = 0;
  const BUCKET = 8;

  R.init = function (cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    light = document.createElement('canvas'); lctx = light.getContext('2d');
    R.buildBuckets();
    R.resize();
    window.addEventListener('resize', R.resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', R.resize);
  };

  R.buildBuckets = function () {
    BW = Math.ceil(MH.world.W / BUCKET);
    const BH = Math.ceil(MH.world.H / BUCKET);
    buckets = Array.from({ length: BW * BH }, () => []);
    for (const p of MH.world.props) buckets[Math.floor(p.ty / BUCKET) * BW + Math.floor(p.tx / BUCKET)].push(p);
  };
  R.addProp = function (p) { if (buckets) buckets[Math.floor(p.ty / BUCKET) * BW + Math.floor(p.tx / BUCKET)].push(p); };
  R.removeProp = function (p) { if (!buckets) return; const b = buckets[Math.floor(p.ty / BUCKET) * BW + Math.floor(p.tx / BUCKET)]; const i = b.indexOf(p); if (i >= 0) b.splice(i, 1); };

  R.resize = function () {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    R.dpr = dpr;
    const cssW = canvas.parentElement.clientWidth || window.innerWidth, cssH = canvas.parentElement.clientHeight || window.innerHeight;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    // portrait phones: ~11.5 tiles across; landscape screens: ~13 tiles tall
    const byW = canvas.width / (11.5 * T), byH = canvas.height / (13 * T);
    R.zoom = canvas.width < canvas.height ? Math.min(byW, byH * 1.6) : Math.min(byH, byW * 1.4);
    R.zoom = Math.max(1.5, R.zoom);
    R.baseZoom = R.zoom;
    MH.art.setScale(R.zoom);
    light.width = Math.ceil(canvas.width / 3); light.height = Math.ceil(canvas.height / 3);
    R.cssScale = R.zoom / dpr;
  };

  R.worldToScreen = (x, y) => ({ x: ((x - R.cam.x) * R.zoom) / R.dpr, y: ((y - R.cam.y) * R.zoom) / R.dpr });
  R.viewW = () => canvas.width / R.zoom;
  R.viewH = () => canvas.height / R.zoom;
  R.focus = function (x, y) { R.cam.tx = x; R.cam.ty = y; };
  R.clearFocus = function () { R.cam.tx = null; R.cam.ty = null; };

  function updateCamera(dt, snap) {
    const p = MH.player;
    // indoors: zoom so the whole room fits the screen width
    const I0 = MH.titleMode ? null : MH.world.roomAt(Math.floor(p.x / T), Math.floor(p.y / T));
    R.zoom = I0 ? Math.min(R.baseZoom, canvas.width / ((I0.x1 - I0.x0 + 1) * T + 6)) : R.baseZoom;
    const vw = R.viewW(), vh = R.viewH();
    let fx = R.cam.tx != null ? R.cam.tx : p.x, fy = R.cam.ty != null ? R.cam.ty : p.y - 12;
    let tx = fx - vw / 2, ty = fy - vh / 2;
    const ptx = Math.floor(p.x / T), pty = Math.floor(p.y / T);
    const I = I0;
    let x0 = 0, y0 = 0, x1 = MH.world.TOWN_W * T, y1 = MH.world.H * T;
    if (I) { x0 = I.x0 * T - 8; y0 = I.y0 * T - 24; x1 = (I.x1 + 1) * T + 8; y1 = (I.y1 + 1) * T + 16; }
    tx = x1 - x0 < vw ? (x0 + x1) / 2 - vw / 2 : MH.clamp(tx, x0, x1 - vw);
    ty = y1 - y0 < vh ? (y0 + y1) / 2 - vh / 2 : MH.clamp(ty, y0, y1 - vh);
    if (snap || Math.abs(tx - R.cam.x) > vw * 1.5 || Math.abs(ty - R.cam.y) > vh * 1.5) { R.cam.x = tx; R.cam.y = ty; }
    else { const k = 1 - Math.pow(0.002, dt); R.cam.x += (tx - R.cam.x) * k; R.cam.y += (ty - R.cam.y) * k; }
  }
  R.snap = () => updateCamera(0, true);

  // ------------------------------------------------------------ lighting curves
  function darkness() {
    const h = MH.state.time.minutes / 60;
    if (h >= 7 && h < 17.5) return 0;
    if (h >= 17.5 && h < 20.5) return ((h - 17.5) / 3) * 0.6;
    if (h >= 20.5 || h < 4.5) return 0.6;
    return 0.6 * (1 - (h - 4.5) / 2.5);
  }
  function duskTint() {
    const h = MH.state.time.minutes / 60;
    if (h > 16 && h < 20.5) return Math.sin(((h - 16) / 4.5) * Math.PI) * 0.2;
    if (h > 5 && h < 8) return Math.sin(((h - 5) / 3) * Math.PI) * 0.12;
    return 0;
  }
  R.darkness = darkness;

  // ------------------------------------------------------------ particles
  R.burst = function (x, y, kind, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = MH.rand(20, 70);
      R.fx.push({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === 'crow' ? 40 : 20), life: MH.rand(0.8, 1.6), t: 0, r: Math.random() * 6 });
    }
  };
  function updateFx(dt) {
    R.fx = R.fx.filter((f) => (f.t += dt) < f.life);
    for (const f of R.fx) { f.x += f.vx * dt; f.y += f.vy * dt; if (f.kind === 'heart' || f.kind === 'sparkle' || f.kind === 'note') f.vy -= 10 * dt; else if (f.kind === 'fire') { f.vy -= 60 * dt; f.vx *= 0.9; } }
  }
  function drawFx() {
    for (const f of R.fx) {
      const a = 1 - f.t / f.life;
      ctx.globalAlpha = a;
      if (f.kind === 'crow') { ctx.strokeStyle = '#1a1420'; ctx.lineWidth = 1.2; ctx.beginPath(); const w = 3 + Math.sin(f.t * 20) * 1.5; ctx.moveTo(f.x - 4, f.y - w * 0.5); ctx.quadraticCurveTo(f.x - 2, f.y, f.x, f.y); ctx.quadraticCurveTo(f.x + 2, f.y, f.x + 4, f.y - w * 0.5); ctx.stroke(); }
      else if (f.kind === 'heart') { ctx.fillStyle = '#ff5a8a'; ctx.beginPath(); ctx.moveTo(f.x, f.y + 2); ctx.bezierCurveTo(f.x - 3, f.y - 0.5, f.x - 1.5, f.y - 3, f.x, f.y - 1.2); ctx.bezierCurveTo(f.x + 1.5, f.y - 3, f.x + 3, f.y - 0.5, f.x, f.y + 2); ctx.fill(); }
      else if (f.kind === 'sparkle') { ctx.fillStyle = '#fff6a0'; ctx.beginPath(); for (let i = 0; i < 4; i++) { const ang = (i / 4) * Math.PI * 2 + f.r; ctx.lineTo(f.x + Math.cos(ang) * 2.2, f.y + Math.sin(ang) * 2.2); ctx.lineTo(f.x + Math.cos(ang + 0.785) * 0.7, f.y + Math.sin(ang + 0.785) * 0.7); } ctx.fill(); }
      else if (f.kind === 'fire') { const k = Math.max(0, 1 - f.t / f.life); ctx.fillStyle = `rgba(255,${Math.round(120 + 100 * k)},40,${0.85 * k})`; ctx.beginPath(); ctx.arc(f.x, f.y, 1.2 + 2.4 * k, 0, 7); ctx.fill(); }
      else if (f.kind === 'note') { ctx.fillStyle = '#8a5ae8'; ctx.beginPath(); ctx.ellipse(f.x, f.y, 1.4, 1, -0.3, 0, 7); ctx.fill(); ctx.fillRect(f.x + 1, f.y - 5, 0.6, 5); }
      else if (f.kind === 'petal') { ctx.fillStyle = '#f8c4d4'; ctx.beginPath(); ctx.ellipse(f.x, f.y, 1.2, 0.6, f.r + f.t * 3, 0, 7); ctx.fill(); }
      else { ctx.fillStyle = '#ffffff'; ctx.fillRect(f.x, f.y, 1, 1); }
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ weather (screen space)
  const drops = [];
  function drawWeather(dt) {
    const w = MH.state.weather;
    const inside = MH.world.inInterior(Math.floor(MH.player.x / T), Math.floor(MH.player.y / T));
    if ((w !== 'rain' && w !== 'storm') || inside) { drops.length = 0; return; }
    const W = canvas.width, H = canvas.height;
    const want = w === 'storm' ? 220 : 130;
    while (drops.length < want) drops.push({ x: Math.random() * W, y: Math.random() * H, s: MH.rand(900, 1400) * R.dpr / 2 });
    ctx.strokeStyle = 'rgba(200,220,255,0.5)'; ctx.lineWidth = 1.2 * R.dpr;
    ctx.beginPath();
    for (const d of drops) {
      d.y += d.s * dt; d.x -= d.s * 0.18 * dt;
      if (d.y > H) { d.y = -10; d.x = Math.random() * (W + 80); }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 3 * R.dpr, d.y - 14 * R.dpr);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(40,60,90,0.16)'; ctx.fillRect(0, 0, W, H);
    if (w === 'storm' && Math.random() < 0.004) R.flash = 0.28;
  }

  // ------------------------------------------------------------ entity drawing
  const FOOT = () => MH.art.CHIBI_FOOT;
  function tallOf(e) { return (e.ch && e.ch.look && e.ch.look.tall) || 0; }
  R.headTop = function (e) { const sc = MH.art.chibiScale(e.ch || e); return e.y - (36 + tallOf(e) * 1.9) * sc; };

  // one of Clucky's chicks: a tiny yellow puff that hops
  function drawChick(c) {
    const hop = c.moving ? Math.abs(Math.sin(MH.now * 14 + c.i)) * 2.2 : 0, x = c.x, y = c.y - hop;
    ctx.fillStyle = 'rgba(20,30,20,0.2)'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 0.5, 3.2, 1.2, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(x, y); if (c.dir < 0) ctx.scale(-1, 1);
    if (c.asleep) { ctx.fillStyle = '#f8d850'; ctx.beginPath(); ctx.ellipse(0, -2.4, 3.6, 2.6, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(0.6, -2.8); ctx.lineTo(2, -2.8); ctx.stroke(); ctx.restore(); return; }
    ctx.strokeStyle = '#e08a20'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-1, -1); ctx.lineTo(-1.2, 0.4); ctx.moveTo(1, -1); ctx.lineTo(1.3, 0.4); ctx.stroke();
    ctx.fillStyle = '#f8d850'; ctx.strokeStyle = '#c89a20'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.ellipse(0, -3, 3.2, 2.7, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(1.6, -6, 2.1, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f09a20'; ctx.beginPath(); ctx.moveTo(3.4, -6.4); ctx.lineTo(5, -5.8); ctx.lineTo(3.4, -5.2); ctx.fill();
    ctx.fillStyle = '#1a1410'; ctx.beginPath(); ctx.arc(2.4, -6.5, 0.5, 0, 7); ctx.fill();
    ctx.restore();
    if (c.peep > 0) { ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('peep!', x, y - 11 - (1.1 - c.peep) * 4); }
  }
  function drawEntity(e) {
    const ch = e.ch || e.chr;
    if (!ch) return;
    const sc = MH.art.chibiScale(ch);
    // soft shadow
    ctx.fillStyle = 'rgba(20,30,20,0.24)';
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 0.5, 6.5 * sc, 2.4 * sc, 0, 0, Math.PI * 2); ctx.fill();
    const flying = e.isPlayer && MH.state && (MH.state.player.flyUntil || 0) > MH.absMinutes();
    const float = ch.id === 'zahra' || ch.id === 'nimbus' || ch.id === 'darkborn' ? Math.sin(MH.now * 2 + e.x) * 1.5 - 2 : flying ? -10 + Math.sin(MH.now * 5) * 2 : 0;
    const ghost = e.isPlayer && MH.state && (MH.state.player.invisUntil || 0) > MH.absMinutes();
    if (ghost) ctx.globalAlpha = 0.35;
    if (flying) { ctx.fillStyle = 'rgba(255,150,40,0.85)'; ctx.beginPath(); ctx.ellipse(e.x - 3, e.y - 4 + float + 8, 1.6, 3 + Math.random() * 3, 0, 0, 7); ctx.ellipse(e.x + 3, e.y - 4 + float + 8, 1.6, 3 + Math.random() * 3, 0, 0, 7); ctx.fill(); }
    const img = MH.art.chibiFrame(ch, e.dir, e.asleep ? 0 : e.frame);
    const w = MH.art.CW * sc, h = MH.art.CH * sc;
    if (e.asleep && ch.id !== 'scarecrow') {
      ctx.save(); ctx.translate(e.x, e.y - 4); ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, -h + 12 * sc, -w / 2, h, w); ctx.restore();
    } else if (e.dir === 'right') {
      ctx.save(); ctx.translate(e.x, 0); ctx.scale(-1, 1); ctx.drawImage(img, -w / 2, e.y - FOOT() * sc + float, w, h); ctx.restore();
    } else ctx.drawImage(img, e.x - w / 2, e.y - FOOT() * sc + float, w, h);
    // name-free emotes
    if (e.asleep && Math.floor(MH.now * 1.2) % 3 !== 0) MH.art.drawEmote(ctx, 'zzz', e.x + 6, e.y - 22 - ((MH.now * 4) % 4), 0.9);
    else if (e.emote && e.emote.until > MH.now) MH.art.drawEmote(ctx, e.emote.name, e.x, R.headTop(e) - 9 + Math.sin(MH.now * 8), 1);
    if (ghost) ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ train
  function drawTrain(tr) {
    const y = 36 * T + 16; // centre between rails
    ctx.save(); ctx.beginPath(); ctx.rect(-400, 0, MH.world.TOWN_W * T + 400, MH.world.H * T); ctx.clip();
    const carW = 7 * T, carH = 26, gap = 3;
    for (let i = 0; i < tr.cars; i++) {
      const x0 = tr.x + (tr.dir > 0 ? -i : i) * (carW + gap) - carW / 2;
      ctx.fillStyle = 'rgba(20,30,20,0.25)'; ctx.fillRect(x0 + 4, y + 4, carW, 8);
      ctx.save(); ctx.translate(x0, y - carH + 6);
      const r = 5;
      ctx.beginPath(); ctx.roundRect(0, 0, carW, carH, r); ctx.fillStyle = '#f2ecd8'; ctx.fill(); ctx.strokeStyle = '#4a4438'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#3f8a6a'; ctx.fillRect(1, carH - 9, carW - 2, 4);
      ctx.fillStyle = '#c86a3a'; ctx.fillRect(1, carH - 5, carW - 2, 1.5);
      ctx.fillStyle = '#5a6670'; ctx.fillRect(0, 0, carW, 4);
      for (let k = 0; k < 7; k++) { ctx.fillStyle = MH.render.darkness() > 0.2 ? '#ffe8a8' : '#9cc8e0'; ctx.beginPath(); ctx.roundRect(5 + k * 15, 7, 10, 8, 1.5); ctx.fill(); ctx.strokeStyle = '#4a4438'; ctx.lineWidth = 0.6; ctx.stroke(); }
      if (i === 0) { ctx.fillStyle = '#ffd86a'; ctx.beginPath(); ctx.arc(tr.dir > 0 ? carW - 3 : 3, carH - 7, 1.8, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ main draw
  R.draw = function (dt) {
    updateCamera(dt);
    updateFx(dt);
    const z = R.zoom, vw = R.viewW(), vh = R.viewH();
    const cx = R.cam.x, cy = R.cam.y;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#16120f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

    // indoors: only the current room is visible
    const RM = MH.titleMode ? null : MH.world.roomAt(Math.floor(MH.player.x / T), Math.floor((MH.player.y - 2) / T));
    if (RM) { ctx.save(); ctx.beginPath(); ctx.rect(RM.x0 * T, RM.y0 * T - 40, (RM.x1 - RM.x0 + 1) * T, (RM.y1 - RM.y0 + 1) * T + 40); ctx.clip(); }
    // ground chunks
    const CHW = MH.art.CHUNK * T;
    const c0x = Math.max(0, Math.floor(cx / CHW)), c1x = Math.floor((cx + vw) / CHW), c0y = Math.max(0, Math.floor(cy / CHW)), c1y = Math.floor((cy + vh) / CHW);
    for (let gy = c0y; gy <= c1y; gy++) for (let gx = c0x; gx <= c1x; gx++) {
      if (gx * CHW >= MH.world.W * T || gy * CHW >= MH.world.H * T) continue;
      ctx.drawImage(MH.art.groundChunk(gx, gy), gx * CHW, gy * CHW, CHW + 0.05, CHW + 0.05);
    }
    // water shimmer
    const t = MH.now;
    const tx0 = Math.floor(cx / T), ty0 = Math.floor(cy / T), tx1 = Math.ceil((cx + vw) / T), ty1 = Math.ceil((cy + vh) / T);
    ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(235,250,255,0.65)';
    ctx.beginPath();
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const g = MH.world.g(tx, ty);
      if (g !== MH.G.WATER && g !== MH.G.DEEP && g !== MH.G.PADDY && g !== MH.G.SPRING) continue;
      const ph = MH.hash2(tx, ty, 77) * 6.28, v = Math.sin(t * 1.5 + ph);
      if (v < 0.55) continue;
      const ox = tx * T + MH.hash2(tx, ty, 5) * 10 + (g === MH.G.WATER && ty < 77 ? (t * 6) % 6 : 0), oy = ty * T + 3 + MH.hash2(tx, ty, 6) * 10;
      ctx.moveTo(ox, oy); ctx.quadraticCurveTo(ox + 2, oy - 1, ox + 3 + v * 2, oy);
    }
    ctx.stroke();

    // gather visible props (buckets) + buildings + entities
    const m = 6;
    const b0x = Math.max(0, Math.floor((cx - 64) / (BUCKET * T))), b1x = Math.min(BW - 1, Math.floor((cx + vw + 64) / (BUCKET * T)));
    const b0y = Math.max(0, Math.floor((cy - 16) / (BUCKET * T))), b1y = Math.floor((cy + vh + 120) / (BUCKET * T));
    const flats = [], list = [];
    for (let by = b0y; by <= b1y; by++) for (let bx = b0x; bx <= b1x; bx++) {
      const bucket = buckets[by * BW + bx]; if (!bucket) continue;
      for (const p of bucket) {
        if (p.x < cx - 64 || p.x > cx + vw + 64 || p.y < cy - 8 || p.y > cy + vh + 120) continue;
        if (p.pick && MH.isPicked(p) && (p.flat || p.type === 'sunflower')) continue;
        (p.flat ? flats : list).push({ y: p.y, p });
      }
    }
    for (const fp of flats) { const s = MH.art.prop(fp.p); ctx.drawImage(s.img, fp.p.x + s.ox, fp.p.y + s.oy, s.w, s.h); }
    for (const b of MH.world.buildings) {
      const bx = b.x * T, by = (b.y + b.h) * T;
      if (bx + b.w * T < cx - 20 || bx > cx + vw + 20 || by + 16 < cy || by - b.h * T - 50 > cy + vh) continue;
      list.push({ y: by - 1, b });
    }
    for (const e of MH.npcs) if (!e.hidden && e.x > cx - 60 && e.x < cx + vw + 60 && e.y > cy - 20 && e.y < cy + vh + 90) list.push({ y: e.y, e });
    if (!MH.titleMode) list.push({ y: MH.player.y, e: MH.player });
    for (const c of MH.chicks || []) if (c.placed && c.x > cx - 20 && c.x < cx + vw + 20 && c.y > cy - 10 && c.y < cy + vh + 30) list.push({ y: c.y, chick: c });
    if (MH.train && MH.train.active && !RM) list.push({ y: 37 * T + 10, train: MH.train });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.p) { const s = MH.art.prop(it.p); ctx.drawImage(s.img, it.p.x + s.ox + (it.p.w === 2 ? 8 : 0), it.p.y + s.oy, s.w, s.h); }
      else if (it.b) { const s = MH.art.building(it.b), a = MH.art.buildingAnchor(it.b); ctx.drawImage(s.img, a.x + s.ox, a.y + s.oy, s.w, s.h); it.b._spr = s; }
      else if (it.train) drawTrain(it.train);
      else if (it.chick) drawChick(it.chick);
      else drawEntity(it.e);
    }

    if (RM) ctx.restore();
    // utility wires (high in the air, drawn above everything)
    ctx.strokeStyle = 'rgba(40,36,40,0.75)'; ctx.lineWidth = 0.55;
    ctx.beginPath();
    for (const [a, b] of MH.world.wires) {
      if (Math.max(a.x, b.x) < cx - 40 || Math.min(a.x, b.x) > cx + vw + 40 || Math.max(a.y, b.y) < cy - 20 || Math.min(a.y, b.y) - 110 > cy + vh) continue;
      for (const [dx, dy] of [[-9, -91], [-4, -91], [4, -91], [9, -91], [-6, -83], [6, -83]]) {
        const ax = a.x + dx, ay = a.y + dy, bx = b.x + dx, by = b.y + dy;
        const sag = 3 + Math.hypot(bx - ax, by - ay) * 0.035;
        ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by);
      }
    }
    ctx.stroke();

    // crossing lamps
    const blink = Math.floor(t * 2.4) % 2;
    for (const c of MH.world.crossings) {
      if (!c.active) continue;
      for (const p of c.signs || []) {
        const lamps = MH.art.crossingLamps(p);
        lamps.forEach(([lx, ly], i) => {
          if ((i + blink) % 2) return;
          const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 9); g.addColorStop(0, 'rgba(255,80,60,0.95)'); g.addColorStop(0.3, 'rgba(255,60,40,0.6)'); g.addColorStop(1, 'rgba(255,40,30,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, 9, 0, 7); ctx.fill();
        });
      }
    }

    // talk target indicator
    const tgt = MH.sim && MH.sim.target;
    if (tgt && !(MH.chat && MH.chat.active) && !MH.titleMode) {
      const bob = Math.sin(t * 6) * 1.5;
      const hx = tgt.e ? tgt.e.x : tgt.x, hy = (tgt.e ? R.headTop(tgt.e) : tgt.y - 18) - 10 + bob;
      ctx.beginPath(); ctx.moveTo(hx - 4, hy - 3); ctx.lineTo(hx + 4, hy - 3); ctx.lineTo(hx, hy + 2.5); ctx.closePath();
      ctx.fillStyle = '#ffd23a'; ctx.fill(); ctx.strokeStyle = '#5a3a10'; ctx.lineWidth = 0.8; ctx.stroke();
    }

    drawSwarm();
    if (MH.jobs && !MH.titleMode) MH.jobs.drawWorld(ctx, t);
    drawFx();

    // cloud shadows drifting over the town (outdoors only)
    const inside = MH.world.inInterior(Math.floor(MH.player.x / T), Math.floor(MH.player.y / T)) && !MH.titleMode;
    // club lights
    if (inside && MH.roomOf(MH.player) === 'club') {
      ctx.globalCompositeOperation = 'lighter';
      ['rgba(255,90,200,0.22)', 'rgba(90,220,255,0.2)', 'rgba(255,240,90,0.16)'].forEach((c, i) => {
        const lx = (177.5 + Math.sin(t * (0.9 + i * 0.4) + i * 2) * 5) * T, ly = (24 + Math.cos(t * (0.7 + i * 0.3) + i) * 3) * T;
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 70); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(lx - 70, ly - 70, 140, 140);
      });
      ctx.globalCompositeOperation = 'source-over';
    }
    if (!inside) {
      ctx.fillStyle = 'rgba(20,40,30,0.07)';
      for (let i = 0; i < 5; i++) {
        const sx = ((t * 6 + i * 520) % (MH.world.TOWN_W * T + 600)) - 300, sy = (i * 431) % (MH.world.H * T);
        if (sx < cx - 260 || sx > cx + vw + 260 || sy < cy - 200 || sy > cy + vh + 200) continue;
        ctx.beginPath(); ctx.ellipse(sx, sy, 150, 80, 0.2, 0, 7); ctx.ellipse(sx + 90, sy + 30, 100, 60, 0, 0, 7); ctx.fill();
      }
    }

    // ---------------- screen-space passes
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawWeather(dt);
    const dark = inside ? 0 : darkness();
    const dusk = inside ? 0 : duskTint();
    const W = canvas.width, H = canvas.height;
    if (dusk > 0) { ctx.fillStyle = `rgba(255,128,60,${dusk})`; ctx.fillRect(0, 0, W, H); }
    if (inside) { ctx.fillStyle = 'rgba(255,190,110,0.06)'; ctx.fillRect(0, 0, W, H); }
    if (dark > 0.02) {
      const ls = light.width / W;
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'source-over';
      lctx.clearRect(0, 0, light.width, light.height);
      lctx.fillStyle = `rgba(16,20,56,${dark})`; lctx.fillRect(0, 0, light.width, light.height);
      lctx.globalCompositeOperation = 'destination-out';
      lctx.setTransform(z * ls, 0, 0, z * ls, -cx * z * ls, -cy * z * ls);
      const lights = MH.world.lights.slice();
      lights.push({ x: MH.player.x, y: MH.player.y - 10, r: 36 });
      const sol = MH.npcById.solaris; if (sol && !sol.hidden) lights.push({ x: sol.x, y: sol.y - 16, r: 90 });
      for (const L of lights) {
        if (L.x < cx - L.r || L.x > cx + vw + L.r || L.y < cy - L.r || L.y > cy + vh + L.r) continue;
        if (L.crossing && !L.crossing.active) continue;
        const flick = L.lamp ? 1 + Math.sin(t * 7 + L.x) * 0.03 : 1;
        const g = lctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * flick);
        g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.5, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = g; lctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
      }
      ctx.drawImage(light, 0, 0, W, H);
      // warm window glows & lamp halos
      ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);
      ctx.globalCompositeOperation = 'lighter';
      for (const b of MH.world.buildings) {
        const s = b._spr; if (!s || !s.wins) continue;
        const a = MH.art.buildingAnchor(b);
        if (a.x > cx + vw || a.x + b.w * T < cx || a.y < cy || a.y - b.h * T - 60 > cy + vh) continue;
        const lit = MH.hash2(b.x, b.y, MH.state.time.day) < 0.8 || !b.generic;
        if (!lit) continue;
        ctx.fillStyle = `rgba(255,190,90,${0.55 * dark})`;
        for (const [wx, wy, ww, wh] of s.wins) ctx.fillRect(a.x + s.ox + 8 + wx, a.y + s.oy + wy, ww, wh);
      }
      for (const L of MH.world.lights) {
        if (!L.lamp || L.x < cx - 40 || L.x > cx + vw + 40 || L.y < cy - 40 || L.y > cy + vh + 40) continue;
        const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, 16);
        g.addColorStop(0, `rgba(255,210,130,${0.5 * dark})`); g.addColorStop(1, 'rgba(255,210,130,0)');
        ctx.fillStyle = g; ctx.fillRect(L.x - 16, L.y - 16, 32, 32);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // gentle vignette
    if (!R._vig || R._vig.w !== W || R._vig.h !== H) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(30,20,10,0.28)');
      R._vig = { g, w: W, h: H };
    }
    ctx.fillStyle = R._vig.g; ctx.fillRect(0, 0, W, H);
    if (R.flash) { ctx.fillStyle = `rgba(255,255,255,${R.flash})`; ctx.fillRect(0, 0, W, H); R.flash = Math.max(0, R.flash - dt); }
  };

  // Maggie's swarm: little dark specks buzzing around her.
  const swarm = Array.from({ length: 18 }, () => ({ a: Math.random() * 6.28, r: MH.rand(6, 18), s: MH.rand(2, 5), o: Math.random() * 6 }));
  function drawSwarm() {
    const m = MH.npcById.maggie;
    if (!m || m.hidden) return;
    ctx.fillStyle = '#2a2430';
    for (const b of swarm) {
      const a = b.a + MH.now * b.s;
      ctx.beginPath(); ctx.arc(m.x + Math.cos(a) * b.r + Math.sin(MH.now * 3 + b.o) * 3, m.y - 32 + Math.sin(a * 1.3) * b.r * 0.6, 0.7, 0, 7); ctx.fill();
    }
  }
})(window.MH);
