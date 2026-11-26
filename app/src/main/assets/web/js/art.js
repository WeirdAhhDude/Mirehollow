// Mirehollow — procedural painted art: ground chunks, props, buildings, chibi villagers, portraits.
// Everything is drawn with soft vector shapes at screen resolution (no pixel art), cached per scale.
'use strict';
(function (MH) {
  const T = MH.TILE;
  const art = (MH.art = { S: 4 });
  const shade = MH.shade, mix = MH.mix;

  // ------------------------------------------------------------------ LRU cache
  function LRU(max) { this.max = max; this.m = new Map(); }
  LRU.prototype.get = function (k) { const v = this.m.get(k); if (v !== undefined) { this.m.delete(k); this.m.set(k, v); } return v; };
  LRU.prototype.set = function (k, v) { this.m.set(k, v); while (this.m.size > this.max) this.m.delete(this.m.keys().next().value); };
  LRU.prototype.clear = function () { this.m.clear(); };
  const cache = new LRU(420), chrCache = new LRU(180), groundCache = new LRU(40);
  art.setScale = function (s) {
    s = MH.clamp(Math.round(s), 2, 6);
    if (s !== art.S) { art.S = s; cache.clear(); chrCache.clear(); groundCache.clear(); }
  };

  // canvas sized in world units, drawn in world units
  function mk(wu, hu, S = art.S) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(wu * S)); c.height = Math.max(1, Math.ceil(hu * S));
    const x = c.getContext('2d');
    x.scale(S, S); x.lineJoin = 'round'; x.lineCap = 'round';
    x.imageSmoothingEnabled = true;
    return [c, x];
  }
  art.mk = mk;
  const rnd = (seed) => MH.seeded(seed);

  // ------------------------------------------------------------------ drawing helpers
  const INK = '#3a2a24';
  function ell(x, cx, cy, rx, ry, fill, stroke, lw = 0.7, rot = 0) {
    x.beginPath(); x.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
    if (fill) { x.fillStyle = fill; x.fill(); }
    if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw; x.stroke(); }
  }
  function rr(x, px, py, w, h, r, fill, stroke, lw = 0.7) {
    x.beginPath(); x.roundRect ? x.roundRect(px, py, w, h, r) : x.rect(px, py, w, h);
    if (fill) { x.fillStyle = fill; x.fill(); }
    if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw; x.stroke(); }
  }
  function poly(x, pts, fill, stroke, lw = 0.7) {
    x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath();
    if (fill) { x.fillStyle = fill; x.fill(); }
    if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw; x.stroke(); }
  }
  function line(x, pts, col, lw = 0.6, alpha = 1) {
    x.globalAlpha = alpha; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    x.strokeStyle = col; x.lineWidth = lw; x.stroke(); x.globalAlpha = 1;
  }
  function vgrad(x, y0, y1, c0, c1) { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
  function rgrad(x, cx, cy, r, c0, c1) { const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.05); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
  const ink = (c) => shade(c, 0.42);
  function softShadow(x, cx, cy, rx, ry, a = 0.22) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, `rgba(20,30,20,${a})`); g.addColorStop(1, 'rgba(20,30,20,0)');
    x.save(); x.translate(cx, cy); x.scale(1, ry / rx); x.translate(-cx, -cy);
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rx, 0, Math.PI * 2); x.fill(); x.restore();
  }
  // value noise in [0,1]
  function vnoise(x, y, sc, seed) {
    const fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const s = (t) => t * t * (3 - 2 * t);
    const a = MH.hash2(ix, iy, seed), b = MH.hash2(ix + 1, iy, seed), c = MH.hash2(ix, iy + 1, seed), d = MH.hash2(ix + 1, iy + 1, seed);
    return MH.lerp(MH.lerp(a, b, s(tx)), MH.lerp(c, d, s(tx)), s(ty));
  }
  art.vnoise = vnoise;

  // ================================================================== GROUND
  const G = () => MH.G;
  const PAL = {
    grass: ['#86c35c', '#78b84f', '#9ad06a', '#5e9e40'],
    woods: ['#4e8a48', '#43793f', '#5a9a52', '#2f5e33'],
    path: ['#d6bf92', '#cbb084', '#e2cfa6', '#a88f64'],
    plaza: ['#cfc6b4', '#c1b7a3', '#ddd5c4', '#9c9282'],
    stone: ['#b9b3a6', '#a9a294', '#cdc7ba', '#857e70'],
    sand: ['#ead9a8', '#e0cd98', '#f4e6be', '#c9b27c'],
    water: ['#58aed6', '#4a9ccc', '#7cc6e6', '#d8f2fb'],
    deep: ['#4796c6', '#3d88bc', '#58a2d0', '#cfeaf6'],
    swamp: ['#5d7a52', '#526e48', '#6d8a5e', '#8aa870'],
    mud: ['#7f6a48', '#73603f', '#8c7852', '#5e4d33'],
    field: ['#9c784c', '#8e6c43', '#ad8858', '#70532f'],
    board: ['#b5875a', '#a07750', '#c9996a', '#6f4e30'],
    road: ['#8e9096', '#84868c', '#9a9ca2', '#6c6e74'],
    rail: ['#8d857a', '#7f776c', '#a0988c', '#5e574e'],
    paddy: ['#7fb6b0', '#73aaa4', '#96c8c0', '#5e8f86'],
    floor: ['#c8955e', '#b9864f', '#d6a56e', '#8e6038'],
    tatami: ['#c9c48a', '#bdb87c', '#d6d29a', '#8e8a58'],
    void: ['#1c1714', '#1c1714', '#1c1714', '#1c1714'],
    wall: ['#efe2c8', '#e4d6ba', '#f6ecd8', '#9a8466'],
    tilef: ['#efe8d8', '#e6ddca', '#f8f2e6', '#c8bca4'],
    rubber: ['#5a5e62', '#53575b', '#646a6e', '#3a3e42'],
    carpet: ['#3a2450', '#341f48', '#46305e', '#24143a'],
    cliff: ['#9c8468', '#8e775c', '#ad9677', '#4e3e30'],
    stairs: ['#c2b8a6', '#b4aa98', '#d2c8b6', '#7a7062'],
    high: ['#a6c86a', '#98bd5c', '#b4d47a', '#6e9a48'],
    rock: ['#a89c88', '#9a8e7a', '#b8ae9c', '#6e6454'],
    spring: ['#7ccac8', '#6abcbc', '#9adcd8', '#effcfa'],
    falls: ['#7cc6ea', '#6ab6de', '#a6dcf4', '#ffffff'],
  };
  const gName = ['grass', 'woods', 'path', 'plaza', 'sand', 'water', 'swamp', 'mud', 'field', 'board', 'deep', 'road', 'rail', 'paddy', 'floor', 'tatami', 'void', 'stone', 'road', 'wall', 'tilef', 'rubber', 'carpet', 'cliff', 'stairs', 'high', 'rock', 'spring', 'falls'];
  const isWet = (g) => g === 5 || g === 10 || g === 27;
  const isGreen = (g) => g === 0 || g === 1 || g === 25;
  const isPaved = (g) => g === 11 || g === 18;

  const CH = 8; // tiles per chunk
  art.CHUNK = CH;
  art.groundChunk = function (cx, cy) {
    const S = Math.min(art.S, 4);
    const key = cx + ',' + cy + '@' + S;
    let c = groundCache.get(key);
    if (c) return c;
    c = paintChunk(cx, cy, S);
    groundCache.set(key, c);
    return c;
  };
  art.groundScale = () => Math.min(art.S, 4);

  function paintChunk(cx, cy, S) {
    const g = MH.world.g;
    const size = CH * T;
    const [c, x] = mk(size, size, S);
    x.translate(-cx * size, -cy * size);
    const tx0 = cx * CH - 1, ty0 = cy * CH - 1, tx1 = cx * CH + CH, ty1 = cy * CH + CH;
    // pass 1: base color with low-frequency variation
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const t = g(tx, ty), P = PAL[gName[t]] || PAL.grass;
      const n = vnoise(tx, ty, 5, t + 3);
      x.fillStyle = mix(P[1], P[2], n * 0.8);
      x.fillRect(tx * T - 0.3, ty * T - 0.3, T + 0.6, T + 0.6);
    }
    // pass 1b: soft organic blending for watery / muddy ground (no square tile edges)
    const Gg = G();
    for (let ty = ty0 - 1; ty <= ty1 + 1; ty++) for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
      const t = g(tx, ty);
      if (t !== Gg.DEEP && t !== Gg.SWAMP && t !== Gg.MUD) continue;
      const P = PAL[gName[t]];
      const cx2 = tx * T + 8 + (MH.hash2(tx, ty, 61) - 0.5) * 5, cy2 = ty * T + 8 + (MH.hash2(tx, ty, 62) - 0.5) * 5;
      const r = t === Gg.DEEP ? 15 : 12;
      const grad = x.createRadialGradient(cx2, cy2, 3, cx2, cy2, r);
      const col = t === Gg.DEEP ? PAL.deep[1] : mix(P[1], P[2], vnoise(tx, ty, 5, t + 3) * 0.8);
      grad.addColorStop(0, col); grad.addColorStop(0.55, col); grad.addColorStop(1, MH.hexToRgb ? `rgba(${MH.hexToRgb(col).join(',')},0)` : 'rgba(0,0,0,0)');
      x.fillStyle = grad; x.fillRect(cx2 - r, cy2 - r, r * 2, r * 2);
    }
    // pass 2: textures
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) tileTexture(x, g(tx, ty), tx, ty);
    // pass 3: edges & blending
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) tileEdges(x, g, tx, ty);
    return c;
  }

  function tileTexture(x, t, tx, ty) {
    const ox = tx * T, oy = ty * T;
    const h = (i, s = 0) => MH.hash2(tx * 7 + i, ty * 13 + s, t);
    const P = PAL[gName[t]] || PAL.grass;
    const g = G();
    if (t === g.CLIFF) return cliffTile(x, tx, ty, P, h);
    if (t === g.STAIRS) return stairsTile(x, tx, ty, P);
    if (t === g.FALLS) {
      for (let i = 0; i < 6; i++) { const sx = ox + 1 + h(i) * 14; line(x, [[sx, oy], [sx + (h(i, 1) - 0.5), oy + T]], i % 2 ? '#ffffff' : P[2], 0.9 + h(i, 2), 0.75); }
      if (MH.world.g(tx, ty + 1) !== g.FALLS) { for (let i = 0; i < 6; i++) ell(x, ox + h(i, 4) * 16, oy + T - 2 + h(i, 5) * 3, 2 + h(i, 6) * 2, 1.4, '#ffffff', null, 0); }
      return;
    }
    if (t === g.SPRING) {
      for (let i = 0; i < 3; i++) { x.globalAlpha = 0.45; ell(x, ox + h(i) * 14 + 1, oy + h(i, 1) * 14 + 1, 2 + h(i, 2) * 2, 1.2, P[3]); }
      x.globalAlpha = 1; return;
    }
    if (t === g.ROCK) {
      for (let i = 0; i < 3; i++) { x.globalAlpha = 0.25; ell(x, ox + h(i) * 16, oy + h(i, 1) * 16, 3 + h(i, 2) * 4, 2 + h(i, 3) * 2, h(i, 4) < 0.5 ? P[2] : P[3]); }
      x.globalAlpha = 1;
      for (let i = 0; i < 6; i++) ell(x, ox + h(i, 5) * 16, oy + h(i, 6) * 16, 0.6 + h(i, 7) * 1.1, 0.5 + h(i, 8) * 0.6, h(i, 9) < 0.5 ? P[3] : shade(P[2], 1.06), P[3], 0.25);
      if (h(30) < 0.2) { const sx = ox + h(31) * 10, sy = oy + h(32) * 10; line(x, [[sx, sy], [sx + 3, sy + 2], [sx + 5, sy + 1.5], [sx + 7, sy + 4]], P[3], 0.4, 0.7); }
      if (h(33) < 0.25) for (let i = 0; i < 3; i++) line(x, [[ox + 3 + i * 3, oy + 12], [ox + 3.5 + i * 3, oy + 9]], '#8aa860', 0.5, 0.9);
      return;
    }
    if (t === g.GRASS || t === g.WOODS || t === g.HIGH) {
      for (let i = 0; i < 3; i++) { x.globalAlpha = 0.22; ell(x, ox + h(i) * 16, oy + h(i, 1) * 16, 4 + h(i, 2) * 5, 3 + h(i, 3) * 3, h(i, 4) < 0.5 ? P[2] : P[3]); }
      x.globalAlpha = 1;
      for (let i = 0; i < 7; i++) {
        const bx = ox + h(i, 5) * 16, by = oy + h(i, 6) * 16, hh = 1.8 + h(i, 7) * 2.2, lean = (h(i, 8) - 0.5) * 1.6;
        line(x, [[bx, by], [bx + lean * 0.5, by - hh * 0.6], [bx + lean, by - hh]], h(i, 9) < 0.55 ? P[3] : P[2], 0.45, 0.8);
      }
      if ((t === g.GRASS || t === g.HIGH) && h(20) < (t === g.HIGH ? 0.2 : 0.12)) { ell(x, ox + h(21) * 14 + 1, oy + h(22) * 14 + 1, 0.8, 0.8, h(23) < 0.5 ? '#fff8e8' : '#f6d64a'); }
      if (t === g.WOODS && h(24) < 0.3) { for (let i = 0; i < 3; i++) ell(x, ox + h(25 + i) * 16, oy + h(28 + i) * 16, 1.1, 0.6, ['#8a6a3a', '#a07a40', '#6a8a3a'][i], null, 0, h(31 + i) * 3); }
    } else if (t === g.ROAD || t === g.CROSS) {
      for (let i = 0; i < 4; i++) { x.globalAlpha = 0.14; ell(x, ox + h(i) * 16, oy + h(i, 1) * 16, 3 + h(i, 2) * 4, 2 + h(i, 3) * 3, h(i, 4) < 0.5 ? '#6a6c72' : '#a8aab0'); }
      x.globalAlpha = 1;
      for (let i = 0; i < 5; i++) { ell(x, ox + h(i, 10) * 16, oy + h(i, 11) * 16, 0.35, 0.35, h(i, 12) < 0.5 ? '#6e7076' : '#b0b2b6'); }
      if (h(40) < 0.07) { const sx = ox + h(41) * 12, sy = oy + h(42) * 12; line(x, [[sx, sy], [sx + 2 + h(43) * 2, sy + 1 + h(44) * 2], [sx + 3 + h(45) * 3, sy + 3], [sx + 5, sy + 2 + h(46) * 2]], '#55575c', 0.35, 0.7); }
      if (h(50) < 0.025) { x.globalAlpha = 0.55; ell(x, ox + 8, oy + 8, 5 + h(51) * 3, 2.5 + h(52) * 1.5, '#7c8a9c'); x.globalAlpha = 0.5; ell(x, ox + 6, oy + 7.2, 2.5, 0.6, '#c8d8e8'); x.globalAlpha = 1; }
      if (t === g.CROSS) {
        const ry = ty === 36 ? oy + 10 : oy + 6;
        rr(x, ox, ry - 1.4, T, 2.8, 0, '#77797e'); line(x, [[ox, ry - 0.6], [ox + T, ry - 0.6]], '#d6d8dc', 0.7); line(x, [[ox, ry + 0.6], [ox + T, ry + 0.6]], '#55575c', 0.5);
      }
    } else if (t === g.RAIL) {
      for (let i = 0; i < 10; i++) ell(x, ox + h(i) * 16, oy + h(i, 1) * 16, 0.5 + h(i, 2) * 0.5, 0.4, h(i, 3) < 0.5 ? P[3] : P[2]);
      const top = ty === 36;
      for (let k = 0; k < 3; k++) { const sx = ox + 1 + k * 5.4; rr(x, sx, top ? oy + 5 : oy, 3, top ? 11 : 11, 0.6, '#6e5640', '#4a3a2a', 0.35); }
      const ry = top ? oy + 10 : oy + 6;
      rr(x, ox, ry - 1, T, 2, 0, '#8a8e94'); line(x, [[ox, ry - 0.5], [ox + T, ry - 0.5]], '#e6e8ec', 0.6); line(x, [[ox, ry + 1], [ox + T, ry + 1]], '#4a4c50', 0.5);
    } else if (t === g.PATH || t === g.SAND || t === g.MUD) {
      for (let i = 0; i < 4; i++) { x.globalAlpha = 0.2; ell(x, ox + h(i) * 16, oy + h(i, 1) * 16, 3 + h(i, 2) * 3, 2 + h(i, 3) * 2, h(i, 4) < 0.5 ? P[2] : P[3]); }
      x.globalAlpha = 1;
      for (let i = 0; i < 4; i++) ell(x, ox + h(i, 5) * 16, oy + h(i, 6) * 16, 0.5 + h(i, 7) * 0.7, 0.4 + h(i, 8) * 0.4, h(i, 9) < 0.5 ? P[3] : shade(P[2], 1.08), h(i, 9) < 0.5 ? null : P[3], 0.2);
    } else if (t === g.PLAZA || t === g.STONE) {
      const sz = t === g.PLAZA ? 8 : 5.33;
      const n = t === g.PLAZA ? 2 : 3;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const off = (j + ty * n) % 2 ? sz / 2 : 0;
        const px = ox + i * sz + off - (off ? sz : 0) * (i === n - 1 ? 0 : 0), py = oy + j * sz;
        const v = MH.hash2(tx * 3 + i, ty * 3 + j, 77);
        rr(x, px + 0.4, py + 0.4, sz - 0.8, sz - 0.8, t === g.PLAZA ? 1.2 : 1.8, mix(P[1], P[2], v), shade(P[3], 1.05), 0.35);
        x.globalAlpha = 0.25; rr(x, px + 0.9, py + 0.8, sz - 2.2, 1, 0.5, '#ffffff'); x.globalAlpha = 1;
      }
    } else if (t === g.WATER || t === g.DEEP) {
      for (let i = 0; i < 2; i++) { const wx = ox + h(i) * 12 + 2, wy = oy + h(i, 1) * 12 + 2; x.globalAlpha = 0.5; x.beginPath(); x.arc(wx, wy + 2, 2.4, Math.PI * 1.15, Math.PI * 1.85); x.strokeStyle = P[2]; x.lineWidth = 0.55; x.stroke(); x.globalAlpha = 1; }
    } else if (t === g.SWAMP) {
      for (let i = 0; i < 5; i++) ell(x, ox + h(i) * 16, oy + h(i, 1) * 16, 0.6 + h(i, 2), 0.5, h(i, 3) < 0.6 ? '#7a9a5a' : '#46603e');
    } else if (t === g.FIELD) {
      for (let r = 2; r < T; r += 4) { line(x, [[ox, oy + r], [ox + T, oy + r]], P[3], 0.9, 0.6); line(x, [[ox, oy + r - 1], [ox + T, oy + r - 1]], P[2], 0.6, 0.5); }
    } else if (t === g.PADDY) {
      x.globalAlpha = 0.25; ell(x, ox + 6, oy + 5, 6, 3, '#d8f0f0'); x.globalAlpha = 1;
      for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) {
        const sx = ox + 2.5 + k * 5.2, sy = oy + 3.5 + r * 5;
        line(x, [[sx, sy + 1.5], [sx - 0.8, sy - 1.2]], '#5aa040', 0.45); line(x, [[sx, sy + 1.5], [sx + 0.9, sy - 1.4]], '#78c050', 0.45); line(x, [[sx, sy + 1.5], [sx, sy - 1.8]], '#68b048', 0.45);
      }
    } else if (t === g.BOARD) {
      for (let r = 0; r < T; r += 4) { rr(x, ox, oy + r + 0.3, T, 3.4, 0.4, h(r) < 0.5 ? P[0] : P[2], P[3], 0.3); ell(x, ox + 2, oy + r + 2, 0.3, 0.3, P[3]); ell(x, ox + 14, oy + r + 2, 0.3, 0.3, P[3]); }
    } else if (t === g.FLOOR) {
      for (let r = 0; r < T; r += 4) { rr(x, ox, oy + r, T, 4, 0, h(r) < 0.5 ? P[0] : P[2]); line(x, [[ox, oy + r], [ox + T, oy + r]], P[3], 0.35, 0.7); const k = ox + h(r, 3) * 16; line(x, [[k, oy + r], [k, oy + r + 4]], P[3], 0.3, 0.6); }
    } else if (t === g.TATAMI) {
      rr(x, ox + 0.3, oy + 0.3, T - 0.6, T - 0.6, 0.5, P[0], P[3], 0.4);
      for (let k = 1; k < 8; k++) line(x, [[ox + 0.5, oy + k * 2], [ox + T - 0.5, oy + k * 2]], P[1], 0.25, 0.6);
      rr(x, ox + 0.3, oy + 0.3, T - 0.6, 1.2, 0, '#5a7a4a');
    } else if (t === g.TILEF) {
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) rr(x, ox + i * 8 + 0.3, oy + j * 8 + 0.3, 7.4, 7.4, 0.8, (i + j + tx + ty) % 2 ? P[0] : P[2], P[3], 0.3);
    } else if (t === g.RUBBER) {
      for (let i = 0; i < 8; i++) ell(x, ox + MH.hash2(tx * 3 + i, ty, 4) * 16, oy + MH.hash2(tx, ty * 3 + i, 5) * 16, 0.35, 0.35, i % 2 ? '#7a7e82' : '#44484c');
      line(x, [[ox, oy + 0.3], [ox + T, oy + 0.3]], P[3], 0.4, 0.6);
    } else if (t === g.CARPET) {
      if ((tx + ty) % 2 === 0) { x.globalAlpha = 0.35; poly(x, [[ox + 8, oy + 2], [ox + 14, oy + 8], [ox + 8, oy + 14], [ox + 2, oy + 8]], '#6a3a8a'); x.globalAlpha = 1; }
      ell(x, ox + 8, oy + 8, 0.7, 0.7, '#a86ad0');
    } else if (t === g.WALL) {
      const R = MH.world.roomAt(tx, ty);
      const top = R && ty === R.y0;
      if (R && ty <= R.y0 + 1 && tx > R.x0 && tx < R.x1) {
        const wc = R.wall || '#efe2c8';
        x.fillStyle = vgrad(x, oy, oy + T, top ? shade(wc, 1.03) : shade(wc, 0.97), top ? shade(wc, 0.97) : shade(wc, 0.88));
        x.fillRect(ox, oy, T, T);
        if (!top) { const trim = R.id === 'club' ? '#1e1028' : R.id === 'gym' ? '#5a7a5a' : '#9a6a3e'; rr(x, ox, oy + 8, T, 8, 0, trim); line(x, [[ox, oy + 8], [ox + T, oy + 8]], shade(trim, 0.7), 0.8); if (R.id === 'club') line(x, [[ox, oy + 9], [ox + T, oy + 9]], '#ff6ac8', 0.6); }
        if (top && (tx - R.x0) % 5 === 3 && R.id !== 'club') { rr(x, ox + 1, oy + 3, 14, 11, 1, '#9fd4ee', '#6a4a2e', 1); line(x, [[ox + 8, oy + 3], [ox + 8, oy + 14]], '#6a4a2e', 0.8); x.globalAlpha = 0.5; line(x, [[ox + 3, oy + 12], [ox + 7, oy + 5]], '#ffffff', 1); x.globalAlpha = 1; }
        if (top && R.id === 'club' && (tx - R.x0) % 3 === 1) { ell(x, ox + 8, oy + 8, 2.5, 2.5, ['#ff6ac8', '#6af0ff', '#fff06a'][tx % 3]); }
      } else { x.fillStyle = '#5a3e28'; x.fillRect(ox, oy, T, T); }
    } else if (t === g.VOID) {
      x.fillStyle = '#16120f'; x.fillRect(ox, oy, T, T);
    }
  }

  // Rock faces: strata, cracks and moss; a grassy lip where the plateau top starts and a dark foot.
  function cliffTile(x, tx, ty, P, h) {
    const ox = tx * T, oy = ty * T, Gg = G(), g = MH.world.g;
    const n = g(tx, ty - 1), s = g(tx, ty + 1), w = g(tx - 1, ty), e = g(tx + 1, ty);
    const topSide = n !== Gg.CLIFF && n !== Gg.FALLS, foot = s !== Gg.CLIFF && s !== Gg.STAIRS && s !== Gg.FALLS;
    const face = foot || g(tx, ty + 2) !== Gg.CLIFF && s === Gg.CLIFF; // part of a south-facing face
    x.fillStyle = vgrad(x, oy, oy + T, topSide ? P[2] : P[1], foot ? shade(P[1], 0.78) : P[0]);
    x.fillRect(ox - 0.2, oy - 0.2, T + 0.4, T + 0.4);
    // strata
    for (let k = 0; k < 3; k++) {
      const yy = oy + 3 + k * 5 + (h(k) - 0.5) * 1.5;
      x.beginPath(); x.moveTo(ox, yy);
      for (let i = 1; i <= 4; i++) x.lineTo(ox + i * 4, yy + (MH.hash2(tx * 4 + i, ty * 3 + k, 7) - 0.5) * 1.6);
      x.strokeStyle = P[3]; x.globalAlpha = 0.35; x.lineWidth = 0.6; x.stroke();
      x.globalAlpha = 0.25; x.beginPath(); x.moveTo(ox, yy + 0.9); x.lineTo(ox + T, yy + 0.9 + (h(k, 2) - 0.5)); x.strokeStyle = '#fff4e0'; x.lineWidth = 0.4; x.stroke(); x.globalAlpha = 1;
    }
    // vertical cracks and blocks
    for (let i = 0; i < 2; i++) if (h(10 + i) < 0.6) { const cx = ox + 2 + h(12 + i) * 12; line(x, [[cx, oy + h(14 + i) * 6], [cx + (h(16 + i) - 0.5) * 2, oy + 6 + h(18 + i) * 9]], P[3], 0.55, 0.55); }
    // moss
    for (let i = 0; i < 3; i++) if (h(20 + i) < 0.35) ell(x, ox + h(22 + i) * 16, oy + h(25 + i) * 16, 1.4 + h(28 + i), 0.8, '#6f9a4a', null, 0);
    // side shading where the face turns a corner
    if (w !== Gg.CLIFF && w !== Gg.STAIRS) { x.fillStyle = 'rgba(255,240,210,0.18)'; x.fillRect(ox, oy, 2, T); }
    if (e !== Gg.CLIFF && e !== Gg.STAIRS) { x.fillStyle = 'rgba(30,20,10,0.22)'; x.fillRect(ox + T - 2.2, oy, 2.2, T); }
    // grassy lip on top
    if (topSide) {
      const top = n === Gg.ROCK ? PAL.rock : n === Gg.HIGH ? PAL.high : n === Gg.WOODS ? PAL.woods : PAL.grass;
      rr(x, ox - 0.3, oy - 0.2, T + 0.6, 2.6, 0, top[1]);
      for (let i = 0; i < 6; i++) ell(x, ox + (i + h(40 + i)) * 2.7, oy + 2.2, 1.6, 1 + h(46 + i) * 1.6, top[h(52 + i) < 0.5 ? 0 : 3]);
      line(x, [[ox, oy + 0.5], [ox + T, oy + 0.5]], shade(top[2], 1.1), 0.6, 0.8);
    }
    // the foot of the cliff: darker, with fallen pebbles
    if (foot) {
      x.fillStyle = vgrad(x, oy + T - 5, oy + T, 'rgba(30,20,10,0)', 'rgba(30,20,10,0.35)'); x.fillRect(ox, oy + T - 5, T, 5);
      for (let i = 0; i < 3; i++) ell(x, ox + h(60 + i) * 16, oy + T - 1 - h(63 + i) * 2, 1 + h(66 + i), 0.8, P[2], P[3], 0.3);
    }
    if (!face && !topSide && !foot) { x.globalAlpha = 0.15; x.fillStyle = '#2a1e14'; x.fillRect(ox, oy, T, T); x.globalAlpha = 1; }
  }
  // stone steps carved into the cliff
  function stairsTile(x, tx, ty, P) {
    const ox = tx * T, oy = ty * T, Gg = G(), g = MH.world.g;
    x.fillStyle = P[3]; x.fillRect(ox, oy, T, T);
    for (let k = 0; k < 4; k++) {
      const yy = oy + k * 4;
      rr(x, ox + 0.5, yy + 0.4, T - 1, 3.4, 0.6, k % 2 ? P[1] : P[0], P[3], 0.35);
      line(x, [[ox + 1, yy + 0.8], [ox + T - 1, yy + 0.8]], P[2], 0.6, 0.9);
    }
    if (g(tx - 1, ty) === Gg.CLIFF) { x.fillStyle = 'rgba(40,28,18,0.35)'; x.fillRect(ox, oy, 1.6, T); }
    if (g(tx + 1, ty) === Gg.CLIFF) { x.fillStyle = 'rgba(40,28,18,0.35)'; x.fillRect(ox + T - 1.6, oy, 1.6, T); }
  }

  function tileEdges(x, g, tx, ty) {
    const t = g(tx, ty), ox = tx * T, oy = ty * T, Gg = G();
    const n = g(tx, ty - 1), s = g(tx, ty + 1), w = g(tx - 1, ty), e = g(tx + 1, ty);
    const h = (i, k = 0) => MH.hash2(tx * 5 + i, ty * 11 + k, 99);
    // grass creeping over hard ground edges
    const hard = (v) => v === Gg.ROAD || v === Gg.PATH || v === Gg.PLAZA || v === Gg.SAND || v === Gg.STONE || v === Gg.FIELD || v === Gg.CROSS || v === Gg.RAIL || v === Gg.PADDY || v === Gg.ROCK;
    // long shadow at the foot of a cliff
    if (t !== Gg.CLIFF && t !== Gg.STAIRS && n === Gg.CLIFF) { x.fillStyle = vgrad(x, oy, oy + 7, 'rgba(30,24,18,0.38)', 'rgba(30,24,18,0)'); x.fillRect(ox, oy, T, 7); }
    if (t === Gg.CLIFF || t === Gg.STAIRS) return;
    if (hard(t)) {
      const sides = [[n, 'n'], [s, 's'], [w, 'w'], [e, 'e']];
      for (const [v, d] of sides) {
        if (!isGreen(v)) continue;
        const P = v === Gg.WOODS ? PAL.woods : v === Gg.HIGH ? PAL.high : PAL.grass;
        // soft shadow band on the hard side
        x.globalAlpha = 0.18; x.fillStyle = '#2a3a1a';
        if (d === 'n') x.fillRect(ox, oy, T, 1.6); if (d === 's') x.fillRect(ox, oy + T - 1, T, 1); if (d === 'w') x.fillRect(ox, oy, 1.4, T); if (d === 'e') x.fillRect(ox + T - 1.4, oy, 1.4, T);
        x.globalAlpha = 1;
        for (let i = 0; i < 9; i++) {
          const f = (i + h(i)) / 9, len = 1.5 + h(i, 1) * 3.2, lean = (h(i, 2) - 0.5) * 2;
          let bx, by, ex, ey;
          if (d === 'n') { bx = ox + f * T; by = oy - 0.5; ex = bx + lean; ey = by + len; }
          else if (d === 's') { bx = ox + f * T; by = oy + T + 0.5; ex = bx + lean; ey = by - len; }
          else if (d === 'w') { bx = ox - 0.5; by = oy + f * T; ex = bx + len; ey = by + lean; }
          else { bx = ox + T + 0.5; by = oy + f * T; ex = bx - len; ey = by + lean; }
          line(x, [[bx, by], [ex, ey]], h(i, 3) < 0.5 ? P[3] : P[0], 0.7, 0.95);
        }
      }
      // faded white edge line on asphalt
      if (t === Gg.ROAD) {
        x.globalAlpha = 0.55;
        if (!isPaved(n) && n !== Gg.PLAZA && n !== Gg.RAIL) line(x, [[ox, oy + 1.8], [ox + T, oy + 1.8]], '#f0f0ea', 0.7);
        if (!isPaved(s) && s !== Gg.PLAZA && s !== Gg.RAIL) line(x, [[ox, oy + T - 1.8], [ox + T, oy + T - 1.8]], '#f0f0ea', 0.7);
        if (!isPaved(w) && w !== Gg.PLAZA && w !== Gg.RAIL) line(x, [[ox + 1.8, oy], [ox + 1.8, oy + T]], '#f0f0ea', 0.7);
        if (!isPaved(e) && e !== Gg.PLAZA && e !== Gg.RAIL) line(x, [[ox + T - 1.8, oy], [ox + T - 1.8, oy + T]], '#f0f0ea', 0.7);
        x.globalAlpha = 1;
      }
    }
    if (isWet(t)) {
      const P = PAL[gName[t]];
      const landN = !isWet(n) && n !== Gg.SWAMP && n !== Gg.BOARD && n !== Gg.FALLS, landS = !isWet(s) && s !== Gg.SWAMP && s !== Gg.BOARD, landW = !isWet(w) && w !== Gg.SWAMP && w !== Gg.BOARD, landE = !isWet(e) && e !== Gg.SWAMP && e !== Gg.BOARD;
      if (landN) { x.fillStyle = vgrad(x, oy, oy + 5, 'rgba(30,50,60,0.45)', 'rgba(30,50,60,0)'); x.fillRect(ox, oy, T, 5); line(x, [[ox, oy + 0.6], [ox + T, oy + 0.6]], t === Gg.SWAMP ? '#3a4a2a' : '#6a5a3a', 1.2, 0.8); }
      const foam = t === Gg.SWAMP ? '#9ab07a' : P[3];
      x.globalAlpha = 0.75;
      if (landS) { x.beginPath(); for (let i = 0; i <= 4; i++) x.lineTo(ox + i * 4, oy + T - 1 - Math.sin(i + tx) * 0.6); x.strokeStyle = foam; x.lineWidth = 1; x.stroke(); }
      if (landW) line(x, [[ox + 0.8, oy], [ox + 1.2, oy + T]], foam, 0.9);
      if (landE) line(x, [[ox + T - 0.8, oy], [ox + T - 1.2, oy + T]], foam, 0.9);
      x.globalAlpha = 1;

    }
    if (t === Gg.GRASS && n === Gg.WOODS) {
      for (let i = 0; i < 6; i++) ell(x, ox + (i + h(i)) * 2.7, oy + 0.5, 2.2, 1.4 + h(i, 1) * 1.6, PAL.woods[h(i, 2) < 0.5 ? 0 : 3]);
    }
  }

  // ================================================================== PROP SPRITES
  // Each sprite: { img, ox, oy } with offsets in world units relative to the prop anchor (bottom centre).
  function sprite(key, wu, hu, ax, ay, draw) {
    const k = key + '@' + art.S;
    let s = cache.get(k);
    if (s) return s;
    const [c, x] = mk(wu, hu);
    draw(x);
    s = { img: c, ox: -ax, oy: -ay, w: wu, h: hu };
    cache.set(k, s);
    return s;
  }
  art.sprite = sprite;

  // lush leafy canopy made of clustered blobs, lit from the top-left
  function canopy(x, cx, cy, r, pal, seed, dense = 1) {
    const R = rnd(seed);
    const blobs = [];
    const n = Math.round(14 * dense);
    for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r * 0.7; blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.82, r * (0.34 + R() * 0.22)]); }
    // outline rim
    blobs.forEach(([bx, by, br]) => ell(x, bx, by + 0.6, br + 0.9, br * 0.92 + 0.9, ink(pal[3])));
    blobs.forEach(([bx, by, br]) => ell(x, bx, by, br, br * 0.92, pal[3]));
    blobs.forEach(([bx, by, br]) => ell(x, bx - br * 0.12, by - br * 0.16, br * 0.86, br * 0.78, pal[0]));
    blobs.forEach(([bx, by, br]) => { if (by < cy + r * 0.25) ell(x, bx - br * 0.25, by - br * 0.3, br * 0.55, br * 0.45, pal[1]); });
    blobs.forEach(([bx, by, br]) => { if (bx < cx + r * 0.1 && by < cy) ell(x, bx - br * 0.35, by - br * 0.42, br * 0.26, br * 0.2, pal[2]); });
    // leaf dabs
    for (let i = 0; i < 26 * dense; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r * 0.95;
      const lx = cx + Math.cos(a) * d, ly = cy + Math.sin(a) * d * 0.8;
      ell(x, lx, ly, 1.1, 0.55, ly < cy ? pal[2] : pal[3], null, 0, R() * 3);
    }
  }

  const TREE_PALS = [
    ['#5fa648', '#7cc05a', '#a8dc78', '#3e7a35'],
    ['#58a04e', '#72b860', '#9ed48a', '#386e3c'],
    ['#68a842', '#88c456', '#b4e07a', '#467a2e'],
  ];
  const DARK_PAL = ['#3f7a44', '#55945a', '#7ab47a', '#28522f'];

  function drawTree(p) {
    const v = p.v % 6, big = p.big ? 1.25 : 1;
    const pal = p.dark ? DARK_PAL : TREE_PALS[v % 3];
    const w = 64 * big, h = 80 * big;
    const fruit = p.fruit && p.pick && !MH.isPicked(p);
    return sprite('tree' + v + (p.dark ? 'd' : '') + (p.big ? 'b' : '') + (fruit ? 'f' : ''), w, h, w / 2, h - 4, (x) => {
      softShadow(x, w / 2 + 6, h - 6, 24 * big, 7 * big, 0.3);
      // trunk
      const tx = w / 2;
      poly(x, [[tx - 3.5, h - 4], [tx - 2.5, h - 26 * big], [tx + 2.5, h - 26 * big], [tx + 4, h - 4]], '#7a5636', ink('#7a5636'), 0.8);
      line(x, [[tx - 1, h - 6], [tx - 0.5, h - 22 * big]], '#9a7450', 0.8, 0.8);
      line(x, [[tx + 1.5, h - 20 * big], [tx + 7, h - 30 * big]], '#6a4a2e', 2, 1);
      canopy(x, tx, h - 44 * big, 24 * big, pal, 30 + v);
      if (fruit) { const R = rnd(90 + v); for (let i = 0; i < 9; i++) { const a = R() * 6.28, r = R() * 18; ell(x, tx + Math.cos(a) * r, h - 44 * big + Math.sin(a) * r * 0.7, 2, 2, '#e0402e', '#8a2018', 0.5); ell(x, tx + Math.cos(a) * r - 0.6, h - 44 * big + Math.sin(a) * r * 0.7 - 0.7, 0.6, 0.5, '#ffb0a0'); } }
    });
  }
  // the wooden lookout tower on Lookout Hill
  function drawLookout() {
    const w = 46, h = 96;
    return sprite('lookout', w, h, 15, h - 3, (x) => {
      softShadow(x, 23, h - 4, 22, 6, 0.3);
      const wood = '#8a6440', dk = ink(wood);
      [[6, h - 3], [40, h - 3]].forEach(([lx, ly]) => poly(x, [[lx - 1.5, ly], [lx + 1.5, ly], [lx + (lx < 23 ? 6 : -6) + 1.2, 34], [lx + (lx < 23 ? 6 : -6) - 1.2, 34]], wood, dk, 0.7));
      for (let k = 0; k < 4; k++) { const yy = 44 + k * 12; line(x, [[9 + k * 0.8, yy], [37 - k * 0.8, yy + 8]], dk, 0.9); line(x, [[37 - k * 0.8, yy], [9 + k * 0.8, yy + 8]], dk, 0.9); }
      // ladder
      rr(x, 20, 36, 6, h - 40, 0.5, null, '#6a4a2e', 0.8); for (let yy = 40; yy < h - 4; yy += 5) line(x, [[20, yy], [26, yy]], '#6a4a2e', 0.8);
      // platform, railing, roof
      rr(x, 4, 30, 38, 5, 1, '#a07a50', dk, 0.8);
      for (let i = 0; i < 6; i++) line(x, [[7 + i * 6.4, 30], [7 + i * 6.4, 20]], dk, 0.9);
      line(x, [[5, 21], [41, 21]], dk, 1.2);
      poly(x, [[0, 14], [23, 2], [46, 14], [40, 16], [6, 16]], '#b0503a', ink('#b0503a'), 0.8);
      line(x, [[23, 2], [23, 16]], ink('#b0503a'), 0.5, 0.6);
      ell(x, 30, 26, 2.2, 1.4, '#3a3a44'); // binoculars on the rail
    });
  }
  function drawSteam(p) {
    const v = p.v % 3;
    return sprite('steam' + v, 30, 30, 15, 28, (x) => {
      const R = rnd(140 + v);
      for (let i = 0; i < 6; i++) { x.globalAlpha = 0.16 + R() * 0.12; ell(x, 8 + R() * 14, 6 + R() * 18, 4 + R() * 4, 3 + R() * 3, '#ffffff'); }
      x.globalAlpha = 1;
    });
  }
  function drawSakura(p) {
    const v = p.v % 3, w = 60, h = 76;
    return sprite('sakura' + v, w, h, w / 2, h - 4, (x) => {
      softShadow(x, w / 2 + 6, h - 6, 22, 7, 0.28);
      poly(x, [[w / 2 - 3, h - 4], [w / 2 - 2, h - 24], [w / 2 + 2, h - 24], [w / 2 + 3.5, h - 4]], '#6a4a3a', ink('#6a4a3a'), 0.8);
      line(x, [[w / 2, h - 22], [w / 2 - 9, h - 32]], '#5a3a2e', 1.6);
      canopy(x, w / 2, h - 42, 22, ['#f4b8cc', '#fad0dc', '#fff0f4', '#d888a4'], 70 + v);
      const R = rnd(80 + v);
      for (let i = 0; i < 14; i++) ell(x, R() * w, h - 8 + R() * 6, 0.9, 0.5, '#f8c4d4', null, 0, R() * 3);
    });
  }
  function drawCedar(p) {
    const v = p.v % 4, w = 40, h = 84;
    return sprite('cedar' + v, w, h, w / 2, h - 4, (x) => {
      softShadow(x, w / 2 + 5, h - 6, 15, 5, 0.3);
      rr(x, w / 2 - 2, h - 18, 4, 14, 1, '#6a4a32', ink('#6a4a32'), 0.7);
      const pal = ['#2f6a44', '#3e7f52', '#5c9a6a', '#1f4a30'];
      for (let L = 0; L < 5; L++) {
        const top = 6 + L * 13, half = 6 + L * 3.4;
        poly(x, [[w / 2, top - 4], [w / 2 + half, top + 14], [w / 2 - half, top + 14]], pal[3], ink(pal[3]), 0.8);
        poly(x, [[w / 2 - 0.6, top - 2], [w / 2 + half * 0.55, top + 11], [w / 2 - half * 0.9, top + 12.5]], pal[0]);
        poly(x, [[w / 2 - 1, top], [w / 2 + half * 0.1, top + 6], [w / 2 - half * 0.55, top + 9]], pal[2]);
      }
    });
  }
  function drawBamboo(p) {
    const v = p.v % 3, w = 30, h = 90;
    return sprite('bamboo' + v, w, h, w / 2, h - 3, (x) => {
      softShadow(x, w / 2 + 4, h - 4, 12, 4, 0.25);
      const R = rnd(90 + v);
      for (let i = 0; i < 4; i++) {
        const bx = 6 + i * 6 + R() * 2, top = 6 + R() * 16;
        rr(x, bx, top, 2.4, h - 3 - top, 1, i % 2 ? '#7ab45a' : '#8cc468', '#3e6a2e', 0.5);
        for (let k = top + 10; k < h - 6; k += 11) line(x, [[bx - 0.2, k], [bx + 2.6, k]], '#4e7a3a', 0.6);
        for (let k = 0; k < 4; k++) { const ly = top + 4 + k * 9; ell(x, bx + (k % 2 ? 5 : -3), ly, 4.5, 1.2, k % 2 ? '#6aa84a' : '#8ccc6a', '#3e6a2e', 0.3, k % 2 ? 0.4 : -0.4); }
      }
    });
  }
  function drawBush(p) {
    const kind = p.berry ? 'b' : p.roses ? 'r' : '', v = p.v % 4, w = 30, h = 26;
    return sprite('bush' + kind + v, w, h, w / 2, h - 3, (x) => {
      softShadow(x, w / 2 + 3, h - 4, 13, 4, 0.28);
      canopy(x, w / 2, h - 12, 11, TREE_PALS[v % 3], 50 + v, 0.6);
      const R = rnd(60 + v);
      if (p.berry) for (let i = 0; i < 7; i++) ell(x, 6 + R() * 18, 6 + R() * 12, 1.1, 1.1, '#5a3aa8', '#2a1a58', 0.3);
      if (p.roses) for (let i = 0; i < 7; i++) { const rx = 6 + R() * 18, ry = 5 + R() * 12; ell(x, rx, ry, 1.6, 1.4, '#d8364a', '#7a1a2a', 0.3); ell(x, rx - 0.3, ry - 0.3, 0.6, 0.5, '#f87a8a'); }
    });
  }
  function drawHedge(p) {
    const v = p.v % 3, w = 22, h = 28;
    return sprite('hedge' + v, w, h, w / 2, h - 2, (x) => {
      softShadow(x, w / 2 + 3, h - 3, 11, 3, 0.25);
      canopy(x, w / 2, h - 13, 10, TREE_PALS[(v + 1) % 3], 120 + v, 0.65);
    });
  }
  function drawRock(p) {
    const s = p.small ? 0.6 : 1, v = p.v % 3;
    return sprite('rock' + v + (p.small ? 's' : ''), 20 * s, 14 * s, 10 * s, 11 * s, (x) => {
      x.save(); x.scale(s, s);
      softShadow(x, 11, 11, 8, 2.5, 0.25);
      poly(x, [[3, 11], [4, 5], [9, 2.5], [15, 4], [17, 10], [12, 12]], '#9a9890', ink('#9a9890'), 0.8);
      poly(x, [[5, 6], [9, 3.5], [13, 5], [9, 7]], '#c4c2ba');
      line(x, [[10, 8], [13, 10]], '#7a7870', 0.5);
      x.restore();
    });
  }
  function drawPole(p) {
    const w = 26, h = 104;
    return sprite('pole' + (p.lamp ? 'l' : ''), w, h, 13, h - 3, (x) => {
      softShadow(x, 15, h - 4, 7, 2.5, 0.3);
      rr(x, 11, 8, 4.4, h - 11, 1.5, vgrad(x, 0, 1, '#b8b4aa', '#b8b4aa'), ink('#a09c92'), 0.7);
      x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(11.8, 10, 1, h - 16);
      // yellow-black guard sleeve at the base
      for (let i = 0; i < 6; i++) rr(x, 10.6, h - 18 + i * 2.4, 5.2, 2.4, 0, i % 2 ? '#2a2a2a' : '#f2c82a');
      rr(x, 10.6, h - 18, 5.2, 14.4, 0.8, null, '#2a2a2a', 0.5);
      // crossarms & insulators
      rr(x, 2, 12, 22, 2.2, 0.6, '#8a8680', ink('#8a8680'), 0.5);
      rr(x, 5, 20, 16, 1.8, 0.6, '#8a8680', ink('#8a8680'), 0.5);
      [4, 9, 17, 22].forEach((ix) => ell(x, ix, 10.8, 1.1, 1.3, '#e8e4da', '#7a766e', 0.4));
      [7, 19].forEach((ix) => ell(x, ix, 19, 1, 1.2, '#e8e4da', '#7a766e', 0.4));
      if (p.v % 3 === 0) { rr(x, 15.4, 26, 6, 9, 1.5, '#9a9a96', ink('#9a9a96'), 0.6); line(x, [[16, 28], [21, 28]], '#c8c8c4', 0.5); }
      if (p.lamp) { line(x, [[13, 40], [20, 37], [21, 40]], '#6a6a68', 1); rr(x, 18, 39.5, 6, 2.6, 1.2, '#fff4d0', ink('#9a9a96'), 0.5); }
      // little sign plate
      rr(x, 10.4, 55, 5.6, 7, 0.6, '#3a6ab0', '#1e3a68', 0.4);
      line(x, [[11.5, 57.5], [15, 57.5]], '#ffffff', 0.4); line(x, [[11.5, 59.5], [14, 59.5]], '#ffffff', 0.4);
    });
  }
  function drawCrossingSign(p) {
    const w = 30, h = 64;
    return sprite('xsign', w, h, 15, h - 3, (x) => {
      softShadow(x, 16, h - 4, 7, 2.2, 0.3);
      for (let i = 0; i < 12; i++) rr(x, 13.6, 14 + i * ((h - 17) / 12), 2.8, (h - 17) / 12, 0, i % 2 ? '#2a2a2a' : '#f2f0ea');
      rr(x, 13.6, 14, 2.8, h - 17, 0.6, null, '#1a1a1a', 0.4);
      // X sign (black / yellow stripes)
      const X = (rot) => { x.save(); x.translate(15, 9); x.rotate(rot); rr(x, -12, -2.2, 24, 4.4, 0.8, '#f4cc2a', '#1a1a1a', 0.6); for (let k = -10; k <= 8; k += 5) poly(x, [[k, -2.2], [k + 2.5, -2.2], [k + 1, 2.2], [k - 1.5, 2.2]], '#1a1a1a'); x.restore(); };
      X(0.55); X(-0.55);
      // lamp housings
      rr(x, 3, 22, 24, 3, 1, '#2a2a2a');
      ell(x, 5.5, 27, 3.6, 3.6, '#1a1a1a'); ell(x, 24.5, 27, 3.6, 3.6, '#1a1a1a');
      ell(x, 5.5, 27, 2.4, 2.4, '#6a1a1a'); ell(x, 24.5, 27, 2.4, 2.4, '#6a1a1a');
      rr(x, 10, 33, 10, 4, 0.6, '#f2f0ea', '#1a1a1a', 0.4);
      x.fillStyle = '#1a1a1a'; x.font = 'bold 2.6px sans-serif'; x.textAlign = 'center'; x.fillText('STOP', 15, 36);
    });
  }
  art.crossingLamps = (p) => [[p.x - 15 + 5.5, p.y - 61 + 27], [p.x - 15 + 24.5, p.y - 61 + 27]];
  function drawFencePost(p) {
    const v = p.v % 3, w = 10, h = 30;
    return sprite('fpost' + v, w, h, 5, h - 2, (x) => {
      softShadow(x, 6, h - 3, 4, 1.5, 0.3);
      const hh = 11 + v * 2.5;
      poly(x, [[2.5, h - 2], [2.8, h - 2 - hh], [5, h - 3 - hh], [7.5, h - 2 - hh], [7.6, h - 2]], v === 1 ? '#8a7a64' : '#8a8278', ink('#8a8278'), 0.7);
      line(x, [[4, h - 4], [4.2, h - hh]], '#a8a096', 0.8, 0.8);
      line(x, [[6, h - 8], [6.6, h - 12]], '#5a544c', 0.4);
    });
  }
  function drawBlockWall(p) {
    const w = 18, h = 24;
    return sprite('bwall', w, h, 9, h - 2, (x) => {
      softShadow(x, 10, h - 3, 8, 2, 0.25);
      rr(x, 1, 6, 16, h - 8, 0.8, '#b8b4aa', ink('#b8b4aa'), 0.7);
      for (let r = 0; r < 3; r++) line(x, [[1, 6 + r * 5.3], [17, 6 + r * 5.3]], '#8a867e', 0.4);
      ell(x, 9, 11.5, 2, 1.6, '#6a665e'); ell(x, 9, 11.5, 1.2, 0.9, '#3a3a3a');
      rr(x, 1, 5, 16, 2, 0.6, '#cfcbc2', ink('#b8b4aa'), 0.5);
    });
  }
  function drawVending(p) {
    const w = 18, h = 30, col = p.color || '#e04a3a';
    return sprite('vend' + col, w, h, 9, h - 2, (x) => {
      softShadow(x, 10, h - 3, 9, 2.5, 0.3);
      rr(x, 1.5, 2, 15, h - 4, 1.4, col, ink(col), 0.8);
      rr(x, 3, 4, 12, 11, 0.8, '#e8f4fb', '#3a3a3a', 0.4);
      for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) rr(x, 3.8 + k * 2.8, 5 + r * 5, 2, 3.6, 0.6, ['#f05a4a', '#4a9ad8', '#f4c84a', '#5ac06a'][(k + r) % 4]);
      rr(x, 3, 17, 12, 3, 0.6, '#2a2a2a'); rr(x, 4, 22, 10, 3, 0.6, '#1a1a1a');
      x.globalAlpha = 0.35; rr(x, 2.5, 2.5, 3, h - 6, 1, '#ffffff'); x.globalAlpha = 1;
    });
  }
  function drawPostbox() {
    return sprite('postbox', 12, 24, 6, 22, (x) => {
      softShadow(x, 7, 21, 6, 2, 0.3);
      rr(x, 4.5, 14, 3, 8, 0.5, '#5a5a5a');
      rr(x, 1.5, 2, 9, 13, 3, '#d8302a', ink('#d8302a'), 0.7);
      rr(x, 3, 6, 6, 1.2, 0.5, '#3a1a1a'); x.globalAlpha = 0.35; rr(x, 2.5, 3, 2, 10, 1, '#ffffff'); x.globalAlpha = 1;
    });
  }
  function drawLamp(swamp) {
    return sprite('lamp' + (swamp ? 's' : ''), 14, 42, 7, 40, (x) => {
      softShadow(x, 8, 39, 5, 1.8, 0.3);
      rr(x, 6, 10, 2.2, 30, 1, '#3a3440', ink('#3a3440'), 0.5);
      rr(x, 3, 2, 8, 9, 2, swamp ? '#c8ff9a' : '#ffe8a0', '#2a2430', 0.8);
      rr(x, 2, 1, 10, 2, 1, '#2a2430');
    });
  }
  function drawBench() {
    return sprite('bench', 30, 18, 15, 15, (x) => {
      softShadow(x, 16, 15, 13, 2.5, 0.28);
      rr(x, 3, 10, 2, 5, 0.5, '#4a3a30'); rr(x, 25, 10, 2, 5, 0.5, '#4a3a30');
      rr(x, 1, 3, 28, 3, 1, '#b07a4a', ink('#b07a4a'), 0.6); rr(x, 1, 8, 28, 3, 1, '#c08a56', ink('#c08a56'), 0.6);
    });
  }
  function drawWell() {
    return sprite('well', 40, 46, 12, 40, (x) => {
      softShadow(x, 22, 40, 17, 5, 0.3);
      ell(x, 20, 36, 15, 6.5, '#9a9a96', ink('#9a9a96'), 0.8); ell(x, 20, 33.5, 15, 6.5, '#b8b8b2', ink('#b8b8b2'), 0.8);
      ell(x, 20, 33.5, 10.5, 4, '#26405e'); ell(x, 20, 34.5, 8, 2.4, '#3f6a96');
      rr(x, 6, 10, 2.6, 24, 1, '#7a5636', ink('#7a5636'), 0.6); rr(x, 31.4, 10, 2.6, 24, 1, '#7a5636', ink('#7a5636'), 0.6);
      poly(x, [[2, 11], [20, 2], [38, 11], [36, 13], [20, 5], [4, 13]], '#b84a3a', ink('#b84a3a'), 0.8);
      line(x, [[20, 12], [20, 25]], '#c8b890', 0.5); rr(x, 17.5, 24, 5, 4.4, 0.8, '#8a6a44', ink('#8a6a44'), 0.5);
    });
  }
  function drawBoard() {
    return sprite('board', 28, 34, 14, 32, (x) => {
      softShadow(x, 15, 32, 11, 2.5, 0.28);
      rr(x, 3.5, 16, 2, 16, 0.5, '#6a4a2e'); rr(x, 22.5, 16, 2, 16, 0.5, '#6a4a2e');
      rr(x, 1, 2, 26, 17, 1.2, '#8a5a34', ink('#8a5a34'), 0.7); rr(x, 2.4, 3.4, 23.2, 14.2, 0.6, '#d8b480');
      [[4, 5, '#f8f4e6', -0.1], [11, 4.6, '#f8de7a', 0.08], [18, 5.4, '#b8dcf4', -0.05], [6, 11, '#f8c0d4', 0.1], [15, 11, '#f8f4e6', -0.08]].forEach(([a, b, c, r]) => { x.save(); x.translate(a + 3, b + 3); x.rotate(r); rr(x, -3, -3, 6, 5.6, 0.3, c, '#9a8a70', 0.25); x.restore(); ell(x, a + 3, b + 0.6, 0.5, 0.5, '#d83a3a'); });
    });
  }
  function drawPlanter() {
    return sprite('planter', 20, 18, 10, 15, (x) => {
      softShadow(x, 11, 15, 9, 2, 0.25);
      rr(x, 2, 8, 16, 7, 1.2, '#b87a4e', ink('#b87a4e'), 0.6);
      canopy(x, 10, 7, 6.5, TREE_PALS[0], 140, 0.45);
      [[5, 5, '#f07ac0'], [10, 3.5, '#f4d03a'], [14, 6, '#ffffff'], [8, 7, '#8a7af0']].forEach(([a, b, c]) => ell(x, a, b, 1.3, 1.2, c, ink(c), 0.3));
    });
  }
  function drawStall(p) {
    const col = p.color || '#d94a4a';
    return sprite('stall' + col, 38, 40, 19, 37, (x) => {
      softShadow(x, 20, 37, 17, 3, 0.28);
      rr(x, 4, 12, 2, 25, 0.6, '#6a4a2e'); rr(x, 32, 12, 2, 25, 0.6, '#6a4a2e');
      for (let i = 0; i < 8; i++) poly(x, [[1 + i * 4.5, 4], [5.5 + i * 4.5, 4], [5.5 + i * 4.5, 12], [3.25 + i * 4.5, 13.5], [1 + i * 4.5, 12]], i % 2 ? '#f6f2e8' : col);
      rr(x, 1, 3, 36, 2, 0.5, shade(col, 0.7));
      rr(x, 2, 26, 34, 9, 1, '#b07a4a', ink('#b07a4a'), 0.6);
      [[6, '#f05a4a'], [11, '#f4d03a'], [16, '#6ac04a'], [21, '#f08a3a'], [26, '#a05ad0'], [31, '#f05a4a']].forEach(([a, c]) => { ell(x, a, 24, 2.2, 2, c, ink(c), 0.4); ell(x, a - 0.6, 23.3, 0.7, 0.5, '#ffffff'); });
    });
  }
  function drawBusStop() {
    return sprite('busstop', 26, 44, 8, 42, (x) => {
      softShadow(x, 12, 42, 11, 3, 0.25);
      rr(x, 7, 8, 2, 34, 0.6, '#8a8a88', ink('#8a8a88'), 0.4);
      ell(x, 8, 7, 6, 6, '#f2f2ee', '#2a5a9a', 1.2); x.fillStyle = '#2a5a9a'; x.font = 'bold 4px sans-serif'; x.textAlign = 'center'; x.fillText('BUS', 8, 8.5);
      rr(x, 12, 30, 12, 3, 0.6, '#c89a6a', ink('#c89a6a'), 0.5); rr(x, 13, 33, 1.5, 6, 0.4, '#6a5a4a'); rr(x, 21.5, 33, 1.5, 6, 0.4, '#6a5a4a');
    });
  }
  function drawStationSign() {
    return sprite('stsign', 34, 30, 17, 28, (x) => {
      softShadow(x, 17, 28, 12, 2, 0.25);
      rr(x, 6, 12, 2, 16, 0.4, '#6a6a68'); rr(x, 26, 12, 2, 16, 0.4, '#6a6a68');
      rr(x, 1, 2, 32, 11, 1.4, '#f6f4ee', '#2a2a2a', 0.7);
      x.fillStyle = '#2a2a2a'; x.font = 'bold 4.2px sans-serif'; x.textAlign = 'center'; x.fillText('MIREHOLLOW', 17, 7.6);
      rr(x, 2, 9, 30, 1.6, 0, '#3a8a6a'); x.font = '2.4px sans-serif'; x.fillText('← Swampside    Woodend →', 17, 12.4);
    });
  }
  function drawTorii() {
    return sprite('torii', 56, 58, 24, 55, (x) => {
      softShadow(x, 26, 55, 24, 4, 0.3);
      rr(x, 8, 10, 4, 45, 1, '#d0402e', ink('#d0402e'), 0.8); rr(x, 40, 10, 4, 45, 1, '#d0402e', ink('#d0402e'), 0.8);
      rr(x, 7, 50, 6, 5, 0.6, '#2a2a2a'); rr(x, 39, 50, 6, 5, 0.6, '#2a2a2a');
      rr(x, 4, 16, 44, 3, 0.6, '#d0402e', ink('#d0402e'), 0.7);
      poly(x, [[0, 6], [52, 6], [50, 10], [2, 10]], '#2a2226', ink('#2a2226'), 0.7);
      poly(x, [[2, 10], [50, 10], [48, 12.5], [4, 12.5]], '#d0402e', ink('#d0402e'), 0.6);
      rr(x, 23, 12, 6, 6, 0.4, '#2a2226');
    });
  }
  function drawStoneLantern() {
    return sprite('slantern', 16, 30, 8, 28, (x) => {
      softShadow(x, 9, 28, 7, 2, 0.28);
      rr(x, 4, 23, 8, 5, 0.8, '#9a9890', ink('#9a9890'), 0.6); rr(x, 6, 14, 4, 10, 0.6, '#a8a69e', ink('#a8a69e'), 0.5);
      rr(x, 3.5, 9, 9, 6, 0.8, '#a8a69e', ink('#a8a69e'), 0.6); rr(x, 6, 10.5, 4, 3, 0.4, '#3a3028');
      poly(x, [[1, 9], [8, 3], [15, 9]], '#8a8880', ink('#8a8880'), 0.6); ell(x, 8, 2.6, 1.4, 1.4, '#8a8880', ink('#8a8880'), 0.4);
      x.globalAlpha = 0.5; ell(x, 6, 21, 2, 1, '#6aa04a'); x.globalAlpha = 1;
    });
  }
  function drawTower() {
    return sprite('tower', 40, 64, 14, 61, (x) => {
      softShadow(x, 22, 61, 18, 4, 0.3);
      [[6, 30], [30, 30]].forEach(([a]) => rr(x, a, 30, 3, 31, 0.8, '#f2ece0', ink('#f2ece0'), 0.6));
      line(x, [[8, 36], [31, 52]], '#d8d0c0', 1); line(x, [[31, 36], [8, 52]], '#d8d0c0', 1);
      rr(x, 2, 25, 36, 6, 1, '#d93a3a', ink('#d93a3a'), 0.7);
      rr(x, 6, 8, 28, 18, 1.5, '#f6f2ea', ink('#f6f2ea'), 0.7);
      for (let i = 0; i < 7; i++) poly(x, [[4 + i * 4.6, 1], [8.6 + i * 4.6, 1], [8.6 + i * 4.6, 8], [4 + i * 4.6, 8]], i % 2 ? '#f6f2ea' : '#d93a3a');
      rr(x, 4, 0.5, 32, 8, 1, null, ink('#d93a3a'), 0.6);
      rr(x, 14, 12, 12, 8, 1, '#7cc6e6', '#4a6a8a', 0.5);
      [[8, 24], [14, 24], [24, 24], [31, 24]].forEach(([a, b]) => ell(x, a, b, 1.2, 0.8, '#f8d0e0', '#b07a8a', 0.3));
      rr(x, 36, 0, 1, 14, 0.3, '#5a5a5a'); poly(x, [[37, 1], [40, 2.5], [37, 4]], '#e8282a');
    });
  }
  function drawReeds(p) {
    const v = p.v % 3;
    return sprite('reeds' + v + (p.swamp ? 's' : ''), 18, 26, 9, 24, (x) => {
      const col = p.swamp ? '#6a7a3a' : '#5a9a40';
      const R = rnd(200 + v);
      for (let i = 0; i < 6; i++) { const bx = 3 + R() * 12, top = 4 + R() * 8; line(x, [[bx, 24], [bx + (R() - 0.5) * 2, top]], col, 0.8); if (R() < 0.6) rr(x, bx - 0.8, top - 1, 1.8, 5, 0.8, '#8a5a34'); }
    });
  }
  function drawSunflower(p) {
    const v = p.v % 3;
    return sprite('sunf' + v, 16, 40, 8, 38, (x) => {
      softShadow(x, 9, 38, 4, 1.4, 0.25);
      line(x, [[8, 38], [8.5, 12]], '#4a8a32', 1.2);
      ell(x, 5, 26, 3.5, 1.6, '#5aa040', '#2e5a22', 0.3, -0.5); ell(x, 11.5, 22, 3.5, 1.6, '#5aa040', '#2e5a22', 0.3, 0.5);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ell(x, 8.5 + Math.cos(a) * 4, 9 + Math.sin(a) * 4, 2.4, 1, '#f6c42a', '#b07a10', 0.25, a); }
      ell(x, 8.5, 9, 3, 3, '#6a3a1a', '#3a1a0a', 0.4); ell(x, 7.6, 8.2, 1, 0.8, '#8a5a2a');
    });
  }
  function drawCorn(p) {
    const v = p.v % 3;
    return sprite('corn' + v, 16, 38, 8, 36, (x) => {
      line(x, [[8, 36], [8, 6]], '#6a9a3a', 1.3);
      [[3, 14, -0.6], [13, 12, 0.6], [3, 24, -0.5], [13, 22, 0.5]].forEach(([a, b, r]) => ell(x, a, b, 5, 1.3, '#82b450', '#3e6a22', 0.3, r));
      rr(x, 8.6, 15, 2.4, 6, 1.2, '#f4d03a', '#a8861a', 0.3); line(x, [[8, 5], [7, 2]], '#d8c070', 0.8);
    });
  }
  function drawPost() {
    return sprite('post', 24, 44, 12, 42, (x) => {
      softShadow(x, 13, 42, 6, 2, 0.28);
      rr(x, 10.5, 8, 3, 34, 0.8, '#7a5636', ink('#7a5636'), 0.6); rr(x, 2, 12, 20, 2.4, 0.8, '#7a5636', ink('#7a5636'), 0.6);
    });
  }
  function drawDeadTree(p) {
    const v = p.v % 3;
    return sprite('dtree' + v, 36, 50, 18, 47, (x) => {
      softShadow(x, 20, 47, 11, 3, 0.25);
      poly(x, [[15, 47], [16, 18], [20, 18], [22, 47]], '#6a6058', ink('#6a6058'), 0.8);
      [[17, 26, -8, -9], [19, 22, 9, -10], [17, 34, -9, -5], [20, 30, 7, -6]].forEach(([a, b, dx, dy]) => line(x, [[a, b], [a + dx, b + dy], [a + dx * 1.3, b + dy * 1.5]], '#5e554e', 1.8));
      for (let i = 0; i < 6; i++) line(x, [[6 + i * 4.5, 16 + (i % 3) * 4], [6.5 + i * 4.5, 21 + (i % 2) * 5]], '#6a8a4a', 0.9, 0.9);
    });
  }
  function drawLog() {
    return sprite('log', 36, 14, 10, 12, (x) => {
      softShadow(x, 18, 12, 16, 2.5, 0.25);
      rr(x, 3, 3, 30, 9, 4, '#8a6040', ink('#8a6040'), 0.7); ell(x, 4.5, 7.5, 2.6, 4.4, '#c8a070', ink('#8a6040'), 0.5); ell(x, 4.5, 7.5, 1.2, 2, '#a8805a');
    });
  }
  function drawTallGrass(p) {
    const v = p.v % 3;
    return sprite('tg' + v, 18, 16, 9, 14, (x) => {
      const R = rnd(300 + v);
      for (let i = 0; i < 9; i++) { const bx = 2 + R() * 14; line(x, [[bx, 14], [bx + (R() - 0.5) * 4, 3 + R() * 5]], R() < 0.5 ? '#5e9e40' : '#8cc860', 0.7); }
    });
  }
  function drawFern(p) {
    const v = p.v % 3;
    return sprite('fern' + v, 20, 14, 10, 12, (x) => {
      for (let i = 0; i < 5; i++) { const a = -Math.PI * 0.9 + i * 0.45; const ex = 10 + Math.cos(a) * 8, ey = 12 + Math.sin(a) * 7; line(x, [[10, 12], [ex, ey]], '#3e7a3a', 0.6); for (let k = 1; k < 5; k++) ell(x, 10 + (ex - 10) * k / 5, 12 + (ey - 12) * k / 5, 1.3, 0.5, '#5a9a4a', null, 0, a + 1.2); }
    });
  }
  function drawFlowers(p) {
    const col = p.color || '#f07ac0';
    return sprite('fl' + col + (p.v % 3), 16, 12, 8, 9, (x) => {
      const R = rnd(400 + (p.v % 3));
      for (let i = 0; i < 5; i++) { const fx = 2 + R() * 12, fy = 2 + R() * 7; line(x, [[fx, fy], [fx, fy + 3]], '#4a8a32', 0.4); for (let k = 0; k < 5; k++) { const a = k * 1.256; ell(x, fx + Math.cos(a) * 0.9, fy + Math.sin(a) * 0.9, 0.7, 0.7, col); } ell(x, fx, fy, 0.45, 0.45, '#f8e8a0'); }
    });
  }
  function drawSmall(type, p) {
    return sprite(type + (p.v % 3) + (p.swamp ? 's' : ''), 16, 12, 8, 9, (x) => {
      if (type === 'lilypad') { x.beginPath(); x.ellipse(8, 7, 6, 3.4, 0, 0.3, Math.PI * 2 - 0.2); x.lineTo(8, 7); x.closePath(); x.fillStyle = '#58a84a'; x.fill(); x.strokeStyle = '#2e6a2a'; x.lineWidth = 0.5; x.stroke(); if (p.v % 3 === 0 && !p.swamp) { ell(x, 6, 5.5, 1.6, 1.2, '#f8c0d8', '#c87a9a', 0.3); } }
      else if (type === 'shell') { ell(x, 8, 7, 3, 2.2, '#f8dce4', '#c89aa8', 0.4); for (let k = -2; k <= 2; k++) line(x, [[8, 8.8], [8 + k * 1.2, 5.2]], '#d8a8b8', 0.3); }
      else if (type === 'mushroom') { rr(x, 7, 5, 2, 4, 0.8, '#f2ead8', '#8a7a6a', 0.3); ell(x, 8, 5, 3.6, 2.2, '#c84a8a', '#6a1a4a', 0.4); ell(x, 7, 4.2, 0.6, 0.5, '#ffffff'); ell(x, 9.3, 5, 0.5, 0.4, '#ffffff'); }
      else if (type === 'cap') { ell(x, 8, 7, 2.2, 1.6, '#c8c8d0', '#6a6a72', 0.4); ell(x, 7.4, 6.4, 0.7, 0.5, '#ffffff'); }
      else if (type === 'feather') { ell(x, 8, 7, 4, 1, '#1a1420', null, 0, 0.5); }
    });
  }
  function drawDock() {
    return sprite('dock', 36, 30, 18, 26, (x) => {
      for (let i = 0; i < 6; i++) rr(x, 5, i * 4.5, 26, 4, 0.6, i % 2 ? '#b5875a' : '#c49464', '#6f4e30', 0.4);
      rr(x, 4, 0, 2.4, 30, 0.6, '#8a6040'); rr(x, 29.6, 0, 2.4, 30, 0.6, '#8a6040');
    });
  }
  function drawLantern() { return drawLamp(true); }

  // ---------------- interior furniture
  function drawFurniture(type, p) {
    const defs = {
      futon: [36, 52, 8, 44, (x) => { rr(x, 2, 6, 30, 42, 3, '#f4f0ea', ink('#e8e0d4'), 0.8); rr(x, 2, 18, 30, 30, 3, '#7ab0d8', ink('#7ab0d8'), 0.8); for (let i = 0; i < 4; i++) line(x, [[4, 22 + i * 7], [30, 22 + i * 7]], '#9ac8e8', 0.6); rr(x, 7, 8, 20, 8, 3, '#ffffff', ink('#e0d8cc'), 0.6); }],
      lowtable: [36, 24, 8, 20, (x) => { softShadow(x, 18, 20, 16, 3, 0.3); rr(x, 2, 4, 30, 12, 2, '#9a6a3e', ink('#9a6a3e'), 0.8); rr(x, 3, 5, 28, 3, 1.5, '#b88452'); rr(x, 4, 15, 3, 5, 0.6, '#6a4426'); rr(x, 27, 15, 3, 5, 0.6, '#6a4426'); rr(x, 13, 6, 8, 5, 1, '#f6f2ea', '#9a8a70', 0.4); line(x, [[14.5, 8], [19.5, 8]], '#9a8a70', 0.3); line(x, [[14.5, 9.5], [18, 9.5]], '#9a8a70', 0.3); ell(x, 26, 9, 2, 2, '#f4f0ea', '#9a8a70', 0.4); }],
      cushion: [16, 14, 8, 10, (x) => { rr(x, 2, 3, 12, 9, 3, '#d8604a', ink('#d8604a'), 0.6); ell(x, 8, 7.5, 1, 0.8, '#f4c84a'); }],
      kitchen: [36, 30, 8, 26, (x) => { rr(x, 1, 6, 34, 22, 1.5, '#e8e0d0', ink('#e8e0d0'), 0.7); rr(x, 1, 4, 34, 4, 1, '#a8a8a8', ink('#a8a8a8'), 0.5); rr(x, 20, 4.5, 10, 3, 1, '#7a8a9a'); for (let i = 0; i < 3; i++) rr(x, 3 + i * 11, 12, 9, 13, 0.8, '#d8d0c0', '#9a9080', 0.4); ell(x, 6, 3, 2.4, 1.4, '#4a4a4a'); }],
      fridge: [18, 38, 8, 35, (x) => { softShadow(x, 9, 35, 8, 2, 0.3); rr(x, 1.5, 2, 15, 33, 2, '#eef2f4', ink('#d8dce0'), 0.7); line(x, [[1.5, 14], [16.5, 14]], '#a8acb0', 0.5); rr(x, 13, 6, 1.4, 5, 0.6, '#9a9ea2'); rr(x, 13, 18, 1.4, 8, 0.6, '#9a9ea2'); ell(x, 6, 8, 1.4, 1.4, '#f05a4a'); rr(x, 4, 18, 5, 4, 0.4, '#f8f0c0'); }],
      shelf: [18, 40, 8, 36, (x) => { rr(x, 1.5, 2, 15, 34, 1, '#8a5a34', ink('#8a5a34'), 0.7); for (let r = 0; r < 3; r++) { line(x, [[2, 12 + r * 9], [16, 12 + r * 9]], '#5a3a20', 0.8); for (let k = 0; k < 5; k++) rr(x, 3 + k * 2.6, 5 + r * 9, 2.2, 6.6, 0.3, ['#d84a4a', '#4a7ad8', '#f4c84a', '#5ab060', '#8a5ab0'][(k + r) % 5]); } }],
      tv: [22, 30, 11, 26, (x) => { rr(x, 2, 18, 18, 8, 1, '#7a5a3a', ink('#7a5a3a'), 0.6); rr(x, 3, 3, 16, 12, 1, '#2a2a30', '#1a1a1e', 0.6); rr(x, 4, 4, 14, 10, 0.6, '#3a4a6a'); x.globalAlpha = 0.35; line(x, [[5, 12], [9, 5]], '#ffffff', 1); x.globalAlpha = 1; rr(x, 10, 15, 2, 3, 0.4, '#2a2a30'); }],
      sofa: [36, 28, 8, 24, (x) => { softShadow(x, 18, 24, 16, 3, 0.3); rr(x, 1, 4, 34, 10, 3, '#5a8a6a', ink('#5a8a6a'), 0.7); rr(x, 1, 12, 34, 10, 3, '#6a9a7a', ink('#6a9a7a'), 0.7); rr(x, 0, 8, 5, 14, 2, '#4a7a5a', ink('#4a7a5a'), 0.6); rr(x, 31, 8, 5, 14, 2, '#4a7a5a', ink('#4a7a5a'), 0.6); rr(x, 8, 7, 7, 6, 2, '#f4c84a', ink('#f4c84a'), 0.5); }],
      plant: [18, 34, 9, 31, (x) => { softShadow(x, 9, 31, 7, 2, 0.3); rr(x, 4, 22, 10, 9, 2, '#c87a4a', ink('#c87a4a'), 0.6); canopy(x, 9, 14, 8, TREE_PALS[1], 160, 0.5); }],
      rug: [40, 26, 12, 14, (x) => { rr(x, 1, 1, 38, 24, 6, '#c8604a', ink('#c8604a'), 0.6); rr(x, 4, 4, 32, 18, 4, null, '#f4c84a', 0.8); ell(x, 20, 13, 6, 4, '#e8a04a'); }],
    };
    const W3 = (n) => n * 16 + 8; // wide pieces: anchor on the left tile's centre
    const more = {
      counter: [W3(5), 30, 12, 22, (x) => { softShadow(x, 44, 22, 40, 3, 0.3); rr(x, 2, 6, 80, 16, 2, '#c08a56', ink('#c08a56'), 0.8); rr(x, 2, 4, 80, 4, 1.5, '#e8d2a8', ink('#c08a56'), 0.6); for (let i = 0; i < 6; i++) rr(x, 6 + i * 13, 10, 10, 9, 1, '#a8744a', '#7a5030', 0.4); rr(x, 64, 0, 10, 5, 1.2, '#4a4a52', '#2a2a30', 0.4); }],
      displaycase: [W3(2), 30, 12, 22, (x) => { softShadow(x, 20, 22, 18, 3, 0.3); rr(x, 2, 6, 36, 16, 2, '#d8d0c0', ink('#d8d0c0'), 0.8); rr(x, 4, 7, 32, 9, 1.5, 'rgba(200,235,250,0.75)', '#8aa0aa', 0.5); [[8, '#d8963a'], [14, '#f4c0d0'], [20, '#8a5a3a'], [26, '#f4d06a'], [32, '#e8a84a']].forEach(([a, c]) => { ell(x, a, 13, 2.2, 1.6, c, ink(c), 0.3); }); x.globalAlpha = 0.5; line(x, [[6, 15], [12, 8]], '#ffffff', 1); x.globalAlpha = 1; }],
      oven: [20, 30, 10, 26, (x) => { softShadow(x, 10, 26, 9, 2, 0.3); rr(x, 1, 2, 18, 24, 2, '#9a9ea4', ink('#9a9ea4'), 0.8); rr(x, 3, 9, 14, 11, 1.5, '#2a2024', '#1a1014', 0.4); ell(x, 10, 15, 5, 3, '#e86a2a'); ell(x, 10, 15, 3, 1.6, '#ffc84a'); [5, 10, 15].forEach((a) => ell(x, a, 5, 1, 1, '#3a3a40')); }],
      breadshelf: [20, 42, 10, 38, (x) => { softShadow(x, 10, 38, 9, 2, 0.3); rr(x, 1, 2, 18, 36, 1.5, '#a87a4a', ink('#a87a4a'), 0.8); for (let r = 0; r < 4; r++) { line(x, [[2, 10 + r * 8], [18, 10 + r * 8]], '#6a4a2a', 0.8); for (let k = 0; k < 3; k++) ell(x, 5 + k * 5, 7.5 + r * 8, 2.2, 1.6, ['#d8963a', '#c8803a', '#e8b060'][(k + r) % 3], '#7a4a1a', 0.3); } }],
      cafetable: [20, 22, 10, 18, (x) => { softShadow(x, 10, 18, 8, 2, 0.3); rr(x, 9, 9, 2, 9, 0.6, '#5a4a40'); ell(x, 10, 8, 8, 4, '#f4eee2', ink('#d8ccb8'), 0.7); ell(x, 8, 7, 1.6, 1, '#c8a070'); ell(x, 12.5, 7.5, 1.4, 1.2, '#f8f4ec', '#9a8a70', 0.3); }],
      chair: [16, 14, 8, 11, (x) => { rr(x, 3, 3, 10, 8, 2, '#c8784a', ink('#c8784a'), 0.6); rr(x, 4, 1, 8, 3, 1, '#a85a3a'); }],
      weightrack: [W3(3), 30, 12, 24, (x) => { softShadow(x, 28, 24, 26, 3, 0.3); rr(x, 2, 8, 52, 3, 1, '#4a4e54', ink('#4a4e54'), 0.6); rr(x, 2, 18, 52, 3, 1, '#4a4e54', ink('#4a4e54'), 0.6); rr(x, 3, 6, 2.5, 18, 0.8, '#3a3e44'); rr(x, 50, 6, 2.5, 18, 0.8, '#3a3e44'); for (let i = 0; i < 6; i++) { ell(x, 8 + i * 8, 7, 2.6, 3.4, ['#2a2a30', '#c83a3a', '#2a2a30', '#3a6ac8', '#2a2a30', '#f4c84a'][i], '#1a1a1e', 0.4); ell(x, 8 + i * 8, 17, 2.2, 2.8, '#2a2a30', '#1a1a1e', 0.4); } }],
      treadmill: [20, 30, 10, 24, (x) => { softShadow(x, 10, 24, 9, 2, 0.3); rr(x, 2, 12, 16, 12, 2, '#3a3e44', ink('#3a3e44'), 0.6); rr(x, 4, 13, 12, 9, 1, '#22262a'); rr(x, 3, 2, 2, 12, 0.6, '#8a8e94'); rr(x, 15, 2, 2, 12, 0.6, '#8a8e94'); rr(x, 3, 1, 14, 4, 1.2, '#5a5e64', ink('#5a5e64'), 0.5); rr(x, 7, 2, 6, 2, 0.5, '#6af07a'); }],
      punchbag: [16, 40, 8, 36, (x) => { softShadow(x, 8, 36, 6, 2, 0.3); line(x, [[8, 0], [8, 8]], '#5a5a5a', 0.8); rr(x, 3, 8, 10, 24, 4, '#c83a3a', ink('#c83a3a'), 0.8); rr(x, 3, 12, 10, 2, 0, '#8a2020'); rr(x, 3, 26, 10, 2, 0, '#8a2020'); x.globalAlpha = 0.35; rr(x, 4.5, 10, 2, 20, 1, '#ffffff'); x.globalAlpha = 1; }],
      gymbench: [W3(2), 20, 12, 15, (x) => { softShadow(x, 20, 15, 17, 2, 0.3); rr(x, 6, 12, 2, 4, 0.5, '#4a4a4a'); rr(x, 30, 12, 2, 4, 0.5, '#4a4a4a'); rr(x, 2, 6, 34, 6, 2, '#2a3a5a', ink('#2a3a5a'), 0.7); rr(x, 10, 0, 18, 2, 1, '#8a8e94'); ell(x, 9, 1, 2, 3, '#2a2a30'); ell(x, 29, 1, 2, 3, '#2a2a30'); }],
      mat: [W3(3), 18, 12, 13, (x) => { rr(x, 2, 2, 52, 12, 2, '#3a8a6a', ink('#3a8a6a'), 0.6); line(x, [[19, 2], [19, 14]], '#2a6a4a', 0.5); line(x, [[37, 2], [37, 14]], '#2a6a4a', 0.5); }],
      poster: [16, 16, 8, 12, (x) => { rr(x, 2, 1, 12, 13, 0.6, '#f8f0dc', '#8a7a60', 0.5); x.fillStyle = '#c83a3a'; x.font = 'bold 3px sans-serif'; x.textAlign = 'center'; x.fillText('LEG', 8, 6); x.fillText('DAY', 8, 10); }],
      labtable: [W3(3), 34, 12, 26, (x) => { softShadow(x, 28, 26, 26, 3, 0.3); rr(x, 2, 12, 52, 14, 1.5, '#e8ecee', ink('#c8ccd0'), 0.8); rr(x, 2, 10, 52, 3, 1, '#4a5258'); [[8, '#8affc8'], [14, '#ff6ac8'], [22, '#6ac0ff'], [30, '#f4e04a'], [40, '#8affc8']].forEach(([a, c], i) => { rr(x, a - 1.5, 1 + (i % 2) * 2, 3, 9 - (i % 2) * 2, 1, 'rgba(240,250,255,0.6)', '#7a8a90', 0.4); rr(x, a - 1.2, 5 + (i % 2), 2.4, 4.6 - (i % 2), 0.8, c); }); ell(x, 48, 7, 3, 2, '#5a4a7a', '#2a1a3a', 0.4); }],
      hole: [36, 22, 8, 14, (x) => { ell(x, 10, 10, 9, 5.5, '#0c0816', '#3a2a5a', 1); for (let i = 0; i < 3; i++) { x.beginPath(); x.ellipse(10, 10, 7 - i * 2, 4 - i * 1.2, i, 0.3, 4); x.strokeStyle = ['#8a5ae8', '#5ac8e8', '#e85ac8'][i]; x.lineWidth = 0.6; x.stroke(); } x.fillStyle = '#c8b8f0'; x.font = '2.6px sans-serif'; x.fillText('do not', 18, 4); x.fillText('step', 18, 7); }],
      desk: [W3(2), 28, 12, 20, (x) => { softShadow(x, 20, 20, 17, 3, 0.3); rr(x, 2, 6, 36, 14, 1.5, '#8a5a34', ink('#8a5a34'), 0.8); rr(x, 2, 4, 36, 3, 1, '#a8744a'); rr(x, 6, 0, 8, 5, 0.5, '#f8f4e8', '#9a8a70', 0.4); rr(x, 16, 1, 6, 4, 0.4, '#f8f0c8', '#9a8a70', 0.4); ell(x, 30, 2, 2, 2, '#f4f0ea', '#9a8a70', 0.4); }],
      shopshelf: [W3(3), 32, 12, 24, (x) => { softShadow(x, 28, 24, 26, 3, 0.3); rr(x, 2, 0, 52, 24, 1.5, '#d8d0c0', ink('#d8d0c0'), 0.8); for (let r = 0; r < 3; r++) { line(x, [[3, 8 + r * 7.5], [53, 8 + r * 7.5]], '#9a9080', 0.7); for (let k = 0; k < 10; k++) rr(x, 4 + k * 5, 2.5 + r * 7.5, 3.6, 5, 0.6, ['#e85a4a', '#4a8ad8', '#f4c84a', '#5ab060', '#e07ab0', '#f0f0e8'][(k * 3 + r) % 6]); } }],
      cashcounter: [W3(4), 30, 12, 22, (x) => { softShadow(x, 36, 22, 34, 3, 0.3); rr(x, 2, 6, 68, 16, 2, '#3a7a4a', ink('#3a7a4a'), 0.8); rr(x, 2, 4, 68, 4, 1.5, '#5a9a6a', ink('#3a7a4a'), 0.5); rr(x, 50, -2, 12, 8, 1.2, '#4a4a52', '#2a2a30', 0.5); rr(x, 52, 0, 8, 3, 0.5, '#6af07a'); rr(x, 10, 0, 8, 5, 1, '#1a1a1e'); }],
      drinkfridge: [20, 40, 10, 36, (x) => { softShadow(x, 10, 36, 9, 2, 0.3); rr(x, 1, 2, 18, 34, 2, '#e8ecee', ink('#d8dce0'), 0.8); rr(x, 3, 4, 14, 28, 1, 'rgba(200,235,250,0.8)', '#8aa0aa', 0.5); for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) rr(x, 4 + k * 3.2, 6 + r * 6.6, 2.4, 5, 0.8, ['#e85a4a', '#4a8ad8', '#f4c84a', '#5ab060'][(k + r) % 4]); }],
      bar: [W3(4), 34, 12, 24, (x) => { softShadow(x, 36, 24, 34, 3, 0.3); rr(x, 2, 8, 68, 16, 2, '#2a1a30', ink('#5a2a6a'), 0.8); rr(x, 2, 6, 68, 4, 1.5, '#5a3a6a', '#ff6ac8', 0.6); [[10, '#ff6ac8'], [16, '#6af0ff'], [40, '#fff06a'], [58, '#a0ff6a']].forEach(([a, c]) => { rr(x, a - 1, 0, 2.4, 6, 0.8, c, ink(c), 0.3); }); line(x, [[2, 22], [70, 22]], '#ff6ac8', 0.6); }],
      stool: [16, 14, 8, 11, (x) => { rr(x, 7, 6, 2, 6, 0.5, '#5a5a62'); ell(x, 8, 5, 4.4, 2.4, '#c83a8a', ink('#c83a8a'), 0.6); }],
      djbooth: [W3(2), 34, 12, 24, (x) => { softShadow(x, 20, 24, 17, 3, 0.3); rr(x, 2, 10, 36, 14, 2, '#1a1a22', ink('#3a3a48'), 0.8); ell(x, 11, 8, 6, 3, '#2a2a30', '#6af0ff', 0.6); ell(x, 29, 8, 6, 3, '#2a2a30', '#ff6ac8', 0.6); ell(x, 11, 8, 1, 0.6, '#6af0ff'); ell(x, 29, 8, 1, 0.6, '#ff6ac8'); for (let i = 0; i < 5; i++) rr(x, 16 + i * 2, 13, 1.2, 5 - (i % 3), 0.3, ['#6af07a', '#f4c84a', '#e85a4a'][i % 3]); }],
      dancefloor: [W3(4) + 8, 58, 12, 50, (x) => { for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) rr(x, 2 + i * 16, 2 + j * 16, 15, 15, 1.5, ['#ff6ac8', '#6af0ff', '#fff06a', '#a0ff6a', '#b08aff'][(i + j * 2) % 5], 'rgba(255,255,255,0.4)', 0.5); x.globalAlpha = 0.25; rr(x, 2, 2, 63, 47, 2, '#ffffff'); x.globalAlpha = 1; }],
      speaker: [18, 34, 9, 30, (x) => { softShadow(x, 9, 30, 8, 2, 0.3); rr(x, 2, 2, 14, 28, 2, '#1e1e24', ink('#3a3a44'), 0.8); ell(x, 9, 10, 4.4, 4.4, '#3a3a44', '#6a6a78', 0.5); ell(x, 9, 22, 5.4, 5.4, '#3a3a44', '#6a6a78', 0.5); ell(x, 9, 22, 2, 2, '#ff6ac8'); }],
      hangchair: [24, 40, 12, 36, (x) => { softShadow(x, 12, 36, 9, 2, 0.3); line(x, [[12, 0], [12, 10]], '#c8a870', 0.8); x.beginPath(); x.ellipse(12, 22, 10, 12, 0, 0, Math.PI * 2); x.fillStyle = 'rgba(232,200,150,0.9)'; x.fill(); x.strokeStyle = '#9a7a4a'; x.lineWidth = 0.9; x.stroke(); ell(x, 12, 26, 7, 5, '#ff6ac8', ink('#ff6ac8'), 0.5); }],
      flag: [16, 40, 8, 36, (x) => { softShadow(x, 8, 36, 4, 1.5, 0.3); rr(x, 7, 2, 1.6, 34, 0.5, '#c8a84a'); poly(x, [[8.6, 3], [15.5, 4], [15, 13], [8.6, 12]], '#3a6ab0', ink('#3a6ab0'), 0.5); ell(x, 12, 8, 1.8, 1.8, '#f4c84a'); }],
      chairrow: [W3(3), 22, 12, 16, (x) => { for (let i = 0; i < 3; i++) { rr(x, 3 + i * 16, 6, 10, 9, 1.5, '#7a5a8a', ink('#7a5a8a'), 0.6); rr(x, 3 + i * 16, 2, 10, 4, 1, '#5a3a6a', ink('#5a3a6a'), 0.5); } }],
      clinicbed: [20, 40, 10, 34, (x) => { softShadow(x, 10, 34, 9, 2, 0.3); rr(x, 1, 2, 18, 32, 2, '#f4f6f6', ink('#c8ccd0'), 0.8); rr(x, 2, 12, 16, 21, 1.5, '#9ad0e8', ink('#9ad0e8'), 0.5); rr(x, 4, 3, 12, 7, 2, '#ffffff', '#c8ccd0', 0.4); }],
      cabinet: [20, 38, 10, 34, (x) => { softShadow(x, 10, 34, 9, 2, 0.3); rr(x, 1, 2, 18, 32, 1.5, '#f2f2ee', ink('#d8d8d4'), 0.8); rr(x, 3, 4, 14, 12, 1, 'rgba(200,235,250,0.8)', '#8aa0aa', 0.5); [[6, '#e85a4a'], [10, '#5ab060'], [14, '#f4c84a']].forEach(([a, c]) => rr(x, a - 1, 9, 2.4, 6, 0.8, c)); rr(x, 7, 6, 6, 1.6, 0.5, '#e83a3a'); line(x, [[3, 24], [17, 24]], '#c8c8c4', 0.5); }],
      barberchair: [20, 32, 10, 26, (x) => { softShadow(x, 10, 26, 8, 2, 0.3); rr(x, 8.5, 18, 3, 8, 0.6, '#8a8e94'); ell(x, 10, 26, 6, 1.6, '#6a6e74'); rr(x, 3, 8, 14, 11, 2.5, '#c83a3a', ink('#c83a3a'), 0.7); rr(x, 4, 1, 12, 9, 2.5, '#d84a4a', ink('#c83a3a'), 0.7); }],
      mirror: [16, 16, 8, 12, (x) => { ell(x, 8, 7, 6, 6.5, 'rgba(210,235,250,0.95)', '#c8a84a', 1); x.globalAlpha = 0.5; line(x, [[5, 10], [9, 3]], '#ffffff', 1); x.globalAlpha = 1; }],
    };
    const d = defs[type] || more[type]; if (!d) return null;
    return sprite('furn_' + type + (p.v != null && type === 'shelf' ? p.v % 2 : ''), d[0], d[1], d[2], d[3], d[4]);
  }

  art.prop = function (p) {
    switch (p.type) {
      case 'tree': return drawTree(p);
      case 'sakura': return drawSakura(p);
      case 'cedar': return drawCedar(p);
      case 'bamboo': return drawBamboo(p);
      case 'bush': return drawBush(p);
      case 'hedge': return drawHedge(p);
      case 'rock': return drawRock(p);
      case 'pole': return drawPole(p);
      case 'crossingsign': return drawCrossingSign(p);
      case 'fencepost': return drawFencePost(p);
      case 'blockwall': return drawBlockWall(p);
      case 'vending': return drawVending(p);
      case 'postbox': return drawPostbox(p);
      case 'lamp': return drawLamp(false);
      case 'lantern': return drawLantern();
      case 'bench': return drawBench();
      case 'well': return drawWell();
      case 'board': return drawBoard();
      case 'planter': return drawPlanter();
      case 'stall': return drawStall(p);
      case 'busstop': return drawBusStop();
      case 'stationsign': return drawStationSign();
      case 'torii': return drawTorii();
      case 'stonelantern': return drawStoneLantern();
      case 'tower': return drawTower();
      case 'lookout': return drawLookout();
      case 'steam': return drawSteam(p);
      case 'reeds': return drawReeds(p);
      case 'sunflower': return drawSunflower(p);
      case 'corn': return drawCorn(p);
      case 'post': return drawPost();
      case 'deadtree': return drawDeadTree(p);
      case 'log': return drawLog();
      case 'tallgrass': return drawTallGrass(p);
      case 'fern': return drawFern(p);
      case 'flowers': return drawFlowers(p);
      case 'dock': return drawDock();
      case 'lilypad': case 'shell': case 'mushroom': case 'cap': case 'feather': return drawSmall(p.type, p);
      default: return drawFurniture(p.type, p) || drawSmall('cap', p);
    }
  };

  // ================================================================== BUILDINGS
  // Tiled (kawara) roof drawn as a trapezoid with scalloped tile rows.
  function tiledRoof(x, l, r, top, bottom, inset, col, opts = {}) {
    const pts = [[l + inset, top], [r - inset, top], [r, bottom], [l, bottom]];
    poly(x, pts, vgrad(x, top, bottom, shade(col, 1.12), shade(col, 0.86)), ink(col), 0.9);
    x.save(); poly(x, pts); x.clip();
    const rowH = opts.rowH || 4.4;
    for (let y = top + rowH; y < bottom; y += rowH) {
      const k = (y - top) / (bottom - top), lx = l + inset * (1 - k), rx = r - inset * (1 - k);
      x.beginPath();
      for (let sx = lx; sx < rx; sx += 3.2) { x.moveTo(sx, y); x.quadraticCurveTo(sx + 1.6, y + 1.3, sx + 3.2, y); }
      x.strokeStyle = shade(col, 0.68); x.lineWidth = 0.55; x.stroke();
      x.globalAlpha = 0.25; line(x, [[lx, y - rowH * 0.5], [rx, y - rowH * 0.5]], shade(col, 1.35), 0.5); x.globalAlpha = 1;
    }
    for (let sx = l + 2; sx < r; sx += 3.2) { x.globalAlpha = 0.18; line(x, [[sx + (sx - (l + r) / 2) * -0.15 * 0, top], [sx, bottom]], shade(col, 0.6), 0.35); x.globalAlpha = 1; }
    x.restore();
    // ridge & eave
    rr(x, l + inset - 1.5, top - 2, r - l - inset * 2 + 3, 3.4, 1.6, shade(col, 0.75), ink(col), 0.7);
    ell(x, l + inset - 1, top - 0.4, 2.2, 2.2, shade(col, 0.7), ink(col), 0.6); ell(x, r - inset + 1, top - 0.4, 2.2, 2.2, shade(col, 0.7), ink(col), 0.6);
    rr(x, l - 0.5, bottom - 1.6, r - l + 1, 2.6, 1, shade(col, 0.62), ink(col), 0.6);
  }
  function windowRect(x, wx, wy, ww, wh, frame, opts = {}) {
    rr(x, wx - 1, wy - 1, ww + 2, wh + 2, 0.8, frame, ink(frame), 0.6);
    x.fillStyle = vgrad(x, wy, wy + wh, opts.glow ? opts.glow : '#cfe9f4', opts.glow ? shade(opts.glow, 0.7) : '#7fa8c4'); x.fillRect(wx, wy, ww, wh);
    if (opts.curtain) { rr(x, wx, wy, ww * 0.3, wh, 0.4, opts.curtain); rr(x, wx + ww * 0.7, wy, ww * 0.3, wh, 0.4, opts.curtain); }
    line(x, [[wx + ww / 2, wy], [wx + ww / 2, wy + wh]], frame, 0.7);
    if (wh > 7) line(x, [[wx, wy + wh / 2], [wx + ww, wy + wh / 2]], frame, 0.5);
    x.globalAlpha = 0.45; line(x, [[wx + ww * 0.15, wy + wh * 0.85], [wx + ww * 0.45, wy + wh * 0.15]], '#ffffff', 1); x.globalAlpha = 1;
  }

  art.building = function (b) {
    const key = 'B_' + b.id;
    const Wp = b.w * T, Hp = b.h * T;
    const up = b.kind === 'cave' ? 10 : b.kind === 'shrine' ? 22 : b.storeys === 2 || b.kind === 'station' || b.kind === 'hall' ? 34 : 22;
    const pad = 8;
    const s = sprite(key, Wp + pad * 2, Hp + up + pad, pad, Hp + up, (x) => {
      x.translate(pad, 0);
      b._win = [];
      paintBuilding(x, b, Wp, Hp, up);
    });
    s.wins = b._win || s.wins;
    return s;
  };

  function paintBuilding(x, b, Wp, Hp, up) {
    const base = Hp + up;
    const R = rnd(b.id.length * 31 + b.x * 7 + b.y);
    const wall = b.wall || '#f2ecdc', roof = b.roof || '#8a5a3a';
    const frame = '#6a4a32';
    softShadow(x, Wp / 2 + 8, base - 2, Wp * 0.62, 7, 0.32);
    if (b.kind === 'cave') {
      ell(x, Wp / 2, base - 18, Wp / 2 + 4, 24, '#7a7672', ink('#7a7672'), 1);
      ell(x, Wp / 2 - 4, base - 24, Wp / 2 - 4, 18, '#94908a');
      ell(x, Wp / 2 + 10, base - 34, 10, 7, '#a8a49e');
      canopy(x, 10, base - 36, 9, DARK_PAL, 500, 0.6); canopy(x, Wp - 8, base - 40, 10, DARK_PAL, 501, 0.6);
      ell(x, Wp / 2, base - 10, 13, 11, '#1e1612'); rr(x, Wp / 2 - 13, base - 10, 26, 10, 0, '#1e1612');
      return;
    }
    if (b.kind === 'shrine') {
      rr(x, 4, base - 16, Wp - 8, 14, 1, '#8a8478', ink('#8a8478'), 0.8);
      for (let i = 0; i < 4; i++) rr(x, 10 + i * ((Wp - 24) / 3), base - 38, 3.4, 24, 0.8, '#c8402e', ink('#c8402e'), 0.6);
      rr(x, 12, base - 34, Wp - 24, 18, 0.6, '#5a3a2a');
      rr(x, Wp / 2 - 8, base - 26, 16, 9, 1, '#7a5a3a', ink('#7a5a3a'), 0.6);
      for (let i = 0; i < 4; i++) line(x, [[Wp / 2 - 7, base - 24 + i * 2], [Wp / 2 + 7, base - 24 + i * 2]], '#4a3a2a', 0.4);
      x.beginPath(); x.moveTo(-4, base - 34); x.quadraticCurveTo(Wp / 2, base - 40, Wp + 4, base - 34); x.lineTo(Wp - 8, base - 60); x.lineTo(8, base - 60); x.closePath();
      x.fillStyle = vgrad(x, base - 60, base - 34, '#5a5058', '#3a343c'); x.fill(); x.strokeStyle = '#1a1418'; x.lineWidth = 0.9; x.stroke();
      rr(x, 4, base - 62, Wp - 8, 4, 2, '#2a2428');
      line(x, [[Wp / 2, base - 36], [Wp / 2, base - 30]], '#e8d070', 0.8); ell(x, Wp / 2, base - 29, 1.6, 1.6, '#e8c040', '#8a6a10', 0.4);
      return;
    }
    if (b.kind === 'stilt') {
      for (let i = 0; i < 4; i++) rr(x, 6 + i * ((Wp - 16) / 3), base - 26, 3, 26, 0.8, '#5a4a3a', ink('#5a4a3a'), 0.5);
      rr(x, 2, base - 28, Wp - 4, 3, 0.8, '#6a5a4a', ink('#6a5a4a'), 0.5);
      for (let i = 0; i < 7; i++) rr(x, Wp / 2 - 4, base - 25 + i * 3.4, 8, 1, 0.3, '#7a6a5a');
      x.translate(0, -26);
    }
    const two = b.storeys === 2 || b.kind === 'station' || b.kind === 'hall';
    const wallH = two ? 46 : 26;
    const wallTop = base - wallH, wallBot = base;
    // --- walls
    const wallFill = vgrad(x, wallTop, wallBot, shade(wall, 1.04), shade(wall, 0.9));
    if (b.round) {
      x.beginPath(); x.moveTo(2, wallBot); x.lineTo(2, wallTop + 6); x.quadraticCurveTo(Wp / 2, wallTop - 4, Wp - 2, wallTop + 6); x.lineTo(Wp - 2, wallBot); x.closePath();
      x.fillStyle = wallFill; x.fill(); x.strokeStyle = ink(wall); x.lineWidth = 0.9; x.stroke();
    } else rr(x, 2, wallTop, Wp - 4, wallH, 0.6, wallFill, ink(wall), 0.9);
    // wood siding on the lower part of some houses
    if ((b.kind === 'house' && R() < 0.55) || b.kind === 'shed' || b.kind === 'hut') {
      const sy = b.kind === 'shed' || b.kind === 'hut' ? wallTop : wallBot - (two ? 20 : 12);
      const wc = b.kind === 'hut' ? '#7a6a4a' : '#9a7050';
      rr(x, 2, sy, Wp - 4, wallBot - sy, 0.6, wc, ink(wc), 0.6);
      for (let yy = sy + 3; yy < wallBot; yy += 3) line(x, [[2.5, yy], [Wp - 2.5, yy]], shade(wc, 0.75), 0.45, 0.8);
    }
    // corner posts
    rr(x, 1.4, wallTop, 2.4, wallH, 0.5, '#7a5638'); rr(x, Wp - 3.8, wallTop, 2.4, wallH, 0.5, '#7a5638');
    // --- two-storey: lower eave roof between floors
    let floorTop = wallTop;
    if (two) {
      const midY = wallBot - 20;
      x.fillStyle = 'rgba(40,30,20,0.25)'; x.fillRect(2, midY, Wp - 4, 3);
      const upW = wall;
      // upper floor windows
      const nUp = Math.max(1, Math.floor((Wp - 20) / 22));
      for (let i = 0; i < nUp; i++) {
        const wx = 10 + i * ((Wp - 28) / Math.max(1, nUp - 1 || 1)) + (nUp === 1 ? (Wp - 28) / 2 : 0), wy = wallTop + 5;
        windowRect(x, wx, wy, 10, 9, frame, { curtain: R() < 0.5 ? R.pick(['#f4d0d8', '#d8e8f4', '#f8ecc8', '#e0f0d8']) : null, glow: b.glow });
        b._win.push([wx, wy + (b.kind === 'stilt' ? -26 : 0), 10, 9]);
        if (b.kind === 'house' && R() < 0.4) { rr(x, wx - 2, wy + 10, 14, 2.4, 0.6, '#8a8a88'); for (let k = 0; k < 5; k++) line(x, [[wx - 1.5 + k * 3.2, wy + 10], [wx - 1.5 + k * 3.2, wy + 12.4]], '#6a6a68', 0.4); }
      }
      if (b.kind !== 'station') tiledRoof(x, -3, Wp + 3, midY - 5, midY + 3, -2, roof, { rowH: 3.6 });
      floorTop = midY + 3;
    }
    // --- ground floor windows, doors, shop fronts
    const doorW = b.kind === 'station' ? 16 : 11, doorX = Wp / 2 - doorW / 2;
    const gTop = floorTop + 3;
    const doorH = wallBot - gTop - 1;
    if (b.kind === 'shop' || b.kind === 'club' || b.kind === 'station') {
      // big display windows
      const gw = (Wp - doorW - 16) / 2;
      windowRect(x, 6, gTop + 2, gw, doorH - 5, frame, { glow: b.glow || (b.kind === 'club' ? '#7a2a7a' : null) });
      windowRect(x, Wp - 6 - gw, gTop + 2, gw, doorH - 5, frame, { glow: b.glow || (b.kind === 'club' ? '#7a2a7a' : null) });
      b._win.push([6, gTop + 2, gw, doorH - 5], [Wp - 6 - gw, gTop + 2, gw, doorH - 5]);
      if (b.id === 'bakery') { for (let i = 0; i < 4; i++) { ell(x, 10 + i * 4.5, gTop + doorH - 6, 2, 1.4, '#d8963a', '#8a5a1a', 0.3); ell(x, Wp - 22 + i * 4.5, gTop + doorH - 6, 2, 1.4, '#e8a84a', '#8a5a1a', 0.3); } }
      if (b.id === 'lab') { for (let i = 0; i < 5; i++) rr(x, 8 + i * 2.6, gTop + 4, 2, 6, 0.3, ['#d84a4a', '#4a7ad8', '#f4c84a', '#5ab060', '#8a5ab0'][i]); ell(x, Wp - 14, gTop + doorH - 7, 2.6, 2.6, '#8affc8', '#2a8a5a', 0.4); }
    } else if (b.kind !== 'hut') {
      const nWin = Math.max(1, Math.floor((Wp - doorW - 8) / 18));
      for (let i = 0; i < nWin; i++) {
        const left = i < nWin / 2;
        const wx = left ? 7 + i * 16 : Wp - 17 - (nWin - 1 - i) * 16, wy = gTop + 3;
        if (wx + 10 > doorX - 1 && wx < doorX + doorW + 1) continue;
        windowRect(x, wx, wy, 10, 8, frame, { curtain: R() < 0.5 ? R.pick(['#f4d0d8', '#d8e8f4', '#f8ecc8']) : null, glow: b.glow });
        b._win.push([wx, wy + (b.kind === 'stilt' ? -26 : 0), 10, 8]);
        rr(x, wx - 1, wy + 9, 12, 2.4, 0.6, '#8a5a34'); for (let k = 0; k < 5; k++) ell(x, wx + 0.8 + k * 2.2, wy + 8.6, 0.9, 0.9, ['#f07ac0', '#f4d03a', '#ff6a5a', '#ffffff', '#8a7af0'][(k + i) % 5]);
      }
    }
    // door (sliding, frosted panels)
    const dc = b.kind === 'club' ? '#2a1a30' : b.kind === 'hut' ? '#4a3a2a' : '#8a6040';
    rr(x, doorX - 1, gTop, doorW + 2, doorH + 1, 0.6, shade(dc, 0.7));
    rr(x, doorX, gTop + 1, doorW, doorH, 0.4, dc, ink(dc), 0.6);
    if (b.kind !== 'hut') { for (let k = 0; k < 2; k++) for (let r = 0; r < 3; r++) rr(x, doorX + 1 + k * (doorW / 2), gTop + 2 + r * (doorH / 3.2), doorW / 2 - 2, doorH / 3.2 - 1.4, 0.4, b.kind === 'club' ? '#5a2a5a' : '#e8e4d8'); }
    line(x, [[doorX + doorW / 2, gTop + 1], [doorX + doorW / 2, gTop + doorH + 1]], ink(dc), 0.6);
    rr(x, doorX - 3, wallBot - 1.2, doorW + 6, 1.6, 0.4, '#9a9a94');
    // awning / noren
    if (b.awning) {
      const aw = Wp - 6, ax = 3, ay = gTop - 4;
      for (let i = 0; i < 10; i++) poly(x, [[ax + i * aw / 10, ay], [ax + (i + 1) * aw / 10, ay], [ax + (i + 1) * aw / 10, ay + 5], [ax + (i + 0.5) * aw / 10, ay + 6.5], [ax + i * aw / 10, ay + 5]], b.awning[i % 2]);
      rr(x, ax, ay - 0.8, aw, 1.6, 0.6, shade(b.awning[0], 0.7));
      x.globalAlpha = 0.25; x.fillStyle = '#2a1a10'; x.fillRect(ax, ay + 6.5, aw, 2.5); x.globalAlpha = 1;
    } else if (b.kind === 'house' || b.kind === 'hall') {
      // small entrance canopy
      tiledRoof(x, doorX - 4, doorX + doorW + 4, gTop - 5, gTop + 1, 1, roof, { rowH: 3 });
    }
    // potted plants, AC unit, mailbox
    if (b.kind === 'house' || b.kind === 'shop') {
      [[doorX - 6, wallBot], [doorX + doorW + 2, wallBot]].forEach(([px], i) => { if (R() < 0.75) { rr(x, px, wallBot - 5, 4.4, 5, 0.8, '#c87a4a', ink('#c87a4a'), 0.4); canopy(x, px + 2.2, wallBot - 7, 3.4, TREE_PALS[i], 600 + i + b.x, 0.3); } });
      if (R() < 0.6) { const ax = R() < 0.5 ? 4 : Wp - 16; rr(x, ax, wallBot - 9, 11, 7, 0.8, '#e8e8e4', ink('#e8e8e4'), 0.5); ell(x, ax + 4, wallBot - 5.5, 2.6, 2.6, '#c8c8c4', '#8a8a86', 0.4); }
      if (b.kind === 'house') { rr(x, Wp - 8, gTop + 4, 4, 5, 0.6, '#d8302a', ink('#d8302a'), 0.4); }
      line(x, [[Wp - 2.6, wallTop + 2], [Wp - 2.6, wallBot]], '#8a8a88', 0.8);
    }
    if (b.pole) { for (let i = 0; i < 10; i++) rr(x, Wp - 9, gTop + 1 + i * 1.6, 3.4, 1.6, 0, i % 3 === 0 ? '#e83a3a' : i % 3 === 1 ? '#f4f4f4' : '#3a6ae8'); }
    // --- main roof
    const roofBot = (two ? wallTop : wallTop) + 4;
    if (b.round) {
      x.beginPath(); x.moveTo(-4, roofBot); x.quadraticCurveTo(-2, 2, Wp / 2, 1); x.quadraticCurveTo(Wp + 2, 2, Wp + 4, roofBot); x.closePath();
      x.fillStyle = vgrad(x, 0, roofBot, shade(roof, 1.15), shade(roof, 0.85)); x.fill(); x.strokeStyle = ink(roof); x.lineWidth = 0.9; x.stroke();
      for (let k = 1; k < 5; k++) { x.globalAlpha = 0.3; x.beginPath(); x.ellipse(Wp / 2, roofBot, Wp / 2 + 3 - k * 2, roofBot - 2 - k * 4, 0, Math.PI, 0); x.strokeStyle = shade(roof, 0.65); x.lineWidth = 0.6; x.stroke(); x.globalAlpha = 1; }
    } else if (b.kind === 'hut') {
      poly(x, [[-4, roofBot], [Wp / 2, 2], [Wp + 4, roofBot]], vgrad(x, 0, roofBot, '#a89a5a', '#6a6034'), ink('#8a7a4a'), 0.9);
      for (let i = 0; i < 18; i++) line(x, [[Wp / 2 + (i - 9) * 0.6, 4], [Wp / 2 + (i - 9) * (Wp / 18), roofBot]], '#5a5028', 0.4, 0.6);
    } else {
      const crook = b.crooked ? 3 : 0;
      x.save(); if (crook) { x.translate(Wp / 2, roofBot); x.rotate(-0.025); x.translate(-Wp / 2, -roofBot); }
      tiledRoof(x, -4, Wp + 4, 4, roofBot, Math.min(14, Wp * 0.16), roof);
      x.restore();
      if (Wp > 80 && b.kind !== 'station') { rr(x, Wp - 22, 2, 6, 9, 1, '#9a5a4a', ink('#9a5a4a'), 0.6); }
    }
    // signboards (painted text)
    if (b.sign) {
      const fontSize = Math.min(5.2, (Wp - 16) / (b.sign.length * 0.62));
      const sw = Math.min(Wp - 10, b.sign.length * fontSize * 0.62 + 8), sx = Wp / 2 - sw / 2, sy = two ? wallBot - 26 : gTop - 10;
      const sc = b.kind === 'club' ? '#1a0e20' : '#f8f0dc';
      rr(x, sx, sy, sw, fontSize + 3.4, 1.2, sc, ink(b.kind === 'club' ? '#5a2a6a' : '#9a8460'), 0.7);
      x.fillStyle = b.kind === 'club' ? (b.neon || '#ff6ac8') : '#5a3a22';
      x.font = `bold ${fontSize}px "Trebuchet MS", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      if (b.kind === 'club') { x.shadowColor = b.neon; x.shadowBlur = 3; }
      x.fillText(b.sign, Wp / 2, sy + (fontSize + 3.4) / 2 + 0.2);
      x.shadowBlur = 0; x.textBaseline = 'alphabetic';
    }
    if (b.kind === 'hall') { ell(x, Wp / 2, 13, 5.5, 5.5, '#f6f2e6', '#4a3a30', 0.9); line(x, [[Wp / 2, 13], [Wp / 2, 9.4]], '#2a2a2a', 0.6); line(x, [[Wp / 2, 13], [Wp / 2 + 2.6, 13]], '#2a2a2a', 0.6); }
    if (b.kind === 'station') {
      rr(x, -4, base - 3, Wp + 8, 3, 0, '#c8c2b4');
      for (let i = 0; i < 5; i++) rr(x, 2 + i * (Wp - 6) / 4, base - 40, 1.6, 38, 0.4, '#5a6a6a');
    }
    if (b.home) { // little flag of home
      rr(x, Wp - 10, wallBot - 14, 1, 12, 0.3, '#6a6a6a'); poly(x, [[Wp - 9, wallBot - 14], [Wp - 3, wallBot - 12.5], [Wp - 9, wallBot - 11]], '#f4c84a', ink('#f4c84a'), 0.3);
      rr(x, doorX + doorW + 2, gTop + 4, 6, 3.4, 0.6, '#f8f4e8', '#8a7a60', 0.4);
    }
    b._roofTop = 0;
  }
  art.buildingAnchor = (b) => ({ x: b.x * T, y: (b.y + b.h) * T });

  // ================================================================== CHIBI CHARACTERS (vector)
  const CW = 40, CHh = 58, FOOT = 54;
  art.CW = CW; art.CH = CHh;

  function drawChibi(x, L, dir, frame) {
    const cx = CW / 2;
    const t = L.tall || 0, wd = L.wide || 0;
    const fur = L.fur, fur2 = L.fur2 || shade(fur, 1.25), hair = L.hair || fur, eyes = L.eyes || '#2a2230';
    const top = L.top || '#cccccc', bottom = L.bottom || top;
    const acc = L.acc || []; const has = (a) => acc.includes(a);
    const body = L.body || 'normal', head = L.head || 'normal';
    const side = dir === 'left', back = dir === 'up';
    const walk = frame === 0 ? 0 : frame === 1 ? 1 : -1;
    const bob = frame === 0 ? 0 : -0.8;
    // proportions: about three heads tall (the head is drawn at K scale around its centre)
    const K = 0.8;
    const legLen = 9 + t * 0.8, bodyH = 12.5 + t * 1.1, bw = 11 + wd * 2.4;
    const legsTop = FOOT - legLen;
    const bodyTop = legsTop - bodyH + 1.5 + bob;
    const hcy = bodyTop - 6.1, hrx = 9.8, hry = 8.8;
    const headIn = () => { x.save(); x.translate(cx, hcy); x.scale(K, K); x.translate(-cx, -hcy); };
    const hs = L.hairStyle || 'short';
    const O = (c) => ink(c);
    const lw = 0.75;

    // --------- behind: tail, wings, long hair
    const drawTail = () => {
      const tt = L.tail; if (!tt || tt === 'none') return;
      const tip = L.tailTip || fur2;
      const sx = side ? cx + 5 : cx + 6, sy = bodyTop + bodyH - 3;
      const sw = walk * 0.8;
      x.save();
      if (back) { x.translate(cx, sy); } else { x.translate(sx, sy); }
      const mirror = back ? 1 : 1;
      if (tt === 'fox' || tt === 'squirrel') {
        const big = tt === 'squirrel' ? 1.15 : 1;
        x.rotate(back ? 0.1 + sw * 0.05 : -0.55 + sw * 0.06);
        ell(x, back ? 0 : 3.5 * big, back ? 2 : -3 * big, 4.6 * big, 7.5 * big, fur, O(fur), lw, back ? 0 : 0.4);
        ell(x, back ? 0 : 5.8 * big, back ? 7 : -8.5 * big, 2.8 * big, 3 * big, tip, O(fur), lw * 0.8, 0.4);
      } else if (tt === 'cat') {
        x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(back ? 0 : 6, 2, back ? -2 : 7, -7, back ? 1 : 4 + sw, back ? 9 : -11);
        x.strokeStyle = O(fur); x.lineWidth = 3.4; x.stroke(); x.strokeStyle = fur; x.lineWidth = 2.2; x.stroke();
        if (has('stripes')) { x.setLineDash([1, 2]); x.strokeStyle = '#2a1a10'; x.lineWidth = 2.2; x.stroke(); x.setLineDash([]); }
      } else if (tt === 'bear' || tt === 'puff') { ell(x, back ? 0 : 1, back ? -1 : 0, 2.6, 2.4, tt === 'puff' ? tip : fur, O(fur), lw); }
      else if (tt === 'deer') { ell(x, back ? 0 : 1, back ? -1 : -1, 2, 2.6, '#f6f0e6', O(fur), lw); }
      else if (tt === 'pig') { x.beginPath(); x.arc(back ? 0 : 1.5, -1, 1.6, 0, Math.PI * 1.6); x.strokeStyle = fur; x.lineWidth = 1.2; x.stroke(); }
      else if (tt === 'ringed') { for (let i = 0; i < 5; i++) ell(x, back ? 0 : 2 + i * 1.2, back ? 1 + i * 1.6 : -1 - i * 1.5, 2.2, 1.5, i % 2 ? '#2a2a30' : fur, O(fur), 0.5); }
      else if (tt === 'croc' || tt === 'lizard') { const s2 = tt === 'lizard' ? 0.6 : 1; poly(x, back ? [[-3 * s2, -2], [3 * s2, -2], [0, 10 * s2]] : [[0, -3 * s2], [0, 3 * s2], [11 * s2, 5], [12 * s2, 4.2]], fur, O(fur), lw); }
      else if (tt === 'shark') { poly(x, back ? [[-1.5, -2], [1.5, -2], [0, 5], [-4, 8], [4, 8], [0, 5]] : [[0, -2], [0, 2], [6, 1], [9, -4], [8, 4], [6, 1.5]], fur, O(fur), lw); }
      else if (tt === 'beaver') { rr(x, back ? -3.5 : 1, back ? 0 : -2, 7, 9, 3, '#5a3a2a', O('#5a3a2a'), lw); }
      else if (tt === 'dog') { x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(back ? 0 : 6, back ? 2 : -2, back ? 1 : 4, back ? 6 : -7); x.strokeStyle = O(fur); x.lineWidth = 3.2; x.stroke(); x.strokeStyle = fur; x.lineWidth = 2; x.stroke(); }
      else if (tt === 'otter') { poly(x, back ? [[-2, -1], [2, -1], [0, 11]] : [[0, -2.5], [0, 2.5], [10, 3], [11, 2]], fur, O(fur), lw); }
      x.restore();
    };
    const drawWings = () => {
      if (!has('wings')) return;
      const flap = frame === 1 ? -1.2 : 0;
      x.globalAlpha = 0.65;
      ell(x, cx - 8, bodyTop + 1 + flap, 5, 8, '#e0f0ff', '#8aa8c8', 0.5, -0.4); ell(x, cx + 8, bodyTop + 1 + flap, 5, 8, '#e0f0ff', '#8aa8c8', 0.5, 0.4);
      x.globalAlpha = 1;
    };
    if (!back) { drawWings(); drawTail(); } else drawWings();
    if (has('shadowarms') && !back) { for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * 6, bodyTop + 3); x.quadraticCurveTo(cx + s * 14, bodyTop + 4, cx + s * 12, bodyTop + 12); x.strokeStyle = 'rgba(40,24,64,0.8)'; x.lineWidth = 1.6; x.stroke(); } }
    if (!back && body !== 'cloud') {
      headIn();
      if (hs === 'long') rr(x, cx - hrx - 0.8, hcy - 2, hrx * 2 + 1.6, (bodyTop - hcy + 10) / K, 5, hair, O(hair), lw);
      if (hs === 'curly') for (let i = 0; i < 6; i++) ell(x, cx - 9 + i * 3.6, hcy + 9 + (i % 2), 2.6, 3.2, hair, O(hair), 0.5);
      x.restore();
    }

    // --------- legs / lower body
    if (body === 'snake') {
      ell(x, cx, FOOT - 3, 11, 4.4, shade(fur, 0.85), O(fur), lw);
      ell(x, cx + walk, FOOT - 6, 8, 4, fur, O(fur), lw);
      for (let i = -3; i <= 3; i++) line(x, [[cx + i * 2.4, FOOT - 3], [cx + i * 2.4 + 1, FOOT - 1.2]], fur2, 0.6, 0.8);
      rr(x, cx - 4, bodyTop + bodyH - 2, 8, FOOT - bodyTop - bodyH - 2, 3, fur, O(fur), lw);
    } else if (body === 'genie') {
      x.beginPath(); x.moveTo(cx - 6, bodyTop + bodyH - 1);
      x.bezierCurveTo(cx - 6, FOOT - 6, cx + 5 + walk, FOOT - 6, cx + 2 + walk * 2, FOOT + 1);
      x.bezierCurveTo(cx + 7, FOOT - 7, cx + 6, bodyTop + bodyH, cx + 6, bodyTop + bodyH - 1);
      x.closePath(); x.fillStyle = vgrad(x, bodyTop + bodyH, FOOT, top, fur2); x.fill(); x.strokeStyle = O(fur2); x.lineWidth = 0.5; x.stroke();
    } else if (body === 'cloud') {
      [[0, -8, 12, 8], [-8, -10, 6, 6], [8, -10, 6, 6], [0, -14, 9, 7]].forEach(([dx, dy, rx, ry]) => ell(x, cx + dx, FOOT + dy, rx, ry, fur, O('#a8b8d0'), lw));
      for (let i = 0; i < 4; i++) ell(x, cx - 7 + i * 4.6, FOOT - 1 + (frame === i % 3 ? 1.5 : 0), 0.6, 1, '#9ac0e8');
    } else {
      const lc = L.dress ? fur : bottom, shoe = shade(lc === fur ? '#5a4a40' : lc, 0.55);
      const leg = (lx, ang, lift) => {
        x.save(); x.translate(lx, legsTop - 0.5); x.rotate(ang);
        rr(x, -1.75, 0, 3.5, legLen - lift + 0.4, 1.6, lc, O(lc), lw);
        line(x, [[-0.6, 1.5], [-0.6, legLen - lift - 1.5]], shade(lc, 1.15), 0.5, 0.5);
        ell(x, side ? -0.9 : 0, legLen - lift, side ? 2.8 : 2.2, 1.45, shoe, O(shoe), 0.5);
        x.restore();
      };
      if (side) { leg(cx + 0.6, walk * 0.34, 0); leg(cx - 0.6, -walk * 0.34, 0); }
      else { leg(cx - 2.4, 0, walk === 1 ? 1.3 : 0); leg(cx + 2.4, 0, walk === -1 ? 1.3 : 0); }
    }

    // --------- torso
    if (body !== 'cloud') {
      const bx0 = cx - bw / 2;
      const fill = vgrad(x, bodyTop, bodyTop + bodyH, shade(top, 1.06), shade(top, 0.88));
      if (L.dress && body === 'normal') poly(x, [[bx0 + 1.4, bodyTop], [bx0 + bw - 1.4, bodyTop], [bx0 + bw + 1.8, bodyTop + bodyH + 2], [bx0 - 1.8, bodyTop + bodyH + 2]], fill, O(top), lw);
      else {
        const sh = (side ? bw - 3 : bw) / 2, wa = sh - (side ? 0.6 : 1.3);
        x.beginPath(); x.moveTo(cx - sh + 1.6, bodyTop); x.quadraticCurveTo(cx - sh, bodyTop, cx - sh, bodyTop + 2.6);
        x.lineTo(cx - wa, bodyTop + bodyH - 0.8); x.quadraticCurveTo(cx - wa, bodyTop + bodyH, cx - wa + 1, bodyTop + bodyH);
        x.lineTo(cx + wa - 1, bodyTop + bodyH); x.quadraticCurveTo(cx + wa, bodyTop + bodyH, cx + wa, bodyTop + bodyH - 0.8);
        x.lineTo(cx + sh, bodyTop + 2.6); x.quadraticCurveTo(cx + sh, bodyTop, cx + sh - 1.6, bodyTop); x.closePath();
        x.fillStyle = fill; x.fill(); x.strokeStyle = O(top); x.lineWidth = lw; x.stroke();
        if (body === 'normal' && !L.dress && !has('overalls') && !has('labcoat')) { rr(x, cx - wa + 0.3, bodyTop + bodyH - 2, (wa - 0.3) * 2, 2.1, 0.6, bottom, O(bottom), 0.45); }
        if (!back) line(x, [[cx - sh + 1.4, bodyTop + 3.5], [cx - wa + 1, bodyTop + bodyH - 2.6]], shade(top, 1.18), 0.5, 0.5);
      }
      if (!back && !side && body === 'normal' && !has('labcoat') && !has('overalls') && !has('tie')) ell(x, cx, bodyTop + 1, 2.2, 1.4, fur2);
      if (has('labcoat')) {
        if (back) rr(x, bx0 - 1, bodyTop, bw + 2, bodyH + 3, 3, '#f4f4f0', O('#e0e0dc'), lw);
        else { poly(x, [[bx0 - 1, bodyTop], [cx - 1.5, bodyTop], [cx - 2, bodyTop + bodyH + 3], [bx0 - 1.5, bodyTop + bodyH + 3]], '#f6f6f2', O('#e0e0dc'), lw); poly(x, [[cx + 1.5, bodyTop], [bx0 + bw + 1, bodyTop], [bx0 + bw + 1.5, bodyTop + bodyH + 3], [cx + 2, bodyTop + bodyH + 3]], '#ecece8', O('#e0e0dc'), lw); ell(x, cx + 4, bodyTop + 4, 0.6, 1.6, '#3a6ac8'); }
      }
      if (has('apron') && !back) {
        const ac = L.apron || '#ffffff';
        rr(x, cx - 4.2, bodyTop + 1.5, 8.4, bodyH + 1.5, 2, ac, O(ac), lw * 0.8);
        line(x, [[cx - 3.6, bodyTop + 2], [cx - 5, bodyTop - 0.5]], ac, 0.9); line(x, [[cx + 3.6, bodyTop + 2], [cx + 5, bodyTop - 0.5]], ac, 0.9);
        if (ac === '#f6d553') { [[-2, 4], [1.6, 6.5], [-1, 8.5], [2.2, 3]].forEach(([a, b]) => { ell(x, cx + a, bodyTop + b, 1.1, 1.1, '#f4a82a'); ell(x, cx + a, bodyTop + b, 0.45, 0.45, '#6a3a1a'); }); }
        rr(x, cx - 2.6, bodyTop + 7, 5.2, 2.6, 0.8, shade(ac, 0.9));
      }
      if (has('overalls') && !back) { rr(x, cx - 3.8, bodyTop + 2.5, 7.6, bodyH - 1, 1.5, bottom, O(bottom), lw * 0.8); line(x, [[cx - 3, bodyTop + 3], [cx - 3.5, bodyTop]], bottom, 1); line(x, [[cx + 3, bodyTop + 3], [cx + 3.5, bodyTop]], bottom, 1); ell(x, cx - 2.6, bodyTop + 3.4, 0.6, 0.6, '#f4d03a'); ell(x, cx + 2.6, bodyTop + 3.4, 0.6, 0.6, '#f4d03a'); }
      if (has('tie') && !back) { poly(x, [[cx - 1.4, bodyTop + 0.5], [cx + 1.4, bodyTop + 0.5], [cx + 1.2, bodyTop + 6], [cx, bodyTop + 7.5], [cx - 1.2, bodyTop + 6]], '#c83a3a', O('#c83a3a'), 0.5); poly(x, [[cx - 4, bodyTop], [cx - 1.4, bodyTop + 2.5], [cx - 1.4, bodyTop]], '#f4f4f4'); poly(x, [[cx + 4, bodyTop], [cx + 1.4, bodyTop + 2.5], [cx + 1.4, bodyTop]], '#f4f4f4'); }
      if (has('whistle') && !back) { line(x, [[cx - 3, bodyTop + 0.5], [cx, bodyTop + 4]], '#f4f4f4', 0.5); rr(x, cx - 0.5, bodyTop + 3.6, 2.6, 1.8, 0.6, '#f4d03a', O('#f4d03a'), 0.4); }
      if (has('scarf')) { rr(x, cx - bw / 2 - 0.5, bodyTop - 1, bw + 1, 3, 1.4, L.scarf || '#d84a4a', O(L.scarf || '#d84a4a'), 0.5); }
      if (has('patches') && !back) { rr(x, bx0 + 1.2, bodyTop + 2, 3.4, 3.4, 0.6, '#e83a6a'); rr(x, bx0 + bw - 4.4, bodyTop + 5.5, 3.2, 2.8, 0.6, '#3ad06a'); ell(x, cx, bodyTop + 3, 0.7, 0.7, '#ffffff'); ell(x, cx, bodyTop + 6.5, 0.7, 0.7, '#ffffff'); }
      if (has('stripes')) for (let i = 0; i < 3; i++) { line(x, [[bx0 + 0.3, bodyTop + 2 + i * 3], [bx0 + 2.4, bodyTop + 3 + i * 3]], '#2a1a10', 0.7); line(x, [[bx0 + bw - 0.3, bodyTop + 2 + i * 3], [bx0 + bw - 2.4, bodyTop + 3 + i * 3]], '#2a1a10', 0.7); }
      if (has('bag')) rr(x, bx0 + bw - 1, bodyTop + 4, 5, 5, 1.2, '#8a5a34', O('#8a5a34'), 0.5);
      if (has('gold') && !back) line(x, [[bx0 + 1, bodyTop + 0.5], [bx0 + bw - 1, bodyTop + 0.5]], '#f4c84a', 1);
      if (has('shell')) ell(x, cx, bodyTop + bodyH / 2, bw / 2 + 2, bodyH / 2 + 1.5, back ? '#6a8a4a' : 'rgba(0,0,0,0)', back ? O('#6a8a4a') : null, lw);
      if (has('pandapatch') && back) { }
      // arms
      const sleeve = has('labcoat') ? '#f4f4f0' : top;
      const arm = (sx, swing, dirX) => {
        const hand = has('pandapatch') ? '#1e1e22' : fur;
        x.save(); x.translate(sx, bodyTop + 1.4); x.rotate(dirX * 0.1 + swing * 0.38);
        rr(x, -1.6, -0.6, 3.2, 6.2, 1.5, sleeve, O(sleeve), lw);
        rr(x, -1.3, 5, 2.6, 4.2, 1.3, hand, O(hand), lw);
        ell(x, 0, 9.4, 1.6, 1.5, hand, O(hand), lw * 0.8);
        if (has('gold')) line(x, [[-1.4, 5.8], [1.4, 5.8]], '#f4c84a', 0.8);
        x.restore();
      };
      if (side) arm(cx - 0.5, walk * 0.8, 0);
      else { arm(bx0 + 0.4, walk, 1); arm(bx0 + bw - 0.4, -walk, -1); }
      if (has('phone') && !back) rr(x, side ? cx - 3 : bx0 + bw + 1, bodyTop + 7, 2.4, 3.4, 0.5, '#1a1a1e', '#000', 0.3);
      if (has('scissors') && !back && !side) { line(x, [[bx0 + bw + 2, bodyTop + 9], [bx0 + bw + 4.5, bodyTop + 6.5]], '#a8a8b0', 0.6); line(x, [[bx0 + bw + 2.6, bodyTop + 6.5], [bx0 + bw + 4, bodyTop + 9]], '#a8a8b0', 0.6); }
    }
    if (back) drawTail();

    // --------- head
    let headCol = fur;
    if (head === 'burlap') headCol = '#c8a874';
    if (head === 'void') headCol = '#241c34';
    if (has('clownpaint')) headCol = '#faf6f2';

    const ear = (mirror, front) => {
      const e = L.ears; if (!e || e === 'none') return;
      const ec = L.earColor || fur, ei = L.earIn || fur2, tip = L.earTip;
      const s = mirror ? 1 : -1;
      x.save(); x.translate(cx, hcy); x.scale(s, 1);
      if (side && mirror) x.translate(-2, 0);
      if (e === 'fox' || e === 'cat' || e === 'wolf') {
        const hgt = e === 'cat' ? 6.5 : 9, wid = e === 'cat' ? 6 : 6.4;
        x.beginPath(); x.moveTo(2.6, -hry + 3); x.quadraticCurveTo(4, -hry - hgt * 0.5, 5.8, -hry - hgt + 2.4); x.quadraticCurveTo(6.4, -hry - hgt + 1.2, 6.9, -hry - hgt + 2.6); x.quadraticCurveTo(8.6, -hry - 1, 2.6 + wid, -hry + 4.2); x.closePath();
        x.fillStyle = ec; x.fill(); x.strokeStyle = O(ec); x.lineWidth = lw; x.stroke();
        if (front) { x.beginPath(); x.moveTo(3.8, -hry + 3); x.quadraticCurveTo(5, -hry - hgt * 0.35, 6.2, -hry - hgt + 4.5); x.quadraticCurveTo(7.6, -hry - 1, 7.6, -hry + 3.6); x.closePath(); x.fillStyle = ei; x.fill(); }
        if (tip) { x.save(); x.beginPath(); x.moveTo(2.6, -hry + 3); x.quadraticCurveTo(4, -hry - hgt * 0.5, 5.8, -hry - hgt + 2.4); x.quadraticCurveTo(6.4, -hry - hgt + 1.2, 6.9, -hry - hgt + 2.6); x.quadraticCurveTo(8.6, -hry - 1, 2.6 + wid, -hry + 4.2); x.closePath(); x.clip(); rr(x, 0, -hry - hgt - 2, 12, hgt * 0.42, 0, tip); x.restore(); }
      } else if (e === 'bear' || e === 'round' || e === 'mouse') {
        const r = e === 'mouse' ? 4.2 : e === 'round' ? 2.9 : 3.2;
        ell(x, 6.4, -hry + 1.6, r, r, ec, O(ec), lw); if (front) ell(x, 6.4, -hry + 1.9, r * 0.55, r * 0.55, ei);
      } else if (e === 'rabbit') {
        x.save(); x.translate(3.6, -hry - 4); x.rotate(0.12 + (walk ? 0.05 * walk : 0));
        ell(x, 0, -2.5, 2.3, 7.5, ec, O(ec), lw); if (front) ell(x, 0, -2, 1.1, 5.6, ei); x.restore();
      } else if (e === 'deer' || e === 'goat') {
        x.save(); x.translate(hrx - 0.5, -2); x.rotate(e === 'goat' ? 0.7 : 0.35); ell(x, 2.6, 0, 3.4, 1.6, ec, O(ec), lw); if (front) ell(x, 2.6, 0, 2, 0.8, ei); x.restore();
      } else if (e === 'pig') {
        x.beginPath(); x.moveTo(3.4, -hry + 2.5); x.lineTo(8.6, -hry - 2.6); x.lineTo(9, -hry + 4); x.closePath(); x.fillStyle = ec; x.fill(); x.strokeStyle = O(ec); x.lineWidth = lw; x.stroke(); if (front) { x.beginPath(); x.moveTo(5, -hry + 2.2); x.lineTo(8, -hry - 0.6); x.lineTo(8.2, -hry + 3); x.closePath(); x.fillStyle = ei; x.fill(); }
      } else if (e === 'dog') {
        x.save(); x.translate(hrx - 1.2, -hry + 4); x.rotate(0.25); ell(x, 0, 3.5, 2.6, 5, ec, O(ec), lw); x.restore();
      } else if (e === 'tufts') {
        poly(x, [[4, -hry + 2], [6.5, -hry - 3.6], [7.6, -hry + 3]], ec, O(ec), lw);
      }
      x.restore();
    };

    // hair behind head
    const hairBack = () => {
      if (hs === 'buns') { ell(x, cx - 7.6, hcy - 6.6, 3.4, 3.4, hair, O(hair), lw); ell(x, cx + 7.6, hcy - 6.6, 3.4, 3.4, hair, O(hair), lw); }
      if (hs === 'bun') { ell(x, cx, hcy - hry - 1.4, 3.8, 3.4, hair, O(hair), lw); if (has('pencil')) { line(x, [[cx - 6, hcy - hry - 2.4], [cx + 6, hcy - hry - 0.6]], '#f4d03a', 1); line(x, [[cx + 5.5, hcy - hry - 0.7], [cx + 6.6, hcy - hry - 0.5]], '#2a2a2a', 1); } }
      if (hs === 'pony' && (back || side)) { x.save(); x.translate(side ? cx + hrx - 1.5 : cx, hcy - 2); x.rotate(side ? 0.3 + walk * 0.08 : walk * 0.06); ell(x, 0, 6, 2.6, 7, hair, O(hair), lw); x.restore(); }
      if (back && hs === 'long') rr(x, cx - hrx - 0.8, hcy - 2, hrx * 2 + 1.6, (bodyTop - hcy + 10) / K, 5, hair, O(hair), lw);
      if (back && hs === 'curly') for (let i = 0; i < 6; i++) ell(x, cx - 9 + i * 3.6, hcy + 9 + (i % 2), 2.6, 3.2, hair, O(hair), 0.5);
      if (hs === 'wild' || hs === 'straw') { for (let i = 0; i < 9; i++) { const a = -Math.PI + (i / 8) * Math.PI; const r = hrx + 1.8; poly(x, [[cx + Math.cos(a - 0.18) * (r - 3), hcy + Math.sin(a - 0.18) * (r - 3)], [cx + Math.cos(a) * (r + 1.8), hcy + Math.sin(a) * (r + 1.8)], [cx + Math.cos(a + 0.18) * (r - 3), hcy + Math.sin(a + 0.18) * (r - 3)]], hair, O(hair), 0.5); } }
      if (hs === 'cloud' || hs === 'wool') { for (let i = 0; i < 8; i++) { const a = -Math.PI * 1.05 + (i / 7) * Math.PI * 1.1; ell(x, cx + Math.cos(a) * (hrx + 0.6), hcy + Math.sin(a) * (hry + 0.4), 3, 2.8, hair, O(hair), 0.5); } }
      if (hs === 'flame') { for (let i = 0; i < 7; i++) { const fx = cx - 9 + i * 3; poly(x, [[fx - 1.6, hcy - hry + 3], [fx + (i % 2 ? 0.8 : -0.6), hcy - hry - 5 - (i % 3) * 1.6], [fx + 1.8, hcy - hry + 3]], i % 2 ? '#ffd23a' : hair, O(hair), 0.4); } }
    };

    headIn();
    ear(false, false); ear(true, false);
    hairBack();

    if (head === 'cube') {
      rr(x, cx - 9, hcy - 9, 18, 17, 1.2, vgrad(x, hcy - 9, hcy + 8, '#e4ddd0', '#b8b0a0'), O('#b8b0a0'), lw);
      poly(x, [[cx - 9, hcy - 9], [cx - 6, hcy - 12], [cx + 12, hcy - 12], [cx + 9, hcy - 9]], '#f0eadf', O('#b8b0a0'), lw);
      poly(x, [[cx + 9, hcy - 9], [cx + 12, hcy - 12], [cx + 12, hcy + 5], [cx + 9, hcy + 8]], '#a8a090', O('#b8b0a0'), lw);
    } else {
      ell(x, cx, hcy, hrx, hry, rgrad(x, cx, hcy, hrx, shade(headCol, 1.1), shade(headCol, 0.92)), O(headCol), lw);
      if (head === 'void') { for (let i = 0; i < 6; i++) ell(x, cx - 6 + i * 2.4, hcy - 4 + (i % 2) * 2, 0.4, 0.4, '#5a4a8a'); }
      if (head === 'burlap') { for (let i = 0; i < 5; i++) line(x, [[cx - 7 + i * 3.4, hcy - 6], [cx - 6.5 + i * 3.4, hcy + 6]], '#a88a5a', 0.3, 0.7); }
    }

    // face
    if (!back && head !== 'cube') {
      const fx = side ? -3.6 : 0;
      const ey = hcy + 1;
      if (head === 'burlap') {
        ell(x, cx - 3.8 + fx, ey - 0.5, 1.6, 1.6, '#1a1410'); if (!side) ell(x, cx + 3.8, ey - 0.5, 1.6, 1.6, '#1a1410');
        x.beginPath(); x.moveTo(cx - 5 + fx, hcy + 4.4); x.quadraticCurveTo(cx + fx * 0.5, hcy + 7.4, cx + 5 + fx, hcy + 4.4); x.strokeStyle = '#3a2a1a'; x.lineWidth = 0.6; x.stroke();
        for (let i = 0; i < 6; i++) line(x, [[cx - 4 + i * 1.6 + fx, hcy + 4.8 + Math.sin(i / 5 * Math.PI) * 1.4], [cx - 4 + i * 1.6 + fx, hcy + 6.6 + Math.sin(i / 5 * Math.PI) * 1.4]], '#3a2a1a', 0.4);
      } else if (head === 'void') {
        x.beginPath(); x.moveTo(cx - 3 + fx, hcy + 3.6); x.quadraticCurveTo(cx + fx * 0.5, hcy + 6, cx + 3 + fx, hcy + 3.6); x.strokeStyle = '#b89ae8'; x.lineWidth = 0.8; x.stroke();
      } else {
        const special = has('beak') || has('snout') || has('clownpaint') || has('snoutpink');
        if (!special) {
          if (side) ell(x, cx - 7.4, hcy + 3.4, 3.8, 2.8, fur2, O(fur2), lw * 0.7);
          else ell(x, cx, hcy + 3.8, 4.4, 3, fur2);
          ell(x, side ? cx - 10.6 : cx, side ? hcy + 2.4 : hcy + 2.4, 1.4, 1, '#2a1e1e');
          if (!side) { x.beginPath(); x.moveTo(cx - 1.6, hcy + 4.2); x.quadraticCurveTo(cx - 0.8, hcy + 5.2, cx, hcy + 4.2); x.quadraticCurveTo(cx + 0.8, hcy + 5.2, cx + 1.6, hcy + 4.2); x.strokeStyle = '#4a2a2a'; x.lineWidth = 0.5; x.stroke(); }
        }
        if (has('snout')) { ell(x, side ? cx - 9.4 : cx, hcy + 3.6, 3, 2.2, '#f28ea0', O('#f28ea0'), 0.5); if (!side) { ell(x, cx - 1, hcy + 3.6, 0.5, 0.7, '#a04a5a'); ell(x, cx + 1, hcy + 3.6, 0.5, 0.7, '#a04a5a'); } }
        if (has('snoutpink')) ell(x, side ? cx - 10 : cx, hcy + 3.2, 2.2, 1.6, '#f0a0a8', O('#f0a0a8'), 0.5);
        if (has('beak')) { poly(x, side ? [[cx - 8, hcy + 1.8], [cx - 12.6, hcy + 3.6], [cx - 8, hcy + 4.8]] : [[cx - 2.2, hcy + 2.4], [cx + 2.2, hcy + 2.4], [cx, hcy + 5.4]], '#f4a02a', O('#f4a02a'), 0.5); }
        if (has('teeth')) { for (let i = 0; i < 4; i++) poly(x, side ? [[cx - 9 + i * 1.3, hcy + 5], [cx - 8.4 + i * 1.3, hcy + 6.4], [cx - 7.8 + i * 1.3, hcy + 5]] : [[cx - 2.6 + i * 1.4, hcy + 5.2], [cx - 1.9 + i * 1.4, hcy + 6.6], [cx - 1.2 + i * 1.4, hcy + 5.2]], '#ffffff', '#8a8a8a', 0.2); }
        if (has('mask')) { x.save(); x.beginPath(); x.ellipse(cx, hcy, hrx, hry, 0, 0, Math.PI * 2); x.clip(); rr(x, cx - hrx + (side ? -2 : 0), ey - 2.8, hrx * 2, 4.8, 2.2, 'rgba(36,36,42,0.92)'); x.restore(); }
        if (has('pandapatch')) { ell(x, cx - 3.9 + fx, ey + 0.4, 2.8, 2.4, '#1e1e22', null, 0, 0.4); if (!side) ell(x, cx + 3.9, ey + 0.4, 2.8, 2.4, '#1e1e22', null, 0, -0.4); }
        if (has('clownpaint')) { poly(x, [[cx - 3.9 + fx, ey - 4.4], [cx - 2.6 + fx, ey - 2.4], [cx - 3.9 + fx, ey - 0.4], [cx - 5.2 + fx, ey - 2.4]], '#3a6ae8'); if (!side) poly(x, [[cx + 3.9, ey - 4.4], [cx + 5.2, ey - 2.4], [cx + 3.9, ey - 0.4], [cx + 2.6, ey - 2.4]], '#3a6ae8'); }
        const eye = (ex) => {
          if (has('buggyeyes')) { ell(x, ex, ey, 2.6, 2.6, '#d3242a', '#6a0a0a', 0.5); for (let k = 0; k < 4; k++) ell(x, ex - 1 + (k % 2) * 1.6, ey - 1 + Math.floor(k / 2) * 1.6, 0.5, 0.5, '#ff7a7a'); return; }
          if (has('frogeyes')) { ell(x, ex, hcy - hry + 2, 3, 2.6, fur, O(fur), lw); }
          if (L.sleepy) { x.beginPath(); x.arc(ex, ey - 0.4, 1.7, 0.15 * Math.PI, 0.85 * Math.PI); x.strokeStyle = '#2a2026'; x.lineWidth = 0.75; x.stroke(); return; }
          ell(x, ex, ey, 1.55, 2.15, shade(eyes, 0.55));
          ell(x, ex, ey + 0.7, 1.25, 1.3, eyes);
          ell(x, ex - 0.5, ey - 0.8, 0.62, 0.62, '#ffffff'); ell(x, ex + 0.55, ey + 1, 0.3, 0.3, '#ffffff');
          if (L.lashes) line(x, [[ex - 1.7, ey - 1.9], [ex + 1.4, ey - 2.4]], '#2a2026', 0.55);
        };
        eye(cx - 3.9 + fx); if (!side) eye(cx + 3.9);
        if (has('glasses')) { const gc = '#4a4a5a'; ell(x, cx - 3.9 + fx, ey, 2.6, 2.4, 'rgba(220,240,255,0.25)', gc, 0.55); if (!side) { ell(x, cx + 3.9, ey, 2.6, 2.4, 'rgba(220,240,255,0.25)', gc, 0.55); line(x, [[cx - 1.3, ey - 0.4], [cx + 1.3, ey - 0.4]], gc, 0.5); } }
        if (has('heartglasses')) { const H = (hx) => { x.beginPath(); x.moveTo(hx, ey + 2.4); x.bezierCurveTo(hx - 3.6, ey - 0.4, hx - 1.8, ey - 3, hx, ey - 1.2); x.bezierCurveTo(hx + 1.8, ey - 3, hx + 3.6, ey - 0.4, hx, ey + 2.4); x.fillStyle = '#ff5ab0'; x.fill(); x.strokeStyle = '#a02a6a'; x.lineWidth = 0.4; x.stroke(); }; H(cx - 3.9 + fx); if (!side) { H(cx + 3.9); line(x, [[cx - 1.4, ey - 0.6], [cx + 1.4, ey - 0.6]], '#ff5ab0', 0.6); } }
        if (has('rednose')) ell(x, side ? cx - 10 : cx, hcy + 2.8, 1.6, 1.5, '#e8282a', '#8a1010', 0.4);
        if (has('clownpaint') && !side) { x.beginPath(); x.moveTo(cx - 2.6, hcy + 5); x.quadraticCurveTo(cx, hcy + 7.4, cx + 2.6, hcy + 5); x.strokeStyle = '#e8282a'; x.lineWidth = 1; x.stroke(); }
        if (!side && !has('mask') && !has('pandapatch')) { x.globalAlpha = 0.4; ell(x, cx - 6.4, hcy + 3.6, 1.9, 1.1, '#ff6a8a'); ell(x, cx + 6.4, hcy + 3.6, 1.9, 1.1, '#ff6a8a'); x.globalAlpha = 1; }
        if (has('stripes')) { line(x, [[cx - hrx + 0.6, hcy - 1], [cx - hrx + 2.8, hcy]], '#2a1a10', 0.8); line(x, [[cx - hrx + 0.8, hcy + 1.6], [cx - hrx + 2.6, hcy + 2.2]], '#2a1a10', 0.7); if (!side) { line(x, [[cx + hrx - 0.6, hcy - 1], [cx + hrx - 2.8, hcy]], '#2a1a10', 0.8); line(x, [[cx + hrx - 0.8, hcy + 1.6], [cx + hrx - 2.6, hcy + 2.2]], '#2a1a10', 0.7); } line(x, [[cx - 1, hcy - hry + 1], [cx, hcy - hry + 3.5]], '#2a1a10', 0.8); }
      }
    }
    if (back && head !== 'cube' && head !== 'void' && hs !== 'none') {
      x.save(); x.beginPath(); x.ellipse(cx, hcy, hrx, hry, 0, 0, Math.PI * 2); x.clip();
      rr(x, cx - hrx, hcy - hry, hrx * 2, hry * 1.6, 0, hair); x.restore();
      ell(x, cx, hcy, hrx, hry, null, O(headCol), lw);
      if (has('stripes')) { line(x, [[cx - 3, hcy - 6], [cx - 3, hcy - 1]], '#2a1a10', 0.8); line(x, [[cx + 3, hcy - 6], [cx + 3, hcy - 1]], '#2a1a10', 0.8); }
    }
    // bangs
    if (!back && hs !== 'none' && head === 'normal') {
      const deep = ['curly', 'wild', 'messy', 'wool', 'cloud'].includes(hs) ? 4.2 : 3.2;
      x.save(); x.beginPath(); x.ellipse(cx, hcy, hrx + 0.4, hry + 0.4, 0, 0, Math.PI * 2); x.clip();
      x.beginPath(); x.moveTo(cx - hrx - 1, hcy - 1);
      x.lineTo(cx - hrx - 1, hcy - hry - 2); x.lineTo(cx + hrx + 1, hcy - hry - 2); x.lineTo(cx + hrx + 1, hcy - 1);
      const n = 5, x0 = cx - hrx - 1 + (side ? -2 : 0), x1 = cx + hrx + 1;
      for (let i = n; i >= 1; i--) { const ax = x0 + ((x1 - x0) * i) / n, bx2 = x0 + ((x1 - x0) * (i - 1)) / n; x.quadraticCurveTo((ax + bx2) / 2, hcy - hry + deep + 2.6 + (i % 2) * 1.2, bx2, hcy - hry + deep - 0.6); }
      x.closePath(); x.fillStyle = vgrad(x, hcy - hry, hcy - hry + deep + 3, shade(hair, 1.12), hair); x.fill();
      x.restore();
      x.beginPath(); x.ellipse(cx, hcy, hrx, hry, 0, Math.PI * 1.05, Math.PI * 1.95); x.strokeStyle = O(hair); x.lineWidth = lw; x.stroke();
      x.globalAlpha = 0.45; x.beginPath(); x.arc(cx - 2, hcy - 2, hrx - 2.6, Math.PI * 1.2, Math.PI * 1.5); x.strokeStyle = shade(hair, 1.5); x.lineWidth = 1.1; x.stroke(); x.globalAlpha = 1;
      if (hs === 'long' || hs === 'curly') { rr(x, cx - hrx - 1, hcy - 3, 3, 12, 1.5, hair, O(hair), 0.5); if (!side) rr(x, cx + hrx - 2, hcy - 3, 3, 12, 1.5, hair, O(hair), 0.5); }
    }
    if (hs === 'straw' && !back) for (let i = 0; i < 8; i++) line(x, [[cx - 9 + i * 2.5, hcy + 5], [cx - 10 + i * 2.6, hcy + 9 + (i % 3)]], '#e0c070', 0.8);

    ear(false, true); ear(true, true);

    // head accessories
    if (has('antlers')) {
      const ant = (s) => { x.save(); x.translate(cx + s * 4.6, hcy - hry + 1.5); x.scale(s, 1); x.beginPath(); x.moveTo(0, 0); x.lineTo(1.4, -6); x.lineTo(4.2, -9.4); x.moveTo(1.4, -6); x.lineTo(-1.2, -9.4); x.moveTo(0.8, -3.4); x.lineTo(3.8, -4.6); x.strokeStyle = '#7a5a3a'; x.lineWidth = 1.2; x.stroke(); x.restore(); };
      ant(-1); ant(1);
      if (has('fairylights')) [['#ff6ad0', -6.5, -6], ['#6af0ff', -8, -9.5], ['#fff06a', 6.4, -7], ['#a0ff6a', 9, -9.6], ['#ff9a4a', 3.2, -4]].forEach(([c, a, b2]) => ell(x, cx + a, hcy - hry + b2, 0.7, 0.7, c));
    }
    if (has('horns')) { for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * 3.6, hcy - hry + 1.6); x.quadraticCurveTo(cx + s * 6, hcy - hry - 4, cx + s * 8.4, hcy - hry - 2.6); x.strokeStyle = '#d8ccb4'; x.lineWidth = 1.4; x.stroke(); } }
    if (has('comb')) { [[-2.2, 0.4], [0, -0.6], [2.2, 0.4]].forEach(([dx, dy]) => ell(x, cx + dx, hcy - hry - 1 + dy, 1.7, 2.2, '#e8282a', O('#e8282a'), 0.5)); }
    if (has('antennae')) { for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * 2.6, hcy - hry + 1); x.quadraticCurveTo(cx + s * 4, hcy - hry - 6, cx + s * 7, hcy - hry - 7); x.strokeStyle = '#3a3440'; x.lineWidth = 0.6; x.stroke(); ell(x, cx + s * 7, hcy - hry - 7, 0.8, 0.8, '#3a3440'); } }
    if (has('fin')) poly(x, [[cx - 2 + (side ? 3 : 0), hcy - hry + 1.5], [cx + 1 + (side ? 3 : 0), hcy - hry - 5.5], [cx + 3.4 + (side ? 3 : 0), hcy - hry + 1.6]], shade(fur, 0.92), O(fur), lw);
    if (has('headset')) { x.beginPath(); x.ellipse(cx, hcy, hrx + 0.4, hry + 0.4, 0, Math.PI * 1.05, Math.PI * 1.95); x.strokeStyle = '#2a2a30'; x.lineWidth = 1.2; x.stroke(); rr(x, cx - hrx - 1.4, hcy - 1, 2.6, 4, 1, '#3a3a40'); if (!side) rr(x, cx + hrx - 1.2, hcy - 1, 2.6, 4, 1, '#3a3a40'); }
    if (has('strawhat')) { ell(x, cx, hcy - hry + 2.4, 13.5, 2.8, '#e4c674', O('#e4c674'), lw); rr(x, cx - 6.4, hcy - hry - 4.4, 12.8, 6.8, 3, '#e8cc7a', O('#e4c674'), lw); rr(x, cx - 6.4, hcy - hry + 0.4, 12.8, 1.4, 0, '#8a3a3a'); }
    if (has('postcap') || has('cap')) { const cc = has('postcap') ? '#3a5a9a' : (L.capColor || '#3a5a9a'); rr(x, cx - 7.6, hcy - hry - 2, 15.2, 6, 3, cc, O(cc), lw); if (!back) ell(x, side ? cx - 8 : cx, hcy - hry + 3.6, side ? 5 : 7.6, 1.4, shade(cc, 0.75), O(cc), 0.5); ell(x, cx, hcy - hry - 0.4, 1, 1, '#f4d03a'); }
    if (has('rays')) { for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; line(x, [[cx + Math.cos(a) * (hrx + 2), hcy + Math.sin(a) * (hry + 2)], [cx + Math.cos(a) * (hrx + 5), hcy + Math.sin(a) * (hry + 5)]], '#ffd23a', 1, 0.9); } }
    if (has('flowercrown')) { for (let i = 0; i < 6; i++) ell(x, cx - 7 + i * 2.8, hcy - hry + 1.6 - Math.sin((i / 5) * Math.PI) * 1.6, 1.2, 1.2, ['#f07ac0', '#f4d03a', '#ffffff'][i % 3], '#8a5a6a', 0.3); }
    x.restore();
  }

  art.chibiFrame = function (ch, dir, frame) {
    const d = dir === 'right' ? 'left' : dir;
    const S = Math.min(art.S, 5);
    const k = ch.id + '|' + d + '|' + frame + '@' + S + (ch._v || '');
    let c = chrCache.get(k);
    if (c) return c;
    const [cv, x] = mk(CW, CHh, S);
    drawChibi(x, Object.assign({ sp: ch.species }, ch.look), d, frame);
    chrCache.set(k, cv);
    return cv;
  };
  art.chibiScale = (ch) => (ch.look && ch.look.size) || 1;
  art.CHIBI_FOOT = FOOT;

  art.playerLook = function (p) {
    return {
      fur: p.skin || '#f2c9a0', fur2: shade(p.skin || '#f2c9a0', 1.06), hair: p.hair || '#5a3a2a', hairStyle: p.hairStyle || 'short',
      ears: 'none', tail: 'none', eyes: p.eyes || '#3a4a8a', top: p.top || '#4a7ad8', bottom: p.bottom || '#3a3a5a', acc: (p.acc || []).concat(['human']), lashes: !!p.lashes,
    };
  };

  // big crisp portrait of a chibi (for villagers without artwork)
  const portraitCache = {};
  art.portraitURL = function (ch) {
    if (portraitCache[ch.id]) return portraitCache[ch.id];
    const S = 12;
    const [c, x] = mk(CW, CHh, S);
    drawChibi(x, Object.assign({ sp: ch.species }, ch.look), 'down', 0);
    portraitCache[ch.id] = c.toDataURL('image/png');
    return portraitCache[ch.id];
  };
  art.drawChibiTo = function (ctx, look, dir, frame) { drawChibi(ctx, look, dir, frame); };

  // ================================================================== EMOTES (vector, drawn live)
  art.drawEmote = function (ctx, name, cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ell(ctx, 0, 0, 6.5, 6, '#fffaf0', '#3a2a24', 0.8);
    poly(ctx, [[-1.5, 5.4], [0, 8.4], [1.6, 5.2]], '#fffaf0'); line(ctx, [[-1.5, 5.6], [0, 8.4], [1.6, 5.4]], '#3a2a24', 0.8);
    if (name === 'heart') { ctx.beginPath(); ctx.moveTo(0, 3.2); ctx.bezierCurveTo(-5, -0.5, -2.5, -4.4, 0, -1.8); ctx.bezierCurveTo(2.5, -4.4, 5, -0.5, 0, 3.2); ctx.fillStyle = '#ff5a8a'; ctx.fill(); }
    else if (name === '!') { rr(ctx, -0.9, -4, 1.8, 5.2, 0.9, '#f2a21a'); ell(ctx, 0, 3, 1, 1, '#f2a21a'); }
    else if (name === '?') { ctx.beginPath(); ctx.arc(0, -1.6, 2.2, Math.PI, Math.PI * 2.4); ctx.strokeStyle = '#3a8ad8'; ctx.lineWidth = 1.4; ctx.stroke(); ell(ctx, 0.4, 3.2, 0.9, 0.9, '#3a8ad8'); }
    else if (name === 'anger') { ['#ff4a3a'].forEach((c) => { line(ctx, [[-3, -3], [-1, -1]], c, 1.3); line(ctx, [[3, -3], [1, -1]], c, 1.3); line(ctx, [[-3, 3], [-1, 1]], c, 1.3); line(ctx, [[3, 3], [1, 1]], c, 1.3); }); }
    else if (name === 'note') { line(ctx, [[1.4, 2.6], [1.4, -3.8], [3.6, -2.6]], '#8a5ae8', 1.1); ell(ctx, 0, 2.8, 1.6, 1.2, '#8a5ae8'); }
    else if (name === 'zzz') { ctx.fillStyle = '#6a8ac8'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('z', -1.2, 2.4); ctx.font = 'bold 4.5px sans-serif'; ctx.fillText('z', 2.6, -1.4); }
    else if (name === 'sweat') { ctx.beginPath(); ctx.moveTo(0, -3.6); ctx.quadraticCurveTo(3, 1, 0, 3); ctx.quadraticCurveTo(-3, 1, 0, -3.6); ctx.fillStyle = '#6ac0f0'; ctx.fill(); }
    else { [-2.6, 0, 2.6].forEach((dx) => ell(ctx, dx, 0, 0.9, 0.9, '#3a2a24')); }
    ctx.restore();
  };
})(window.MH);
