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
  const COZY_RULES = '- CONTENT: cozy-chaotic, PG-13. Flirting, crushes, blushing, hugs, cuddles, hand-holding and kisses are fine; mild swearing is fine for characters who swear. No sexual content or nudity, slapstick violence only. If the player steers toward explicit content, handle it gracefully INSIDE the story (a villager gets flustered and changes the subject, or the scene simply moves on). Never break character, never lecture.';
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
    if (m === 'custom') { const t = String(MH.settings.customRules || '').trim(); r = t ? '- CONTENT (custom rules written by the player): ' + t : ''; }
    else r = m === 'mature' ? MATURE_RULES : COZY_RULES;
    return [r, ALWAYS_RULE].filter(Boolean).join('\n');
  };
  function placeKeys() { return Object.keys(MH.world.locations).filter((k) => k !== 'sky' && k !== 'myroom').join(', '); }
  function sysPrompt() {
    return [
      'You are the storyteller engine of MIREHOLLOW, a cozy-chaotic village life-sim role-play game (think a cosy villager game crossed with a group chat). You voice the villagers in the current scene and react to the player.',
      '',
      'WORLD: ' + (MH.LORE.brief || MH.LORE.town),
      MH.LORE.drama,
      'The player is the ONLY human in Mirehollow; everyone else is an animal or a stranger creature, and villagers may find that a little novel.',
      '',
      'HOW TO WRITE',
      '- Write only villagers (and rare narration). NEVER write the player\'s words, actions, thoughts or feelings.',
      '- Lines are short and chat-like: 1-3 sentences each. Put physical actions in *asterisks*, e.g. "*wipes flour on her apron* Oh! Hi, sweetie!".',
      '- 1-4 lines per turn in total. Not everyone has to speak: quiet villagers may just act or stay silent. Villagers may talk to each other, interrupt, tease, and gossip about absent villagers.',
      '- Keep every villager\'s unique voice. MUTE villagers only ever write *actions*.',
      '- React to the player\'s *actions* physically and emotionally. Villagers may perform their own actions toward the player (offer a handshake, a hug, hand over a pastry) which the player can answer next turn.',
      '- Feelings follow the bond/attitude numbers given. Hostile villagers are curt, suspicious or rude; it takes consistent good behaviour to win them over, but a disliked player can be grudgingly tolerated if they play their cards right. Friends are warm. Attitudes shift gradually, not in one message.',
      '- Use memories naturally (refer back to past events or gossip they heard). Never list memories.',
      '- Only PRESENT villagers may speak. NEARBY villagers may walk over and join when it makes sense: add their id to "join" and they may speak in the same turn.',
      '- Villagers have their own lives: they LEAVE conversations on their own (put them in "leave", with a goodbye line or action) when they have somewhere to be (see "Needs to leave soon"), get bored, offended, embarrassed, or when the moment has run its course. Don\'t keep everyone around forever.',
      '- When the player speaks TO a specific villager, that villager answers; others only chime in briefly if it\'s natural.',
      '- Narration lines ({"who":"narrator"}) are allowed sparingly for ambience (a crow lands, hissing from a bush, a train rattles past).',
      '- Shopping, wishes, pranks, experiments, favours, gifts, invitations and plans all happen through dialogue + the effect fields below. Keep it playful and consistent with the world.',
      AI.contentRules(),
      '',
      'OUTPUT: reply with ONE JSON object and nothing else:',
      '{"lines":[{"who":"<villager id or narrator>","say":"..."}],',
      ' "bond":{"<id>":0}, "mood":{"<id>":"<1-2 words>"}, "memory":{"<id>":"<short first-person note worth remembering about the player>"},',
      ' "reputation":{"kind":0,"funny":0,"chaotic":0,"generous":0,"brave":0,"rude":0},',
      ' "witness":"", "join":[], "leave":[],',
      ' "give_player":[{"from":"<id>","item":"<short item name>"}], "take_from_player":[{"to":"<id>","item":"<exact item from the player\'s pocket>"}],',
      ' "coins":0, "relations":[{"a":"<id>","b":"<id>","delta":0}], "label":{},',
      ' "invite_reply":{"<id>":"yes|no|maybe"}, "plans":[{"who":"<id>","where":"<place key or home>","day":"today|tomorrow","hour":0,"what":"<short>"}], "end":false}',
      'Field rules: bond = change in each villager\'s feelings toward the player this turn (-10..10; usually -2..+3, bigger only for big moments). reputation = what the PLAYER\'s behaviour this turn says about them (-3..3 per trait, mostly 0). witness = one sentence describing anything notable the player visibly did that an onlooker would gossip about, else "". memory = only for genuinely memorable moments. coins = change to the player\'s money (negative when they pay; only what they can afford). take_from_player only for items actually in the pocket. label = a new short relationship label (e.g. "friends", "rivals", "crush", "dating", "grudging respect") only when it truly changes.',
      'invite_reply: REQUIRED whenever the scene says the player is inviting someone — each invitee answers in character (attitude, schedule and personality decide). plans: only when a villager clearly agrees to meet the player at a specific place and time (where = one of: ' + placeKeys() + ', or "home" for the player\'s house). end = true only if the whole conversation is over. Omit empty fields.',
    ].join('\n');
  }

  function perceivedText(id) {
    const n = MH.social.npc(id);
    return MH.social.repSummary(n.perceived);
  }

  function stateText(e) {
    if (!e) return '';
    if (e.asleep) return 'was ASLEEP until a moment ago';
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
    const st = stateText(e);
    lines.push(`Right now: ${st ? st + '; ' : ''}mood: ${n.mood}.`);
    if (n.mustGo) lines.push(`Needs to leave soon: ${n.mustGo}.`);
    lines.push(`Toward ${P.name}: bond ${n.bond} (${MH.bondTier(n.bond)})${n.label ? ', relationship: ' + n.label : ''}${n.met ? '' : ', has NOT met them before (first meeting)'}. Reputation they have heard: ${perceivedText(id)} (${MH.social.opinionWords(id)}). Overall attitude ${att} on a -100..100 scale.`);
    const rel = (others || []).filter((o) => o !== id && MH.CHAR[o]).map((o) => {
      const v = n.rel[o] != null ? n.rel[o] : 0;
      const note = ch.relations && ch.relations[o] ? ch.relations[o][1] : '';
      return `${MH.CHAR[o].name} ${v > 0 ? '+' : ''}${v}${note ? ' (' + note + ')' : ''}`;
    });
    if (rel.length) lines.push('Feelings about others here: ' + rel.join('; '));
    const mems = MH.social.memoriesFor(id, full ? 8 : 4);
    if (mems.length) {
      lines.push('Memories:');
      mems.forEach((m) => lines.push(`- [${MH.agoStr(m.t)}] ${m.text}`));
    }
    return lines.join('\n');
  }

  function sceneHeader(locDesc) {
    const P = MH.state.player;
    const gath = MH.sim && MH.sim.currentGathering();
    const inv = P.inv.length ? P.inv.map((i) => i.name).join(', ') : 'nothing';
    const party = (MH.state.parties || []).find((x) => x.status === 'active');
    const home = MH.isInside(MH.player);
    return [
      `SCENE: ${MH.stamp()} (${MH.WEEKDAYS[MH.weekday()]}, ${MH.partOfDay()}). Weather: ${MH.state.weather}. Location: ${locDesc}.`,
      home ? 'The scene takes place INSIDE the player\'s own house; the villagers present are their guests.' : '',
      party ? `PARTY: the player is hosting a ${party.theme ? '"' + party.theme + '" ' : ''}party ${party.loc === 'home' ? 'at their house' : 'at ' + MH.world.locations[party.loc].name} right now. Guests who came: ${(party.arrived || []).map((id) => MH.CHAR[id] ? MH.CHAR[id].name : id).join(', ') || 'nobody yet'}.` : '',
      gath ? `Today's gathering: ${gath.name} is happening at ${MH.world.locations[gath.at].name}${MH.state.joined[MH.state.time.day + '|' + gath.name] ? ' (the player came to it)' : ''}.` : '',
      `PLAYER: ${P.name} (${P.pronouns}), the only human in town, a newcomer who recently moved into a little house by the west railway crossing. Coins: ${P.coins}. Pocket: ${inv}.`,
      `The player's actual town reputation so far: ${MH.social.repSummary(P.rep)}.`,
    ].filter(Boolean).join('\n');
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
    const parts = [sceneHeader(loc.desc), '', 'PRESENT VILLAGERS (they can speak):'];
    present.forEach((id) => parts.push(charCard(id, present, true), ''));
    const nearby = (convo.nearby || []).filter((id) => !present.includes(id));
    if (nearby.length) {
      parts.push('NEARBY (not in the conversation yet; may overhear and join):');
      nearby.forEach((id) => {
        const ch = MH.CHAR[id], n = MH.social.npc(id), e = MH.npcById[id];
        parts.push(`- ${ch.name} (id: ${id}): ${ch.title}. ${e && e.asleep ? 'Asleep. ' : ''}Attitude to player ${MH.social.attitude(id)}. Feelings about those present: ${present.map((p) => (MH.CHAR[p] ? MH.CHAR[p].name + ' ' + (n.rel[p] || 0) : '')).join(', ')}.`);
      });
      parts.push('');
    }
    const prior = mode === 'player' ? { lines: convo.lines.slice(0, -1) } : convo;
    if (prior.lines.length) parts.push('CONVERSATION SO FAR:', transcript(prior), '');
    const P = MH.state.player;
    if (convo.invite) parts.push(`INVITATION: with this message the player is inviting ${convo.invite.to.map((id) => MH.CHAR[id].name).join(' and ')} ${convo.invite.desc}. Every invitee must answer in character and you MUST fill "invite_reply" for each of them (yes/no/maybe).`);
    if (mode === 'player' && to && MH.CHAR[to]) parts.push(`NOW: ${P.name} (the player) turns to ${MH.CHAR[to].name} and says/does: "${payload}"`, `${MH.CHAR[to].name} answers first. Others may react briefly or stay quiet.`);
    else if (mode === 'player') parts.push(`NOW: ${P.name} (the player) says/does: "${payload}"`, 'Write the villagers\' response.');
    else if (mode === 'opener') parts.push(`NOW: ${payload}`, 'Write the opening of this encounter (the villager speaks first).');
    else if (mode === 'continue') parts.push(`NOW: ${P.name} stays quiet and listens for a moment. Continue the scene naturally — villagers talk among themselves, or turn to the player.`);
    else if (mode === 'join') parts.push(`NOW: ${payload}`, 'Write how the newcomer joins in.');
    parts.push('', 'Reply with the JSON object only.');
    return [{ role: 'system', content: sysPrompt() }, { role: 'user', content: parts.join('\n') }];
  };

  // Normalise a raw AI result so the game can apply it safely.
  AI.normalize = function (raw, convo) {
    const out = { lines: [], bond: {}, mood: {}, memory: {}, reputation: {}, witness: '', join: [], leave: [], give: [], take: [], coins: 0, relations: [], label: {}, invite: {}, plans: [], end: false };
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
      out.lines.push({ who: id, say: say.slice(0, 600) });
    });
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
    out.end = !!raw.end;
    return out;
  };

  // one call: every invitee writes a short RSVP note in their own voice
  AI.rsvpNotes = async function (party, ids) {
    if (!AI.hasKey() || !ids.length) return null;
    const P = MH.state.player;
    const list = ids.map((id) => `- ${MH.CHAR[id].name} (id: ${id}; voice: ${MH.CHAR[id].voice}) — answer: ${party.rsvp[id] === 'yes' ? 'COMING' : 'NOT coming'}`).join('\n');
    const user = `${P.name} is throwing a ${party.theme ? '"' + party.theme + '" ' : ''}party ${party.loc === 'home' ? 'at their house' : 'at ' + MH.world.locations[party.loc].name} on day ${Math.floor(party.at / 1440) + 1} at ${MH.clockStr(party.at % 1440)}. Write each invitee's short RSVP note (1-2 sentences, in their own voice; mute villagers write a wordless note like a doodle description).\n${list}\nReply with ONLY JSON: {"<id>":"<note>", ...}`;
    const r = await AI.request([{ role: 'system', content: 'You write short, funny, in-character RSVP notes for villagers of MIREHOLLOW, a cozy-chaotic village life-sim.' }, { role: 'user', content: user }], { maxTokens: 500 });
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
  AI.smallTalk = async function (a, b, gossipMem) {
    if (!AI.hasKey()) return AI.offlineSmallTalk(a, b, gossipMem);
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
      gossipMem ? `${A.name} knows this about the player ${P.name} and may gossip about it if natural: "${gossipMem.text}"` : `They might banter, bicker, make plans, or gossip about other villagers.`,
      '',
      'Write their short exchange: 2-4 lines, chat-style, *actions* in asterisks, each in their own voice.',
      'Reply with ONLY JSON: {"lines":[{"who":"<id>","say":"..."}],"shared_gossip":true|false,"relation_delta":<-5..5>,"summary":"<one sentence of what happened, for the town grapevine>"}',
    ].join('\n');
    const r = await AI.request([{ role: 'system', content: 'You write short, funny, in-character exchanges between villagers of MIREHOLLOW, a cozy-chaotic village life-sim. ' + (MH.LORE.brief || MH.LORE.town) + '\n' + AI.contentRules() }, { role: 'user', content: user }], { maxTokens: 500 });
    if (r.error) return AI.offlineSmallTalk(a, b, gossipMem);
    const raw = AI.parseJSON(r.text);
    if (!raw) return AI.offlineSmallTalk(a, b, gossipMem);
    const fake = { members: [a, b], nearby: [] };
    const norm = AI.normalize({ lines: raw.lines }, fake);
    return { lines: norm.lines.filter((l) => l.who !== 'narrator'), shared: !!raw.shared_gossip && !!gossipMem, rel: MH.clamp(Math.round(Number(raw.relation_delta) || 0), -5, 5), summary: String(raw.summary || '').slice(0, 160) };
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
    const out = { lines: [], bond: {}, mood: {}, memory: {}, reputation: {}, witness: '', join: [], leave: [], give: [], take: [], coins: 0, relations: [], label: {}, invite: {}, plans: [], end: false, offline: true };
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

  AI.offlineSmallTalk = function (a, b, gossipMem) {
    const A = MH.CHAR[a], B = MH.CHAR[b];
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
