// Mirehollow — procedural pixel art: ground, props, buildings, chibi villagers, portraits, emotes.
'use strict';
(function (MH) {
  const T = MH.TILE;
  const art = (MH.art = { cache: {} });
  const shade = MH.shade;

  const mk = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return [c, x];
  };
  art.mk = mk;
  const R = (x, cx, cy, w, h, col) => { x.fillStyle = col; x.fillRect(cx, cy, w, h); };
  // shorthand bound later
  let C = null;
  const px = (x, y, col) => { C.fillStyle = col; C.fillRect(x, y, 1, 1); };
  const rc = (x, y, w, h, col) => { C.fillStyle = col; C.fillRect(x, y, w, h); };
  const ell = (cx, cy, rx, ry, col) => {
    C.fillStyle = col;
    for (let y = -ry; y <= ry; y++) {
      const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.01))));
      C.fillRect(Math.round(cx - span), Math.round(cy + y), span * 2 + 1, 1);
    }
  };

  // Colored outline pass: transparent pixels touching opaque ones become a dark version of the neighbour.
  function outline(canvas, strength = 0.42, solidColor = null) {
    const x = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const img = x.getImageData(0, 0, w, h);
    const d = img.data;
    const out = new Uint8ClampedArray(d);
    const a = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : d[(j * w + i) * 4 + 3]);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      if (d[k + 3] > 40) continue;
      let src = -1;
      if (a(i, j + 1) > 40) src = ((j + 1) * w + i) * 4;
      else if (a(i, j - 1) > 40) src = ((j - 1) * w + i) * 4;
      else if (a(i - 1, j) > 40) src = (j * w + i - 1) * 4;
      else if (a(i + 1, j) > 40) src = (j * w + i + 1) * 4;
      if (src < 0) continue;
      if (solidColor) { const [r, g, b] = MH.hexToRgb(solidColor); out[k] = r; out[k + 1] = g; out[k + 2] = b; }
      else { out[k] = d[src] * strength; out[k + 1] = d[src + 1] * strength; out[k + 2] = d[src + 2] * strength * 1.1; }
      out[k + 3] = 255;
    }
    img.data.set(out);
    x.putImageData(img, 0, 0);
    return canvas;
  }
  art.outline = outline;

  function flipH(src) {
    const [c, x] = mk(src.width, src.height);
    x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0);
    return c;
  }

  // ======================================================================== GROUND
  const GC = {
    grass: ['#78c25a', '#6db752', '#83cb63', '#5ea648'],
    woods: ['#3f7d45', '#386f3e', '#46874b', '#2f5f36'],
    path: ['#d8b984', '#ceae78', '#e2c592', '#b89764'],
    plaza: ['#c9bfae', '#b9ae9c', '#d6cdbd', '#9e9483'],
    sand: ['#ecd9a2', '#e4cf95', '#f3e3b5', '#d4bd82'],
    water: ['#4aa6d8', '#3f98cc', '#5cb6e4', '#a8e0f4'],
    deep: ['#3a86c0', '#3279b0', '#4590c8', '#8ccbe8'],
    swamp: ['#4f6b47', '#465f40', '#5a7650', '#7a9a62'],
    mud: ['#7a6644', '#6d5a3b', '#86714c', '#5e4d31'],
    field: ['#9a7448', '#8a663e', '#a8824f', '#755631'],
    board: ['#b0814e', '#9c7044', '#c08f58', '#6a4a2a'],
  };
  const gName = ['grass', 'woods', 'path', 'plaza', 'sand', 'water', 'swamp', 'mud', 'field', 'board', 'deep'];

  art.renderGround = function () {
    const W = MH.world.W, H = MH.world.H, G = MH.G;
    const [c, x] = mk(W * T, H * T);
    C = x;
    const g = MH.world.g;
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const t = g(tx, ty), name = gName[t], P = GC[name];
      const ox = tx * T, oy = ty * T;
      rc(ox, oy, T, T, P[0]);
      // texture
      for (let i = 0; i < 10; i++) {
        const r = MH.hash2(tx * 16 + i, ty * 16 + i * 3, t);
        const sx = ox + Math.floor(MH.hash2(tx, ty, i + 20) * T), sy = oy + Math.floor(MH.hash2(ty, tx, i + 40) * T);
        if (t === G.GRASS || t === G.WOODS) {
          if (r < 0.35) { px(sx, sy, P[2]); px(sx, sy - 1, P[2]); }
          else if (r < 0.6) px(sx, sy, P[1]);
          else if (r < 0.66) px(sx, sy, P[3]);
        } else if (t === G.PATH || t === G.SAND || t === G.MUD) {
          if (r < 0.3) px(sx, sy, P[1]);
          else if (r < 0.45) px(sx, sy, P[2]);
          else if (r < 0.52) { px(sx, sy, P[3]); px(sx + 1, sy, P[3]); }
        } else if (t === G.SWAMP) {
          if (r < 0.25) px(sx, sy, P[1]); else if (r < 0.35) rc(sx, sy, 2, 1, P[3]);
        }
      }
      if (t === G.PLAZA) {
        // cobbles
        const off = (ty % 2) * 4;
        rc(ox, oy + 7, T, 1, P[3]); rc(ox, oy + 15, T, 1, P[3]);
        for (let k = 0; k < 2; k++) { rc(ox + ((off + k * 8) % 16), oy, 1, 7, P[3]); rc(ox + ((off + 4 + k * 8) % 16), oy + 8, 1, 7, P[3]); }
        for (let k = 0; k < 4; k++) px(ox + ((k * 5 + tx * 3) % 15), oy + ((k * 7 + ty) % 15), P[2]);
      } else if (t === G.FIELD) {
        for (let r = 2; r < T; r += 4) { rc(ox, oy + r, T, 1, P[3]); rc(ox, oy + r - 1, T, 1, P[2]); }
      } else if (t === G.BOARD) {
        rc(ox, oy, T, T, P[0]);
        for (let r = 0; r < T; r += 4) { rc(ox, oy + r, T, 1, P[3]); rc(ox, oy + r + 1, T, 1, P[2]); }
        px(ox + 3, oy + 2, P[3]); px(ox + 12, oy + 10, P[3]);
      } else if (t === G.WATER || t === G.DEEP) {
        if (MH.hash2(tx, ty, 9) < 0.3) rc(ox + 3, oy + 6, 4, 1, P[2]);
      }
      // ---- edges / blending
      const n = g(tx, ty - 1), s = g(tx, ty + 1), w = g(tx - 1, ty), e = g(tx + 1, ty);
      const isWet = (v) => v === G.WATER || v === G.DEEP;
      if (isWet(t)) {
        // foam / shore where land touches
        const foam = '#d8f2fb', sandc = GC.sand[0];
        if (!isWet(n)) { rc(ox, oy, T, 3, sandc); rc(ox, oy + 3, T, 2, foam); rc(ox, oy + 5, T, 1, shade(P[0], 0.85)); }
        if (!isWet(s)) { rc(ox, oy + T - 2, T, 2, foam); }
        if (!isWet(w)) { rc(ox, oy, 2, T, foam); }
        if (!isWet(e)) { rc(ox + T - 2, oy, 2, T, foam); }
        if (t === G.DEEP) { /* deep is darker */ }
      }
      if (t === G.WATER && (n === G.DEEP || s === G.DEEP || w === G.DEEP || e === G.DEEP)) {
        for (let k = 0; k < 4; k++) px(ox + ((tx * 7 + k * 4) % 16), oy + ((ty * 5 + k * 3) % 16), GC.deep[0]);
      }
      if (t === G.SWAMP) {
        if (n !== G.SWAMP) { rc(ox, oy, T, 2, GC.mud[3]); rc(ox, oy + 2, T, 1, shade(P[0], 0.8)); }
        if (s !== G.SWAMP) rc(ox, oy + T - 1, T, 1, GC.mud[1]);
      }
      if (t === G.PATH || t === G.PLAZA || t === G.SAND || t === G.FIELD) {
        // grass tufts creeping over edges
        const gr = (v) => v === G.GRASS || v === G.WOODS;
        const gc = n === G.WOODS || w === G.WOODS || e === G.WOODS || s === G.WOODS ? GC.woods : GC.grass;
        if (gr(n)) for (let i = 0; i < T; i++) { const hh = 1 + Math.floor(MH.hash2(ox + i, oy, 2) * 2.4); rc(ox + i, oy, 1, hh, gc[i % 3 === 0 ? 2 : 0]); }
        if (gr(s)) for (let i = 0; i < T; i++) { const hh = Math.floor(MH.hash2(ox + i, oy, 5) * 2.2); if (hh) rc(ox + i, oy + T - hh, 1, hh, gc[0]); }
        if (gr(w)) for (let i = 0; i < T; i++) { const ww = 1 + Math.floor(MH.hash2(ox, oy + i, 3) * 2); rc(ox, oy + i, ww, 1, gc[0]); }
        if (gr(e)) for (let i = 0; i < T; i++) { const ww = 1 + Math.floor(MH.hash2(ox, oy + i, 4) * 2); rc(ox + T - ww, oy + i, ww, 1, gc[0]); }
        if (t !== G.PLAZA && t !== G.FIELD && (gr(n))) rc(ox, oy + 2, T, 1, shade(P[0], 0.9));
      }
      if (t === G.GRASS && (n === G.WOODS)) {
        for (let i = 0; i < T; i++) { const hh = 1 + Math.floor(MH.hash2(ox + i, oy, 6) * 3); rc(ox + i, oy, 1, hh, GC.woods[0]); }
      }
      if (t === G.GRASS && (e === G.MUD || e === G.SWAMP)) {
        for (let i = 0; i < T; i++) if (MH.hash2(ox, oy + i, 8) < 0.5) px(ox + T - 1, oy + i, GC.mud[0]);
      }
    }
    return c;
  };

  // ======================================================================== PROPS
  function tree(dark, variant) {
    const [c, x] = mk(34, 44); C = x;
    const P = dark ? ['#2f6a3a', '#3b7f45', '#4d9452', '#24502d'] : ['#4f9a42', '#5fae4c', '#7cc85e', '#3b7a35'];
    // trunk
    rc(14, 30, 6, 12, '#7a5534'); rc(14, 30, 2, 12, '#8e6a44'); rc(19, 30, 1, 12, '#5a3c24'); rc(12, 40, 10, 2, '#5a3c24');
    // canopy blobs
    ell(17, 18, 15, 13, P[3]);
    ell(16, 16, 14, 12, P[0]);
    ell(11, 13, 7, 6, P[1]);
    ell(21, 12, 7, 6, P[1]);
    ell(16, 9, 7, 5, P[1]);
    ell(12, 10, 3, 2, P[2]); ell(20, 8, 3, 2, P[2]); ell(9, 16, 2, 2, P[2]);
    for (let i = 0; i < 26; i++) { const a = MH.hash2(i, variant, 1) * 6.28, r = MH.hash2(i, variant, 2) * 11; px(Math.round(16 + Math.cos(a) * r), Math.round(16 + Math.sin(a) * r * 0.8), i % 3 ? P[2] : P[3]); }
    // underside shadow
    for (let i = 4; i < 30; i++) if (MH.hash2(i, 0, variant) < 0.6) px(i, 27 + Math.round(MH.hash2(i, 1, variant)), P[3]);
    if (variant % 3 === 0 && !dark) { px(10, 14, '#f05a5a'); px(22, 18, '#f05a5a'); px(17, 9, '#f05a5a'); } // apples
    return outline(c, 0.5);
  }
  function pine(variant) {
    const [c, x] = mk(26, 44); C = x;
    rc(11, 34, 4, 8, '#6a4a2e');
    const P = ['#2a5f3a', '#347048', '#3f8455', '#1e4a2c'];
    for (let L = 0; L < 4; L++) {
      const top = 4 + L * 8, half = 4 + L * 2.6;
      for (let r = 0; r < 11; r++) {
        const w = Math.round((r / 10) * half + 1);
        rc(13 - w, top + r, w * 2, 1, r > 8 ? P[3] : P[(r + L) % 2]);
      }
      px(13 - 2, top + 5, P[2]); px(13 + 1, top + 3, P[2]);
    }
    return outline(c, 0.5);
  }
  function deadtree(variant) {
    const [c, x] = mk(30, 40); C = x;
    const col = '#6a6058', hi = '#857a70';
    rc(13, 14, 4, 26, col); rc(13, 14, 1, 26, hi);
    const br = [[13, 20, -1, -1, 7], [16, 18, 1, -1, 8], [14, 26, -1, -1, 5], [16, 24, 1, -1, 6]];
    br.forEach(([sx, sy, dx, dy, n]) => { for (let i = 0; i < n; i++) rc(sx + dx * i, sy + dy * Math.floor(i * 0.7), 2, 2, col); });
    rc(10, 38, 10, 2, '#4a4038');
    // hanging moss
    for (let i = 0; i < 6; i++) rc(8 + i * 3, 12 + (i % 3) * 3, 1, 4 + (i % 2) * 3, '#6a8a4a');
    return outline(c, 0.5);
  }
  function bush(kind) {
    const [c, x] = mk(20, 18); C = x;
    const P = ['#4a9a40', '#5cb04c', '#78c860', '#367a30'];
    ell(10, 10, 8, 6, P[3]); ell(10, 9, 8, 6, P[0]); ell(7, 7, 4, 3, P[1]); ell(13, 7, 4, 3, P[1]); px(6, 5, P[2]); px(13, 5, P[2]);
    if (kind === 'berry') [[6, 9], [12, 8], [9, 12], [14, 11], [5, 12]].forEach(([a, b]) => { px(a, b, '#5a3aa0'); px(a + 1, b, '#7a5ad0'); });
    if (kind === 'roses') [[5, 8], [10, 6], [14, 9], [8, 11], [12, 12]].forEach(([a, b]) => { rc(a, b, 2, 2, '#d8364a'); px(a, b, '#f0606a'); });
    return outline(c, 0.5);
  }
  function rock() {
    const [c, x] = mk(16, 12); C = x;
    ell(8, 7, 6, 4, '#8a8a90'); ell(7, 6, 4, 3, '#a0a0a8'); px(5, 4, '#c0c0c8'); rc(3, 10, 10, 1, '#6a6a70');
    return outline(c, 0.5);
  }
  function lamp(swamp) {
    const [c, x] = mk(12, 36); C = x;
    rc(5, 10, 2, 24, '#3a3440'); rc(3, 33, 6, 2, '#2a2430'); rc(4, 10, 4, 1, '#3a3440');
    rc(3, 3, 6, 7, '#2a2430'); rc(4, 4, 4, 5, swamp ? '#b8ff9a' : '#ffe08a'); px(4, 4, '#ffffff'); rc(2, 2, 8, 1, '#3a3440'); rc(5, 0, 2, 2, '#3a3440');
    return outline(c, 0.6);
  }
  function fence(vert, small) {
    const [c, x] = mk(16, 18); C = x;
    const w = '#e8dcc4', d = '#b8a888';
    if (vert) { rc(6, 0, 4, 17, w); rc(9, 0, 1, 17, d); }
    else { rc(1, 4, 3, 12, w); rc(12, 4, 3, 12, w); rc(0, 7, 16, 2, w); rc(0, 12, 16, 2, w); rc(0, 9, 16, 1, d); rc(0, 14, 16, 1, d); px(1, 3, w); px(13, 3, w); }
    return outline(c, 0.55);
  }
  function bench() {
    const [c, x] = mk(22, 16); C = x;
    rc(1, 4, 20, 3, '#a8744a'); rc(1, 8, 20, 3, '#b8844e'); rc(1, 7, 20, 1, '#7a5030'); rc(2, 11, 2, 4, '#4a3a30'); rc(18, 11, 2, 4, '#4a3a30');
    return outline(c, 0.5);
  }
  function well() {
    const [c, x] = mk(34, 38); C = x;
    ell(17, 29, 14, 6, '#8a8a92'); ell(17, 27, 14, 6, '#a8a8b0'); ell(17, 27, 10, 4, '#2a3a5a'); ell(17, 28, 8, 2, '#3a5a8a');
    for (let i = 0; i < 6; i++) rc(4 + i * 5, 30, 1, 3, '#6a6a72');
    rc(5, 8, 2, 20, '#7a5534'); rc(27, 8, 2, 20, '#7a5534'); rc(3, 5, 28, 4, '#b84a3a'); rc(3, 4, 28, 1, '#d86a5a'); rc(3, 9, 28, 1, '#7a2a20');
    rc(16, 9, 1, 12, '#c8b890'); rc(14, 20, 5, 4, '#8a6a44');
    return outline(c, 0.5);
  }
  function board() {
    const [c, x] = mk(24, 30); C = x;
    rc(3, 14, 2, 15, '#6a4a2e'); rc(19, 14, 2, 15, '#6a4a2e'); rc(1, 2, 22, 15, '#8a5a34'); rc(2, 3, 20, 13, '#c8a070');
    [[3, 4, '#f4f0e0'], [10, 5, '#f4d06a'], [16, 4, '#a0d0f0'], [5, 10, '#f0a0c0'], [13, 10, '#f4f0e0']].forEach(([a, b, col]) => rc(a, b, 5, 5, col));
    px(5, 4, '#d83a3a'); px(12, 5, '#d83a3a'); px(18, 4, '#d83a3a');
    return outline(c, 0.5);
  }
  function planter() {
    const [c, x] = mk(16, 14); C = x;
    rc(2, 7, 12, 6, '#a86a44'); rc(2, 7, 12, 1, '#c88a5a'); ell(8, 5, 6, 3, '#5cb04c');
    [[4, 4, '#f07ac0'], [8, 3, '#f4d03a'], [11, 5, '#ffffff'], [6, 6, '#8a7af0']].forEach(([a, b, col]) => rc(a, b, 2, 2, col));
    return outline(c, 0.5);
  }
  function stall(col) {
    const [c, x] = mk(34, 34); C = x;
    rc(3, 10, 2, 22, '#6a4a2e'); rc(29, 10, 2, 22, '#6a4a2e');
    for (let i = 0; i < 8; i++) rc(1 + i * 4, 4, 4, 8, i % 2 ? '#f4f0e6' : col);
    rc(1, 12, 32, 1, shade(col, 0.6));
    rc(2, 22, 30, 8, '#a8744a'); rc(2, 22, 30, 1, '#c8945a');
    [[5, 19, '#f05a4a'], [10, 19, '#f4d03a'], [15, 19, '#6ac04a'], [20, 19, '#f08a3a'], [25, 19, '#a05ad0']].forEach(([a, b, col2]) => ell(a + 1, b + 1, 2, 2, col2));
    return outline(c, 0.5);
  }
  function mailbox() {
    const [c, x] = mk(10, 18); C = x;
    rc(4, 8, 2, 10, '#6a4a2e'); rc(1, 2, 8, 7, '#3a6ac8'); rc(1, 2, 8, 1, '#5a8ae8'); rc(8, 3, 1, 3, '#d83a3a');
    return outline(c, 0.5);
  }
  function tower() {
    const [c, x] = mk(36, 54); C = x;
    rc(5, 24, 3, 30, '#e8e0d0'); rc(28, 24, 3, 30, '#e8e0d0'); rc(9, 30, 18, 2, '#c8c0b0'); rc(9, 42, 18, 2, '#c8c0b0');
    rc(2, 20, 32, 5, '#d93a3a'); rc(2, 20, 32, 1, '#f05a5a');
    rc(6, 6, 24, 15, '#f4f0e8'); rc(6, 6, 24, 2, '#ffffff');
    for (let i = 0; i < 6; i++) rc(4 + i * 5, 0, 5, 7, i % 2 ? '#f4f0e8' : '#d93a3a');
    rc(13, 10, 10, 6, '#5ab0e0'); // window
    // seashells on rail
    [[6, 19], [12, 19], [20, 19], [27, 19]].forEach(([a, b]) => { px(a, b, '#f8d0e0'); px(a + 1, b, '#f0b0c8'); });
    // red flag
    rc(32, 0, 1, 12, '#5a5a5a'); rc(33, 1, 3, 3, '#e8282a');
    return outline(c, 0.5);
  }
  function reeds(swamp) {
    const [c, x] = mk(14, 18); C = x;
    const col = swamp ? '#6a7a3a' : '#5a9a40';
    [[3, 4], [6, 2], [9, 5], [11, 3]].forEach(([a, b], i) => { rc(a, b, 1, 17 - b, col); rc(a, b - 2 + (i % 2), 1, 3, '#8a5a34'); });
    return outline(c, 0.5);
  }
  function corn(v) {
    const [c, x] = mk(16, 26); C = x;
    rc(7, 4, 2, 21, '#7aa04a');
    [[3, 10, -1], [9, 8, 1], [3, 16, -1], [9, 14, 1]].forEach(([a, b, d]) => rc(a, b, 5, 2, '#8ab858'));
    rc(9, 11, 2, 5, '#f4d03a'); px(10, 10, '#c8a030');
    rc(6, 1, 4, 4, '#d8c070');
    return outline(c, 0.5);
  }
  function lantern() { return lamp(true); }
  function log() {
    const [c, x] = mk(34, 14); C = x;
    rc(2, 3, 30, 9, '#8a6040'); rc(2, 3, 30, 2, '#a87a50'); ell(3, 7, 2, 4, '#c8a070'); px(3, 7, '#8a6040');
    return outline(c, 0.5);
  }
  function post() {
    const [c, x] = mk(20, 40); C = x;
    rc(9, 8, 3, 32, '#7a5534'); rc(2, 12, 17, 2, '#7a5534');
    return outline(c, 0.5);
  }
  function dock() {
    const [c, x] = mk(32, 26); C = x;
    for (let i = 0; i < 6; i++) { rc(4, i * 4, 24, 3, '#b0814e'); rc(4, i * 4 + 3, 24, 1, '#7a5530'); }
    rc(4, 0, 2, 26, '#8a6040'); rc(26, 0, 2, 26, '#8a6040');
    return outline(c, 0.5);
  }
  function smallFlat(type, color) {
    const [c, x] = mk(12, 10); C = x;
    if (type === 'flowers') { [[2, 4], [6, 2], [8, 6], [4, 7]].forEach(([a, b]) => { rc(a, b, 2, 2, color); px(a, b, shade(color, 1.3)); px(a + 1, b + 2, '#3a8a30'); }); }
    else if (type === 'lilypad') { ell(6, 5, 5, 3, '#4aa04a'); px(6, 3, '#2a7a2a'); px(7, 4, '#2a7a2a'); if (Math.random() < 0.3) rc(4, 3, 2, 2, '#f8c0d8'); }
    else if (type === 'shell') { ell(6, 6, 3, 2, '#f8d8e0'); px(5, 5, '#ffffff'); px(6, 7, '#e0a0b0'); }
    else if (type === 'mushroom') { rc(5, 5, 2, 4, '#f0e8d8'); ell(6, 4, 3, 2, '#c84a8a'); px(5, 3, '#ffffff'); px(7, 4, '#ff9ae0'); }
    else if (type === 'cap') { ell(6, 6, 2, 2, '#c8c8d0'); px(5, 5, '#ffffff'); }
    return outline(c, 0.55);
  }

  art.prop = function (p) {
    const key = p.type + (p.dark ? 'd' : '') + (p.berry ? 'b' : '') + (p.roses ? 'r' : '') + (p.vert ? 'v' : '') + (p.small ? 's' : '') + (p.swamp ? 'w' : '') + (p.color || '') + (p.type === 'oak' ? (p.tx * 7 + p.ty) % 4 : '');
    if (art.cache[key]) return art.cache[key];
    let s;
    switch (p.type) {
      case 'oak': s = tree(p.dark, (p.tx * 7 + p.ty) % 4); break;
      case 'pine': s = pine(0); break;
      case 'deadtree': s = deadtree(0); break;
      case 'bush': s = bush(p.berry ? 'berry' : p.roses ? 'roses' : ''); break;
      case 'rock': s = rock(); break;
      case 'lamp': s = lamp(false); break;
      case 'lantern': s = lantern(); break;
      case 'fence': s = fence(p.vert, p.small); break;
      case 'bench': s = bench(); break;
      case 'well': s = well(); break;
      case 'board': s = board(); break;
      case 'planter': s = planter(); break;
      case 'stall': s = stall(p.color); break;
      case 'mailbox': s = mailbox(); break;
      case 'tower': s = tower(); break;
      case 'reeds': s = reeds(p.swamp); break;
      case 'corn': s = corn(); break;
      case 'log': s = log(); break;
      case 'post': s = post(); break;
      case 'dock': s = dock(); break;
      default: s = smallFlat(p.type, p.color || '#f07ac0');
    }
    art.cache[key] = s;
    return s;
  };

  // ======================================================================== SIGN ICONS (7x7)
  const ICONS = {
    bread: ['..###..', '.#####.', '#######', '#.#.#.#', '#######', '.#####.', '.......'],
    book: ['#######', '#.....#', '#.###.#', '#.....#', '#.###.#', '#.....#', '#######'],
    clock: ['.#####.', '#..#..#', '#..#..#', '#..###.', '#.....#', '#.....#', '.#####.'],
    bag: ['..###..', '.#...#.', '#######', '#######', '#######', '#######', '.#####.'],
    heart: ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
    cross: ['..###..', '..###..', '#######', '#######', '#######', '..###..', '..###..'],
    scissors: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '##...##', '##...##'],
    egg: ['..###..', '.#####.', '.#####.', '#######', '#######', '#######', '.#####.'],
    mail: ['#######', '##...##', '#.#.#.#', '#..#..#', '#.....#', '#######', '.......'],
    controller: ['.......', '.#####.', '#######', '#.###.#', '##.#.##', '#######', '.#...#.'],
    dumbbell: ['.......', '##...##', '##...##', '#######', '##...##', '##...##', '.......'],
    saw: ['#####..', '######.', '#######', '.######', '.#.#.#.', '.......', '.......'],
    star: ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
    lily: ['.##.##.', '#######', '#######', '###.###', '.#####.', '..###..', '.......'],
    drop: ['...#...', '..###..', '.#####.', '#######', '#######', '.#####.', '..###..'],
    tooth: ['#######', '#######', '#######', '##.#.##', '##...##', '##...##', '.#...#.'],
  };
  const ICON_COL = { bread: '#d98a3a', book: '#7a3aa0', clock: '#f4f0e0', bag: '#3a8a5a', heart: '#ff5ab0', cross: '#e83a3a', scissors: '#7a7a8a', egg: '#fff4d8', mail: '#3a6ac8', controller: '#5a4a8a', dumbbell: '#4a4a5a', saw: '#a8a8b0', star: '#f4d03a', lily: '#f8a0c8', drop: '#c8202a', tooth: '#f4f0e0' };
  function drawIcon(name, ox, oy) {
    const rows = ICONS[name]; if (!rows) return;
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') px(ox + i, oy + j, ICON_COL[name]); }));
  }

  // ======================================================================== BUILDINGS
  art.building = function (b) {
    if (art.cache['b_' + b.id]) return art.cache['b_' + b.id];
    const Wp = b.w * T, Hp = b.h * T, roofUp = b.cave ? 6 : 22;
    const [c, x] = mk(Wp + 4, Hp + roofUp + 2); C = x;
    const ox = 2, base = Hp + roofUp; // y of bottom edge
    if (b.cave) {
      ell(ox + Wp / 2, base - 18, Wp / 2, 20, '#6a6a6a'); ell(ox + Wp / 2, base - 20, Wp / 2 - 3, 17, '#8a8a8a');
      ell(ox + Wp / 2 - 6, base - 30, 8, 5, '#a0a0a0'); ell(ox + Wp / 2 + 10, base - 24, 6, 4, '#9a9a9a');
      ell(ox + Wp / 2, base - 8, 11, 9, '#1a1414'); rc(ox + Wp / 2 - 11, base - 6, 22, 6, '#1a1414');
      for (let i = 0; i < 9; i++) px(ox + 8 + i * 9, base - 34 + (i % 3) * 5, '#5a9a40');
      ell(ox + 10, base - 30, 6, 3, '#4a8a3a'); ell(ox + Wp - 10, base - 34, 7, 3, '#4a8a3a');
      art.cache['b_' + b.id] = outline(c, 0.5); return c;
    }
    const wallH = b.stilts ? 26 : Math.min(36, Hp - 8);
    const stiltH = b.stilts ? 22 : 0;
    const wallTop = base - wallH - stiltH, wallBot = base - stiltH;
    const roofBot = wallTop + 6;
    const wall = b.wall, wd = shade(wall, 0.8), wl = shade(wall, 1.08), trim = b.trim;
    if (b.stilts) {
      for (let i = 0; i < 4; i++) rc(ox + 6 + i * ((Wp - 14) / 3), wallBot, 3, stiltH, '#5a4a3a');
      rc(ox + 2, wallBot, Wp - 4, 3, '#6a5a4a');
      // ladder
      for (let i = 0; i < 6; i++) rc(ox + Wp / 2 - 4, wallBot + 3 + i * 3, 8, 1, '#7a6a5a');
      rc(ox + Wp / 2 - 4, wallBot, 1, stiltH, '#7a6a5a'); rc(ox + Wp / 2 + 3, wallBot, 1, stiltH, '#7a6a5a');
    }
    // walls
    rc(ox + 1, wallTop, Wp - 2, wallH, wall);
    rc(ox + 1, wallBot - 3, Wp - 2, 3, wd);
    for (let yy = wallTop + 4; yy < wallBot - 3; yy += 5) if (!b.round) rc(ox + 1, yy, Wp - 2, 1, shade(wall, 0.92));
    rc(ox + 1, wallTop, 2, wallH, trim); rc(ox + Wp - 3, wallTop, 2, wallH, trim);
    // windows
    const doorW = 12, doorX = ox + Math.floor(Wp / 2) - 6;
    const nWin = Math.max(1, Math.floor((Wp - 24) / 22));
    const winY = wallTop + 9;
    const spots = [];
    for (let i = 0; i < nWin + 1; i++) {
      const wx = ox + 6 + Math.round(i * ((Wp - 20) / Math.max(1, nWin)));
      if (wx + 10 > doorX - 2 && wx < doorX + doorW + 2) continue;
      spots.push(wx);
    }
    spots.forEach((wx) => {
      rc(wx - 1, winY - 1, 12, 11, trim);
      rc(wx, winY, 10, 9, b.glow ? '#2a4a3a' : '#9ad0ea');
      rc(wx, winY, 10, 2, b.glow ? b.glow : '#c8ecf8');
      rc(wx + 4, winY, 1, 9, trim); rc(wx, winY + 4, 10, 1, trim);
      if (b.neon) { rc(wx, winY, 10, 9, '#ff5ab0'); rc(wx + 1, winY + 1, 8, 7, '#7a2a6a'); }
      // flower box
      rc(wx - 1, winY + 10, 12, 3, '#8a5a34');
      for (let k = 0; k < 5; k++) px(wx + k * 2, winY + 9, ['#f07ac0', '#f4d03a', '#ff6a5a', '#ffffff', '#8a7af0'][(k + wx) % 5]);
    });
    // door
    rc(doorX - 1, wallBot - 20, doorW + 2, 20, trim);
    rc(doorX, wallBot - 19, doorW, 19, shade(trim, 1.25));
    rc(doorX + doorW / 2, wallBot - 19, 1, 19, trim);
    px(doorX + doorW - 3, wallBot - 10, '#f4d03a');
    rc(doorX - 2, wallBot - 1, doorW + 4, 1, '#6a6a6a');
    if (b.awning) {
      for (let i = 0; i < 6; i++) rc(doorX - 6 + i * 4, wallBot - 26, 4, 5, b.awning[i % 2]);
      rc(doorX - 6, wallBot - 21, 24, 1, shade(b.awning[0], 0.6));
    }
    if (b.pole) { for (let i = 0; i < 14; i++) rc(ox + Wp - 10, wallBot - 18 + i, 3, 1, i % 4 < 2 ? '#e83a3a' : '#f4f4f4'); }
    // roof
    const rTop = 0 + (b.round ? 2 : 0);
    for (let yy = rTop; yy <= roofBot; yy++) {
      const t = (yy - rTop) / (roofBot - rTop);
      let inset = b.round ? Math.max(0, Math.round(10 * (1 - Math.sqrt(Math.min(1, t * 3))))) : 0;
      const skew = b.crooked ? Math.round(t * 4) - 2 : 0;
      const row = Math.floor((yy - rTop) / 4);
      const col = yy === roofBot ? shade(b.roof, 0.55) : row % 2 ? b.roof : shade(b.roof, 0.88);
      rc(ox - 2 + inset + skew, yy, Wp + 4 - inset * 2, 1, col);
      if ((yy - rTop) % 4 === 3) for (let k = (row % 2) * 3; k < Wp; k += 6) px(ox + k + skew, yy, shade(b.roof, 0.7));
    }
    rc(ox - 2, roofBot + 1, Wp + 4, 2, 'rgba(0,0,0,0.25)');
    if (!b.round) { rc(ox + 4, rTop, Wp - 8, 2, shade(b.roof, 1.2)); }
    // chimney
    if (!b.round && !b.neon && Wp > 70) { rc(ox + Wp - 22, 0, 7, 10, '#9a5a4a'); rc(ox + Wp - 23, 0, 9, 2, '#7a4a3a'); }
    // sign
    if (b.sign) {
      const sx = ox + Math.floor(Wp / 2) - 6, sy = roofBot - 6;
      rc(sx, sy, 13, 11, b.neon ? '#2a1a3a' : '#f4ead0'); rc(sx, sy, 13, 1, trim); rc(sx, sy + 10, 13, 1, trim); rc(sx, sy, 1, 11, trim); rc(sx + 12, sy, 1, 11, trim);
      drawIcon(b.sign, sx + 3, sy + 2);
    }
    if (b.neon) { rc(ox + 1, wallTop, Wp - 2, 1, '#ff7ad0'); rc(ox + 1, wallBot - 1, Wp - 2, 1, '#ff7ad0'); }
    if (b.id === 'townhall') { ell(ox + Wp / 2, 8, 6, 6, '#f4f0e0'); px(ox + Wp / 2, 5, '#2a2a2a'); rc(ox + Wp / 2, 5, 1, 4, '#2a2a2a'); rc(ox + Wp / 2, 8, 3, 1, '#2a2a2a'); }
    if (b.id === 'coop') { for (let i = 0; i < 5; i++) ell(ox + 10 + i * 6, wallBot + 2, 2, 1, '#fff4c0'); }
    art.cache['b_' + b.id] = outline(c, 0.5);
    return art.cache['b_' + b.id];
  };
  art.buildingOffset = (b) => ({ ox: b.x * T - 2, oy: (b.y + b.h) * T - (b.h * T + (b.cave ? 6 : 22)) });

  // ======================================================================== CHIBI VILLAGERS
  const CW = 30, CH = 44;
  art.CW = CW; art.CH = CH;

  function drawChibi(L, dir, frame) {
    const [c, x] = mk(CW, CH); C = x;
    const t = L.tall || 0, wd = L.wide || 0;
    const fur = L.fur, fur2 = L.fur2 || shade(fur, 1.3), hair = L.hair || fur, eyes = L.eyes || '#222';
    const top = L.top || '#ccc', bottom = L.bottom || top;
    const acc = L.acc || [];
    const has = (a) => acc.includes(a);
    const body = L.body || 'normal', head = L.head || 'normal';
    const walk = frame === 0 ? 0 : frame === 1 ? 1 : -1;
    const bob = frame === 0 ? 0 : -1;
    const legH = 3 + Math.floor(t / 2), bodyH = 7 + Math.ceil(t / 2);
    const footY = CH - 3;
    const legsTop = footY - legH + 1;
    const bodyTop = legsTop - bodyH + bob;
    const headTop = bodyTop - 11;
    const cx = 15; // center line between pixels 14 and 15
    const hx0 = cx - 7, hx1 = cx + 6; // head x range 8..21
    const side = dir === 'left';
    const back = dir === 'up';

    // ----- behind: tail & wings
    const drawTail = () => {
      const tt = L.tail; if (!tt || tt === 'none') return;
      const tc = fur, tip = L.tailTip || fur2;
      let tx0 = side ? cx + 4 : back ? cx - 3 : cx + 4, ty0 = bodyTop + 3;
      if (tt === 'fox') {
        if (back) { ell(cx, bodyTop + 7, 4, 5, tc); ell(cx, bodyTop + 11, 3, 2, tip); }
        else { const dx = side ? 6 : 7; ell(cx + dx, bodyTop + 5 - walk, 3, 5, tc); ell(cx + dx + 1, bodyTop + 1 - walk, 2, 2, tip); }
      } else if (tt === 'cat') {
        if (back) { rc(cx, bodyTop + 4, 2, 9, tc); }
        else { for (let i = 0; i < 7; i++) rc(cx + 6 + Math.round(i * 0.5), bodyTop + 8 - i, 2, 1, i % 2 && has('stripes') ? '#2a1a10' : tc); }
      } else if (tt === 'bear' || tt === 'puff') {
        if (back) ell(cx, bodyTop + bodyH - 2, 2, 2, tt === 'puff' ? tip : tc);
        else if (side) ell(cx + 5, bodyTop + bodyH - 2, 2, 2, tt === 'puff' ? tip : tc);
      } else if (tt === 'deer') {
        if (back) ell(cx, bodyTop + bodyH - 3, 2, 2, fur2); else if (side) ell(cx + 5, bodyTop + bodyH - 3, 1, 2, fur2);
      } else if (tt === 'pig') {
        if (back || side) { const bx = back ? cx : cx + 5; px(bx, bodyTop + 5, tc); px(bx + 1, bodyTop + 4, tc); px(bx + 2, bodyTop + 5, tc); px(bx + 1, bodyTop + 6, tc); }
      } else if (tt === 'ringed') {
        for (let i = 0; i < 6; i++) rc(back ? cx - 1 : cx + 5 + Math.floor(i / 2), bodyTop + 9 - i + (back ? 2 : 0), 3, 1, i % 2 ? '#2a2a30' : tc);
      } else if (tt === 'croc') {
        if (back) { rc(cx - 2, bodyTop + bodyH - 2, 4, 6, tc); } else { for (let i = 0; i < 7; i++) rc(cx + 4 + i, footY - 2 - Math.floor(i / 3), 2, 2, tc); }
      } else if (tt === 'shark') {
        if (back) { rc(cx - 1, bodyTop + bodyH - 1, 2, 4, tc); rc(cx - 3, bodyTop + bodyH + 2, 6, 2, tc); }
        else { rc(cx + 5, bodyTop + bodyH - 2, 4, 2, tc); rc(cx + 8, bodyTop + bodyH - 5, 2, 5, tc); }
      } else if (tt === 'beaver') {
        const bx = back ? cx - 3 : cx + 4; rc(bx, bodyTop + bodyH - 1, 6, 4, '#5a3a2a'); px(bx + 1, bodyTop + bodyH, '#7a5a4a');
      }
    };
    const drawWings = () => {
      if (!has('wings')) return;
      const wc = 'rgba(200,230,255,0.75)', we = '#9ab0c8';
      const flap = frame === 1 ? -1 : 0;
      ell(cx - 7, bodyTop + 1 + flap, 4, 6, wc); ell(cx + 6, bodyTop + 1 + flap, 4, 6, wc);
      px(cx - 7, bodyTop - 3 + flap, we); px(cx + 6, bodyTop - 3 + flap, we);
    };
    const drawShadowArms = () => {
      if (!has('shadowarms')) return;
      for (let i = 0; i < 5; i++) { px(cx - 9 - (i % 2), bodyTop + 2 + i, '#2a1e3a'); px(cx + 8 + (i % 2), bodyTop + 2 + i, '#2a1e3a'); }
    };

    if (!back) { drawWings(); drawTail(); drawShadowArms(); }
    else { drawWings(); }

    // long / curly hair hangs behind the body when seen from the front or side
    const hs0 = L.hairStyle || 'short';
    if (!back && body !== 'cloud') {
      if (hs0 === 'long') { rc(hx0 - 1, headTop + 3, 16, Math.min(16, bodyTop + bodyH - headTop - 4), hair); }
      if (hs0 === 'curly') { for (let i = 0; i < 7; i++) ell(hx0 + i * 2, headTop + 11 + (i % 2), 2, 3, hair); }
    }

    // ----- legs / lower body
    if (body === 'snake') {
      const s = frame;
      ell(cx, footY - 3, 8 + (s === 1 ? 1 : 0), 3, shade(fur, 0.85));
      ell(cx + (s === 2 ? 1 : -1), footY - 5, 6, 3, fur);
      for (let i = -5; i <= 5; i += 2) px(cx + i, footY - 3, fur2);
      rc(cx - 3, bodyTop + bodyH - 1, 6, footY - bodyTop - bodyH - 3, fur);
    } else if (body === 'genie') {
      for (let y = bodyTop + bodyH - 1; y <= footY; y++) {
        const k = (y - bodyTop - bodyH) / (footY - bodyTop - bodyH + 1);
        const w = Math.max(1, Math.round(5 * (1 - k)));
        const sway = Math.round(Math.sin(y * 0.6 + frame) * 1.5 * k);
        rc(cx - w + sway, y, w * 2, 1, k > 0.6 ? fur2 : MH.mix(top, fur2, k));
      }
    } else if (body === 'cloud') {
      // whole body is a puffy cloud
      ell(cx, footY - 8, 10, 7, shade(fur, 0.9)); ell(cx - 6, footY - 9, 5, 5, fur); ell(cx + 6, footY - 9, 5, 5, fur); ell(cx, footY - 12, 7, 6, fur);
      for (let i = 0; i < 4; i++) px(cx - 6 + i * 4, footY - 1 + (frame === i % 3 ? 1 : 0), '#9ac0e8');
    } else {
      const lc = L.dress ? fur : bottom;
      const feet = shade(lc, 0.6);
      const ll = legH + (walk === 1 ? -1 : 0), rl = legH + (walk === -1 ? -1 : 0);
      if (side) {
        const fx = cx - 3 + walk * 1, bx2 = cx + 1 - walk * 1;
        rc(bx2, legsTop + bob, 2, legH - bob, shade(lc, 0.85)); rc(bx2, footY, 3, 1, feet);
        rc(fx, legsTop + bob, 2, legH - bob, lc); rc(fx - 1, footY, 3, 1, feet);
      } else {
        rc(cx - 3, legsTop, 2, ll, lc); rc(cx - 3, legsTop + ll - 1, 2, 1, feet);
        rc(cx + 1, legsTop, 2, rl, lc); rc(cx + 1, legsTop + rl - 1, 2, 1, feet);
      }
    }

    // ----- torso
    if (body !== 'cloud') {
      const bx0 = cx - 4 - wd, bw = 8 + wd * 2;
      rc(bx0, bodyTop, bw, bodyH, top);
      rc(bx0 + bw - 1, bodyTop, 1, bodyH, shade(top, 0.82));
      rc(bx0, bodyTop + bodyH - 1, bw, 1, shade(top, 0.85));
      if (L.dress && body === 'normal') { rc(bx0 - 1, bodyTop + bodyH - 3, bw + 2, 3, top); rc(bx0 - 1, bodyTop + bodyH - 1, bw + 2, 1, shade(top, 0.8)); }
      if (!back && !side && !has('labcoat') && body === 'normal' && !has('overalls')) {
        // neckline / chest fur
        rc(cx - 1, bodyTop, 2, 1, fur2);
      }
      if (has('labcoat')) {
        rc(bx0 - 1, bodyTop, 3, bodyH + 2, '#f4f4f0'); rc(bx0 + bw - 2, bodyTop, 3, bodyH + 2, '#e0e0dc');
        if (back) rc(bx0 - 1, bodyTop, bw + 2, bodyH + 2, '#f0f0ec');
        px(cx + 2, bodyTop + 2, '#3a6ac8'); px(cx + 2, bodyTop + 3, '#d83a3a');
      }
      if (has('apron') && !back) {
        const ac = L.apron || '#ffffff';
        rc(cx - 3, bodyTop + 1, 6, bodyH + 1, ac); rc(cx - 3, bodyTop + 1, 6, 1, shade(ac, 0.85));
        if (L.apron === '#f6d553') { px(cx - 2, bodyTop + 3, '#7a4a20'); px(cx + 1, bodyTop + 5, '#7a4a20'); px(cx - 1, bodyTop + 6, '#4a9a40'); px(cx + 2, bodyTop + 2, '#4a9a40'); }
        rc(cx - 2, bodyTop + 5, 4, 1, shade(ac, 0.8));
      }
      if (has('overalls') && !back) { rc(cx - 3, bodyTop + 2, 6, bodyH - 2, bottom); px(cx - 3, bodyTop, bottom); px(cx + 2, bodyTop, bottom); px(cx - 3, bodyTop + 1, bottom); px(cx + 2, bodyTop + 1, bottom); px(cx - 2, bodyTop + 3, '#f4d03a'); px(cx + 1, bodyTop + 3, '#f4d03a'); }
      if (has('tie') && !back) { rc(cx - 1, bodyTop, 2, 5, '#c83a3a'); px(cx - 1, bodyTop + 5, '#c83a3a'); rc(cx - 3, bodyTop, 1, 3, '#f4f4f4'); rc(cx + 2, bodyTop, 1, 3, '#f4f4f4'); }
      if (has('whistle') && !back) { px(cx - 2, bodyTop + 1, '#f4f4f4'); px(cx - 1, bodyTop + 2, '#f4f4f4'); rc(cx, bodyTop + 3, 2, 2, '#f4d03a'); }
      if (has('patches')) { rc(bx0 + 1, bodyTop + 1, 3, 3, '#e83a6a'); rc(bx0 + bw - 4, bodyTop + 4, 3, 2, '#3ad06a'); px(cx, bodyTop + 2, '#f4f4f4'); px(cx, bodyTop + 5, '#f4f4f4'); }
      if (has('stripes')) { for (let i = 0; i < 3; i++) { px(bx0, bodyTop + 1 + i * 2, '#2a1a10'); px(bx0 + bw - 1, bodyTop + 1 + i * 2, '#2a1a10'); } }
      if (has('bag')) rc(bx0 + bw - 1, bodyTop + 3, 4, 4, '#8a5a34');
      if (has('gold')) { rc(bx0, bodyTop, bw, 1, '#f4c84a'); }
      // arms
      const sleeve = has('labcoat') ? '#f4f4f0' : top;
      const armC = body === 'genie' || has('gold') ? fur : fur;
      const aY = bodyTop + 1;
      if (side) {
        const sw = walk;
        rc(cx - 1 + sw, aY, 2, 3, sleeve); rc(cx - 1 + sw, aY + 3, 2, 3, armC);
        if (has('phone')) rc(cx - 2 + sw, aY + 4, 2, 2, '#1a1a1a');
      } else {
        rc(bx0 - 2, aY + walk, 2, 3, sleeve); rc(bx0 - 2, aY + 3 + walk, 2, 3, armC);
        rc(bx0 + bw, aY - walk, 2, 3, sleeve); rc(bx0 + bw, aY + 3 - walk, 2, 3, armC);
        if (has('gold')) { px(bx0 - 2, aY + 3 + walk, '#f4c84a'); px(bx0 + bw + 1, aY + 3 - walk, '#f4c84a'); }
        if (has('phone') && !back) rc(bx0 + bw, aY + 5 - walk, 2, 3, '#1a1a1a');
        if (has('scissors') && !back) { px(bx0 + bw + 2, aY + 5, '#a8a8b0'); px(bx0 + bw + 3, aY + 4, '#a8a8b0'); }
        if (has('pandapatch')) { rc(bx0 - 2, aY + walk, 2, 6, '#1a1a1e'); rc(bx0 + bw, aY - walk, 2, 6, '#1a1a1e'); }
      }
    }

    // ----- head
    const hy0 = headTop, hy1 = headTop + 12;
    let headCol = fur;
    if (head === 'burlap') headCol = '#c8a874';
    if (head === 'void') headCol = '#1c1628';
    if (has('clownpaint')) headCol = '#f8f4f0';
    if (body === 'cloud') headCol = fur;

    const drawEars = (behind) => {
      const e = L.ears; if (!e || e === 'none') return;
      const ec = L.earColor || fur, ei = L.earIn || fur2, tip = L.earTip;
      const ear = (mirror) => {
        const P = (xx, yy, col) => px(mirror ? 2 * cx - 1 - xx : xx, yy, col);
        if (e === 'fox' || e === 'cat') {
          const hgt = e === 'fox' ? 7 : 5;
          for (let r = 0; r < hgt; r++) {
            const y = hy0 - hgt + 2 + r;
            const x0 = hx0 + 1 - Math.floor(r / 3), x1 = hx0 + 1 + Math.floor(r * 0.7);
            for (let xx = x0; xx <= x1; xx++) {
              let col = ec;
              if (tip && r < 2) col = tip;
              else if (!behind && r > 1 && xx > x0 && xx < x1) col = ei;
              P(xx, y, col);
            }
          }
        } else if (e === 'bear' || e === 'round') {
          for (let yy = -2; yy <= 1; yy++) for (let xx = -2; xx <= 2; xx++) if (xx * xx + yy * yy <= 5) P(hx0 + 2 + xx, hy0 + 1 + yy, Math.abs(xx) <= 1 && yy >= -1 && yy <= 0 && !behind ? ei : ec);
        } else if (e === 'rabbit') {
          const lean = mirror ? 0 : 0;
          for (let yy = hy0 - 9; yy <= hy0 + 1; yy++) { P(hx0 + 2 + lean, yy, ec); P(hx0 + 3 + lean, yy, behind ? ec : ei); P(hx0 + 4 + lean, yy, ec); }
          P(hx0 + 3, hy0 - 10, ec);
        } else if (e === 'deer') {
          for (let xx = 0; xx < 4; xx++) { P(hx0 - 3 + xx, hy0 + 4 - Math.floor(xx / 2), ec); P(hx0 - 3 + xx, hy0 + 5 - Math.floor(xx / 2), xx > 0 ? ei : ec); }
        } else if (e === 'pig') {
          for (let r = 0; r < 4; r++) for (let xx = 0; xx <= 3 - r; xx++) P(hx0 + 1 + xx, hy0 - 1 + r, r > 0 && xx > 0 ? ei : ec);
        } else if (e === 'tufts') {
          P(hx0 + 1, hy0 - 2, ec); P(hx0 + 1, hy0 - 1, ec); P(hx0 + 2, hy0 - 1, ec); P(hx0 + 2, hy0, ec);
        }
      };
      ear(false); ear(true);
    };

    // hair behind head (long hair, ponytails, buns)
    const hs = L.hairStyle || 'short';
    const hairBack = () => {
      if (back && hs === 'long') { rc(hx0 - 1, hy0 + 3, 16, 12, hair); }
      if (back && hs === 'curly') { for (let i = 0; i < 7; i++) ell(hx0 + i * 2, hy0 + 11 + (i % 2), 2, 3, hair); }
      if (hs === 'pony' && (back || side)) { const px0 = side ? hx1 + 1 : cx - 1; rc(px0, hy0 + 3, 2, 10, hair); rc(px0 - 1, hy0 + 2, 4, 3, hair); }
      if (hs === 'buns') { ell(hx0 + 1, hy0 + 1, 3, 3, hair); ell(hx1 - 1, hy0 + 1, 3, 3, hair); px(hx0, hy0 - 1, shade(hair, 1.2)); px(hx1 - 2, hy0 - 1, shade(hair, 1.2)); }
      if (hs === 'bun') { ell(cx, hy0 - 2, 3, 3, hair); if (has('pencil')) { rc(cx - 5, hy0 - 3, 9, 1, '#f4d03a'); px(cx - 6, hy0 - 3, '#f0a0a0'); px(cx + 4, hy0 - 3, '#2a2a2a'); } }
      if (hs === 'wild') { for (let i = 0; i < 8; i++) { const a = -Math.PI + (i / 7) * Math.PI; ell(cx + Math.round(Math.cos(a) * 8), hy0 + 4 + Math.round(Math.sin(a) * 7), 2, 2, hair); } }
      if (hs === 'cloud') { for (let i = 0; i < 6; i++) ell(cx - 8 + i * 3, hy0 + 1 + (i % 2) * 2, 3, 3, hair); }
      if (hs === 'flame') { for (let i = 0; i < 6; i++) { rc(cx - 7 + i * 3, hy0 - 4 + (i % 2) * 2, 2, 5, i % 2 ? '#ffd23a' : hair); } }
      if (hs === 'wool') { for (let i = 0; i < 9; i++) { const a = -Math.PI * 1.1 + (i / 8) * Math.PI * 1.2; ell(cx + Math.round(Math.cos(a) * 7), hy0 + 5 + Math.round(Math.sin(a) * 6), 2, 2, hair); } }
    };

    drawEars(true);
    hairBack();

    // head shape
    if (head === 'cube') {
      rc(hx0 + 1, hy0 + 1, 12, 11, '#d8d0c0'); rc(hx0 + 1, hy0 + 1, 12, 2, '#ece6da'); rc(hx0 + 11, hy0 + 1, 2, 11, '#b0a898'); rc(hx0 + 1, hy0 + 10, 12, 2, '#a8a090');
      if (!back) { px(cx - 3, hy0 + 6, '#8a8478'); px(cx + 2, hy0 + 6, '#8a8478'); }
      rc(cx - 2, hy0 + 12, 4, 1, fur);
    } else {
      for (let y = hy0; y <= hy1; y++) {
        let inset = 0;
        if (y === hy0) inset = 3; else if (y === hy0 + 1) inset = 1; else if (y === hy1) inset = 2; else if (y === hy1 - 1) inset = 1;
        rc(hx0 + inset, y, 14 - inset * 2, 1, headCol);
      }
      rc(hx0 + 1, hy1 - 1, 12, 1, shade(headCol, 0.9));
      if (head === 'void') { for (let i = 0; i < 5; i++) px(hx0 + 2 + i * 2, hy0 + 2 + (i % 2), '#3a2a5a'); }
    }

    // face
    if (!back && head !== 'cube') {
      const ey = hy0 + 6;
      const eyeL = side ? hx0 + 2 : cx - 5, eyeR = cx + 3;
      if (head === 'burlap') {
        rc(eyeL, ey, 2, 2, '#1a1410'); if (!side) rc(eyeR, ey, 2, 2, '#1a1410');
        const my = hy0 + 10; for (let i = 0; i < 7; i++) px(cx - 4 + i + (side ? -2 : 0), my - (i === 0 || i === 6 ? 1 : 0), '#3a2a1a');
        for (let i = 0; i < 4; i++) px(cx - 3 + i * 2 + (side ? -2 : 0), my + 1, '#3a2a1a');
      } else if (head === 'void') {
        const my = hy0 + 9; for (let i = 0; i < 5; i++) px(cx - 3 + i + (side ? -2 : 0), my + (i === 0 || i === 4 ? 0 : 1), '#9a7ad0');
      } else {
        // muzzle
        if (L.ears !== 'none' || ['crocodile', 'shark', 'mole'].includes(L.sp)) { }
        const muz = fur2;
        if (!has('clownpaint') && !has('beak') && !has('snout')) {
          if (side) { rc(hx0 - 1, hy0 + 8, 4, 4, muz); px(hx0 - 2, hy0 + 8, shade(fur, 0.4)); }
          else { rc(cx - 3, hy0 + 8, 6, 4, muz); rc(cx - 2, hy0 + 12, 4, 1, muz); rc(cx - 1, hy0 + 8, 2, 1, shade(fur, 0.35)); px(cx - 1, hy0 + 10, shade(fur, 0.5)); px(cx, hy0 + 10, shade(fur, 0.5)); }
        }
        if (has('snout')) { if (side) rc(hx0 - 2, hy0 + 8, 4, 3, '#f0889a'); else { rc(cx - 2, hy0 + 8, 4, 3, '#f0889a'); px(cx - 1, hy0 + 9, '#a04a5a'); px(cx, hy0 + 9, '#a04a5a'); } }
        if (has('snoutpink')) { if (side) rc(hx0 - 2, hy0 + 8, 3, 2, '#f0a0a8'); else rc(cx - 1, hy0 + 8, 3, 2, '#f0a0a8'); }
        if (has('beak')) { if (side) { rc(hx0 - 2, hy0 + 8, 3, 2, '#f4a02a'); } else { rc(cx - 1, hy0 + 8, 3, 2, '#f4a02a'); px(cx, hy0 + 10, '#d8801a'); } }
        if (has('teeth')) { if (side) { px(hx0 - 1, hy0 + 11, '#ffffff'); px(hx0 + 1, hy0 + 11, '#ffffff'); } else { for (let i = 0; i < 4; i++) px(cx - 2 + i, hy0 + 11, i % 2 ? '#ffffff' : shade(fur2, 0.9)); } }
        if (has('mask')) { rc(side ? hx0 : hx0 + 1, ey - 1, side ? 7 : 12, 4, '#2a2a30'); }
        if (has('pandapatch')) { ell(eyeL + 1, ey + 1, 2, 2, '#1a1a1e'); if (!side) ell(eyeR + 1, ey + 1, 2, 2, '#1a1a1e'); }
        if (has('clownpaint')) { rc(eyeL, ey - 3, 2, 2, '#3a6ae8'); if (!side) rc(eyeR, ey - 3, 2, 2, '#3a6ae8'); }
        // eyes
        const eyeDraw = (ex) => {
          if (has('buggyeyes')) { rc(ex - 1, ey - 1, 3, 3, '#d3242a'); px(ex - 1, ey - 1, '#ff8a8a'); return; }
          if (has('frogeyes')) { ell(ex + 1, hy0 + 1, 2, 2, fur); }
          rc(ex, ey, 2, 3, shade(eyes, 0.7)); px(ex, ey + 2, eyes); px(ex + 1, ey + 2, eyes); px(ex, ey, '#ffffff');
        };
        eyeDraw(eyeL); if (!side) eyeDraw(eyeR);
        if (has('glasses')) { const gc = '#4a4a5a'; rc(eyeL - 1, ey - 1, 4, 1, gc); rc(eyeL - 1, ey + 3, 4, 1, gc); if (!side) { rc(eyeR - 1, ey - 1, 4, 1, gc); rc(eyeR - 1, ey + 3, 4, 1, gc); rc(eyeL + 3, ey, eyeR - eyeL - 3, 1, gc); } }
        if (has('heartglasses')) { const hc = '#ff5ab0'; const H2 = (hx) => { rc(hx - 1, ey, 4, 2, hc); px(hx - 1, ey - 1, hc); px(hx + 2, ey - 1, hc); rc(hx, ey + 2, 2, 1, hc); }; H2(eyeL); if (!side) { H2(eyeR); rc(eyeL + 3, ey, eyeR - eyeL - 3, 1, hc); } }
        if (has('rednose')) { rc(side ? hx0 - 2 : cx - 1, hy0 + 8, 2, 2, '#e8282a'); }
        if (has('clownpaint') && !side) { px(cx - 2, hy0 + 11, '#e8282a'); px(cx + 1, hy0 + 11, '#e8282a'); rc(cx - 1, hy0 + 12, 2, 1, '#e8282a'); }
        // blush
        if (!side && !has('mask') && !has('pandapatch')) { px(cx - 6, ey + 4, MH.mix(headCol, '#ff6a8a', 0.5)); px(cx + 5, ey + 4, MH.mix(headCol, '#ff6a8a', 0.5)); }
        if (has('stripes')) { px(hx0, hy0 + 5, '#2a1a10'); px(hx0 + 1, hy0 + 6, '#2a1a10'); if (!side) { px(hx1, hy0 + 5, '#2a1a10'); px(hx1 - 1, hy0 + 6, '#2a1a10'); } rc(cx - 1, hy0 + 1, 2, 2, '#2a1a10'); }
      }
    }
    if (back && head !== 'cube' && head !== 'void') {
      // back of head: mostly hair
      if (hs !== 'none') { for (let y = hy0; y <= hy0 + 9; y++) { const inset = y === hy0 ? 3 : y === hy0 + 1 ? 1 : 0; rc(hx0 + inset, y, 14 - inset * 2, 1, hair); } }
      if (has('stripes')) { rc(cx - 3, hy0 + 2, 1, 4, '#2a1a10'); rc(cx + 2, hy0 + 2, 1, 4, '#2a1a10'); }
    }
    // bangs
    if (!back && hs !== 'none' && head !== 'cube' && head !== 'burlap' && head !== 'void') {
      const bh = hs === 'curly' || hs === 'wild' || hs === 'messy' || hs === 'wool' || hs === 'cloud' ? 4 : 3;
      for (let y = hy0; y < hy0 + bh; y++) { const inset = y === hy0 ? 3 : y === hy0 + 1 ? 1 : 0; rc(hx0 + inset, y, 14 - inset * 2, 1, hair); }
      for (let i = 0; i < 14; i += 2) { const d = Math.floor(MH.hash2(i, hs.length, 4) * 3); if (d) rc(hx0 + i + (side ? -1 : 0), hy0 + bh, 2, d, hair); }
      if (hs === 'long' || hs === 'curly') { rc(hx0 - 1, hy0 + 2, 2, 10, hair); if (!side) rc(hx1, hy0 + 2, 2, 10, hair); }
      if (hs === 'wild') { px(hx0 + 2, hy0 - 1, hair); px(hx0 + 6, hy0 - 2, hair); px(hx1 - 3, hy0 - 1, hair); }
      px(hx0 + 4, hy0 + 1, shade(hair, 1.25)); px(hx0 + 5, hy0 + 1, shade(hair, 1.25));
    }
    if (hs === 'straw') { for (let i = 0; i < 7; i++) { px(hx0 - 1 + i * 2, hy0 + 9 + (i % 2), '#e0c070'); px(hx0 + i * 2, hy0 + 10 + (i % 3), '#d0b060'); } }

    drawEars(false);

    // head accessories
    if (has('antlers')) {
      const ac = '#8a6a4a';
      const ant = (mx) => { const P = (xx, yy) => px(mx ? 2 * cx - 1 - xx : xx, yy, ac); for (let i = 0; i < 6; i++) P(hx0 + 3 - Math.floor(i / 3), hy0 - i); P(hx0 + 1, hy0 - 6); P(hx0, hy0 - 7); P(hx0 + 3, hy0 - 4); P(hx0 + 4, hy0 - 5); P(hx0 - 1, hy0 - 3); P(hx0 - 2, hy0 - 4); };
      ant(false); ant(true);
      if (has('fairylights')) { [['#ff6ad0', hx0 + 2, hy0 - 2], ['#6af0ff', hx0, hy0 - 7], ['#fff06a', hx1 - 1, hy0 - 3], ['#a0ff6a', hx1 + 1, hy0 - 6], ['#ff9a4a', hx0 + 4, hy0 - 5]].forEach(([col, a, b2]) => px(a, b2, col)); }
    }
    if (has('comb')) { rc(cx - 2, hy0 - 3, 2, 3, '#e8282a'); rc(cx, hy0 - 4, 2, 4, '#e8282a'); rc(cx + 2, hy0 - 2, 1, 2, '#e8282a'); }
    if (has('antennae')) { for (let i = 0; i < 6; i++) { px(cx - 3 - Math.floor(i / 2), hy0 - i, '#3a3440'); px(cx + 2 + Math.floor(i / 2), hy0 - i, '#3a3440'); } px(cx - 7, hy0 - 6, '#3a3440'); px(cx + 6, hy0 - 6, '#3a3440'); }
    if (has('fin')) { for (let i = 0; i < 5; i++) rc(cx - 1 + (side ? 3 : 0), hy0 - i, 5 - i, 1, shade(fur, 0.9)); }
    if (has('headset')) { rc(hx0, hy0 + 1, 14, 1, '#2a2a30'); rc(hx0 - 1, hy0 + 6, 2, 4, '#3a3a40'); if (!side) rc(hx1, hy0 + 6, 2, 4, '#3a3a40'); if (!back && !side) { px(hx1, hy0 + 10, '#3a3a40'); px(hx1 - 1, hy0 + 11, '#3a3a40'); } }
    if (has('strawhat')) { rc(hx0 - 4, hy0 + 1, 22, 2, '#e0c070'); rc(hx0 - 4, hy0 + 2, 22, 1, '#b89a50'); rc(hx0 + 2, hy0 - 4, 10, 5, '#e0c070'); rc(hx0 + 2, hy0, 10, 1, '#8a3a3a'); }
    if (has('postcap')) { rc(hx0 + 1, hy0 - 1, 12, 4, '#3a5a9a'); if (!back) rc(side ? hx0 - 2 : hx0 + 3, hy0 + 2, side ? 5 : 8, 1, '#2a3a6a'); px(cx, hy0, '#f4d03a'); }
    if (has('rays')) { const rcx = '#ffd23a'; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; px(cx + Math.round(Math.cos(a) * 10), hy0 + 6 + Math.round(Math.sin(a) * 9), rcx); } }

    return c;
  }

  art.chibi = function (ch) {
    const key = 'ch_' + ch.id;
    if (art.cache[key]) return art.cache[key];
    const L = Object.assign({ sp: ch.species }, ch.look);
    const set = { down: [], up: [], left: [], right: [] };
    for (let f = 0; f < 3; f++) {
      set.down.push(outline(drawChibi(L, 'down', f)));
      set.up.push(outline(drawChibi(L, 'up', f)));
      const l = outline(drawChibi(L, 'left', f));
      set.left.push(l);
      set.right.push(flipH(l));
    }
    set.scale = (ch.look && ch.look.size) || 1;
    art.cache[key] = set;
    return set;
  };

  // Player look builder
  art.playerLook = function (p) {
    return {
      fur: p.skin || '#f2c9a0', fur2: shade(p.skin || '#f2c9a0', 1.12), hair: p.hair || '#5a3a2a', hairStyle: p.hairStyle || 'short',
      ears: p.ears || 'none', earIn: '#f0b0b0', tail: p.tail || 'none', eyes: p.eyes || '#3a4a8a', top: p.top || '#4a7ad8', bottom: p.bottom || '#3a3a5a', acc: p.acc || [],
    };
  };

  // Pixel portrait (bust) for villagers without artwork.
  art.portrait = function (ch) {
    const key = 'pt_' + ch.id;
    if (art.cache[key]) return art.cache[key];
    const set = art.chibi(ch);
    const src = set.down[0];
    const [c, x] = mk(CW, CH);
    x.drawImage(src, 0, 0);
    art.cache[key] = c;
    return c;
  };
  art.portraitURL = function (ch) {
    const k = 'pu_' + ch.id;
    if (art.cache[k]) return art.cache[k];
    const p = art.portrait(ch);
    // upscale to crisp 6x
    const s = 6;
    const [c, x] = mk(p.width * s, p.height * s);
    x.imageSmoothingEnabled = false;
    x.drawImage(p, 0, 0, p.width * s, p.height * s);
    art.cache[k] = c.toDataURL();
    return art.cache[k];
  };

  // ======================================================================== EMOTES (9x9)
  const EMO = {
    '!': ['...##....', '...##....', '...##....', '...##....', '...##....', '.........', '...##....', '...##....', '.........'],
    '?': ['..####...', '.##..##..', '.....##..', '....##...', '...##....', '...##....', '.........', '...##....', '...##....'],
    heart: ['.........', '.##.##...', '#######..', '#######..', '.#####...', '..###....', '...#.....', '.........', '.........'],
    anger: ['.#...#...', '..#.#....', '.........', '##...##..', '.........', '..#.#....', '.#...#...', '.........', '.........'],
    note: ['...####..', '...#..#..', '...#..#..', '...#..#..', '.###.###.', '####.###.', '.##...#..', '.........', '.........'],
    zzz: ['....####.', '......#..', '.....#...', '....####.', '###......', '..#......', '.#.......', '###......', '.........'],
    dots: ['.........', '.........', '.........', '.........', '#..#..#..', '#..#..#..', '.........', '.........', '.........'],
    sweat: ['....#....', '...##....', '..###....', '..###....', '...#.....', '.........', '.........', '.........', '.........'],
  };
  const EMO_COL = { '!': '#ffd23a', '?': '#8ad0ff', heart: '#ff5a8a', anger: '#ff4a3a', note: '#b08aff', zzz: '#cfe6ff', dots: '#ffffff', sweat: '#8ad0ff' };
  art.emote = function (name) {
    const k = 'em_' + name;
    if (art.cache[k]) return art.cache[k];
    const rows = EMO[name] || EMO.dots;
    const [c, x] = mk(13, 13); C = x;
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') px(i + 2, j + 2, EMO_COL[name] || '#fff'); }));
    outline(c, 0.3, '#1a1420');
    art.cache[k] = c;
    return c;
  };
})(window.MH);
