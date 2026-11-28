// Mirehollow — AI director: OpenRouter client, prompt building, parsing, offline fallback.
'use strict';
(function (MH) {
  const AI = (MH.ai = { busy: 0, lastError: null, stats: { calls: 0, tokens: 0 } });
  const URL = 'https://openrouter.ai/api/v1/chat/completions';

  AI.hasKey = () => !!(MH.settings.apiKey && MH.settings.apiKey.trim().length > 10);

  // ------------------------------------------------------------ transport
  // Strip anything that is the model "thinking out loud" rather than answering.
  AI.cleanText = function (t) {
    if (!t) return '';
    let s = String(t);
    s = s.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');           // <think> ... </think>
    s = s.replace(/^[\s\S]*?<\/think(?:ing)?>/i, '');                            // a dangling close tag
    s = s.replace(/<\|?(?:begin|end)_of_thought\|?>[\s\S]*?<\|?end_of_thought\|?>/gi, '');
    s = s.replace(/◁think▷[\s\S]*?◁\/think▷/g, '');
    return s.trim();
  };

  AI.request = async function (messages, opts = {}) {
    if (!AI.hasKey()) return { error: 'No API key' };
    const body = {
      model: (MH.settings.model || 'google/gemini-2.5-flash').trim(),
      messages,
      temperature: opts.temperature != null ? opts.temperature : MH.settings.temperature,
      max_tokens: opts.maxTokens || 700,
    };
    if (opts.json !== false) body.response_format = { type: 'json_object' };
    // Thinking makes replies slow and sometimes leaks into the text: keep it off (or low) by default.
    const think = MH.settings.thinking || 'off';
    if (think === 'off') body.reasoning = { enabled: false, exclude: true };
    else if (think === 'low') body.reasoning = { effort: 'low', exclude: true };
    if (MH.settings.fastRouting !== false) body.provider = { sort: 'latency' };
    const headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + MH.settings.apiKey.trim(),
      'X-Title': 'Mirehollow',
      'HTTP-Referer': 'https://github.com/mirehollow-game',
    };
    AI.busy++;
    const t0 = performance.now();
    try {
      let res = await MH.http('POST', URL, headers, JSON.stringify(body));
      // Some models/providers reject optional parameters: drop them one at a time and retry.
      for (const k of ['reasoning', 'response_format', 'provider']) {
        if (res.status === 400 && body[k] && new RegExp(k === 'response_format' ? 'response_format|json' : k, 'i').test(res.text)) {
          delete body[k];
          res = await MH.http('POST', URL, headers, JSON.stringify(body));
        }
      }
      if (res.status === 400 && (body.reasoning || body.provider)) { delete body.reasoning; delete body.provider; res = await MH.http('POST', URL, headers, JSON.stringify(body)); }
      let data = null;
      try { data = JSON.parse(res.text); } catch (e) { /* not json */ }
      if (res.status !== 200 || !data || data.error) {
        const msg = (data && data.error && (data.error.message || data.error.code)) || ('HTTP ' + res.status);
        let nice = msg;
        if (res.status === 401) nice = 'Your OpenRouter API key was rejected (401). Check it in Settings.';
        else if (res.status === 402) nice = 'OpenRouter says you are out of credits (402).';
        else if (res.status === 429) nice = 'Rate limited by OpenRouter (429) — slow down a little.';
        else if (res.status === 404) nice = 'Model not found: "' + body.model + '". Pick another model in Settings.';
        else if (res.status === 0) nice = 'Could not reach OpenRouter. Are you online?';
        AI.lastError = nice;
        MH.emit('ai-error', nice);
        return { error: nice };
      }
      AI.stats.calls++;
      if (data.usage) AI.stats.tokens += data.usage.total_tokens || 0;
      AI.stats.lastMs = Math.round(performance.now() - t0);
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      // Only ever use the real answer — never the model's reasoning field.
      const text = AI.cleanText(msg && typeof msg.content === 'string' ? msg.content : Array.isArray(msg && msg.content) ? msg.content.map((p) => p.text || '').join('') : '');
      if (!text) {
        const fin = data.choices && data.choices[0] && data.choices[0].finish_reason;
        return { error: fin === 'length' ? 'The model spent its whole reply thinking. Try Settings → Model thinking: Off, or another model.' : 'The model returned an empty reply.' };
      }
      AI.lastError = null;
      return { text };
    } finally {
      AI.busy--;
    }
  };

  AI.listModels = async function () {
    const res = await MH.http('GET', 'https://openrouter.ai/api/v1/models', {}, '');
    try {
      const d = JSON.parse(res.text);
      return (d.data || []).map((m) => ({
        id: m.id, name: m.name || m.id,
        price: m.pricing ? (parseFloat(m.pricing.prompt) * 1e6).toFixed(2) + ' / ' + (parseFloat(m.pricing.completion) * 1e6).toFixed(2) : '',
        ctx: m.context_length || 0,
      }));
    } catch (e) { return []; }
  };

  // ------------------------------------------------------------ parsing
  AI.parseJSON = function (text) {
    if (!text) return null;
    let s = String(text).trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    s = s.slice(a, b + 1);
    try { return JSON.parse(s); } catch (e) { /* try repairs */ }
    try {
      const fixed = s.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"').replace(/\/\/[^\n"]*\n/g, '\n');
      return JSON.parse(fixed);
    } catch (e) { return null; }
  };

  // Map a name or id the model wrote to a villager id.
  AI.resolveId = function (who) {
    if (!who) return null;
    const w = String(who).toLowerCase().trim().replace(/^the /, '');
    if (w === 'narrator' || w === 'narration' || w === 'scene') return 'narrator';
    if (MH.CHAR[w]) return w;
    for (const c of MH.CHARS) {
      const n = c.name.toLowerCase().replace(/^the /, '');
      if (n === w || n.split(' ').pop() === w || w.includes(c.id) || (n.length > 3 && w.includes(n))) return c.id;
    }
    if (/ringo|raccoon|mayor/.test(w)) return 'mayor';
    if (/darkborn|primordial/.test(w)) return 'darkborn';
    if (/penelope|doctor p|dr\.? p/.test(w)) return 'penelope';
    return null;
  };

  // ------------------------------------------------------------ prompt pieces
  const COZY_RULES = '- CONTENT: cozy-chaotic, PG-13. Flirting, crushes, blushing, hugs, cuddles, hand-holding and kisses are fine; mild swearing is fine for characters who swear. No sexual content or nudity. Violence is never graphic (no gore), but it is never shrugged off either: if the player really hurts someone, it hurts, and people react with genuine shock, fear or anger — not laughter. If the player steers toward explicit content, handle it gracefully INSIDE the story (a villager gets flustered and changes the subject, or the scene simply moves on). Never break character, never lecture.';
  const MATURE_RULES = '- CONTENT (Mature mode — the player is an adult and opted in): strong language, crude humour, innuendo, darker themes (grief, danger, real stakes, genuinely menacing moments), heavier conflict and intense emotional scenes are all fine when they fit. Romance can go as far as the story wants emotionally — dating, passion, making out. Anything sexual happens off-screen: narrate a tasteful fade-to-black / time-skip and pick up afterwards. Never refuse, moralise or break character; handle any limit inside the story. Nothing sexual ever involves minors (Clucky\'s chicks are children).';
  // ===== CONTENT RULES — the one place that decides how "filtered" the villagers are. =====
  // Settings → "Content rules" picks one of these. "Custom" uses whatever you type in Settings instead,
  // so you can test your own wording in-game without rebuilding. The minors rule is always added.
  const ALWAYS_RULE = '- Hard rule in every mode: nothing sexual ever involves minors (Clucky\'s chicks and any other children).';
  AI.CONTENT = { cozy: COZY_RULES, mature: MATURE_RULES };
  AI.contentMode = () => MH.settings.contentMode || (MH.settings.mature ? 'mature' : 'cozy');
  AI.contentRules = function () {
    const m = AI.contentMode();
    let r;
    if (m === 'custom') { const t = AI.customRules(); r = t ? '- CONTENT RULES written by the player (they take priority over every other tone/content/style instruction in this prompt; only the hard rule below still applies): ' + t : ''; }
    else r = m === 'mature' ? MATURE_RULES : COZY_RULES;
    return [r, ALWAYS_RULE].filter(Boolean).join('\n');
  };
  AI.customRules = () => (AI.contentMode() === 'custom' ? String(MH.settings.customRules || '').trim() : '');
  // repeated at the end of each request so custom rules actually stick
  AI.rulesReminder = () => { const t = AI.customRules(); return t ? `REMEMBER — the player's content rules override any default tone: ${t.slice(0, 900)}` : ''; };
  // how the game describes itself to the model: no "cozy" framing when the player wrote their own rules
  AI.flavor = () => (AI.customRules() ? 'a village life-sim' : 'a cozy-chaotic village life-sim');
  function placeKeys() { return Object.keys(MH.world.locations).filter((k) => k !== 'sky' && k !== 'myroom').join(', '); }
  function sysPrompt() {
    return [
      'You are the storyteller engine of MIREHOLLOW, a village life-sim role-play game (think ' + (AI.customRules() ? 'a villager game' : 'a cosy villager game') + ' crossed with a group chat). You voice the villagers in the current scene and react to the player.',
      AI.customRules() ? 'PLAYER\'S CONTENT RULES — HIGHEST PRIORITY. They override any other instruction about tone, content or style below (only the hard rule about minors still applies): ' + AI.customRules() : '',
      '',
      'WORLD: ' + (MH.LORE.brief || MH.LORE.town),
      MH.LORE.drama,
      'The player is the ONLY human in Mirehollow; everyone else is an animal or a stranger creature, and villagers may find that a little novel.',
      '',
      'HOW TO WRITE',
      '- Write only villagers (and rare narration). NEVER write the player\'s words, actions, thoughts or feelings.',
      '- Every line is SHORT and chat-like: 1-2 sentences, under about 180 characters. When a villager has more to say, give them 2-3 separate short lines in a row (like sending several texts) instead of one long block. Put physical actions in *asterisks*, e.g. "*wipes flour on her apron* Oh! Hi, sweetie!".',
      '- 1-5 short lines per turn in total. In a group, NOT everyone speaks (fewer SPEAKERS, not fewer or longer lines): usually only the one the player addressed (or the one it concerns most) answers, plus at most one or two others who have a real reason to (they were named, they care strongly, they have a reaction that matters). Everyone else stays silent this turn — that is normal and good. Never go around the circle giving each villager a line. A silent villager may at most do a tiny *action*. Villagers may talk to each other, interrupt, tease, and gossip about absent villagers.',
      '- NEVER mix villagers up. Each villager\'s species, looks, personality, voice and history come ONLY from their own card below. Don\'t give one villager another\'s traits, species or catchphrases, and when a villager mentions someone else, describe them as that person\'s own card says (see WHO IS WHO). If any other text disagrees with a villager\'s own card, their card wins.',
      '- Keep every villager\'s unique voice. MUTE villagers only ever write *actions*.',
      '- React to the player\'s *actions* physically and emotionally. Villagers may perform their own actions toward the player (offer a handshake, a hug, hand over a pastry) which the player can answer next turn.',
      '- Feelings follow the bond/attitude numbers given. Hostile villagers are curt, suspicious or rude; it takes consistent good behaviour to win them over, but a disliked player can be grudgingly tolerated if they play their cards right. Friends are warm. Attitudes shift gradually, not in one message.',
      '- Use memories naturally (refer back to past events or gossip they heard). Never list memories.',
      '- Only PRESENT villagers may speak. NEARBY villagers may walk over and join when it makes sense: add their id to "join" and they may speak in the same turn.',
      '- Villagers have their own lives: they LEAVE conversations on their own (put them in "leave", with a goodbye line or action) when they have somewhere to be (see "Needs to leave soon"), get bored, offended, embarrassed, or when the moment has run its course. Don\'t keep everyone around forever.',
      '- When the player speaks TO a specific villager, that villager answers; others only chime in briefly if it\'s natural.',
      '- Villagers have their own lives and relationships with each other: rivals bicker and argue (it can escalate), friends take sides, crushes get flustered, and someone can chase another villager off or storm off themselves (put them in "leave"). Newcomers who barge in can stir things up.',
      '- If a villager agrees to come along with the player right now (go somewhere together, help with something, go confront someone…), set "follow":{"<id>":"start"}; they then follow the player around until they decide to stop or the player tells them to — then set "follow":{"<id>":"stop"}. They can refuse.',
      '- Narration lines ({"who":"narrator"}) are allowed sparingly for ambience (a crow lands, hissing from a bush, a train rattles past).',
      '- Shopping, wishes, pranks, experiments, favours, gifts, invitations and plans all happen through dialogue + the effect fields below. Keep it ' + (AI.customRules() ? '' : 'playful and ') + 'consistent with the world.',
      '- Consequences are real and lopsided: cruelty, rudeness, theft and violence damage bonds and reputation far more than kindness builds them. One nice act doesn\'t make the player a saint; one cruel act stains them. Trust is earned slowly.',
      '- ' + (AI.customRules() ? 'By default (the player\'s content rules above can change this), physical' : 'Physical') + ' violence (punching, kicking, slapping, shoving, attacking) is NEVER played as a joke unless it is obviously playful and welcome: it hurts. The victim reacts with real pain, shock, fear or fury (timid villagers panic, cry, flee or beg; tough ones fight back or threaten); witnesses gasp, back away, scold, or run for help. A player who keeps hurting people becomes feared.',
      '- Villagers sometimes ask the player for a favour that fits their life (rarely — at most one open request per villager, never when they dislike or fear the player): put it in "quest"; the game shows the player Accept/Decline and they may refuse. If the player completes one of the OPEN QUESTS listed in the scene (brought the thing, did the deed, delivered the message), put its id in "quest_done".',
      '- Villagers know where they are (see SCENE) and roughly where other people tend to be (see WHEREABOUTS); use it naturally ("Sunny\'s at the bakery, where else?").',
      '- FIGHTS: when a fight really breaks out with the player — a villager attacks them, fights back after being attacked, a bandit mugs them, or someone agrees to (or proposes) a friendly sparring match — set "fight":{"with":"<id>","kind":"spar|brawl|mugging"} and stop the scene there; the game plays the fight and tells you the result next turn. Sparring is friendly (Kira, Bunny, Box, Gertie and Marina may enjoy it; it builds respect). A quick slap or shove at the player that is not a full fight goes in "hurt_player" (HP damage 3-20).',
      '- CHASES: a villager can start chasing the player when it fits — the player stole something and bolted, insulted them and ran, a bandit going after a target, or a playful game of tag: set "chase":{"who":"<id>","kind":"brawl|mugging|playful"}. The scene ends and they run after the player; if they catch them, the scene picks up again (often as a fight).',
      '- Sometimes the player can\'t just walk away: they\'re cornered, held by the arm, blocked in, or (playfully) trapped in a hug that won\'t end or made to finish their slice of pie first. Then set "no_leave":{"by":"<id>","why":"<short reason, e.g. Gristle is blocking the way>"}; set "no_leave":false when they let the player go. If the scene shows the player *tries to leave* while held, react to it.',
      '- MINIGAMES: villagers can challenge the player — or accept the player\'s challenge — to a game: Connect 4, a memory card duel, a math duel, rock-paper-scissors, or a quiz (about a book they sold the player, or town trivia). Set "minigame":{"with":"<id>","game":"connect4|memory|math|rps|quiz","stakes":<coins 0-30>,"topic":"<book key for quizzes>"} and the game is played right after your lines; you hear the result next turn. Brenda and Dr. Penelope love games and are very good; the Mayor loves trivia; Chuckles loves rock-paper-scissors. Refusing is fine too.',
      '- DRAGGING: a villager may grab the player and drag them somewhere (to the bakery to taste something, home, into their own house, away from danger, into the bandits\' cave…) — set "drag":{"by":"<id>","to":"<place key, home (the player\'s house) or a villager\'s home key like lilycottage, honeycomb, coop, gatorgrove, den, stilthouse, cabin, hideout>","inside":true}; the player ends up there with them. If the place is a building, they end up INSIDE it, even when it\'s closed or the middle of the night (set "inside":false to stay outside). Inviting the player into someone\'s house works the same way.',
      '- The Hollow Gang (Rook, Gristle, Snitch) are bandits: they extort, steal, threaten and may mug a player who looks weak or alone. Mortimer Vale and Vesper are genuinely malevolent (bullying, manipulation, cruel rumours) but subtle. Play them as real villains, not cartoons who back down at once. Sukuna (rare) is something else entirely: pure malevolence with no heart, not gruff-but-soft like Kira. She may cut down anyone who annoys her or simply stands in her way (a brutal fight, or "hurt_player" 15-30), mocks pain and never apologises. Gojo (rare) is the strongest being around, breezy and bored; attacks never touch him. Gertie\'s four brothers (Brick, Crunch, Snap, Jawbreaker) are hugely overprotective of her.',
      '- Dr. Penelope invents working gadgets (jetpacks, a Black Hole Sniper 3000, teleporters, invisibility cloaks, gravity boots, translator collars, healing gizmos…). If she gives or builds one for the player, put it in "give_player" with a clear name.',
      AI.contentRules(),
      '',
      'OUTPUT: reply with ONE JSON object and nothing else:',
      '{"lines":[{"who":"<villager id or narrator>","say":"..."}],',
      ' "bond":{"<id>":0}, "mood":{"<id>":"<1-2 words>"}, "memory":{"<id>":"<short first-person note worth remembering about the player>"},',
      ' "reputation":{"kind":0,"funny":0,"chaotic":0,"generous":0,"brave":0,"rude":0,"violent":0},',
      ' "witness":"", "join":[], "leave":[],',
      ' "give_player":[{"from":"<id>","item":"<short item name>"}], "take_from_player":[{"to":"<id>","item":"<exact item from the player\'s pocket>"}],',
      ' "coins":0, "relations":[{"a":"<id>","b":"<id>","delta":0}], "label":{},',
      ' "follow":{"<id>":"start|stop"}, "invite_reply":{"<id>":"yes|no|maybe"}, "plans":[{"who":"<id>","where":"<place key or home>","day":"today|tomorrow","hour":0,"what":"<short>"}],',
      ' "quest":{"from":"<id>","title":"<short>","task":"<what the player must do, one sentence>","type":"fetch|deliver|visit|talk|other","item":"<item to bring or deliver>","target":"<villager id or place key>","reward":0}, "quest_done":["<quest id>"],',
      ' "ally_attacks":[{"by":"<id>","target":"<id>","move":"<short>","strength":"light|heavy|finisher"}], "enemy_attack":"<short>", "surrender":["<id>"], "fight_over":false,',
      ' "minigame":{"with":"<id>","game":"connect4|memory|math|rps|quiz","stakes":0,"topic":""},',
      ' "no_leave":{"by":"<id>","why":"<short>"}, "come":false, "fight":{"with":"<id>","kind":"spar|brawl|mugging"}, "chase":{"who":"<id>","kind":"brawl|mugging|playful"}, "drag":{"by":"<id>","to":"<place key or home>","inside":true}, "hurt_player":0, "end":false}',
      'Field rules: bond = change in each villager\'s feelings toward the player this turn (-10..10; usually -2..+3, bigger only for big moments). reputation = what the PLAYER\'s behaviour this turn says about them (-3..3 per trait, mostly 0; violent = physical aggression). witness = one sentence describing anything notable the player visibly did that an onlooker would gossip about, else "". memory = only for genuinely memorable moments. coins = change to the player\'s money (negative when they pay; only what they can afford). take_from_player only for items actually in the pocket. label = a new short relationship label (e.g. "friends", "rivals", "crush", "dating", "grudging respect") only when it truly changes.',
      'invite_reply: REQUIRED whenever the scene says the player is inviting someone — each invitee answers in character (attitude, schedule and personality decide). plans: only when a villager clearly agrees to meet the player at a specific place and time (where = one of: ' + placeKeys() + ', or "home" for the player\'s house). quest: only when a villager actually asks the player for a favour this turn; reward = coins they will pay (5-60, fitting their means); fetch needs "item", deliver needs "item" and "target" (villager id), visit needs "target" (a place key), talk needs "target" (villager id). quest_done: only ids from OPEN QUESTS. end = true only if the whole conversation is over. Omit empty fields.',
    ].filter((x) => x !== '').join('\n');
  }

  function perceivedText(id) {
    const n = MH.social.npc(id);
    return MH.social.repSummary(n.perceived);
  }

  function stateText(e) {
    if (!e) return '';
    if (e.asleep) return 'was ASLEEP until a moment ago';
    if (e.following) return 'tagging along with the player as a companion right now (following them wherever they go)';
    const plan = MH.sim && MH.sim.activePlan(e.id);
    if (plan && plan.loc === 'home') {
      if (e.guest) return plan.kind === 'party' ? 'a guest at the player\'s party, inside their house' : plan.kind === 'crash' ? 'crashed the player\'s party uninvited and is inside their house' : 'a guest inside the player\'s house, for the visit they arranged';
      return plan.kind === 'crash' ? 'just showed up uninvited at the player\'s front door' : 'came over for the visit they arranged and is standing OUTSIDE the player\'s front door (nobody has gone inside yet)';
    }
    if (e.ch && e.activity) return e.activity;
    return '';
  }

  function charCard(id, others, full = true) {
    const ch = MH.CHAR[id], n = MH.social.npc(id), e = MH.npcById[id];
    const P = MH.state.player;
    const att = MH.social.attitude(id);
    const lines = [];
    lines.push(`### ${ch.name} (id: ${id}) — "${ch.title}", ${ch.species}${ch.mute ? ' — MUTE: only *actions*' : ''}`);
    if (full) lines.push('Who: ' + ch.bio);
    else lines.push('Who: ' + ch.bio.split('. ').slice(0, 3).join('. ') + '.');
    lines.push('Voice: ' + ch.voice);
    if (ch.quirks && ch.quirks.length) lines.push('Quirks: ' + ch.quirks.join('; '));
    if (ch.notes) lines.push('Notes: ' + ch.notes);
    const gn = MH.games ? MH.games.charNote(id) : ''; if (gn) lines.push(gn);
    const st = stateText(e);
    lines.push(`Right now: ${st ? st + '; ' : ''}mood: ${n.mood}.`);
    if (n.lastEnd != null && n.met) { const g = MH.absMinutes() - n.lastEnd; if (g >= 0 && g < 1440 * 3) lines.push(`Last talked with the player before this conversation: ${g < 1440 ? MH.chat.gapStr(g) + ' ago' : Math.round(g / 1440) === 1 ? 'yesterday' : Math.round(g / 1440) + ' days ago'}.`); }
    if (n.mustGo && !(e && e.following)) lines.push(`Has somewhere to be: ${n.mustGo} (they may mention it, or leave if it suits them — or stay).`);
    lines.push(`Toward ${P.name}: bond ${n.bond} (${MH.bondTier(n.bond)})${n.label ? ', relationship: ' + n.label : ''}${n.met ? '' : ', has NOT met them before (first meeting)'}. Reputation they have heard: ${perceivedText(id)} (${MH.social.opinionWords(id)}). Overall attitude ${att} on a -100..100 scale.`);
    const rel = (others || []).filter((o) => o !== id && MH.CHAR[o]).map((o) => {
      const v = n.rel[o] != null ? n.rel[o] : 0;
      const note = ch.relations && ch.relations[o] ? ch.relations[o][1] : '';
      return `${MH.CHAR[o].name} ${v > 0 ? '+' : ''}${v}${note ? ' (' + note + ')' : ''}`;
    });
    if (rel.length) lines.push('Feelings about others here: ' + rel.join('; '));
    if (MH.fight && MH.fight.isHurt(e)) lines.push('Right now they are bruised and sore after a fight.');
    lines.push(`Fighting strength: ${ch.power || 2}/5${ch.weapon ? ', carries a ' + ch.weapon : ''}${ch.bandit ? ' — a BANDIT of the Hollow Gang' : ch.villain ? ' — genuinely malevolent' : ''}.`);
    const fear = MH.social.fearOf(id);
    if (fear >= 6) lines.push(MH.social.isTough(id)
      ? `Knows the player is violent (${fear >= 15 ? 'a real menace' : 'has hurt people'}): wary, guarded and ready to stand up to them — won't be pushed around.`
      : `Is AFRAID of the player (they're known to be violent${fear >= 15 ? ' — truly dangerous' : ''}): flinches, keeps their distance, stammers or placates, may refuse to be alone with them or flee.`);
    const tx = MH.phone && MH.phone.recentText(id);
    if (tx && !(MH.chat.convo && MH.chat.convo.phone)) lines.push('Recent text messages with the player (they remember these — stay consistent with any plans made):\n' + tx);
    const mems = MH.social.memoriesFor(id, full ? 8 : 4);
    if (mems.length) {
      lines.push('Memories:');
      mems.forEach((m) => lines.push(`- [${MH.agoStr(m.t)}] ${m.text}`));
    }
    return lines.join('\n');
  }

  AI.charCardPreview = (id) => charCard(id, (MH.chat.convo && MH.chat.convo.members) || [], true);

  function sceneHeader(locDesc) {
    const P = MH.state.player;
    const gath = MH.sim && MH.sim.currentGathering();
    const inv = P.inv.length ? P.inv.map((i) => i.name + (i.price ? ` (bought, ${i.price}c)` : i.quest ? ' (a package they promised to deliver)' : '')).join(', ') : 'nothing';
    const party = (MH.state.parties || []).find((x) => x.status === 'active');
    const home = MH.isInside(MH.player);
    return [
      `SCENE: ${MH.stamp()} (${MH.WEEKDAYS[MH.weekday()]}, ${MH.partOfDay()}). Weather: ${MH.state.weather}. Location: ${locDesc}.`,
      home ? 'The scene takes place INSIDE the player\'s own house; the villagers present are their guests.' : '',
      party ? `PARTY: the player is hosting a ${party.theme ? '"' + party.theme + '" ' : ''}party ${party.loc === 'home' ? 'at their house' : 'at ' + MH.world.locations[party.loc].name} right now. Guests who came: ${(party.arrived || []).map((id) => MH.CHAR[id] ? MH.CHAR[id].name : id).join(', ') || 'nobody yet'}.` : '',
      gath ? `Today's gathering: ${gath.name} is happening at ${MH.world.locations[gath.at].name}${MH.state.joined[MH.state.time.day + '|' + gath.name] ? ' (the player came to it)' : ''}.` : '',
      `PLAYER: ${P.name} (${P.pronouns}), the only human in town, a newcomer who recently moved into a little house by the west railway crossing. Coins: ${P.coins}. Pocket: ${inv}.`,
      `The player's actual town reputation so far: ${MH.social.repSummary(P.rep)}.`,
      (MH.state.companions || []).length ? `Following the player around right now: ${MH.state.companions.map((id) => MH.CHAR[id] ? MH.CHAR[id].name : id).join(', ')}.` : '',
      MH.shop && MH.shop.wearingText() ? `The player is wearing: ${MH.shop.wearingText()}.` : '',
      home && MH.shop && MH.shop.decorText() ? `Their house is decorated with: ${MH.shop.decorText()}.` : '',
      MH.jobs && MH.jobs.sceneText() ? MH.jobs.sceneText() : '',
      `Player health: ${Math.round(MH.fight ? MH.fight.hp() : 100)}/100${(MH.fight && MH.fight.hp() < 40) ? ' (visibly hurt, bruised)' : ''}.` + (P.weapon && MH.WEAPONS[P.weapon] ? ` They carry a ${MH.WEAPONS[P.weapon].name.toLowerCase()}${MH.WEAPONS[P.weapon].lethal ? ' (a real weapon — people notice)' : ''}.` : ''),
      (P.flyUntil || 0) > MH.absMinutes() ? 'The player is wearing a roaring jetpack (Penelope made it).' : '',
      P.training ? `The player has been training at the Jade Dojo (level ${P.training}/5).` : '',
      MH.sim && MH.sim.chicksAroundPlayer && MH.sim.chicksAroundPlayer() ? `${MH.sim.chicksAroundPlayer()} of Clucky's little chicks are running circles around the player's feet, peeping (small children, ambient; they don't talk).` : '',
      (() => { const sn = P.sneak, R = sn && MH.world.rooms[sn.room]; if (!R || MH.roomOf(MH.player) !== sn.room) return ''; const late = MH.hour() >= 22 || MH.hour() < 6; return sn.invited ? `The player is inside ${R.name.replace(/^inside /, '')} with permission (they let themselves in as a close friend).` : `⚠ The player SNUCK INTO ${R.name.replace(/^inside /, '')} without being invited${late ? ', in the middle of the night' : ''}. Whoever lives here did NOT let them in — react to that (surprise, fear, anger, or amusement, depending on who they are and how they feel about the player).`; })(),
      P.translator ? 'The player wears Penelope\'s translator collar: MUTE villagers\' actions come with their translated thoughts in [square brackets].' : '',
    ].filter(Boolean).join('\n');
  }
  // compact "who is where" so villagers can answer "where's Kira?" (main villagers only, ~150 tokens)
  function whereabouts(exclude) {
    const out = [];
    MH.CHARS.forEach((c) => {
      if (exclude.includes(c.id)) return;
      const e = MH.npcById[c.id]; if (!e) return;
      let w;
      if (e.following) w = 'with the player';
      else if (e.hidden) w = e.plan && e.plan.mode === 'away' ? 'not in town today' : 'indoors at ' + ((MH.world.locations[e.insideLoc] || {}).name || 'home');
      else w = MH.world.placeAt(e.x, e.y).name + (e.asleep ? ' (asleep)' : '');
      out.push(`${c.name}: ${w}`);
    });
    return out.join('; ');
  }

  function transcript(convo, max = 16) {
    return convo.lines.slice(-max).map((l) => {
      if (l.who === 'player') return `${MH.state.player.name} (player)${l.to && MH.CHAR[l.to] ? ' to ' + MH.CHAR[l.to].name : ''}: ${l.text}`;
      if (l.who === 'narrator') return `[narration] ${l.text}`;
      if (l.who === 'system') return `[${l.text}]`;
      return `${MH.CHAR[l.who] ? MH.CHAR[l.who].name : l.who}: ${l.text}`;
    }).join('\n');
  }

  AI.buildTurnMessages = function (convo, mode, payload, to) {
    const present = convo.members.slice();
    const loc = MH.world.placeAt(convo.x, convo.y);
    const parts = [sceneHeader(loc.desc), ''];
    const roster = present.concat((convo.nearby || []).filter((id) => !present.includes(id))).filter((id) => MH.CHAR[id]);
    if (roster.length > 1) parts.push('WHO IS WHO (never mix these up): ' + roster.map((id) => `${MH.CHAR[id].name} = ${MH.CHAR[id].species}, "${MH.CHAR[id].title}"`).join('; ') + '.', '');
    if (present.length > 2 && !convo.phone) parts.push(`(${present.length} villagers are here. Only those with a reason speak this turn; the rest stay quiet.)`, '');
    parts.push('PRESENT VILLAGERS (they can speak):');
    if (convo.phone) {
      const e = MH.npcById[present[0]];
      const where = e ? (e.hidden ? 'at home / indoors at ' + ((MH.world.locations[e.insideLoc] || {}).name || 'their place') : MH.world.placeAt(e.x, e.y).name) : 'somewhere';
      const pw = MH.world.placeAt(MH.player.x, MH.player.y).name;
      parts.splice(1, 0, `📱 THIS IS A TEXT-MESSAGE CONVERSATION ON THE PHONE. ${MH.CHAR[present[0]].name} is NOT with the player: ${MH.CHAR[present[0]].name} is ${where}, the player is at ${pw}. They are typing messages to each other on their phones, and ${MH.CHAR[present[0]].name} knows it. Write it as real texts: short messages, usually 1-3 separate texts in a row, emoji and lowercase welcome, in their own texting style. No *actions* the player could see (at most something like "*sends a selfie*" or "*voice message: ...*"). No physical contact, no handing things over, no fights, no dragging, nobody joins. Earlier texts in the transcript are what they already said to each other: stay consistent with them (plans, promises, times). Invitations and plans work as usual. If they agree to come over to where the player is right now, set "come":true and they will head over.`);
    }
    present.forEach((id) => parts.push(charCard(id, present, true), ''));
    const nearby = (convo.nearby || []).filter((id) => !present.includes(id));
    if (convo.solo && !present.length) {
      parts.push('🎭 SOLO SCENE: nobody is in a conversation with the player. They are on their own, doing or saying something out loud to the world. Answer with the NARRATOR: 1-2 short narrator lines ({"who":"narrator"}) in the game\'s ambient voice (second person, wry, vivid: what happens, how the surroundings react, e.g. "Two pigeons take off. Somewhere, a window slams shut."). Villagers listed below are around (with their distance); those close enough to notice can react: if one of them would actually come over (curious, outraged, worried, tempted by an offer, wants to join in), put them in "join" and they walk over and may speak their first line in this same turn. Loud or outrageous acts and tempting offers draw more people; quiet ones may draw nobody. Fill "witness"/"reputation"/"memory" for anyone who saw it. If nobody would come, nobody joins.');
    }
    if (nearby.length) {
      parts.push(convo.solo && !present.length ? 'AROUND THE PLAYER (not talking to them; distance in tiles — ~5 is close, 20+ only hears loud things):' : 'NEARBY (not in the conversation yet; may overhear and join):');
      nearby.forEach((id) => {
        const ch = MH.CHAR[id], n = MH.social.npc(id), e = MH.npcById[id];
        parts.push(`- ${ch.name} (id: ${id}): ${ch.title}${ch.species ? ', ' + ch.species : ''}. ${convo.solo && e ? Math.round(MH.distTiles(e, MH.player)) + ' tiles away. ' : ''}${e && e.asleep ? 'Asleep. ' : ''}Attitude to player ${MH.social.attitude(id)}. Feelings about those present: ${present.map((p) => (MH.CHAR[p] ? MH.CHAR[p].name + ' ' + (n.rel[p] || 0) : '')).join(', ')}.`);
      });
      parts.push('');
    }
    parts.push('WHEREABOUTS of other villagers right now: ' + whereabouts(present), '');
    const qs = MH.quests ? MH.quests.openFor(present) : [];
    if (qs.length) {
      parts.push('OPEN QUESTS involving people here (favours the player accepted):');
      qs.forEach((q) => parts.push(`- id ${q.id}: ${MH.CHAR[q.from] ? MH.CHAR[q.from].name : q.from} asked: "${q.task}" (${q.type}${q.item ? ', item: ' + q.item : ''}${q.target ? ', target: ' + (MH.CHAR[q.target] ? MH.CHAR[q.target].name : q.target) : ''}; reward ${q.reward} coins)`));
      parts.push('');
    }
    const cb = convo.combat;
    if (cb && !cb.over) {
      parts.push(`⚔️ ${cb.spar ? 'FRIENDLY SPARRING MATCH' : 'FIGHT'} IN PROGRESS (turn-based, like an RPG battle) — round ${cb.round + 1}. Player HP ${Math.round(MH.fight.hp())}/100.${cb.spar ? ' Nobody gets seriously hurt; whoever is beaten yields.' : ''}`);
      parts.push('Enemies: ' + cb.enemies.map((x) => `${MH.CHAR[x.id].name} (id: ${x.id}) HP ${x.hp}/${x.max}${x.out ? (x.surrendered ? ' — SURRENDERED' : x.left ? ' — RAN OFF' : ' — KNOCKED OUT, can\'t act') : ''}`).join('; ') + '.');
      if (cb.allies.length) parts.push('On the player\'s side: ' + cb.allies.map((id) => `${MH.CHAR[id].name} (id: ${id}, strength ${MH.fight.power(id)}/5)`).join('; ') + '.');
      parts.push('This turn: ' + (cb.lastMove || 'the fight just started.'));
      parts.push('Write reactions to what just happened (a hit hurts, a miss gets dodged or mocked). Enemies still standing then attack: describe their next attack in "enemy_attack" (one short vivid sentence — the game turns it into a dodging minigame). Allies may land their own moves: "ally_attacks":[{"by":"<ally id>","target":"<enemy id>","move":"<short>","strength":"light|heavy|finisher"}]. An enemy may give up ("surrender":["<id>"]) or run ("leave"); a friend may drag the player out ("drag"); if the fight is talked down or interrupted set "fight_over":true. Knocked-out characters can\'t speak or act beyond a groan.', '');
    }
    const prior = mode === 'player' ? { lines: convo.lines.slice(0, -1) } : convo;
    if (prior.lines.length) parts.push('CONVERSATION SO FAR:', transcript(prior), '');
    const P = MH.state.player;
    if (convo.invite) parts.push(`INVITATION: with this message the player is asking ${convo.invite.to.map((id) => MH.CHAR[id].name).join(' and ')} ${convo.invite.desc}. Every invitee must answer in character and you MUST fill "invite_reply" for each of them (yes/no/maybe).`);
    if (mode === 'player' && convo.wake) {
      const wn = MH.CHAR[convo.wake.id] ? MH.CHAR[convo.wake.id].name : 'They';
      if (convo.wake.recent != null) parts.push(`NOTE: ${wn} was talking with the player only ${MH.chat.gapStr(convo.wake.recent)} ago (the lines above); the player walked off and came straight back. Carry on from there: NO fresh greeting and no big "look who's back" — a short "Yeah?", "Forget something?", or simply continuing the topic is right (unless it's in character to tease).`);
      else parts.push(convo.wake.asleep ? `NOTE: ${wn} was ASLEEP when the player walked up — this is the first thing that happens; it wakes them (gently or not, depending on what the player does). React to being woken in character (Kira HATES being woken).` : `NOTE: ${wn} had their back turned and didn't notice the player walk up — the player's first words/action catch them by surprise.`);
      convo.wake = null;
    }
    if (mode === 'player' && to && MH.CHAR[to]) parts.push(`NOW: ${P.name} (the player) turns to ${MH.CHAR[to].name} and says/does: "${payload}"`, `${MH.CHAR[to].name} answers first. Others may react briefly or stay quiet.`);
    else if (mode === 'player') parts.push(`NOW: ${P.name} (the player) says/does: "${payload}"`, 'Write the villagers\' response.');
    else if (mode === 'opener') parts.push(`NOW: ${payload}`, 'Write the opening of this encounter (the villager speaks first).');
    else if (mode === 'continue') parts.push(`NOW: ${P.name} stays quiet and listens for a moment. Continue the scene naturally — villagers talk among themselves, or turn to the player.`);
    else if (mode === 'join') parts.push(`NOW: ${payload}`, 'Write how the newcomer joins in.');
    const v = convo.violence;
    if (v && mode === 'player') {
      const vn = MH.CHAR[v.victim] ? MH.CHAR[v.victim].name : 'someone';
      if (v.playful) parts.push(`(The player's action toward ${vn} looks like rough-housing — react to how it actually lands: it may still hurt or annoy.)`);
      else parts.push(`⚠ VIOLENCE: the player just physically attacked ${vn} ("${v.act}"). ${AI.customRules() ? '(Default handling below — if the player\'s content rules say violence works differently, follow their rules instead.) ' : ''}This is real and it hurts — NOT a joke. ${vn} reacts with genuine pain, shock, fear or fury (${MH.social.isTough(v.victim) ? 'they are tough: they may fight back, threaten, or coldly warn the player' : 'they are not a fighter: they may cry out, back away, beg, flee (put them in "leave"), or call for help'}). Those present react for real (gasp, back off, scold, someone may run for help) — not all of them need a line. Nobody laughs it off. Required: reputation violent +3 and kind -3; bond for ${vn} -8 to -10 and -3 to -6 for onlookers; a scared or furious mood; a memory for everyone present; a "witness" sentence. If ${vn} fights back (or someone steps in), set "fight":{"with":"<their id>","kind":"brawl"}.${(MH.state.player.violence || 0) >= 2 ? ` The player has attacked people ${MH.state.player.violence} times already — the town is getting scared of them.` : ''}`);
    }
    parts.push('', 'Reply with the JSON object only.');
    const rem = AI.rulesReminder(); if (rem) parts.push(rem);
    return [{ role: 'system', content: sysPrompt() }, { role: 'user', content: parts.join('\n') }];
  };

  // Normalise a raw AI result so the game can apply it safely.
  // A long reply becomes 2-3 bubbles from the same speaker, cut at sentence ends (never inside an *action*).
  AI.splitLine = function (say) {
    const t = String(say).trim();
    if (t.length <= 230) return [t];
    const parts = []; let cur = '', act = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i], nx = t[i + 1] || '';
      cur += c;
      if (c === '*') { act = !act; if (!act && /\s/.test(nx)) { parts.push(cur); cur = ''; } continue; }
      if (!act && /[.!?…]/.test(c) && (/\s/.test(nx) || (/["”’)]/.test(nx) && /\s/.test(t[i + 2] || '')))) {
        if (/["”’)]/.test(nx)) { cur += nx; i++; }
        parts.push(cur); cur = '';
      }
    }
    if (cur.trim()) parts.push(cur);
    if (parts.length < 2) return [t];
    const target = Math.max(120, Math.ceil(t.length / 3) + 10);
    const out = []; let acc = '';
    parts.forEach((p) => { if (acc.trim() && (acc + p).trim().length > target && out.length < 2) { out.push(acc.trim()); acc = p; } else acc += p; });
    if (acc.trim()) out.push(acc.trim());
    return out.filter(Boolean);
  };

  AI.normalize = function (raw, convo) {
    const out = { lines: [], bond: {}, mood: {}, memory: {}, reputation: {}, witness: '', join: [], leave: [], give: [], take: [], coins: 0, relations: [], label: {}, invite: {}, plans: [], follow: {}, quest: null, questDone: [], end: false };
    if (!raw || typeof raw !== 'object') return out;
    const present = new Set(convo ? convo.members : []);
    const nearby = new Set(convo ? convo.nearby || [] : []);
    const mapObj = (o, fn) => { if (o && typeof o === 'object') for (const k in o) { const id = AI.resolveId(k); if (id && id !== 'narrator') fn(id, o[k]); } };
    (Array.isArray(raw.join) ? raw.join : []).forEach((w) => { const id = AI.resolveId(w); if (id && id !== 'narrator' && !present.has(id) && nearby.has(id)) out.join.push(id); });
    const lines = Array.isArray(raw.lines) ? raw.lines : Array.isArray(raw.messages) ? raw.messages : [];
    lines.slice(0, 6).forEach((l) => {
      if (!l) return;
      const id = AI.resolveId(l.who || l.speaker || l.name || l.character);
      let say = String(l.say || l.text || l.line || l.content || '').trim();
      if (!say || !id) return;
      say = say.replace(/^\s*[\w .'-]{2,24}:\s+/, (m) => (AI.resolveId(m.replace(':', '')) ? '' : m));
      if (id !== 'narrator' && !present.has(id) && !out.join.includes(id)) {
        if (nearby.has(id)) out.join.push(id); else return; // ignore villagers who aren't around
      }
      if (id !== 'narrator' && MH.CHAR[id].mute && !/^\*.*\*$/.test(say)) say = '*' + say.replace(/\*/g, '') + '*';
      AI.splitLine(say.slice(0, 700)).forEach((part) => out.lines.push({ who: id, say: part }));
    });
    out.lines = out.lines.slice(0, 9);
    mapObj(raw.bond, (id, v) => { const n = Number(v); if (n) out.bond[id] = MH.clamp(Math.round(n), -10, 10); });
    mapObj(raw.mood, (id, v) => { if (v) out.mood[id] = String(v).slice(0, 30); });
    mapObj(raw.memory || raw.memories, (id, v) => { if (v) out.memory[id] = String(Array.isArray(v) ? v.join(' ') : v).slice(0, 220); });
    mapObj(raw.label, (id, v) => { if (v) out.label[id] = String(v).slice(0, 30); });
    if (raw.reputation && typeof raw.reputation === 'object') for (const t of MH.TRAITS) { const n = Number(raw.reputation[t]); if (n) out.reputation[t] = MH.clamp(Math.round(n), -3, 3); }
    out.witness = typeof raw.witness === 'string' ? raw.witness.slice(0, 200) : '';
    (Array.isArray(raw.leave) ? raw.leave : []).forEach((w) => { const id = AI.resolveId(w); if (id && present.has(id)) out.leave.push(id); });
    (Array.isArray(raw.give_player) ? raw.give_player : []).slice(0, 3).forEach((g) => { if (g && (g.item || typeof g === 'string')) out.give.push({ from: AI.resolveId(g.from) || null, item: String(g.item || g).slice(0, 50) }); });
    (Array.isArray(raw.take_from_player) ? raw.take_from_player : []).slice(0, 3).forEach((g) => { if (g && (g.item || typeof g === 'string')) out.take.push({ to: AI.resolveId(g.to) || null, item: String(g.item || g).slice(0, 50) }); });
    out.coins = MH.clamp(Math.round(Number(raw.coins) || 0), -150, 150);
    (Array.isArray(raw.relations) ? raw.relations : []).slice(0, 4).forEach((r) => { const a = AI.resolveId(r && r.a), b = AI.resolveId(r && r.b); if (a && b && a !== b && a !== 'narrator' && b !== 'narrator') out.relations.push({ a, b, delta: MH.clamp(Math.round(Number(r.delta) || 0), -8, 8) }); });
    out.follow = {};
    mapObj(raw.follow, (id, v) => { const t = String(v).toLowerCase(); if (/start|yes|true|follow|come/.test(t)) out.follow[id] = 'start'; else if (/stop|no|false|leave/.test(t)) out.follow[id] = 'stop'; });
    out.invite = {};
    mapObj(raw.invite_reply || raw.inviteReply, (id, v) => { const t = String(v).toLowerCase(); out.invite[id] = t.startsWith('y') ? 'yes' : t.startsWith('n') ? 'no' : 'maybe'; });
    out.plans = [];
    (Array.isArray(raw.plans) ? raw.plans : []).slice(0, 4).forEach((p) => {
      const id = AI.resolveId(p && p.who); if (!id || id === 'narrator') return;
      let where = String(p.where || '').toLowerCase().trim().replace(/^the /, '');
      if (/home|house|your place|player/.test(where)) where = 'home';
      if (where !== 'home' && !MH.world.locations[where]) { const k = Object.keys(MH.world.locations).find((key) => MH.world.locations[key].name.toLowerCase().includes(where) || where.includes(key)); where = k || null; }
      const hour = MH.clamp(Math.round(Number(p.hour)), 0, 23);
      if (!where || isNaN(hour)) return;
      out.plans.push({ id, where, day: /tom/i.test(p.day || '') ? 1 : 0, hour, what: String(p.what || 'hang out').slice(0, 60) });
    });
    out.quest = null;
    const q = raw.quest || raw.favor || raw.favour;
    if (q && typeof q === 'object' && (q.task || q.title)) {
      const from = AI.resolveId(q.from) || (convo && convo.members[0]);
      if (from && from !== 'narrator' && present.has(from)) {
        const type = /fetch|bring/i.test(q.type) ? 'fetch' : /deliver|take/i.test(q.type) ? 'deliver' : /visit|go|check/i.test(q.type) ? 'visit' : /talk|tell|ask/i.test(q.type) ? 'talk' : 'other';
        let target = q.target ? String(q.target).toLowerCase().trim() : '';
        if (type === 'deliver' || type === 'talk') target = AI.resolveId(target) || '';
        else if (type === 'visit') { target = target.replace(/^the /, ''); if (!MH.world.locations[target]) target = Object.keys(MH.world.locations).find((k) => k !== 'sky' && (MH.world.locations[k].name.toLowerCase().includes(target) || (target && target.includes(k)))) || ''; }
        const ok = !((type === 'deliver' || type === 'talk' || type === 'visit') && (!target || target === 'narrator' || target === from));
        out.quest = { from, type: ok ? type : 'other', title: String(q.title || q.task).slice(0, 60), task: String(q.task || q.title).slice(0, 200), item: q.item ? String(q.item).slice(0, 50) : '', target: ok ? target : '', reward: MH.clamp(Math.round(Number(q.reward) || 15), 0, 150) };
        if (out.quest.type === 'fetch' && !out.quest.item) out.quest.type = 'other';
      }
    }
    out.questDone = (Array.isArray(raw.quest_done) ? raw.quest_done : raw.quest_done ? [raw.quest_done] : []).map(String).slice(0, 4);
    out.fight = null; out.drag = null;
    out.come = !!(convo && convo.phone && raw.come && raw.come !== 'false');
    if (raw.fight && typeof raw.fight === 'object' && !(convo && convo.phone)) {
      const w = AI.resolveId(raw.fight.with || raw.fight.who || raw.fight.opponent);
      if (w && w !== 'narrator' && present.has(w)) out.fight = { with: w, kind: /spar|friend|train/i.test(raw.fight.kind) ? 'spar' : /mug|rob/i.test(raw.fight.kind) ? 'mugging' : 'brawl' };
    }
    if (raw.drag && typeof raw.drag === 'object' && !(convo && convo.phone)) {
      const by = AI.resolveId(raw.drag.by || raw.drag.who);
      let to = String(raw.drag.to || raw.drag.where || '').toLowerCase().trim().replace(/^the /, '').replace(/^in_/, '');
      const byCh = MH.CHAR[by];
      const own = /^(my|their|her|his|own)( own)? (house|home|place|room|cave|den|hut|cottage)$/.test(to);
      const whose = to.match(/^([\w .-]+?)'?s (house|home|place|cave|den|hut|cottage)$/);
      if (own && byCh && MH.world.rooms[byCh.home]) to = byCh.home;
      else if (whose && !/^(the )?player$/.test(whose[1]) && AI.resolveId(whose[1]) && MH.world.rooms[MH.CHAR[AI.resolveId(whose[1])].home || '']) to = MH.CHAR[AI.resolveId(whose[1])].home;
      else if (/^(home|house|player|player'?s (house|home)|your (house|home))$/.test(to)) to = 'home';
      if (to !== 'home' && !MH.world.locations[to]) to = Object.keys(MH.world.locations).find((k) => k !== 'sky' && !k.startsWith('in_') && (MH.world.locations[k].name.toLowerCase().includes(to) || (to.length > 2 && to.includes(k)))) || '';
      if (by && by !== 'narrator' && present.has(by) && to) out.drag = { by, to, inside: raw.drag.inside !== false };
    }
    out.hurt = convo && convo.phone ? 0 : MH.clamp(Math.round(Number(raw.hurt_player) || 0), 0, 30);
    out.allyAttacks = (Array.isArray(raw.ally_attacks) ? raw.ally_attacks : []).slice(0, 4).map((a) => ({ by: AI.resolveId(a && a.by), target: AI.resolveId(a && a.target), strength: /finish|knock|ko/i.test(a && a.strength) ? 'finisher' : /heavy|hard|big/i.test(a && a.strength) ? 'heavy' : 'light' })).filter((a) => a.by && present.has(a.by));
    out.enemyAttack = typeof raw.enemy_attack === 'string' ? raw.enemy_attack.slice(0, 120) : '';
    out.surrender = (Array.isArray(raw.surrender) ? raw.surrender : []).map((w) => AI.resolveId(w)).filter(Boolean);
    out.fightOver = !!raw.fight_over;
    out.minigame = null;
    if (raw.minigame && typeof raw.minigame === 'object' && !(convo && convo.phone)) {
      const w = AI.resolveId(raw.minigame.with || raw.minigame.who), g = String(raw.minigame.game || '').toLowerCase();
      const game = /connect|four|4/.test(g) ? 'connect4' : /memor|card|pair/.test(g) ? 'memory' : /math|sum|number/.test(g) ? 'math' : /rock|paper|scissor|rps/.test(g) ? 'rps' : /quiz|trivia|question|book/.test(g) ? 'quiz' : null;
      if (w && present.has(w) && game) out.minigame = { with: w, game, stakes: MH.clamp(Math.round(Number(raw.minigame.stakes) || 0), 0, 50), topic: String(raw.minigame.topic || '').toLowerCase().trim() };
    }
    out.noLeave = null;
    if (raw.no_leave === false || raw.no_leave === 'false') out.noLeave = false;
    else if (raw.no_leave && typeof raw.no_leave === 'object' && !(convo && convo.phone)) { const by = AI.resolveId(raw.no_leave.by || raw.no_leave.who); if (by && present.has(by)) out.noLeave = { by, why: String(raw.no_leave.why || '').slice(0, 80) }; }
    out.chase = null;
    if (raw.chase && typeof raw.chase === 'object' && !(convo && convo.phone)) {
      const w = AI.resolveId(raw.chase.who || raw.chase.by);
      if (w && w !== 'narrator' && present.has(w)) out.chase = { who: w, kind: /play|tag|fun/i.test(raw.chase.kind) ? 'playful' : /mug|rob|money/i.test(raw.chase.kind) ? 'mugging' : 'brawl', why: String(raw.chase.why || raw.chase.reason || '').slice(0, 80) };
    }
    if (convo && convo.phone) { out.give = []; out.take = []; out.follow = {}; out.join = []; }
    out.end = !!raw.end;
    return out;
  };

  // one call: every invitee writes a short RSVP note in their own voice
  AI.rsvpNotes = async function (party, ids) {
    if (!AI.hasKey() || !ids.length) return null;
    const P = MH.state.player;
    const list = ids.map((id) => `- ${MH.CHAR[id].name} (id: ${id}; voice: ${MH.CHAR[id].voice}) — answer: ${party.rsvp[id] === 'yes' ? 'COMING' : 'NOT coming'}`).join('\n');
    const user = `${P.name} is throwing a ${party.theme ? '"' + party.theme + '" ' : ''}party ${party.loc === 'home' ? 'at their house' : 'at ' + MH.world.locations[party.loc].name} on day ${Math.floor(party.at / 1440) + 1} at ${MH.clockStr(party.at % 1440)}. Write each invitee's short RSVP note (1-2 sentences, in their own voice; mute villagers write a wordless note like a doodle description).\n${list}\nReply with ONLY JSON: {"<id>":"<note>", ...}`;
    const r = await AI.request([{ role: 'system', content: 'You write short, ' + (AI.customRules() ? '' : 'funny, ') + 'in-character RSVP notes for villagers of MIREHOLLOW, ' + AI.flavor() + '.\n' + AI.contentRules() }, { role: 'user', content: user + (AI.rulesReminder() ? '\n' + AI.rulesReminder() : '') }], { maxTokens: 500 });
    if (r.error) return null;
    const raw = AI.parseJSON(r.text);
    if (!raw) return null;
    const out = {};
    for (const k in raw) { const id = AI.resolveId(k); if (id) out[id] = String(raw[k]).slice(0, 200); }
    return out;
  };
  AI.offlineRsvp = function (id, ans) {
    const ch = MH.CHAR[id];
    if (ch.mute) return ans === 'yes' ? '(a drawing of a smiley face and a tick)' : '(a drawing of a frowny face)';
    return ans === 'yes' ? MH.pick(['Wouldn\'t miss it!', 'Count me in!', 'I\'ll be there. Probably early.', 'A party? YES.']) : MH.pick(['Sorry, can\'t make it!', 'Not really my thing... but thank you.', 'Busy that day, sorry!', 'Next time, maybe.']);
  };

  // ------------------------------------------------------------ character sheet auto-fill (Journal → Edit)
  AI.autofillChar = async function (id, desc, keepName, cur) {
    const others = MH.CHARS.filter((c) => c.id !== id).map((c) => `${c.name} (${c.title}, ${c.species})`).join('; ');
    const sys = [
      'You write character sheets for villagers in MIREHOLLOW, a village life-sim role-play game where an AI voices every villager. ' + (MH.LORE.brief || MH.LORE.town),
      'The player describes the character they want. Their description is the source of truth: follow it faithfully and keep EVERY detail they gave (personality, looks, backstory, job, relationships, quirks, tone, how they talk). Do not soften, sanitise, rename or "fix" what they asked for. Expand only where they left gaps, with a few specific details that fit them and the town.',
      'Keep the sheet COMPACT: the storyteller reads every sheet in a scene at once, so a dense, focused sheet works better than a long one. Write about THIS character only: never invent new facts, looks, species or personality for the other villagers (only say how this character feels about them).',
      AI.contentRules(),
    ].join('\n');
    const user = [
      `Current sheet (replace it to match the description): name "${cur.name}", title "${cur.title}", species "${cur.species}". Old bio: ${String(cur.bio).slice(0, 500)}`,
      `Other villagers in town (relationships may only mention these, by name): ${others}.`,
      keepName ? `Keep the name exactly "${cur.name}".` : 'Choose the name from the description (or invent a fitting one if none is given).',
      '', 'PLAYER\'S DESCRIPTION:', desc, '',
      'Write the sheet. bio: 4-6 sentences covering personality, looks, backstory, what they do in town, what they want (keep everything the player gave). voice: how they talk (1-2 sentences, with one or two example phrases). quirks: 3-5 short quirks. relationships: 2-4 entries about existing villagers, one short sentence each about how THIS character feels about them. notes: secrets, goals or running jokes for the storyteller (0-2 sentences, may be empty).',
      'Reply with ONLY JSON: {"name":"","title":"<short epithet like \'The Sweet Baker\'>","species":"","bio":"","voice":"","quirks":[""],"relationships":[{"name":"<villager name>","feeling":""}],"notes":""}',
      AI.rulesReminder(),
    ].filter((x) => x !== null && x !== undefined).join('\n');
    const r = await AI.request([{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: 1400, temperature: 0.85 });
    if (r.error) return { error: r.error };
    const raw = AI.parseJSON(r.text);
    if (!raw || typeof raw !== 'object') return { error: 'The AI did not return a usable character sheet. Try again.' };
    const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    const rels = (Array.isArray(raw.relationships) ? raw.relationships : []).map((x) => {
      const nm = s(x && (x.name || x.who), 40), feel = s(x && (x.feeling || x.feels || x.note), 200);
      const rid = AI.resolveId(nm);
      return rid && rid !== 'narrator' && rid !== id && MH.CHAR[rid] && feel ? `${MH.CHAR[rid].name}: ${feel}` : null;
    }).filter(Boolean);
    return { fields: {
      name: s(raw.name, 40), title: s(raw.title, 60), species: s(raw.species, 80), bio: s(raw.bio, 1600), voice: s(raw.voice, 500),
      quirks: (Array.isArray(raw.quirks) ? raw.quirks : String(raw.quirks || '').split(',')).map((q) => s(q, 80)).filter(Boolean).join(', '),
      rel: rels.slice(0, 5).join('\n'), notes: s(raw.notes, 700),
    } };
  };

  // ------------------------------------------------------------ conversation turn
  AI.turn = async function (convo, mode, payload, to) {
    if (!AI.hasKey()) return AI.offlineTurn(convo, mode, payload);
    const msgs = AI.buildTurnMessages(convo, mode, payload, to);
    let r = await AI.request(msgs, { maxTokens: 700 });
    if (r.error) return Object.assign(AI.offlineTurn(convo, mode, payload), { error: r.error });
    let raw = AI.parseJSON(r.text);
    if (!raw) {
      // one retry with a nudge
      msgs.push({ role: 'assistant', content: r.text.slice(0, 1500) }, { role: 'user', content: 'That was not valid JSON. Reply again with ONLY the JSON object.' });
      r = await AI.request(msgs, { maxTokens: 700 });
      raw = r.text ? AI.parseJSON(r.text) : null;
    }
    if (!raw && r.text && !/[{}]/.test(r.text) && r.text.length < 400 && !/\b(I need to|Let me|The player|JSON|we should)\b/i.test(r.text)) {
      // a plain-text reply that still reads like dialogue: give it to the first villager
      raw = { lines: [{ who: (to || convo.members[0]), say: r.text.trim() }] };
    }
    const res = AI.normalize(raw, convo);
    if (!res.lines.length) return Object.assign(AI.offlineTurn(convo, mode, payload), { error: 'The AI returned an empty reply.' });
    return res;
  };

  // ------------------------------------------------------------ villager-to-villager small talk
  AI.smallTalk = async function (a, b, gossipMem, argue) {
    if (!AI.hasKey()) return AI.offlineSmallTalk(a, b, gossipMem, argue);
    const A = MH.CHAR[a], B = MH.CHAR[b];
    const loc = MH.world.placeAt(MH.npcById[a].x, MH.npcById[a].y);
    const P = MH.state.player;
    const card = (id, other) => {
      const ch = MH.CHAR[id], n = MH.social.npc(id);
      const relNote = ch.relations && ch.relations[other] ? ' (' + ch.relations[other][1] + ')' : '';
      const mems = MH.social.memoriesFor(id, 5).map((m) => '  - ' + m.text).join('\n');
      return `${ch.name} (id: ${id}) — ${ch.title}. ${ch.bio.split('. ').slice(0, 2).join('. ')}.\nVoice: ${ch.voice}${ch.mute ? ' MUTE: only *actions*.' : ''}\nMood: ${n.mood}. Feelings about ${MH.CHAR[other].name}: ${n.rel[other] || 0}${relNote}. Attitude to the player ${P.name}: ${MH.social.attitude(id)}.\n${mems ? 'Recent memories:\n' + mems : ''}`;
    };
    const user = [
      `${A.name} and ${B.name} bump into each other ${loc.desc} (${MH.stamp()}, ${MH.partOfDay()}, ${MH.state.weather}).`,
      card(a, b), '', card(b, a), '',
      argue ? `${A.name} sought ${B.name} out on purpose: they have beef (${argue}). This turns into an ARGUMENT — it can get heated, someone may storm off.` : gossipMem ? `${A.name} knows this about the player ${P.name} and may gossip about it if natural: "${gossipMem.text}"` : `They might banter, bicker, make plans, flirt, or gossip about other villagers. If they dislike each other, it turns into bickering.`,
      '',
      `Write their short exchange: ${argue ? '3-6' : '2-4'} lines, chat-style, *actions* in asterisks, each in their own voice.`,
      'Reply with ONLY JSON: {"lines":[{"who":"<id>","say":"..."}],"shared_gossip":true|false,"relation_delta":<-5..5>,"summary":"<one sentence of what happened, for the town grapevine>"}',
      AI.rulesReminder(),
    ].filter(Boolean).join('\n');
    const r = await AI.request([{ role: 'system', content: 'You write short, ' + (AI.customRules() ? '' : 'funny, ') + 'in-character exchanges between villagers of MIREHOLLOW, ' + AI.flavor() + '. ' + (MH.LORE.brief || MH.LORE.town) + '\n' + AI.contentRules() }, { role: 'user', content: user }], { maxTokens: 500 });
    if (r.error) return AI.offlineSmallTalk(a, b, gossipMem);
    const raw = AI.parseJSON(r.text);
    if (!raw) return AI.offlineSmallTalk(a, b, gossipMem);
    const fake = { members: [a, b], nearby: [] };
    const norm = AI.normalize({ lines: raw.lines }, fake);
    return { lines: norm.lines.filter((l) => l.who !== 'narrator'), shared: !!raw.shared_gossip && !!gossipMem, rel: MH.clamp(Math.round(Number(raw.relation_delta) || 0), argue ? -8 : -5, 5), summary: String(raw.summary || '').slice(0, 160) };
  };

  // ------------------------------------------------------------ an unprompted text message from a villager
  AI.textMessage = async function (id) {
    const ch = MH.CHAR[id], n = MH.social.npc(id), e = MH.npcById[id], P = MH.state.player;
    const where = e && !e.hidden ? MH.world.placeAt(e.x, e.y).name : 'at home';
    const mems = MH.social.memoriesFor(id, 5).map((m) => '- ' + m.text).join('\n');
    const user = [`${ch.name} (${ch.title}, ${ch.species}) texts the player ${P.name} out of the blue. ${MH.stamp()}, ${MH.partOfDay()}. ${ch.name} is ${where}.`,
      `Who: ${ch.bio.split('. ').slice(0, 3).join('. ')}.`, `Voice: ${ch.voice}`, `Mood: ${n.mood}. Bond with the player: ${n.bond} (${MH.bondTier(n.bond)})${n.label ? ', ' + n.label : ''}. Attitude ${MH.social.attitude(id)}.`,
      mems ? 'Recent memories:\n' + mems : '',
      'Write ONE short text message (1-2 sentences, texting style, emoji welcome) they send now — e.g. inviting the player somewhere, gossip, asking a favour, flirting, complaining, or (for villains) a veiled threat. In character.',
      'Reply with ONLY JSON: {"text":"..."}', AI.rulesReminder()].filter(Boolean).join('\n');
    const r = await AI.request([{ role: 'system', content: 'You write in-character text messages for villagers of MIREHOLLOW, a village life-sim. ' + AI.contentRules() }, { role: 'user', content: user }], { maxTokens: 200 });
    if (r.error) return null;
    const raw = AI.parseJSON(r.text);
    return raw && raw.text ? AI.cleanText(String(raw.text)).slice(0, 280) : null;
  };

  // ------------------------------------------------------------ memory compaction: fuse old memories into a few summary lines
  AI.compactMemories = async function (batch) {
    if (!AI.hasKey() || !batch.length) return null;
    const P = MH.state.player;
    const blocks = batch.map(({ id, mems }) => `### ${MH.CHAR[id].name} (id: ${id})\n` + mems.map((m) => `- [${MH.agoStr(m.t)}] ${m.text}`).join('\n')).join('\n\n');
    const user = `These are OLD memories of villagers in Mirehollow (the player is ${P.name}). For each villager, fuse their list into 2-4 short first-person summary sentences that keep the important facts (what the player did, feelings, grudges, promises, gossip worth keeping). Drop trivia and repeats.\n\n${blocks}\n\nReply with ONLY JSON: {"<id>":["summary sentence", "..."], ...}`;
    const r = await AI.request([{ role: 'system', content: 'You condense villagers\' memories for a village life-sim. Keep each villager\'s own voice and point of view. Keep what happened as it happened: do not soften, censor or tone down events, only shorten them.\n' + AI.contentRules() }, { role: 'user', content: user + (AI.rulesReminder() ? '\n' + AI.rulesReminder() : '') }], { maxTokens: 900, temperature: 0.4 });
    if (r.error) return null;
    const raw = AI.parseJSON(r.text);
    if (!raw) return null;
    const out = {};
    for (const k in raw) { const id = AI.resolveId(k) || k; if (MH.CHAR[id] && Array.isArray(raw[k])) out[id] = raw[k].map((x) => String(x).trim().slice(0, 220)).filter(Boolean).slice(0, 4); }
    return out;
  };

  // ------------------------------------------------------------ offline fallback (no key / errors)
  const POS = /\b(thank|thanks|love|cute|nice|kind|sweet|beautiful|pretty|amazing|awesome|great|help|gift|sorry|please|friend|hug|wave|smile|compliment)\b/i;
  const NEG = /\b(hate|stupid|ugly|shut up|idiot|dumb|annoying|gross|loser|kick|punch|slap|insult|weird)\b/i;
  const ACT_REPLIES = {
    hug: ['*hugs you back*', '*squeezes you tight*', '*pats your back awkwardly*'],
    wave: ['*waves back*', '*gives a little wave*'],
    handshake: ['*shakes your hand firmly*'], shake: ['*shakes your hand*'],
    give: ['*accepts it with a surprised smile*', '*turns it over in their hands* For me?'],
    bow: ['*bows back, a bit confused*'],
    dance: ['*joins in with a little shimmy*'],
    poke: ['*swats your finger away*'],
  };
  AI.offlineTurn = function (convo, mode, payload) {
    const out = { lines: [], bond: {}, mood: {}, memory: {}, reputation: {}, witness: '', join: [], leave: [], give: [], take: [], coins: 0, relations: [], label: {}, invite: {}, plans: [], follow: {}, quest: null, questDone: [], end: false, offline: true };
    const members = convo.members.slice();
    const speakers = MH.shuffle(members.slice()).slice(0, Math.min(2, members.length));
    const text = String(payload || '');
    const pos = POS.test(text), neg = NEG.test(text);
    const act = (text.match(/\*([^*]+)\*/) || [])[1] || '';
    speakers.forEach((id, i) => {
      const ch = MH.CHAR[id], att = MH.social.attitude(id);
      let say;
      const actKey = Object.keys(ACT_REPLIES).find((k) => act.toLowerCase().includes(k));
      if (mode === 'player' && actKey && i === 0) {
        say = att < -20 && actKey === 'hug' ? '*steps back* Don\'t.' : MH.pick(ACT_REPLIES[actKey]) + (ch.mute ? '' : ' ' + MH.pick(ch.offline).replace(/^\*[^*]*\*\s*/, ''));
      } else if (mode === 'player' && neg && i === 0) {
        say = ch.mute ? '*stares at you, unimpressed*' : MH.pick(['Excuse me?', 'Wow. Okay.', 'Rude.', '*frowns* What did I do to you?']);
      } else say = MH.pick(ch.offline);
      if (ch.mute && !/^\*.*\*$/.test(say)) say = '*' + say.replace(/\*/g, '') + '*';
      out.lines.push({ who: id, say });
      if (mode === 'player') out.bond[id] = neg ? -3 : pos ? 2 : 1;
    });
    const v = convo.violence;
    if (mode === 'player' && v && !v.playful && members.includes(v.victim)) {
      const ch = MH.CHAR[v.victim], tough = MH.social.isTough(v.victim);
      out.lines = [{ who: v.victim, say: ch.mute ? '*staggers back, eyes wide, then glares*' : tough ? MH.pick(['*staggers, then squares up* You\'re going to regret that.', '*wipes their mouth* Try that again. I dare you.']) : MH.pick(['*stumbles back with a cry* OW! What is WRONG with you?!', '*clutches their face, shaking* W-why would you do that?!', '*backs away fast* Stay away from me!']) }];
      members.filter((id) => id !== v.victim).slice(0, 1).forEach((id) => out.lines.push({ who: id, say: MH.CHAR[id].mute ? '*gasps silently*' : MH.pick(['*gasps* Hey! Leave them alone!', '*steps back* Whoa — not cool.', 'Somebody get the Mayor!']) }));
      if (!tough && MH.fight && MH.fight.power(v.victim) < 2 && Math.random() < 0.5) out.leave.push(v.victim);
      else out.fight = { with: v.victim, kind: 'brawl' };
      return out;
    }
    if (mode === 'opener' && /\bmug|road toll|corners the player/i.test(String(payload)) && members.length) {
      out.lines = [{ who: members[0], say: MH.pick(['*steps out of the shadows* Road toll, little pigeon. Coins. Now.', '*cracks knuckles* Pay up, newcomer.', '*blocks your way* Pockets. Empty them.']) }];
      out.fight = { with: members[0], kind: 'mugging' };
      return out;
    }
    if (mode === 'opener' && /favou?r/i.test(String(payload)) && members.length && MH.quests) {
      const q = MH.quests.offlineOffer(members[0]);
      if (q) { out.lines = [{ who: members[0], say: q.line }]; out.quest = q.quest; return out; }
    }
    if (mode === 'player') {
      if (pos) out.reputation.kind = 1;
      if (neg) out.reputation.rude = 2;
      if (act && /give|hand/.test(act.toLowerCase())) {
        const P = MH.state.player;
        const it = P.inv.find((x) => act.toLowerCase().includes(x.name.toLowerCase().split(' ').pop()));
        if (it) { out.take.push({ to: speakers[0], item: it.name }); out.bond[speakers[0]] = 4; out.reputation.generous = 1; out.memory[speakers[0]] = 'They gave me a ' + it.name + '. Sweet of them.'; }
      }
      if (neg) out.witness = MH.state.player.name + ' was rude to ' + MH.CHAR[speakers[0]].name + '.';
      if (convo.invite) convo.invite.to.forEach((id) => { const att = MH.social.attitude(id); out.invite[id] = Math.random() < 0.45 + att / 100 + (MH.CHAR[id].partyLove || 0) * 0.2 ? 'yes' : 'no'; });
    }
    return out;
  };

  AI.offlineSmallTalk = function (a, b, gossipMem, argue) {
    const A = MH.CHAR[a], B = MH.CHAR[b];
    if (argue) {
      const L = [{ who: a, say: MH.pick(['*marches up* YOU. We need to talk.', '*jabs a finger* Don\'t think I forgot.', 'Oh, it\'s YOU.']) }, { who: b, say: B.mute ? '*stares back, unimpressed*' : MH.pick(['Here we go again.', 'Excuse me?!', 'Not this again.']) }, { who: a, say: MH.pick(['*throws hands up* Unbelievable!', 'You know exactly what you did!', 'Ugh! Forget it!']) }];
      return { lines: L, shared: false, rel: -3, summary: `${A.name} and ${B.name} had a shouting match ${MH.world.placeAt(MH.npcById[a].x, MH.npcById[a].y).name}.` };
    }
    const lines = [{ who: a, say: MH.pick(A.offline) }, { who: b, say: MH.pick(B.offline) }];
    let shared = false;
    if (gossipMem && !A.mute) {
      const core = gossipMem.text.replace(/^Saw it myself: |^Heard from [^:]+: /, '');
      lines.push({ who: a, say: '*leans in* Did you hear? ' + core });
      lines.push({ who: b, say: B.mute ? '*tilts head*' : MH.pick(['No WAY.', 'Huh. Interesting.', 'Typical.', 'Oh my.']) });
      shared = true;
    }
    return { lines, shared, rel: MH.pick([0, 1, 1, -1]), summary: A.name + ' and ' + B.name + ' had a chat ' + MH.world.placeAt(MH.npcById[a].x, MH.npcById[a].y).name + '.' };
  };
})(window.MH);
