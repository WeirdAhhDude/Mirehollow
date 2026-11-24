// Mirehollow — keyboard + touch (floating joystick) input.
'use strict';
(function (MH) {
  const keys = {};
  const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const inp = (MH.input = { keys, joy });

  const typing = () => {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  };

  window.addEventListener('keydown', (e) => {
    if (typing()) return;
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
    MH.emit('key', e);
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; joy.active = false; });

  inp.move = function () {
    let mx = 0, my = 0;
    if (keys['a'] || keys['arrowleft'] || keys['q']) mx -= 1;
    if (keys['d'] || keys['arrowright']) mx += 1;
    if (keys['w'] || keys['arrowup'] || keys['z']) my -= 1;
    if (keys['s'] || keys['arrowdown']) my += 1;
    let run = !!keys['shift'];
    if (mx || my) { const m = Math.hypot(mx, my); mx /= m; my /= m; }
    if (joy.active) {
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy, R = 46;
      const d = Math.hypot(dx, dy);
      if (d > 6) { const k = Math.min(1, d / R); mx = (dx / d) * k; my = (dy / d) * k; }
    }
    return { mx, my, run };
  };

  inp.bindTouch = function (zone, knobBase, knob) {
    const R = 46;
    const show = () => {
      knobBase.style.display = 'block';
      knobBase.style.left = joy.ox + 'px'; knobBase.style.top = joy.oy + 'px';
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    };
    zone.addEventListener('touchstart', (e) => {
      if (MH.chat && MH.chat.active) return;
      for (const t of e.changedTouches) {
        if (joy.active) break;
        joy.active = true; joy.id = t.identifier;
        joy.ox = joy.x = t.clientX; joy.oy = joy.y = t.clientY;
        show();
      }
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === joy.id) { joy.x = t.clientX; joy.y = t.clientY; show(); }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === joy.id) { joy.active = false; joy.id = null; knobBase.style.display = 'none'; }
    };
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
    // mouse fallback (desktop testing): drag on left side
    let mdown = false;
    zone.addEventListener('mousedown', (e) => { if (MH.chat && MH.chat.active) return; mdown = true; joy.active = true; joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY; show(); });
    window.addEventListener('mousemove', (e) => { if (mdown) { joy.x = e.clientX; joy.y = e.clientY; show(); } });
    window.addEventListener('mouseup', () => { if (mdown) { mdown = false; joy.active = false; knobBase.style.display = 'none'; } });
  };
})(window.MH);
