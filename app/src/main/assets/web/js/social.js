// Mirehollow — social simulation: bonds, reputation, memories, witnesses, gossip.
'use strict';
(function (MH) {
  const S = (MH.social = {});
  const MAX_MEM = 40, COMPACT_AT = 30;

  // ------------------------------------------------------------ time helpers
  MH.timeOf = () => MH.state.time;
  MH.hour = () => Math.floor(MH.state.time.minutes / 60) % 24;
  MH.weekday = () => MH.state.time.day % 7;
  MH.clockStr = (mins) => {
    const m = mins == null ? MH.state.time.minutes : mins;
    const h = Math.floor(m / 60) % 24, mm = Math.floor(m % 60);
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  };
  MH.stamp = () => 'Day ' + (MH.state.time.day + 1) + ' (' + MH.WEEKDAYS[MH.weekday()].slice(0, 3) + ') ' + MH.clockStr();
  MH.absMinutes = () => MH.state.time.day * 1440 + MH.state.time.minutes;
  MH.agoStr = (abs) => {
    const d = MH.absMinutes() - abs;
    if (d < 60) return 'just now';
    if (d < 1440) return Math.round(d / 60) + 'h ago';
    const days = Math.round(d / 1440);
    return days === 1 ? 'yesterday' : days + ' days ago';
  };
  MH.partOfDay = () => {
    const h = MH.hour();
    return h < 5 ? 'late night' : h < 9 ? 'morning' : h < 12 ? 'late morning' : h < 14 ? 'midday' : h < 17 ? 'afternoon' : h < 20 ? 'evening' : 'night';
  };

  // ------------------------------------------------------------ state
  S.newState = function (playerOpts) {
    const st = {
      version: 1,
      created: Date.now(),
      player: Object.assign({
        name: 'Newcomer', pronouns: 'they/them', look: {}, tx: 37, ty: 33, coins: 40, inv: [],
        rep: { kind: 0, funny: 0, chaotic: 0, generous: 0, brave: 0, rude: 0, violent: 0 }, deeds: [], wardrobe: [], decor: [], violence: 0, hp: 100,
      }, playerOpts || {}),
      time: { day: 0, minutes: 8 * 60 },
      weather: 'sunny',
      npcs: {},
      log: [],
      grapevine: [],
      picked: {},
      today: {},
      convoCount: 0,
      plans: [],      // villagers' appointments: visits, meetups, party attendance
      parties: [],    // parties the player is hosting
      joined: {},     // gatherings the player has attended (key: day|name)
      lastApproach: -99999,
      quests: [],     // favours villagers asked for
      job: null,      // the job in progress
      jobsDone: {},   // day|jobId -> true
    };
    MH.ALL.forEach((c) => {
      st.npcs[c.id] = {
        bond: c.start.bond, mood: c.start.mood, label: '', met: false,
        memories: [], perceived: { kind: 0, funny: 0, chaotic: 0, generous: 0, brave: 0, rude: 0, violent: 0 },
        rel: Object.fromEntries(Object.entries(c.relations || {}).map(([k, v]) => [k, v[0]])),
        lastTalk: -99999, talks: 0, lastApproach: -99999,
      };
    });
    return st;
  };

  S.npc = (id) => MH.state.npcs[id];

  // ------------------------------------------------------------ reputation & attitude
  S.repOpinion = function (id) {
    const ch = MH.CHAR[id], n = S.npc(id);
    if (!ch || !n) return 0;
    let s = 0;
    for (const t of MH.TRAITS) s += (ch.values[t] != null ? ch.values[t] : t === 'violent' ? -2 : 0) * (n.perceived[t] || 0);
    return MH.clamp(Math.round(s / 3), -40, 40);
  };
  S.attitude = (id) => MH.clamp(S.npc(id).bond + S.repOpinion(id), -100, 100);
  S.repSummary = function (rep) {
    const parts = MH.TRAITS.filter((t) => Math.abs(rep[t] || 0) >= 3).sort((a, b) => Math.abs(rep[b]) - Math.abs(rep[a]));
    if (!parts.length) return 'mostly unknown so far';
    return parts.slice(0, 4).map((t) => {
      const v = rep[t];
      const amt = Math.abs(v) >= 25 ? 'very ' : Math.abs(v) >= 10 ? '' : 'a bit ';
      return v > 0 ? amt + t : (t === 'rude' ? 'polite' : t === 'kind' ? amt + 'unkind' : t === 'violent' ? 'gentle' : 'not ' + t);
    }).join(', ');
  };
  S.opinionWords = function (id) {
    const o = S.repOpinion(id);
    if (o >= 15) return 'loves what they hear about you';
    if (o >= 5) return 'likes your reputation';
    if (o <= -15) return 'dislikes what they hear about you';
    if (o <= -5) return 'is unimpressed by your reputation';
    return 'has no strong view on your reputation';
  };

  S.changeBond = function (id, delta) {
    const n = S.npc(id); if (!n || !delta) return;
    delta = MH.clamp(Math.round(delta), -12, 10);
    const before = n.bond;
    n.bond = MH.clamp(n.bond + delta, -100, 100);
    const tierBefore = MH.bondTier(before), tierAfter = MH.bondTier(n.bond);
    MH.emit('bond', { id, delta, bond: n.bond });
    if (tierBefore !== tierAfter) MH.emit('tier', { id, from: tierBefore, to: tierAfter, up: n.bond > before });
  };

  // A good name is slow to build and quick to lose: "good" changes count for half (rounded by chance,
  // so small kindnesses still add up), "bad" ones count almost double. Chaotic is neither.
  const GOOD = { kind: 1, funny: 1, generous: 1, brave: 1, rude: -1, violent: -1 };
  S.scaleRep = function (deltas) {
    const out = {};
    if (!deltas) return out;
    for (const t of MH.TRAITS) {
      let d = Number(deltas[t]) || 0; if (!d) continue;
      if (GOOD[t]) d *= Math.sign(d) === GOOD[t] ? 0.5 : 1.75;
      const a = Math.abs(d), r = Math.floor(a) + (Math.random() < a % 1 ? 1 : 0);
      if (r) out[t] = Math.sign(d) * Math.min(6, r);
    }
    return out;
  };
  S.isTough = (id) => MH.TOUGH.includes(id);
  S.fearOf = (id) => { const n = S.npc(id); return n ? Math.max(0, n.perceived.violent || 0) : 0; };
  S.isAfraid = (id) => !S.isTough(id) && S.fearOf(id) >= 6;

  // deltas are the AI's raw numbers; they are scaled here (pass raw=false if already scaled)
  S.applyRep = function (deltas, observers, scaled) {
    if (!deltas) return;
    const rep = MH.state.player.rep;
    const clean = scaled ? deltas : S.scaleRep(deltas);
    for (const t in clean) rep[t] = MH.clamp((rep[t] || 0) + clean[t], -60, 60);
    (observers || []).forEach((id) => {
      const n = S.npc(id); if (!n) return;
      for (const t in clean) n.perceived[t] = MH.clamp((n.perceived[t] || 0) + clean[t], -60, 60);
    });
    return clean;
  };

  // ------------------------------------------------------------ memories
  S.addMemory = function (id, text, opts = {}) {
    const n = S.npc(id); if (!n || !text) return;
    text = String(text).trim().slice(0, 240);
    if (!text) return;
    // avoid near-duplicates
    if (n.memories.slice(-6).some((m) => m.text === text)) return;
    n.memories.push({ t: MH.absMinutes(), text, imp: opts.imp || 1, kind: opts.kind || 'self', about: opts.about || 'player', from: opts.from || null, shared: 0 });
    if (n.memories.length >= MAX_MEM) S.fuseOldMemories(id); // never just forget: fuse the oldest ones
  };
  // Fuse the oldest memories into one condensed note (offline fallback; the AI version runs overnight).
  S.oldestForCompaction = function (id, k = 14) {
    const n = S.npc(id); if (!n) return [];
    return n.memories.filter((m) => m.kind !== 'summary').slice(0, k);
  };
  S.fuseOldMemories = function (id, summaries) {
    const n = S.npc(id); if (!n) return;
    const old = S.oldestForCompaction(id);
    if (old.length < 4) return;
    const t = old[old.length - 1].t;
    const seen = new Set();
    const bits = old.filter((m) => { const k = m.text.toLowerCase().replace(/^(saw it myself|heard from [^:]+): /, '').slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => b.imp - a.imp).map((m) => m.text.replace(/^Saw it myself: /, '').slice(0, 90));
    const lines = summaries && summaries.length ? summaries : ['Older memories, half-remembered: ' + bits.slice(0, 8).join(' · ').slice(0, 600)];
    n.memories = n.memories.filter((m) => !old.includes(m));
    const fused = lines.map((text) => ({ t, text: String(text).slice(0, 620), imp: 3, kind: 'summary', about: old.some((m) => m.about === 'player') ? 'player' : 'town', from: null, shared: 0 }));
    // keep older summaries first, then the new ones, then everything newer
    const sums = n.memories.filter((m) => m.kind === 'summary');
    const rest = n.memories.filter((m) => m.kind !== 'summary');
    n.memories = sums.concat(fused, rest);
    // too many summaries: merge the oldest two
    while (n.memories.filter((m) => m.kind === 'summary').length > 6) {
      const s2 = n.memories.filter((m) => m.kind === 'summary');
      s2[1].text = (s2[0].text + ' / ' + s2[1].text).slice(0, 700); n.memories.splice(n.memories.indexOf(s2[0]), 1);
    }
  };
  // overnight: let the AI summarise villagers whose memory lists got long (batched, in the background)
  S.compactAll = async function () {
    if (S._compacting) return;
    const ids = Object.keys(MH.state.npcs).filter((id) => MH.CHAR[id] && S.npc(id).memories.filter((m) => m.kind !== 'summary').length > COMPACT_AT);
    if (!ids.length) return;
    S._compacting = true;
    try {
      for (let i = 0; i < ids.length; i += 6) {
        const batch = ids.slice(i, i + 6).map((id) => ({ id, mems: S.oldestForCompaction(id) }));
        let res = null;
        try { res = MH.ai.hasKey() ? await MH.ai.compactMemories(batch) : null; } catch (e) { res = null; }
        batch.forEach(({ id, mems }) => {
          const n = S.npc(id); if (!n || !mems.every((m) => n.memories.includes(m))) return; // changed meanwhile
          S.fuseOldMemories(id, res && res[id] && res[id].length ? res[id] : null);
        });
      }
    } finally { S._compacting = false; }
  };
  S.memoriesFor = function (id, max = 12) {
    const n = S.npc(id); if (!n) return [];
    const mems = n.memories.slice();
    // most important + most recent
    const recent = mems.slice(-Math.ceil(max * 0.6));
    const important = mems.filter((m) => !recent.includes(m)).sort((a, b) => b.imp - a.imp).slice(0, max - recent.length);
    return important.concat(recent).sort((a, b) => a.t - b.t);
  };

  // ------------------------------------------------------------ witnesses
  // Everyone awake within `radius` tiles (not in the excluded list) sees `text`.
  S.witness = function (text, wx, wy, exclude, repDeltas, radius = 9) {
    if (!text) return [];
    if ((MH.state.player.invisUntil || 0) > MH.absMinutes() && /^\S+ /.test(text) && text.startsWith(MH.state.player.name)) return []; // invisible: nobody saw a thing
    const seen = [];
    const R0 = MH.world.roomAt(Math.floor(wx / MH.TILE), Math.floor(wy / MH.TILE)), room0 = R0 ? R0.id : null;
    MH.npcs.forEach((e) => {
      if (exclude.includes(e.id) || e.hidden || e.asleep) return;
      if (MH.roomOf(e) !== room0) return; // walls block the view
      if (MH.CHAR[e.id].elusive && Math.random() < 0.5) return;
      const d = Math.hypot(e.x - wx, e.y - wy) / MH.TILE;
      if (d > radius) return;
      seen.push(e.id);
      S.addMemory(e.id, 'Saw it myself: ' + text, { imp: 2, kind: 'witness' });
    });
    if (seen.length && repDeltas) {
      for (const id of seen) {
        const n = S.npc(id);
        for (const t of MH.TRAITS) n.perceived[t] = MH.clamp((n.perceived[t] || 0) + MH.clamp(Math.round(Number(repDeltas[t]) || 0), -6, 6), -60, 60);
      }
    }
    if (seen.length) S.grapevine(text, seen);
    return seen;
  };

  S.grapevine = function (text, who) {
    const g = MH.state.grapevine;
    g.push({ t: MH.absMinutes(), text, who: who || [] });
    if (g.length > 60) g.splice(0, g.length - 60);
  };

  // ------------------------------------------------------------ gossip between two villagers
  // a tells b the juiciest thing they know about the player that b doesn't.
  S.pickGossip = function (a, b) {
    const na = S.npc(a), nb = S.npc(b);
    const cand = na.memories.filter((m) => m.about === 'player' && m.kind !== 'gossip-told' && !nb.memories.some((x) => x.text.includes(m.text.replace(/^Saw it myself: |^Heard from \w+: /, '').slice(0, 40))));
    if (!cand.length) return null;
    cand.sort((x, y) => y.imp * 2 + y.t / 1440 - (x.imp * 2 + x.t / 1440));
    return cand[0];
  };
  S.spreadGossip = function (a, b, memText) {
    const na = S.npc(a), nb = S.npc(b);
    if (!na || !nb) return;
    const core = String(memText).replace(/^Saw it myself: |^Heard from [^:]+: /, '');
    S.addMemory(b, 'Heard from ' + MH.CHAR[a].name + ': ' + core, { imp: 1, kind: 'gossip', from: a });
    // perceived reputation drifts toward the teller's view
    for (const t of MH.TRAITS) nb.perceived[t] = Math.round(MH.lerp(nb.perceived[t] || 0, na.perceived[t] || 0, 0.35));
  };

  S.changeRel = function (a, b, delta) {
    const na = S.npc(a); if (!na || !MH.CHAR[b]) return;
    na.rel[b] = MH.clamp((na.rel[b] || 0) + MH.clamp(Math.round(delta), -10, 10), -100, 100);
  };

  // ------------------------------------------------------------ player inventory
  S.giveItem = function (name, from) {
    const p = MH.state.player;
    name = String(name || '').trim().slice(0, 60);
    if (!name) return;
    p.inv.push({ name, icon: MH.itemIcon(name), from: from || null, t: MH.absMinutes() });
    if (p.inv.length > 40) p.inv.shift();
    MH.emit('inv', { added: name, from });
  };
  S.takeItem = function (name) {
    const p = MH.state.player;
    const n = String(name || '').toLowerCase();
    let i = p.inv.findIndex((it) => it.name.toLowerCase() === n);
    if (i < 0) i = p.inv.findIndex((it) => it.name.toLowerCase().includes(n) || n.includes(it.name.toLowerCase()));
    if (i < 0) return null;
    const it = p.inv.splice(i, 1)[0];
    MH.emit('inv', { removed: it.name });
    return it;
  };
  S.addCoins = function (d) {
    const p = MH.state.player;
    d = MH.clamp(Math.round(Number(d) || 0), -200, 200);
    if (!d) return 0;
    if (p.coins + d < 0) d = -p.coins;
    p.coins += d;
    MH.emit('coins', { delta: d, coins: p.coins });
    return d;
  };

  // ------------------------------------------------------------ log
  S.log = function (entry) {
    const L = MH.state.log;
    entry.t = entry.t || MH.absMinutes();
    L.push(entry);
    if (L.length > 500) L.splice(0, L.length - 500);
    MH.emit('log', entry);
  };
})(window.MH);
