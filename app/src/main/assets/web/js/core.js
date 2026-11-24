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
  MH.loadCustomPortraits = async function () {
    for (const id in MH.charEdits) {
      if (!MH.charEdits[id].customPortrait || !MH.CHAR[id]) continue;
      const url = await MH.idb.get('portrait_' + id);
      if (url) MH.CHAR[id].portrait = url;
    }
  };
})(window.MH);
