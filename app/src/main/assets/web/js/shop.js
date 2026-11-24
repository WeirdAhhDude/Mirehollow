// Mirehollow — money well spent: the mall's kiosks, shop counters (bakery, General Store, club bar),
// the wardrobe (things you wear show up on your character), home decor (appears in your house),
// usable items (fireworks, energy drinks, lottery tickets…) and selling forage to Sable.
'use strict';
(function (MH) {
  const T = MH.TILE;
  const I = (id, name, icon, price, cat, desc, extra) => Object.assign({ id, name, icon, price, cat, desc }, extra || {});
  const ITEMS = [
    // food (giftable, or eat it yourself)
    I('onigiri', 'Onigiri', '🍙', 6, 'food', 'A salted rice ball. Simple, perfect.'),
    I('takoyaki', 'Takoyaki', '🐙', 12, 'food', 'Six piping-hot octopus balls. Careful.'),
    I('ramen', 'Bowl of ramen', '🍜', 15, 'food', 'Rich broth, a soft egg, too much steam.'),
    I('bubbletea', 'Bubble tea', '🧋', 12, 'food', 'Brown-sugar milk tea with chewy pearls.'),
    I('crepe', 'Strawberry crepe', '🥞', 14, 'food', 'Folded into a cone, cream everywhere.'),
    I('icecream', 'Ice cream cone', '🍦', 7, 'food', 'Melting faster than you can walk.'),
    I('matcha', 'Matcha latte', '🍵', 11, 'food', 'Grassy, frothy, very green.'),
    I('chocolates', 'Box of chocolates', '🍫', 25, 'food', 'A heart-shaped box. Says a lot without words.'),
    I('fancycake', 'Fancy cake', '🎂', 40, 'food', 'A whole decorated cake. For celebrations — or apologies.'),
    I('croissant', 'Butter croissant', '🥐', 6, 'food', 'Flaky. Leaves crumbs on everything.'),
    I('cinnroll', 'Cinnamon roll', '🍥', 7, 'food', 'Sunny\'s pride. Still warm.'),
    I('cookies', 'Bag of cookies', '🍪', 5, 'food', 'Chocolate chip, slightly broken.'),
    I('cakeslice', 'Strawberry cake slice', '🍰', 12, 'food', 'Light sponge, real strawberries.'),
    I('melonbread', 'Melon bread', '🍞', 8, 'food', 'Crunchy sugar crust, soft inside.'),
    I('sourdough', 'Sourdough loaf', '🥖', 10, 'food', 'A proper loaf. Could be used as a weapon.'),
    I('ramune', 'Bottle of ramune', '🥤', 5, 'food', 'Pop the marble. Fizz everywhere.'),
    I('mocktail', 'Neon mocktail', '🍹', 9, 'food', 'Glows faintly. Tastes like blue.'),
    I('soda', 'Fizzy berry soda', '🫐', 6, 'food', 'Sweet, purple, aggressively fizzy.'),
    // gifts
    I('bouquet', 'Bouquet of flowers', '💐', 20, 'gift', 'A proper bouquet with ribbon. Romantic.'),
    I('plushfrog', 'Plush frog', '🐸', 30, 'gift', 'Soft, green, judgmental. Lily would melt.'),
    I('bracelet', 'Friendship bracelet', '📿', 15, 'gift', 'Hand-knotted. Means something.'),
    I('charm', 'Lucky charm', '🧿', 22, 'gift', 'Wards off bad luck (allegedly).'),
    I('comic', 'Comic book', '📚', 12, 'gift', 'Issue #1 of something with lasers.'),
    I('perfume', 'Perfume', '🌸', 45, 'gift', 'A tiny glass bottle that smells like spring.'),
    I('watch', 'Gold watch', '⌚', 120, 'gift', 'Very shiny, very expensive. The Mayor would faint.'),
    I('videogame', 'Video game', '🎮', 60, 'gift', 'A brand-new co-op game. Brenda would scream.'),
    I('dumbbells', 'Pair of dumbbells', '🏋️', 50, 'gift', 'Heavy. Box and Bunny approve.'),
    I('goggles', 'Lab goggles', '🥽', 35, 'gift', 'Chemical-proof. Penelope has been asking.'),
    I('poppers', 'Party poppers', '🎉', 10, 'gift', 'A pack of six. Dionne\'s love language.'),
    I('clownnose', 'Squeaky clown nose', '🤡', 6, 'gift', 'Honk.'),
    I('bloodorange', 'Blood orange juice', '🧃', 14, 'gift', 'Maggie will find this hilarious.'),
    I('crystalball', 'Crystal ball', '🔮', 75, 'gift', 'Swirls when nobody looks. Zahra-approved.'),
    I('sleepmask', 'Silk sleeping mask', '😴', 16, 'gift', 'For the professional napper in your life.'),
    I('shellnecklace', 'Seashell necklace', '🐚', 28, 'gift', 'Pretty shells on a cord. Marina collects these.'),
    I('teapot', 'Fancy teapot', '🫖', 35, 'gift', 'Floral porcelain. Very proper.'),
    I('goldcap', 'Gilded bottle cap', '✨', 30, 'gift', 'A bottle cap, dipped in gold. The Mayor would weep.'),
    I('duck', 'Rubber duck', '🦆', 8, 'gift', 'Squeaks. That\'s it. That\'s the gift.'),
    I('candle', 'Scented candle', '🕯️', 18, 'gift', '"Cozy Cabin". Smells like wood and naps.'),
    // things you wear (they show up on your character)
    I('w_strawhat', 'Straw hat', '👒', 25, 'wear', 'Wide brim, summer vibes.', { wear: 'strawhat', slot: 'head' }),
    I('w_cap', 'Baseball cap', '🧢', 18, 'wear', 'Backwards optional.', { wear: 'cap', slot: 'head' }),
    I('w_flowercrown', 'Flower crown', '🌼', 24, 'wear', 'Fresh flowers, woven.', { wear: 'flowercrown', slot: 'head' }),
    I('w_fairylights', 'Fairy-light headband', '✨', 32, 'wear', 'Tiny blinking lights on your head.', { wear: 'fairylights', slot: 'head' }),
    I('w_glasses', 'Round glasses', '👓', 22, 'wear', 'Instant +10 intelligence (looks only).', { wear: 'glasses', slot: 'eyes' }),
    I('w_heartglasses', 'Heart sunglasses', '😎', 28, 'wear', 'Pink, heart-shaped, iconic.', { wear: 'heartglasses', slot: 'eyes' }),
    I('w_headset', 'Gamer headset', '🎧', 40, 'wear', 'RGB not included.', { wear: 'headset', slot: 'ears' }),
    I('w_scarf', 'Cozy scarf', '🧣', 20, 'wear', 'Knitted, a little too long.', { wear: 'scarf', slot: 'neck' }),
    I('w_tie', 'Necktie', '👔', 15, 'wear', 'For looking like you have a job.', { wear: 'tie', slot: 'neck' }),
    I('w_gold', 'Gold chain', '🔗', 90, 'wear', 'Heavy. Shiny. Loud.', { wear: 'gold', slot: 'neck' }),
    I('w_whistle', 'Whistle', '📣', 8, 'wear', 'Coach energy.', { wear: 'whistle', slot: 'neck' }),
    I('w_apron', 'Apron', '🍳', 14, 'wear', 'Floury already.', { wear: 'apron', slot: 'body' }),
    I('w_labcoat', 'Lab coat', '🥼', 45, 'wear', 'Science! (Penelope will ask questions.)', { wear: 'labcoat', slot: 'body' }),
    I('w_overalls', 'Overalls', '👖', 30, 'wear', 'Farmhand chic.', { wear: 'overalls', slot: 'body' }),
    I('w_rednose', 'Red clown nose', '🔴', 6, 'wear', 'Chuckles will either love you or feel threatened.', { wear: 'rednose', slot: 'nose' }),
    I('w_bag', 'Shoulder bag', '👜', 26, 'wear', 'Holds snacks and secrets.', { wear: 'bag', slot: 'side' }),
    // home decor (shows up in your house)
    I('d_plant', 'Potted plant', '🪴', 20, 'home', 'Leafy and forgiving.', { decor: 'plant' }),
    I('d_shelf', 'Bookshelf', '📚', 45, 'home', 'Fill it with books you will read someday.', { decor: 'shelf' }),
    I('d_punchbag', 'Punching bag', '🥊', 60, 'home', 'Hit THIS instead of people.', { decor: 'punchbag' }),
    I('d_treadmill', 'Treadmill', '🏃', 120, 'home', 'Doubles as a clothes rack.', { decor: 'treadmill' }),
    I('d_speaker', 'Big speaker', '🔊', 55, 'home', 'Party-grade bass.', { decor: 'speaker' }),
    I('d_hangchair', 'Hanging chair', '🪺', 80, 'home', 'A cozy egg you can sit in.', { decor: 'hangchair' }),
    I('d_cafetable', 'Café table', '☕', 35, 'home', 'Tiny, round, very cute.', { decor: 'cafetable' }),
    I('d_cabinet', 'Cabinet', '🗄️', 40, 'home', 'For stuff. And other stuff.', { decor: 'cabinet' }),
    I('d_drinkfridge', 'Drinks fridge', '🧊', 70, 'home', 'Glass door, glowing, always humming.', { decor: 'drinkfridge' }),
    I('d_barberchair', 'Barber chair', '💈', 65, 'home', 'Why? Because you can.', { decor: 'barberchair' }),
    I('d_poster', 'Poster', '🖼️', 12, 'home', 'A sunset over the paddies.', { decor: 'poster', wall: true }),
    I('d_mirror', 'Wall mirror', '🪞', 30, 'home', 'Check your look before going out.', { decor: 'mirror', wall: true }),
    I('d_mat', 'Exercise mat', '🧘', 15, 'home', 'Stretch. Or nap. Mostly nap.', { decor: 'mat', floor: true }),
    I('d_rug', 'Round rug', '🟣', 25, 'home', 'Ties the room together.', { decor: 'rug', floor: true }),
    // fun & useful
    I('firework', 'Firework', '🎆', 15, 'fun', 'Light it outside for a bang everybody will hear about.', { use: 'firework' }),
    I('confetti', 'Confetti cannon', '🎊', 20, 'fun', 'Instant party. Instant mess.', { use: 'confetti' }),
    I('bubbles', 'Bubble wand', '🫧', 6, 'fun', 'Shimmering bubbles for everyone.', { use: 'bubbles' }),
    I('glowstick', 'Glow stick', '🪄', 4, 'fun', 'Crack it, wave it, feel the music.', { use: 'glowstick' }),
    I('energy', 'Energy drink', '⚡', 10, 'fun', 'Run 35% faster for 3 hours. Heart rate: yes.', { use: 'energy' }),
    I('lottery', 'Lottery ticket', '🎟️', 5, 'fun', 'Scratch it. You probably won\'t win. Probably.', { use: 'lottery' }),
    I('bugspray', 'Bug spray', '🧴', 8, 'fun', 'Maggie\'s swarm leaves you alone tonight.', { use: 'bugspray' }),
    I('partykit', 'Party kit', '🎈', 35, 'fun', 'Balloons, streamers, a disco ball. More guests say yes to your next party.', { use: 'partykit' }),
  ];
  MH.SHOP_ITEMS = {};
  ITEMS.forEach((it) => (MH.SHOP_ITEMS[it.id] = it));

  MH.SHOPS = {
    mall_food: { name: 'Food Court', icon: '🍜', items: ['onigiri', 'takoyaki', 'ramen', 'bubbletea', 'crepe', 'icecream', 'matcha', 'chocolates', 'fancycake'] },
    mall_gift: { name: 'Gift Corner', icon: '🎁', items: ['bouquet', 'plushfrog', 'bracelet', 'charm', 'comic', 'perfume', 'watch', 'videogame', 'dumbbells', 'goggles', 'poppers', 'clownnose', 'bloodorange', 'crystalball', 'sleepmask', 'shellnecklace', 'teapot', 'goldcap'] },
    mall_fashion: { name: 'Boutique', icon: '👗', items: ITEMS.filter((i) => i.cat === 'wear').map((i) => i.id) },
    mall_home: { name: 'Home & Decor', icon: '🛋️', items: ITEMS.filter((i) => i.cat === 'home').map((i) => i.id) },
    mall_fun: { name: 'Fun Zone', icon: '🎆', items: ['firework', 'confetti', 'bubbles', 'glowstick', 'energy', 'lottery', 'partykit'] },
    bakery: { name: 'Golden Loaf Bakery', icon: '🥐', staff: 'bakery', items: ['croissant', 'cinnroll', 'cookies', 'cakeslice', 'melonbread', 'sourdough', 'fancycake'] },
    store: { name: 'General Store', icon: '🏪', staff: 'store', sells: true, items: ['ramune', 'onigiri', 'cookies', 'bugspray', 'energy', 'lottery', 'duck', 'candle', 'glowstick', 'firework'] },
    club: { name: 'Velvet Antler bar', icon: '🍹', staff: 'club', items: ['mocktail', 'soda', 'ramune', 'glowstick', 'poppers'] },
  };
  // what Sable pays for things you found
  const FORAGE_PRICE = { wildflower: 2, rose: 4, mushroom: 7, berries: 3, seashell: 5, corn: 3, sunflower: 4, feather: 6, bottlecap: 1 };

  const shop = (MH.shop = {});
  const P = () => MH.state.player;
  shop.itemByName = (name) => { const n = String(name || '').toLowerCase(); return ITEMS.find((i) => i.name.toLowerCase() === n) || null; };

  shop.buy = function (id, shopId) {
    const it = MH.SHOP_ITEMS[id], p = P();
    if (!it) return false;
    if (p.coins < it.price) { MH.ui.toast('Not enough coins.'); return false; }
    if (it.wear && (p.wardrobe || []).includes(it.wear)) { MH.ui.toast('You already own that.'); return false; }
    MH.social.addCoins(-it.price);
    if (it.wear) { p.wardrobe = p.wardrobe || []; p.wardrobe.push(it.wear); shop.wear(it.wear, true); MH.ui.toast(`${it.icon} Bought ${it.name} — you're wearing it!`, 3); }
    else if (it.decor) { p.decor = p.decor || []; p.decor.push(it.id); shop.placeDecor(); MH.ui.toast(`${it.icon} ${it.name} will be in your house.`, 3); }
    else { MH.social.giveItem(it.name, null); const last = p.inv[p.inv.length - 1]; if (last) { last.price = it.price; last.shop = it.id; last.icon = it.icon; } MH.ui.toast(`${it.icon} Bought ${it.name} (−${it.price} 🪙)`); }
    // the shopkeeper notices big spenders
    const sh = MH.SHOPS[shopId];
    if (sh && sh.staff && it.price >= 25) {
      const staff = MH.npcs.find((e) => e.inRoom === sh.staff && e.staffSpot);
      if (staff) MH.social.addMemory(staff.id, `${p.name} bought a ${it.name} from us (${it.price} coins).`, { imp: 1, kind: 'witness' });
    }
    return true;
  };
  shop.sellPrice = function (inv) {
    if (inv.price) return Math.max(1, Math.floor(inv.price * 0.4));
    const k = Object.keys(MH.ITEMS).find((key) => MH.ITEMS[key].name === inv.name);
    if (k && FORAGE_PRICE[k] != null) return FORAGE_PRICE[k];
    if (inv.quest) return 0;
    return 3;
  };
  shop.sell = function (index) {
    const p = P(), inv = p.inv[index]; if (!inv) return;
    const price = shop.sellPrice(inv);
    if (!price) { MH.ui.toast('Sable won\'t take that — it isn\'t yours to sell.'); return; }
    p.inv.splice(index, 1);
    MH.social.addCoins(price);
    MH.ui.toast(`Sold ${inv.name} for ${price} 🪙`);
    // selling someone's gift... word gets around
    if (inv.from && MH.CHAR[inv.from] && Math.random() < 0.45) {
      MH.social.addMemory(inv.from, `Heard ${p.name} sold the ${inv.name} I gave them at the General Store. Wow.`, { imp: 2, kind: 'gossip' });
      MH.social.changeBond(inv.from, -3);
    }
  };

  // ---------------------------------------------------------------- wardrobe
  const SLOT = {}; ITEMS.forEach((i) => { if (i.wear) SLOT[i.wear] = i.slot; });
  shop.wearing = () => ((P().look && P().look.acc) || []).filter((a) => SLOT[a]);
  shop.wear = function (acc, on) {
    const p = P(); p.look = p.look || {};
    let acc2 = (p.look.acc || []).slice();
    if (on) { acc2 = acc2.filter((a) => !(SLOT[a] && SLOT[a] === SLOT[acc] && a !== acc)); if (!acc2.includes(acc)) acc2.push(acc); }
    else acc2 = acc2.filter((a) => a !== acc);
    p.look.acc = acc2;
    MH.refreshPlayerSprite && MH.player && MH.refreshPlayerSprite();
  };
  shop.wearingText = function () {
    if (!MH.state) return '';
    return shop.wearing().map((a) => { const it = ITEMS.find((i) => i.wear === a); return it ? it.name.toLowerCase() : a; }).join(', ');
  };

  // ---------------------------------------------------------------- home decor (props in your living room)
  const SOLID_SLOTS = [[162, 6], [163, 6], [166, 9], [166, 10], [155, 10], [155, 11], [158, 12], [163, 12], [157, 11]];
  const WALL_SLOTS = [[156, 5], [163, 5], [165, 5], [158, 5]];
  const FLOOR_SLOTS = [[163, 8], [158, 10]];
  let placed = [];
  shop.placeDecor = function () {
    placed.forEach((pr) => { MH.render.removeProp(pr); const i = MH.world.props.indexOf(pr); if (i >= 0) MH.world.props.splice(i, 1); if (!pr.flat) MH.world.setSolid(pr.tx, pr.ty, 0); });
    placed = [];
    if (!MH.state) return;
    const used = { solid: 0, wall: 0, floor: 0 };
    (P().decor || []).forEach((id) => {
      const it = MH.SHOP_ITEMS[id]; if (!it) return;
      const kind = it.wall ? 'wall' : it.floor ? 'floor' : 'solid';
      const slots = kind === 'wall' ? WALL_SLOTS : kind === 'floor' ? FLOOR_SLOTS : SOLID_SLOTS;
      const sl = slots[used[kind]++]; if (!sl) return; // house full: stays in storage
      const pr = MH.world.prop(it.decor, sl[0], sl[1], kind === 'solid' ? { interior: true, fw: 1, decor: true } : { flat: true, solid: false, interior: true, decor: true });
      MH.render.addProp(pr); placed.push(pr);
    });
  };
  shop.decorPlaced = (id, i) => {
    const it = MH.SHOP_ITEMS[id]; if (!it) return false;
    const kind = it.wall ? 'wall' : it.floor ? 'floor' : 'solid';
    const n = (P().decor || []).slice(0, i + 1).filter((d) => { const x = MH.SHOP_ITEMS[d]; return x && (x.wall ? 'wall' : x.floor ? 'floor' : 'solid') === kind; }).length;
    return n <= (kind === 'wall' ? WALL_SLOTS : kind === 'floor' ? FLOOR_SLOTS : SOLID_SLOTS).length;
  };
  shop.decorText = function () {
    if (!MH.state) return '';
    return (P().decor || []).map((id) => MH.SHOP_ITEMS[id] && MH.SHOP_ITEMS[id].name.toLowerCase()).filter(Boolean).slice(0, 10).join(', ');
  };
  shop.sellDecor = function (i) {
    const p = P(), id = p.decor[i], it = MH.SHOP_ITEMS[id]; if (!it) return;
    p.decor.splice(i, 1); MH.social.addCoins(Math.floor(it.price / 2)); shop.placeDecor();
    MH.ui.toast(`Sold the ${it.name} for ${Math.floor(it.price / 2)} 🪙`);
  };

  // ---------------------------------------------------------------- using things
  shop.usable = (inv) => { const it = inv.shop ? MH.SHOP_ITEMS[inv.shop] : shop.itemByName(inv.name); return it && (it.use || it.cat === 'food') ? it : null; };
  shop.use = function (index) {
    const p = P(), inv = p.inv[index]; if (!inv) return;
    const it = shop.usable(inv); if (!it) return;
    const pl = MH.player, where = MH.world.placeAt(pl.x, pl.y).name, indoors = !!MH.roomOf(pl);
    const done = () => { p.inv.splice(p.inv.indexOf(inv), 1); MH.ui.closeModal(); };
    switch (it.use || 'eat') {
      case 'eat': done(); MH.ui.vibe(MH.pick([`You eat the ${it.name.toLowerCase()}. Delicious.`, `The ${it.name.toLowerCase()} is gone in about four seconds.`, `You enjoy the ${it.name.toLowerCase()} in peace. Mostly.`])); break;
      case 'firework':
        if (indoors) { MH.ui.toast('Not indoors! Take it outside.'); return; }
        done(); MH.render.burst(pl.x, pl.y - 60, 'sparkle', 46); MH.render.burst(pl.x, pl.y - 70, 'heart', 10); MH.render.flash = 0.18;
        MH.sim.vibeNow(`BOOM — a firework blooms over ${where}!`);
        MH.social.witness(`${p.name} set off a firework near ${where}.`, pl.x, pl.y, [], { chaotic: 1, funny: 1 }, 18);
        MH.npcs.forEach((e) => { if (!e.hidden && MH.distTiles(e, pl) < 18 && MH.roomOf(e) === null) e.showEmote(MH.social.isAfraid(e.id) ? 'sweat' : MH.pick(['!', 'heart', 'note']), 2.5); });
        break;
      case 'confetti': done(); MH.render.burst(pl.x, pl.y - 26, 'sparkle', 30); MH.render.burst(pl.x, pl.y - 26, 'note', 8); MH.ui.vibe('FWOOMP. Confetti everywhere. Someone will be finding it for weeks.'); MH.social.witness(`${p.name} fired a confetti cannon near ${where}.`, pl.x, pl.y, [], { funny: 1, chaotic: 1 }, 9); break;
      case 'bubbles': done(); MH.render.burst(pl.x, pl.y - 22, 'sparkle', 14); MH.ui.vibe('You blow a stream of shimmering bubbles. They drift off over town.'); MH.npcs.forEach((e) => { if (!e.hidden && MH.distTiles(e, pl) < 6 && Math.random() < 0.6) e.showEmote('heart', 2); }); break;
      case 'glowstick': done(); MH.render.burst(pl.x, pl.y - 20, 'sparkle', 10); MH.ui.vibe(MH.roomOf(pl) === 'club' ? 'You crack the glow stick and wave it at the DJ. The DJ approves.' : 'The glow stick casts a little green halo around you.'); break;
      case 'energy': done(); p.buffUntil = MH.absMinutes() + 180; MH.ui.toast('⚡ You feel ZIPPY — faster for 3 hours!', 3); break;
      case 'bugspray': done(); MH.state.today.bugspray = true; MH.ui.toast('🧴 Sprayed. The mosquitoes will leave you alone tonight.', 3); break;
      case 'partykit': MH.ui.toast('🎈 Keep it in your pocket — it boosts your next party automatically.', 3.5); return;
      case 'lottery': {
        done();
        const r = Math.random();
        const win = r < 0.01 ? 200 : r < 0.05 ? 60 : r < 0.18 ? 15 : r < 0.35 ? 5 : 0;
        if (win) { MH.social.addCoins(win); MH.render.burst(pl.x, pl.y - 24, 'sparkle', win >= 60 ? 30 : 10); MH.ui.toast(win >= 60 ? `🎟️ JACKPOT! You won ${win} coins!!` : `🎟️ You won ${win} coins!`, 4); if (win >= 60) MH.social.witness(`${p.name} won ${win} coins on a lottery ticket!`, pl.x, pl.y, [], null, 9); }
        else MH.ui.toast('🎟️ Nothing. "Better luck next time!" it says, smugly.', 3);
        break;
      }
    }
  };
  shop.usePartyKit = function () {
    const p = P(), i = p.inv.findIndex((x) => x.shop === 'partykit' || x.name === 'Party kit');
    if (i < 0) return 0;
    p.inv.splice(i, 1); MH.ui.toast('🎈 Your party kit makes the invitations look amazing.', 3);
    return 0.25;
  };

  // ---------------------------------------------------------------- UI
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  MH.ui.openShop = function (shopId, back) {
    const sh = MH.SHOPS[shopId]; if (!sh) return;
    const p = P();
    const body = h(`<div class="shop"><div class="shophead"><span>🪙 <b class="coins">${p.coins}</b> coins</span>${sh.sells ? '<button class="btn small ghost" id="shSell">Sell things</button>' : ''}</div><div class="shoplist"></div></div>`);
    const list = body.querySelector('.shoplist');
    const draw = () => {
      body.querySelector('.coins').textContent = p.coins;
      list.innerHTML = '';
      sh.items.forEach((id) => {
        const it = MH.SHOP_ITEMS[id]; if (!it) return;
        const owned = it.wear && (p.wardrobe || []).includes(it.wear);
        const row = h(`<div class="srow"><span class="sicon">${it.icon}</span><div class="sinfo"><b>${MH.esc(it.name)}</b><small>${MH.esc(it.desc)}</small></div><button class="btn small buy" ${owned || p.coins < it.price ? 'disabled' : ''}>${owned ? 'Owned' : it.price + ' 🪙'}</button></div>`);
        row.querySelector('.buy').onclick = () => { if (shop.buy(id, shopId)) draw(); };
        list.appendChild(row);
      });
    };
    draw();
    if (sh.sells) body.querySelector('#shSell').onclick = () => MH.ui.openSell(() => MH.ui.openShop(shopId, back));
    MH.ui.modal(`${sh.icon} ${MH.esc(sh.name)}`, body, { onClose: back || null });
  };
  MH.ui.openSell = function (back) {
    const p = P();
    const body = h(`<div class="shop"><p class="muted small">Sable buys what you find around town (flowers, mushrooms, shells…) and takes back shop items at 40%. Selling a villager's gift? They might hear about it.</p><div class="shoplist"></div></div>`);
    const list = body.querySelector('.shoplist');
    const draw = () => {
      list.innerHTML = '';
      if (!p.inv.length) list.appendChild(h('<div class="empty">Your pocket is empty.</div>'));
      p.inv.forEach((inv, i) => {
        const price = shop.sellPrice(inv);
        const row = h(`<div class="srow"><span class="sicon">${inv.icon || '•'}</span><div class="sinfo"><b>${MH.esc(inv.name)}</b>${inv.from && MH.CHAR[inv.from] ? `<small>gift from ${MH.esc(MH.CHAR[inv.from].name)}</small>` : ''}</div><button class="btn small buy" ${price ? '' : 'disabled'}>${price ? 'Sell ' + price + ' 🪙' : '—'}</button></div>`);
        row.querySelector('.buy').onclick = () => { shop.sell(i); draw(); };
        list.appendChild(row);
      });
    };
    draw();
    MH.ui.modal('Sell to Sable', body, { onClose: back || null });
  };
  // a counter / desk: buy things and/or ask for work
  MH.ui.openCounter = function (it) {
    const room = it.room || null;
    const jobs = room && MH.jobs ? MH.jobs.listAt(room) : [];
    if (it.shop && !jobs.length) { MH.ui.openShop(it.shop); return; }
    if (!it.shop && !it.door && jobs.length) { MH.ui.openJobs(room); return; }
    const body = h(`<div class="menu">${it.shop ? `<button class="btn" data-a="shop">🛒 Buy something</button>` : ''}${jobs.length ? `<button class="btn" data-a="work">💼 Ask for work</button>` : ''}${it.door ? `<button class="btn ghost" data-a="knock">✊ Knock on the door</button>` : ''}</div>`);
    body.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'shop') MH.ui.openShop(it.shop, () => MH.ui.openCounter(it));
      if (a === 'work') MH.ui.openJobs(room, () => MH.ui.openCounter(it));
      if (a === 'knock') { MH.ui.closeModal(); MH.sim.knock(it.door); }
    }));
    MH.ui.modal(it.door ? MH.esc(it.door.name) : MH.esc((MH.SHOPS[it.shop] && MH.SHOPS[it.shop].name) || 'Counter'), body);
  };
})(window.MH);
