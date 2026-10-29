// Live views for the decrypted Instagram Direct snapshot (assets/live.enc, built by tools/build-live.mjs).
// app.js merges these over the demo views when the data object has live: true.
window.CRM_LIVE = function ({ D, esc, ico, num, icoBox, avatar, stageChip, prioChip, cardHead }) {
  const metric = (m) => `
    <div class="glass metric">${icoBox(m.icon, m.tone)}
      <span class="label">${m.label}</span>
      <b>${num(m.value)}</b>
      <span class="d muted">${m.delta}</span>
    </div>`;
  const TYPE = {
    esc: ['Срочно', 'siren', 'p'],
    lead: ['Лиды', 'flame', 'a'],
    bot: ['Бот не справился', 'bot', 'v'],
    partner: ['Сотрудничество', 'handshake', 'b'],
    info: ['К сведению', 'lightbulb', 'g'],
  };
  const row = (c) => `
    <div class="row-i click" data-go="#/dialogs/${c.id}">
      ${avatar(c, 'sm')}
      <div class="grow"><div class="ttl">${esc(c.user || c.name)} ${prioChip(c.priority)}</div><div class="desc">${esc(c.summary)}</div></div>
      <span class="t">${c.ago}</span>
    </div>`;
  const hbars = (items, max) => items.map((k) => `
    <div class="hbar"><span title="${esc(k.name)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(k.name)}</span><i style="width:${Math.max((k.n / max) * 100, 3)}%"></i><span>${num(k.n)}</span></div>`).join('');

  const pulse = () => {
    const top = D.clients.filter((c) => c.priority === 1 || (c.priority === 2 && c.waiting)).sort((a, b) => a.priority - b.priority || b.lastAt - a.lastAt).slice(0, 8);
    const kw = D.keywords.slice(0, 10);
    const maxKw = Math.max(1, ...kw.map((k) => k.n));
    const kinds = D.stages.filter((s) => s.count).map((s) => `
      <div class="stage"><span class="label">${esc(s.name)}</span><b>${num(s.count)}</b><span class="cv">${Math.round((s.count / D.total) * 100)}% диалогов</span>
        <span class="bar" style="width:${Math.round((s.count / D.total) * 100)}%"></span></div>`).join('');
    const flags = D.flagStats.map((f) => `<div class="row-i"><div class="grow ttl">${esc(f.label)}</div><b>${num(f.n)}</b></div>`).join('');
    const latest = D.clients.filter((c) => c.priority > 0).slice(0, 12).map(row).join('');
    return `
      <div class="grid g6">${D.metrics.map(metric).join('')}</div>
      <div class="glass card">${cardHead('Из чего состоит директ', `${num(D.total)} диалогов за сутки`, `<a class="btn sm" href="#/pipeline">Все диалоги ${ico('arrow-right')}</a>`)}<div class="funnel">${kinds}</div></div>
      <div class="grid g2">
        <div class="glass card">${cardHead('Требует внимания сейчас', 'срочные и ждущие ответа', `<a class="btn sm" href="#/inbox">Все находки ${ico('arrow-right')}</a>`)}<div class="list">${top.map(row).join('') || '<div class="empty">Срочного нет</div>'}</div></div>
        <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
          <div class="glass card">${cardHead('Кодовые слова', 'топ-10 за сутки')}${hbars(kw, maxKw) || '<div class="empty">Нет данных</div>'}</div>
          <div class="glass card">${cardHead('Флаги агента', '')}<div class="list">${flags || '<div class="empty">Флагов нет</div>'}</div></div>
        </div>
      </div>
      <div class="glass card">${cardHead('Последние находки', '')}<div class="list">${latest || '<div class="empty">Пусто</div>'}</div></div>`;
  };

  const inbox = (p, q) => {
    const f = q.type || 'all';
    const items = D.inbox.filter((i) => f === 'all' || i.type === f);
    const filters = [['all', 'Все', D.inbox.length], ...Object.entries(TYPE).map(([k, [l]]) => [k, l, D.inbox.filter((i) => i.type === k).length])]
      .filter(([k, , n]) => k === 'all' || n)
      .map(([k, l, n]) => `<button class="${k === f ? 'on' : ''}" data-go="#/inbox?type=${k}">${l} · ${n}</button>`).join('');
    let day = '';
    const list = items.map((i) => {
      const head = i.day !== day ? `<div class="label" style="padding:14px 6px 6px">${(day = i.day)}</div>` : '';
      const [, icon, tone] = TYPE[i.type];
      return head + `
        <div class="row-i click ${i.unread ? 'unread' : ''}" data-s="${esc((i.title + ' ' + i.desc).toLowerCase())}" data-go="#/dialogs/${i.client}">
          ${icoBox(icon, tone)}
          <div class="grow"><div class="ttl" style="white-space:normal">${esc(i.title)}</div><div class="desc" style="white-space:normal">${i.desc ? `<b style="color:var(--ink)">Что сделать:</b> ${esc(i.desc)}` : ''}${i.from ? ` · ${esc(i.from)}` : ''}</div></div>
          ${prioChip(i.p)}
          <span class="t">${i.t}</span>
        </div>`;
    }).join('');
    return `
      <div class="glass card">
        ${cardHead('Находки агента', `${D.inbox.length} из ${num(D.total)} диалогов · ${D.inbox.filter((i) => i.unread).length} ждут ответа`)}
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <div class="seg" style="flex-wrap:wrap">${filters}</div>
          <label class="search" style="min-width:220px">${ico('search')}<input data-filter=".list .row-i" placeholder="Поиск по находкам"></label>
        </div>
        <div class="list" style="margin-top:6px">${list || '<div class="empty">Пусто</div>'}</div>
      </div>`;
  };

  const pipeline = (p, q) => {
    const f = q.f || 'flag';
    const LIMIT = 300;
    const pick = { flag: (c) => c.priority > 0, wait: (c) => c.waiting, all: () => true }[f] || (() => true);
    const all = D.clients.filter(pick);
    const rows = all.slice(0, LIMIT).map((c) => `
      <tr class="click" data-s="${esc(`${c.name} ${c.user} ${c.keyword || ''} ${c.summary}`.toLowerCase())}" data-go="#/dialogs/${c.id}">
        <td><div class="who">${avatar(c, 'sm')}<div><b>${esc(c.name)}</b><small>${esc(c.user || 'Instagram')}</small></div></div></td>
        <td>${prioChip(c.priority) || '<span class="muted">—</span>'}</td>
        <td>${stageChip(c.stage)}</td>
        <td>${c.keyword ? esc(c.keyword) : '<span class="muted">—</span>'}</td>
        <td><div class="msg" style="max-width:380px">${esc(c.summary || c.last)}</div></td>
        <td>${c.waiting ? '<span class="chip v">ждёт</span>' : ''}</td>
        <td class="muted">${c.ago}</td>
      </tr>`).join('');
    const seg = `<div class="seg"><button class="${f === 'flag' ? 'on' : ''}" data-go="#/pipeline?f=flag">Нашёл агент</button><button class="${f === 'wait' ? 'on' : ''}" data-go="#/pipeline?f=wait">Ждут ответа</button><button class="${f === 'all' ? 'on' : ''}" data-go="#/pipeline?f=all">Все</button></div>`;
    return `
      <div class="glass card">
        ${cardHead('Диалоги', `${num(all.length)}${all.length > LIMIT ? ` · показаны первые ${LIMIT}, остальное через поиск в «Диалогах»` : ''}`, seg + `<label class="search" style="min-width:200px">${ico('search')}<input data-filter="tbody tr" placeholder="Фильтр"></label>`)}
        <div class="scroll-x"><table class="tbl"><thead><tr><th>Клиент</th><th>Приоритет</th><th>Тип</th><th>Кодовое слово</th><th>Суть</th><th></th><th>Когда</th></tr></thead><tbody>${rows}</tbody></table></div>
      </div>`;
  };

  const reports = () => {
    const maxH = Math.max(1, ...D.hours.map((h) => h.n));
    const bars = D.hours.map((h) => `<div style="height:${(h.n / maxH) * 100}%"><span>${h.n} · ${h.label}</span></div>`).join('');
    const kwRows = D.keywords.slice(0, 25).map((k) => `<tr><td><b>${esc(k.name)}</b></td><td>${num(k.n)}</td><td>${k.waiting || '<span class="muted">0</span>'}</td><td class="${k.failed ? 'down' : 'muted'}">${k.failed}</td></tr>`).join('');
    const TONES = { p: 'p', a: 'a', g: 'g', v: 'v', b: 'b' };
    const ins = (D.insights || []).map((x) => `<div class="glass insight"><span class="chip ${TONES[x.tone] || 'v'}" style="align-self:flex-start">${esc(x.tag)}</span><p>${esc(x.text)}</p>${x.f ? `<span class="f">${esc(x.f)}</span>` : ''}</div>`).join('');
    return `
      <div class="grid g6">${D.metrics.map(metric).join('')}</div>
      ${ins ? `<div class="glass card">${cardHead('Выводы агента', 'по всему директу за сутки')}</div><div class="grid g3">${ins}</div>` : ''}
      <div class="grid g2">
        <div class="glass card">${cardHead('Нагрузка по часам', 'диалоги с последним сообщением в этот час, МСК')}<div class="bars">${bars}</div><div class="axis"><span>${D.hours[0].label}</span><span>${D.hours[12].label}</span><span>${D.hours[23].label}</span></div></div>
        <div class="glass card">${cardHead('Кодовые слова', 'сколько людей, сколько ждут ответа, где бот не справился')}
          <div class="scroll-x" style="max-height:340px;overflow-y:auto"><table class="tbl"><thead><tr><th>Слово</th><th>Диалогов</th><th>Ждут</th><th>Сбои</th></tr></thead><tbody>${kwRows}</tbody></table></div></div>
      </div>`;
  };

  return { pulse, inbox, pipeline, reports };
};
