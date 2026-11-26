# Mirehollow

A cozy-chaotic 2D village life-sim / sandbox RPG for Android (portrait) where every villager is driven by AI.
Wander a hand-painted countryside town — railway crossings, utility poles, tiled roofs, overgrown lanes —
talk to anyone by typing (role-play style, `*actions*` included), and watch relationships, gossip and
reputations evolve on their own. You're the only human in town.

**Download:** [`dist/Mirehollow.apk`](dist/Mirehollow.apk)

## Installing on your phone

1. Download `dist/Mirehollow.apk` on your Android phone (Android 7.0+).
2. Open it. Android will ask you to allow installs from your browser/file manager — allow it.
3. Install and launch **Mirehollow**.

Updates install over the previous version and keep your save, character edits and uploaded portraits (all builds
are signed with the same key) — just open the new APK, no need to uninstall.

**Auto-backup (recommended):** ⚙️ → Settings & AI → 💾 Backups → **Choose auto-backup file…** — pick a file once
(choose **Google Drive** in the picker for a cloud copy). The game rewrites that same file every few minutes of
play, when you sleep and when you leave the app, so it's always your latest progress. **Load from it** restores it
on any phone. **⏪ Restore points** keeps the last 8 automatic snapshots inside the app (every ~15 minutes of play,
each new day, and right before any import), so an accidental import can be undone. Importing also warns you if the
file is older than your current game.

**Backups:** ⚙️ → Settings & AI → **Export backup** saves one `.json` file wherever you choose (Downloads, Drive…).
It holds everything: your game (bonds, memories, money, items, reputation, story log, plans, parties, followers,
time of day), every character edit, uploaded portraits and your settings. Your API key is never included.
**Import backup** (also reachable from the title screen) restores it on any phone; older pasted exports still work.

## Turning on the AI villagers (OpenRouter)

The game works offline with simple canned dialogue, but it's meant to be played with AI:

1. Create an account at [openrouter.ai](https://openrouter.ai) and add a few dollars of credit.
2. Create an API key (Keys → Create key).
3. In the game: **⚙️ → Settings & AI** → paste the key → **Test connection**.
4. Optionally tap **Browse** to pick a different model (default: `google/gemini-2.5-flash`, fast and cheap).
5. **Content rules**: *Cozy (PG-13)*, *Mature (16+)* (strong language, darker themes, heavier drama, romance can go
   further, anything sexual fades to black instead of being refused) or *Custom*, where you type your own rules
   in-game to test wording without rebuilding. Custom rules are placed at the very top of the prompt as the highest-priority instruction and repeated at the end of every request, so they override the default cozy tone. In every mode a fixed rule is added: nothing sexual involving minors.
6. **Model thinking**: keep it *Off* for fast replies (and so the model's reasoning never leaks into dialogue).
   *Prefer the fastest provider* asks OpenRouter for the lowest-latency host of your model.

### Where the prompt rules live in the code
- `app/src/main/assets/web/js/ai.js` → `COZY_RULES`, `MATURE_RULES`, `ALWAYS_RULE` and `AI.contentRules()` (the
  block marked `===== CONTENT RULES =====`). `sysPrompt()` right below it holds all the other storytelling
  instructions (line length, leaving conversations, JSON format).
- Villager personalities: `js/data_chars.js`. Town description sent to the AI: `MH.LORE.brief` in `js/data_lore.js`.

The key is stored only on your device and is sent only to OpenRouter.
Each villager reply is one AI call (roughly a few thousand tokens). With a cheap model a long play session
costs cents. Villager-to-villager small talk also uses calls when you can see it — turn it down or off in
Settings if you want to save credit.

## How to play

| | |
|---|---|
| **Move** | Drag on the left half of the screen (floating joystick). Push further to run. Keyboard: WASD / arrows, Shift to run. |
| **Interact** | Round **A** button (or E / Space): talk, wake someone up, knock on doors, pick flowers & forage, read the Grapevine board, make a wish at the well, go into your house. |
| **Chat** | Type anything. Put actions in asterisks: `*offers a handshake*`, `*hides behind Vix*`. Villagers answer with their own actions you can respond to. Their lines pop up in bubbles over their (big) portraits. |
| **Group chats** | Villagers nearby overhear and may wander in; portraits shrink to make room. They leave on their own when they have somewhere to be (or get bored). **Tap a portrait to talk to just that person** (tap again to talk to everyone). **… Listen** lets them talk among themselves; **📜 Log** shows the whole conversation. Each character's latest line stays on screen. |
| **Shops** | The bakery, gym, bookstore/lab, general store, club, town hall, clinic and barbershop can be entered during opening hours — staff work behind their counters and customers drop in. Closed? Knock. |
| **Give things** | 🎁 in the chat bar, or just write it: `*hands Lily a wildflower*`. |
| **Follow** | Ask someone to come along (🏠 Invite → *Come with me now*), or it just happens in the story ("he did WHAT? let's go see him"). Followers trail you everywhere — into shops and your house — and join your conversations, until they decide to leave or you tap their icon under the clock. |
| **Invite** | 🏠 in the chat bar: invite whoever you're talking to over to your house, or to meet at the pond/park/shrine/etc. — now, in an hour, tonight or tomorrow. They answer in character. Villagers can also set up meetups on their own. |
| **Your house** | Right by the west railway crossing. Inside: sleep on the futon, raid the fridge once a day, and plan parties on the low table. |
| **Parties** | Pick a theme, place, time and guest list. Mailman Mole delivers the invitations (occasionally to the wrong house); RSVP notes trickle back; guests show up and the party becomes one big group chat. Don't skip your own party. |
| **Events** | Weekly gatherings (Sunday Potluck, LAN Night, Lantern Evening at the shrine…). Just show up to join. See Journal → Plans. |
| **Jobs** | Ask for work at a shop counter (bakery, gym, General Store, club, lab, town hall, clinic, barbershop) or at the Post Office / Maggie's Stilt House: bread deliveries, litter patrol, restocking shelves, kneading dough and mixing drinks (timing minigames), being Penelope's test subject, and Maggie's very questionable blood drive. Pay depends on how well you do; one job at a time, each once a day. |
| **Shopping** | Counters at the bakery, General Store and club bar, plus **Mirehollow Mall** (south of the square, by the park) with five kiosks: food, gifts, clothes you actually wear, home decor that appears in your house, and fun stuff (fireworks, energy drinks, lottery tickets, bug spray, party kits). Sable buys what you forage. |
| **Favours** | Villagers sometimes ask for help (in conversation, or by walking up to you). Accept or decline; bring items with 🎁, deliver packages to the right person, go where they asked. Journal → Favours. |
| **Health & fights** | The ❤️ bar under the clock is your health. Fights are turn-based, right inside the conversation (Undertale-style): on **your turn** type an attack as an action (`*drop kicks Gristle*`, `*gets behind Rook and headlocks him*`) — it hits or misses depending on how tough the target is (weak villagers can go down in one hit) — or just talk, or try to leave. On **their turn** everyone still standing attacks: steer your ❤️ around the box (drag anywhere) to dodge — a few slow shots from weak villagers, a "bad time" from Kira. Group fights give every enemy their own health bar (tap one to target it); friends can land their own hits or drag you out. **⚔️ Fight** in the chat bar challenges someone to a friendly spar or a real fight (inside a fight it inserts an attack); villagers start fights too. Sometimes you can't leave at all — you just got caught, someone is blocking the way, or (playfully) won't let go. Sparring is friendly and builds respect. Weapons: bat & frying pan at the General Store, knives/crowbars/brass knuckles at the bandits' black market — equip one from Journal → Pocket. Heal by eating, at the onsen (♨ 5 coins), the clinic (10 coins) or by sleeping. At 0 HP you black out and are robbed, rescued to the clinic, or (rarely) die — then the day restarts. |
| **Phones** | Buy a smartphone at the mall (Fun & Phones), then tap 📱 at the top: text villagers who own a phone (invites and plans work by text), and get texts from them. Not everyone has one — buy a spare phone and give it to them. |
| **Penelope's inventions** | At the lab counter: jetpack (fly over cliffs and rivers for an hour), Black Hole Sniper 3000 (wins any fight, 3 charges), teleporter remote, invisibility cloak (nobody witnesses what you do), Pocket Healer 9000, Rain-B-Gone, gravity boots, translator collar (understand the mute villagers). She can also invent things for you in conversation. |
| **Characters** | Up to 4 save slots: ⚙️ → 👥 Switch character, or pick on the title screen. Try a saint and a menace. Backups include every slot. |
| **Reset today** | ⚙️ → 🔁 Reset today: rewind the whole day to how it started, or only make everyone forget what happened today. |
| **Journal** | 📖 — every villager's bond, mood, what they think of your reputation, and what they remember about you. Also favours, jobs, your reputation, pocket (wardrobe & decor) and the town map. |
| **Log** | 💬 — full history of conversations, overheard chatter and events. |

### What's simulated

- **Memories** — each villager keeps their own memories of you (things you did, said, and things they heard). When a list gets long, the oldest memories are fused into a few summary lines overnight (by the AI if you have a key) instead of being forgotten.
- **Mood** — changes through conversations, drifts back overnight.
- **Bonds** — per villager, from *Nemesis* to *Best Friend*, plus free-form labels the AI can set ("rivals", "crush", "grudging respect"…).
- **Reputation** — seven traits (kind, funny, chaotic, generous, brave, rude, violent). A good name builds slowly (good deeds count for about half) and a bad one spreads fast (bad deeds count almost double). Hurting someone is never laughed off: the victim and witnesses react for real, and villagers who think you're violent become **afraid of you** — they flinch, run when you get close, and may refuse to talk. Each villager only knows what they **witnessed** or **heard through gossip**, and each one values different traits — Dionne loves chaos, Kira hates it. One villager can like you *because* of your reputation while another can't stand you for the same thing.
- **Witnesses & gossip** — anyone nearby sees what you do. Villagers who bump into each other chat (you can overhear) and pass gossip along, shifting each other's opinion of you.
- **Approaches** — now and then (not often) a villager walks up to you on purpose: to bring up something they heard, or because they really like (or really don't like) you.
- **Schedules** — everyone has a routine but roams between favourite haunts, so you'll have to go looking for people. Friend groups head out together (the Party Crew at the river, the nap rotation in the park…). Visitors like Nimbus and Solaris only show up some days.
- **Villager drama** — rivals seek each other out and argue (you can overhear it, or hear shouting from afar), friends take sides, newcomers barge into conversations, and uninvited guests can crash your parties. Conversations have no time limit — people only leave when the story makes them.
- **Townsfolk** — ~30 animal passers-by with their own names, jobs and personalities. Talk to them; they witness things and gossip too.
- **The highlands** — south of town: Lookout Hill (two cliff levels, with Juniper's lookout tower), Crag Heights (a village on a plateau with Thistle's Onsen and Vale Manor), the orchard (pick apples), the waterfall, the Pine Forest, the scrublands and the Hollow Crags where the bandits live. Raised plateaus have cliff faces; look for the stairs.
- **Bandits & villains** — the Hollow Gang (Rook, Gristle, Snitch) extort and harass villagers, mug lone travellers and pick pockets; Mortimer Vale (a cruel landlord) and Vesper (a rumour-spreading manipulator) bully people more quietly. Harassment can turn into real fights between villagers — the loser limps to the clinic.
- **Chases** — villagers run after you when it fits: you fled a fight, walked off after hitting or enraging someone, a bandit wants your wallet (they sprint after you at night or in quiet places), or a playful game of tag. Sprint to lose them (Bunny is too fast for that), duck indoors, fly off with a jetpack or vanish under the invisibility cloak. If they catch you, the scene continues — usually as a fight. Their friends may join the chase.
- **Taking sides** — when a fight breaks out, the opponent's friends can jump in against you (harder fight), your friends can jump in for you (you hit harder, take less), and timid bystanders run off. Fights between villagers work the same way.
- **Dragging** — villagers can grab you and drag you somewhere mid-conversation.
- **Train** — a little local train runs through town; the crossing bells ring and the barriers block the road while it passes.
- **Vibe captions** — little ambient lines ("You hear some noises near the bakery").
- **Time & weather** — day/night with lamp lighting, rain and storms (annoy Nimbus and see what happens).

## The cast

Sunny (fox baker), Vix (her cousin), Marina (shark lifeguard), Lily (frog), Kira (tiger), Maggie (mosquito),
Gertie (crocodile), the Scarecrow, Dr. Penelope (pig scientist), Dionne (deer, club owner), Clucky (hen),
Bunny (rabbit coach), Box (cube-headed gym owner), Brenda (bear gamer), Patty (panda), Mayor Ringo (raccoon),
Sable (snake shopkeeper), Zahra (genie), Chuckles (hyena clown), Nimbus (cloud titan), Solaris (the sun),
the Darkborn (eldritch grandma), Juniper (red panda lookout), Granny Thistle (onsen keeper), Rook, Gristle and Snitch
(the Hollow Gang), Mortimer Vale (landlord) and Vesper (the rumour mill), plus Mailman Mole, Barber Sheep, Doctor Owl
and Carpenter Beaver.

Personalities live in [`app/src/main/assets/web/js/data_chars.js`](app/src/main/assets/web/js/data_chars.js).
They were adapted from the original Mirehollow lore and rewritten to keep the game cozy PG-13 — all the quirks,
crushes, feuds and running gags are kept; nudity and sexual content were removed. The AI is also instructed to
keep things PG-13 and to have villagers deflect in character if pushed.

## Editing characters & portraits (in-game)

Journal → Villagers → tap someone → **✏️ Edit character & portrait**. (The journal doesn't tell you where people are — ask around, or text them.) **✨ Auto-fill with AI**: describe the
character in your own words and the AI rewrites every box (title, species, bio, voice, quirks, relationships,
notes) to match — nothing is saved until you tap Save. You can also change their name, title,
species, personality/backstory, how they talk, quirks, relationships and extra notes for the AI, and
**👁 Preview what the AI reads** shows the exact text sent to the model. **📷 Upload portrait** picks an image
from your phone; sliders adjust its size and position. Edits are stored on the device (they survive new
games) and **Reset to original** undoes them.

## Adding character art in the code

Sunny and Patty use real illustrations as their chat portraits; everyone else uses a big version of their
chibi. To bake a portrait into the app itself:

1. Put a transparent PNG/WebP in `app/src/main/assets/web/portraits/` (e.g. `marina.webp`, ~800 px tall).
2. In `data_chars.js`, add `portrait: 'portraits/marina.webp',` to that villager.
3. Rebuild.

## Building

Requirements: JDK 17+ and the Android SDK (platform 35, build-tools 35).

```bash
echo "sdk.dir=/path/to/android-sdk" > local.properties
./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

To try the game in a desktop browser while developing, serve the web folder and open it
(AI calls from the browser go straight to OpenRouter):

```bash
cd app/src/main/assets/web && python3 -m http.server 8765
# open http://localhost:8765
```

### Project layout

```
app/src/main/java/.../MainActivity.java   Full-screen WebView shell + native HTTP bridge (no CORS issues)
app/src/main/assets/web/
  index.html, css/style.css               UI
  js/core.js        helpers, settings, storage, native bridge
  js/data_chars.js  villagers (bios, voices, values, schedules, looks)
  js/data_folk.js   generated townsfolk (passers-by)
  js/data_lore.js   world lore, weekly gatherings, outings, items, vibe lines
  js/world.js       town map generation, locations, house interior, A* pathfinding
  js/art.js         procedural painted art: ground chunks, trees, tiled-roof buildings, vector chibis, portraits
  js/social.js      bonds, reputation, memories, witnesses, gossip
  js/entities.js    player & villager movement
  js/sim.js         time, weather, schedules & haunts, villager brains, small talk, approaches, train,
                    gatherings, visits/meetups and parties
  js/ai.js          OpenRouter client, prompt building, JSON parsing, offline fallback
  js/chat.js        conversations: chat bar, portraits, speech bubbles, group joins/leaves
  js/ui.js          HUD, journal, settings, title screen, character creator
  js/shop.js        shops & the mall, wardrobe, home decor, usable items, selling forage
  js/jobs.js        jobs, the timing minigame, job markers
  js/quests.js      favours villagers ask for (accept/decline, completion checks)
  js/fight.js       health, the fight minigame, weapons, knockouts, villager-vs-villager fights
  js/phone.js       phones, contacts, texting and incoming texts
  js/main.js        boot, game loop, save/load
```

**Signing key:** `app/mirehollow.keystore` (password `mirehollow`) is committed on purpose so every build can
update the installed app without wiping your save. It's a hobby key — if you ever publish to Google Play,
Play App Signing uses its own key anyway.
