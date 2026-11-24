// Mirehollow — favours (quests): villagers ask for help, you accept or decline.
// Fetch / deliver / visit / talk quests are checked by the game; "other" ones are judged by the AI storyteller.
'use strict';
(function (MH) {
  const q = (MH.quests = {});
  const list = () => (MH.state.quests = MH.state.quests || []);
  const P = () => MH.state.player;
  const nm = (id) => (MH.CHAR[id] ? MH.CHAR[id].name : MH.world.locations[id] ? MH.world.locations[id].name : id);
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  q.active = () => list().filter((x) => x.status === 'active');
  q.canOffer = (id) => !!MH.CHAR[id] && !list().some((x) => x.from === id && (x.status === 'active' || x.status === 'offered')) && MH.social.attitude(id) > -15 && !MH.social.isAfraid(id) && q.active().length < 6;
  q.openFor = (present) => q.active().filter((x) => present.includes(x.from) || present.includes(x.target));

  q.offer = function (data, c) {
    if (!q.canOffer(data.from)) return null;
    const st = MH.state;
    const quest = Object.assign({ id: 'q' + (st.questSeq = (st.questSeq || 0) + 1), status: 'offered', created: MH.absMinutes(), deadline: MH.absMinutes() + 2 * 1440 }, data);
    list().push(quest);
    MH.social.log({ kind: 'sys', text: `📜 ${nm(quest.from)} asks a favour: ${quest.title}` });
    showCard(quest, c);
    return quest;
  };
  function showCard(quest, c) {
    const old = document.getElementById('questCard'); if (old) old.remove();
    const card = h(`<div id="questCard" class="questcard"><div class="qh">📜 ${MH.esc(nm(quest.from))} asks a favour</div><b>${MH.esc(quest.title)}</b><p>${MH.esc(quest.task)}</p><div class="qr">Reward: ${quest.reward} 🪙${quest.type === 'deliver' && quest.target ? ' · deliver to ' + MH.esc(nm(quest.target)) : ''}${quest.type === 'visit' && quest.target ? ' · go to ' + MH.esc(nm(quest.target)) : ''}</div><div class="row"><button class="btn small ghost" data-v="0">Decline</button><button class="btn small" data-v="1">Accept</button></div></div>`);
    card.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => {
      card.remove();
      const yes = b.dataset.v === '1';
      yes ? q.accept(quest) : q.decline(quest);
      if (MH.chat.active && MH.chat.convo === c && c.members.includes(quest.from)) MH.chat.sendText(yes ? `*agrees to help ${nm(quest.from)}*` : `*politely turns down ${nm(quest.from)}'s request*`);
    }));
    document.getElementById('chat').appendChild(card);
  }
  q.hideCard = () => { const old = document.getElementById('questCard'); if (old) old.remove(); };

  q.accept = function (quest) {
    if (quest.status !== 'offered') return;
    quest.status = 'active'; quest.accepted = MH.absMinutes(); quest.deadline = MH.absMinutes() + 2 * 1440;
    if (quest.type === 'deliver') {
      const item = quest.item || `Package for ${nm(quest.target)}`;
      quest.item = item;
      MH.social.giveItem(item, quest.from);
      const it = P().inv[P().inv.length - 1]; if (it) { it.quest = quest.id; it.icon = '📦'; }
    }
    MH.social.addMemory(quest.from, `${P().name} agreed to help me: ${quest.task}`, { imp: 2, kind: 'self' });
    MH.ui.toast(`📜 Quest accepted: ${quest.title}`, 3);
  };
  q.decline = function (quest) {
    if (quest.status !== 'offered') return;
    quest.status = 'declined';
    MH.social.addMemory(quest.from, `${P().name} turned down my request (${quest.title.toLowerCase()}).`, { imp: 1, kind: 'self' });
    MH.social.changeBond(quest.from, -1);
  };
  q.abandon = function (quest) {
    quest.status = 'failed';
    const i = P().inv.findIndex((x) => x.quest === quest.id); if (i >= 0) P().inv.splice(i, 1);
    MH.social.addMemory(quest.from, `${P().name} said they'd help me (${quest.title.toLowerCase()}) and then gave up.`, { imp: 2 });
    MH.social.changeBond(quest.from, -3);
  };
  q.complete = function (id, present) {
    const quest = list().find((x) => x.id === id && x.status === 'active'); if (!quest) return;
    quest.status = 'done'; quest.doneAt = MH.absMinutes();
    MH.social.addCoins(quest.reward);
    MH.social.changeBond(quest.from, 4);
    MH.social.addMemory(quest.from, `${P().name} did what I asked: ${quest.task} I owe them one.`, { imp: 3, kind: 'self' });
    MH.social.applyRep({ kind: 1, generous: 1 }, [quest.from]);
    MH.social.grapevine(`${P().name} helped ${nm(quest.from)} out (${quest.title.toLowerCase()}).`, [quest.from]);
    MH.ui.toast(`📜 Quest complete: ${quest.title} · +${quest.reward} 🪙${present && !present.includes(quest.from) ? ` (${nm(quest.from)} will hear about it)` : ''}`, 4.5);
    if (MH.player) MH.render.burst(MH.player.x, MH.player.y - 24, 'sparkle', 12);
  };

  const words = (s) => String(s || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !['with', 'from', 'some', 'that', 'this', 'your', 'little', 'fresh'].includes(w));
  const matches = (a, b) => { const A = words(a), B = words(b); return A.some((w) => B.some((x) => x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5)))); };
  // the player handed something over in a conversation
  q.onGive = function (item, to, members) {
    q.active().forEach((quest) => {
      if (quest.type === 'fetch' && (to === quest.from || (!to && members.includes(quest.from))) && matches(item.name, quest.item)) q.complete(quest.id, members);
      else if (quest.type === 'deliver' && (item.quest === quest.id || matches(item.name, quest.item)) && (to === quest.target || (!to && members.includes(quest.target)))) q.complete(quest.id, members);
    });
  };
  // "go talk to X": done once you've actually talked with them a bit
  q.onTalk = function (c) {
    q.active().forEach((quest) => {
      if (quest.type !== 'talk' || !c.members.includes(quest.target)) return;
      const since = c.lines.filter((l) => l.who === 'player').length;
      if (since >= 2) q.complete(quest.id, c.members);
    });
  };
  q.tick = function () {
    if (!MH.state) return;
    const now = MH.absMinutes(), here = MH.world.placeAt(MH.player.x, MH.player.y).key;
    list().forEach((quest) => {
      if (quest.status === 'active' && quest.type === 'visit' && quest.target && (here === quest.target || here === 'in_' + quest.target)) q.complete(quest.id, []);
      else if (quest.status === 'active' && now > quest.deadline) {
        quest.status = 'failed';
        const i = P().inv.findIndex((x) => x.quest === quest.id); if (i >= 0) P().inv.splice(i, 1);
        MH.social.addMemory(quest.from, `${P().name} never did what they promised (${quest.title.toLowerCase()}).`, { imp: 2 });
        MH.social.changeBond(quest.from, -2);
        MH.ui.toast(`📜 Quest failed (too late): ${quest.title}`, 4);
      } else if (quest.status === 'offered' && now > quest.created + 1440) quest.status = 'expired';
    });
    if (list().length > 60) MH.state.quests = list().filter((x) => x.status === 'active' || x.status === 'offered' || now - (x.doneAt || x.created) < 7 * 1440);
  };

  // simple favours for offline mode (no API key)
  q.offlineOffer = function (id) {
    if (!q.canOffer(id)) return null;
    const ch = MH.CHAR[id];
    const r = Math.random();
    let quest, line;
    if (r < 0.45) {
      const k = MH.pick(['wildflower', 'berries', 'mushroom', 'seashell', 'sunflower', 'feather']);
      const item = MH.ITEMS[k].name;
      quest = { from: id, type: 'fetch', title: `Bring ${ch.name} a ${item.toLowerCase()}`, task: `Find a ${item.toLowerCase()} and bring it to ${ch.name}.`, item, target: '', reward: MH.randi(10, 25) };
      line = ch.mute ? `*hands you a doodle of a ${item.toLowerCase()} and a question mark*` : `*looks hopeful* Could you find me a ${item.toLowerCase()}? I'd pay you, of course.`;
    } else if (r < 0.8) {
      const other = MH.pick(MH.CHARS.filter((c) => c.id !== id && !c.visitor && c.id !== 'scarecrow'));
      quest = { from: id, type: 'deliver', title: `A note for ${other.name}`, task: `Take ${ch.name}'s note to ${other.name}.`, item: `Note for ${other.name}`, target: other.id, reward: MH.randi(12, 30) };
      line = ch.mute ? `*presses a folded note into your hands and points toward ${other.name}'s usual spot*` : `Could you take this note to ${other.name}? I… can't really do it myself.`;
    } else {
      const place = MH.pick(['shrine', 'pond', 'river', 'station', 'sunflowers', 'busstop', 'park']);
      quest = { from: id, type: 'visit', title: `Check on ${MH.world.locations[place].name}`, task: `Go and check on ${MH.world.locations[place].name} for ${ch.name}.`, item: '', target: place, reward: MH.randi(8, 18) };
      line = ch.mute ? `*points insistently in the direction of ${MH.world.locations[place].name}*` : `Could you go check on ${MH.world.locations[place].name} for me? Something felt off there.`;
    }
    return { quest, line };
  };

  // ---------------------------------------------------------------- journal tab
  q.tabEl = function () {
    const all = list();
    const act = all.filter((x) => x.status === 'active'), off = all.filter((x) => x.status === 'offered'), done = all.filter((x) => x.status === 'done').slice(-10).reverse();
    const due = (x) => { const d = Math.max(0, Math.round((x.deadline - MH.absMinutes()) / 60)); return d >= 24 ? Math.floor(d / 24) + 'd ' + (d % 24) + 'h left' : d + 'h left'; };
    const d = h(`<div class="quests"><h4>Active favours</h4><div class="qa"></div><h4>Asked, not answered yet</h4><div class="qo"></div><h4>Done</h4><ul class="mems">${done.length ? done.map((x) => `<li>✔ <b>${MH.esc(x.title)}</b> <i>for ${MH.esc(nm(x.from))} · +${x.reward} 🪙</i></li>`).join('') : '<li class="muted">Nothing yet.</li>'}</ul>
      <p class="muted small">Villagers ask for favours while chatting (and sometimes walk up to ask). Bring what they want with 🎁, deliver packages to the right person, or just do the thing — they'll notice.</p></div>`);
    const qa = d.querySelector('.qa'), qo = d.querySelector('.qo');
    if (!act.length) qa.appendChild(h('<p class="muted small">None right now.</p>'));
    act.forEach((x) => {
      const row = h(`<div class="qrow"><b>📜 ${MH.esc(x.title)}</b><small>${MH.esc(x.task)}</small><small class="muted">from ${MH.esc(nm(x.from))} · ${x.reward} 🪙 · ${due(x)}${x.target ? ' · ' + (x.type === 'visit' ? 'go to ' : 'target: ') + MH.esc(nm(x.target)) : ''}</small><button class="btn small ghost">Give up</button></div>`);
      row.querySelector('button').onclick = async () => { if (await MH.ui.confirm(`Give up on "${x.title}"? ${nm(x.from)} will be disappointed.`, 'Give up', 'Keep it')) { q.abandon(x); MH.ui.openJournal('quests'); } };
      qa.appendChild(row);
    });
    if (!off.length) qo.appendChild(h('<p class="muted small">—</p>'));
    off.forEach((x) => {
      const row = h(`<div class="qrow"><b>📜 ${MH.esc(x.title)}</b><small>${MH.esc(x.task)}</small><small class="muted">from ${MH.esc(nm(x.from))} · ${x.reward} 🪙</small><div class="row"><button class="btn small ghost" data-v="0">Decline</button><button class="btn small" data-v="1">Accept</button></div></div>`);
      row.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { b.dataset.v === '1' ? q.accept(x) : q.decline(x); MH.ui.openJournal('quests'); }));
      qo.appendChild(row);
    });
    return d;
  };
})(window.MH);
