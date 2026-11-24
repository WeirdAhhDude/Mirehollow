// Mirehollow — world lore, events, vibe text, items.
'use strict';
(function (MH) {
  MH.LORE = {
    town:
      'MIREHOLLOW is a green, beautiful little village of crooked cottages, painted shutters, flower-box windows and narrow winding lanes under old oaks, where the weird, the wild and the wonderfully round coexist in chaotic harmony. ' +
      'The market square (Golden Loaf Bakery, the bookstore that is secretly Dr. Penelope\'s lab, the crooked Town Hall, the General Store, an old wishing well) sits under a ring of old trees. ' +
      'The duck pond (Lily Pad Cottage, Marina\'s lifeguard tower) anchors the east end of town. West are the residential lanes (Clutch Lane with the Coop, the Honeycomb, the Burrow Gym, the post office, the workshop). ' +
      'The swamp (Maggie\'s Stilt House, the Gator Grove) starts past the last lamp post on the east lane. The Deep Woods (Kira\'s den) lie north. South are the cornfields where the Scarecrow stands. ' +
      'Nobody gets a quiet afternoon. Recurring gatherings: Sunday Potluck at the Coop, brunch debriefs at the Velvet Antler, the Pond hangout, Gym Day at the Burrow, Friday LAN Night at the Honeycomb, the Bakery morning rush, and Maggie\'s reluctant swamp cookouts.',
    groups:
      'Loose groups: Nap rotation (Patty, Brenda, Kira). Mom Collective (Clucky, Sunny, Lily, plus Vix). Party Crew (Dionne, Bunny, Marina, Chuckles). Lab Rats (Penelope plus anyone she talks into a sample). Sky/Size Club (Nimbus, Zahra, the Darkborn, Solaris — they duck under doorways and accidentally wreck roofs). The Unholy Trinity (Gertie unaware, Scarecrow unbothered, Mayor trying to escape).',
    drama:
      'Ongoing drama: Dionne\'s campaign to win over Kira (Chuckles is an unwitting saboteur, Bunny is the bookie). Bunny\'s crush on Box (Box is oblivious, Dionne takes bets). Penelope\'s experiments drawing crowds; the Mayor keeps trying to shut the lab down and keeps getting jargoned into leaving. Maggie\'s festival scheme, conscripting Zahra and Nimbus. Sunny avoiding Marina while Vix shoves her forward. The Scarecrow appearing in the middle of group scenes and clearing the room in four seconds — except Lily, who waves.',
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
  ];

  MH.ITEMS = {
    wildflower: { name: 'Wildflower', icon: '🌼', desc: 'A cheerful little flower from the meadow.' },
    rose: { name: 'Climbing Rose', icon: '🌹', desc: 'Snipped from a fence. Romantic, slightly thorny.' },
    mushroom: { name: 'Glowcap Mushroom', icon: '🍄', desc: 'Faintly glowing. Penelope would want this.' },
    berries: { name: 'Bramble Berries', icon: '🫐', desc: 'Sweet berries from the woods.' },
    seashell: { name: 'Pond Seashell', icon: '🐚', desc: 'Somehow in a pond. Marina collects these.' },
    corn: { name: 'Ear of Corn', icon: '🌽', desc: 'From the Scarecrow\'s field. She saw you take it.' },
    feather: { name: 'Crow Feather', icon: '🪶', desc: 'Left behind by one of the Scarecrow\'s crows.' },
    bottlecap: { name: 'Shiny Bottle Cap', icon: '⚙️', desc: 'The Mayor would consider this a fine offering.' },
  };
  MH.itemIcon = (name) => {
    const n = (name || '').toLowerCase();
    for (const k in MH.ITEMS) if (n.includes(MH.ITEMS[k].name.toLowerCase()) || n.includes(k)) return MH.ITEMS[k].icon;
    if (/roll|bun|bread|loaf|croissant|pastry/.test(n)) return '🥐';
    if (/cookie/.test(n)) return '🍪';
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
    morning: ['The smell of cinnamon drifts over from the Golden Loaf.', 'A rooster that definitely isn\'t Clucky gets the time wrong.', 'Shutters bang open one by one along the lane.', 'Somewhere, twenty chicks are demanding breakfast at once.', 'Dew glitters on the roses spilling over the fences.'],
    day: ['A duck honks indignantly at the pond.', 'Somebody\'s radio is playing a little too loud.', 'You hear the rhythmic thump of someone doing burpees.', 'A crow on a fence post is watching you very closely.', 'Laundry flaps in the breeze on Clutch Lane.', 'There\'s a faint smell of something chemical from the bookstore.', 'A distant honk of a clown horn. Then laughter. Then a scream.'],
    evening: ['The lamp posts flicker on one at a time.', 'Music thumps faintly from the Velvet Antler.', 'The pond turns gold, then pink, then grey.', 'Crickets start up in the hedges.', 'A thin hum drifts in from the swamp. The swarm is awake.'],
    night: ['The village is quiet. Mostly.', 'Something rustles in the corn. You decide not to look.', 'A single light still burns in the bookstore window.', 'You hear a distant, sleepy roar from the woods.', 'The stars are very bright over Mirehollow tonight.'],
    swamp: ['Something bit you. Somewhere, someone giggles.', 'The swamp water bubbles. It\'s probably fine.', 'A low VRRRMMM passes overhead.', 'You hear hissing from a nearby bush. Several bushes, actually.'],
    woods: ['The trees here are very old, and very quiet.', 'Big paw prints in the mud. Fresh ones.', 'You hear snoring. Deep, rumbling snoring.'],
    field: ['The corn rustles, though there is no wind.', 'The crows go silent all at once.', 'You feel watched.'],
    rain: ['Rain patters on the cobbles.', 'Everyone is running for awnings.', 'The pond is pocked with raindrops.'],
    storm: ['Thunder rolls over the square. Someone must have annoyed Nimbus.', 'Lightning flickers. The Mayor screams faintly.'],
  };

  MH.MOODS_POS = ['cheerful', 'happy', 'sweet', 'hyped', 'cozy', 'radiant', 'serene', 'chill', 'proud', 'chipper', 'energetic', 'flustered', 'giddy'];
})(window.MH);
