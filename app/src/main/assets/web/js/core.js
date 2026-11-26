// Mirehollow — core namespace, helpers, storage, events.
'use strict';
window.MH = window.MH || {};

(function (MH) {
  MH.TILE = 16;

  // ---------- math / random ----------
  MH.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  MH.lerp = (a, b, t) => a + (b - a) * t;
  MH.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  MH.rand = (a, b) => a + Math.random() * (b - a);
  MH.randi = (a, b) => Math.floor(MH.rand(a, b + 1));
  MH.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  MH.chance = (p) => Math.random() < p;
  MH.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // Deterministic RNG (mulberry32) for world generation.
  MH.seeded = function (seed) {
    let a = seed >>> 0;
    const f = function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    return f;
  };

  // Hash noise for tile variation.
  MH.hash2 = (x, y, s = 0) => {
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // ---------- color ----------
  MH.hexToRgb = (hex) => {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  MH.rgbToHex = (r, g, b) =>
    '#' + [r, g, b].map((v) => MH.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  MH.shade = (hex, f) => {
    // f < 1 darkens, f > 1 lightens
    const [r, g, b] = MH.hexToRgb(hex);
    if (f <= 1) return MH.rgbToHex(r * f, g * f, b * f);
    const t = f - 1;
    return MH.rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
  };
  MH.mix = (h1, h2, t) => {
    const a = MH.hexToRgb(h1), b = MH.hexToRgb(h2);
    return MH.rgbToHex(MH.lerp(a[0], b[0], t), MH.lerp(a[1], b[1], t), MH.lerp(a[2], b[2], t));
  };

  // ---------- text helpers ----------
  MH.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Render chat text: *actions* in italics.
  MH.fmt = (s) => MH.esc(s).replace(/\*([^*]+)\*/g, '<em class="act">*$1*</em>');
  MH.cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  MH.uid = () => Math.random().toString(36).slice(2, 10);

  // ---------- events ----------
  const listeners = {};
  MH.on = (ev, fn) => ((listeners[ev] = listeners[ev] || []).push(fn), fn);
  MH.off = (ev, fn) => { if (listeners[ev]) listeners[ev] = listeners[ev].filter((f) => f !== fn); };
  MH.emit = (ev, data) => (listeners[ev] || []).slice().forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });

  // ---------- storage ----------
  MH.store = {
    get(key, def) {
      try {
        const v = localStorage.getItem('mh_' + key);
        return v == null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem('mh_' + key, JSON.stringify(val)); return true; } catch (e) { console.warn('save failed', e); return false; }
    },
    del(key) { try { localStorage.removeItem('mh_' + key); } catch (e) {} },
  };

  // ---------- settings ----------
  MH.defaultSettings = {
    apiKey: '',
    model: 'google/gemini-2.5-flash',
    ambient: 'normal', // off | low | normal | high
    textSpeed: 'normal', // slow | normal | fast | instant
    timeScale: 1, // game minutes per real second
    temperature: 0.9,
    mature: false,
    contentMode: 'cozy', // 'cozy' | 'mature' | 'custom' — see ai.js "CONTENT RULES"
    customRules: '',
    thinking: 'off', // 'off' | 'low' | 'default' — model reasoning (off = fastest, avoids leaked thinking)
    fastRouting: true, // ask OpenRouter for the lowest-latency provider
    playerName: '',
  };
  MH.settings = Object.assign({}, MH.defaultSettings, MH.store.get('settings', {}));
  if (MH.settings.mature && MH.settings.contentMode === 'cozy') MH.settings.contentMode = 'mature';
  if (MH.settings.textSpeed === 'normal' && !MH.settings._v3) { MH.settings._v3 = true; }
  MH.saveSettings = () => MH.store.set('settings', MH.settings);

  // ---------- native bridge (Android) ----------
  const pending = {};
  window.MHNative = {
    resolve(id, status, text) {
      const p = pending[id];
      if (!p) return;
      delete pending[id];
      p({ status, text });
    },
  };
  MH.isNative = () => !!(window.AndroidBridge && window.AndroidBridge.http);
  // read the auto-backup file through the native bridge (answers like an HTTP call)
  MH.nativeReadAuto = () => new Promise((resolve) => { const id = MH.uid(); pending[id] = resolve; window.AndroidBridge.readAutoBackup(id); });
  MH.http = function (method, url, headers, body) {
    if (MH.isNative()) {
      return new Promise((resolve) => {
        const id = MH.uid();
        pending[id] = resolve;
        window.AndroidBridge.http(id, method, url, JSON.stringify(headers || {}), body || '');
      });
    }
    return fetch(url, { method, headers, body: method === 'GET' ? undefined : body })
      .then(async (r) => ({ status: r.status, text: await r.text() }))
      .catch((e) => ({ status: 0, text: JSON.stringify({ error: { message: 'Network error: ' + e.message } }) }));
  };

  MH.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- IndexedDB (uploaded portraits can be too big for localStorage) ----------
  MH.idb = (function () {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('mirehollow', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    }));
    const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', mode); const st = t.objectStore('kv'); const q = fn(st); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
    return {
      get: (k) => tx('readonly', (st) => st.get(k)).catch(() => null),
      set: (k, v) => tx('readwrite', (st) => st.put(v, k)).catch((e) => { console.warn('idb', e); return null; }),
      del: (k) => tx('readwrite', (st) => st.delete(k)).catch(() => null),
    };
  })();

  // ---------- villager edits (made in Journal → villager → Edit). Global, survive new games. ----------
  MH.EDITABLE = ['name', 'title', 'species', 'bio', 'voice', 'quirks', 'relNotes', 'notes'];
  MH.charEdits = MH.store.get('charEdits', {});
  MH.applyCharEdits = function (id) {
    const ids = id ? [id] : Object.keys(MH.CHAR);
    ids.forEach((cid) => {
      const ch = MH.CHAR[cid]; if (!ch) return;
      if (!ch._orig) ch._orig = { name: ch.name, title: ch.title, species: ch.species, bio: ch.bio, voice: ch.voice, quirks: (ch.quirks || []).slice(), relations: JSON.parse(JSON.stringify(ch.relations || {})), portrait: ch.portrait || null, notes: '' };
      const o = ch._orig, ed = MH.charEdits[cid] || {};
      ch.name = ed.name || o.name; ch.title = ed.title || o.title; ch.species = ed.species || o.species;
      ch.bio = ed.bio || o.bio; ch.voice = ed.voice || o.voice;
      ch.quirks = ed.quirks != null ? String(ed.quirks).split(',').map((q) => q.trim()).filter(Boolean) : o.quirks.slice();
      ch.notes = ed.notes || '';
      ch.relations = JSON.parse(JSON.stringify(o.relations));
      if (ed.relNotes) String(ed.relNotes).split('\n').forEach((line) => {
        const m = line.match(/^\s*([^:]+?)\s*:\s*(.+)$/); if (!m) return;
        const key = Object.keys(MH.CHAR).find((k) => k === m[1].toLowerCase() || MH.CHAR[k].name.toLowerCase() === m[1].toLowerCase().trim());
        if (key) ch.relations[key] = [ch.relations[key] ? ch.relations[key][0] : 0, m[2].trim()];
      });
      ch.portraitScale = ed.pScale || 1; ch.portraitX = ed.pX || 0; ch.portraitY = ed.pY || 0;
      if (!ed.customPortrait) ch.portrait = o.portrait;
    });
  };
  MH.saveCharEdit = function (id, data) {
    MH.charEdits[id] = Object.assign({}, MH.charEdits[id] || {}, data);
    MH.store.set('charEdits', MH.charEdits);
    MH.applyCharEdits(id);
  };
  MH.resetCharEdit = async function (id) {
    delete MH.charEdits[id];
    MH.store.set('charEdits', MH.charEdits);
    await MH.idb.del('portrait_' + id);
    MH.applyCharEdits(id);
  };
  // ---------- character slots: slot 1 keeps the original keys ('save', 'dayStart'), others get a number ----------
  MH.SLOTS = 4;
  MH.slot = MH.store.get('slot', 1);
  MH.slotKey = (base, n) => { const k = n || MH.slot; return k === 1 ? base : base + k; };
  MH.setSlot = (n) => { MH.slot = n; MH.store.set('slot', n); };

  // ---------- full backup: game + character edits + uploaded portraits + settings (never the API key) ----------
  MH.backup = {
    async build() {
      MH.save();
      const state = (MH.state && !MH.titleMode) ? MH.state : MH.store.get(MH.slotKey('save'), null);
      const slots = {};
      for (let n = 1; n <= MH.SLOTS; n++) { const st = n === MH.slot && MH.state && !MH.titleMode ? MH.state : MH.store.get(MH.slotKey('save', n), null); if (st) slots[n] = st; }
      const portraits = {};
      for (const id in MH.charEdits) if (MH.charEdits[id].customPortrait) { const url = await MH.idb.get('portrait_' + id); if (url) portraits[id] = url; }
      const settings = Object.assign({}, MH.settings); delete settings.apiKey;
      return { format: 'mirehollow-backup', version: 2, exported: new Date().toISOString(), state, slots, currentSlot: MH.slot, charEdits: MH.charEdits, portraits, settings };
    },
    async export() {
      const b = await MH.backup.build();
      const text = JSON.stringify(b);
      const day = b.state && b.state.time ? b.state.time.day + 1 : 0;
      const name = 'mirehollow-backup' + (day ? '-day' + day : '') + '.json';
      if (MH.isNative() && window.AndroidBridge.saveFile) window.AndroidBridge.saveFile(name, text);
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
      return Object.keys(b.portraits).length;
    },
    async import(text) {
      const data = JSON.parse(text);
      if (data && data.format === 'mirehollow-backup') {
        if (data.state && (!data.state.npcs || !data.state.player)) throw new Error('bad backup');
        // character edits & portraits
        for (const id in MH.charEdits) if (MH.charEdits[id].customPortrait) await MH.idb.del('portrait_' + id);
        MH.charEdits = data.charEdits || {};
        MH.store.set('charEdits', MH.charEdits);
        for (const id in data.portraits || {}) await MH.idb.set('portrait_' + id, data.portraits[id]);
        Object.keys(MH.CHAR).forEach((id) => { if (MH.CHAR[id]._orig) MH.CHAR[id].portrait = MH.CHAR[id]._orig.portrait; });
        MH.applyCharEdits();
        await MH.loadCustomPortraits();
        // settings (keep this device's API key)
        if (data.settings) { const key = MH.settings.apiKey; Object.assign(MH.settings, data.settings); MH.settings.apiKey = key; MH.saveSettings(); }
        if (data.slots && typeof data.slots === 'object') {
          for (let n = 1; n <= MH.SLOTS; n++) { MH.store.del(MH.slotKey('save', n)); MH.store.del(MH.slotKey('dayStart', n)); }
          for (const n in data.slots) if (data.slots[n] && data.slots[n].npcs) MH.store.set(MH.slotKey('save', +n), data.slots[n]);
          MH.setSlot(+data.currentSlot || 1);
          const cur = MH.store.get(MH.slotKey('save'), null);
          if (cur) MH.backup.loadGame(cur);
          return !!cur;
        }
        if (data.state) MH.backup.loadGame(data.state);
        return !!data.state;
      }
      if (!data || !data.npcs || !data.player) throw new Error('bad save');
      MH.backup.loadGame(data); // older export: just the game
      return true;
    },
    // ---- what's in a backup vs what you have now (so an old file can't silently eat newer progress)
    compare(text) {
      let data; try { data = JSON.parse(text); } catch (e) { return null; }
      const inc = data && data.format === 'mirehollow-backup' ? (data.slots ? data.slots[data.currentSlot || 1] || data.state : data.state) : data;
      const cur = MH.state && !MH.titleMode ? MH.state : MH.store.get(MH.slotKey('save'), null);
      if (!inc || !inc.time || !cur || !cur.time) return null;
      const abs = (st) => st.time.day * 1440 + st.time.minutes, when = (st) => `Day ${st.time.day + 1} ${MH.clockStr(st.time.minutes)}`;
      if (inc.created === cur.created && abs(inc) < abs(cur)) return `⚠ This backup is OLDER than your current game: ${when(inc)} vs ${when(cur)} for ${cur.player.name}. You would lose the progress in between.`;
      if (inc.created !== cur.created) return `This backup is a different game (${inc.player.name}, ${when(inc)}) — it replaces ${cur.player.name} (${when(cur)}).`;
      return null;
    },
    // ---- restore points: rolling snapshots kept inside the app (last 8)
    async snapshot(reason) {
      if (!MH.state && !MH.store.get(MH.slotKey('save'), null)) return;
      const b = await MH.backup.build();
      const key = 'rp_' + Date.now();
      await MH.idb.set(key, JSON.stringify(b));
      const list = MH.store.get('restorePoints', []);
      const cur = b.slots[b.currentSlot] || b.state;
      list.push({ key, t: Date.now(), reason: reason || 'autosave', who: cur ? cur.player.name : '?', day: cur ? cur.time.day + 1 : 0, slots: Object.keys(b.slots).length });
      while (list.length > 8) { const old = list.shift(); await MH.idb.del(old.key); }
      MH.store.set('restorePoints', list);
    },
    points: () => MH.store.get('restorePoints', []).slice().reverse(),
    async restore(key) { const text = await MH.idb.get(key); if (!text) throw new Error('missing'); return MH.backup.import(text); },
    // ---- the auto-backup file (Android): picked once, rewritten regularly. Pick Google Drive for a cloud copy.
    autoName: () => (MH.isNative() && window.AndroidBridge.autoBackupName ? window.AndroidBridge.autoBackupName() : ''),
    chooseAuto() { if (MH.isNative() && window.AndroidBridge.chooseAutoBackup) window.AndroidBridge.chooseAutoBackup('mirehollow-autobackup.json'); },
    onAutoChosen(name) { if (!name) { MH.ui.toast('No auto-backup file chosen.'); return; } MH.ui.toast(`💾 Auto-backup on: ${name}`, 3.5); MH.backup.autoSave(true); MH.emit('autobackup'); },
    async autoSave(force) {
      if (!MH.backup.autoName() || MH.backup._writing) return;
      const now = Date.now();
      if (!force && now - (MH.backup._lastAuto || 0) < 4 * 60 * 1000) return;
      if (force && now - (MH.backup._lastAuto || 0) < 20 * 1000) return;
      MH.backup._lastAuto = now; MH.backup._writing = true;
      try { const b = await MH.backup.build(); window.AndroidBridge.writeAutoBackup(JSON.stringify(b)); }
      catch (e) { MH.backup._writing = false; console.warn('auto-backup', e); }
    },
    onAutoWritten(ok, err) {
      MH.backup._writing = false;
      MH.store.set('lastAutoBackup', { t: Date.now(), ok, err });
      if (!ok) MH.ui.toast('⚠ Auto-backup failed: ' + err, 4);
      MH.emit('autobackup');
    },
    async readAuto() { const r = await MH.nativeReadAuto(); if (r.status !== 200) throw new Error(r.text || 'could not read'); return r.text; },
    loadGame(st) {
      if (MH.chat && MH.chat.active) MH.chat.end();
      MH.loadState(st);
      MH.save();
    },
  };

  MH.loadCustomPortraits = async function () {
    for (const id in MH.charEdits) {
      if (!MH.charEdits[id].customPortrait || !MH.CHAR[id]) continue;
      const url = await MH.idb.get('portrait_' + id);
      if (url) MH.CHAR[id].portrait = url;
    }
  };
})(window.MH);
