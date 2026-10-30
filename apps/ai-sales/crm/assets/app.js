// AI Sales CRM — hash router + views. Each view is a function (params) → HTML string,
// rendered into #view. boot.js calls CRM_START with either the decrypted live snapshot of the
// Direct (assets/live.enc) or the demo data (assets/data.js); live-only views come from live.js.
window.CRM_START = function (D) {
  if (D.live && !D.integrations) D.integrations = (window.CRM_DATA && window.CRM_DATA.integrations) || [];
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ico = (name) => `<i data-lucide="${name}"></i>`;
  const num = (n) => Number(n).toLocaleString('ru-RU');

  const TONE_BG = { v: 'var(--violet-t)', p: 'var(--pink-t)', b: 'var(--blue-t)', a: 'var(--amber-t)', g: 'var(--green-t)', n: 'rgba(29,27,46,.06)' };
  const TONE_FG = { v: 'var(--violet)', p: '#d6305f', b: '#3a6be0', a: '#b06a00', g: '#138066', n: 'var(--mute)' };
  const AV_GRAD = ['#7c5cff,#9b6bff', '#ff4f81,#ff9f43', '#5b8cff,#7c5cff', '#1fae8c,#5b8cff', '#e0559c,#9b6bff', '#f5a524,#ff5d8f'];
  const stageById = Object.fromEntries(D.stages.map((s, i) => [s.id, { ...s, i }]));
  const clientById = Object.fromEntries(D.clients.map((c) => [c.id, c]));
  const CH = { ig: { label: 'Instagram', icon: 'instagram', tone: 'p' }, tg: { label: 'Telegram', icon: 'send', tone: 'b' }, cp: { label: 'ChatPlace', icon: 'message-circle', tone: 'v' } };
  const SEG_TONE = { A: 'p', B: 'v', C: 'n' };

  const icoBox = (name, tone) => `<span class="ico" style="background:${TONE_BG[tone]};color:${TONE_FG[tone]}">${ico(name)}</span>`;
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const avatar = (c, cls = '') => {
    const g = AV_GRAD[[...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV_GRAD.length];
    return `<span class="av ${cls}" style="background:linear-gradient(135deg,${g})">${esc(initials(c.name))}</span>`;
  };
  const chChip = (ch) => `<span class="chip ${CH[ch].tone}">${ico(CH[ch].icon)}${CH[ch].label}</span>`;
  const stageChip = (id) => `<span class="chip ${id === 'won' ? 'g' : 'v'}">${esc(stageById[id].name)}</span>`;
  const segChip = (s) => `<span class="chip ${SEG_TONE[s] || 'n'}">Сегмент ${s}</span>`;
  const flagChip = (f) => ({ esc: '<span class="chip p">Эскалация</span>', hot: '<span class="chip a">Горячий</span>', paid: '<span class="chip g">Оплачено</span>' }[f] || '');
  const score = (n) => `<span class="score">${n}<i style="--w:${n}%"></i></span>`;
  const PRIO = { 1: ['p', 'Срочно'], 2: ['a', 'Важно'], 3: ['b', 'К сведению'] };
  const prioChip = (p) => (PRIO[p] ? `<span class="chip ${PRIO[p][0]}">${PRIO[p][1]}</span>` : '');
  const cardHead = (title, sub, right = '') => `<div class="card-h"><h2>${title}</h2>${sub ? `<small>${sub}</small>` : ''}<span class="sp"></span>${right}</div>`;

  // ===================== views =====================
  const views = {};

  views.pulse = () => {
    const metrics = D.metrics.map((m) => `
      <div class="glass metric">${icoBox(m.icon, m.tone)}
        <span class="label">${m.label}</span>
        <b>${m.value}${m.suffix ? `<small>${m.suffix}</small>` : ''}</b>
        <span class="d ${m.dir === 'up' ? 'up' : 'muted'}">${m.dir === 'up' ? '▲ ' : ''}${m.delta}</span>
      </div>`).join('');
    const max = Math.max(...D.stages.map((s) => s.count));
    const funnel = D.stages.map((s, i) => `
      <div class="stage ${s.id === 'won' ? 'won' : ''}">
        <span class="label">${String(i + 1).padStart(2, '0')} · ${s.name}</span>
        <b>${s.count}${s.lost ? `<small class="muted"> / ${s.lost} отказ</small>` : ''}</b>
        <span class="cv">${s.conv ? `дальше ${s.conv}%` : s.id === 'won' ? 'конверсия 12,8%' : '—'}</span>
        <span class="bar" style="width:${Math.round((s.count / max) * 100)}%"></span>
      </div>`).join('');
    const alertTone = { esc: ['p', 'Эскалация'], hot: ['a', 'Горячий'], sys: ['n', 'Система'] };
    const alerts = D.alerts.map((a) => `
      <div class="row-i ${a.client ? 'click' : ''}" ${a.client ? `data-go="#/dialogs/${a.client}"` : ''}>
        <span class="chip ${alertTone[a.kind][0]}">${alertTone[a.kind][1]}</span>
        <div class="grow"><div class="ttl">${esc(a.who)}</div><div class="desc">${esc(a.text)}</div></div>
        <span class="t">${a.time}</span>
      </div>`).join('');
    const feed = D.feed.map((f) => `
      <div class="row-i">
        <span class="t">${f.t}</span>
        <span class="chip ${CH[f.ch].tone}">${f.ch.toUpperCase()}</span>
        <div class="grow"><div class="ttl">${esc(f.who)} <span class="chip ${f.tone}">${esc(f.ev)}</span></div>${f.text ? `<div class="desc">${esc(f.text)}</div>` : ''}</div>
        <span class="t">${esc(f.by)}</span>
      </div>`).join('');
    const agents = D.agents.map((a) => `
      <div class="row-i click" data-go="#/agents">
        ${icoBox(a.icon, a.tone)}
        <div class="grow"><div class="ttl">${a.name} <span class="dot ${a.state === 'on' ? 'live' : ''}" style="${a.state === 'on' ? '' : 'background:var(--faint)'}"></span></div><div class="desc">${a.model}</div></div>
        <div style="text-align:right"><b style="font-size:20px;font-weight:800">${a.value}</b><div class="muted" style="font-size:11.5px">${a.unit}</div></div>
      </div>`).join('');
    return `
      <div class="grid g6">${metrics}</div>
      <div class="glass card">${cardHead('Воронка', '7 этапов · сегодня', `<a class="btn sm" href="#/pipeline">Все клиенты ${ico('arrow-right')}</a>`)}<div class="funnel">${funnel}</div></div>
      <div class="grid g2">
        <div class="glass card">${cardHead('Что происходит сейчас', '', '<span class="chip g"><span class="dot live"></span>Live</span>')}<div class="list">${feed}</div></div>
        <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
          <div class="glass card">${cardHead('Требует внимания', `${D.alerts.length} активных`)}<div class="list">${alerts}</div></div>
          <div class="glass card">${cardHead('Агенты', `${D.agents.filter((a) => a.state === 'on').length} из ${D.agents.length} онлайн`)}<div class="list">${agents}</div></div>
        </div>
      </div>`;
  };

  views.inbox = (p, q) => {
    const types = { all: ['Все', 'inbox'], esc: ['Эскалации', 'siren'], task: ['Задачи РОПа', 'list-checks'], pay: ['Оплаты', 'credit-card'], sys: ['Алерты', 'zap'], digest: ['Дайджесты', 'newspaper'] };
    const typeTone = { esc: 'p', task: 'v', pay: 'g', sys: 'a', digest: 'b' };
    const typeIco = { esc: 'siren', task: 'list-checks', pay: 'credit-card', sys: 'zap', digest: 'newspaper' };
    const f = q.type || 'all';
    const items = D.inbox.filter((i) => f === 'all' || i.type === f);
    const filters = Object.entries(types).map(([k, [label]]) => {
      const n = k === 'all' ? D.inbox.length : D.inbox.filter((i) => i.type === k).length;
      return `<button class="${k === f ? 'on' : ''}" data-go="#/inbox?type=${k}">${label} · ${n}</button>`;
    }).join('');
    let day = '';
    const list = items.map((i) => {
      const head = i.day !== day ? `<div class="label" style="padding:14px 6px 6px">${(day = i.day)}</div>` : '';
      return head + `
        <div class="row-i click ${i.unread ? 'unread' : ''}" ${i.client ? `data-go="#/dialogs/${i.client}"` : ''}>
          ${icoBox(typeIco[i.type], typeTone[i.type])}
          <div class="grow"><div class="ttl">${esc(i.title)}</div><div class="desc">${esc(i.from)} · ${esc(i.desc)}</div></div>
          ${i.p === 1 ? '<span class="chip p">Срочно</span>' : i.p === 2 ? '<span class="chip a">Важно</span>' : ''}
          <span class="t">${i.t}</span>
        </div>`;
    }).join('');
    return `
      <div class="glass card">
        ${cardHead('Центр уведомлений', `${D.inbox.filter((i) => i.unread).length} непрочитанных`, '<button class="btn sm">' + ico('check-check') + 'Прочитать все</button>')}
        <div class="seg" style="flex-wrap:wrap">${filters}</div>
        <div class="list" style="margin-top:6px">${list || '<div class="empty">Пусто</div>'}</div>
      </div>`;
  };

  views.dialogs = (p, q) => {
    const id = p[0];
    const c = id && clientById[id];
    const f = q.ch || 'all';
    const match = (x) => f === 'all' || x.ch === f || (f === 'esc' && x.flag === 'esc') || (f === 'wait' && x.waiting) || (f === 'flag' && x.priority > 0);
    const list = D.clients.filter(match).map((x) => `
      <div class="dlg-item ${c && x.id === c.id ? 'on' : ''}" data-s="${esc(`${x.name} ${x.user} ${x.keyword || ''} ${x.last}`.toLowerCase())}" data-go="#/dialogs/${x.id}${f !== 'all' ? `?ch=${f}` : ''}">
        ${avatar(x)}
        <div class="grow">
          <div class="l1">${esc(x.name)}${x.unread ? `<b class="chip p" style="padding:1px 7px">${x.unread}</b>` : ''}<span>${x.ago}</span></div>
          <div class="l2">${x.lastBy === 'agent' ? (D.live ? 'Бот: ' : 'ИИ: ') : x.lastBy === 'me' ? 'Вы: ' : ''}${esc(x.last)}</div>
          <div class="l3">${D.live ? `${prioChip(x.priority)}${stageChip(x.stage)}${x.keyword ? `<span class="chip n">${esc(x.keyword)}</span>` : ''}` : `${chChip(x.ch)}${stageChip(x.stage)}${flagChip(x.flag)}`}</div>
        </div>
      </div>`).join('');
    const tabs = (D.live ? [['all', 'Все'], ['flag', 'Нашёл агент'], ['wait', 'Ждут ответа'], ['esc', 'Срочно']] : [['all', 'Все'], ['ig', 'Instagram'], ['tg', 'Telegram'], ['esc', 'Эскалации']])
      .map(([k, l]) => `<button class="${k === f ? 'on' : ''}" data-go="#/dialogs${c ? '/' + c.id : ''}?ch=${k}">${l}</button>`).join('');
    const listPane = `
      <div class="glass dlg-list">
        <div class="search" style="min-width:0;margin-bottom:10px">${ico('search')}<input data-filter=".dlg-item" placeholder="Поиск по диалогам"></div>
        <div class="seg" style="margin-bottom:8px">${tabs}</div>
        <div class="dlg-items">${list}</div>
      </div>`;
    if (!c) {
      return `<div class="dlg">${listPane}<div class="glass chat-pane"><div class="empty" style="margin:auto">${ico('messages-square')}<p style="margin-top:8px">Выбери диалог слева</p></div></div></div>`;
    }
    const msgs = c.messages.map((m) => {
      if (m.day) return `<div class="day">${m.day}</div>`;
      if (m.stop) return `<div class="stop">${ico('hand')}${esc(m.stop)}</div>`;
      const who = m.side === 'out' ? (m.tag ? `ИИ · ${esc(m.tag)}` : 'Бот') : m.side === 'me' ? 'Илья' : '';
      return `<div class="bub ${m.side}">${esc(m.text)}<div class="meta">${who ? `<span>${who}</span>·` : ''}<span>${m.t}</span></div></div>`;
    }).join('');
    const i = c.info || {};
    const kv = (k, v) => (v != null && v !== '' ? `<div class="kv"><span>${k}</span><span>${esc(v)}</span></div>` : '');
    return `
      <div class="dlg has-chat">
        ${listPane}
        <div class="glass chat-pane">
          <div class="chat-h">
            <button class="btn ghost sm back" data-go="#/dialogs">${ico('arrow-left')}</button>
            ${avatar(c, 'sm')}
            <div class="who"><b>${esc(c.name)}</b><div class="muted">${esc(c.user)} · ${CH[c.ch].label}</div></div>
            <span class="sp"></span>
            ${D.live ? prioChip(c.priority) : flagChip(c.flag)}
            ${D.live ? '' : `<button class="btn sm pause">${ico('pause')}<span>Пауза ИИ</span></button>`}
          </div>
          <div class="chat">${msgs}</div>
          <div class="composer">
            ${c.draft ? `<div class="draft">${ico('sparkles')}<div><b>Черновик ИИ.</b> ${esc(c.draft)}</div></div>` : ''}
            ${D.live ? `<div class="muted" style="font-size:12.5px">Только чтение: ответить можно в ChatPlace или в Instagram. Черновик ИИ можно скопировать.</div>` : `<div class="acts">
              <button class="btn sm primary">${ico('sparkles')}Ответить с ИИ</button>
              <button class="btn sm">${ico('mic')}Голосовое</button>
              <button class="btn sm">${ico('file-text')}Скрипт на возражение</button>
              <button class="btn sm">${ico('bot')}Вернуть ИИ</button>
            </div>
            <div class="inp"><textarea rows="1" placeholder="Написать клиенту…">${c.draft ? esc(c.draft) : ''}</textarea><button class="btn primary">${ico('send')}</button></div>`}
          </div>
        </div>
        <div class="glass client">
          <div class="head">${avatar(c, 'lg')}<h2>${esc(c.name)}</h2><div class="muted">${esc(c.user)}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:6px">${D.live ? prioChip(c.priority) : segChip(c.seg)}${stageChip(c.stage)}</div></div>
          ${c.summary ? `<div class="sec"><span class="label">Сводка ИИ</span><div class="summary">${esc(c.summary)}</div></div>` : ''}
          ${D.live ? `
          ${c.suggestion ? `<div class="sec"><span class="label">Что сделать</span><div class="summary" style="background:var(--amber-t)">${esc(c.suggestion)}</div></div>` : ''}
          ${c.flags && c.flags.length ? `<div class="sec"><span class="label">Флаги агента</span><div style="display:flex;gap:6px;flex-wrap:wrap">${c.flags.map((x) => `<span class="chip a">${esc(x)}</span>`).join('')}</div></div>` : ''}
          <div class="sec"><span class="label">Диалог</span>
            ${kv('Кодовое слово', c.keyword)}${kv('Последнее сообщение', c.ago)}${kv('Ждёт ответа', c.waiting ? 'да' : 'нет')}${kv('Ведёт', c.operator ? 'оператор' : 'бот ChatPlace')}${kv('Сообщений в выгрузке', i.msgs)}
          </div>` : `
          <div class="sec"><span class="label">Сделка</span>
            ${kv('Скоринг', c.score)}${kv('Прогноз', c.forecast)}${kv('Ожидаемый чек', i.check)}
            ${i.progress ? `<div class="kv"><span>До закрытия</span><span>${i.progress}%</span></div><div class="progress"><i style="width:${i.progress}%"></i></div>` : ''}
          </div>
          <div class="sec"><span class="label">Контакт</span>
            ${kv('Канал', CH[c.ch].label)}${kv('Источник', i.source)}${kv('Город', i.geo)}${kv('Совпадение с ЦА', i.icp ? i.icp + '%' : '')}${kv('Триггер', i.trigger)}${kv('Первый контакт', i.first)}${kv('Сообщений', i.msgs)}
          </div>
          ${c.followup ? `<div class="sec"><span class="label">Запланировано</span><div class="summary" style="background:var(--amber-t)">${esc(c.followup)}</div></div>` : ''}`}
        </div>
      </div>`;
  };

  views.pipeline = (p, q) => {
    const mode = q.view || 'table';
    const rows = D.clients.map((c) => `
      <tr class="click" data-go="#/dialogs/${c.id}">
        <td><div class="who">${avatar(c, 'sm')}<div><b>${esc(c.name)}</b><small>${CH[c.ch].label} · ${esc(c.user)}</small></div></div></td>
        <td>${stageChip(c.stage)}</td>
        <td>${segChip(c.seg)}</td>
        <td>${score(c.score)}</td>
        <td><div class="msg">${c.lastBy === 'agent' ? 'ИИ: ' : c.lastBy === 'me' ? 'Илья: ' : ''}${esc(c.last)}</div></td>
        <td class="muted">${c.ago}</td>
        <td><b>${esc(c.forecast)}</b><div class="muted" style="font-size:12px">${esc(c.note)}</div></td>
      </tr>`).join('');
    const kanban = D.stages.map((s) => {
      const cards = D.clients.filter((c) => c.stage === s.id).map((c) => `
        <div class="kcard" data-go="#/dialogs/${c.id}">
          <div class="h">${avatar(c, 'sm')}${esc(c.name)}</div>
          <p>${esc(c.last)}</p>
          <div class="f">${chChip(c.ch)}${segChip(c.seg)}${flagChip(c.flag)}</div>
          <div class="kv"><span>${esc(c.forecast)}</span>${score(c.score)}</div>
        </div>`).join('');
      return `<div class="kcol"><h3>${s.name}<b>${s.count}</b></h3>${cards || '<p class="muted" style="padding:4px">Пусто в демо</p>'}</div>`;
    }).join('');
    const seg = `<div class="seg"><button class="${mode === 'table' ? 'on' : ''}" data-go="#/pipeline">Таблица</button><button class="${mode === 'kanban' ? 'on' : ''}" data-go="#/pipeline?view=kanban">Канбан</button></div>`;
    return `
      <div class="glass card">
        ${cardHead('Клиенты в работе', `128 · показано ${D.clients.length}, по температуре`, seg + `<button class="btn sm">${ico('download')}CSV</button>`)}
        ${mode === 'table'
          ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>Клиент</th><th>Этап</th><th>Сегмент</th><th>Скоринг</th><th>Последнее сообщение</th><th>Когда</th><th>Прогноз</th></tr></thead><tbody>${rows}</tbody></table></div>`
          : `<div class="kanban">${kanban}</div>`}
      </div>`;
  };

  views.agents = () => {
    const cards = D.agents.map((a) => `
      <div class="glass agent">
        <div class="h">${icoBox(a.icon, a.tone)}<b>${a.name}</b><span class="sp" style="flex:1"></span>
          <span class="chip ${a.state === 'on' ? 'g' : 'n'}">${a.state === 'on' ? '<span class="dot live"></span>Работает' : 'Ждёт расписания'}</span></div>
        <div class="muted">${a.model}</div>
        <div><span class="big">${a.value}</span> <span class="muted">${a.unit}</span></div>
        <div class="kv"><span>Сообщений за сутки</span><span>${a.stats.msgs}</span></div>
        <div class="kv"><span>Время ответа</span><span>${a.stats.speed}</span></div>
        <div class="kv"><span>Без перехвата</span><span>${a.stats.auto}%</span></div>
        ${a.stats.conv ? `<div class="kv"><span>Конверсия в оплату</span><span>${String(a.stats.conv).replace('.', ',')}%</span></div>` : ''}
      </div>`).join('');
    const gaps = D.gaps.map((g) => `
      <div class="row-i"><span class="chip a">×${g.hits}</span><div class="grow"><div class="ttl">${esc(g.topic)}</div><div class="desc">→ ${esc(g.to)}</div></div>
        ${g.status === 'filled' ? '<span class="chip g">Заполнено</span>' : `<button class="btn sm">${ico('plus')}Создать</button>`}</div>`).join('');
    const v = D.voice;
    return `
      <div class="grid g4">${cards}</div>
      <div class="grid g2">
        <div class="glass card">${cardHead('Похожесть на голос Ильи', 'насколько ответы близки к образцам переписки')}
          <div style="display:flex;align-items:baseline;gap:10px"><b style="font-size:44px;font-weight:800;letter-spacing:-.03em">${v.score}%</b><span class="up" style="font-weight:700">▲ ${v.delta}</span></div>
          <div class="progress" style="margin:12px 0 16px"><i style="width:${v.score}%"></i></div>
          <span class="label">Просадки этой недели</span>
          <div class="list">${v.issues.map((t) => `<div class="row-i">${icoBox('triangle-alert', 'a')}<div class="grow ttl" style="font-weight:600">${esc(t)}</div></div>`).join('')}</div>
        </div>
        <div class="glass card">${cardHead('Пробелы в базе знаний', 'агент не нашёл ответ и ответил шаблоном')}<div class="list">${gaps}</div></div>
      </div>`;
  };

  views.reports = () => {
    const R = D.reports;
    const kpi = R.kpi.map((m) => `
      <div class="glass metric">${icoBox(m.icon, m.tone)}<span class="label">${m.label}</span>
        <b>${m.value}${m.suffix ? `<small>${m.suffix}</small>` : ''}</b><span class="d up">${m.delta}</span></div>`).join('');
    const max = Math.max(...R.revenue);
    const bars = R.revenue.map((v, i) => `<div style="height:${(v / max) * 100}%"><span>${v}к</span></div>`).join('');
    const funnel = R.funnel.map((s) => `<div class="hbar"><span>${s.name}</span><i style="width:${Math.max(s.p, 3)}%"></i><span>${num(s.n)}</span></div>`).join('');
    const src = R.sources.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td>${s.leads}</td><td>${s.won}</td><td><b>${s.cr}%</b></td><td class="${s.d.startsWith('+') ? 'up' : s.d.startsWith('−') ? 'down' : 'muted'}">${s.d}</td></tr>`).join('');
    const ins = R.insights.map((x) => `<div class="glass insight"><span class="chip ${x.tone}" style="align-self:flex-start">${x.tag}</span><p>${esc(x.text)}</p><span class="f">${x.f}</span></div>`).join('');
    return `
      <div class="glass card" style="padding:12px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div class="seg"><button>7 дней</button><button class="on">30 дней</button><button>90 дней</button><button>Всё время</button></div>
        <span class="muted">16 апреля — 15 мая · сравнение с прошлым периодом</span>
      </div>
      <div class="grid g4">${kpi}</div>
      <div class="grid g2">
        <div class="glass card">${cardHead('Выручка по дням', 'тысячи рублей')}<div class="bars">${bars}</div><div class="axis"><span>16 апр</span><span>30 апр</span><span>15 мая</span></div></div>
        <div class="glass card">${cardHead('Воронка за 30 дней', 'от первого касания до оплаты')}${funnel}</div>
      </div>
      <div class="glass card">${cardHead('Источники лидов', 'по конверсии в оплату')}
        <div class="scroll-x"><table class="tbl"><thead><tr><th>Источник</th><th>Лидов</th><th>Оплат</th><th>Конверсия</th><th>Динамика</th></tr></thead><tbody>${src}</tbody></table></div></div>
      <div class="grid g3">${ins}</div>`;
  };

  views.kb = () => {
    const K = D.kb;
    const stats = K.stats.map((m) => `<div class="glass metric">${icoBox(m.icon, m.tone)}<span class="label">${m.label}</span><b>${m.value}${m.suffix ? `<small>${m.suffix}</small>` : ''}</b></div>`).join('');
    const colls = K.collections.map((c) => `
      <div class="glass coll">${icoBox(c.icon, c.tone).replace('class="ico"', 'class="ico"')}<b>${c.name}</b><span class="muted">${c.desc}</span>
        <div class="kv"><span>Заполнено</span><span>${c.done} из ${c.total}</span></div><div class="progress"><i style="width:${(c.done / c.total) * 100}%"></i></div></div>`).join('');
    const entries = K.entries.map((e) => `
      <div class="row-i click">${icoBox('file-text', 'v')}<div class="grow"><div class="ttl">${esc(e.title)}</div><div class="desc">${esc(e.cat)} · обновлено ${e.upd}${e.live ? ' · в работе у агентов' : ''}</div></div>
        <span class="chip ${e.prio === 'крит' ? 'p' : 'a'}">${e.prio === 'крит' ? 'Критично' : 'Важно'}</span></div>`).join('');
    return `
      <div class="grid g4">${stats}</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${colls}</div>
      <div class="grid g2">
        <div class="glass card">${cardHead('Голос и тон', '8 записей', `<button class="btn sm primary">${ico('plus')}Запись</button>`)}<div class="list">${entries}</div></div>
        <div class="glass card">${cardHead('Пробелы', 'темы без уверенного ответа')}<div class="list">${D.gaps.map((g) => `<div class="row-i"><span class="chip a">×${g.hits}</span><div class="grow"><div class="ttl">${esc(g.topic)}</div><div class="desc">→ ${esc(g.to)}</div></div></div>`).join('')}</div></div>
      </div>`;
  };

  views.settings = () => {
    const state = { next: ['a', 'Следующий шаг'], off: ['n', 'Не подключено'], on: ['g', 'Подключено'] };
    const integ = D.integrations.map((x) => `
      <div class="glass card" style="display:flex;flex-direction:column;gap:12px">
        <div class="card-h" style="margin:0">${icoBox(x.icon, x.tone)}<h2>${x.name}</h2><span class="sp"></span><span class="chip ${state[x.state][0]}">${state[x.state][1]}</span></div>
        <p class="muted">${x.desc}</p>
        ${x.fields.map((f) => `<label class="field"><span class="label">${f}</span><input type="password" placeholder="Хранится на сервере, не в браузере" disabled></label>`).join('')}
      </div>`).join('');
    const toggles = [
      ['Жалоба или угроза', 'передать Илье за 5 минут', true], ['Чувствительные темы', 'за 30 минут', true], ['VIP-клиент', 'за 1 час', true],
      ['Прямой запрос «к самому»', 'мгновенно', true], ['Ночной режим', 'не отвечать с 23:00 до 08:00', false],
    ].map(([t, d, on]) => `<div class="row-i"><div class="grow"><div class="ttl">${t}</div><div class="desc">${d}</div></div><button class="toggle ${on ? 'on' : ''}" data-toggle></button></div>`).join('');
    const notif = [['Утренний дайджест', '09:00 ежедневно', true], ['Вечерний дайджест', '21:00 ежедневно', true], ['Недельный отчёт', 'понедельник 10:00', true], ['Эскалации', 'мгновенно', true], ['Оплата получена', 'мгновенно', true], ['Горячий лид без ответа больше 30 минут', '', true]]
      .map(([t, d, on]) => `<div class="row-i"><div class="grow"><div class="ttl">${t}</div>${d ? `<div class="desc">${d}</div>` : ''}</div><button class="toggle ${on ? 'on' : ''}" data-toggle></button></div>`).join('');
    return `
      <div class="grid g2" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">${integ}</div>
      <div class="grid g2">
        <div class="glass card">${cardHead('Эскалация на Илью', 'когда ИИ передаёт диалог')}<div class="list">${toggles}</div></div>
        <div class="glass card">${cardHead('Уведомления в Telegram', '')}<div class="list">${notif}</div></div>
      </div>`;
  };

  if (D.live && window.CRM_LIVE) {
    Object.assign(views, window.CRM_LIVE({ D, esc, ico, num, icoBox, avatar, stageChip, prioChip, cardHead, TONE_BG, TONE_FG }));
  }

  // ===================== shell =====================
  const ROUTES = {
    pulse: ['Пульс', 'Главные цифры дня'],
    inbox: ['Входящие', 'Эскалации, задачи РОПа, оплаты'],
    dialogs: ['Диалоги', 'Instagram и Telegram в одном окне'],
    pipeline: ['Воронка', 'Все клиенты по этапам'],
    agents: ['Агенты', 'Нагрузка и качество ответов'],
    reports: ['Отчёты', 'Выручка, конверсии, источники'],
    kb: ['База знаний', 'Что знают агенты'],
    settings: ['Настройки', 'Подключения и поведение агентов'],
  };

  function parse() {
    const [path, qs] = (location.hash.replace(/^#\/?/, '') || 'pulse').split('?');
    const [name, ...params] = path.split('/');
    return { name: ROUTES[name] ? name : 'pulse', params, query: Object.fromEntries(new URLSearchParams(qs || '')) };
  }

  function render() {
    const { name, params, query } = parse();
    document.body.classList.remove('nav-open');
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === name));
    $('#title').textContent = ROUTES[name][0];
    $('#subtitle').textContent = ROUTES[name][1];
    document.title = `${ROUTES[name][0]} · AI Sales CRM`;
    const note = D.demo ? `<div class="demo-note">${ico('info')}Демо-данные. Живые диалоги появятся после подключения ChatPlace.</div>`
      : D.live ? `<div class="demo-note" style="background:var(--violet-t);color:#4a34b8">${ico('camera')}Снимок директа за ${esc(D.period)}. Обновляется по запросу, пока не подключена постоянная синхронизация.</div>` : '';
    $('#view').innerHTML = note + views[name](params, query);
    window.lucide && window.lucide.createIcons();
    const chat = $('.chat');
    if (chat) chat.scrollTop = chat.scrollHeight;
    if (name !== 'dialogs') window.scrollTo(0, 0);
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go]');
    if (t) { location.hash = t.dataset.go; return; }
    const tg = e.target.closest('[data-toggle]');
    if (tg) { tg.classList.toggle('on'); return; }
    if (e.target.closest('.menu-btn')) document.body.classList.toggle('nav-open');
    if (e.target.closest('.scrim')) document.body.classList.remove('nav-open');
  });
  window.addEventListener('hashchange', render);

  // nav badges
  const unread = D.inbox.filter((i) => i.unread).length;
  const escN = D.clients.filter((c) => c.flag === 'esc').length;
  $('#b-inbox').textContent = unread || '';
  $('#b-dialogs').textContent = escN || '';
  $('#autonomy').textContent = D.live ? `${D.total} диалогов` : D.autonomy + '%';
  $('#autonomy-label').textContent = D.live ? 'Снимок директа:' : 'Автономно';
  $('#now').textContent = D.now;
  if (D.live) {
    Object.assign(ROUTES, {
      pulse: ['Пульс', 'Директ глазами агента'],
      inbox: ['Входящие', 'Что агент нашёл в директе'],
      dialogs: ['Диалоги', 'Весь директ Instagram'],
      pipeline: ['Все диалоги', 'Таблица с приоритетами и флагами'],
      reports: ['Отчёты', 'Кодовые слова, нагрузка, выводы агента'],
    });
    document.querySelectorAll('.nav a[data-route="agents"], .nav a[data-route="kb"]').forEach((a) => (a.style.display = 'none'));
    const pl = $('.nav a[data-route="pipeline"]');
    pl.lastChild.textContent = 'Все диалоги';
  }
  document.addEventListener('input', (e) => {
    const sel = e.target.dataset && e.target.dataset.filter;
    if (!sel) return;
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll(sel).forEach((el) => (el.style.display = !q || (el.dataset.s || el.textContent.toLowerCase()).includes(q) ? '' : 'none'));
  });
  render();
};
