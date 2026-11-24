// Mirehollow — townsfolk (passers-by). Generated deterministically: adult animal villagers who are
// mostly out and about. They can be talked to, witness things and spread gossip like everyone else.
'use strict';
(function (MH) {
  const R = MH.seeded(777);
  const NAMES = ['Mochi', 'Hazel', 'Pip', 'Biscuit', 'Juniper', 'Otto', 'Tamsin', 'Momo', 'Basil', 'Clover', 'Fig', 'Pudding', 'Wren', 'Kuro', 'Haru', 'Nori', 'Yuzu', 'Bramble', 'Toffee', 'Sage', 'Pickle', 'Maple', 'Doug', 'Ume', 'Rosco', 'Tilly', 'Sorrel', 'Barnaby', 'Kiki', 'Moss', 'Dot', 'Gus'];
  const SPECIES = {
    cat: { ears: 'cat', tail: 'cat', furs: ['#e8a860', '#8a8a92', '#3a3a40', '#f4ece0', '#c87a3a'] },
    dog: { ears: 'dog', tail: 'dog', furs: ['#c89a6a', '#f4e8d4', '#8a5a34', '#2e2a28'] },
    duck: { ears: 'none', tail: 'none', furs: ['#f8f6f0', '#a8946a'], acc: ['beak'] },
    otter: { ears: 'round', tail: 'otter', furs: ['#8a6440', '#6a4a30'] },
    hedgehog: { ears: 'round', tail: 'none', furs: ['#c8a880'], hair: '#6a5038', hairStyle: 'wild' },
    squirrel: { ears: 'cat', tail: 'squirrel', furs: ['#c8703a', '#9a8a7a'] },
    tanuki: { ears: 'round', tail: 'ringed', furs: ['#9a7a56'], acc: ['mask'] },
    badger: { ears: 'round', tail: 'bear', furs: ['#8a8a8c'], acc: ['mask'] },
    goat: { ears: 'goat', tail: 'puff', furs: ['#f2ece0', '#b8a68a'], acc: ['horns'] },
    mouse: { ears: 'mouse', tail: 'none', furs: ['#b8aea4', '#e8dccc'] },
    boar: { ears: 'pig', tail: 'pig', furs: ['#7a5a44'], acc: ['snout'] },
    crane: { ears: 'none', tail: 'none', furs: ['#f8f8f4'], acc: ['beak'], hair: '#d8302a', hairStyle: 'short' },
    wolf: { ears: 'fox', tail: 'fox', furs: ['#8a8c94', '#5a5a62'] },
    turtle: { ears: 'none', tail: 'none', furs: ['#7aa05a'], acc: ['shell'] },
    hamster: { ears: 'round', tail: 'none', furs: ['#e8b878', '#f4e8d8'], wide: 1 },
    capybara: { ears: 'round', tail: 'none', furs: ['#a07850'], wide: 1 },
    cow: { ears: 'goat', tail: 'puff', furs: ['#f4f0ea'], acc: ['horns'] },
  };
  const JOBS = [
    ['train conductor', ['cap'], '#2a4a7a'], ['florist', ['apron'], '#5aa060'], ['retired schoolteacher', ['glasses'], null], ['fisherman', ['cap'], '#3a6a8a'],
    ['night-shift nurse', [], '#f4f4f4'], ['delivery rider', ['cap'], '#e85a3a'], ['gardener', ['strawhat'], null], ['painter', ['scarf'], null],
    ['tea shop owner', ['apron'], '#8a5a3a'], ['vending machine restocker', ['cap'], '#3a8a5a'], ['rice farmer', ['strawhat'], null], ['station attendant', ['cap'], '#2a3a5a'],
    ['poet', ['scarf'], null], ['bus driver', ['cap'], '#4a4a6a'], ['jogger with no off switch', [], null], ['birdwatcher', ['glasses'], null],
    ['office worker who takes the 7:40 train', ['tie'], '#3a3a4a'], ['librarian', ['glasses'], null], ['beekeeper', ['strawhat'], null], ['ramen cook', ['apron'], '#f4f4f4'],
    ['electrician who fixes the utility poles', ['cap'], '#f2c82a'], ['grandma who feeds the pond ducks', ['scarf'], null], ['struggling musician', [], null], ['carpenter\'s apprentice', [], null],
    ['dog walker', ['cap'], '#c84a6a'], ['radio-show host', ['headset'], null], ['tailor', ['glasses'], null], ['photographer', ['scarf'], null], ['pharmacist', [], '#f4f4f4'], ['shrine keeper', [], '#f4f4f4'],
  ];
  const TRAITS = [
    ['gossipy', 'Chatty and nosy, always has the latest rumour and loves passing it on.', 'Excitable, lots of "did you hear?", leans in to whisper.'],
    ['shy', 'Painfully shy but kind; warms up slowly.', 'Quiet, short sentences, trails off, apologetic.'],
    ['grumpy', 'Grumbly and impatient, secretly soft-hearted.', 'Curt, complains about the weather and the trains, reluctant smiles.'],
    ['cheerful', 'Relentlessly cheerful, waves at everyone.', 'Upbeat, exclamation marks, compliments people.'],
    ['dramatic', 'Treats every small event like a soap opera.', 'Theatrical gasps, big words, dramatic pauses.'],
    ['sleepy', 'Always a little tired, yawns mid-sentence.', 'Slow, drowsy, yawns, mumbles.'],
    ['nosy', 'Has to know everyone\'s business and asks a lot of questions.', 'Questions, questions, questions.'],
    ['proper', 'Very polite and formal, a stickler for manners.', 'Formal, polite, slightly old-fashioned.'],
    ['laid-back', 'Easygoing, nothing ever bothers them.', 'Mellow, slangy, unbothered.'],
    ['anxious', 'Worries about everything, especially the swamp mosquitoes.', 'Nervous, rambling, "oh no".'],
  ];
  const COLORS = ['#d8604a', '#4a7ad8', '#5aa060', '#f4c84a', '#8a5ab0', '#e07ab0', '#3a8a8a', '#c88a3a', '#6a6a7a', '#f4f0e6', '#2a3a5a', '#a83a4a'];
  const HAIRS = ['#2a2226', '#6a4a30', '#c87a3a', '#f2e8d0', '#8a8a92', '#3a2a5a', '#a8462a'];
  const HAIRSTYLES = ['short', 'short', 'messy', 'pony', 'bun', 'long', 'curly', 'none', 'none'];
  const LINES = {
    gossipy: ['Did you hear? Someone saw Kira SMILE. Allegedly.', 'Ooh, you\'re the new one! Everyone\'s talking about you.', '*leans in* I know things. Ask me anything.'],
    shy: ['Oh! H-hello...', '*waves very small*', 'Nice... weather. Sorry.'],
    grumpy: ['Hmph. Trains were late again.', 'What. Oh. Hello.', 'Mosquitoes. Every evening. Unbelievable.'],
    cheerful: ['Good morning! Or afternoon! Lovely either way!', 'You look great today!', 'Isn\'t Mirehollow wonderful?'],
    dramatic: ['*gasps* A newcomer! The plot thickens!', 'The bakery ran out of rolls. A TRAGEDY.', 'Life is a stage, and the stage is this road.'],
    sleepy: ['*yawn* ...hi.', 'Is it morning? It feels like morning.', 'I could nap right here...'],
    nosy: ['Where are you off to? Who are you seeing? Why?', 'So, how do you like the town? Met the tiger yet?', 'What\'s in your pocket?'],
    proper: ['Good day to you.', 'Do mind the crossing, the bells are quite loud.', 'A pleasure, I\'m sure.'],
    'laid-back': ['Hey. Chill day, huh.', 'No rush, no worries.', '*stretches* Life\'s good.'],
    anxious: ['Did you hear a buzzing? I heard a buzzing.', 'Oh no, is it going to rain? It looks like rain.', 'Stay away from the swamp after dark. Please.'],
  };

  const HOMES = Array.from({ length: 23 }, (_, i) => 'h' + (i + 1));
  const PUBLIC = ['square', 'well', 'bakery', 'station', 'crossing', 'northlane', 'lanes', 'park', 'river', 'pond', 'sunflowers', 'paddies', 'busstop', 'shrine', 'store', 'postoffice'];
  const spKeys = Object.keys(SPECIES);

  MH.FOLK = [];
  for (let i = 0; i < 30; i++) {
    const name = NAMES[i];
    const spName = spKeys[Math.floor(R() * spKeys.length)];
    const sp = SPECIES[spName];
    const job = JOBS[i % JOBS.length];
    const tr = TRAITS[Math.floor(R() * TRAITS.length)];
    const fur = R.pick(sp.furs);
    const top = job[2] || R.pick(COLORS);
    const acc = (sp.acc || []).concat(job[1]);
    const pool = PUBLIC.slice(); for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
    const haunts = pool.slice(0, 3 + Math.floor(R() * 2));
    const early = 6 + Math.floor(R() * 3), late = 19 + Math.floor(R() * 4);
    const ch = {
      id: 'f_' + name.toLowerCase(), name, title: 'the ' + job[0], species: spName, folk: true, minor: true,
      home: HOMES[i % HOMES.length],
      bio: `${name} is a ${tr[0]} ${spName} who works as a ${job[0]} in Mirehollow. ${tr[1]} An ordinary townsperson with their own little life, opinions about the main villagers, and a habit of noticing things.`,
      voice: tr[2],
      quirks: [tr[0]],
      values: { kind: 1 + (R() - 0.5), funny: R() * 2 - 0.5, chaotic: R() * 2 - 1.2, generous: R() * 1.5, brave: R() * 1.5 - 0.3, rude: -1 - R() },
      start: { bond: Math.floor(R() * 6), mood: tr[0] === 'grumpy' ? 'grumbly' : tr[0] === 'sleepy' ? 'drowsy' : 'fine' },
      relations: {},
      haunts,
      schedule: [[early, 12, 'roam'], [12, 17, 'roam'], [17, late, 'roam'], [late, early, 'inside:' + HOMES[i % HOMES.length]]],
      look: {
        fur, fur2: MH.shade(fur, 1.22), hair: sp.hair || R.pick(HAIRS), hairStyle: sp.hairStyle || R.pick(HAIRSTYLES),
        ears: sp.ears, earIn: MH.shade(fur, 1.3), tail: sp.tail, eyes: R.pick(['#2a2a3a', '#3a5a2a', '#5a3a2a', '#2a3a6a']),
        top, bottom: R.pick(['#3a3a4a', '#4a5a7a', '#6a5a4a', '#2a2a30', '#8a7a5a']), dress: R() < 0.25, acc, capColor: job[2] || '#3a5a9a',
        scarf: R.pick(COLORS), wide: sp.wide || 0, tall: Math.floor(R() * 3), lashes: R() < 0.5,
      },
      offline: LINES[tr[0]] || LINES.cheerful,
      partyLove: tr[0] === 'shy' || tr[0] === 'grumpy' ? -0.3 : 0.4,
    };
    MH.FOLK.push(ch);
    MH.CHAR[ch.id] = ch;
  }
  MH.ALL = MH.CHARS.concat(MH.FOLK);
})(window.MH);
