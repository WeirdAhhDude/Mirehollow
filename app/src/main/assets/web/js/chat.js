// Mirehollow — conversations: big portraits with speech bubbles over their heads, chat bar,
// choosing who you talk to, group joins/leaves, invitations & plans, effects.
// Also ambient speech bubbles over chibis on the map.
'use strict';
(function (MH) {
  const T = MH.TILE;
  const chat = (MH.chat = { active: false, convo: null, bubbles: new Map(), waiting: false, pendingInvite: null, to: null });
  let el = {};

  // map bubbles fade after a while (short lines quicker); conversation bubbles stay until that character speaks again
  const holdFor = (text) => MH.clamp(1.4 + String(text).length * 0.045, 2, 10);
  const cps = () => ({ slow: 24, normal: 70, fast: 140, instant: 1e6 }[MH.settings.textSpeed] || 70);

  chat.init = function () {
    el = {
      root: document.getElementById('chat'), cast: document.getElementById('cast'), says: document.getElementById('says'), input: document.getElementById('chatInput'),
      send: document.getElementById('btnSend'), leave: document.getElementById('btnLeave'), wait: document.getElementById('btnWait'),
      give: document.getElementById('btnGive'), star: document.getElementById('btnStar'), log: document.getElementById('btnChatLog'), logTop: document.getElementById('chatLogTop'),
      invite: document.getElementById('btnInvite'), bubbles: document.getElementById('bubbles'), quick: document.getElementById('quick'),
      me: document.getElementById('meBubble'), toChip: document.getElementById('toChip'), tags: document.getElementById('castTags'),
    };
    el.send.onclick = () => chat.submit();
    el.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chat.submit(); } if (e.key === 'Escape') chat.askLeave(); });
    el.leave.onclick = () => chat.askLeave();
    el.wait.onclick = () => chat.letThemTalk();
    el.star.onclick = () => wrapAction();
    el.give.onclick = () => MH.ui.openGivePicker();
    el.invite.onclick = () => MH.ui.openInvitePicker();
    const fb = document.getElementById('btnFight'); if (fb) fb.onclick = () => MH.ui.openFightPicker();
    const pb = document.getElementById('btnPlay'); if (pb) pb.onclick = () => MH.ui.openPlayPicker();
    el.log.onclick = () => MH.ui.toggleLog();
    el.logTop.onclick = () => MH.ui.toggleLog();
    el.toChip.onclick = () => chat.setTarget(null);
    el.quick.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => insertText(b.dataset.act + ' ')));
    el.cast.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.tag')) return;
      // pick the character whose body is nearest the tap (wide artwork overlaps neighbours)
      let card = null, bd = 1e9;
      el.cast.querySelectorAll('.card:not(.leaving)').forEach((c2) => { const r = c2.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - e.clientX); if (d < bd) { bd = d; card = c2; } });
      // tapping picks who you talk to; it never skips anyone's line
      if (card && chat.convo && chat.convo.members.length > 1 && e.target.closest('img')) chat.setTarget(chat.to === card.dataset.id ? null : card.dataset.id);
    });
    el.says.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.nexta')) { e.stopPropagation(); e.preventDefault(); clearArrows(); chat.skipFlag = true; return; }
      const s = e.target.closest('.say'); if (!s) return;
      e.stopPropagation();
      const entry = !s.classList.contains('ghost') && s.dataset.id ? says.get(s.dataset.id) : null;
      if (entry && entry.full && entry.shown < entry.full.length) { entry.shown = entry.full.length; s.classList.add('expand'); return; }
      s.classList.toggle('expand');
    });
    requestAnimationFrame(layoutLoop);
  };

  function insertText(s) {
    const i = el.input;
    const a = i.selectionStart ?? i.value.length, b = i.selectionEnd ?? i.value.length;
    i.value = i.value.slice(0, a) + s + i.value.slice(b);
    i.focus();
    const p = a + s.length; i.setSelectionRange(p, p);
  }
  chat.insertText = insertText;
  function wrapAction() {
    const i = el.input, a = i.selectionStart, b = i.selectionEnd;
    if (a !== b) { i.value = i.value.slice(0, a) + '*' + i.value.slice(a, b) + '*' + i.value.slice(b); i.focus(); }
    else { insertText('**'); i.setSelectionRange(a + 1, a + 1); }
  }

  chat.lockedBy = function () {
    const c = chat.convo; if (!c || !c.lock) return null;
    const L = c.lock;
    const downed = c.combat && c.combat.enemies.some((x) => x.id === L.by && x.out);
    if (L.turns <= 0 || downed || (L.by && !c.members.includes(L.by)) || (L.by && MH.fight.isHurt(MH.npcById[L.by]))) { c.lock = null; return null; }
    return L;
  };
  chat.askLeave = async function () {
    if (!chat.active) return;
    const L = chat.lockedBy();
    if (L) {
      MH.ui.narrate(`You try to leave — but ${L.why}.`);
      if (!chat.waiting) chat.sendText('*tries to leave*');
      return;
    }
    if (MH.fight && MH.fight.inCombat(chat.convo)) {
      if (chat.waiting) return;
      if (await MH.ui.confirm('Try to run from the fight? If it fails, they get a free attack.', 'Run!', 'Stay and fight')) MH.fight.tryFlee(chat.convo);
      return;
    }
    const names = chat.convo.members.map((id) => MH.CHAR[id].name);
    const ok = await MH.ui.confirm(`Leave the conversation with ${names.length > 2 ? names.slice(0, 2).join(', ') + ' and the others' : names.join(' and ')}?`, 'Leave', 'Stay');
    if (!ok) return;
    const c = chat.convo, chasers = c.phone ? [] : c.members.filter((id) => {
      if (MH.social.isAfraid(id) || MH.fight.power(id) < 2 || MH.fight.isHurt(MH.npcById[id])) return false;
      const attacked = (c.attacked || []).includes(id), mugger = c.mugging === id, anger = (c.anger || {})[id] || 0;
      return Math.random() < (mugger ? 0.8 : attacked ? 0.7 : anger <= -8 ? 0.4 : 0);
    });
    chat.end();
    chasers.forEach((id, i) => setTimeout(() => MH.sim.startChase(MH.npcById[id], { kind: c.mugging === id ? 'mugging' : 'brawl', reason: (c.attacked || []).includes(id) ? 'you hit them and walked off' : c.mugging === id ? 'you walked away without paying' : 'you made them furious and left', ally: i ? chasers[0] : null }), 900 + i * 500));
  };

  // who the player is talking to in a group (tap a portrait)
  chat.setTarget = function (id) {
    chat.to = id && chat.convo && chat.convo.members.includes(id) ? id : null;
    if (chat.to) chat.front = chat.to; // tapped: they come to the front until someone else speaks
    el.cast.querySelectorAll('.card').forEach((c) => c.classList.toggle('target', c.dataset.id === chat.to));
    el.tags.querySelectorAll('.tag').forEach((t) => t.classList.toggle('target', t.dataset.id === chat.to));
    applyLayers();
    el.toChip.classList.toggle('on', !!chat.to);
    el.toChip.innerHTML = chat.to ? `To: <b>${MH.esc(MH.CHAR[chat.to].name)}</b> ✕` : '';
    el.input.placeholder = chat.to ? `Say something to ${MH.CHAR[chat.to].name}…` : chat.convo && chat.convo.members.length > 1 ? 'Talk to everyone… (tap a portrait to pick one)' : 'Say something… *actions* in asterisks';
  };

  // ------------------------------------------------------------ map bubbles (ambient chatter)
  chat.showBubble = function (ent, text, opts = {}) {
    let b = chat.bubbles.get(ent);
    if (!b) { const d = document.createElement('div'); d.className = 'bubble'; el.bubbles.appendChild(d); b = { d, ent }; chat.bubbles.set(ent, b); }
    b.full = text; b.shown = opts.instant ? text.length : 0; b.hold = opts.hold ? 1e9 : opts.dur || holdFor(text); b.done = null;
    b.born = MH.now; b.rendered = null;
    b.d.innerHTML = ''; b.d.style.opacity = '1';
    return b;
  };
  chat.clearBubble = (ent) => { const b = chat.bubbles.get(ent); if (b) { b.d.remove(); chat.bubbles.delete(ent); } };
  chat.updateBubbles = function (dt) {
    const list = [];
    for (const [ent, b] of chat.bubbles) {
      if (b.full && b.shown < b.full.length) { b.shown = Math.min(b.full.length, b.shown + cps() * dt); b.d.innerHTML = MH.fmt(b.full.slice(0, Math.floor(b.shown))); }
      else if (b.full && b.rendered !== b.full) { b.d.innerHTML = MH.fmt(b.full); b.rendered = b.full; }
      if (b.full && b.shown >= b.full.length && b.done == null) b.done = MH.now;
      const dead = ent.hidden || (b.done != null && MH.now > b.done + b.hold);
      if (dead) { b.d.style.opacity = '0'; if (ent.hidden || MH.now > b.done + b.hold + 0.4) { b.d.remove(); chat.bubbles.delete(ent); } continue; }
      const p = MH.render.worldToScreen(ent.x, MH.render.headTop(ent) - 4);
      b.ax = p.x; b.ay = p.y; list.push(b);
    }
    list.sort((a, b) => b.born - a.born);
    const placed = [], W = el.bubbles.clientWidth || window.innerWidth;
    list.forEach((b, i) => {
      const w = b.d.offsetWidth, h = b.d.offsetHeight;
      const x = MH.clamp(b.ax - w / 2, 6, Math.max(6, W - w - 6));
      let y = b.ay - h - 8;
      for (let k = 0; k < 8; k++) { const hit = placed.find((r) => x < r.x + r.w + 4 && x + w + 4 > r.x && y < r.y + r.h + 4 && y + h + 4 > r.y); if (!hit) break; y = hit.y - h - 8; }
      const gone = y < 50 && i > 0;
      b.d.classList.toggle('gone', gone); if (gone) return;
      y = Math.max(50, y); placed.push({ x, y, w, h });
      b.d.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      b.d.style.setProperty('--tx', Math.round(MH.clamp(b.ax - x, 14, w - 14)) + 'px');
      b.d.classList.toggle('stacked', y < b.ay - h - 12);
      b.d.classList.toggle('old', i >= 2);
    });
    updateSays(dt);
  };

  chat.playAmbient = async function (lines) {
    for (const l of lines) {
      const e = MH.npcById[l.who];
      if (!e || e.hidden || (chat.active && chat.convo && chat.convo.members.includes(e.id))) break;
      chat.showBubble(e, l.say);
      if (Math.random() < 0.3) e.showEmote(MH.pick(['note', 'heart', '!', '?', 'sweat']), 1.6);
      await waitFor(1.4 + l.say.length / cps() + Math.min(2.2, l.say.length * 0.028));
    }
  };
  const waitFor = (secs) => new Promise((res) => { const end = MH.now + secs; const tick = () => (MH.now >= end || chat.skipFlag ? ((chat.skipFlag = false), res()) : setTimeout(tick, 40)); tick(); });

  // ------------------------------------------------------------ conversation bubbles (persistent)
  const says = new Map(); // id -> { d, txt, full, shown, born }
  function sayFor(id) {
    let s = says.get(id);
    if (!s) {
      const d = document.createElement('div');
      d.className = 'say'; d.dataset.id = id;
      const ch = MH.CHAR[id];
      d.innerHTML = `<span class="who" style="color:${MH.shade((ch.look && ch.look.top) || '#a86a3a', 0.75)}">${MH.esc(ch.name)}</span><span class="txt"></span>`;
      el.says.appendChild(d);
      s = { d, txt: d.querySelector('.txt'), full: '', shown: 0, born: 0 };
      says.set(id, s);
    }
    return s;
  }
  const GHOST_HOLD = 2.2, GHOST_FADE = 4.5; // seconds fully visible, then fading
  // Older lines keep exactly the same look (same text size, same line breaks); they're just cut
  // from the top so their LAST lines show ("…the end of what they said"). Tap one for all of it.
  const OLD_LINES = 3.2;
  function clipTo(txt, px) {
    if (px > 0 && txt.scrollHeight > px + 2) {
      if (!txt.classList.contains('clip')) txt.classList.add('clip');
      const v = Math.round(px) + 'px'; if (txt.style.maxHeight !== v) txt.style.maxHeight = v;
      txt.scrollTop = txt.scrollHeight;
    } else if (txt.classList.contains('clip')) { txt.classList.remove('clip'); txt.style.maxHeight = ''; }
  }
  function ghostOf(s) {
    if (!s.full || !s.d.classList.contains('on')) return;
    const g = s.d.cloneNode(true);
    g.classList.remove('latest', 'thinking', 'expand', 'on'); g.classList.add('ghost');
    g.dataset.full = s.full; g.dataset.fs = s.fs || 15;
    g.querySelectorAll('.nexta').forEach((a) => a.remove());
    const gt = g.querySelector('.txt'); if (gt) { gt.innerHTML = MH.fmt(s.full); gt.classList.remove('clip'); gt.style.maxHeight = ''; }
    g.style.transform = s.d.style.transform; g.style.zIndex = '1';
    el.says.appendChild(g);
    s.ghosts = s.ghosts || [];
    s.ghosts.unshift({ d: g, born: MH.now });
    while (s.ghosts.length > 2) s.ghosts.pop().d.remove();
  }
  function cardSay(id, text) {
    clearArrows();
    const s = sayFor(id);
    ghostOf(s);
    s.full = text; s.shown = 0; s.born = MH.now; s.thinking = false; s.rendered = null;
    s.d.classList.remove('thinking', 'expand'); s.d.classList.add('on');
    if (s.fitRoom) fitBubble(s, s.fitRoom, true); // size it now, from the whole line, so it never changes while it types
    const card = el.cast.querySelector(`.card[data-id="${id}"]`);
    if (card) card.classList.add('talking');
    chat.front = id; applyLayers();
  }
  function cardThinking(ids, on) {
    ids.forEach((id) => {
      const s = sayFor(id);
      if (on) { s.thinking = true; s.prevBorn = s.born; s.born = MH.now + 100; s.txt.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>'; s.d.classList.add('on', 'thinking'); }
      else if (s.thinking) { s.thinking = false; s.born = s.prevBorn || 0; s.d.classList.remove('thinking'); if (s.full) s.txt.innerHTML = MH.fmt(s.full); else s.d.classList.remove('on'); }
    });
  }
  const cardTyped = (id) => { const s = says.get(id); return !s || s.shown >= s.full.length; };
  // "there's more": a glowing arrow after the last word of the line you're reading; tap it to hear the next one now
  function clearArrows() { el.says && el.says.querySelectorAll('.nexta').forEach((a) => a.remove()); }
  function nextArrow(id) {
    const s = says.get(id);
    if (!s || !s.full || s.thinking || !s.d.classList.contains('on')) return;
    if (!s.txt.querySelector('.nexta')) s.txt.insertAdjacentHTML('beforeend', '<span class="nexta" title="Next">➤</span>');
    if (s.txt.classList.contains('clip')) s.txt.scrollTop = s.txt.scrollHeight;
  }
  chat.clearArrows = clearArrows;
  function updateSays(dt) {
    for (const [id, s] of says) {
      if (s.thinking || !s.full) continue;
      if (s.shown < s.full.length || s.rendered !== s.full) {
        s.shown = Math.min(s.full.length, s.shown + cps() * dt);
        s.txt.innerHTML = MH.fmt(s.full.slice(0, Math.floor(s.shown)));
        if (s.shown >= s.full.length) { s.rendered = s.full; const card = el.cast.querySelector(`.card[data-id="${id}"]`); if (card) card.classList.remove('talking'); }
      }
    }
    const m = chat.meB;
    if (m && m.shown < m.full.length) { m.shown = Math.min(m.full.length, m.shown + cps() * 2 * dt); el.me.innerHTML = MH.fmt(m.full.slice(0, Math.floor(m.shown))); }
  }
  // Layers: the character you picked is on top, then the main person you're talking to,
  // then everyone else in the order they joined. Portraits AND their bubbles follow these layers.
  // Layers: whoever spoke last (or whoever you just tapped) is on top, portrait AND bubble,
  // until somebody else speaks; then the person you're talking to; then everyone in join order.
  function layerOrder() {
    const c = chat.convo; if (!c) return [];
    const order = c.members.slice();
    const lift = (id) => { if (id && order.includes(id)) { order.splice(order.indexOf(id), 1); order.unshift(id); } };
    lift(chat.to); lift(chat.front);
    return order;
  }
  // One shared stack inside the chat (see style.css "v0.9 layers"):
  //   other portraits 10-19 < fading older lines 20 < other bubbles 21-29 < FRONT portrait 30 < shelf/tags 31-32 < FRONT bubble 36
  function applyLayers() {
    const order = layerOrder();
    el.cast.querySelectorAll('.card').forEach((card) => { const i = order.indexOf(card.dataset.id); card.style.zIndex = i === 0 ? 30 : i < 0 ? 10 : Math.max(10, 19 - i); });
  }
  chat.applyLayers = applyLayers;
  // Each bubble sits right above its speaker's head. The top layer keeps its spot; the others are fitted
  // around it (pushed upward) and drawn underneath. They never fade: the latest line of every speaker stays.
  function layoutTags() {
    const W = window.innerWidth, rootR = el.root.getBoundingClientRect(), order = layerOrder();
    el.tags.querySelectorAll('.tag').forEach((t) => {
      const card = el.cast.querySelector(`.card[data-id="${t.dataset.id}"]`);
      if (!card) return;
      const r = card.getBoundingClientRect(), w = t.offsetWidth;
      t.style.transform = `translateX(${Math.round(MH.clamp(r.left - rootR.left + r.width / 2 - w / 2, 4, Math.max(4, W - w - 4)))}px)`;
      t.style.zIndex = 20 - Math.max(0, order.indexOf(t.dataset.id));
    });
  }
  function layoutLoop() {
    if (chat.active) layoutTags();
    if (chat.active && says.size) {
      const W = window.innerWidth;
      const rootR = el.root.getBoundingClientRect();
      const n = chat.convo ? chat.convo.members.length : 1;
      const items = [];
      for (const [id, s] of says) {
        if (!s.d.classList.contains('on')) continue;
        const card = el.cast.querySelector(`.card[data-id="${id}"]`);
        const img = card && card.querySelector('img');
        if (!card || !img) { s.d.classList.remove('on'); continue; }
        // where the head is when the portrait is at REST (the breathing/talking sway is ignored, so bubbles don't bob or resize)
        const cr = card.getBoundingClientRect(), ih = img.offsetHeight, iw = img.offsetWidth;
        const ps = parseFloat(card.style.getPropertyValue('--ps')) || 1, pxp = parseFloat(card.style.getPropertyValue('--px')) || 0, pyp = parseFloat(card.style.getPropertyValue('--py')) || 0;
        const top0 = cr.top - rootR.top + img.offsetTop + ih * (1 - ps) + ih * pyp / 100;
        const cx0 = cr.left - rootR.left + img.offsetLeft + iw / 2 + iw * pxp / 100, head0 = top0 + ih * ps * (card.classList.contains('art') ? 0.05 : 0.08);
        const k = s.anchor && Math.abs(s.anchor.head - head0) < 60 && Math.abs(s.anchor.cx - cx0) < 60 ? 0.06 : s.anchor ? 0.3 : 1;
        s.anchor = s.anchor ? { cx: s.anchor.cx + (cx0 - s.anchor.cx) * k, head: s.anchor.head + (head0 - s.anchor.head) * k } : { cx: cx0, head: head0 };
        items.push({ s, cx: s.anchor.cx, head: s.anchor.head });
      }
      const order = layerOrder();
      const newest = items.reduce((m, it) => (it.s.born > (m ? m.s.born : -1) ? it : m), null);
      items.sort((a, b) => order.indexOf(a.s.d.dataset.id) - order.indexOf(b.s.d.dataset.id));
      const placed = [];
      const topMin = el.root.classList.contains('combat') ? 112 : 46;
      items.forEach((it, i) => {
        const d = it.s.d;
        const front = d.dataset.id === order[0];
        d.classList.toggle('old', i >= 2 && it !== newest && !it.s.thinking);
        d.classList.toggle('latest', it === newest && n > 1);
        d.classList.toggle('named', n > 1);
        d.style.zIndex = front ? 36 : Math.max(21, 29 - i);
        if (!it.s.thinking && it.s.full) {
          fitBubble(it.s, it.head - 10 - topMin);
          const lineH = (it.s.fs || 15) * 1.36;
          const cap = d.classList.contains('expand') ? 0 : d.classList.contains('old') && it.s.shown >= it.s.full.length ? Math.min(it.s.clipH || 1e9, lineH * OLD_LINES) : it.s.clipH || 0;
          clipTo(it.s.txt, cap);
        }
        const w = d.offsetWidth, h = d.offsetHeight;
        const x = MH.clamp(it.cx - w / 2, 8, Math.max(8, W - w - 8));
        let y = it.head - h - 10;
        for (let k = 0; k < 10; k++) { const hit = placed.find((q) => x < q.x + q.w + 4 && x + w + 4 > q.x && y < q.y + q.h + 4 && y + h + 4 > q.y); if (!hit) break; y = hit.y - h - 6; }
        y = Math.max(topMin, y); // keep clear of the fight strip
        placed.push({ x, y, w, h });
        d.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        d.style.setProperty('--tx', Math.round(MH.clamp(it.cx - x, 16, w - 16)) + 'px');
        d.classList.toggle('stacked', y < it.head - h - 16);
        // that speaker's previous lines sit just above, drifting up and fading out
        let gy = y;
        (it.s.ghosts || []).slice().forEach((g) => {
          const age = MH.now - g.born;
          const op = age < GHOST_HOLD ? 0.9 : 0.9 * (1 - (age - GHOST_HOLD) / GHOST_FADE);
          if (op <= 0) { g.d.remove(); it.s.ghosts.splice(it.s.ghosts.indexOf(g), 1); return; }
          const gt = g.d.querySelector('.txt'); if (gt) clipTo(gt, g.d.classList.contains('expand') ? 0 : (+g.d.dataset.fs || 15) * 1.36 * OLD_LINES);
          const gw = g.d.offsetWidth, gh = g.d.offsetHeight;
          gy = gy - gh * 0.94 - 4 - Math.min(10, age * 2);
          const gx = MH.clamp(x + w / 2 - gw / 2, 8, Math.max(8, W - gw - 8));
          g.d.style.transform = `translate(${Math.round(gx)}px, ${Math.round(Math.max(40, gy))}px) scale(0.94)`;
          g.d.style.opacity = op.toFixed(3);
          g.d.style.zIndex = '20'; // older lines fade UNDER everyone's current line
        });
      });
    }
    requestAnimationFrame(layoutLoop);
  }
  // Each line is sized ONCE, from its whole text: the biggest text size (15px down to 11px) at which it fits
  // above the speaker's head. If it doesn't fit even at 11px it's capped and shows its newest words.
  // Nothing is re-measured while it types (that was the flicker), only if the space really changes.
  function fitBubble(s, room, force) {
    const d = s.d, txt = s.txt; if (!txt || !s.full) return;
    room = Math.max(64, Math.round(room));
    const key = s.full + '|' + (d.classList.contains('named') ? 1 : 0);
    if (!force && s.fitKey === key && Math.abs(room - (s.fitRoom || 0)) < 36) return;
    s.fitKey = key; s.fitRoom = room;
    const probe = d.cloneNode(true);
    probe.classList.remove('expand', 'ghost', 'thinking');
    probe.style.cssText = 'position:absolute;left:0;top:0;transform:none;visibility:hidden;opacity:0;transition:none;pointer-events:none;';
    probe.querySelectorAll('.nexta').forEach((a) => a.remove());
    const pt = probe.querySelector('.txt'); pt.classList.remove('clip'); pt.style.maxHeight = ''; pt.innerHTML = MH.fmt(s.full);
    el.says.appendChild(probe);
    let fs = 15;
    for (; fs > 11; fs -= 0.5) { probe.style.fontSize = fs + 'px'; if (probe.offsetHeight <= room) break; }
    probe.style.fontSize = fs + 'px';
    const fullH = probe.offsetHeight, chrome = fullH - pt.offsetHeight;
    probe.remove();
    s.fs = fs; d.style.fontSize = fs + 'px';
    s.clipH = fullH > room ? Math.max(36, room - chrome) : 0;
  }
  function dropGhosts(s) { (s.ghosts || []).forEach((g) => g.d.remove()); s.ghosts = []; }
  function clearSays() { for (const [, s] of says) { s.d.remove(); dropGhosts(s); } says.clear(); el.says && el.says.querySelectorAll('.ghost').forEach((g) => g.remove()); }

  // ------------------------------------------------------------ lifecycle
  function nearbyIds(c) {
    if (c.phone) return [];
    const room = MH.roomOf(MH.player);
    return MH.npcs.filter((e) => !e.hidden && !c.members.includes(e.id) && MH.roomOf(e) === room && Math.hypot(e.x - c.x, e.y - c.y) / T < 9 && e.busy !== 'talking').map((e) => e.id);
  }
  function center(c) {
    if (c.phone) { MH.render.focus(MH.player.x, MH.player.y); return; }
    const ents = c.members.map((id) => MH.npcById[id]).concat([MH.player]);
    c.x = ents.reduce((s, e) => s + e.x, 0) / ents.length;
    c.y = ents.reduce((s, e) => s + e.y, 0) / ents.length;
    const portrait = window.innerHeight > window.innerWidth;
    MH.render.focus(c.x, c.y - 12 + (portrait ? MH.render.viewH() * 0.3 : MH.render.viewH() * 0.14));
  }

  chat.start = function (ids, mode, payload) {
    if (chat.active) { ids.forEach((id) => chat.addMember(id, 'joined')); return; }
    if (mode === 'phone') return startPhone(ids[0], payload);
    const extra = [];
    ids.forEach((id) => {
      const e = MH.npcById[id];
      if (e.busy === 'smalltalk') MH.npcs.forEach((o) => { if (o !== e && o.busy === 'smalltalk' && MH.distTiles(o, e) < 4.5 && !ids.includes(o.id)) extra.push(o.id); });
    });
    const comps = (MH.state.companions || []).filter((id) => !ids.includes(id) && !extra.includes(id) && MH.npcById[id] && MH.distTiles(MH.npcById[id], MH.player) < 10);
    const members = ids.concat(extra, comps);
    const c = { id: MH.uid(), members: [], nearby: [], lines: [], x: 0, y: 0, started: MH.absMinutes(), turn: 0, spoke: {}, joinedTurn: {} };
    chat.convo = c; chat.active = true; chat.to = null; chat.front = null;
    MH.state.convoCount++;
    members.forEach((id) => chat.addMember(id, null, true));
    if (extra.length) {
      const recent = MH.state.log.slice().reverse().find((l) => l.kind === 'overheard');
      if (recent && recent.lines) recent.lines.forEach((l) => c.lines.push({ who: l.who, text: l.say }));
    }
    for (const id of members) chat.clearBubble(MH.npcById[id]);
    center(c);
    MH.player.face(MH.npcById[members[0]].x, MH.npcById[members[0]].y);
    el.root.classList.remove('hidden');
    document.body.classList.add('chatting');
    el.cast.innerHTML = ''; el.tags.innerHTML = ''; clearSays(); el.me.classList.remove('on'); chat.meB = null;
    renderCast(); chat.setTarget(null);
    MH.social.log({ kind: 'sys', text: '— Conversation with ' + members.map((id) => MH.CHAR[id].name).join(', ') + ' · ' + MH.world.placeAt(c.x, c.y).name + ' —', convo: c.id });
    el.input.value = ''; chat.pendingInvite = null;
    const P = MH.state.player;
    // came straight back to someone you were just talking to?
    const n0 = MH.social.npc(members[0]), lc = MH.state.lastConvo;
    const gap = n0.lastEnd != null ? MH.absMinutes() - n0.lastEnd : 1e9;
    c.since = gap;
    if (lc && lc.ids.includes(members[0]) && MH.absMinutes() - lc.at <= 180 && mode !== 'opener') {
      lc.lines.forEach((l) => c.lines.push(Object.assign({}, l)));
      c.lines.push({ who: 'system', text: `${P.name} walked away and came back ${chat.gapStr(gap)} later` });
    }
    if (gap <= 20 && mode !== 'opener' && !(mode === 'quiet' && payload && payload.asleep)) { mode = 'quiet'; payload = { recent: gap }; }
    if (mode === 'quiet') {
      // you walked up behind them, or they're asleep: nothing happens until YOU say or do something
      const q = payload || {}, e0 = MH.npcById[members[0]];
      c.quiet = { id: members[0], asleep: !!q.asleep, behind: !!q.behind, recent: q.recent != null ? q.recent : null };
      if (q.recent != null) {
        // you just talked: nobody re-greets you — they glance over and wait for you to speak
        el.input.placeholder = `You were just talking with ${e0.ch.name}… say something`;
        MH.ui.narrate(MH.pick([`${e0.ch.name} looks back at you.`, `${e0.ch.name} glances over. "…Yeah?" seems to hang in the air.`, `${e0.ch.name} raises an eyebrow at you.`, `${e0.ch.name} turns back toward you.`]));
        return;
      }
      if (q.asleep) { e0.asleep = true; const card = el.cast.querySelector(`.card[data-id="${e0.id}"]`); if (card) card.classList.add('asleep'); }
      el.input.placeholder = q.asleep ? `${e0.ch.name} is fast asleep… *poke* them, whisper, or let them be` : `${e0.ch.name} hasn't noticed you yet…`;
      MH.ui.narrate(q.asleep ? `${e0.ch.name} is fast asleep.` : `${e0.ch.name} has their back to you and hasn't noticed you.`);
      return;
    }
    if (mode === 'opener') chat.runTurn('opener', payload);
    else {
      const e = MH.npcById[members[0]], n = MH.social.npc(e.id);
      const back = gap <= 180 ? ` They last talked only ${chat.gapStr(gap)} ago (see the earlier lines) — don't greet them like it's been a long time; pick up naturally.` : '';
      const why = (n.met ? `${P.name} walks up to ${e.ch.name} to talk.` : `${P.name}, the newcomer, walks up to ${e.ch.name} for the first time.`) + back;
      chat.runTurn('opener', why + (members.length > 1 ? ' (' + members.slice(1).map((m) => MH.CHAR[m].name).join(', ') + ' were already chatting with them.)' : ''));
    }
  };

  chat.gapStr = (g) => (g < 2 ? 'a moment' : g < 60 ? Math.round(g) + ' minutes' : Math.round(g / 60) === 1 ? 'an hour' : Math.round(g / 60) + ' hours');

  // texting: the villager stays wherever they are
  function startPhone(id, incoming) {
    const e = MH.npcById[id]; if (!e) return;
    const c = { id: MH.uid(), members: [id], nearby: [], lines: [], x: MH.player.x, y: MH.player.y, started: MH.absMinutes(), turn: 0, spoke: {}, joinedTurn: {}, phone: true };
    chat.convo = c; chat.active = true; chat.to = null; chat.front = null;
    c.joinedTurn[id] = 0; c.spoke[id] = 0;
    const n = MH.social.npc(id); n.lastTalk = MH.absMinutes(); n.talks++;
    el.root.classList.remove('hidden'); el.root.classList.add('phone');
    document.body.classList.add('chatting');
    el.cast.innerHTML = ''; el.tags.innerHTML = ''; clearSays(); el.me.classList.remove('on'); chat.meB = null;
    renderCast(); chat.setTarget(null);
    MH.render.focus(MH.player.x, MH.player.y);
    MH.social.log({ kind: 'sys', text: '— 📱 Texting ' + e.ch.name + ' —', convo: c.id });
    el.input.value = ''; chat.pendingInvite = null;
    el.input.placeholder = `Text ${e.ch.name}…`;
    if (incoming) { c.lines.push({ who: id, text: incoming }); MH.social.log({ kind: 'line', who: id, text: incoming, convo: c.id }); cardSay(id, incoming); }
  }

  chat.addMember = function (id, how, initial) {
    const c = chat.convo; if (!c || c.members.includes(id) || c.phone) return;
    const e = MH.npcById[id]; if (!e) return;
    if (MH.sim.approaching === e) MH.sim.approaching = null;
    c.members.push(id);
    c.joinedTurn[id] = c.turn; c.spoke[id] = c.turn;
    e.busy = 'talking'; e.asleep = false; e.hurry = false; e.path = null;
    if (e.hidden) { const s = MH.world.nearestWalkable(MH.player.tile().tx + 1, MH.player.tile().ty); e.setTile(s.tx, s.ty); e.hidden = false; }
    if (MH.distTiles(e, MH.player) > 2.5) {
      const pt = MH.player.tile();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1], [2, 0], [-2, 0], [0, -1], [1, -1], [-1, -1], [2, 1], [-2, 1]]) {
        const tx = pt.tx + dx, ty = pt.ty + dy;
        if (MH.world.walkable(tx, ty) && !MH.npcs.some((o) => o !== e && o.busy === 'talking' && o.tile().tx === tx && o.tile().ty === ty)) { MH.npcGoTo(e, tx, ty); e.walkToChat = { tx, ty }; e.hurry = true; break; }
      }
    }
    const n = MH.social.npc(id); n.lastTalk = MH.absMinutes(); n.talks++;
    chat.clearBubble(e);
    if (!initial) {
      c.lines.push({ who: 'system', text: e.ch.name + ' ' + (how || 'joins the conversation') });
      MH.social.log({ kind: 'sys', text: e.ch.name + ' ' + (how || 'joins the conversation') + '.', convo: c.id });
      e.showEmote('!', 1.5);
      MH.ui.toast(e.ch.name + ' joined the conversation');
      renderCast(); center(c); chat.setTarget(chat.to);
    }
  };

  chat.removeMember = function (id, how) {
    const c = chat.convo; if (!c || !c.members.includes(id)) return;
    c.members = c.members.filter((m) => m !== id);
    const e = MH.npcById[id];
    if (e) { e.busy = null; e.walkToChat = null; e.planKey = null; e.idleT = 1; }
    c.lines.push({ who: 'system', text: MH.CHAR[id].name + ' ' + (how || 'leaves') });
    MH.social.log({ kind: 'sys', text: MH.CHAR[id].name + ' ' + (how || 'left') + '.', convo: c.id });
    MH.ui.toast(MH.CHAR[id].name + ' ' + (how || 'left'));
    if (id === 'scarecrow' && e) MH.render.burst(e.x, e.y - 20, 'crow', 14);
    const s = says.get(id); if (s) { s.d.remove(); dropGhosts(s); says.delete(id); }
    if (chat.to === id) chat.setTarget(null);
    renderCast();
    if (!c.members.length) setTimeout(() => chat.end(), 1200); else { center(c); chat.setTarget(chat.to); }
  };

  chat.end = function () {
    const c = chat.convo; if (!c) return;
    c.members.forEach((id) => {
      const e = MH.npcById[id];
      if (e) { e.busy = null; e.walkToChat = null; e.planKey = e.guest || e.inRoom ? e.planKey : null; e.idleT = MH.rand(2, 5); }
      const n = MH.social.npc(id); n.met = true; n.lastTalk = MH.absMinutes(); n.mustGo = null;
    });
    // remember how (and when) this chat ended, so walking straight back picks up where it left off
    if (!c.phone && c.lines.length) {
      const was = Object.keys(c.joinedTurn || {}).concat(c.members).filter((id, i, a) => a.indexOf(id) === i && MH.CHAR[id]);
      was.forEach((id) => { MH.social.npc(id).lastEnd = MH.absMinutes(); });
      MH.state.lastConvo = { ids: was, at: MH.absMinutes(), lines: c.lines.filter((l) => l.who !== 'system' || !/walked away and came back/.test(l.text)).slice(-8).map((l) => ({ who: l.who, text: String(l.text).slice(0, 400), to: l.to })) };
    }
    chat.active = false; chat.convo = null; chat.waiting = false; chat.pendingInvite = null; chat.queued = false; chat.to = null;
    el.root.classList.add('hidden'); el.root.classList.remove('waiting', 'phone');
    MH.fight && MH.fight.hideOffer();
    MH.games && MH.games.hideOffer();
    if (MH.fight && c.combat && !c.combat.over) MH.fight.end(c, 'left');
    MH.fight && MH.fight.renderBar(null);
    document.body.classList.remove('chatting');
    el.input.blur(); el.me.classList.remove('on'); chat.meB = null; el.send.classList.remove('queued');
    clearSays();
    MH.quests && MH.quests.hideCard();
    MH.render.clearFocus();
    MH.ui.closeGivePicker && MH.ui.closeGivePicker();
    if (MH.ui.logOpen) MH.ui.toggleLog(false);
    MH.save();
  };

  // ------------------------------------------------------------ turns
  chat.submit = function () {
    const text = el.input.value.trim();
    if (!text || !chat.active) return;
    if (chat.waiting) { chat.queued = true; chat.skip(); el.send.classList.add('queued'); return; } // goes out as soon as they finish
    el.input.value = '';
    const c = chat.convo;
    const to = c.members.length > 1 ? chat.to : null;
    c.lines.push({ who: 'player', text, to });
    MH.social.log({ kind: 'line', who: 'player', text: (to ? '(to ' + MH.CHAR[to].name + ') ' : '') + text, convo: c.id });
    chat.meB = { full: (to ? '→ ' + MH.CHAR[to].name + ': ' : '') + text, shown: 0 };
    el.me.innerHTML = ''; el.me.classList.add('on');
    if (chat.pendingInvite && /\*[^*]*(invit|come along|come with)/i.test(text)) c.invite = chat.pendingInvite;
    c.violence = c.phone ? null : chat.detectViolence(text, c, to);
    if (c.lock) c.lock.turns--;
    if (c.quiet) { c.wake = c.quiet; c.quiet = null; const e0 = MH.npcById[c.wake.id]; if (e0) e0.asleep = false; const card = el.cast.querySelector(`.card[data-id="${c.wake.id}"]`); if (card) card.classList.remove('asleep'); chat.setTarget(chat.to); }
    // ⚔️ "fight for real" from the chat bar counts as starting a fight
    if (c.challenge && !/squares up|sparring/i.test(text)) c.challenge = null;
    if (c.challenge && c.challenge.kind === 'brawl' && !c.violence) c.violence = { victim: c.challenge.with, playful: false, act: 'squares up to fight them for real' };
    // fights: an attack outside a fight starts one (you strike first); inside a fight it's your move
    if (!c.phone && MH.fight) {
      const was = MH.fight.inCombat(c);
      if (c.violence && (c.mugging === c.violence.victim || (c.combat && c.combat.over === false))) c.violence.selfDefense = true;
      if (!was && c.violence && !c.violence.playful && c.members.includes(c.violence.victim)) MH.fight.begin(c, { with: c.violence.victim, kind: 'brawl', starter: 'player' });
      if (was) c.violence = null; // hitting back inside a fight isn't a fresh assault
      if (MH.fight.inCombat(c)) MH.fight.playerMove(c, text, to);
    }
    chat.pendingInvite = null;
    chat.runTurn('player', text, to);
  };
  // a villager drags the player somewhere: fade, move both, carry on talking there
  chat.drag = function (c, by, to) {
    const e = MH.npcById[by]; if (!e || !c.members.includes(by)) return;
    const L = to === 'home' ? MH.world.locations.home : MH.world.locations[to]; if (!L) return;
    const fade = document.getElementById('fade'); fade.classList.add('on');
    setTimeout(() => {
      if (MH.roomOf(MH.player)) { const R = MH.world.rooms[MH.roomOf(MH.player)]; if (R.id === 'home') MH.exitHome(); else MH.exitRoom(R.id); }
      const sp = to === 'home' ? MH.world.doorFront('home') : MH.world.randomSpot(to);
      MH.player.setTile(sp.tx, sp.ty);
      const n2 = MH.world.nearestWalkable(sp.tx + 1, sp.ty); e.setTile(n2.tx, n2.ty); e.hidden = false; e.path = null;
      (MH.state.companions || []).forEach((id) => { const f = MH.npcById[id]; if (f && f !== e) { const s2 = MH.world.nearestWalkable(sp.tx - 1, sp.ty); f.setTile(s2.tx, s2.ty); } });
      c.members.filter((id) => id !== by && !(MH.state.companions || []).includes(id)).forEach((id) => chat.removeMember(id, 'is left behind'));
      const txt = `${e.ch.name} dragged ${MH.state.player.name} to ${L.name}`;
      c.lines.push({ who: 'system', text: txt });
      MH.social.log({ kind: 'sys', text: '🫳 ' + txt + '.', convo: c.id });
      MH.social.addMemory(by, `Dragged ${MH.state.player.name} to ${L.name}.`, { imp: 2 });
      center(c); MH.render.snap(); fade.classList.remove('on');
      MH.ui.toast(`🫳 ${e.ch.name} drags you to ${L.name}!`, 3);
    }, 650);
  };

  // *punches Vix* and friends: physical attacks in the player's *actions*
  const VIOLENCE = /\b(punch\w*|hit|hits|hitting|slap\w*|kick\w*|stab\w*|shov\w*|smack\w*|headbutt\w*|attack\w*|assault\w*|beat\w* (?:up|on)|tackl\w*|bites?|biting|chok\w*|strangl\w*|elbows?|uppercut\w*|socks?|decks?|clobber\w*|wallop\w*|pummel\w*|shoots?|shot|throws? (?:a |the |my )?\w+ at|swings? at|bonks?|whacks?|body ?slam\w*|suplex\w*|karate.?chop\w*|spits? (?:on|at)|trips?|scratch\w*|claws?|kneecap\w*|knees? (?:him|her|them)|stomps? on|pushes|punts?)\b/i;
  const PLAYFUL = /\b(playful\w*|gentl\w*|lightly|light|pretend\w*|fake\w*|mock\w*|softly|teasing\w*|boops?|pillow|high.?five|fist.?bump|nudges?|pokes?)\b/i;
  chat.isAttack = (acts) => VIOLENCE.test(acts) || /\b(attack|strike|fight|tackle|lunge|swing|grab|pin|throw)\w*\b/i.test(acts);
  chat.detectViolence = function (text, c, to) {
    const acts = (String(text).match(/\*([^*]+)\*/g) || []).join(' ');
    if (!acts || !VIOLENCE.test(acts)) return null;
    const low = acts.toLowerCase();
    const named = c.members.find((id) => { const nm = MH.CHAR[id].name.toLowerCase(); return low.includes(nm) || low.includes(nm.split(' ').pop()); });
    return { victim: to || named || c.members[0], playful: PLAYFUL.test(acts), act: acts.replace(/\*/g, '').trim().slice(0, 160) };
  };
  // make sure an attack actually lands in the numbers, whatever the AI wrote
  function enforceViolence(c, res) {
    const v = c.violence; if (!v || v.playful || v.selfDefense || !MH.CHAR[v.victim]) return;
    const P = MH.state.player, S = MH.social;
    P.violence = (P.violence || 0) + 1;
    const vn = MH.CHAR[v.victim].name, tough = S.isTough(v.victim);
    // custom content rules: trust the AI's own reaction (it was told to follow the player's rules about violence)
    if (MH.ai.customRules()) { if (!res.witness && (res.reputation.violent || 0) > 0) res.witness = `${P.name} attacked ${vn}.`; c.attacked = (c.attacked || []).concat([v.victim]); res.violent = (res.reputation.violent || 0) > 0; return; }
    const R = res.reputation;
    R.violent = Math.max(R.violent || 0, 3); R.kind = Math.min(R.kind || 0, -2); R.rude = Math.max(R.rude || 0, 1);
    if (R.funny > 0) R.funny = 0; if (R.brave > 0) R.brave = 0;
    res.bond[v.victim] = Math.min(res.bond[v.victim] || 0, -8 - Math.min(4, P.violence - 1));
    c.members.forEach((id) => {
      if (id === v.victim) return;
      res.bond[id] = Math.min(res.bond[id] || 0, S.isTough(id) ? -2 : -4);
      if (!res.mood[id]) res.mood[id] = S.isTough(id) ? 'disgusted' : 'shaken';
      if (!res.memory[id]) res.memory[id] = `${P.name} attacked ${vn} right in front of me (${v.act}). ${S.isTough(id) ? 'Not okay.' : 'I\'m scared of them now.'}`;
    });
    if (!res.mood[v.victim] || /happy|fine|amused|cheer|giggl|laugh/i.test(res.mood[v.victim])) res.mood[v.victim] = tough ? 'furious' : 'terrified';
    const mem = `${P.name} ATTACKED me (${v.act}). ${tough ? 'They\'ll regret it.' : 'I\'m scared of them.'}`;
    res.memory[v.victim] = res.memory[v.victim] ? (res.memory[v.victim] + ' ' + mem).slice(0, 220) : mem;
    if (!res.witness) res.witness = `${P.name} attacked ${vn}${P.violence > 1 ? ' — again' : ''}.`;
    res.violent = true;
    c.attacked = (c.attacked || []).concat([v.victim]);
  }

  // send a line as the player (used by quest Accept/Decline); keeps whatever they were typing
  chat.sendText = function (text) { if (!chat.active) return; el.input.value = (text + ' ' + el.input.value).trim(); chat.submit(); };
  chat.setBusy = (w) => setWaiting(w);
  chat.combatMode = function (on) {
    el.root.classList.toggle('combat', !!on);
    el.input.placeholder = on ? 'Your move: type an *attack*, talk, or try to leave…' : (chat.convo && chat.convo.members.length > 1 ? 'Talk to everyone… (tap a portrait to pick one)' : 'Say something… *actions* in asterisks');
  };
  chat.yourMove = function () { MH.ui.narrate('Your move.'); if (!document.querySelector('.dodge')) el.input.focus({ preventScroll: true }); };
  chat.letThemTalk = function () { if (!chat.waiting && chat.active) chat.runTurn('continue'); };
  chat.setPendingInvite = function (inv, text) { chat.pendingInvite = inv; el.input.value = ''; insertText(text + ' '); };

  function setWaiting(w) {
    chat.waiting = w;
    el.root.classList.toggle('waiting', w);
    el.wait.disabled = w;
  }

  // who should be told they have to leave soon
  function updateMustGo(c) {
    c.members.forEach((id) => {
      const e = MH.npcById[id], n = MH.social.npc(id);
      const why = MH.sim.mustGo(e);
      if (why && !n.mustGo) n.mustGoTurn = c.turn;
      n.mustGo = why;
    });
  }

  chat.runTurn = async function (mode, payload, to) {
    const c = chat.convo; if (!c) return;
    if (c.quiet && mode === 'continue') return; // nobody talks until you do
    if (!c.members.length) { chat.end(); return; }
    c.nearby = nearbyIds(c);
    c.turn++;
    updateMustGo(c);
    setWaiting(true);
    const thinkers = [to && c.members.includes(to) ? to : chat.front && c.members.includes(chat.front) ? chat.front : c.members[0]];
    const thinkTimer = setTimeout(() => chat.convo === c && cardThinking(thinkers, true), 200);
    let res;
    try { res = await MH.ai.turn(c, mode, payload, to); }
    catch (err) { console.error(err); res = MH.ai.offlineTurn(c, mode, payload); res.error = String(err.message || err); }
    clearTimeout(thinkTimer);
    if (chat.convo !== c) return;
    cardThinking(thinkers, false);
    if (res.error) MH.ui.toast('⚠ ' + res.error + (res.offline ? ' (offline reply)' : ''), 5);
    await applyResult(c, res);
    c.invite = null;
    if (chat.convo === c) { setWaiting(false); if (chat.queued) { chat.queued = false; el.send.classList.remove('queued'); chat.submit(); } }
  };

  async function applyResult(c, res) {
    res.join.slice(0, 3).forEach((id) => chat.addMember(id, 'walks over and joins in'));
    for (const l of res.lines) {
      if (chat.convo !== c) return;
      if (l.who === 'narrator') {
        c.lines.push({ who: 'narrator', text: l.say });
        MH.social.log({ kind: 'narr', text: l.say, convo: c.id });
        MH.ui.narrate(l.say);
        await waitFor(0.9 + l.say.length * 0.02);
        continue;
      }
      if (!c.members.includes(l.who)) continue;
      const e = MH.npcById[l.who];
      MH.social.npc(l.who).met = true;
      c.lines.push({ who: l.who, text: l.say });
      c.spoke[l.who] = c.turn;
      MH.social.log({ kind: 'line', who: l.who, text: l.say, convo: c.id });
      setSpeaking(l.who);
      cardSay(l.who, l.say);
      reactEmote(e, l.say);
      while (!cardTyped(l.who) && chat.convo === c) await waitFor(0.04);
      // more is coming: a glowing arrow after this line (tap it to skip the pause)
      const nx = res.lines.slice(res.lines.indexOf(l) + 1).find((x) => x.who === 'narrator' || c.members.includes(x.who));
      if (nx) nextArrow(l.who);
      // a beat before the next line lands (the previous one stays readable, floating above)
      await waitFor(MH.clamp(0.8 + l.say.length * 0.018, 1.0, 3.2));
      chat.skipFlag = false;
    }
    clearArrows();
    if (chat.convo !== c) return;
    const v0 = c.violence, ch0 = c.challenge; c.challenge = null;
    enforceViolence(c, res); c.violence = null;
    if (ch0 && ch0.kind === 'spar' && !res.fight && res.offline && c.members.includes(ch0.with) && MH.fight.power(ch0.with) >= 2 && MH.social.attitude(ch0.with) > -20) res.fight = { with: ch0.with, kind: 'spar', starter: 'player' };
    if (v0 && res.fight) res.fight.starter = 'player';
    applyEffects(c, res);
    renderCast();
    if (MH.fight && MH.fight.inCombat(c)) { MH.fight.afterTurn(c, res); return; }
    if (res.end) { setTimeout(() => chat.convo === c && chat.end(), 2600); return; }
    codeLeaves(c);
    if (!c.phone && !res.fight && !res.drag) codeJoins(c);
  }

  // No time limit in conversations: villagers only leave when the story makes them (the AI's "leave"),
  // when someone chases them off, or when you end the chat.
  function codeLeaves() {}

  function reactEmote(e, say) {
    const s = say.toLowerCase();
    if (/blush|♥|love|heart|aww/.test(s)) e.showEmote('heart', 2);
    else if (/growl|roar|angry|glare|scowl|hiss/.test(s)) e.showEmote('anger', 2);
    else if (/laugh|giggle|haha|hehe|grin|cackle/.test(s)) e.showEmote('note', 2);
    else if (/\?\!|what\?|huh/.test(s)) e.showEmote('?', 1.6);
    else if (/sigh|sweat|nervous|flustered/.test(s)) e.showEmote('sweat', 2);
  }

  function planTime(day, hour) {
    let at = (MH.state.time.day + day) * 1440 + hour * 60;
    if (at < MH.absMinutes() - 30) at += 1440;
    return at;
  }
  function applyEffects(c, res) {
    const S = MH.social, P = MH.state.player;
    for (const id in res.bond) {
      if (!c.members.includes(id) && !res.leave.includes(id)) continue;
      const d = res.bond[id];
      if (d < 0) { c.anger = c.anger || {}; c.anger[id] = (c.anger[id] || 0) + d; }
      S.changeBond(id, d); floatDelta(id, d);
      const e = MH.npcById[id];
      if (d >= 3) MH.render.burst(e.x, e.y - 22, 'heart', 5);
      if (id === 'nimbus' && d <= -2) { MH.state.weather = 'storm'; MH.state.stormUntil = MH.absMinutes() + 90; MH.render.flash = 0.35; MH.sim.vibeNow('Thunder cracks over town. Nimbus is NOT pleased.'); }
    }
    for (const id in res.mood) S.npc(id) && (S.npc(id).mood = res.mood[id]);
    for (const id in res.memory) S.addMemory(id, res.memory[id], { imp: res.violent ? 4 : 2, kind: 'self' });
    for (const id in res.label) { S.npc(id).label = res.label[id]; MH.ui.toast(`${MH.CHAR[id].name}: “${res.label[id]}”`); }
    const rep = S.applyRep(res.reputation, c.members);
    if (c.phone) res.witness = '';
    if ((P.invisUntil || 0) > MH.absMinutes()) res.witness = ''; // nobody else sees a thing
    if (res.witness) {
      const seen = S.witness(res.witness, c.x, c.y, c.members, rep);
      if (res.violent) seen.forEach((id) => { S.changeBond(id, S.isTough(id) ? -2 : -4); const n = S.npc(id); if (n && !S.isTough(id)) n.mood = 'frightened'; });
      c.members.forEach((id) => { if (!res.memory[id]) S.addMemory(id, res.witness, { imp: 1, kind: 'self' }); });
      P.deeds.push({ t: MH.absMinutes(), text: res.witness }); if (P.deeds.length > 30) P.deeds.shift();
      if (seen.length) MH.ui.toast('👀 ' + seen.map((id) => MH.CHAR[id].name).slice(0, 3).join(', ') + (seen.length > 3 ? ' +' + (seen.length - 3) : '') + ' saw that');
    }
    res.give.forEach((g) => { S.giveItem(g.item, g.from); MH.ui.toast(`${MH.itemIcon(g.item)} Got ${g.item}${g.from && MH.CHAR[g.from] ? ' from ' + MH.CHAR[g.from].name : ''}`); });
    res.take.forEach((g) => { const it = S.takeItem(g.item); if (it) { MH.ui.toast(`Gave ${it.name}${g.to && MH.CHAR[g.to] ? ' to ' + MH.CHAR[g.to].name : ''}`); if (MH.quests) MH.quests.onGive(it, g.to, c.members); if (/\bphone\b/i.test(it.name) && MH.phone) MH.phone.give(g.to || c.members[0]); } });
    if (res.hurt) { MH.fight.damage(res.hurt, { by: c.members[0] }); MH.ui.toast(`💥 −${res.hurt} HP`, 2); MH.render.flash = 0.12; }
    if (!res.fight && c.pendingFight && c.members.includes(c.pendingFight.with)) res.fight = c.pendingFight; // they chased you down for this
    if (res.noLeave === false) c.lock = null;
    else if (res.noLeave && c.members.includes(res.noLeave.by)) { c.lock = { by: res.noLeave.by, why: res.noLeave.why || MH.CHAR[res.noLeave.by].name + ' won\'t let you go', turns: 3 }; }
    c.pendingFight = null;
    if (res.fight && res.fight.kind === 'mugging') c.mugging = res.fight.with;
    if (res.chase && MH.npcById[res.chase.who] && !c.phone) {
      const ch = res.chase;
      setTimeout(() => { if (chat.convo === c) chat.end(); MH.sim.startChase(MH.npcById[ch.who], { kind: ch.kind, reason: ch.why || '' }); }, 1200);
    } else if (res.fight && MH.fight && c.members.includes(res.fight.with) && !c.phone) {
      const f = res.fight;
      if (MH.fight.inCombat(c)) { if (f.kind !== 'spar' && !c.combat.enemies.some((x) => x.id === f.with)) MH.fight.begin(c, f); } // someone joins in
      else if (f.kind === 'spar' || f.kind === 'mugging') MH.fight.offer(c, f);
      else MH.fight.begin(c, f); // they attack: their turn comes right after these lines
    }
    // games: they accept your challenge, or propose one themselves
    const gc = c.gameChallenge; c.gameChallenge = null;
    if (MH.games && !c.phone && !MH.fight.inCombat(c)) {
      let m = res.minigame;
      if (!m && gc && res.offline && c.members.includes(gc.with) && MH.social.attitude(gc.with) > -20 && Math.random() < 0.85) m = gc;
      if (m && c.members.includes(m.with)) {
        if (gc && gc.with === m.with) m = Object.assign({}, gc, { game: m.game || gc.game, topic: m.topic });
        if (gc && gc.with === m.with) setTimeout(() => chat.convo === c && MH.games.inChat(c, m), 600); else MH.games.offer(c, m);
      }
    }
    if (res.drag && (!res.fight || MH.fight.inCombat(c))) setTimeout(() => chat.convo === c && chat.drag(c, res.drag.by, res.drag.to), 700);
    if (MH.quests) {
      (res.questDone || []).forEach((qid) => MH.quests.complete(qid, c.members));
      MH.quests.onTalk(c);
      if (res.quest) MH.quests.offer(res.quest, c);
    }
    if (res.coins) { const d = S.addCoins(res.coins); if (d) MH.ui.toast((d > 0 ? '+' : '') + d + ' coins'); }
    res.relations.forEach((r) => S.changeRel(r.a, r.b, r.delta));
    const inv = c.invite;
    if (inv) inv.to.forEach((id) => {
      const ans = res.invite[id] || 'maybe';
      const yes = ans === 'yes' || (ans === 'maybe' && Math.random() < 0.5);
      const where = inv.follow ? 'come along' : inv.loc === 'home' ? 'your house' : MH.world.locations[inv.loc].name;
      if (yes && inv.follow) { MH.sim.startFollow(id); S.addMemory(id, `${P.name} asked me to come along with them. I said yes.`, { imp: 2 }); return; }
      if (yes) { MH.sim.addPlan({ id, kind: inv.loc === 'home' ? 'visit' : 'meet', loc: inv.loc, at: inv.at, until: inv.at + 120, what: inv.what }); MH.ui.toast(`📅 ${MH.CHAR[id].name} will come to ${where} at ${MH.clockStr(inv.at % 1440)}${Math.floor(inv.at / 1440) > MH.state.time.day ? ' tomorrow' : ''}`, 4); S.addMemory(id, `${P.name} invited me to ${inv.loc === 'home' ? 'their house' : where} (${inv.desc}). I said yes.`, { imp: 2 }); }
      else { MH.ui.toast(`${MH.CHAR[id].name} turned down the invitation`, 3); S.addMemory(id, inv.follow ? `${P.name} asked me to come along with them. I said no.` : `${P.name} invited me to ${inv.loc === 'home' ? 'their house' : where}. I said no.`, { imp: 1 }); }
    });
    res.plans.forEach((p) => {
      if (inv && inv.to.includes(p.id)) return;
      const at = planTime(p.day, p.hour);
      MH.sim.addPlan({ id: p.id, kind: p.where === 'home' ? 'visit' : 'meet', loc: p.where, at, until: at + 120, what: p.what });
      MH.ui.toast(`📅 ${MH.CHAR[p.id].name}: ${p.what} — ${p.where === 'home' ? 'your house' : MH.world.locations[p.where].name}, ${Math.floor(at / 1440) > MH.state.time.day ? 'tomorrow ' : ''}${MH.clockStr(at % 1440)}`, 4.5);
    });
    for (const id in res.follow || {}) {
      if (!MH.npcById[id]) continue;
      if (res.follow[id] === 'start' && !(inv && inv.follow && inv.to.includes(id))) MH.sim.startFollow(id);
      else if (res.follow[id] === 'stop') MH.sim.stopFollow(id, 'stops following you');
    }
    res.leave.forEach((id) => { if (MH.npcById[id] && MH.npcById[id].following) MH.sim.stopFollow(id, 'goes their own way'); chat.removeMember(id, 'walks off'); });
    if (rep && Object.keys(rep).length) MH.emit('rep', rep);
  }

  function codeJoins(c) {
    if (c.members.length >= 8) return;
    const cand = nearbyIds(c).map((id) => MH.npcById[id]).filter((e) => !e.asleep && !e.busy && MH.sim.approaching !== e);
    for (const e of cand) {
      const id = e.id, n = MH.social.npc(id);
      let p = 0;
      const att = MH.social.attitude(id);
      if (att >= 40) p += 0.1;
      const friend = c.members.some((m) => (n.rel[m] || 0) >= 50);
      const enemy = c.members.some((m) => (n.rel[m] || 0) <= -40);
      if (friend) p += 0.1;
      if (enemy) p += ['clucky', 'maggie', 'kira', 'marina', 'dionne', 'chuckles'].includes(id) ? 0.16 : 0.1;
      if (['dionne', 'chuckles', 'gertie', 'bunny'].includes(id)) p += 0.06;
      if (e.folk) p = (/gossipy|nosy/.test(e.ch.bio) ? 0.05 : 0.015);
      if (e.guest) p += 0.25;
      if (id === 'scarecrow') p = 0.04;
      if (e.ch.mute && id !== 'scarecrow') p *= 0.4;
      if (Math.random() < p) {
        const rival = enemy ? c.members.find((m) => (n.rel[m] || 0) <= -40) : null;
        const why = e.guest ? 'wanders over to join in' : enemy ? `spots ${MH.CHAR[rival].name} and marches over — there's history there` : friend ? 'notices a friend and wanders over' : id === 'scarecrow' ? 'is suddenly standing right behind everyone. Nobody saw her arrive' : 'overhears and wanders over, curious';
        chat.addMember(id, why);
        return;
      }
    }
  }

  // ------------------------------------------------------------ cast (big portraits, all the same height)
  function portraitSrc(ch) { return ch.portrait || MH.art.portraitURL(ch); }
  function renderCast() {
    const c = chat.convo; if (!c) return;
    const have = new Set();
    el.cast.querySelectorAll('.card').forEach((card) => {
      if (!c.members.includes(card.dataset.id)) { card.classList.add('leaving'); setTimeout(() => card.remove(), 380); }
      else have.add(card.dataset.id);
    });
    el.tags.querySelectorAll('.tag').forEach((t) => { if (!c.members.includes(t.dataset.id)) t.remove(); });
    c.members.forEach((id) => {
      if (have.has(id)) return;
      const ch = MH.CHAR[id];
      const card = document.createElement('div');
      card.className = 'card entering' + (ch.portrait ? ' art' : ' pixel');
      card.dataset.id = id;
      card.innerHTML = `<img alt="" draggable="false" src="${portraitSrc(ch)}"><div class="delta"></div>`;
      card.style.setProperty('--sway', (0.4 + Math.random() * 0.2).toFixed(2) + 's');
      el.cast.appendChild(card);
      const tag = document.createElement('div');
      tag.className = 'tag'; tag.dataset.id = id;
      tag.innerHTML = `<b>${MH.esc(ch.name)}</b><span class="mood"></span>`;
      tag.onclick = () => MH.ui.openProfile(id);
      el.tags.appendChild(tag);
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('entering')));
    });
    el.cast.dataset.n = Math.min(9, c.members.length);
    el.cast.querySelectorAll('.card').forEach((card) => {
      const id = card.dataset.id, n = MH.social.npc(id); if (!n) return;
      const tag = el.tags.querySelector(`.tag[data-id="${id}"]`);
      if (tag) { tag.querySelector('.mood').textContent = n.mood + ' · ' + MH.bondTier(n.bond).toLowerCase(); tag.style.setProperty('--bond', MH.bondColor(MH.social.attitude(id))); tag.classList.toggle('target', id === chat.to); }
      const ch2 = MH.CHAR[id];
      card.style.setProperty('--ps', ch2.portraitScale || 1); card.style.setProperty('--px', (ch2.portraitX || 0) + '%'); card.style.setProperty('--py', (ch2.portraitY || 0) + '%');
      card.classList.toggle('target', id === chat.to);
    });
    applyLayers();
  }
  chat.renderCast = renderCast;
  function setSpeaking(id) {
    el.cast.querySelectorAll('.card').forEach((card) => {
      const on = card.dataset.id === id;
      card.classList.toggle('speaking', on);
      if (on) card.dataset.lastSpoke = MH.now;
      card.classList.toggle('quiet', !!id && !on && MH.now - (+card.dataset.lastSpoke || 0) > 25);
    });
  }
  function floatDelta(id, d) {
    const card = el.cast.querySelector(`.card[data-id="${id}"]`);
    if (!card || !d) return;
    const f = card.querySelector('.delta');
    f.textContent = (d > 0 ? '+' : '') + d + (d > 0 ? ' ♥' : ' 💢');
    f.className = 'delta show ' + (d > 0 ? 'up' : 'down');
    setTimeout(() => (f.className = 'delta'), 1600);
  }
  chat.skip = function () { chat.skipFlag = true; for (const s of says.values()) if (s.full) s.shown = s.full.length; for (const [, b] of chat.bubbles) if (b.full) b.shown = b.full.length; };
})(window.MH);
