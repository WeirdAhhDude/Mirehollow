# Mirehollow

A cozy-chaotic 2D village life-sim / sandbox RPG for Android where every villager is driven by AI.
Walk around a pixel-art town, talk to anyone by typing (role-play style, `*actions*` included),
and watch relationships, gossip and reputations evolve on their own.

**Download:** [`dist/Mirehollow.apk`](dist/Mirehollow.apk)

## Installing on your phone

1. Download `dist/Mirehollow.apk` on your Android phone (Android 7.0+).
2. Open it. Android will ask you to allow installs from your browser/file manager — allow it.
3. Install and launch **Mirehollow**.

Updates install over the previous version and keep your save (all builds are signed with the same key).

## Turning on the AI villagers (OpenRouter)

The game works offline with simple canned dialogue, but it's meant to be played with AI:

1. Create an account at [openrouter.ai](https://openrouter.ai) and add a few dollars of credit.
2. Create an API key (Keys → Create key).
3. In the game: **⚙️ → Settings & AI** → paste the key → **Test connection**.
4. Optionally tap **Browse** to pick a different model (default: `google/gemini-2.5-flash`, fast and cheap).

The key is stored only on your device and is sent only to OpenRouter.
Each villager reply is one AI call (roughly a few thousand tokens). With a cheap model a long play session
costs cents. Villager-to-villager small talk also uses calls when you can see it — turn it down or off in
Settings if you want to save credit.

## How to play

| | |
|---|---|
| **Move** | Drag on the left half of the screen (floating joystick). Push further to run. Keyboard: WASD / arrows, Shift to run. |
| **Interact** | Round **A** button (or E / Space): talk, wake someone up, knock on doors, pick flowers & forage, read the Grapevine board, make a wish at the well, rest at home. |
| **Chat** | Type anything. Put actions in asterisks: `*offers a handshake*`, `*hides behind Vix*`. Villagers answer with their own actions you can respond to. |
| **Group chats** | Villagers nearby overhear and may wander in; portraits shrink to make room. They can also leave. Tap **…** to stay quiet and let them talk among themselves. |
| **Give things** | 🎁 in the chat bar, or just write it: `*hands Lily a wildflower*`. |
| **Journal** | 📖 — every villager's bond, mood, what they think of your reputation, and what they remember about you. Also your reputation, pocket and the town map. |
| **Log** | 💬 — full history of conversations, overheard chatter and events. |

### What's simulated

- **Memories** — each villager keeps their own memories of you (things you did, said, and things they heard).
- **Mood** — changes through conversations, drifts back overnight.
- **Bonds** — per villager, from *Nemesis* to *Best Friend*, plus free-form labels the AI can set ("rivals", "crush", "grudging respect"…).
- **Reputation** — six traits (kind, funny, chaotic, generous, brave, rude). Each villager only knows what they **witnessed** or **heard through gossip**, and each one values different traits — Dionne loves chaos, Kira hates it. One villager can like you *because* of your reputation while another can't stand you for the same thing.
- **Witnesses & gossip** — anyone nearby sees what you do. Villagers who bump into each other chat (you can overhear) and pass gossip along, shifting each other's opinion of you.
- **Approaches** — villagers decide on their own to walk up to you: to introduce themselves, to bring up something they heard, or to confront you.
- **Schedules** — everyone has a daily routine, plus weekly gatherings (Sunday Potluck at the Coop, Friday LAN Night, Shark-Cookie Tuesday…). Visitors like Nimbus and Solaris only show up some days.
- **Vibe captions** — little ambient lines ("You hear some noises near the bakery").
- **Time & weather** — day/night with lamp lighting, rain and storms (annoy Nimbus and see what happens).

## The cast

Sunny (fox baker), Vix (her cousin), Marina (shark lifeguard), Lily (frog), Kira (tiger), Maggie (mosquito),
Gertie (crocodile), the Scarecrow, Dr. Penelope (pig scientist), Dionne (deer, club owner), Clucky (hen),
Bunny (rabbit coach), Box (cube-headed gym owner), Brenda (bear gamer), Patty (panda), Mayor Ringo (raccoon),
Sable (snake shopkeeper), Zahra (genie), Chuckles (clown), Nimbus (cloud titan), Solaris (the sun),
the Darkborn (eldritch grandma), plus Mailman Mole, Barber Sheep, Doctor Owl and Carpenter Beaver.

Personalities live in [`app/src/main/assets/web/js/data_chars.js`](app/src/main/assets/web/js/data_chars.js).
They were adapted from the original Mirehollow lore and rewritten to keep the game cozy PG-13 — all the quirks,
crushes, feuds and running gags are kept; nudity and sexual content were removed. The AI is also instructed to
keep things PG-13 and to have villagers deflect in character if pushed.

## Adding character art

Sunny uses a real illustration as her chat portrait; everyone else uses an upscaled pixel portrait. To give
another villager a portrait:

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
  js/data_lore.js   world lore, weekly gatherings, items, vibe lines
  js/world.js       town map generation, locations, A* pathfinding
  js/art.js         procedural pixel art: tiles, trees, buildings, chibi sprites, portraits
  js/social.js      bonds, reputation, memories, witnesses, gossip
  js/entities.js    player & villager movement
  js/sim.js         time, weather, schedules, villager brains, small talk, approaches, vibes
  js/ai.js          OpenRouter client, prompt building, JSON parsing, offline fallback
  js/chat.js        conversations: chat bar, portraits, speech bubbles, group joins/leaves
  js/ui.js          HUD, journal, settings, title screen, character creator
  js/main.js        boot, game loop, save/load
```

**Signing key:** `app/mirehollow.keystore` (password `mirehollow`) is committed on purpose so every build can
update the installed app without wiping your save. It's a hobby key — if you ever publish to Google Play,
Play App Signing uses its own key anyway.
