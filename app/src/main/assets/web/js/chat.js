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
  const cps = () => ({ slow: 30, normal: 70, fast: 140, instant: 1e6 }[MH.settings.textSpeed] || 70);

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
    el.log.onclick = () => MH.ui.toggleLog();
    el.logTop.onclick = () => MH.ui.toggleLog();
    el.toChip.onclick = () => chat.setTarget(null);
    el.quick.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => insertText(b.dataset.act + ' ')));
    el.cast.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.tag')) return;
      // pick the character whose body is nearest the tap (wide artwork overlaps neighbours)
      let card = null, bd = 1e9;
      el.cast.querySelectorAll('.card:not(.leaving)').forEach((c2) => { const r = c2.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - e.clientX); if (d < bd) { bd = d; card = c2; } });
      if (card && chat.convo && chat.convo.members.length > 1 && e.target.closest('img')) chat.setTarget(chat.to === card.dataset.id ? null : card.dataset.id);
      chat.skip();
    });
    el.says.addEventListener('pointerdown', (e) => {
      const s = e.target.closest('.say'); if (!s) return;
      s.classList.toggle('expand');
      if (chat.convo && chat.convo.members.length > 1 && s.dataset.id) chat.setTarget(s.dataset.id);
      chat.skip();
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

  chat.askLeave = async function () {
    if (!chat.active) return;
    const names = chat.convo.members.map((id) => MH.CHAR[id].name);
    const ok = await MH.ui.confirm(`Leave the conversation with ${names.length > 2 ? names.slice(0, 2).join(', ') + ' and the others' : names.join(' and ')}?`, 'Leave', 'Stay');
    if (ok) chat.end();
  };

  // who the player is talking to in a group (tap a portrait)
  chat.setTarget = function (id) {
    chat.to = id && chat.convo && chat.convo.members.includes(id) ? id : null;
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
  function cardSay(id, text) {
    const s = sayFor(id);
    s.full = text; s.shown = 0; s.born = MH.now; s.thinking = false; s.rendered = null;
    s.d.classList.remove('thinking', 'expand'); s.d.classList.add('on');
    const card = el.cast.querySelector(`.card[data-id="${id}"]`);
    if (card) card.classList.add('talking');
  }
  function cardThinking(ids, on) {
    ids.forEach((id) => {
      const s = sayFor(id);
      if (on) { s.thinking = true; s.prevBorn = s.born; s.born = MH.now + 100; s.txt.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>'; s.d.classList.add('on', 'thinking'); }
      else if (s.thinking) { s.thinking = false; s.born = s.prevBorn || 0; s.d.classList.remove('thinking'); if (s.full) s.txt.innerHTML = MH.fmt(s.full); else s.d.classList.remove('on'); }
    });
  }
  const cardTyped = (id) => { const s = says.get(id); return !s || s.shown >= s.full.length; };
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
  function layerOrder() {
    const c = chat.convo; if (!c) return [];
    const order = c.members.slice();
    if (chat.to && order.includes(chat.to)) { order.splice(order.indexOf(chat.to), 1); order.unshift(chat.to); }
    return order;
  }
  function applyLayers() {
    const order = layerOrder();
    el.cast.querySelectorAll('.card').forEach((card) => { const i = order.indexOf(card.dataset.id); card.style.zIndex = i < 0 ? 0 : 40 - i; });
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
      t.style.zIndex = 40 - Math.max(0, order.indexOf(t.dataset.id));
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
        const r = img.getBoundingClientRect();
        items.push({ s, cx: r.left + r.width / 2 - rootR.left, head: r.top - rootR.top + r.height * (card.classList.contains('art') ? 0.05 : 0.08) });
      }
      const order = layerOrder();
      const newest = items.reduce((m, it) => (it.s.born > (m ? m.s.born : -1) ? it : m), null);
      items.sort((a, b) => order.indexOf(a.s.d.dataset.id) - order.indexOf(b.s.d.dataset.id));
      const placed = [];
      items.forEach((it, i) => {
        const d = it.s.d;
        d.classList.toggle('old', i >= 2 && it !== newest && !it.s.thinking);
        d.classList.toggle('latest', it === newest && n > 1);
        d.classList.toggle('named', n > 1);
        d.style.zIndex = 50 - i;
        const w = d.offsetWidth, h = d.offsetHeight;
        const x = MH.clamp(it.cx - w / 2, 8, Math.max(8, W - w - 8));
        let y = it.head - h - 10;
        for (let k = 0; k < 10; k++) { const hit = placed.find((q) => x < q.x + q.w + 4 && x + w + 4 > q.x && y < q.y + q.h + 4 && y + h + 4 > q.y); if (!hit) break; y = hit.y - h - 6; }
        y = Math.max(46, y);
        placed.push({ x, y, w, h });
        d.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        d.style.setProperty('--tx', Math.round(MH.clamp(it.cx - x, 16, w - 16)) + 'px');
        d.classList.toggle('stacked', y < it.head - h - 16);
      });
    }
    requestAnimationFrame(layoutLoop);
  }
  function clearSays() { for (const [, s] of says) s.d.remove(); says.clear(); }

  // ------------------------------------------------------------ lifecycle
  function nearbyIds(c) {
    const room = MH.roomOf(MH.player);
    return MH.npcs.filter((e) => !e.hidden && !c.members.includes(e.id) && MH.roomOf(e) === room && Math.hypot(e.x - c.x, e.y - c.y) / T < 9 && e.busy !== 'talking').map((e) => e.id);
  }
  function center(c) {
    const ents = c.members.map((id) => MH.npcById[id]).concat([MH.player]);
    c.x = ents.reduce((s, e) => s + e.x, 0) / ents.length;
    c.y = ents.reduce((s, e) => s + e.y, 0) / ents.length;
    const portrait = window.innerHeight > window.innerWidth;
    MH.render.focus(c.x, c.y - 12 + (portrait ? MH.render.viewH() * 0.3 : MH.render.viewH() * 0.14));
  }

  chat.start = function (ids, mode, payload) {
    if (chat.active) { ids.forEach((id) => chat.addMember(id, 'joined')); return; }
    const extra = [];
    ids.forEach((id) => {
      const e = MH.npcById[id];
      if (e.busy === 'smalltalk') MH.npcs.forEach((o) => { if (o !== e && o.busy === 'smalltalk' && MH.distTiles(o, e) < 4.5 && !ids.includes(o.id)) extra.push(o.id); });
    });
    const comps = (MH.state.companions || []).filter((id) => !ids.includes(id) && !extra.includes(id) && MH.npcById[id] && MH.distTiles(MH.npcById[id], MH.player) < 10);
    const members = ids.concat(extra, comps);
    const c = { id: MH.uid(), members: [], nearby: [], lines: [], x: 0, y: 0, started: MH.absMinutes(), turn: 0, spoke: {}, joinedTurn: {} };
    chat.convo = c; chat.active = true; chat.to = null;
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
    if (mode === 'opener') chat.runTurn('opener', payload);
    else {
      const e = MH.npcById[members[0]], n = MH.social.npc(e.id);
      const why = n.met ? `${P.name} walks up to ${e.ch.name} to talk.` : `${P.name}, the newcomer, walks up to ${e.ch.name} for the first time.`;
      chat.runTurn('opener', why + (members.length > 1 ? ' (' + members.slice(1).map((m) => MH.CHAR[m].name).join(', ') + ' were already chatting with them.)' : ''));
    }
  };

  chat.addMember = function (id, how, initial) {
    const c = chat.convo; if (!c || c.members.includes(id)) return;
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
    const s = says.get(id); if (s) { s.d.remove(); says.delete(id); }
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
    chat.active = false; chat.convo = null; chat.waiting = false; chat.pendingInvite = null; chat.queued = false; chat.to = null;
    el.root.classList.add('hidden'); el.root.classList.remove('waiting');
    document.body.classList.remove('chatting');
    el.input.blur(); el.me.classList.remove('on'); chat.meB = null; el.send.classList.remove('queued');
    clearSays();
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
    chat.pendingInvite = null;
    chat.runTurn('player', text, to);
  };
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
    if (!c.members.length) { chat.end(); return; }
    c.nearby = nearbyIds(c);
    c.turn++;
    updateMustGo(c);
    setWaiting(true);
    const thinkers = to ? [to] : c.members.slice(0, 3);
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
      // let the finished line sit for a moment (longer lines a bit longer) before the next one lands
      await waitFor(MH.clamp(1.1 + l.say.length * 0.028, 1.5, 4.5));
      chat.skipFlag = false;
    }
    if (chat.convo !== c) return;
    applyEffects(c, res);
    renderCast();
    if (res.end) { setTimeout(() => chat.convo === c && chat.end(), 2600); return; }
    codeLeaves(c);
    codeJoins(c);
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
      S.changeBond(id, d); floatDelta(id, d);
      const e = MH.npcById[id];
      if (d >= 3) MH.render.burst(e.x, e.y - 22, 'heart', 5);
      if (id === 'nimbus' && d <= -2) { MH.state.weather = 'storm'; MH.state.stormUntil = MH.absMinutes() + 90; MH.render.flash = 0.35; MH.sim.vibeNow('Thunder cracks over town. Nimbus is NOT pleased.'); }
    }
    for (const id in res.mood) S.npc(id) && (S.npc(id).mood = res.mood[id]);
    for (const id in res.memory) S.addMemory(id, res.memory[id], { imp: 2, kind: 'self' });
    for (const id in res.label) { S.npc(id).label = res.label[id]; MH.ui.toast(`${MH.CHAR[id].name}: “${res.label[id]}”`); }
    const rep = S.applyRep(res.reputation, c.members);
    if (res.witness) {
      const seen = S.witness(res.witness, c.x, c.y, c.members, res.reputation);
      c.members.forEach((id) => { if (!res.memory[id]) S.addMemory(id, res.witness, { imp: 1, kind: 'self' }); });
      P.deeds.push({ t: MH.absMinutes(), text: res.witness }); if (P.deeds.length > 30) P.deeds.shift();
      if (seen.length) MH.ui.toast('👀 ' + seen.map((id) => MH.CHAR[id].name).slice(0, 3).join(', ') + (seen.length > 3 ? ' +' + (seen.length - 3) : '') + ' saw that');
    }
    res.give.forEach((g) => { S.giveItem(g.item, g.from); MH.ui.toast(`${MH.itemIcon(g.item)} Got ${g.item}${g.from && MH.CHAR[g.from] ? ' from ' + MH.CHAR[g.from].name : ''}`); });
    res.take.forEach((g) => { const it = S.takeItem(g.item); if (it) MH.ui.toast(`Gave ${it.name}${g.to && MH.CHAR[g.to] ? ' to ' + MH.CHAR[g.to].name : ''}`); });
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
