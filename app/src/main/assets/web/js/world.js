// Mirehollow — town map generation, collision, locations, pathfinding.
// A countryside town: railway with level crossings, station, utility poles, tiled-roof houses,
// lush greenery, river, shrine, park, paddies — plus the player's house interior (x >= 152).
'use strict';
(function (MH) {
  const T = MH.TILE;
  const W = 220, H = 130, TOWN_W = 150;
  const G = { GRASS: 0, WOODS: 1, PATH: 2, PLAZA: 3, SAND: 4, WATER: 5, SWAMP: 6, MUD: 7, FIELD: 8, BOARD: 9, DEEP: 10, ROAD: 11, RAIL: 12, PADDY: 13, FLOOR: 14, TATAMI: 15, VOID: 16, STONE: 17, CROSS: 18, WALL: 19, TILEF: 20, RUBBER: 21, CARPET: 22 };
  MH.G = G;

  const world = (MH.world = {
    W, H, TOWN_W,
    ground: new Uint8Array(W * H),
    solid: new Uint8Array(W * H),
    props: [], buildings: [], locations: {}, lights: [], interactables: [], poles: [], wires: [], crossings: [],
    interior: { x0: 154, y0: 4, x1: 167, y1: 13 },
  });

  const idx = (x, y) => y * W + x;
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  world.inBounds = inB;
  world.g = (x, y) => (inB(x, y) ? world.ground[idx(x, y)] : G.VOID);
  const setG = (x, y, v) => { if (inB(x, y)) world.ground[idx(x, y)] = v; };
  world.setG = setG;
  world.isSolid = (x, y) => !inB(x, y) || world.solid[idx(x, y)] === 1;
  const setSolid = (x, y, v = 1) => { if (inB(x, y)) world.solid[idx(x, y)] = v; };
  world.setSolid = setSolid;
  world.isWater = (x, y) => { const g = world.g(x, y); return g === G.WATER || g === G.SWAMP || g === G.DEEP; };
  // ---------------------------------------------------------------- interiors (rooms live off-map, x >= 152)
  // x0..x1 / y0..y1 include the walls. Two top rows are the back wall; the door gap is in the bottom wall.
  const ROOMS = {
    home: { x0: 154, y0: 4, x1: 167, y1: 13, floor: G.FLOOR, wall: '#efe2c8', building: 'home', name: 'your living room', desc: 'inside the player\'s cozy house (wooden floor, low table, cushions, a futon in the corner)' },
    bakery: { x0: 170, y0: 4, x1: 183, y1: 13, floor: G.TILEF, wall: '#f6e2c2', building: 'bakery', open: [6, 20], name: 'inside the Golden Loaf', desc: 'inside the Golden Loaf Bakery: warm ovens, a glass case of pastries, little café tables, the smell of cinnamon' },
    gym: { x0: 186, y0: 4, x1: 201, y1: 15, floor: G.RUBBER, wall: '#d8dcd0', building: 'gym', open: [5, 22], name: 'inside the Burrow Gym', desc: 'inside the Burrow Gym: weight racks, punching bags, treadmills, rubber floor, motivational posters' },
    lab: { x0: 204, y0: 4, x1: 217, y1: 13, floor: G.FLOOR, wall: '#c8d2d6', building: 'lab', open: [8, 23], name: 'inside the bookstore', desc: 'inside the "bookstore": a few dusty bookshelves hiding a cluttered lab with glowing vials and a swirling dimensional sink in the floor' },
    store: { x0: 154, y0: 18, x1: 167, y1: 27, floor: G.TILEF, wall: '#e8e0c8', building: 'store', open: [8, 20], name: 'inside the General Store', desc: 'inside the General Store: aisles of absolutely everything, a humming drinks fridge, Sable\'s counter' },
    club: { x0: 170, y0: 18, x1: 185, y1: 29, floor: G.CARPET, wall: '#3a2448', building: 'club', open: [18, 4], name: 'inside the Velvet Antler', desc: 'inside the Velvet Antler: thumping music, a glowing dance floor, a neon bar, a DJ booth and a hanging chair' },
    townhall: { x0: 188, y0: 18, x1: 201, y1: 27, floor: G.FLOOR, wall: '#e4dccb', building: 'townhall', open: [8, 18], name: 'inside Town Hall', desc: 'inside the crooked Town Hall: the Mayor\'s cluttered desk, rows of meeting chairs, flags and overflowing notice boards' },
    clinic: { x0: 204, y0: 18, x1: 215, y1: 26, floor: G.TILEF, wall: '#eef2f0', building: 'clinic', open: [0, 24], name: 'inside the clinic', desc: 'inside Doctor Owl\'s clinic: two patient beds, a cabinet of remedies, a desk with immaculate notes' },
    mall: { x0: 154, y0: 43, x1: 175, y1: 55, floor: G.TILEF, wall: '#f0e6dc', building: 'mall', open: [9, 21], name: 'inside Mirehollow Mall', desc: 'inside Mirehollow Mall: a bright little shopping arcade with striped kiosks (food court, gift corner, fashion boutique, home & decor, fun zone), café tables and soft muzak' },
    barber: { x0: 154, y0: 32, x1: 163, y1: 39, floor: G.TILEF, wall: '#f2e8f2', building: 'barber', open: [9, 18], name: 'inside the barbershop', desc: 'inside the barbershop: three barber chairs, mirrors, a waiting sofa and a lot of questionable hair on the floor' },
  };
  for (const id in ROOMS) { const R = ROOMS[id]; R.id = id; R.doorX = Math.floor((R.x0 + R.x1) / 2); }
  world.rooms = ROOMS;
  world.interior = ROOMS.home;
  world.roomAt = (tx, ty) => { for (const id in ROOMS) { const R = ROOMS[id]; if (tx >= R.x0 && tx <= R.x1 && ty >= R.y0 && ty <= R.y1) return R; } return null; };
  world.inInterior = (tx, ty) => !!world.roomAt(tx, ty);
  world.isOpen = (R) => { if (!R.open) return true; const h = MH.hour(); const [a, b] = R.open; return a <= b ? h >= a && h < b : h >= a || h < b; };

  // ---------------------------------------------------------------- buildings
  // x,y,w,h = footprint in tiles (solid). Door in the middle of the bottom row.
  const B = (id, name, x, y, w, h, style) => Object.assign({ id, name, x, y, w, h }, style);
  const ROOF = { terracotta: '#c8693e', slate: '#5a6478', blue: '#4e6a8e', moss: '#5f7a4a', dark: '#3e3a44', red: '#a8463c', teal: '#3f7f7a' };
  const BUILDINGS = [
    B('bakery', 'Golden Loaf Bakery', 63, 40, 8, 6, { roof: ROOF.terracotta, wall: '#f4e6cc', kind: 'shop', sign: 'Golden Loaf', awning: ['#f4c84a', '#fff6dc'], storeys: 2 }),
    B('townhall', 'Town Hall', 84, 39, 9, 7, { roof: ROOF.slate, wall: '#e4dccb', kind: 'hall', sign: 'Town Hall', crooked: true, storeys: 2 }),
    B('postoffice', 'Post Office', 46, 40, 6, 6, { roof: ROOF.red, wall: '#eef0ec', kind: 'shop', sign: 'Post 〒', awning: ['#d8423a', '#ffffff'] }),
    B('lab', 'Bookstore (definitely not a lab)', 55, 50, 7, 5, { roof: ROOF.dark, wall: '#c9d2d4', kind: 'shop', sign: 'BOOKS', glow: '#8affc8', awning: ['#5a4a7a', '#e8e0f0'] }),
    B('club', 'The Velvet Antler', 97, 50, 8, 5, { roof: ROOF.dark, wall: '#4a2c5a', kind: 'club', sign: 'VELVET ANTLER', neon: '#ff6ac8' }),
    B('store', 'General Store', 63, 63, 8, 5, { roof: ROOF.moss, wall: '#eadcbc', kind: 'shop', sign: 'General Store', awning: ['#3f8a5a', '#eef6e6'] }),
    B('barber', 'Sheep\'s Barbershop', 84, 64, 5, 4, { roof: ROOF.blue, wall: '#f2ecf2', kind: 'shop', sign: 'Barber', pole: true }),
    B('clinic', 'Doctor Owl\'s Clinic', 90, 63, 6, 5, { roof: ROOF.red, wall: '#f6f6f2', kind: 'shop', sign: '+ Clinic' }),
    B('coop', 'The Coop', 6, 52, 10, 6, { roof: ROOF.terracotta, wall: '#f6eedc', kind: 'house', storeys: 2, big: true }),
    B('honeycomb', 'The Honeycomb', 26, 53, 6, 5, { roof: '#c8962e', wall: '#f2cf6a', kind: 'house', round: true }),
    B('gym', 'The Burrow Gym', 5, 63, 9, 5, { roof: ROOF.moss, wall: '#d4c6ae', kind: 'shop', sign: 'BURROW GYM' }),
    B('workshop', 'Beaver\'s Workshop', 17, 63, 6, 5, { roof: '#8a6a44', wall: '#c8a070', kind: 'shed', crooked: true, sign: 'Workshop' }),
    B('home', 'Your House', 34, 26, 6, 6, { roof: ROOF.blue, wall: '#f6efe2', kind: 'house', storeys: 2, home: true }),
    B('lilycottage', 'Lily Pad Cottage', 85, 75, 6, 4, { roof: '#4aa65a', wall: '#e6f4d4', kind: 'house', round: true }),
    B('stilthouse', 'The Stilt House', 136, 49, 7, 5, { roof: '#2e2834', wall: '#4e4656', kind: 'stilt' }),
    B('gatorgrove', 'The Gator Grove', 133, 91, 8, 5, { roof: '#5a5a34', wall: '#7a6a4a', kind: 'hut' }),
    B('den', 'Kira\'s Den', 25, 6, 7, 4, { kind: 'cave' }),
    B('station', 'Mirehollow Station', 87, 28, 10, 6, { roof: ROOF.teal, wall: '#ece4d4', kind: 'station', sign: 'MIREHOLLOW' }),
    B('shrine', 'The Old Shrine', 70, 3, 9, 5, { roof: '#4a4046', wall: '#b04a34', kind: 'shrine' }),
    B('mall', 'Mirehollow Mall', 64, 78, 12, 6, { roof: ROOF.teal, wall: '#f2ece2', kind: 'shop', sign: 'MIREHOLLOW MALL', awning: ['#e0604a', '#fff4e8'], storeys: 2 }),
  ];
  // Generic houses for the townsfolk.
  const HOUSES = [
    [6, 17, 6, 5], [14, 17, 6, 5], [48, 17, 6, 5], [56, 17, 6, 5], [86, 17, 6, 5], [94, 17, 6, 5], [113, 17, 6, 5],
    [6, 26, 6, 6], [14, 26, 6, 6], [23, 26, 6, 6], [46, 27, 6, 5], [54, 27, 6, 5], [62, 27, 7, 5],
    [33, 63, 6, 5], [26, 76, 6, 5], [6, 76, 6, 5], [14, 76, 7, 5], [33, 76, 6, 5],
    [112, 40, 6, 6], [120, 40, 6, 6], [120, 50, 6, 5], [104, 56, 6, 5], [120, 64, 6, 5],
  ];
  const HOUSE_ROOFS = [ROOF.terracotta, ROOF.slate, ROOF.blue, ROOF.terracotta, '#9a5a3a', ROOF.dark, ROOF.moss];
  const HOUSE_WALLS = ['#f4ecdc', '#e8dcc4', '#f2f0ea', '#d8c4a4', '#e6e2d6', '#c8b49a'];

  // ---------------------------------------------------------------- locations
  const LOCS = {
    square: { name: 'the Market Square', r: [64, 48, 95, 62], desc: 'the paved market square, busy with stalls under old trees' },
    well: { name: 'the old well', r: [76, 55, 80, 58], desc: 'beside the old wishing well in the middle of the square' },
    bakery: { name: 'the Golden Loaf Bakery', r: [63, 46, 71, 47], desc: 'outside the Golden Loaf Bakery, smelling of cinnamon' },
    townhall: { name: 'Town Hall', r: [84, 46, 92, 47], desc: 'on the crooked steps of Town Hall' },
    postoffice: { name: 'the Post Office', r: [46, 46, 52, 47], desc: 'outside the little post office' },
    lab: { name: 'the Bookstore', r: [55, 55, 62, 56], desc: 'outside the bookstore that is obviously a lab (something glows in the window)' },
    club: { name: 'the Velvet Antler', r: [97, 55, 104, 56], desc: 'outside the Velvet Antler club, bass thumping through the walls' },
    store: { name: 'the General Store', r: [63, 68, 71, 69], desc: 'outside Sable\'s General Store' },
    barber: { name: 'the Barbershop', r: [84, 68, 89, 69], desc: 'outside the barbershop' },
    clinic: { name: 'the Clinic', r: [90, 68, 96, 69], desc: 'outside Doctor Owl\'s clinic' },
    mall: { name: 'Mirehollow Mall', r: [64, 84, 76, 85], desc: 'on the forecourt of Mirehollow Mall, automatic doors whooshing' },
    coop: { name: 'the Coop', r: [6, 58, 24, 60], desc: 'in front of the Coop on Clutch Lane, chicks somewhere nearby' },
    honeycomb: { name: 'the Honeycomb', r: [25, 58, 32, 59], desc: 'outside the Honeycomb, gaming noises leaking out' },
    gym: { name: 'the Burrow Gym', r: [5, 68, 14, 70], desc: 'outside the Burrow Gym, weights clanking' },
    workshop: { name: 'the Workshop', r: [16, 68, 23, 69], desc: 'outside the crooked workshop, sawdust everywhere' },
    home: { name: 'the player\'s house', r: [33, 32, 40, 33], desc: 'in front of the player\'s house by the railway crossing' },
    myroom: { name: 'the player\'s living room', r: [155, 7, 166, 12], desc: 'inside the player\'s cozy house (wooden floor, low table, cushions, a futon in the corner)' },
    lilycottage: { name: 'Lily Pad Cottage', r: [84, 79, 91, 80], desc: 'on the porch of Lily Pad Cottage by the pond' },
    pond: { name: 'the Duck Pond', r: [88, 74, 113, 92], desc: 'on the shore of the duck pond' },
    tower: { name: 'the Lifeguard Tower', r: [109, 79, 113, 83], desc: 'at the foot of Marina\'s lifeguard tower' },
    river: { name: 'the river', r: [100, 25, 115, 34], desc: 'on the grassy riverbank, water chattering over the stones' },
    station: { name: 'Mirehollow Station', r: [84, 34, 100, 35], desc: 'on the little platform of Mirehollow Station' },
    crossing: { name: 'the railway crossing', r: [40, 32, 46, 39], desc: 'by the railway crossing, its striped sign and red lamps overhead' },
    northlane: { name: 'the north road', r: [4, 23, 124, 24], desc: 'on the narrow north road along the woods, utility poles humming' },
    lanes: { name: 'Clutch Lane', r: [4, 58, 42, 60], desc: 'on Clutch Lane, lined with garden walls and overgrown hedges' },
    park: { name: 'the park', r: [46, 76, 61, 90], desc: 'in the leafy park with benches and cherry trees' },
    sunflowers: { name: 'the sunflower field', r: [46, 95, 61, 104], desc: 'in the tall sunflower field south of town' },
    paddies: { name: 'the rice paddies', r: [64, 96, 101, 124], desc: 'between the flooded rice paddies, frogs singing' },
    field: { name: 'the cornfield', r: [104, 96, 124, 122], desc: 'among the rustling cornfield' },
    busstop: { name: 'the bus stop', r: [81, 90, 84, 93], desc: 'at the lonely little bus stop on the south road' },
    shrine: { name: 'the Old Shrine', r: [70, 8, 79, 15], desc: 'at the quiet old shrine in the woods, stone lanterns and a red gate' },
    woods: { name: 'the Deep Woods', r: [10, 2, 66, 14], desc: 'in the dim, ancient Deep Woods' },
    den: { name: 'Kira\'s Den', r: [23, 10, 34, 14], desc: 'in the sunny clearing outside Kira\'s den in the woods' },
    eastlane: { name: 'the East Lane', r: [117, 59, 130, 62], desc: 'on the east lane, where the last lamp post marks the edge of the swamp' },
    swamp: { name: 'the Swamp', r: [131, 56, 148, 88], desc: 'in the humming, misty swamp' },
    stilthouse: { name: 'the Stilt House', r: [135, 54, 143, 56], desc: 'on the boardwalk below Maggie\'s Stilt House' },
    gatorgrove: { name: 'the Gator Grove', r: [132, 96, 142, 98], desc: 'at the muddy Gator Grove, with suspicious hissing from the bushes' },
    sky: { name: 'the sky', r: [76, 55, 80, 58], desc: 'somewhere above the clouds' },
  };
  // Public places townsfolk wander between.
  world.PUBLIC = ['square', 'well', 'bakery', 'station', 'crossing', 'northlane', 'lanes', 'park', 'river', 'pond', 'sunflowers', 'paddies', 'busstop', 'shrine', 'store', 'postoffice', 'club', 'mall', 'mall'];

  // ---------------------------------------------------------------- painting helpers
  function rect(x0, y0, x1, y1, fn) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inB(x, y)) fn(x, y); }
  function paintPath(points, width, type = G.ROAD) {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i], [bx, by] = points[i + 1];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2 + 1;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t);
        for (let dy = 0; dy < width; dy++) for (let dx = 0; dx < width; dx++) {
          const g = world.g(x + dx, y + dy);
          if (g === G.WATER || g === G.SWAMP || g === G.DEEP) setG(x + dx, y + dy, G.BOARD);
          else if (g === G.RAIL || g === G.CROSS) setG(x + dx, y + dy, G.CROSS);
          else if (g !== G.PLAZA || type === G.ROAD) setG(x + dx, y + dy, g === G.PLAZA ? G.PLAZA : type);
        }
      }
    }
  }
  const prop = (type, tx, ty, opts = {}) => {
    const p = Object.assign({ type, x: tx * T + T / 2, y: ty * T + T - 1, tx, ty, v: Math.floor(MH.hash2(tx, ty, 9) * 1000) }, opts);
    world.props.push(p);
    if (opts.solid !== false) setSolid(tx, ty, 1);
    return p;
  };
  const flat = (type, tx, ty, opts = {}) => prop(type, tx, ty, Object.assign({ flat: true, solid: false }, opts));
  world.prop = prop;
  const freeTile = (x, y) => inB(x, y) && !world.isSolid(x, y) && !world.isWater(x, y);
  const nearType = (x, y, r, ...types) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (types.includes(world.g(x + dx, y + dy))) return true; return false; };

  world.gen = function () {
    const rng = MH.seeded(4242);
    world.ground.fill(G.GRASS); world.solid.fill(0);
    world.props.length = 0; world.buildings.length = 0; world.lights.length = 0; world.interactables.length = 0;
    world.poles.length = 0; world.wires.length = 0; world.crossings.length = 0;

    // void + interior area
    rect(TOWN_W, 0, W - 1, H - 1, (x, y) => { setG(x, y, G.VOID); setSolid(x, y); });

    // --- woods (north) and east woods above the swamp
    for (let x = 0; x < TOWN_W; x++) {
      const edge = 15 + Math.round(Math.sin(x * 0.21) * 1.4 + Math.sin(x * 0.067) * 1.6);
      for (let y = 0; y < edge; y++) setG(x, y, G.WOODS);
    }
    rect(126, 0, TOWN_W - 1, 30, (x, y) => { if (MH.hash2(x >> 2, y >> 2, 1) < 0.85 || y < 26) setG(x, y, G.WOODS); });

    // --- swamp (east)
    for (let y = 28; y < H; y++) {
      const edge = 130 + Math.round(Math.sin(y * 0.17) * 1.5 + Math.sin(y * 0.05) * 2);
      for (let x = edge; x < TOWN_W; x++) {
        const n = MH.art.vnoise(x, y, 5, 7) * 0.7 + MH.art.vnoise(x, y, 2.2, 8) * 0.3;
        setG(x, y, n < 0.47 ? G.SWAMP : G.MUD);
      }
    }

    // --- river: from the woods down into the pond
    for (let y = 0; y <= 76; y++) {
      const cx = 107 + Math.sin(y * 0.13) * 2.2 + Math.sin(y * 0.05) * 1.5;
      for (let x = Math.round(cx - 1.6); x <= Math.round(cx + 1.6); x++) setG(x, y, G.WATER);
      if (MH.hash2(y, 1, 3) < 0.5) { const sx = Math.round(cx + (MH.hash2(y, 2, 3) < 0.5 ? -2.6 : 2.6)); if (world.g(sx, y) === G.GRASS || world.g(sx, y) === G.WOODS) setG(sx, y, G.SAND); }
    }
    // --- pond
    const pcx = 100, pcy = 83, prx = 11, pry = 7.5;
    for (let y = 70; y < 96; y++) for (let x = 84; x < 118; x++) {
      const d = ((x - pcx) / prx) ** 2 + ((y - pcy) / pry) ** 2;
      const wob = MH.hash2(x, y, 3) * 0.1;
      if (d < 0.5 + wob) setG(x, y, G.DEEP);
      else if (d < 1 + wob) setG(x, y, G.WATER);
      else if (d < 1.45 + wob && world.g(x, y) === G.GRASS) setG(x, y, G.SAND);
    }

    // --- fields: sunflowers, rice paddies (plots with grass ridges), cornfield
    rect(46, 95, 61, 104, (x, y) => setG(x, y, G.FIELD));
    rect(64, 96, 101, 124, (x, y) => { const rx = (x - 64) % 10, ry = (y - 96) % 7; setG(x, y, rx === 0 || ry === 0 ? G.GRASS : G.PADDY); });
    rect(104, 96, 124, 122, (x, y) => setG(x, y, G.FIELD));
    // --- park lawn stays grass; plaza
    rect(62, 48, 96, 68, (x, y) => setG(x, y, G.PLAZA));
    // --- shrine grounds
    rect(70, 3, 79, 15, (x, y) => setG(x, y, G.STONE));
    rect(73, 15, 76, 22, (x, y) => setG(x, y, G.STONE));
    rect(22, 9, 35, 15, (x, y) => { if (world.g(x, y) === G.WOODS) setG(x, y, G.GRASS); });

    // --- railway (solid except crossings)
    for (let x = 0; x < TOWN_W; x++) { setG(x, 36, G.RAIL); setG(x, 37, G.RAIL); }

    // --- roads
    paintPath([[2, 23], [126, 23]], 2);                 // north road
    paintPath([[2, 46], [126, 46]], 2);                 // station road
    paintPath([[2, 72], [126, 72]], 2);                 // south road
    paintPath([[42, 23], [42, 100]], 2);                // west road (crosses the tracks)
    paintPath([[79, 23], [79, 48]], 2);                 // main road north
    paintPath([[79, 68], [79, 124]], 2);                // main road south
    paintPath([[116, 23], [116, 72]], 2);               // east road
    paintPath([[4, 32], [78, 32]], 2);                  // lane along the tracks
    paintPath([[4, 58], [42, 58]], 2);                  // Clutch Lane
    paintPath([[4, 68], [42, 68]], 2);                  // gym lane
    paintPath([[4, 81], [42, 81]], 2);                  // south lane
    paintPath([[44, 93], [126, 93]], 2);                // farm road
    paintPath([[117, 60], [131, 60]], 2);               // east lane to the swamp
    paintPath([[82, 23], [82, 33]], 2, G.STONE);        // station approach
    paintPath([[30, 22], [30, 15]], 1, G.PATH);         // trail to Kira's den
    paintPath([[56, 34], [56, 23]], 1, G.PATH);
    paintPath([[61, 55], [63, 55]], 2, G.PLAZA);
    paintPath([[96, 55], [97, 55]], 2, G.PLAZA);
    paintPath([[89, 72], [89, 79]], 2, G.PATH);         // to Lily's cottage
    paintPath([[110, 73], [110, 79]], 2, G.PATH);       // to the tower
    paintPath([[60, 78], [48, 86]], 1, G.PATH);         // park paths
    paintPath([[46, 82], [61, 82]], 1, G.PATH);
    // swamp boardwalks
    paintPath([[131, 60], [139, 60], [139, 55]], 2, G.BOARD);
    paintPath([[139, 60], [139, 76], [136, 86], [136, 96]], 2, G.BOARD);
    paintPath([[139, 70], [147, 70]], 2, G.BOARD);
    // farm paths between paddies
    paintPath([[64, 110], [101, 110]], 1, G.PATH);
    paintPath([[114, 96], [114, 122]], 1, G.PATH);
    // platform
    rect(83, 34, 100, 35, (x, y) => setG(x, y, G.STONE));

    // crossings
    for (let x = 0; x < TOWN_W; x++) for (const y of [36, 37]) {
      const g = world.g(x, y);
      if (g === G.RAIL) setSolid(x, y, 1);
    }
    [[42, 'West Crossing'], [79, 'Main Crossing'], [116, 'East Crossing']].forEach(([x, name]) => world.crossings.push({ x0: x, x1: x + 1, y0: 36, y1: 37, name, active: false }));

    // mall forecourt + a path to the main road
    rect(63, 84, 78, 85, (x, y) => setG(x, y, G.PLAZA));
    // --- buildings
    const addBuilding = (b) => {
      const bb = Object.assign({}, b);
      bb.doorX = b.x + Math.floor(b.w / 2);
      bb.doorY = b.y + b.h - 1;
      world.buildings.push(bb);
      rect(b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, (x, y) => { setSolid(x, y, 1); if (b.kind !== 'stilt' && b.kind !== 'cave') setG(x, y, world.g(x, y) === G.PLAZA ? G.PLAZA : G.PATH); });
      const fx = bb.doorX, fy = bb.doorY + 1;
      const fg = world.g(fx, fy);
      if (fg !== G.PLAZA && fg !== G.ROAD && fg !== G.BOARD && fg !== G.STONE && b.kind !== 'stilt') setG(fx, fy, G.PATH);
      if (b.kind !== 'cave' && b.kind !== 'shrine') world.lights.push({ x: (b.x + b.w / 2) * T, y: (b.y + b.h - 1) * T, r: 40, color: b.glow || '#ffd890', window: true, b: bb });
      const room = ROOMS[b.id];
      world.interactables.push({ type: room ? 'enter' : 'door', tx: fx, ty: fy, b: bb, room: room ? room.id : null, label: b.home ? 'Go inside' : room ? 'Enter ' + bb.name : bb.name });
      return bb;
    };
    BUILDINGS.forEach(addBuilding);
    HOUSES.forEach(([x, y, w, h], i) => {
      const r = MH.seeded(100 + i);
      addBuilding(B('h' + (i + 1), 'a townhouse', x, y, w, h, { roof: r.pick(HOUSE_ROOFS), wall: r.pick(HOUSE_WALLS), kind: 'house', storeys: r() < 0.5 ? 2 : 1, generic: true }));
    });
    world.buildingById = {};
    world.buildings.forEach((b) => (world.buildingById[b.id] = b));
    // connect doors to the nearest road with a little path
    world.buildings.forEach((b) => {
      if (b.kind === 'stilt' || b.kind === 'cave') return;
      let x = b.doorX, y = b.doorY + 1;
      for (let k = 0; k < 6; k++) {
        const g = world.g(x, y);
        if (g === G.ROAD || g === G.PLAZA || g === G.STONE || g === G.BOARD || g === G.CROSS) break;
        if (world.isSolid(x, y) || world.isWater(x, y)) break;
        setG(x, y, G.PATH); y++;
      }
    });

    // --- interiors
    const roomShell = (R) => {
      rect(R.x0, R.y0, R.x1, R.y1, (x, y) => { setSolid(x, y, 0); setG(x, y, R.floor); });
      rect(R.x0, R.y0, R.x1, R.y0 + 1, (x, y) => { setG(x, y, G.WALL); setSolid(x, y); });
      for (let y = R.y0; y <= R.y1; y++) { setG(R.x0, y, G.WALL); setSolid(R.x0, y); setG(R.x1, y, G.WALL); setSolid(R.x1, y); }
      rect(R.x0 + 1, R.y1, R.x1 - 1, R.y1, (x, y) => { setG(x, y, G.WALL); setSolid(x, y); });
      for (const dx of [0, 1]) { setG(R.doorX + dx, R.y1, R.floor); setSolid(R.doorX + dx, R.y1, 0); }
      world.interactables.push({ type: 'exit', tx: R.doorX, ty: R.y1 - 1, room: R.id, label: 'Go outside' }, { type: 'exit', tx: R.doorX + 1, ty: R.y1 - 1, room: R.id, label: 'Go outside' });
      world.lights.push({ x: (R.x0 + R.x1 + 1) / 2 * T, y: (R.y0 + R.y1) / 2 * T, r: 140, color: '#ffd890', interior: true });
      R.staff = []; R.seats = [];
    };
    const fur = (type, tx, ty, w = 1, h = 1, opts = {}) => { const p = prop(type, tx, ty, Object.assign({ solid: true, interior: true, fw: w }, opts)); rect(tx, ty - h + 1, tx + w - 1, ty, (x, y) => setSolid(x, y)); return p; };
    const deco = (type, tx, ty, opts = {}) => flat(type, tx, ty, Object.assign({ interior: true }, opts));
    Object.values(ROOMS).forEach(roomShell);
    // your house
    rect(155, 6, 158, 9, (x, y) => setG(x, y, G.TATAMI));
    prop('futon', 156, 7, { solid: true, w: 2, interior: true }); setSolid(157, 7); setSolid(156, 6); setSolid(157, 6);
    prop('lowtable', 160, 9, { solid: true, w: 2, interior: true }); setSolid(161, 9);
    [[159, 9], [162, 9], [160, 10], [161, 10], [160, 8], [161, 8]].forEach(([x, y]) => deco('cushion', x, y));
    prop('kitchen', 164, 6, { solid: true, w: 2, interior: true }); setSolid(165, 6);
    prop('fridge', 166, 6, { solid: true, interior: true });
    prop('shelf', 159, 6, { solid: true, interior: true });
    prop('tv', 161, 6, { solid: true, interior: true });
    prop('sofa', 164, 10, { solid: true, w: 2, interior: true }); setSolid(165, 10);
    prop('plant', 155, 12, { solid: true, interior: true });
    prop('plant', 166, 12, { solid: true, interior: true });
    deco('rug', 160, 11);
    world.interactables.push({ type: 'sleep', tx: 156, ty: 9, label: 'Sleep on the futon' }, { type: 'sleep', tx: 158, ty: 8, label: 'Sleep on the futon' });
    world.interactables.push({ type: 'party', tx: 160, ty: 10, label: 'Plan a party / invite people' }, { type: 'party', tx: 161, ty: 10, label: 'Plan a party / invite people' });
    world.interactables.push({ type: 'fridge', tx: 166, ty: 7, label: 'Open the fridge' });
    // bakery
    fur('breadshelf', 171, 7, 1, 2); fur('counter', 172, 8, 5); fur('displaycase', 178, 8, 2); fur('oven', 181, 6); fur('oven', 182, 6);
    fur('cafetable', 173, 11); fur('cafetable', 180, 11); deco('chair', 172, 11); deco('chair', 174, 11); deco('chair', 179, 11); deco('chair', 181, 11); fur('plant', 182, 12);
    ROOMS.bakery.staff = [[173, 7], [175, 7], [177, 7], [179, 7]];
    // gym
    fur('weightrack', 188, 6, 3); fur('weightrack', 197, 6, 3); fur('treadmill', 192, 6); fur('treadmill', 194, 6);
    fur('punchbag', 188, 11); fur('punchbag', 199, 11); fur('gymbench', 191, 9, 2); fur('gymbench', 196, 9, 2);
    deco('mat', 191, 13); deco('mat', 196, 13); deco('poster', 190, 5); deco('poster', 195, 5);
    ROOMS.gym.staff = [[193, 10], [194, 11], [190, 12]];
    // bookstore / lab
    [205, 206, 207, 214, 215, 216].forEach((x, i) => fur('shelf', x, 6, 1, 1, { v: i }));
    fur('labtable', 209, 8, 3); fur('desk', 205, 10, 2); fur('hole', 214, 10, 1, 1, { flatty: true }); fur('plant', 216, 12);
    ROOMS.lab.staff = [[210, 7], [208, 7], [212, 9]];
    // general store
    fur('shopshelf', 156, 22, 3); fur('shopshelf', 156, 24, 3); fur('shopshelf', 163, 22, 3); fur('shopshelf', 163, 24, 3);
    fur('cashcounter', 159, 21, 4); fur('drinkfridge', 155, 20); fur('drinkfridge', 166, 20);
    ROOMS.store.staff = [[160, 20], [161, 20]];
    // club
    fur('bar', 171, 21, 4); [171, 172, 173, 174].forEach((x) => deco('stool', x, 22)); fur('djbooth', 180, 20, 2); deco('dancefloor', 176, 25);
    fur('speaker', 184, 20); fur('speaker', 171, 27); fur('hangchair', 184, 25);
    ROOMS.club.staff = [[172, 20], [173, 20], [180, 21], [178, 24]];
    // town hall
    fur('desk', 193, 21, 3); fur('flag', 190, 20); fur('flag', 199, 20); fur('chairrow', 191, 24, 3); fur('chairrow', 196, 24, 3); fur('board', 200, 22); fur('plant', 189, 26);
    ROOMS.townhall.staff = [[194, 20], [195, 20]];
    // clinic
    fur('clinicbed', 205, 21, 1, 2); fur('clinicbed', 213, 21, 1, 2); fur('desk', 208, 21, 2); fur('cabinet', 211, 20); fur('plant', 214, 25); deco('chair', 207, 24); deco('chair', 208, 24);
    ROOMS.clinic.staff = [[208, 20], [209, 20]];
    // barbershop
    fur('barberchair', 156, 35); fur('barberchair', 158, 35); fur('barberchair', 160, 35); deco('mirror', 156, 33); deco('mirror', 158, 33); deco('mirror', 160, 33);
    prop('sofa', 161, 37, { solid: true, w: 2, interior: true }); setSolid(162, 37); fur('plant', 155, 38);
    ROOMS.barber.staff = [[157, 36], [159, 36]];
    // the mall: five striped kiosks, a little food court
    const KIOSKS = [['mall_food', 157, '#e0604a'], ['mall_gift', 161, '#f07ac0'], ['mall_fashion', 165, '#8a6ae0'], ['mall_home', 169, '#3fa07a'], ['mall_fun', 173, '#f0b030']];
    KIOSKS.forEach(([shop, x, color]) => {
      prop('stall', x, 47, { color, interior: true }); setSolid(x - 1, 47); setSolid(x + 1, 47);
      for (const dx of [-1, 0, 1]) world.interactables.push({ type: 'counter', tx: x + dx, ty: 48, shop, label: '🛍️ ' + (MH.SHOPS && MH.SHOPS[shop] ? MH.SHOPS[shop].name : 'Shop') });
    });
    [[158, 51], [162, 51], [168, 51]].forEach(([x, y]) => { fur('cafetable', x, y); deco('chair', x - 1, y); deco('chair', x + 1, y); });
    fur('plant', 155, 54); fur('plant', 174, 54); fur('plant', 155, 46); fur('plant', 174, 46); fur('drinkfridge', 172, 51);
    prop('bench', 157, 54, { interior: true }); prop('bench', 171, 54, { interior: true });
    ROOMS.mall.staff = [];
    // counters: buy things and/or ask for work
    const counter = (room, tiles, shop) => tiles.forEach(([x, y]) => world.interactables.push({ type: 'counter', tx: x, ty: y, room, shop: shop || null, label: shop ? '🛒 Counter' : '💼 Ask for work' }));
    counter('bakery', [[174, 9], [175, 9]], 'bakery');
    counter('store', [[160, 22], [161, 22]], 'store');
    counter('club', [[172, 22], [173, 22]], 'club');
    fur('desk', 188, 13, 2); counter('gym', [[188, 14], [189, 14]]);
    counter('lab', [[210, 9], [211, 9]]);
    counter('townhall', [[194, 22], [195, 22]]);
    counter('clinic', [[208, 22], [209, 22]]);
    counter('barber', [[156, 37], [157, 37]]);
    // where each room's inside counts as a location
    for (const id in ROOMS) { const R = ROOMS[id]; LOCS['in_' + id] = { name: R.name, r: [R.x0 + 1, R.y0 + 2, R.x1 - 1, R.y1 - 1], desc: R.desc, room: id }; }

    // --- square furniture
    prop('well', 78, 56, { w: 2 }); setSolid(79, 56);
    world.interactables.push({ type: 'well', tx: 78, ty: 57, label: 'Toss a coin in the well' }, { type: 'well', tx: 79, ty: 57, label: 'Toss a coin in the well' });
    prop('board', 92, 50); world.interactables.push({ type: 'board', tx: 92, ty: 51, label: 'Read the Grapevine board' });
    [[68, 52], [88, 52], [68, 60], [88, 60], [73, 49], [84, 49]].forEach(([x, y]) => prop('bench', x, y));
    [[64, 49], [94, 49], [64, 61], [94, 61]].forEach(([x, y]) => prop('tree', x, y, { big: true }));
    [[72, 55], [85, 55], [72, 59], [85, 59]].forEach(([x, y]) => prop('planter', x, y));
    prop('stall', 69, 56, { color: '#d94a4a' }); prop('stall', 89, 56, { color: '#4a8ad9' });
    prop('vending', 98, 46, { color: '#e04a3a' }); prop('vending', 81, 34, { color: '#3a7ad8' });
    prop('vending', 44, 34, { color: '#f0f0f0' }); prop('vending', 71, 46, { color: '#3aa060' });
    prop('postbox', 52, 46);
    // station details
    prop('stationsign', 84, 34); prop('bench', 92, 34); prop('bench', 96, 34);
    // bus stop
    prop('busstop', 82, 91);
    // park: sakura, benches, little pavilion
    [[48, 78], [52, 77], [57, 79], [49, 88], [55, 89], [60, 86], [47, 83]].forEach(([x, y]) => prop('sakura', x, y));
    [[51, 82], [56, 82], [53, 86]].forEach(([x, y]) => prop('bench', x, y));
    // shrine
    prop('torii', 74, 17, { w: 2, solid: false }); setSolid(73, 17); setSolid(76, 17);
    [[72, 12], [77, 12], [72, 9], [77, 9]].forEach(([x, y]) => prop('stonelantern', x, y));
    prop('log', 29, 12, { w: 2 });
    // lifeguard tower & pond
    prop('tower', 111, 79, { w: 2 }); setSolid(112, 79); setSolid(111, 78); setSolid(112, 78);
    flat('dock', 96, 76);
    for (let i = 0; i < 18; i++) { const x = rng.int(88, 113), y = rng.int(75, 92); if (world.g(x, y) === G.WATER || world.g(x, y) === G.DEEP) flat('lilypad', x, y); }
    for (let i = 0; i < 40; i++) {
      const x = rng.int(86, 116), y = rng.int(72, 95);
      if (world.g(x, y) === G.SAND && !world.isSolid(x, y)) { if (rng() < 0.3) flat('shell', x, y, { pick: 'seashell' }); else if (rng() < 0.5) prop('reeds', x, y, { solid: false }); }
    }
    // river stones & reeds
    for (let y = 16; y < 72; y++) for (let x = 100; x < 116; x++) {
      if (world.g(x, y) === G.SAND && MH.hash2(x, y, 31) < 0.25) prop('rock', x, y, { small: true });
      else if (world.g(x, y) === G.GRASS && world.isWater(x - 1, y) && MH.hash2(x, y, 32) < 0.3) prop('reeds', x, y, { solid: false });
    }
    // sunflowers, corn, paddy sprouts
    for (let y = 95; y <= 104; y++) for (let x = 46; x <= 61; x++) if ((x + y) % 2 === 0 && MH.hash2(x, y, 5) < 0.8) prop('sunflower', x, y, { pick: MH.hash2(x, y, 6) < 0.15 ? 'sunflower' : null });
    for (let y = 97; y <= 121; y += 2) for (let x = 105; x <= 123; x++) if (x !== 114 && MH.hash2(x, y, 7) < 0.85) prop('corn', x, y, { pick: MH.hash2(x, y, 8) < 0.1 ? 'corn' : null });
    prop('post', 86, 113, { solid: false });
    // swamp
    for (let i = 0; i < 110; i++) {
      const x = rng.int(131, TOWN_W - 2), y = rng.int(28, H - 2), g = world.g(x, y);
      if (world.isSolid(x, y) || g === G.BOARD) continue;
      if (g === G.MUD && rng() < 0.45) prop('deadtree', x, y);
      else if (g === G.MUD) prop('reeds', x, y, { solid: false, swamp: true });
      else if (g === G.SWAMP && rng() < 0.3) flat('lilypad', x, y, { swamp: true });
    }
    for (let i = 0; i < 24; i++) { const x = rng.int(131, TOWN_W - 2), y = rng.int(30, H - 2); if (world.g(x, y) === G.MUD && !world.isSolid(x, y)) flat('mushroom', x, y, { pick: 'mushroom' }); }
    [[133, 62], [140, 66], [137, 80], [138, 90]].forEach(([x, y]) => { if (!world.isSolid(x, y)) { const p = prop('lantern', x, y); world.lights.push({ x: p.x, y: p.y - 26, r: 50, color: '#b8ff9a', lamp: true }); } });

    // --- utility poles along roads, with wires between them
    const poleLine = (pts) => {
      const line = [];
      pts.forEach(([x, y]) => {
        if (!inB(x, y) || world.isSolid(x, y) || world.isWater(x, y) || world.g(x, y) === G.ROAD) return;
        const p = prop('pole', x, y, { lamp: line.length % 2 === 0 });
        world.poles.push(p);
        if (p.lamp) world.lights.push({ x: p.x + 6, y: p.y - 58, r: 56, color: '#fff0c8', lamp: true });
        line.push(p);
      });
      for (let i = 0; i < line.length - 1; i++) if (Math.abs(line[i].x - line[i + 1].x) + Math.abs(line[i].y - line[i + 1].y) < T * 12) world.wires.push([line[i], line[i + 1]]);
    };
    const along = (x0, x1, y, step) => { const a = []; for (let x = x0; x <= x1; x += step) a.push([x, y]); return a; };
    const down = (x, y0, y1, step) => { const a = []; for (let y = y0; y <= y1; y += step) a.push([x, y]); return a; };
    poleLine(along(5, 124, 25, 8));
    poleLine(along(6, 76, 34, 8));
    poleLine(along(5, 60, 48, 9));
    poleLine(along(100, 124, 48, 9));
    poleLine(along(5, 124, 74, 9));
    poleLine(down(44, 50, 98, 8));
    poleLine(down(81, 74, 122, 8));
    poleLine(down(118, 26, 70, 8));
    poleLine(along(119, 129, 62, 5).concat([[128, 59]]));
    poleLine(along(46, 124, 95, 10));

    // --- crossing signs on both sides of each crossing
    world.crossings.forEach((c) => {
      const a = prop('crossingsign', c.x0 - 1, 35, { crossing: c, side: 'l' });
      const b = prop('crossingsign', c.x1 + 1, 38, { crossing: c, side: 'r' });
      c.signs = [a, b];
      world.lights.push({ x: a.x, y: a.y - 40, r: 26, color: '#ff4a3a', crossing: c }, { x: b.x, y: b.y - 40, r: 26, color: '#ff4a3a', crossing: c });
    });
    // weathered fence posts along the tracks (gaps at crossings)
    for (let x = 1; x < TOWN_W - 1; x++) {
      if (world.crossings.some((c) => x >= c.x0 - 2 && x <= c.x1 + 2)) continue;
      if (x >= 83 && x <= 100) continue; // platform
      if (world.g(x, 35) !== G.WATER && !world.isSolid(x, 35) && x % 3 === 0 && MH.hash2(x, 35, 2) < 0.8) prop('fencepost', x, 35, { v: x });
      if (world.g(x, 38) !== G.WATER && !world.isSolid(x, 38) && x % 3 === 1 && MH.hash2(x, 38, 2) < 0.8) prop('fencepost', x, 38, { v: x });
    }
    // block walls & hedges around houses (the overgrown lane look)
    world.buildings.forEach((b) => {
      if (b.kind !== 'house') return;
      for (const dx of [-1, b.w]) for (let y = b.y + 1; y < b.y + b.h; y++) {
        const x = b.x + dx;
        if (freeTile(x, y) && world.g(x, y) === G.GRASS) { if (MH.hash2(x, y, 41) < 0.55) prop('hedge', x, y); else prop('blockwall', x, y, { vert: true }); }
      }
    });

    // --- woods: cedars, broadleaf trees, bamboo, ferns
    for (let y = 0; y < 31; y++) for (let x = 0; x < TOWN_W; x++) {
      if (world.g(x, y) !== G.WOODS || world.isSolid(x, y)) continue;
      if (nearType(x, y, 1, G.ROAD, G.PATH, G.STONE, G.WATER)) continue;
      const n = MH.hash2(x, y, 11);
      if (n < 0.2) prop('cedar', x, y);
      else if (n < 0.36) prop('tree', x, y, { dark: true });
      else if (n < 0.42) prop('bamboo', x, y);
      else if (n < 0.47) flat('fern', x, y);
      else if (n < 0.5) flat('mushroom', x, y, { pick: 'mushroom' });
      else if (n < 0.55) prop('bush', x, y, { berry: true, pick: 'berries' });
    }
    // --- village greenery: big lush trees, hedges, flowers
    for (let i = 0; i < 1500; i++) {
      const x = rng.int(1, 128), y = rng.int(14, H - 2);
      if (world.g(x, y) !== G.GRASS || world.isSolid(x, y)) continue;
      if (nearType(x, y, 1, G.ROAD, G.PLAZA, G.BOARD, G.SAND, G.PATH, G.STONE, G.CROSS, G.RAIL, G.PADDY, G.FIELD)) {
        if (rng() < 0.5 && !nearType(x, y, 0, G.ROAD)) flat('flowers', x, y, { color: rng.pick(['#f07ac0', '#f4d03a', '#ffffff', '#8a7af0', '#f05a4a']), pick: 'wildflower' });
        continue;
      }
      if (world.isSolid(x, y + 1) || world.isSolid(x + 1, y) || world.isSolid(x - 1, y)) continue;
      const r = rng();
      if (r < 0.34) prop('tree', x, y);
      else if (r < 0.52) prop('bush', x, y, { berry: rng() < 0.2, pick: null });
      else if (r < 0.76) flat('flowers', x, y, { color: rng.pick(['#f07ac0', '#f4d03a', '#ffffff', '#8a7af0', '#f05a4a']), pick: 'wildflower' });
      else if (r < 0.8) prop('rock', x, y);
      else if (r < 0.86) flat('flowers', x, y, { color: '#d8364a', rose: true, pick: 'rose' });
      else flat('tallgrass', x, y);
    }
    flat('cap', 93, 47, { pick: 'bottlecap' });

    // map edges
    for (let x = 0; x < TOWN_W; x++) { setSolid(x, 0); setSolid(x, H - 1); }
    for (let y = 0; y < H; y++) { setSolid(0, y); setSolid(TOWN_W - 1, y); }

    for (const k in LOCS) world.locations[k] = Object.assign({ key: k }, LOCS[k]);
    world.wireSet = world.wires;
  };

  // ---------------------------------------------------------------- queries
  world.walkable = (tx, ty) => inB(tx, ty) && !world.isSolid(tx, ty) && !world.isWater(tx, ty);
  world.crossingBlocked = (tx, ty) => world.crossings.some((c) => c.active && tx >= c.x0 && tx <= c.x1 && ty >= c.y0 && ty <= c.y1);

  world.randomSpot = function (locKey, tries = 50) {
    const L = world.locations[locKey] || world.locations.square;
    const [x0, y0, x1, y1] = L.r;
    for (let i = 0; i < tries; i++) {
      const x = MH.randi(x0, x1), y = MH.randi(y0, y1);
      if (world.walkable(x, y) && world.g(x, y) !== G.CROSS) return { tx: x, ty: y };
    }
    return world.nearestWalkable(Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2));
  };
  world.nearestWalkable = function (tx, ty) {
    for (let r = 0; r < 14; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (world.walkable(tx + dx, ty + dy)) return { tx: tx + dx, ty: ty + dy };
      }
    return { tx: 78, ty: 58 };
  };
  world.doorFront = function (locKey) {
    const b = world.buildingById && world.buildingById[locKey];
    if (b) return world.nearestWalkable(b.doorX, b.doorY + 1);
    return world.randomSpot(locKey);
  };
  world.placeAt = function (px, py) {
    const tx = Math.floor(px / T), ty = Math.floor(py / T);
    const R = world.roomAt(tx, ty);
    if (R) return R.id === 'home' ? world.locations.myroom : world.locations['in_' + R.id];
    let best = null, bestA = 1e9;
    for (const k in world.locations) {
      if (k === 'sky' || k === 'myroom' || k.startsWith('in_')) continue;
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
    if (g === G.PADDY) return world.locations.paddies;
    if (g === G.FIELD) return ty > 94 && tx < 62 ? world.locations.sunflowers : world.locations.field;
    if (g === G.WATER) return world.locations.river;
    return { key: 'village', name: 'the village', desc: 'on a quiet, overgrown lane in the village' };
  };

  // ---------------------------------------------------------------- A* (reusable buffers)
  const N = W * H;
  const gScore = new Float32Array(N), came = new Int32Array(N), stamp = new Uint32Array(N), closed = new Uint32Array(N);
  let gen = 1;
  world.findPath = function (sx, sy, gx, gy, maxNodes = 9000) {
    if (!world.walkable(gx, gy)) { const n = world.nearestWalkable(gx, gy); gx = n.tx; gy = n.ty; }
    if (sx === gx && sy === gy) return [];
    gen++;
    const heap = [];
    const push = (i, f) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return dx + dy - 0.6 * Math.min(dx, dy); };
    const s = idx(sx, sy), goal = idx(gx, gy);
    const getG = (i) => (stamp[i] === gen ? gScore[i] : Infinity);
    stamp[s] = gen; gScore[s] = 0; came[s] = -1; push(s, h(sx, sy));
    let count = 0, found = false;
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4], [-1, 1, 1.4], [1, -1, 1.4], [-1, -1, 1.4]];
    while (heap.length && count++ < maxNodes) {
      const [, cur] = pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      const cx = cur % W, cy = (cur / W) | 0;
      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!world.walkable(nx, ny)) continue;
        if (dx && dy && (!world.walkable(cx + dx, cy) || !world.walkable(cx, cy + dy))) continue;
        const ni = idx(nx, ny);
        const gnd = world.ground[ni];
        const pref = gnd === G.ROAD || gnd === G.PLAZA || gnd === G.BOARD || gnd === G.PATH || gnd === G.STONE || gnd === G.CROSS ? 0.75 : 1;
        const ng = getG(cur) + cost * pref;
        if (ng < getG(ni)) { stamp[ni] = gen; gScore[ni] = ng; came[ni] = cur; push(ni, ng + h(nx, ny) * 0.8); }
      }
    }
    if (!found) return null;
    const path = [];
    for (let c = goal; c !== s && c !== -1; c = came[c]) path.push({ tx: c % W, ty: (c / W) | 0 });
    return path.reverse();
  };
})(window.MH);
