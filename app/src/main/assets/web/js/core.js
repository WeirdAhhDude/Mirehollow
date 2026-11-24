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
    mature: false, // Mature mode (16+): darker themes & strong language, fade-to-black instead of refusals
    playerName: '',
  };
  MH.settings = Object.assign({}, MH.defaultSettings, MH.store.get('settings', {}));
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
})(window.MH);
