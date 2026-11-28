// Mirehollow — HUD, menus, journal, settings, title & character creation, toasts, captions.
'use strict';
(function (MH) {
  const ui = (MH.ui = { modalOpen: false, logOpen: false });
  const $ = (s) => document.querySelector(s);
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const WEATHER_ICON = { sunny: '☀️', cloudy: '⛅', rain: '🌧️', storm: '⛈️' };

  ui.init = function () {
    // tap A: interact · hold A: act/shout to the world on your own (the narrator answers, people may come over)
    const btnA = $('#btnA'); let holdT = null, held = false;
    btnA.addEventListener('pointerdown', () => { held = false; btnA.classList.add('holding'); clearTimeout(holdT); holdT = setTimeout(() => { held = true; btnA.classList.remove('holding'); if (!MH.chat.active) MH.chat.startSolo(); }, 600); });
    const release = () => { clearTimeout(holdT); btnA.classList.remove('holding'); };
    btnA.addEventListener('pointerup', release); btnA.addEventListener('pointerleave', release); btnA.addEventListener('pointercancel', release);
    btnA.addEventListener('click', () => { if (held) { held = false; return; } MH.sim.interact(); });
    btnA.addEventListener('contextmenu', (e) => e.preventDefault());
    $('#btnJournal').onclick = () => ui.openJournal();
    $('#btnLog').onclick = () => ui.toggleLog();
    $('#btnMenu').onclick = () => ui.openMenu();
    $('#logClose').onclick = () => ui.toggleLog(false);
    $('#jobPill').onclick = () => ui.openJournal('jobs');
    $('#btnPhone').onclick = () => MH.phone.open();
    MH.on('target', (t) => {
      const b = $('#btnA');
      b.classList.toggle('on', !!t);
      $('#btnALabel').textContent = t ? t.label : '';
    });
    MH.on('vibe', (text) => ui.vibe(text));
    MH.on('companions', renderParty);
    MH.on('log', (entry) => { if (ui.logOpen) appendLog(entry); });
    MH.on('tier', ({ id, to, up }) => ui.toast(`${up ? '💖' : '💔'} ${MH.CHAR[id].name} now sees you as: ${to}`, 4));
    MH.on('ai-error', () => {});
    MH.on('newday', ({ gatherings }) => {
      ui.vibe(`A new day in Mirehollow — ${MH.WEEKDAYS[MH.weekday()]}. ${gatherings.length ? 'Today: ' + gatherings.map((g) => g.name).join(', ') + '.' : ''}`);
      MH.save();
    });
    MH.on('key', (e) => {
      if (ui.modalOpen || MH.chat.active) { if (e.key === 'Escape') ui.back(); return; }
      const k = e.key.toLowerCase();
      if (k === 'e' || k === ' ' || k === 'enter') MH.sim.interact();
      else if (k === 'q') MH.chat.startSolo();
      else if (k === 'j') ui.openJournal();
      else if (k === 'l') ui.toggleLog();
      else if (k === 'escape') ui.openMenu();
    });
    setInterval(updateHud, 500);
  };

  // villagers following you, shown under the clock — tap one to send them off
  function renderParty() {
    const box = $('#party'); if (!box || !MH.state) return;
    box.innerHTML = '';
    (MH.state.companions || []).forEach((id) => {
      const ch = MH.CHAR[id]; if (!ch) return;
      const b = h(`<button class="pmember" title="${MH.esc(ch.name)}"><img src="${ch.portrait || MH.art.portraitURL(ch)}" class="${ch.portrait ? 'art' : ''}"><span>${MH.esc(ch.name.split(' ')[0])}</span></button>`);
      b.onclick = async () => { if (await ui.confirm(`Tell ${ch.name} to stop following you?`, 'Stop following', 'Keep them')) { MH.social.addMemory(id, `${MH.state.player.name} told me I could go.`, { imp: 1 }); MH.sim.stopFollow(id, 'waves and heads off'); } };
      box.appendChild(b);
    });
  }
  ui.renderParty = renderParty;

  function updateHud() {
    if (!MH.state) return;
    $('#hudTime').textContent = `${MH.WEEKDAYS[MH.weekday()].slice(0, 3)} ${MH.clockStr()}`;
    $('#hudDay').textContent = `Day ${MH.state.time.day + 1} ${WEATHER_ICON[MH.state.weather] || ''}`;
    $('#hudPlace').textContent = MH.cap(MH.world.placeAt(MH.player.x, MH.player.y).name.replace(/^the player's/i, 'your').replace(/^the /, ''));
    $('#hudCoins').textContent = '🪙 ' + MH.state.player.coins;
    // sneaking: a reminder that you're somewhere you shouldn't be
    const sn = MH.state.player.sneak, sneaking = sn && !sn.invited && MH.roomOf(MH.player) === sn.room && !MH.chat.active;
    let sp = $('#sneakPill');
    if (!sp) { sp = document.createElement('div'); sp.id = 'sneakPill'; sp.className = 'pill sneak hidden'; $('#jobPill').after(sp); }
    sp.textContent = sn && sn.caught ? '🚨 Caught sneaking!' : '🤫 Sneaking — walk, don\'t run';
    sp.classList.toggle('hidden', !sneaking && !(sn && sn.caught && MH.roomOf(MH.player) === sn.room && !MH.chat.active));
    $('#hudAi').classList.toggle('off', !MH.ai.hasKey());
    $('#hudAi').title = MH.ai.hasKey() ? 'AI connected: ' + MH.settings.model : 'Offline mode (add an OpenRouter key in Settings)';
  }
  ui.updateHud = updateHud;

  // ------------------------------------------------------------ toasts & captions
  ui.toast = function (text, secs = 2.8) {
    const t = h(`<div class="toast">${MH.esc(text)}</div>`);
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), secs * 1000);
    setTimeout(() => t.remove(), secs * 1000 + 500);
    const all = $('#toasts').children; if (all.length > 4) all[0].remove();
  };
  let vibeTimer = null;
  ui.vibe = function (text) {
    const v = $('#vibe');
    v.textContent = text; v.classList.add('show');
    clearTimeout(vibeTimer);
    vibeTimer = setTimeout(() => v.classList.remove('show'), 5200);
    MH.social.log({ kind: 'vibe', text });
  };
  ui.narrate = function (text) {
    const v = $('#narr');
    v.innerHTML = MH.fmt(text); v.classList.add('show');
    clearTimeout(ui._narrT);
    ui._narrT = setTimeout(() => v.classList.remove('show'), 4000 + text.length * 40);
  };

  // ------------------------------------------------------------ modal framework
  ui.modal = function (title, bodyEl, opts = {}) {
    ui.closeModal();
    const m = h(`<div class="modal ${opts.cls || ''}"><div class="sheet"><header><h2>${title}</h2><button class="x" aria-label="Close">✕</button></header><div class="body"></div></div></div>`);
    m.querySelector('.body').appendChild(bodyEl);
    m.querySelector('.x').onclick = () => (opts.onClose ? opts.onClose() : ui.closeModal());
    if (opts.noClose) m.querySelector('.x').remove();
    // tapping the dark backdrop closes simple pop-ups, but never forms (Settings, party planner…) —
    // a stray tap or scroll at the edge used to make those vanish.
    m.addEventListener('pointerdown', (e) => { if (e.target === m && !opts.noClose && !opts.keep && !m.querySelector('input,select,textarea')) ui.closeModal(); });
    // keep focused inputs visible above the soft keyboard
    m.addEventListener('focusin', (e) => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) setTimeout(() => { try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) {} }, 350); });
    $('#modals').appendChild(m);
    ui.modalOpen = true;
    return m;
  };
  ui.closeModal = function () {
    $('#modals').innerHTML = '';
    ui.modalOpen = false;
  };
  ui.back = function () {
    if (ui.confirmOpen) { const c = document.getElementById('confirmBox'); if (c) c.querySelector('[data-v="0"]').click(); return true; }
    if (ui.giveOpen) { ui.closeGivePicker(); return true; }
    if (ui.modalOpen && !ui.lockModal) { ui.closeModal(); return true; }
    if (ui.logOpen) { ui.toggleLog(false); return true; }
    if (MH.chat.active) { MH.chat.askLeave(); return true; }
    if (MH.state && !ui.lockModal) { ui.openMenu(); return true; }
    return false;
  };

  // ------------------------------------------------------------ log panel
  function logEntryEl(e) {
    if (e.kind === 'line') {
      const isP = e.who === 'player';
      const name = isP ? MH.state.player.name : MH.CHAR[e.who] ? MH.CHAR[e.who].name : e.who;
      const col = isP ? '#8ad0ff' : MH.CHAR[e.who] ? MH.shade(MH.CHAR[e.who].look.top || '#ccc', 1.25) : '#ddd';
      return h(`<div class="le line ${isP ? 'me' : ''}"><b style="color:${col}">${MH.esc(name)}</b> ${MH.fmt(e.text)}</div>`);
    }
    if (e.kind === 'overheard') {
      const d = h(`<div class="le over"><div class="oh">👂 Overheard: ${MH.esc(e.text)}</div></div>`);
      (e.lines || []).forEach((l) => d.appendChild(h(`<div class="ol"><b>${MH.esc(MH.CHAR[l.who] ? MH.CHAR[l.who].name : l.who)}</b> ${MH.fmt(l.say)}</div>`)));
      return d;
    }
    if (e.kind === 'narr') return h(`<div class="le narr">${MH.fmt(e.text)}</div>`);
    if (e.kind === 'vibe') return h(`<div class="le vibe">✦ ${MH.esc(e.text)}</div>`);
    return h(`<div class="le sys">${MH.esc(e.text)} <i>${MH.esc(MH.agoStr(e.t))}</i></div>`);
  }
  function appendLog(entry) {
    const list = $('#logList');
    list.appendChild(logEntryEl(entry));
    while (list.children.length > 300) list.firstChild.remove();
    list.scrollTop = list.scrollHeight;
  }
  ui.toggleLog = function (force) {
    ui.logOpen = force != null ? force : !ui.logOpen;
    $('#logPanel').classList.toggle('open', ui.logOpen);
    if (ui.logOpen) {
      const list = $('#logList');
      list.innerHTML = '';
      MH.state.log.slice(-200).forEach((e) => list.appendChild(logEntryEl(e)));
      list.scrollTop = list.scrollHeight;
    }
  };

  // ------------------------------------------------------------ give picker (in chat)
  ui.openGivePicker = function () {
    const P = MH.state.player;
    const c = MH.chat.convo; if (!c) return;
    ui.closeGivePicker();
    const box = h(`<div id="givePicker" class="picker"><div class="ph">Give something to…</div><div class="who"></div><div class="items"></div></div>`);
    let target = c.members[0];
    const who = box.querySelector('.who');
    c.members.forEach((id) => {
      const b = h(`<button class="chip ${id === target ? 'sel' : ''}">${MH.esc(MH.CHAR[id].name)}</button>`);
      b.onclick = () => { target = id; who.querySelectorAll('.chip').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); };
      who.appendChild(b);
    });
    const items = box.querySelector('.items');
    if (!P.inv.length) items.appendChild(h(`<div class="empty">Your pocket is empty. Pick flowers, forage, or ask villagers for things.</div>`));
    P.inv.forEach((it) => {
      const b = h(`<button class="item">${it.icon} ${MH.esc(it.name)}</button>`);
      b.onclick = () => { MH.chat.insertText(`*gives ${MH.CHAR[target].name} the ${it.name}* `); ui.closeGivePicker(); };
      items.appendChild(b);
    });
    const coin = h(`<button class="item">🪙 Pay coins…</button>`);
    coin.onclick = () => { MH.chat.insertText(`*hands ${MH.CHAR[target].name} 5 coins* `); ui.closeGivePicker(); };
    items.appendChild(coin);
    document.getElementById('chat').appendChild(box);
    ui.giveOpen = true;
  };
  ui.closeGivePicker = function () { const g = $('#givePicker'); if (g) g.remove(); ui.giveOpen = false; };

  // ------------------------------------------------------------ journal
  ui.openJournal = function (tab = 'villagers') {
    const body = h(`<div class="journal"><nav class="tabs"><button data-t="villagers">Villagers</button><button data-t="plans">Plans</button><button data-t="quests">Favours</button><button data-t="jobs">Jobs</button><button data-t="you">You</button><button data-t="pocket">Pocket</button><button data-t="town">Map</button></nav><div class="tabbody"></div></div>`);
    const tb = body.querySelector('.tabbody');
    const show = (t) => {
      body.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('sel', b.dataset.t === t));
      tb.innerHTML = '';
      tb.appendChild(({ villagers: tabVillagers, plans: tabPlans, quests: () => MH.quests.tabEl(), jobs: () => MH.jobs.boardEl(null, () => show('jobs')), you: tabYou, pocket: tabPocket, town: tabTown })[t]());
      const sel = body.querySelector('.tabs .sel'); if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
    };
    body.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => show(b.dataset.t)));
    ui.modal('Journal', body, { cls: 'wide' });
    show(tab);
  };

  function tabVillagers() {
    const wrap = h(`<div><div class="vgrid main"></div><h4>Townsfolk you've met</h4><div class="vgrid folk"></div></div>`);
    const grid = wrap.querySelector('.main');
    const folkMet = MH.FOLK.filter((c) => MH.social.npc(c.id).met);
    if (!folkMet.length) wrap.querySelector('.folk').appendChild(h(`<p class="muted small">Nobody yet — say hi to the passers-by around town.</p>`));
    const order = MH.CHARS.slice().sort((a, b) => (MH.social.npc(b.id).met - MH.social.npc(a.id).met) || MH.social.attitude(b.id) - MH.social.attitude(a.id));
    const addCard = (ch, target) => {
      const n = MH.social.npc(ch.id), att = MH.social.attitude(ch.id);
      const card = h(`<button class="vcard ${n.met ? '' : 'unmet'}"><div class="pimg ${ch.portrait ? 'art' : 'pixel'}"><img src="${ch.portrait || MH.art.portraitURL(ch)}"></div><div class="vinfo"><b>${MH.esc(ch.name)}</b><small>${n.met ? MH.bondTier(n.bond) + (n.label ? ' · ' + MH.esc(n.label) : '') : 'Not met yet'}</small><span class="bar"><i style="width:${Math.round((att + 100) / 2)}%;background:${MH.bondColor(att)}"></i></span></div></button>`);
      card.onclick = () => ui.openProfile(ch.id);
      target.appendChild(card);
    };
    order.forEach((ch) => addCard(ch, grid));
    folkMet.forEach((ch) => addCard(ch, wrap.querySelector('.folk')));
    return wrap;
  }

  function tabPlans() {
    const st = MH.state, now = MH.absMinutes();
    const when = (at) => { const d = Math.floor(at / 1440) - st.time.day; return (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : MH.WEEKDAYS[Math.floor(at / 1440) % 7]) + ' ' + MH.clockStr(at % 1440); };
    const plans = (st.plans || []).filter((p) => p.until > now && p.kind !== 'party').sort((a, b) => a.at - b.at);
    const parties = (st.parties || []).filter((p) => p.status !== 'done');
    const d = h(`<div class="plans">
      <h4>Your parties</h4><div class="pl-parties"></div>
      <h4>Appointments</h4><ul class="mems">${plans.length ? plans.map((p) => `<li><b>${when(p.at)}</b> · ${MH.esc(MH.CHAR[p.id].name)} — ${p.loc === 'home' ? 'visiting your house' : MH.esc(p.what || 'meeting you') + ' at ' + MH.esc(MH.world.locations[p.loc].name)}${p.arrived ? ' ✔' : ''}</li>`).join('') : '<li class="muted">Nothing planned. Invite someone with 🏠 while chatting, or arrange to meet somewhere.</li>'}</ul>
      <h4>Town gatherings (anyone can join)</h4><ul class="mems">${MH.GATHERINGS.slice().sort((a, b) => ((a.day - MH.weekday() + 7) % 7) - ((b.day - MH.weekday() + 7) % 7)).map((g) => `<li><b>${MH.WEEKDAYS[g.day]}</b> ${g.from}:00–${g.to}:00 · ${MH.esc(g.name)} <i>(${MH.esc(MH.world.locations[g.at].name)})</i></li>`).join('')}</ul>
      <div class="row"><button class="btn small" id="plParty">🎉 Plan a party</button></div></div>`);
    const pp = d.querySelector('.pl-parties');
    if (!parties.length) pp.appendChild(h(`<p class="muted small">No parties planned. Use the notebook on your low table at home (or the button below).</p>`));
    parties.forEach((p) => {
      const yes = p.invited.filter((id) => p.rsvp[id] === 'yes'), no = p.invited.filter((id) => p.rsvp[id] === 'no'), pend = p.invited.filter((id) => p.rsvp[id] === 'pending');
      pp.appendChild(h(`<div class="party-card"><b>${MH.esc(p.theme || 'Party')}</b> · ${when(p.at)} · ${p.loc === 'home' ? 'your house' : MH.esc(MH.world.locations[p.loc].name)} ${p.status === 'active' ? '<span class="live">LIVE</span>' : ''}
        <div class="small">✅ ${yes.map((id) => MH.esc(MH.CHAR[id].name)).join(', ') || '—'}</div><div class="small muted">❌ ${no.map((id) => MH.esc(MH.CHAR[id].name)).join(', ') || '—'} ${pend.length ? '· ⏳ ' + pend.map((id) => MH.esc(MH.CHAR[id].name)).join(', ') : ''}</div>
        ${p.notes ? `<ul class="mems small">${Object.entries(p.notes).map(([id, n]) => `<li><b>${MH.esc(MH.CHAR[id].name)}:</b> “${MH.esc(n)}”</li>`).join('')}</ul>` : ''}</div>`));
    });
    d.querySelector('#plParty').onclick = () => ui.openPartyPlanner();
    return d;
  }

  // ------------------------------------------------------------ challenge someone (from the chat bar)
  ui.openFightPicker = function () {
    const c = MH.chat.convo; if (!c || c.phone) { ui.toast('You can\'t fight over the phone.'); return; }
    if (MH.fight.inCombat(c)) { const t = MH.chat.to && MH.fight.alive(c).some((x) => x.id === MH.chat.to) ? MH.chat.to : (MH.fight.alive(c)[0] || {}).id; if (t) MH.chat.insertText(`*attacks ${MH.CHAR[t].name}* `); return; }
    ui.closeGivePicker();
    const box = h(`<div id="givePicker" class="picker"><div class="ph">Fight…</div><div class="who"></div><div class="row"><button class="btn small ghost" id="fpSpar">🤝 Friendly spar</button><button class="btn small danger" id="fpReal">⚔️ Fight for real</button></div><p class="muted small">Sparring is friendly (some villagers love it). A real fight is violence: people will remember. Equip a weapon from your Pocket first if you have one.</p></div>`);
    let target = chat_to_or_first();
    function chat_to_or_first() { return MH.chat.to && c.members.includes(MH.chat.to) ? MH.chat.to : c.members[0]; }
    const who = box.querySelector('.who');
    c.members.forEach((id) => {
      const b = h(`<button class="chip ${id === target ? 'sel' : ''}">${MH.esc(MH.CHAR[id].name)} <small>(${MH.fight.DIFF[MH.clamp(MH.fight.power(id), 1, 5)]})</small></button>`);
      b.onclick = () => { target = id; who.querySelectorAll('.chip').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); };
      who.appendChild(b);
    });
    box.querySelector('#fpSpar').onclick = () => { c.challenge = { with: target, kind: 'spar' }; MH.chat.insertText(`*challenges ${MH.CHAR[target].name} to a friendly sparring match* `); ui.closeGivePicker(); };
    box.querySelector('#fpReal').onclick = () => { c.challenge = { with: target, kind: 'brawl' }; MH.chat.insertText(`*squares up to fight ${MH.CHAR[target].name} for real* `); ui.closeGivePicker(); };
    document.getElementById('chat').appendChild(box);
    ui.giveOpen = true;
  };

  // ------------------------------------------------------------ challenge someone to a game (from the chat bar)
  ui.openPlayPicker = function () {
    const c = MH.chat.convo; if (!c) return;
    if (c.phone) { ui.toast('Games need you in the same place.'); return; }
    ui.closeGivePicker();
    const box = h(`<div id="givePicker" class="picker"><div class="ph">Play a game with…</div><div class="who"></div><div class="ph2">Game</div><div class="opts gamec"></div><div class="ph2">Bet</div><div class="opts betc"></div><div class="row"><button class="btn small" id="gpGo">Challenge them</button></div></div>`);
    let target = MH.chat.to && c.members.includes(MH.chat.to) ? MH.chat.to : c.members[0], game = 'connect4', bet = 0;
    const chips = (cont, arr, get, set) => arr.forEach(([v, label]) => { const b = h(`<button class="chip ${get() === v ? 'sel' : ''}">${label}</button>`); b.onclick = () => { set(v); cont.querySelectorAll('.chip').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); }; cont.appendChild(b); });
    chips(box.querySelector('.who'), c.members.map((id) => [id, MH.esc(MH.CHAR[id].name)]), () => target, (v) => (target = v));
    chips(box.querySelector('.gamec'), [['connect4', '🔴 Connect 4'], ['memory', '🃏 Memory'], ['math', '🧮 Math duel'], ['rps', '✊ Rock-paper-scissors'], ['quiz', '❓ Quiz me']], () => game, (v) => (game = v));
    chips(box.querySelector('.betc'), [[0, 'Just for fun'], [5, '5 🪙'], [20, '20 🪙']], () => bet, (v) => (bet = v));
    box.querySelector('#gpGo').onclick = () => {
      if (bet > MH.state.player.coins) { ui.toast('You don\'t have that many coins.'); return; }
      c.gameChallenge = { with: target, game, stakes: bet };
      const G2 = { connect4: 'a game of Connect 4', memory: 'a memory card duel', math: 'a math duel', rps: 'rock-paper-scissors', quiz: 'quiz me on something' };
      MH.chat.insertText(game === 'quiz' ? `*asks ${MH.CHAR[target].name} to ${G2[game]}${bet ? ' (' + bet + ' coins on it)' : ''}* ` : `*challenges ${MH.CHAR[target].name} to ${G2[game]}${bet ? ' — ' + bet + ' coins on it' : ''}* `);
      ui.closeGivePicker();
    };
    document.getElementById('chat').appendChild(box);
    ui.giveOpen = true;
  };

  // ------------------------------------------------------------ invitations (from the chat bar)
  ui.openInvitePicker = function () {
    const c = MH.chat.convo; if (!c) return;
    ui.closeGivePicker();
    const box = h(`<div id="givePicker" class="picker"><div class="ph">Invite…</div><div class="who"></div>
      <div class="ph2">Where</div><div class="opts wherec"></div><div class="ph2">When</div><div class="opts whenc"></div>
      <div class="row"><button class="btn small" id="invGo">Write the invitation</button></div></div>`);
    const sel = new Set([c.members[0]]);
    const who = box.querySelector('.who');
    c.members.forEach((id) => {
      const b = h(`<button class="chip ${sel.has(id) ? 'sel' : ''}">${MH.esc(MH.CHAR[id].name)}</button>`);
      b.onclick = () => { sel.has(id) ? sel.delete(id) : sel.add(id); b.classList.toggle('sel'); };
      who.appendChild(b);
    });
    const WHERE = [['home', 'My house'], ['pond', 'The pond'], ['park', 'The park'], ['river', 'The river'], ['shrine', 'The shrine'], ['station', 'The station'], ['square', 'The square'], ['sunflowers', 'Sunflowers'], ['bakery', 'The bakery']];
    const now = MH.absMinutes(), day = MH.state.time.day, hr = MH.hour();
    const WHEN = [['follow', '🚶 Come with me now', now], ['now', 'Right now', now + 5], ['1h', 'In an hour', now + 60]];
    if (hr < 18) WHEN.push(['tonight', 'Tonight 19:00', day * 1440 + 19 * 60]);
    WHEN.push(['tm10', 'Tomorrow 10:00', (day + 1) * 1440 + 600], ['tm15', 'Tomorrow 15:00', (day + 1) * 1440 + 900], ['tm19', 'Tomorrow 19:00', (day + 1) * 1440 + 1140]);
    let where = 'home', whenI = 1;
    const mk = (cont, arr, get, set) => arr.forEach((o, i) => { const b = h(`<button class="chip ${get() === (o[0]) ? 'sel' : ''}">${o[1]}</button>`); b.onclick = () => { set(o[0], i); cont.querySelectorAll('.chip').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); }; cont.appendChild(b); });
    mk(box.querySelector('.wherec'), WHERE, () => where, (v) => (where = v));
    mk(box.querySelector('.whenc'), WHEN, () => WHEN[whenI][0], (v, i) => (whenI = i));
    box.querySelector('#invGo').onclick = () => {
      if (!sel.size) return;
      const to = [...sel], w = WHEN[whenI], at = w[2];
      const place = WHERE.find((x) => x[0] === where)[1].toLowerCase();
      const names = to.map((id) => MH.CHAR[id].name).join(' and ');
      if (w[0] === 'follow') {
        MH.chat.setPendingInvite({ to, loc: 'follow', at, desc: 'to come along with the player right now (follow them around)', what: 'come along', follow: true }, `*asks ${names} to come along with me*`);
        ui.closeGivePicker(); return;
      }
      const whenTxt = w[0] === 'now' ? 'right now' : w[1].toLowerCase().replace(/ (\d)/, ' at $1');
      const desc = where === 'home' ? `over to the player's house ${whenTxt}` : `to meet at ${place} ${whenTxt}`;
      MH.chat.setPendingInvite({ to, loc: where, at, desc, what: where === 'home' ? 'visit' : 'hang out' }, where === 'home' ? `*invites ${names} over to my place ${whenTxt}*` : `*invites ${names} to meet at ${place} ${whenTxt}*`);
      ui.closeGivePicker();
    };
    document.getElementById('chat').appendChild(box);
    ui.giveOpen = true;
  };

  // ------------------------------------------------------------ party planner
  ui.openPartyPlanner = function () {
    const met = MH.ALL.filter((c) => MH.social.npc(c.id).met && !c.visitor);
    const body = h(`<div class="form party">
      <p class="muted small">Write invitations and Mailman Mole will deliver them (mostly to the right houses). Replies trickle back over the next hour or so.</p>
      <label>Theme</label><input id="pTheme" maxlength="40" placeholder="e.g. pajama movie night, karaoke, tea party">
      <label>Where</label><div class="opts" id="pWhere"></div>
      <label>When</label><div class="row"><select id="pDay"><option value="0">Today</option><option value="1">Tomorrow</option><option value="2">In two days</option></select><select id="pHour"></select></div>
      <label>Guests <small>(${met.length} you've met)</small></label><div class="row wrap"><button class="btn small ghost" id="pAll">Everyone I know</button><button class="btn small ghost" id="pNone">Clear</button></div>
      <div class="guestlist"></div>
      <div class="row"><button class="btn big" id="pGo">Send invitations 💌</button></div></div>`);
    const hours = body.querySelector('#pHour');
    for (let hh = 10; hh <= 22; hh++) hours.appendChild(h(`<option value="${hh}" ${hh === 19 ? 'selected' : ''}>${hh}:00</option>`));
    let where = 'home';
    [['home', 'My house'], ['park', 'The park'], ['pond', 'The pond'], ['river', 'The river'], ['sunflowers', 'Sunflower field'], ['shrine', 'The shrine']].forEach(([k, n]) => {
      const b = h(`<button class="chip ${k === where ? 'sel' : ''}">${n}</button>`);
      b.onclick = () => { where = k; body.querySelectorAll('#pWhere .chip').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); };
      body.querySelector('#pWhere').appendChild(b);
    });
    const sel = new Set();
    const gl = body.querySelector('.guestlist');
    if (!met.length) gl.appendChild(h(`<p class="muted small">You haven't met anyone yet! Go say hi first.</p>`));
    met.forEach((c) => {
      const b = h(`<button class="chip">${MH.esc(c.name)}</button>`);
      b.onclick = () => { sel.has(c.id) ? sel.delete(c.id) : sel.add(c.id); b.classList.toggle('sel'); };
      b.dataset.id = c.id; gl.appendChild(b);
    });
    body.querySelector('#pAll').onclick = () => gl.querySelectorAll('.chip').forEach((b) => { sel.add(b.dataset.id); b.classList.add('sel'); });
    body.querySelector('#pNone').onclick = () => { sel.clear(); gl.querySelectorAll('.chip').forEach((b) => b.classList.remove('sel')); };
    body.querySelector('#pGo').onclick = () => {
      if (!sel.size) { ui.toast('Pick at least one guest.'); return; }
      const dayOffset = +body.querySelector('#pDay').value, hour = +body.querySelector('#pHour').value;
      if (dayOffset === 0 && hour <= MH.hour()) { ui.toast('That time has already passed today.'); return; }
      MH.sim.hostParty({ dayOffset, hour, loc: where, theme: body.querySelector('#pTheme').value.trim(), invited: [...sel] });
      ui.closeModal();
      ui.toast('💌 Invitations sent!', 3);
    };
    ui.modal('🎉 Plan a party', body, { keep: true });
  };

  ui.openProfile = function (id) {
    const ch = MH.CHAR[id], n = MH.social.npc(id), att = MH.social.attitude(id);
    const e = MH.npcById[id];
    const where = e.hidden ? (e.plan && e.plan.mode === 'away' ? 'Not in town today' : 'Indoors') : MH.cap(MH.world.placeAt(e.x, e.y).name) + (e.asleep ? ' (asleep)' : '');
    const mems = n.memories.filter((m) => m.about === 'player').slice(-10).reverse();
    const rels = Object.entries(n.rel).filter(([k]) => MH.CHAR[k]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);
    const body = h(`<div class="profile">
      <div class="phead"><div class="pimg big ${ch.portrait ? 'art' : 'pixel'}"><img src="${ch.portrait || MH.art.portraitURL(ch)}"></div>
      <div class="pmeta"><h3>${MH.esc(ch.name)}</h3><div class="ptitle">${MH.esc(ch.title)} · ${MH.esc(ch.species)}</div>
      <div class="pstat"><span>Feels:</span> <b style="color:${MH.bondColor(n.bond)}">${MH.bondTier(n.bond)}</b> (${n.bond})${n.label ? ' · <i>' + MH.esc(n.label) + '</i>' : ''}</div>
      <div class="pstat"><span>Reputation:</span> ${MH.esc(MH.cap(MH.social.opinionWords(id)))} (${MH.social.repOpinion(id) >= 0 ? '+' : ''}${MH.social.repOpinion(id)})</div>
      <div class="pstat"><span>Overall:</span> <span class="bar inline"><i style="width:${Math.round((att + 100) / 2)}%;background:${MH.bondColor(att)}"></i></span> ${att}</div>
      <div class="pstat"><span>Mood:</span> ${MH.esc(n.mood)}</div></div></div>
      ${n.met ? `<p class="pbio">${MH.esc(ch.bio.split('. ').slice(0, 3).join('. '))}.</p>` : `<p class="pbio muted">You haven't met ${MH.esc(ch.name)} yet. Maybe say hi?</p>`}
      <h4>What ${MH.esc(ch.name)} remembers about you</h4>
      <ul class="mems">${mems.length ? mems.map((m) => `<li><i>${MH.esc(MH.agoStr(m.t))}</i> ${MH.esc(m.text)}</li>`).join('') : '<li class="muted">Nothing yet.</li>'}</ul>
      ${n.met && rels.length ? `<h4>Their relationships</h4><div class="rels">${rels.map(([k, v]) => `<span class="rel" style="border-color:${MH.bondColor(v)}">${MH.esc(MH.CHAR[k].name)} ${v > 0 ? '+' : ''}${v}</span>`).join('')}</div>` : ''}
      <div class="row" style="margin-top:14px"><button class="btn small" id="pEdit">✏️ Edit character & portrait</button></div>
    </div>`);
    body.querySelector('#pEdit').onclick = () => ui.openCharEditor(id);
    ui.modal(MH.esc(ch.name), body);
  };

  // ------------------------------------------------------------ character editor (what the AI reads + portrait)
  ui.openCharEditor = function (id) {
    const ch = MH.CHAR[id], ed = MH.charEdits[id] || {};
    const relText = Object.entries(ch.relations || {}).filter(([k]) => MH.CHAR[k]).map(([k, v]) => `${MH.CHAR[k].name}: ${v[1]}`).join('\n');
    const body = h(`<div class="form editor">
      <div class="pe-prev"><div class="pe-stage"><img alt=""></div><div class="pe-line"></div></div>
      <div class="row wrap"><label class="btn small" id="peUploadL">📷 Upload portrait<input type="file" id="peUpload" accept="image/*" hidden></label><button class="btn small ghost" id="peNoPic">Remove custom portrait</button></div>
      <label>Portrait size <small id="pesV"></small></label><input type="range" id="peS" min="0.4" max="1.8" step="0.02">
      <label>Move up / down <small id="peyV"></small></label><input type="range" id="peY" min="-45" max="45" step="1">
      <label>Move left / right <small id="pexV"></small></label><input type="range" id="peX" min="-45" max="45" step="1">
      <p class="muted small">The dashed line is roughly where speech bubbles sit (over the head).</p>
      <h4>What the AI knows about ${MH.esc(ch.name)}</h4>
      <div class="autofill"><label>✨ Auto-fill with AI <small>(describe them in your own words — the AI rewrites every box below to match)</small></label>
        <textarea id="peAuto" rows="3" placeholder="e.g. a grumpy retired pirate otter who runs the bait shop, secretly writes poetry and has a crush on Marina…"></textarea>
        <div class="row wrap"><button class="btn small" id="peAutoGo">✨ Fill all boxes</button><label class="toggle small"><input type="checkbox" id="peKeepName" checked> keep the current name</label></div>
        <p class="muted small" id="peAutoMsg">Nothing is saved until you tap Save, so you can try again.</p></div>
      <label>Name</label><input id="peName" maxlength="40">
      <label>Title</label><input id="peTitle" maxlength="60">
      <label>Species</label><input id="peSpecies" maxlength="80">
      <label>Personality, looks & backstory</label><textarea id="peBio" rows="9"></textarea>
      <label>How they talk</label><textarea id="peVoice" rows="3"></textarea>
      <label>Quirks <small>(comma separated)</small></label><input id="peQuirks">
      <label>Relationships <small>(one per line — Name: how they feel)</small></label><textarea id="peRel" rows="5"></textarea>
      <label>Extra notes for the AI <small>(anything else: secrets, current goals, running jokes…)</small></label><textarea id="peNotes" rows="4"></textarea>
      <div class="row wrap"><button class="btn small ghost" id="pePreview">👁 Preview what the AI reads</button></div>
      <pre class="pe-ai hidden"></pre>
      <div class="row wrap"><button class="btn" id="peSave">Save</button><button class="btn small danger" id="peReset">Reset to original</button></div>
    </div>`);
    const $b = (q) => body.querySelector(q);
    $b('#peName').value = ch.name; $b('#peTitle').value = ch.title || ''; $b('#peSpecies').value = ch.species || '';
    $b('#peBio').value = ch.bio || ''; $b('#peVoice').value = ch.voice || ''; $b('#peQuirks').value = (ch.quirks || []).join(', ');
    $b('#peRel').value = relText; $b('#peNotes').value = ch.notes || '';
    let pic = ch.portrait || MH.art.portraitURL(ch), newPic = null, removePic = false;
    const S = $b('#peS'), Y = $b('#peY'), X = $b('#peX'), img = $b('.pe-stage img');
    S.value = ed.pScale || 1; Y.value = ed.pY || 0; X.value = ed.pX || 0;
    const preview = () => {
      img.src = pic;
      img.style.scale = S.value; img.style.translate = `${X.value}% ${Y.value}%`;
      $b('#pesV').textContent = Math.round(S.value * 100) + '%'; $b('#peyV').textContent = Y.value; $b('#pexV').textContent = X.value;
    };
    [S, Y, X].forEach((r) => (r.oninput = preview));
    preview();
    $b('#peUpload').onchange = async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try { newPic = await ui.loadPortraitFile(f); pic = newPic; removePic = false; preview(); ui.toast('Portrait loaded — adjust it, then Save.'); }
      catch (err) { ui.toast('Could not read that image.'); }
    };
    $b('#peNoPic').onclick = () => { removePic = true; newPic = null; pic = (ch._orig && ch._orig.portrait) || MH.art.portraitURL(ch); preview(); };
    $b('#peAutoGo').onclick = async () => {
      const desc = $b('#peAuto').value.trim();
      if (!desc) { ui.toast('Describe the character first.'); return; }
      if (!MH.ai.hasKey()) { ui.toast('Auto-fill needs an OpenRouter key (Settings & AI).', 4); return; }
      const btn = $b('#peAutoGo'), msg = $b('#peAutoMsg');
      btn.disabled = true; btn.textContent = '✨ Writing…'; msg.textContent = 'The AI is writing the character sheet…';
      const cur = { name: $b('#peName').value.trim(), title: $b('#peTitle').value.trim(), species: $b('#peSpecies').value.trim(), bio: $b('#peBio').value.trim() };
      const r = await MH.ai.autofillChar(id, desc, $b('#peKeepName').checked, cur);
      btn.disabled = false; btn.textContent = '✨ Fill all boxes';
      if (r.error) { msg.textContent = '❌ ' + r.error; return; }
      const f = r.fields;
      if (f.name && !$b('#peKeepName').checked) $b('#peName').value = f.name;
      if (f.title) $b('#peTitle').value = f.title;
      if (f.species) $b('#peSpecies').value = f.species;
      if (f.bio) $b('#peBio').value = f.bio;
      if (f.voice) $b('#peVoice').value = f.voice;
      if (f.quirks) $b('#peQuirks').value = f.quirks;
      if (f.rel != null) $b('#peRel').value = f.rel;
      if (f.notes != null) $b('#peNotes').value = f.notes;
      msg.textContent = '✔ Filled in. Read it over, tweak anything, then tap Save.';
      $b('#peName').scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    $b('#pePreview').onclick = () => {
      const pre = $b('.pe-ai');
      saveFields(true);
      pre.textContent = MH.ai.charCardPreview(id);
      pre.classList.remove('hidden');
    };
    const saveFields = (dry) => {
      const data = { name: $b('#peName').value.trim(), title: $b('#peTitle').value.trim(), species: $b('#peSpecies').value.trim(), bio: $b('#peBio').value.trim(), voice: $b('#peVoice').value.trim(), quirks: $b('#peQuirks').value, relNotes: $b('#peRel').value, notes: $b('#peNotes').value.trim(), pScale: +S.value, pY: +Y.value, pX: +X.value };
      if (dry) { const keep = MH.charEdits[id]; MH.saveCharEdit(id, data); if (!keep) { /* keep edits even on preview: harmless */ } return; }
      MH.saveCharEdit(id, data);
    };
    $b('#peSave').onclick = async () => {
      saveFields();
      if (newPic) { await MH.idb.set('portrait_' + id, newPic); MH.saveCharEdit(id, { customPortrait: true }); MH.CHAR[id].portrait = newPic; }
      else if (removePic) { await MH.idb.del('portrait_' + id); MH.saveCharEdit(id, { customPortrait: false }); }
      ui.toast(`Saved ${MH.CHAR[id].name}.`);
      ui.openProfile(id);
    };
    $b('#peReset').onclick = async () => {
      if (!(await ui.confirm(`Reset ${ch.name} to the original character (text and portrait)?`, 'Reset', 'Cancel'))) return;
      await MH.resetCharEdit(id);
      ui.toast('Reset.'); ui.openProfile(id);
    };
    ui.modal('Edit ' + MH.esc(ch.name), body, { keep: true, onClose: () => ui.openProfile(id) });
  };

  // read an uploaded image, shrink it to a sensible size, return a data URL
  ui.loadPortraitFile = function (file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onerror = rej;
      r.onload = () => {
        const im = new Image();
        im.onerror = rej;
        im.onload = () => {
          const k = Math.min(1, 1100 / im.height, 1100 / im.width);
          const c = document.createElement('canvas');
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          let url = c.toDataURL('image/webp', 0.9);
          if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/png');
          res(url);
        };
        im.src = r.result;
      };
      r.readAsDataURL(file);
    });
  };

  // small "are you sure?" prompt (resolves true/false)
  ui.confirm = function (text, yes = 'Yes', no = 'No') {
    return new Promise((res) => {
      const old = document.getElementById('confirmBox'); if (old) old.remove();
      const box = h(`<div id="confirmBox" class="confirm"><div class="cbox"><p>${MH.esc(text)}</p><div class="row"><button class="btn ghost" data-v="0">${MH.esc(no)}</button><button class="btn" data-v="1">${MH.esc(yes)}</button></div></div></div>`);
      box.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { box.remove(); ui.confirmOpen = false; res(b.dataset.v === '1'); }));
      box.addEventListener('pointerdown', (e) => { if (e.target === box) { box.remove(); ui.confirmOpen = false; res(false); } });
      document.getElementById('game').appendChild(box);
      ui.confirmOpen = true;
    });
  };

  function tabYou() {
    const P = MH.state.player;
    const d = h(`<div class="you"><div class="phead"><canvas class="pv"></canvas><div class="pmeta"><h3>${MH.esc(P.name)}</h3><div class="ptitle">${MH.esc(P.pronouns)} · new in town · ${P.coins} coins</div><button class="btn small" id="editLook">Change look</button></div></div>
      <h4>Your reputation in town</h4><div class="reps"></div><p class="muted small">Everyone only knows what they saw or heard through gossip, so each villager has their own idea of you. A good name builds slowly; a bad one spreads fast.</p>${(() => { const sc = MH.ALL.filter((c) => MH.social.isAfraid(c.id)).length; return sc ? `<p class="fearnote">😨 ${sc} villager${sc > 1 ? 's are' : ' is'} afraid of you.</p>` : ''; })()}
      <h4>Things people saw you do</h4><ul class="mems">${P.deeds.slice().reverse().map((x) => `<li><i>${MH.esc(MH.agoStr(x.t))}</i> ${MH.esc(x.text)}</li>`).join('') || '<li class="muted">Nothing noteworthy yet.</li>'}</ul></div>`);
    const reps = d.querySelector('.reps');
    MH.TRAITS.forEach((t) => {
      const v = P.rep[t] || 0;
      reps.appendChild(h(`<div class="rep"><span>${MH.TRAIT_LABEL[t]}</span><span class="bar mid"><i style="left:${v < 0 ? 50 + v * 50 / 60 : 50}%;width:${Math.abs(v) * 50 / 60}%;background:${v < 0 ? '#e0524a' : '#8fd16a'}"></i></span><b>${v > 0 ? '+' : ''}${v}</b></div>`));
    });
    const pv = d.querySelector('.pv'); pv.width = 120; pv.height = 174; const ctx = pv.getContext('2d'); ctx.scale(3, 3); MH.art.drawChibiTo(ctx, MH.art.playerLook(MH.state.player.look || {}), 'down', 0);
    d.querySelector('#editLook').onclick = () => ui.openCreator(true);
    return d;
  }

  function tabPocket() {
    const P = MH.state.player;
    const gadgets = [P.phone ? '📱 phone' : '', P.boots ? '👢 gravity boots' : '', P.translator ? '📡 translator collar' : '', (P.bhCharges || 0) > 0 ? `🕳️ black hole sniper (${P.bhCharges})` : ''].filter(Boolean);
    const d = h(`<div class="pocket"><div class="coins">🪙 ${P.coins} coins · ❤️ ${Math.round(MH.fight.hp())} HP${P.weapon && MH.WEAPONS[P.weapon] ? ' · ' + MH.esc(MH.WEAPONS[P.weapon].name) : ''}</div>${gadgets.length ? `<p class="small">Gear: ${gadgets.join(' · ')}</p>` : ''}<div class="items"></div><p class="muted small">Give things to villagers from the 🎁 button while chatting, or just write it: <i>*hands Lily a wildflower*</i>.</p></div>`);
    const it = d.querySelector('.items');
    if (!P.inv.length) it.appendChild(h(`<div class="empty">Empty. Pick flowers (🌼), berries, mushrooms, seashells… or charm a villager into giving you something.</div>`));
    P.inv.forEach((x, i) => {
      const use = MH.shop && MH.shop.usable(x), wpn = MH.shop && MH.shop.weaponOf(x);
      const b = h(`<div class="item">${x.icon} ${MH.esc(x.name)}${x.from && MH.CHAR[x.from] ? `<small>from ${MH.esc(MH.CHAR[x.from].name)}</small>` : ''}${use ? `<button class="use">${use.cat === 'food' ? 'Eat' : use.cat === 'book' ? ((MH.state.player.booksRead || {})[use.book] ? 'Read again' : 'Read') : 'Use'}</button>` : ''}${wpn ? `<button class="use eq">${P.weapon === wpn ? 'Equipped ✔' : 'Equip'}</button>` : ''}<button class="drop" title="Drop">✕</button></div>`);
      if (wpn) b.querySelector('.eq').onclick = () => { MH.shop.equip(x); ui.openJournal('pocket'); };
      b.querySelector('.drop').onclick = async () => { if (x.quest && !(await ui.confirm(`Throw away ${x.name}? It's for a favour you promised.`, 'Throw away', 'Keep'))) return; P.inv.splice(i, 1); ui.openJournal('pocket'); };
      if (use) b.querySelector('.use').onclick = () => { MH.shop.use(i); if (ui.modalOpen) ui.openJournal('pocket'); };
      it.appendChild(b);
    });
    // wardrobe: things you bought to wear
    const wr = (P.wardrobe || []);
    const ward = h(`<div><h4>👕 Wardrobe</h4><div class="wardrobe"></div></div>`);
    if (!wr.length) ward.querySelector('.wardrobe').appendChild(h('<p class="muted small">Nothing yet — the Boutique at Mirehollow Mall (south of the square) sells hats, glasses, scarves…</p>'));
    wr.forEach((acc) => {
      const item = Object.values(MH.SHOP_ITEMS).find((x) => x.wear === acc); if (!item) return;
      const on = ((P.look && P.look.acc) || []).includes(acc);
      const b = h(`<button class="chip ${on ? 'sel' : ''}">${item.icon} ${MH.esc(item.name)}</button>`);
      b.onclick = () => { MH.shop.wear(acc, !on); ui.openJournal('pocket'); };
      ward.querySelector('.wardrobe').appendChild(b);
    });
    d.appendChild(ward);
    // home decor
    const dec = h(`<div><h4>🏠 Home decor</h4><ul class="mems decor"></ul></div>`);
    const dl = dec.querySelector('.decor');
    if (!(P.decor || []).length) dl.appendChild(h('<li class="muted">Your house could use some love. Try Home & Decor at the mall.</li>'));
    (P.decor || []).forEach((id, i) => {
      const item = MH.SHOP_ITEMS[id]; if (!item) return;
      const li = h(`<li>${item.icon} ${MH.esc(item.name)} ${MH.shop.decorPlaced(id, i) ? '' : '<i>(in storage — your house is full)</i>'} <button class="btn small ghost">Sell (${Math.floor(item.price / 2)} 🪙)</button></li>`);
      li.querySelector('button').onclick = () => { MH.shop.sellDecor(i); ui.openJournal('pocket'); };
      dl.appendChild(li);
    });
    d.appendChild(dec);
    return d;
  }

  function tabTown() {
    const d = h(`<div class="town"><h4>Gatherings this week</h4><ul class="mems">${MH.GATHERINGS.map((g) => `<li><b>${MH.WEEKDAYS[g.day]}</b> ${g.from}:00–${g.to}:00 · ${MH.esc(g.name)}</li>`).join('')}</ul>
      <h4>Map</h4><canvas class="minimap"></canvas></div>`);
    setTimeout(() => drawMinimap(d.querySelector('.minimap')), 0);
    return d;
  }

  function drawMinimap(cv) {
    const W = MH.world.W, H = MH.world.H, s = 3;
    cv.width = W * s; cv.height = H * s;
    const x = cv.getContext('2d');
    const col = ['#86c35c', '#4e8a48', '#d6bf92', '#cfc6b4', '#ead9a8', '#58aed6', '#5d7a52', '#7f6a48', '#9c784c', '#b5875a', '#3f8cc0', '#8e9096', '#6a6258', '#7fb6b0', '#c8955e', '#c9c48a', '#16120f', '#b9b3a6', '#8e9096', '#6a4a2e', '#efe8d8', '#5a5e62', '#3a2450', '#7a6450', '#c2b8a6', '#a6c86a', '#a89c88', '#7ccac8', '#9ad8f4'];
    const Wt = MH.world.TOWN_W;
    cv.width = Wt * s;
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < Wt; tx++) { x.fillStyle = col[MH.world.g(tx, ty)] || '#000'; x.fillRect(tx * s, ty * s, s, s); }
    MH.world.buildings.forEach((b) => { x.fillStyle = b.roof || '#666'; x.fillRect(b.x * s, b.y * s, b.w * s, b.h * s); });
    x.font = 'bold 9px sans-serif'; x.textAlign = 'center';
    MH.world.buildings.forEach((b) => { if (b.generic) return; x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 2; const n = b.name.split(' (')[0].replace('The ', ''); x.strokeText(n, (b.x + b.w / 2) * s, (b.y - 0.5) * s); x.fillText(n, (b.x + b.w / 2) * s, (b.y - 0.5) * s); });
    [['Park', 53, 83], ['Sunflowers', 53, 100], ['Rice paddies', 82, 106], ['Cornfield', 114, 108], ['Swamp', 140, 75], ['Deep Woods', 40, 8], ['Pond', 100, 84], ['River', 108, 52], ['Lookout Hill', 22, 131], ['Crag Heights', 116, 128], ['Orchard', 60, 140], ['Waterfall', 116, 162], ['Hollow Crags', 64, 166], ['Pine Forest', 24, 178], ['Scrublands', 120, 180]].forEach(([n, tx, ty]) => { x.fillStyle = '#fff'; x.strokeText(n, tx * s, ty * s); x.fillText(n, tx * s, ty * s); });
    MH.world.buildings.forEach((b) => { if (b.generic) return; });
    x.fillStyle = '#ff2a6a'; x.beginPath(); x.arc(MH.player.x / 16 * s, MH.player.y / 16 * s, 4, 0, 7); x.fill();
  }

  // ------------------------------------------------------------ grapevine board
  ui.openGrapevine = function () {
    const g = MH.state.grapevine.slice(-25).reverse();
    const body = h(`<div class="grape"><p class="muted">Pinned notes, rumours and scribbles. Someone has drawn a mosquito with a moustache.</p><ul class="mems">${g.length ? g.map((x) => `<li><i>${MH.esc(MH.agoStr(x.t))}</i> ${MH.esc(x.text)}</li>`).join('') : '<li class="muted">The board is suspiciously empty. Give it time.</li>'}</ul></div>`);
    ui.modal('📌 The Grapevine', body);
  };

  // ------------------------------------------------------------ well & sleep
  ui.wellPrompt = function () {
    const P = MH.state.player;
    const body = h(`<div class="form"><p>The old well glitters. People say if you toss a coin and say your wish out loud, <i>someone</i> hears it.</p><input id="wishIn" maxlength="120" placeholder="I wish…"><div class="row"><button class="btn" id="wishGo">Toss a coin (1 🪙)</button></div></div>`);
    ui.modal('The Old Well', body);
    body.querySelector('#wishGo').onclick = () => {
      const w = body.querySelector('#wishIn').value.trim();
      if (!w) return;
      if (P.coins < 1) { ui.toast('You have no coins to toss.'); return; }
      MH.social.addCoins(-1);
      MH.social.addMemory('zahra', `${P.name} tossed a coin in the well and wished: "${w}". I heard it. Perhaps I'll help, in my own way.`, { imp: 3, kind: 'witness' });
      MH.social.grapevine(`Someone made a wish at the well. Zahra smiled.`, ['zahra']);
      ui.closeModal();
      MH.render.burst(79 * 16, 56 * 16, 'sparkle', 16);
      ui.vibe('The coin falls for a long time. Somewhere, a lamp glows a little warmer.');
    };
  };
  ui.sleepPrompt = function () {
    const w = MH.sim.nextWake();
    const morningToo = w.label !== 'morning';
    const body = h(`<div class="form"><p>Your futon. It smells like fresh tatami and someone else's cinnamon rolls.</p><div class="row wrap"><button class="btn" id="sleepGo">${w.label === 'morning' ? 'Sleep until morning' : 'Nap until ' + w.label} (${MH.clockStr(w.min)})</button>${morningToo ? '<button class="btn ghost" id="sleepMorning">Sleep until tomorrow morning</button>' : ''}<button class="btn ghost" id="saveGo">Just save</button></div></div>`);
    ui.modal('Your House', body);
    const WAKE = { morning: 'Morning light slides across the tatami. A train rattles past outside.', noon: 'You wake up around noon. Somewhere, a bakery bell rings for lunch.', 'late afternoon': 'You wake up to long golden shadows across the floor. Late afternoon.', 'late evening': 'You wake up after dark. Lamps are coming on all over town.' };
    const go = (toMorning) => {
      ui.closeModal();
      const f = $('#fade'); f.classList.add('on');
      setTimeout(() => { const r = MH.sim.sleepUntil(toMorning); MH.render.snap(); MH.save(); f.classList.remove('on'); MH.sim.vibeNow(WAKE[r.label] || WAKE.morning); }, 900);
    };
    body.querySelector('#sleepGo').onclick = () => go(false);
    if (morningToo) body.querySelector('#sleepMorning').onclick = () => go(true);
    body.querySelector('#saveGo').onclick = () => { MH.save(); ui.toast('Saved.'); ui.closeModal(); };
  };

  // ------------------------------------------------------------ pause menu & settings
  ui.openMenu = function () {
    const body = h(`<div class="menu"><button class="btn" data-a="resume">Resume</button><button class="btn" data-a="journal">Journal</button><button class="btn" data-a="settings">Settings & AI</button><button class="btn" data-a="save">Save</button><button class="btn ghost" data-a="reset">🔁 Reset today</button><button class="btn ghost" data-a="help">How to play</button><button class="btn ghost" data-a="slots">👥 Switch character</button><button class="btn ghost" data-a="title">Back to title</button></div>`);
    ui.modal('Mirehollow', body);
    body.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'resume') ui.closeModal();
      if (a === 'journal') ui.openJournal();
      if (a === 'settings') ui.openSettings();
      if (a === 'save') { MH.save(); ui.toast('Saved.'); ui.closeModal(); }
      if (a === 'help') ui.openHelp();
      if (a === 'reset') ui.openDayReset();
      if (a === 'title') { MH.save(); ui.closeModal(); ui.showTitle(); }
      if (a === 'slots') { MH.save(); ui.closeModal(); ui.showTitle(); }
    }));
  };

  ui.openDayReset = function () {
    const can = MH.dayReset.canRewind();
    const body = h(`<div class="form"><p>Did today go sideways? Two ways to start over:</p>
      <button class="btn" id="drRewind" ${can ? '' : 'disabled'}>⏪ Rewind the whole day</button>
      <p class="muted small">${can ? 'Back to how everything was when this day started: memories, bonds, money, reputation, items, plans — all of it.' : 'No snapshot of this morning yet (it is taken when a new day starts or you load the game).'}</p>
      <button class="btn ghost" id="drForget">🧠 Only forget today's memories</button>
      <p class="muted small">Villagers forget what happened today (and today's gossip and rumours), but you keep your money, items, bonds and reputation.</p></div>`);
    ui.modal('🔁 Reset today', body);
    body.querySelector('#drRewind').onclick = async () => {
      if (!(await ui.confirm('Rewind to the start of today? Everything since then is undone.', 'Rewind', 'Cancel'))) return;
      ui.closeModal(); if (MH.dayReset.rewind()) { ui.renderParty(); ui.toast('⏪ Rewound to the start of the day.', 3); }
    };
    body.querySelector('#drForget').onclick = async () => {
      if (!(await ui.confirm('Make everyone forget what happened today?', 'Forget', 'Cancel'))) return;
      const n = MH.dayReset.forget(); ui.closeModal(); ui.toast(`🧠 ${n} memor${n === 1 ? 'y' : 'ies'} from today forgotten.`, 3);
    };
  };

  ui.openHelp = function () {
    const body = h(`<div class="help">
      <p><b>Move</b>: drag anywhere on the left half of the screen (or WASD / arrows). Push further to run.</p>
      <p><b>Interact</b>: the round button on the right (or E / Space) — talk, knock on doors, pick flowers, read the board, toss a wish in the well, rest at home.</p>
      <p><b>Chat like a role-play</b>: type anything. Put actions in asterisks: <i>*offers a handshake*</i>, <i>*hides behind Vix*</i>. Villagers answer with their own actions too. A glowing <b>➤</b> after a line means more is coming — tap it to hear it now.</p>
      <p><b>Group chats</b>: villagers nearby can overhear and wander in (and leave when they have somewhere to be). Tap a portrait to talk to just that person; tap it again to talk to everyone. <b>… Listen</b> lets them talk among themselves. <b>📜 Log</b> shows everything that was said.</p>
      <p><b>Shops</b>: the bakery, gym, bookstore, general store, club, town hall, clinic and barbershop can be entered during opening hours. Buy things at the counters; <b>Mirehollow Mall</b> (south of the square, by the park) has five kiosks: food, gifts, clothes you can wear, home decor and fun stuff. Sable at the General Store buys what you forage.</p>
      <p><b>Jobs</b>: ask for work at a shop's counter (or at the Post Office / Maggie's Stilt House) for coins. Journal → Jobs lists them all.</p>
      <p><b>Favours</b>: villagers sometimes ask you for help — accept or decline. Journal → Favours tracks them.</p>
      <p><b>Health & fights</b>: the ❤️ bar is your health. Fights are turn-based inside the chat: type an attack as an *action* on your turn, then steer your ❤️ to dodge theirs — harder against tougher opponents. ⚔️ in the chat bar challenges someone (a friendly spar or a real fight). Buy a bat at the General Store or worse at the bandits' black market, and equip it from your Pocket. Eat, soak in the onsen or visit the clinic to heal. At 0 HP you black out: you might be robbed, rescued — or die and restart the day.</p>
      <p><b>Games</b>: 🎲 Play in the chat bar challenges someone to Connect 4, memory, a math duel, rock-paper-scissors or a quiz. Books from the "bookstore" can be read from your Pocket — Penelope will quiz you on them. Buy a fishing rod at the General Store and fish at the water's edge.</p>
      <p><b>Phones</b>: buy one at the mall (Fun & Phones), then 📱 at the top to text villagers who have phones. Give a spare phone to anyone who doesn't.</p>
      <p><b>Hold A</b> (or Q): act or shout on your own — <i>*dances on the bench*</i>, "free cake for the first one here!". The narrator answers and anyone around may come over.</p>
      <p><b>Homes</b>: villagers' houses (Lily's cottage, the Honeycomb, the Coop, the Gator Grove, Kira's den, Maggie's stilt house, Juniper's cabin, the bandits' cave) can be entered: knock, or sneak in (closed shops at night too — many villagers live in theirs). At night most people are asleep — walk, don't run. Night owls are awake.</p>
      <p><b>Sleep</b> skips to the next part of the day: morning → noon → late afternoon → late evening → next morning.</p>
      <p><b>Fighters</b>: Roxy the boxing champ coaches at the Burrow Gym; Sensei Jade runs the Jade Dojo south-west of town, past the bamboo. Take a lesson at the dojo counter to land your hits more often.</p>
      <p><b>The highlands</b>: south of town — Lookout Hill, Crag Heights with the onsen, the orchard, the waterfall and the bandits' Hollow Crags. Look for stairs cut into the cliffs.</p>
      <p><b>Characters</b>: ⚙️ → 👥 Switch character to play up to 4 different characters (try a saint and a menace).</p>
      <p><b>Bonds & reputation</b>: everyone remembers what you do. Witnesses gossip. Some villagers will like you just for your reputation, others will hate you for the same thing.</p>
      <p><b>Your house</b>: it's right by the west railway crossing. Go inside to sleep, raid the fridge, and plan parties on the low table. Invite people over (or to meet somewhere) with the 🏠 button while chatting.</p>
      <p><b>Events</b>: towns gatherings happen every week (see Journal → Plans). Just show up to join.</p>
      <p><b>AI</b>: add an OpenRouter API key in Settings so every villager gets unique AI dialogue. Without a key, the game runs in a simple offline mode.</p>
      <p><b>Journal</b>: see what each villager thinks and remembers about you.</p></div>`);
    ui.modal('How to play', body);
  };

  ui.openSettings = function (fromTitle) {
    const S = MH.settings;
    const body = h(`<div class="form settings">
      <label>OpenRouter API key <small>(stored only on this device)</small></label>
      <div class="row"><input id="sKey" type="password" autocomplete="off" placeholder="sk-or-v1-…" value="${MH.esc(S.apiKey)}"><button class="btn small ghost" id="sShow">Show</button></div>
      <p class="muted small">Get one at openrouter.ai → Keys. Each villager reply is one AI call; cheap models cost a fraction of a cent per reply.</p>
      <label>Model</label>
      <div class="row"><input id="sModel" value="${MH.esc(S.model)}" placeholder="provider/model-name"><button class="btn small ghost" id="sBrowse">Browse</button></div>
      <div id="modelList" class="modellist hidden"><input id="mSearch" placeholder="Search models…"><div class="ml"></div></div>
      <div class="row"><button class="btn small" id="sTest">Test connection</button><span id="sTestOut" class="muted small"></span></div>
      <label>Model thinking</label>
      <select id="sThink"><option value="off">Off — fastest (recommended)</option><option value="low">Low</option><option value="default">Model default (slowest)</option></select>
      <label class="toggle"><input type="checkbox" id="sFast" ${S.fastRouting !== false ? 'checked' : ''}> Prefer the fastest provider</label>
      <label>Content rules</label>
      <select id="sContent"><option value="cozy">Cozy (PG-13)</option><option value="mature">Mature (16+)</option><option value="custom">Custom — write your own</option></select>
      <p class="muted small" id="sContentHelp"></p>
      <textarea id="sCustom" class="rules hidden" rows="6" placeholder="Write the content rules the villagers should follow…">${MH.esc(S.customRules || '')}</textarea>
      <label>Villager small talk (uses AI calls when you can see them)</label>
      <select id="sAmb"><option value="off">Off</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">Lively</option></select>
      <label>Creativity <small id="sTempV">${S.temperature}</small></label>
      <input id="sTemp" type="range" min="0.3" max="1.3" step="0.05" value="${S.temperature}">
      <label>Text speed</label>
      <select id="sSpeed"><option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option><option value="instant">Instant</option></select>
      <label>Time speed (game minutes per real second)</label>
      <select id="sTime"><option value="0.5">0.5 (relaxed)</option><option value="1">1 (default — a day lasts 24 min)</option><option value="2">2 (fast)</option></select>
      <h4>Save data</h4>
      <h4>💾 Backups</h4>
      <div class="autob">${MH.isNative() ? `<p class="small">Auto-backup file: <b id="abName">—</b> <span class="muted" id="abLast"></span></p>
        <div class="row wrap"><button class="btn small" id="abPick">Choose auto-backup file…</button><button class="btn small ghost" id="abNow">Back up now</button><button class="btn small ghost" id="abLoad">Load from it</button><button class="btn small ghost" id="abOff">Turn off</button></div>
        <p class="muted small">The game rewrites this one file every few minutes of play, when you sleep and when you leave the app. In the file picker, choose <b>Google Drive</b> (or another cloud app) for a cloud save.</p>` : '<p class="muted small">Auto-backup files need the Android app; restore points below still work.</p>'}
        <div class="row wrap"><button class="btn small ghost" id="sPoints">⏪ Restore points</button><button class="btn small ghost" id="sExport">Export backup</button><button class="btn small ghost" id="sImport">Import backup</button><button class="btn small danger" id="sReset">Delete save</button></div></div>
      <p class="muted small">The backup holds everything: your game (bonds, memories, money, items, reputation, story log, plans, parties, followers), all character edits, uploaded portraits and settings — but not your API key.</p>
      <p class="muted small">AI calls this session: <span id="sCalls">${MH.ai.stats.calls}</span> · tokens: ${MH.ai.stats.tokens}</p>
      <div class="row"><button class="btn" id="sDone">Save settings</button></div></div>`);
    body.querySelector('#sAmb').value = S.ambient;
    body.querySelector('#sThink').value = S.thinking || 'off';
    const cSel = body.querySelector('#sContent'), cTa = body.querySelector('#sCustom'), cHelp = body.querySelector('#sContentHelp');
    cSel.value = MH.ai.contentMode();
    const showContent = () => {
      const m = cSel.value;
      cTa.classList.toggle('hidden', m !== 'custom');
      if (m === 'custom' && !cTa.value.trim()) cTa.value = MH.ai.CONTENT.mature.replace(/^- CONTENT \([^)]*\): /, '');
      cHelp.textContent = m === 'cozy' ? 'Cozy-chaotic PG-13: flirting, kisses, mild swearing. Explicit stuff is steered away inside the story.'
        : m === 'mature' ? 'Strong language, darker themes, heavier drama; romance can go further and anything sexual fades to black instead of being refused.'
        : 'Your text replaces the content rules sent to the AI (it starts as a copy of Mature — edit freely to test). The AI provider\'s own policies still apply, and the "never anything sexual with minors" rule is always added.';
    };
    cSel.onchange = showContent; showContent();
    body.querySelector('#sSpeed').value = S.textSpeed;
    body.querySelector('#sTime').value = String(S.timeScale);
    const key = body.querySelector('#sKey');
    body.querySelector('#sShow').onclick = (e) => { key.type = key.type === 'password' ? 'text' : 'password'; e.target.textContent = key.type === 'password' ? 'Show' : 'Hide'; };
    body.querySelector('#sTemp').oninput = (e) => (body.querySelector('#sTempV').textContent = e.target.value);
    const apply = () => {
      S.apiKey = key.value.trim();
      S.model = body.querySelector('#sModel').value.trim() || MH.defaultSettings.model;
      S.ambient = body.querySelector('#sAmb').value;
      S.textSpeed = body.querySelector('#sSpeed').value;
      S.timeScale = parseFloat(body.querySelector('#sTime').value) || 1;
      S.temperature = parseFloat(body.querySelector('#sTemp').value) || 0.9;
      S.contentMode = cSel.value; S.mature = cSel.value === 'mature';
      S.customRules = cTa.value;
      S.thinking = body.querySelector('#sThink').value;
      S.fastRouting = body.querySelector('#sFast').checked;
      MH.saveSettings();
    };
    body.querySelector('#sTest').onclick = async () => {
      apply();
      const out = body.querySelector('#sTestOut');
      if (!MH.ai.hasKey()) { out.textContent = 'Enter a key first.'; return; }
      out.textContent = 'Testing…';
      const r = await MH.ai.request([{ role: 'user', content: 'Reply with JSON {"ok":true,"line":"<a one-sentence cozy greeting from a fox baker>"}' }], { maxTokens: 120 });
      if (r.error) out.textContent = '❌ ' + r.error;
      else { const j = MH.ai.parseJSON(r.text); out.textContent = '✅ ' + (j && j.line ? j.line : r.text.slice(0, 80)) + ` (${(MH.ai.stats.lastMs / 1000).toFixed(1)}s)`; }
    };
    body.querySelector('#sBrowse').onclick = async () => {
      const box = body.querySelector('#modelList');
      box.classList.remove('hidden');
      const ml = box.querySelector('.ml');
      ml.textContent = 'Loading models…';
      const models = await MH.ai.listModels();
      if (!models.length) { ml.textContent = 'Could not load the model list (offline?). You can type a model id by hand.'; return; }
      const render = (q) => {
        ml.innerHTML = '';
        models.filter((m) => !q || (m.id + ' ' + m.name).toLowerCase().includes(q.toLowerCase())).slice(0, 80).forEach((m) => {
          const b = h(`<button class="mitem"><b>${MH.esc(m.name)}</b><small>${MH.esc(m.id)}${m.price ? ' · $' + MH.esc(m.price) + ' per 1M tokens (in/out)' : ''}</small></button>`);
          b.onclick = () => { body.querySelector('#sModel').value = m.id; box.classList.add('hidden'); };
          ml.appendChild(b);
        });
      };
      box.querySelector('#mSearch').oninput = (e) => render(e.target.value);
      render('');
    };
    const abRefresh = () => {
      const n = body.querySelector('#abName'); if (!n) return;
      const name = MH.backup.autoName(), last = MH.store.get('lastAutoBackup', null);
      n.textContent = name || 'not set';
      body.querySelector('#abLast').textContent = name && last ? (last.ok ? '· last saved ' + new Date(last.t).toLocaleString() : '· last attempt failed') : '';
      ['#abNow', '#abLoad', '#abOff'].forEach((q) => (body.querySelector(q).disabled = !name));
    };
    if (body.querySelector('#abPick')) {
      abRefresh(); MH.on('autobackup', abRefresh);
      body.querySelector('#abPick').onclick = () => MH.backup.chooseAuto();
      body.querySelector('#abNow').onclick = () => { MH.backup._lastAuto = 0; MH.backup.autoSave(true); ui.toast('💾 Backing up…', 2); };
      body.querySelector('#abOff').onclick = async () => { if (await ui.confirm('Stop auto-backups? (The file stays where it is.)', 'Stop', 'Keep')) { window.AndroidBridge.clearAutoBackup(); abRefresh(); } };
      body.querySelector('#abLoad').onclick = async () => { try { const text = await MH.backup.readAuto(); importText(text); } catch (e) { ui.toast('Could not read the auto-backup file.'); } };
    }
    body.querySelector('#sPoints').onclick = () => ui.openRestorePoints(fromTitle);
    body.querySelector('#sExport').onclick = async () => {
      apply();
      const n = await MH.backup.export();
      ui.toast(MH.isNative() ? `Choose where to save the backup (${n} custom portrait${n === 1 ? '' : 's'} included)` : 'Backup downloaded', 4);
    };
    body.querySelector('#sImport').onclick = () => {
      const f = h(`<div class="form"><p>Load a Mirehollow backup file. This replaces your current game, character edits, portraits and settings (your API key is kept).</p>
        <label class="btn" id="impFileL">📂 Choose backup file<input type="file" id="impFile" accept=".json,application/json,text/plain,*/*" hidden></label>
        <p class="muted small">Older exports (text you copied) can still be pasted here:</p><textarea class="dump" id="impTa"></textarea><div class="row"><button class="btn small ghost" id="impGo">Import pasted text</button></div></div>`);
      ui.modal('Import backup', f, { keep: true, onClose: () => ui.openSettings(fromTitle) });
      const go = (text) => importText(text);
      f.querySelector('#impFile').onchange = (e) => { const file = e.target.files && e.target.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => go(String(r.result)); r.readAsText(file); };
      f.querySelector('#impGo').onclick = () => go(f.querySelector('#impTa').value);
    };
    // every import first saves a restore point of what you have, and warns if the file is older
    async function importText(text) {
      if (!text || !text.trim()) return;
      const warn = MH.backup.compare(text);
      const ok = await ui.confirm((warn ? warn + '\n\n' : '') + 'Replace your current game with this backup? (Your current game is saved as a restore point first.)', 'Import', 'Cancel');
      if (!ok) return;
      try {
        await MH.backup.snapshot('before import');
        const hadGame = await MH.backup.import(text);
        if (hadGame) { ui.lockModal = false; ui.closeModal(); ui.renderParty && ui.renderParty(); }
        else fromTitle ? ui.showTitle() : ui.closeModal();
        ui.toast(hadGame ? 'Backup imported! (Undo: Settings → ⏪ Restore points)' : 'Character edits & settings imported', 4);
      } catch (e) { console.error(e); ui.toast('That does not look like a Mirehollow backup.'); }
    }
    body.querySelector('#sReset').onclick = () => {
      if (!confirm(`Delete this character's save (slot ${MH.slot})? This cannot be undone.`)) return;
      MH.store.del(MH.slotKey('save')); MH.store.del(MH.slotKey('dayStart')); location.reload();
    };
    body.querySelector('#sDone').onclick = () => { apply(); ui.toast('Settings saved' + (MH.ai.hasKey() ? ' — AI on' : ' — offline mode')); fromTitle ? ui.showTitle() : ui.closeModal(); ui.updateHud(); };
    ui.modal('Settings & AI', body, { keep: true, onClose: () => { apply(); fromTitle ? ui.showTitle() : ui.closeModal(); } });
  };

  // ------------------------------------------------------------ restore points
  ui.openRestorePoints = function (fromTitle) {
    const pts = MH.backup.points();
    const body = h(`<div class="form"><p class="muted small">Automatic snapshots of ALL your characters, edits and portraits: every ~15 minutes of play, each new day, and right before any import. The last 8 are kept.</p><div class="rplist"></div></div>`);
    const L = body.querySelector('.rplist');
    if (!pts.length) L.appendChild(h('<p class="muted small">None yet — the first one is made after a few minutes of play.</p>'));
    pts.forEach((pt) => {
      const row = h(`<div class="srow"><span class="sicon">⏪</span><div class="sinfo"><b>${MH.esc(new Date(pt.t).toLocaleString())}</b><small>${MH.esc(pt.reason)} · ${MH.esc(pt.who)}, day ${pt.day}${pt.slots > 1 ? ' · ' + pt.slots + ' characters' : ''}</small></div><button class="btn small">Restore</button></div>`);
      row.querySelector('button').onclick = async () => {
        if (!(await ui.confirm(`Go back to this restore point (${new Date(pt.t).toLocaleString()})? Your current game is snapshotted first, so you can undo this too.`, 'Restore', 'Cancel'))) return;
        try { await MH.backup.snapshot('before restoring'); const had = await MH.backup.restore(pt.key); ui.lockModal = false; ui.closeModal(); if (!had) fromTitle && ui.showTitle(); ui.renderParty && ui.renderParty(); ui.toast('⏪ Restored.', 3); }
        catch (e) { console.error(e); ui.toast('That restore point could not be loaded.'); }
      };
      L.appendChild(row);
    });
    ui.modal('⏪ Restore points', body, { onClose: () => ui.openSettings(fromTitle) });
  };

  // ------------------------------------------------------------ title & creator
  ui.showTitle = function () {
    ui.lockModal = true;
    if (MH.state && !MH.titleMode) MH.save();
    const has = !!MH.store.get(MH.slotKey('save'), null);
    const body = h(`<div class="title"><div class="logo">Mirehollow</div><div class="tag">A green little village of crooked cottages, chaotic neighbours and a swamp just past the last lamp post.</div>
      <div class="tbtns">${has ? '<button class="btn big" data-a="continue">Continue</button>' : ''}<button class="btn ghost" data-a="settings">Settings & AI ${MH.ai.hasKey() ? '✅' : ''}</button></div>
      <h4 class="slotsh">Your characters</h4><div class="slots"></div>
      <div class="foot">${MH.ai.hasKey() ? 'AI villagers: ' + MH.esc(MH.settings.model) : 'Tip: add an OpenRouter key in Settings for AI villagers.'}</div></div>`);
    ui.modal('', body, { cls: 'titlescreen', noClose: true });
    const sl = body.querySelector('.slots');
    for (let n = 1; n <= MH.SLOTS; n++) {
      const st = MH.store.get(MH.slotKey('save', n), null);
      const rep = st ? MH.social.repSummary(st.player.rep || {}) : '';
      const card = h(`<div class="slot ${n === MH.slot && st ? 'cur' : ''}">${st ? `<div class="sinfo"><b>${MH.esc(st.player.name)}</b><small>Day ${st.time.day + 1} · 🪙 ${st.player.coins} · ${MH.esc(rep)}</small></div><button class="btn small" data-a="play">Play</button><button class="btn small ghost" data-a="new">New</button><button class="btn small danger" data-a="del">🗑</button>` : `<div class="sinfo"><b>Slot ${n}</b><small>Empty</small></div><button class="btn small" data-a="new">New character</button>`}</div>`);
      card.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
        const a = b.dataset.a;
        if (a === 'play') { MH.setSlot(n); ui.lockModal = false; ui.closeModal(); MH.startGame(MH.store.get(MH.slotKey('save'))); }
        if (a === 'new') { if (st && !(await ui.confirm(`Start a new character in slot ${n}? ${st.player.name}'s game will be overwritten. (A restore point is saved first.)`, 'Start over', 'Cancel'))) return; if (st) await MH.backup.snapshot('before overwriting ' + st.player.name); MH.setSlot(n); ui.openCreator(false); }
        if (a === 'del') { if (!(await ui.confirm(`Delete ${st.player.name} (slot ${n})? (A restore point is saved first.)`, 'Delete', 'Cancel'))) return; await MH.backup.snapshot('before deleting ' + st.player.name); MH.store.del(MH.slotKey('save', n)); MH.store.del(MH.slotKey('dayStart', n)); ui.showTitle(); }
      }));
      sl.appendChild(card);
    }
    body.querySelectorAll('.tbtns [data-a]').forEach((b) => (b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'continue') { ui.lockModal = false; ui.closeModal(); MH.startGame(MH.store.get(MH.slotKey('save'))); }
      if (a === 'settings') ui.openSettings(true);
    }));
  };

  const SKINS = ['#fbe0c8', '#f2c9a0', '#e8b48a', '#d49a6a', '#b87a4a', '#9a6238', '#7a4a2a', '#5a3620'];
  const HAIRS = ['#5a3a2a', '#1c1a22', '#d4622a', '#f3d35a', '#f2f2f2', '#c84a8a', '#4a6ac8', '#3f9a3a', '#8a5a34', '#e8382a'];
  const CLOTH = ['#4a7ad8', '#d93a3a', '#3a8a5a', '#f4c84a', '#7a4aa0', '#2a2a3a', '#f4f0e6', '#e07ab0', '#5ab0e0', '#8a6a44'];
  ui.openCreator = function (editing) {
    const P = editing ? MH.state.player : null;
    const L = Object.assign({ skin: SKINS[1], hair: HAIRS[0], hairStyle: 'short', top: CLOTH[0], bottom: CLOTH[5], lashes: false }, P ? P.look : {});
    const body = h(`<div class="creator"><div class="cprev"><canvas></canvas></div><div class="cform form">
      ${editing ? '' : `<label>Your name</label><input id="cName" maxlength="20" placeholder="Your name" value="${MH.esc(MH.settings.playerName || '')}"><label>Pronouns</label><select id="cPro"><option>they/them</option><option>she/her</option><option>he/him</option><option>she/they</option><option>he/they</option></select>`}
      <p class="muted small">You're the only human in Mirehollow. The villagers will notice.</p>
      <label>Skin</label><div class="sw" data-k="skin"></div>
      <label>Hair</label><div class="sw" data-k="hair"></div>
      <label>Hair style</label><div class="opts" data-k="hairStyle" data-v="short,long,pony,curly,bun,buns,messy,wild,none"></div>
      <label>Eyelashes</label><div class="opts" data-k="lashes" data-v="no,yes"></div>
      <label>Top</label><div class="sw" data-k="top"></div>
      <label>Bottom</label><div class="sw" data-k="bottom"></div>
      <div class="row"><button class="btn big" id="cGo">${editing ? 'Done' : 'Move in!'}</button></div></div></div>`);
    const cv = body.querySelector('canvas'); cv.width = 160; cv.height = 232; const cx = cv.getContext('2d');
    let frame = 0, dirI = 0;
    const draw = () => {
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, 160, 232);
      const d = ['down', 'left', 'up', 'left'][dirI];
      cx.setTransform(dirI === 3 ? -4 : 4, 0, 0, 4, dirI === 3 ? 160 : 0, 0);
      MH.art.drawChibiTo(cx, MH.art.playerLook(L), d, frame);
    };
    const iv = setInterval(() => { frame = (frame + 1) % 3; if (frame === 0 && Math.random() < 0.3) dirI = (dirI + 1) % 4; draw(); }, 260);
    const pal = { skin: SKINS, hair: HAIRS, top: CLOTH, bottom: CLOTH };
    body.querySelectorAll('.sw').forEach((sw) => {
      const k = sw.dataset.k;
      pal[k].forEach((c) => { const b = h(`<button class="swatch ${L[k] === c ? 'sel' : ''}" style="background:${c}"></button>`); b.onclick = () => { L[k] = c; sw.querySelectorAll('.swatch').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); draw(); }; sw.appendChild(b); });
    });
    body.querySelectorAll('.opts').forEach((o) => {
      const k = o.dataset.k;
      o.dataset.v.split(',').forEach((v) => { const val = k === 'lashes' ? v === 'yes' : v; const b = h(`<button class="chip ${L[k] === val ? 'sel' : ''}">${v}</button>`); b.onclick = () => { L[k] = val; o.querySelectorAll('.chip').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); draw(); }; o.appendChild(b); });
    });
    draw();
    body.querySelector('#cGo').onclick = () => {
      if (editing) { P.look = L; MH.refreshPlayerSprite(); clearInterval(iv); ui.closeModal(); return; }
      const name = body.querySelector('#cName').value.trim() || 'Newcomer';
      MH.settings.playerName = name; MH.saveSettings();
      clearInterval(iv);
      ui.lockModal = false;
      ui.closeModal();
      MH.newGame({ name, pronouns: body.querySelector('#cPro').value, look: L });
    };
    ui.modal(editing ? 'Change your look' : 'Who are you?', body, { cls: 'wide', noClose: !editing, onClose: () => { clearInterval(iv); ui.closeModal(); } });
  };
})(window.MH);
