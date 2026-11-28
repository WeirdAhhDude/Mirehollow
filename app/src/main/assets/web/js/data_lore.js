// Mirehollow — world lore, events, vibe text, items.
'use strict';
(function (MH) {
  MH.LORE = {
    town:
      'MIREHOLLOW is a green, overgrown countryside town: narrow asphalt lanes edged with weeds, utility poles and sagging wires, tiled-roof houses with flower boxes and concrete garden walls, hedges and huge old trees everywhere. ' +
      'A little local railway cuts across town with three striped level crossings (the bells go kan-kan-kan when a train comes) and Mirehollow Station on the north side. ' +
      'South of the tracks is the paved Market Square (Golden Loaf Bakery, the bookstore that is secretly Dr. Penelope\'s lab, the crooked Town Hall, Sable\'s General Store, the Velvet Antler club, the barbershop, Doctor Owl\'s clinic, an old wishing well). ' +
      'A river runs down from the Deep Woods into the duck pond (Lily Pad Cottage, Marina\'s lifeguard tower). West are the residential lanes (Clutch Lane with the Coop, the Honeycomb, the Burrow Gym, the workshop, the post office) and the player\'s house right by the west crossing; further south-west, past the south lane and a bamboo grove, is the Jade Dojo, Sensei Jade\'s martial arts school with its sandy training yard. ' +
      'There is a leafy park with cherry trees, a sunflower field, flooded rice paddies where the Scarecrow stands, a cornfield and a lonely bus stop to the south. The Old Shrine with its red gate hides up in the woods; Kira\'s den is further in. The swamp (Maggie\'s Stilt House, the Gator Grove) starts past the last lamp post on the East Lane. ' +
      'Plenty of ordinary townsfolk (all animals — the player is the only human in town) go about their day. Nobody gets a quiet afternoon. Recurring gatherings: Sunday Potluck at the Coop, Saturday brunch at the Velvet Antler, Gym Day, Friday LAN Night at the Honeycomb, Thursday swamp cookout, the Bakery morning rush, Saturday picnic in the park and Wednesday lantern evening at the shrine.',
    // short version used in AI prompts (shorter prompt = faster replies)
    brief:
      'MIREHOLLOW: an overgrown countryside town of tiled-roof houses, narrow lanes, utility poles, a little railway with level crossings and a station. ' +
      'Market Square (Golden Loaf Bakery, the bookstore that is secretly Dr. Penelope\'s lab, crooked Town Hall, General Store, Velvet Antler club, barber, clinic, wishing well); ' +
      'a river into the duck pond (Lily Pad Cottage, Marina\'s lifeguard tower); residential lanes (the Coop, the Honeycomb, Burrow Gym, post office, workshop, the player\'s house by the west crossing); the Jade Dojo (martial arts school) past the bamboo in the south-west; ' +
      'park, sunflower field, rice paddies (the Scarecrow), cornfield, bus stop; the Old Shrine and Kira\'s den in the Deep Woods; the swamp (Maggie\'s Stilt House, the Gator Grove) past the last lamp post. ' +
      'Lots of animal townsfolk; the player is the only human. The beach and the open sea are in the far south-west, past the pines. Weekly gatherings: Saturday Sunset Bonfire at the beach, Sunday Potluck at the Coop, Saturday brunch at the club, Gym Day, Friday LAN Night, Thursday swamp cookout, Saturday picnic in the park, Wednesday lantern evening at the shrine.',
    groups:
      'Loose groups: Nap rotation (Patty, Brenda, Kira). Mom Collective (Clucky, Sunny, Lily, plus Vix). Party Crew (Dionne, Bunny, Marina, Chuckles). Lab Rats (Penelope plus anyone she talks into a sample). Sky/Size Club (Nimbus, Zahra, the Darkborn, Solaris — they duck under doorways and accidentally wreck roofs). The Unholy Trinity (Gertie unaware, Scarecrow unbothered, Mayor trying to escape). The Fighters: Box, Roxy and Bunny at the gym; Sensei Jade and her students (Rin, Tobi, Bo) at the dojo.',
    drama:
      'Ongoing drama: Dionne\'s campaign to win over Kira (Chuckles is an unwitting saboteur, Bunny is the bookie). Bunny\'s crush on Box (Box is oblivious, Dionne takes bets). Penelope\'s experiments drawing crowds; the Mayor keeps trying to shut the lab down and keeps getting jargoned into leaving. Maggie\'s festival scheme, conscripting Zahra and Nimbus. Sunny avoiding Marina while Vix shoves her forward. Roxy vs. Sensei Jade: the never-ending "boxing or martial arts?" feud (they have never actually fought). The Scarecrow appearing in the middle of group scenes and clearing the room in four seconds — except Lily, who waves.',
  };

  // Weekly gatherings: override schedules on given weekday.
  MH.WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  MH.GATHERINGS = [
    { day: 6, from: 12, to: 15, at: 'coop', name: 'Sunday Potluck at the Coop', who: ['clucky', 'sunny', 'vix', 'lily', 'penelope', 'gertie', 'mole', 'patty', 'brenda', 'zahra'] },
    { day: 5, from: 11, to: 14, at: 'club', name: 'Brunch at the Velvet Antler', who: ['dionne', 'marina', 'bunny', 'chuckles', 'sheep'] },
    { day: 2, from: 9, to: 12, at: 'gym', name: 'Gym Day at the Burrow', who: ['bunny', 'box', 'gertie', 'clucky', 'vix'] },
    { day: 4, from: 19, to: 23, at: 'honeycomb', name: 'LAN Night at the Honeycomb', who: ['brenda', 'patty', 'chuckles', 'bunny'] },
    { day: 3, from: 16, to: 19, at: 'swamp', name: 'Swamp Cookout at the Stilt House', who: ['maggie', 'gertie', 'clucky', 'penelope', 'chuckles'] },
    { day: 0, from: 7, to: 10, at: 'bakery', name: 'Bakery Morning Rush', who: ['sunny', 'vix', 'mayor', 'mole', 'clucky', 'penelope', 'lily'] },
    { day: 1, from: 9, to: 11, at: 'bakery', name: 'Shark-Cookie Tuesday', who: ['marina', 'sunny', 'vix'] },
    { day: 5, from: 15, to: 18, at: 'park', name: 'Picnic in the Park', who: ['lily', 'clucky', 'sunny', 'patty', 'zahra', 'darkborn', 'bunny', 'gertie'] },
    { day: 2, from: 19, to: 22, at: 'shrine', name: 'Lantern Evening at the Shrine', who: ['lily', 'darkborn', 'zahra', 'penelope', 'mayor', 'marina'] },
    { day: 5, from: 18, to: 23, at: 'beach', name: 'Sunset Bonfire at the Beach', who: ['marina', 'dionne', 'bunny', 'chuckles', 'roxy', 'sunny', 'vix', 'gertie', 'jawbreaker', 'lily', 'juniper'] },
  ];

  // Little friend-group outings: each day a couple of these happen at a random spot & time.
  MH.OUTINGS = [
    { who: ['dionne', 'bunny', 'marina', 'chuckles'], locs: ['river', 'station', 'pond', 'crossing'], name: 'the Party Crew hanging out' },
    { who: ['patty', 'brenda', 'kira'], locs: ['park', 'river', 'shrine'], name: 'the nap rotation' },
    { who: ['clucky', 'sunny', 'lily', 'vix'], locs: ['park', 'sunflowers', 'pond'], name: 'the Mom Collective picnic' },
    { who: ['penelope', 'darkborn', 'maggie'], locs: ['shrine', 'swamp', 'woods', 'river'], name: 'a Lab Rats field trip' },
    { who: ['zahra', 'darkborn', 'nimbus', 'solaris'], locs: ['paddies', 'park', 'sunflowers'], name: 'the Sky/Size Club' },
    { who: ['gertie', 'mayor'], locs: ['paddies', 'square', 'busstop'], name: 'the Unholy Trinity (minus one)' },
    { who: ['bunny', 'box'], locs: ['river', 'northlane', 'paddies'], name: 'a training run' },
    { who: ['mole', 'beaver', 'sheep'], locs: ['station', 'busstop', 'crossing'], name: 'the old-timers\' chat' },
    { who: ['sunny', 'marina'], locs: ['river', 'pond', 'shrine'], name: 'an awkward not-a-date' },
    { who: ['dionne', 'kira'], locs: ['woods', 'river'], name: 'Dionne\'s latest attempt to impress Kira' },
  ];

  MH.ITEMS = {
    wildflower: { name: 'Wildflower', icon: '🌼', desc: 'A cheerful little flower from the meadow.' },
    rose: { name: 'Climbing Rose', icon: '🌹', desc: 'Snipped from a fence. Romantic, slightly thorny.' },
    mushroom: { name: 'Glowcap Mushroom', icon: '🍄', desc: 'Faintly glowing. Penelope would want this.' },
    berries: { name: 'Bramble Berries', icon: '🫐', desc: 'Sweet berries from the woods.' },
    seashell: { name: 'Seashell', icon: '🐚', desc: 'A pretty shell. Marina collects these.' },
    bottle: { name: 'Message in a bottle', icon: '🍾', desc: 'Washed up on the beach. Someone, somewhere, wrote this.' },
    corn: { name: 'Ear of Corn', icon: '🌽', desc: 'From the Scarecrow\'s field. She saw you take it.' },
    sunflower: { name: 'Sunflower', icon: '🌻', desc: 'Tall and cheerful. Sunny would love it.' },
    feather: { name: 'Crow Feather', icon: '🪶', desc: 'Left behind by one of the Scarecrow\'s crows.' },
    bottlecap: { name: 'Shiny Bottle Cap', icon: '⚙️', desc: 'The Mayor would consider this a fine offering.' },
    apple: { name: 'Orchard Apple', icon: '🍎', desc: 'Crisp and red, from the old orchard in the foothills.' },
  };
  MH.itemIcon = (name) => {
    const n = (name || '').toLowerCase();
    for (const k in MH.ITEMS) if (n.includes(MH.ITEMS[k].name.toLowerCase()) || n.includes(k)) return MH.ITEMS[k].icon;
    if (/roll|bun|bread|loaf|croissant|pastry/.test(n)) return '🥐';
    if (/cookie/.test(n)) return '🍪';
    if (/sunflower/.test(n)) return '🌻';
    if (/rice ball|onigiri/.test(n)) return '🍙';
    if (/lemonade|soda|ramune/.test(n)) return '🥤';
    if (/invitation|invite/.test(n)) return '💌';
    if (/cake|cupcake|muffin/.test(n)) return '🧁';
    if (/pie/.test(n)) return '🥧';
    if (/ice cream/.test(n)) return '🍦';
    if (/tea|coffee|cocoa/.test(n)) return '🍵';
    if (/drink|juice|cocktail|sunrise/.test(n)) return '🍹';
    if (/letter|note|mail|poem/.test(n)) return '✉️';
    if (/book/.test(n)) return '📕';
    if (/vial|potion|sample|serum/.test(n)) return '🧪';
    if (/flower|daisy|lily|bouquet/.test(n)) return '💐';
    if (/shell/.test(n)) return '🐚';
    if (/coin|money/.test(n)) return '🪙';
    if (/balloon/.test(n)) return '🎈';
    if (/glitter/.test(n)) return '✨';
    if (/fish/.test(n)) return '🐟';
    if (/meat|steak/.test(n)) return '🍖';
    if (/honey/.test(n)) return '🍯';
    if (/snack|chip/.test(n)) return '🍿';
    if (/protein|bar/.test(n)) return '🍫';
    if (/lamp/.test(n)) return '🪔';
    if (/key/.test(n)) return '🗝️';
    if (/bandage/.test(n)) return '🩹';
    return '🎁';
  };

  // Ambient vibe captions. {loc} replaced with a location name.
  MH.VIBES = {
    morning: ['The first train of the day rattles past the crossing.', 'The smell of cinnamon drifts over from the Golden Loaf.', 'A rooster that definitely isn\'t Clucky gets the time wrong.', 'Shutters bang open one by one along the lane.', 'Somewhere, twenty chicks are demanding breakfast at once.', 'Dew glitters on the roses spilling over the fences.'],
    day: ['Cicadas buzz in the big trees along the lane.', 'The utility wires hum softly overhead.', 'Somewhere a wind chime tinkles.', 'A duck honks indignantly at the pond.', 'Somebody\'s radio is playing a little too loud.', 'You hear the rhythmic thump of someone doing burpees.', 'A crow on a fence post is watching you very closely.', 'Laundry flaps in the breeze on Clutch Lane.', 'There\'s a faint smell of something chemical from the bookstore.', 'A distant honk of a clown horn. Then laughter. Then a scream.'],
    evening: ['The lamp posts flicker on one at a time.', 'Music thumps faintly from the Velvet Antler.', 'The pond turns gold, then pink, then grey.', 'Crickets start up in the hedges.', 'A thin hum drifts in from the swamp. The swarm is awake.'],
    night: ['A vending machine glows alone at the corner.', 'The last train rattles off into the dark.', 'The village is quiet. Mostly.', 'Something rustles in the corn. You decide not to look.', 'A single light still burns in the bookstore window.', 'You hear a distant, sleepy roar from the woods.', 'The stars are very bright over Mirehollow tonight.'],
    swamp: ['Something bit you. Somewhere, someone giggles.', 'The swamp water bubbles. It\'s probably fine.', 'A low VRRRMMM passes overhead.', 'You hear hissing from a nearby bush. Several bushes, actually.'],
    woods: ['The trees here are very old, and very quiet.', 'Big paw prints in the mud. Fresh ones.', 'You hear snoring. Deep, rumbling snoring.'],
    field: ['The corn rustles, though there is no wind.', 'The crows go silent all at once.', 'You feel watched.'],
    rain: ['Rain patters on the cobbles.', 'Everyone is running for awnings.', 'The pond is pocked with raindrops.'],
    storm: ['Thunder rolls over the square. Someone must have annoyed Nimbus.', 'Lightning flickers. The Mayor screams faintly.'],
  };

  MH.MOODS_POS = ['cheerful', 'happy', 'sweet', 'hyped', 'cozy', 'radiant', 'serene', 'chill', 'proud', 'chipper', 'energetic', 'flustered', 'giddy'];
})(window.MH);
