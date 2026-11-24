// Mirehollow — town map generation, collision, locations, pathfinding.
'use strict';
(function (MH) {
  const T = MH.TILE;
  const W = 104, H = 78;
  const G = { GRASS: 0, WOODS: 1, PATH: 2, PLAZA: 3, SAND: 4, WATER: 5, SWAMP: 6, MUD: 7, FIELD: 8, BOARD: 9, DEEP: 10 };
  MH.G = G;

  const world = (MH.world = {
    W, H,
    ground: new Uint8Array(W * H),
    solid: new Uint8Array(W * H),
    deco: new Uint8Array(W * H), // small ground decoration ids
    props: [],
    buildings: [],
    locations: {},
    lights: [],
    interactables: [],
  });

  const idx = (x, y) => y * W + x;
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  world.inBounds = inB;
  world.g = (x, y) => (inB(x, y) ? world.ground[idx(x, y)] : G.WOODS);
  const setG = (x, y, v) => { if (inB(x, y)) world.ground[idx(x, y)] = v; };
  world.isSolid = (x, y) => !inB(x, y) || world.solid[idx(x, y)] === 1;
  const setSolid = (x, y, v = 1) => { if (inB(x, y)) world.solid[idx(x, y)] = v; };
  world.setSolid = setSolid;
  world.isWater = (x, y) => { const g = world.g(x, y); return g === G.WATER || g === G.SWAMP || g === G.DEEP; };

  // ---------------------------------------------------------------- layout
  // Building catalogue. x,y,w,h = footprint in tiles (solid). Door on bottom row.
  const BUILDINGS = [
    { id: 'bakery', name: 'Golden Loaf Bakery', x: 40, y: 20, w: 7, h: 4, wall: '#f3e2c4', roof: '#d9733a', trim: '#8a4a2a', sign: 'bread', awning: ['#f4c84a', '#fff4d8'] },
    { id: 'townhall', name: 'Town Hall', x: 51, y: 18, w: 7, h: 6, wall: '#d8cdb8', roof: '#5a6a8a', trim: '#4a3a30', sign: 'clock', crooked: true },
    { id: 'lab', name: 'Bookstore (definitely not a lab)', x: 30, y: 27, w: 6, h: 4, wall: '#b8c4c8', roof: '#5a4a6a', trim: '#3a3040', sign: 'book', glow: '#7affc0' },
    { id: 'store', name: 'General Store', x: 40, y: 43, w: 7, h: 4, wall: '#e8d8b8', roof: '#3a7a4a', trim: '#2a4a30', sign: 'bag', awning: ['#3a8a5a', '#e8f4e0'] },
    { id: 'club', name: 'The Velvet Antler', x: 59, y: 30, w: 7, h: 5, wall: '#4a2a5a', roof: '#2a1a3a', trim: '#e04aa0', sign: 'heart', neon: true },
    { id: 'clinic', name: 'Doctor Owl\'s Clinic', x: 60, y: 20, w: 5, h: 4, wall: '#f4f4f0', roof: '#c84a4a', trim: '#7a3030', sign: 'cross' },
    { id: 'barber', name: 'Sheep\'s Barbershop', x: 32, y: 43, w: 5, h: 4, wall: '#f0e8f0', roof: '#7a5a8a', trim: '#4a3a5a', sign: 'scissors', pole: true },
    { id: 'coop', name: 'The Coop', x: 10, y: 22, w: 9, h: 5, wall: '#f4ecd8', roof: '#c8583a', trim: '#7a4a2a', sign: 'egg' },
    { id: 'postoffice', name: 'Post Office', x: 22, y: 20, w: 5, h: 4, wall: '#d8e0ec', roof: '#3a5a9a', trim: '#2a3a5a', sign: 'mail' },
    { id: 'honeycomb', name: 'The Honeycomb', x: 19, y: 35, w: 6, h: 4, wall: '#f2c84a', roof: '#b8862a', trim: '#6a4a1a', sign: 'controller', round: true },
    { id: 'gym', name: 'The Burrow Gym', x: 8, y: 44, w: 8, h: 4, wall: '#c8b8a0', roof: '#4a6a4a', trim: '#2a3a2a', sign: 'dumbbell' },
    { id: 'workshop', name: 'Beaver\'s Workshop', x: 5, y: 33, w: 6, h: 4, wall: '#c8a070', roof: '#7a5a3a', trim: '#4a3020', sign: 'saw', crooked: true },
    { id: 'home', name: 'Your Cottage', x: 24, y: 48, w: 5, h: 4, wall: '#f4ead8', roof: '#4a8ac8', trim: '#2a4a6a', sign: 'star' },
    { id: 'lilycottage', name: 'Lily Pad Cottage', x: 62, y: 40, w: 5, h: 3, wall: '#e0f0c8', roof: '#4ab04a', trim: '#2a6a2a', sign: 'lily', round: true },
    { id: 'stilthouse', name: 'The Stilt House', x: 90, y: 24, w: 6, h: 4, wall: '#4a4450', roof: '#2a2430', trim: '#8a2a3a', sign: 'drop', stilts: true },
    { id: 'gatorgrove', name: 'The Gator Grove', x: 86, y: 56, w: 7, h: 4, wall: '#7a6a4a', roof: '#4a5a2a', trim: '#3a3020', sign: 'tooth' },
    { id: 'den', name: 'Kira\'s Den', x: 28, y: 5, w: 6, h: 3, cave: true, sign: null },
  ];

  // Location rectangles (tiles, inclusive) for schedules and AI scene descriptions.
  const LOCS = {
    square: { name: 'the Market Square', r: [38, 26, 57, 40], desc: 'the cobbled market square under a ring of old trees' },
    well: { name: 'the old well', r: [46, 32, 50, 35], desc: 'beside the old wishing well in the middle of the square' },
    bakery: { name: 'the Golden Loaf Bakery', r: [41, 24, 46, 26], desc: 'outside the Golden Loaf Bakery, smelling of cinnamon' },
    townhall: { name: 'Town Hall', r: [52, 24, 57, 26], desc: 'on the crooked steps of Town Hall' },
    lab: { name: 'the Bookstore', r: [30, 31, 36, 32], desc: 'outside the bookstore that is obviously a lab (something is glowing in the window)' },
    store: { name: 'the General Store', r: [40, 47, 46, 48], desc: 'outside Sable\'s General Store' },
    club: { name: 'the Velvet Antler', r: [59, 35, 65, 36], desc: 'outside the Velvet Antler club, bass thumping through the walls' },
    clinic: { name: 'the Clinic', r: [60, 24, 64, 25], desc: 'outside Doctor Owl\'s clinic' },
    barber: { name: 'the Barbershop', r: [32, 47, 36, 48], desc: 'outside the barbershop' },
    coop: { name: 'the Coop', r: [9, 27, 20, 31], desc: 'in the Coop\'s chaotic yard on Clutch Lane, chicks everywhere' },
    postoffice: { name: 'the Post Office', r: [22, 24, 26, 25], desc: 'outside the little post office' },
    honeycomb: { name: 'the Honeycomb', r: [19, 39, 24, 40], desc: 'outside the Honeycomb, gaming noises leaking out' },
    gym: { name: 'the Burrow Gym', r: [7, 48, 16, 50], desc: 'outside the Burrow Gym, weights clanking' },
    workshop: { name: 'the Workshop', r: [5, 37, 10, 38], desc: 'outside the crooked workshop, sawdust everywhere' },
    home: { name: 'your cottage', r: [24, 52, 28, 53], desc: 'in front of the player\'s little cottage' },
    lilycottage: { name: 'Lily Pad Cottage', r: [61, 43, 66, 43], desc: 'on the porch of Lily Pad Cottage by the pond' },
    pond: { name: 'the Duck Pond', r: [56, 44, 78, 58], desc: 'on the sandy shore of the duck pond' },
    tower: { name: 'the Lifeguard Tower', r: [74, 47, 77, 50], desc: 'at the foot of Marina\'s lifeguard tower' },
    eastlane: { name: 'the East Lane', r: [70, 33, 82, 35], desc: 'on the east lane where the last lamp post marks the edge of the swamp' },
    swamp: { name: 'the Swamp', r: [84, 30, 100, 54], desc: 'in the humming, misty swamp' },
    stilthouse: { name: 'the Stilt House', r: [89, 28, 96, 30], desc: 'on the boardwalk below Maggie\'s Stilt House in the swamp' },
    gatorgrove: { name: 'the Gator Grove', r: [85, 60, 94, 62], desc: 'at the muddy Gator Grove, with suspicious hissing from the bushes' },
    woods: { name: 'the Deep Woods', r: [12, 4, 66, 13], desc: 'in the dim, ancient Deep Woods' },
    den: { name: 'Kira\'s Den', r: [27, 8, 34, 11], desc: 'in the sunny clearing outside Kira\'s den in the woods' },
    field: { name: 'the Cornfields', r: [34, 60, 62, 72], desc: 'among the rustling cornfields south of town' },
    lanes: { name: 'the village lanes', r: [6, 30, 36, 34], desc: 'on the winding village lanes lined with flower boxes' },
    sky: { name: 'the sky', r: [46, 30, 50, 36], desc: 'somewhere above the clouds' },
  };

  function rect(x0, y0, x1, y1, fn) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inB(x, y)) fn(x, y);
  }

  function paintPath(points, width, type = G.PATH) {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i], [bx, by] = points[i + 1];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2 + 1;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t);
        for (let dy = 0; dy < width; dy++) for (let dx = 0; dx < width; dx++) {
          const g = world.g(x + dx, y + dy);
          if (g === G.WATER || g === G.SWAMP || g === G.DEEP) setG(x + dx, y + dy, G.BOARD);
          else if (g !== G.PLAZA) setG(x + dx, y + dy, type);
        }
      }
    }
  }

  const prop = (type, tx, ty, opts = {}) => {
    const p = Object.assign({ type, x: tx * T + T / 2, y: ty * T + T - 1, tx, ty }, opts);
    world.props.push(p);
    if (opts.solid !== false) setSolid(tx, ty, 1);
    return p;
  };
  const free = (x, y) => inB(x, y) && !world.isSolid(x, y) && !world.isWater(x, y);
  const groundIs = (x, y, ...types) => types.includes(world.g(x, y));

  world.gen = function () {
    const rng = MH.seeded(1337);
    world.ground.fill(G.GRASS);
    world.solid.fill(0);
    world.props.length = 0;
    world.buildings.length = 0;
    world.lights.length = 0;
    world.interactables.length = 0;

    // --- Deep woods (north) with a wavy edge
    for (let x = 0; x < W; x++) {
      const edge = 14 + Math.round(Math.sin(x * 0.23) * 1.5 + Math.sin(x * 0.07) * 2);
      for (let y = 0; y < edge; y++) setG(x, y, G.WOODS);
    }
    // --- Swamp (east)
    for (let y = 0; y < H; y++) {
      const edge = 82 + Math.round(Math.sin(y * 0.2) * 1.5 + Math.sin(y * 0.05) * 2);
      for (let x = edge; x < W; x++) {
        const n = MH.hash2(x >> 1, y >> 1, 7);
        setG(x, y, n < 0.42 ? G.SWAMP : G.MUD);
      }
    }
    // --- Pond (ellipse) with sand ring
    const pcx = 67, pcy = 51, prx = 9.5, pry = 6.2;
    for (let y = 38; y < 64; y++) for (let x = 52; x < 82; x++) {
      const d = ((x - pcx) / prx) ** 2 + ((y - pcy) / pry) ** 2;
      const wob = MH.hash2(x, y, 3) * 0.12;
      if (d < 0.55 + wob) setG(x, y, G.DEEP);
      else if (d < 1 + wob) setG(x, y, G.WATER);
      else if (d < 1.55 + wob && world.g(x, y) === G.GRASS) setG(x, y, G.SAND);
    }
    // --- Cornfield (south)
    rect(33, 59, 63, 73, (x, y) => setG(x, y, G.FIELD));
    // --- Market square
    rect(38, 26, 57, 40, (x, y) => setG(x, y, G.PLAZA));

    // --- Lanes
    paintPath([[2, 32], [38, 32]], 2);                 // Clutch Lane (west)
    paintPath([[57, 32], [83, 33]], 2);                // East lane to swamp
    paintPath([[47, 13], [47, 26]], 2);                // North lane to woods
    paintPath([[47, 40], [47, 59]], 2);                // South lane to fields
    paintPath([[47, 13], [40, 11], [33, 11]], 2);      // woods trail to den
    paintPath([[14, 32], [14, 42]], 2);                // to gym
    paintPath([[14, 42], [30, 42], [38, 42]], 2);      // lower lane
    paintPath([[26, 42], [26, 51]], 2);                // to home
    paintPath([[21, 32], [21, 36]], 2);                // to honeycomb
    paintPath([[24, 24], [24, 32]], 2);                // post office
    paintPath([[8, 32], [8, 37]], 2);                  // workshop
    paintPath([[33, 31], [33, 32]], 2);                // lab door
    paintPath([[43, 46], [43, 49], [47, 49]], 2);      // store front
    paintPath([[34, 46], [34, 42]], 2);                // barber
    paintPath([[62, 33], [62, 36]], 2);                // club
    paintPath([[62, 24], [62, 32]], 2);                // clinic
    paintPath([[64, 33], [64, 43]], 2);                // lily cottage
    paintPath([[71, 34], [75, 46]], 2);                // to tower
    // swamp boardwalks
    paintPath([[83, 33], [92, 33], [92, 28]], 2, G.BOARD);
    paintPath([[92, 33], [92, 46], [89, 52], [89, 60]], 2, G.BOARD);
    paintPath([[92, 40], [100, 40]], 2, G.BOARD);
    // field path
    paintPath([[47, 59], [47, 72]], 2);
    paintPath([[36, 66], [60, 66]], 1);

    // --- Buildings
    BUILDINGS.forEach((b) => {
      const bb = Object.assign({}, b);
      bb.doorX = b.x + Math.floor(b.w / 2);
      bb.doorY = b.y + b.h - 1;
      world.buildings.push(bb);
      // clear ground under building + front
      rect(b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, (x, y) => {
        setSolid(x, y, 1);
        if (!b.stilts && !b.cave) setG(x, y, world.g(x, y) === G.PLAZA ? G.PLAZA : G.PATH);
      });
      // door front tile walkable path
      if (!b.stilts) setG(bb.doorX, bb.doorY + 1, world.g(bb.doorX, bb.doorY + 1) === G.PLAZA ? G.PLAZA : (world.g(bb.doorX, bb.doorY + 1) === G.BOARD ? G.BOARD : G.PATH));
      // lights in windows at night
      world.lights.push({ x: (b.x + b.w / 2) * T, y: (b.y + b.h - 1) * T, r: 34, color: b.glow || '#ffd890', window: true, b: bb });
      if (b.id === 'home') world.interactables.push({ type: 'sleep', tx: bb.doorX, ty: bb.doorY + 1, label: 'Rest at home' });
      world.interactables.push({ type: 'door', tx: bb.doorX, ty: bb.doorY + 1, b: bb, label: bb.name });
    });

    // --- Square furniture
    prop('well', 48, 33, { w: 2 }); setSolid(47, 33);
    world.interactables.push({ type: 'well', tx: 48, ty: 34, label: 'Toss a coin in the well' });
    prop('board', 55, 27); world.interactables.push({ type: 'board', tx: 55, ty: 28, label: 'Read the Grapevine board' });
    [[41, 29], [53, 29], [41, 37], [53, 37]].forEach(([x, y]) => prop('bench', x, y));
    [[39, 27], [56, 27], [39, 39], [56, 39]].forEach(([x, y]) => prop('oak', x, y, { big: true }));
    [[44, 31], [51, 31], [44, 36], [51, 36]].forEach(([x, y]) => prop('planter', x, y));
    // stalls
    prop('stall', 41, 33, { color: '#d94a4a' });
    prop('stall', 54, 33, { color: '#4a8ad9' });

    // --- Lamp posts along lanes
    const lamps = [[37, 31], [30, 34], [20, 31], [10, 34], [58, 31], [66, 34], [74, 32], [81, 32], [46, 25], [49, 41], [46, 50], [27, 47], [15, 40], [49, 15], [64, 37]];
    lamps.forEach(([x, y], i) => {
      if (!free(x, y)) return;
      const p = prop('lamp', x, y, { last: i === 7 });
      world.lights.push({ x: p.x, y: p.y - 26, r: 46, color: '#ffcf7a', lamp: true });
    });

    // --- Coop yard fence
    for (let x = 8; x <= 20; x++) { if (x !== 14 && x !== 15) prop('fence', x, 31, { solid: true }); }
    for (let y = 27; y <= 30; y++) { prop('fence', 8, y, { vert: true }); prop('fence', 20, y, { vert: true }); }
    // home garden
    for (let x = 23; x <= 29; x++) if (x !== 26 && x !== 27) prop('fence', x, 54, { small: true });
    prop('mailbox', 29, 52);
    // player garden flowers
    [[23, 53], [24, 53], [29, 53]].forEach(([x, y]) => free(x, y) && prop('flowers', x, y, { solid: false, pick: 'wildflower', color: '#f07ac0' }));

    // --- Lifeguard tower & pond props
    prop('tower', 75, 46, { w: 2 }); setSolid(76, 46); setSolid(75, 45); setSolid(76, 45);
    for (let i = 0; i < 14; i++) {
      const x = rng.int(56, 78), y = rng.int(44, 58);
      if (world.g(x, y) === G.WATER || world.g(x, y) === G.DEEP) world.props.push({ type: 'lilypad', x: x * T + 8, y: y * T + 12, tx: x, ty: y, flat: true });
    }
    for (let i = 0; i < 26; i++) {
      const x = rng.int(55, 80), y = rng.int(41, 61);
      if (world.g(x, y) === G.SAND && !world.isSolid(x, y)) {
        if (rng() < 0.35) world.props.push({ type: 'shell', x: x * T + 8, y: y * T + 10, tx: x, ty: y, flat: true, pick: 'seashell' });
        else if (rng() < 0.6) prop('reeds', x, y, { solid: false });
      }
    }
    prop('dock', 64, 45, { solid: false, flat: true });

    // --- Kira's den clearing
    rect(26, 7, 35, 12, (x, y) => { if (world.g(x, y) === G.WOODS) setG(x, y, G.GRASS); });
    prop('log', 31, 10, { w: 2 });

    // --- Scarecrow's post & corn rows
    for (let y = 60; y <= 72; y += 2) for (let x = 34; x <= 62; x++) {
      if (Math.abs(x - 47) <= 1 || y === 66 || (x >= 44 && x <= 50 && y >= 62 && y <= 66)) continue;
      if (rng() < 0.85) prop('corn', x, y, { solid: true, pick: rng() < 0.12 ? 'corn' : null });
    }
    prop('post', 47, 64, { solid: false });
    rect(44, 62, 50, 66, (x, y) => { if (world.g(x, y) === G.FIELD) setG(x, y, G.GRASS); });

    // --- Swamp props
    for (let i = 0; i < 70; i++) {
      const x = rng.int(83, W - 2), y = rng.int(2, H - 2);
      const g = world.g(x, y);
      if (world.isSolid(x, y) || g === G.BOARD) continue;
      if (g === G.MUD && rng() < 0.5) prop('deadtree', x, y);
      else if (g === G.MUD) prop('reeds', x, y, { solid: false, swamp: true });
      else if (g === G.SWAMP && rng() < 0.3) world.props.push({ type: 'lilypad', x: x * T + 8, y: y * T + 12, tx: x, ty: y, flat: true, swamp: true });
    }
    for (let i = 0; i < 16; i++) {
      const x = rng.int(83, W - 2), y = rng.int(2, H - 2);
      if (world.g(x, y) === G.MUD && !world.isSolid(x, y)) world.props.push({ type: 'mushroom', x: x * T + 8, y: y * T + 12, tx: x, ty: y, flat: true, pick: 'mushroom' });
    }
    // swamp lanterns (eerie)
    [[86, 32], [94, 36], [90, 45], [91, 55]].forEach(([x, y]) => {
      if (world.isSolid(x, y)) return;
      const p = prop('lantern', x, y);
      world.lights.push({ x: p.x, y: p.y - 18, r: 40, color: '#b8ff9a', lamp: true });
    });

    // --- Woods trees (dense), avoiding paths & clearing
    for (let y = 0; y < 17; y++) for (let x = 0; x < 84; x++) {
      if (world.g(x, y) !== G.WOODS || world.isSolid(x, y)) continue;
      const n = MH.hash2(x, y, 11);
      const near = world.g(x, y + 1) === G.PATH || world.g(x + 1, y) === G.PATH || world.g(x - 1, y) === G.PATH || world.g(x, y - 1) === G.PATH;
      if (near) continue;
      if (n < 0.42) prop(n < 0.2 ? 'pine' : 'oak', x, y, { dark: true });
      else if (n < 0.47) world.props.push({ type: 'mushroom', x: x * T + 8, y: y * T + 12, tx: x, ty: y, flat: true, pick: 'mushroom' });
      else if (n < 0.53) prop('bush', x, y, { berry: true, pick: 'berries' });
    }
    // fill woods edge rows solid so you can't leave the map
    for (let x = 0; x < W; x++) { setSolid(x, 0); setSolid(x, H - 1); }
    for (let y = 0; y < H; y++) { setSolid(0, y); setSolid(W - 1, y); }

    // --- Village greenery (oaks, bushes, flowers) on open grass
    for (let i = 0; i < 520; i++) {
      const x = rng.int(1, 82), y = rng.int(15, H - 2);
      if (world.g(x, y) !== G.GRASS || world.isSolid(x, y)) continue;
      // keep clear of paths/plaza/buildings
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) {
        const g = world.g(x + dx, y + dy);
        if (g === G.PATH || g === G.PLAZA || g === G.BOARD || g === G.SAND || world.isSolid(x + dx, y + dy)) { ok = false; break; }
      }
      if (!ok) continue;
      const r = rng();
      if (r < 0.32) prop('oak', x, y);
      else if (r < 0.48) prop('bush', x, y, { berry: rng() < 0.25, pick: null });
      else if (r < 0.78) world.props.push({ type: 'flowers', x: x * T + 8, y: y * T + 12, tx: x, ty: y, flat: true, color: rng.pick(['#f07ac0', '#f4d03a', '#ffffff', '#8a7af0', '#f05a4a']), pick: 'wildflower' });
      else if (r < 0.84) prop('rock', x, y);
      else if (r < 0.9) world.props.push({ type: 'flowers', x: x * T + 8, y: y * T + 12, tx: x, ty: y, flat: true, color: '#d8364a', rose: true, pick: 'rose' });
    }
    // flower boxes / roses along fences near houses
    world.buildings.forEach((b) => {
      if (b.cave || b.stilts) return;
      for (const dx of [-1, b.w]) {
        const x = b.x + dx, y = b.y + b.h - 1;
        if (free(x, y) && world.g(x, y) === G.GRASS && rng() < 0.7) prop('bush', x, y, { roses: true, pick: 'rose' });
      }
    });

    // --- Field crows / bottle caps easter eggs
    world.props.push({ type: 'cap', x: 56 * T + 8, y: 22 * T + 12, tx: 56, ty: 22, flat: true, pick: 'bottlecap' });

    // Locations
    for (const k in LOCS) world.locations[k] = Object.assign({ key: k }, LOCS[k]);
    world.buildingById = {};
    world.buildings.forEach((b) => (world.buildingById[b.id] = b));
  };

  // ---------------------------------------------------------------- queries
  world.walkable = (tx, ty) => inB(tx, ty) && !world.isSolid(tx, ty) && !world.isWater(tx, ty);

  world.randomSpot = function (locKey, tries = 40) {
    const L = world.locations[locKey] || world.locations.square;
    const [x0, y0, x1, y1] = L.r;
    for (let i = 0; i < tries; i++) {
      const x = MH.randi(x0, x1), y = MH.randi(y0, y1);
      if (world.walkable(x, y)) return { tx: x, ty: y };
    }
    // fallback: nearest walkable to center
    return world.nearestWalkable(Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2));
  };

  world.nearestWalkable = function (tx, ty) {
    for (let r = 0; r < 12; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (world.walkable(tx + dx, ty + dy)) return { tx: tx + dx, ty: ty + dy };
      }
    return { tx: 47, ty: 34 };
  };

  world.doorFront = function (locKey) {
    const b = world.buildingById && world.buildingById[locKey];
    if (b) return world.nearestWalkable(b.doorX, b.doorY + 1);
    return world.randomSpot(locKey);
  };

  // Which named place is (px,py) in? Smallest containing rect wins.
  world.placeAt = function (px, py) {
    const tx = Math.floor(px / T), ty = Math.floor(py / T);
    let best = null, bestA = 1e9;
    for (const k in world.locations) {
      if (k === 'sky') continue;
      const [x0, y0, x1, y1] = world.locations[k].r;
      if (tx >= x0 - 1 && tx <= x1 + 1 && ty >= y0 - 1 && ty <= y1 + 1) {
        const a = (x1 - x0 + 1) * (y1 - y0 + 1);
        if (a < bestA) { bestA = a; best = world.locations[k]; }
      }
    }
    if (best) return best;
    const g = world.g(tx, ty);
    if (g === G.WOODS) return world.locations.woods;
    if (g === G.MUD || g === G.SWAMP) return world.locations.swamp;
    if (g === G.FIELD) return world.locations.field;
    if (tx < 38) return world.locations.lanes;
    return { key: 'village', name: 'the village', desc: 'on a quiet lane in the village' };
  };

  // ---------------------------------------------------------------- A* pathfinding
  world.findPath = function (sx, sy, gx, gy, maxNodes = 6000) {
    if (!world.walkable(gx, gy)) { const n = world.nearestWalkable(gx, gy); gx = n.tx; gy = n.ty; }
    if (sx === gx && sy === gy) return [];
    const N = W * H;
    const gScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = [];
    const push = (i, f) => {
      heap.push([f, i]);
      let c = heap.length - 1;
      while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let c = 0;
        for (;;) {
          const l = c * 2 + 1, r = l + 1; let m = c;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m;
        }
      }
      return top;
    };
    const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return dx + dy - 0.6 * Math.min(dx, dy); };
    const s = idx(sx, sy), goal = idx(gx, gy);
    gScore[s] = 0; push(s, h(sx, sy));
    let count = 0;
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4], [-1, 1, 1.4], [1, -1, 1.4], [-1, -1, 1.4]];
    while (heap.length && count++ < maxNodes) {
      const [, cur] = pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W, cy = (cur / W) | 0;
      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!world.walkable(nx, ny)) continue;
        if (dx && dy && (!world.walkable(cx + dx, cy) || !world.walkable(cx, cy + dy))) continue;
        const ni = idx(nx, ny);
        // prefer roads a little
        const gnd = world.ground[ni];
        const pref = gnd === G.PATH || gnd === G.PLAZA || gnd === G.BOARD ? 0.8 : 1;
        const ng = gScore[cur] + cost * pref;
        if (ng < gScore[ni]) { gScore[ni] = ng; came[ni] = cur; push(ni, ng + h(nx, ny) * 0.8); }
      }
    }
    if (came[goal] === -1) return null;
    const path = [];
    for (let c = goal; c !== s; c = came[c]) path.push({ tx: c % W, ty: (c / W) | 0 });
    return path.reverse();
  };
})(window.MH);
