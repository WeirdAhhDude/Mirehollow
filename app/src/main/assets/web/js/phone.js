// Mirehollow — phones. Buy one for yourself, give spare phones to villagers who don't have one,
// then text them (a conversation at a distance), invite them over, and get texts back.
'use strict';
(function (MH) {
  const ph = (MH.phone = {});
  const P = () => MH.state.player;
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  ph.owners = () => (MH.state.phones = MH.state.phones || Object.fromEntries(MH.PHONE_OWNERS.map((id) => [id, true])));
  ph.has = (id) => (id === 'player' ? !!P().phone : !!ph.owners()[id]);
  ph.contacts = () => MH.CHARS.filter((c) => ph.has(c.id) && MH.social.npc(c.id).met && !c.mute);
  ph.unread = () => (MH.state.texts || []).filter((x) => !x.read).length;
  // every contact's message history (both directions), so texts are remembered
  ph.thread = (id) => {
    if (!MH.state.threads) { // older saves: turn the inbox into conversation threads
      MH.state.threads = {};
      (MH.state.texts || []).forEach((m) => { if (MH.CHAR[m.from]) (MH.state.threads[m.from] = MH.state.threads[m.from] || []).push({ from: m.from, text: m.text, t: m.t }); });
    }
    return (MH.state.threads[id] = MH.state.threads[id] || []);
  };
  ph.log = function (id, from, text) {
    const t = ph.thread(id); t.push({ from, text: String(text).slice(0, 400), t: MH.absMinutes() });
    if (t.length > 40) t.splice(0, t.length - 40);
  };
  // recent texts, written for the storyteller (used when you text again AND when you meet them in person)
  ph.recentText = function (id, maxAgeMin = 2160, n = 6) {
    const now = MH.absMinutes(), t = ph.thread(id).filter((m) => now - m.t <= maxAgeMin).slice(-n);
    if (!t.length) return '';
    const nm = MH.CHAR[id].name, pn = P().name;
    return t.map((m) => `[${MH.agoStr(m.t)}] ${m.from === 'player' ? pn : nm}: ${m.text}`).join('\n');
  };

  // a villager accepted a spare phone (from the chat's take_from_player)
  ph.give = function (id) {
    if (!MH.CHAR[id] || ph.has(id)) return false;
    ph.owners()[id] = true;
    MH.social.addMemory(id, `${P().name} gave me a phone! Now we can text.`, { imp: 3 });
    MH.social.changeBond(id, 3);
    MH.ui.toast(`📱 ${MH.CHAR[id].name} has a phone now — you can text them!`, 4);
    return true;
  };

  ph.updateHud = function () {
    const b = document.getElementById('btnPhone'); if (!b || !MH.state) return;
    b.classList.toggle('hidden', !P().phone);
    const n = ph.unread();
    b.querySelector('.badge').textContent = n || '';
    b.classList.toggle('unread', n > 0);
  };

  // start a text conversation (optionally opening with a message they sent)
  ph.text = function (id, incoming) {
    if (!P().phone) { MH.ui.toast('You need a phone first (Mirehollow Mall → Fun & Phones).'); return; }
    if (!ph.has(id)) { MH.ui.toast(`${MH.CHAR[id].name} doesn't have a phone.`); return; }
    if (MH.chat.active) { MH.ui.toast('Finish your conversation first.'); return; }
    MH.ui.closeModal();
    MH.chat.start([id], 'phone', incoming || null);
  };

  // ---------------------------------------------------------------- incoming texts
  const OFFLINE = {
    friend: ['hey!! what are you up to? 😊', 'wanna hang out later?', 'you will NOT believe what just happened', 'thinking of you :) come by sometime!'],
    neutral: ['hey. you around?', 'did you hear the gossip about the station?', 'random question: do you like cinnamon rolls'],
    hostile: ['stay out of my way.', 'I know what you did.', 'don\'t think I forgot.'],
    villain: ['Nice little house you have. Lots of windows. 🙂', 'Road toll is due, darling.', 'A friendly reminder: I never forget a debt.'],
  };
  ph.receive = function (from, text) {
    MH.state.texts = MH.state.texts || [];
    MH.state.texts.push({ id: MH.uid(), from, text: String(text).slice(0, 300), t: MH.absMinutes(), read: false });
    ph.log(from, from, text);
    if (MH.state.texts.length > 60) MH.state.texts.splice(0, MH.state.texts.length - 60);
    MH.social.log({ kind: 'sys', text: `📱 Text from ${MH.CHAR[from].name}: “${text}”` });
    MH.ui.toast(`📱 ${MH.CHAR[from].name}: ${String(text).slice(0, 60)}${text.length > 60 ? '…' : ''}`, 4.5);
    ph.updateHud();
  };
  let busy = false;
  ph.tick = async function () {
    if (!MH.state || !P().phone || busy || MH.chat.active || MH.settings.ambient === 'off') return;
    const now = MH.absMinutes();
    if (MH.state.nextText == null) MH.state.nextText = now + MH.randi(60, 180);
    if (now < MH.state.nextText) return;
    MH.state.nextText = now + MH.randi(240, 480);
    const cands = ph.contacts().filter((c) => { const e = MH.npcById[c.id]; return e && !e.following && !(e.plan && e.plan.mode === 'away') && Math.abs(MH.social.attitude(c.id)) >= 10; });
    if (!cands.length) return;
    const c = MH.pick(cands), att = MH.social.attitude(c.id);
    busy = true;
    let text = null;
    try { text = MH.ai.hasKey() ? await MH.ai.textMessage(c.id) : null; } catch (e) { text = null; }
    busy = false;
    if (!text) text = MH.pick(OFFLINE[c.bandit || c.villain ? 'villain' : att >= 25 ? 'friend' : att <= -25 ? 'hostile' : 'neutral']);
    ph.receive(c.id, text);
  };

  // ---------------------------------------------------------------- the phone screen
  ph.open = function (tab = 'msgs') {
    if (!P().phone) return;
    const body = h(`<div class="phoneui"><nav class="tabs"><button data-t="msgs">Messages</button><button data-t="contacts">Contacts</button></nav><div class="ptab"></div></div>`);
    const tb = body.querySelector('.ptab');
    const show = (t) => {
      body.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('sel', b.dataset.t === t));
      tb.innerHTML = '';
      if (t === 'msgs') {
        const threads = Object.entries(MH.state.threads || {}).filter(([id, l]) => MH.CHAR[id] && l.length).sort((a, b) => b[1][b[1].length - 1].t - a[1][a[1].length - 1].t);
        if (!threads.length) tb.appendChild(h('<p class="muted small">No messages yet. Villagers with phones text you now and then — or text them first from Contacts.</p>'));
        threads.forEach(([id, l]) => {
          const ch = MH.CHAR[id], m = l[l.length - 1];
          const unread = (MH.state.texts || []).filter((x) => x.from === id && !x.read);
          const row = h(`<button class="msg ${unread.length ? 'new' : ''}"><img src="${ch.portrait || MH.art.portraitURL(ch)}"><span><b>${MH.esc(ch.name)}</b>${unread.length ? ` <em class="ub">${unread.length}</em>` : ''} <i>${MH.esc(MH.agoStr(m.t))}</i><br>${m.from === 'player' ? 'You: ' : ''}${MH.esc(m.text.slice(0, 90))}</span></button>`);
          row.onclick = () => { unread.forEach((x) => (x.read = true)); ph.updateHud(); ph.text(id); };
          tb.appendChild(row);
        });
      } else {
        const met = MH.CHARS.filter((c) => MH.social.npc(c.id).met && !c.mute);
        if (!met.length) tb.appendChild(h('<p class="muted small">Meet some villagers first!</p>'));
        met.sort((a, b) => ph.has(b.id) - ph.has(a.id)).forEach((c) => {
          const has = ph.has(c.id);
          const row = h(`<div class="contact ${has ? '' : 'nophone'}"><img src="${c.portrait || MH.art.portraitURL(c)}"><span><b>${MH.esc(c.name)}</b><br><small>${has ? MH.bondTier(MH.social.npc(c.id).bond) : '📵 no phone — give them a spare phone'}</small></span>${has ? '<button class="btn small">💬 Text</button>' : ''}</div>`);
          const b = row.querySelector('button'); if (b) b.onclick = () => ph.text(c.id);
          tb.appendChild(row);
        });
      }
    };
    body.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => show(b.dataset.t)));
    MH.ui.modal('📱 Phone', body);
    show(tab);
  };
})(window.MH);
