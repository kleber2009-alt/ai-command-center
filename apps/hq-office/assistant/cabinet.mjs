/* Test cabinet of one product in the office — «Нейроворонка» (hq2.aicex.club/neuro/, /api/assistant/cabinet/*).

   The marketing model from the audit of 5.11, tried on one product before it goes to the whole department:
   - the campaign is in the centre, not the task: one main number (goal) with a target and a pace;
   - six contours instead of loose agents (CONTOURS), each with its own number, counted from the data below;
   - the funnel has 8 steps (STEPS) — numbers by day, so the place where the data stops is visible;
   - every unit of content gets a tag (nf-001…) and a tagged link: bot start, utm on the landing, code word —
     its touches, leads, registrations, applications, payments and revenue are counted per tag;
   - a finding is a task with an owner: «В работу» sends it to the agent through the desk (source 'cabinet');
     open more than 2 days — escalated: shown first and sent to the owner's Telegram (the notify bot);
   - one screen a day: «Разбор дня» gives the snapshot to the agent «Штаб» as a desk task.

   Owner only (it is a test). Data — DATA_DIR/cabinet/<id>.json.
     GET  cabinet/neuro                 state + the computed screen (today)
     POST cabinet/neuro {action, …}     campaign | contour | day | unit | unit-update | unit-remove | result |
                                        finding | finding-task | finding-done | finding-reopen | finding-remove | brief
     POST cabinet/neuro/hook            an event from outside (ChatPlace incoming webhook, payments): {tag, step, n, amount, date}
                                        with the header x-cabinet-token = HQ_CABINET_TOKEN */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const STEPS = [
  { id:'reach', name:'Охват', hint:'просмотры контента кампании' },
  { id:'touch', name:'Касание', hint:'кодовое слово, клик, переход' },
  { id:'lead', name:'Подписка в бота', hint:'старт бота / подписка' },
  { id:'reg', name:'Регистрация', hint:'записались на урок или эфир' },
  { id:'came', name:'Пришли', hint:'открыли урок / пришли на эфир' },
  { id:'offer', name:'Дошли до оффера', hint:'досмотрели до продажи' },
  { id:'apply', name:'Заявка', hint:'заявка или переписка о покупке' },
  { id:'paid', name:'Оплата', hint:'оплатили' },
];
const STEP_IDS = STEPS.map(s => s.id);
// a sane conversion of each step from the previous one — the bottleneck is the step furthest below it
const BENCH = { touch:0.01, lead:0.5, reg:0.4, came:0.35, offer:0.6, apply:0.1, paid:0.3 };
export const UNIT_TYPES = { reel:'Рилс', carousel:'Карусель', threads:'Threads', stories:'Сторис', post:'Пост в канале', ad:'Реклама', mailing:'Рассылка', live:'Эфир / урок', other:'Другое' };

export const CONTOURS = [
  { id:'hq', name:'Штаб', role:'Цель, приоритеты, один экран в день, находки → задачи', metric:'Оплаты к цели', kind:'goal',
    agents:['shtab', 'analytics', 'socialstats', 'finance'] },
  { id:'strategy', name:'Стратегия и бренд', role:'Оффер, позиционирование, голос бренда, кейсы', metric:'Дошли до оффера → заявка', kind:'conv', from:'offer', to:'apply',
    agents:['brandkeeper', 'cases', 'audience', 'market'] },
  { id:'editorial', name:'Редакция', role:'Темы, контент-план, сценарии, залёты', metric:'Охват за 7 дней', kind:'sum', step:'reach',
    agents:['publish', 'scripts', 'viral', 'threads'] },
  { id:'production', name:'Производство', role:'Монтаж, аватар, карусели, презентации, креативы', metric:'Единиц контента за 7 дней', kind:'units',
    agents:['montage', 'avatar', 'carousel', 'remake', 'slides', 'creatives'] },
  { id:'funnels', name:'Воронки', role:'Бот, прогрев, лид-магнит, лендинг, ответы на кодовые слова', metric:'Подписка → пришли', kind:'conv', from:'lead', to:'came',
    agents:['funnels', 'leadmagnet', 'landings', 'comments'] },
  { id:'launch', name:'Запуски и трафик', role:'Запуск, рассылки, реклама Meta', metric:'Подписки в бота за 7 дней', kind:'sum', step:'lead',
    agents:['launch', 'mailings', 'metaads', 'adreports'] },
];
const CONTOUR_IDS = CONTOURS.map(c => c.id);
export const ESCALATE_MS = 2 * 864e5;
export const CABINETS = { neuro:{ product:'Нейроворонка', tagPrefix:'nf' } };

const msk = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone:'Europe/Moscow' }).format(d);
const str = (v, n = 300) => String(v ?? '').trim().slice(0, n);
const num = v => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0; };
const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const url = v => { const s = str(v, 500); return /^https?:\/\/\S+$/i.test(s) ? s : ''; };
const daysBack = (n, from = new Date()) => Array.from({ length:n }, (_, i) => msk(new Date(from.getTime() - i * 864e5)));

function blank(id) {
  const c = CABINETS[id];
  return {
    id, created:new Date().toISOString(),
    campaign:{ name:`${c.product} — тестовая кампания`, product:c.product, goalTarget:0, start:msk(), end:'', budget:0, botUrl:'', landingUrl:'', note:'' },
    targets:{}, days:{}, units:[], seq:0, findings:[], tasks:[], log:[],
  };
}

// the tagged links of a unit: bot start parameter, utm on the landing
export function linksOf(cab, u) {
  const out = {};
  const bot = cab.campaign.botUrl;
  if (bot) out.bot = bot.replace(/[?#].*$/, '') + '?start=' + u.tag;
  const land = cab.campaign.landingUrl;
  if (land) {
    const q = new URLSearchParams({ utm_source:u.type, utm_medium:'content', utm_campaign:cab.id, utm_content:u.tag });
    out.landing = land + (land.includes('?') ? '&' : '?') + q;
  }
  return out;
}

const sumDays = (cab, dates) => Object.fromEntries([...STEP_IDS, 'revenue'].map(k => [k, dates.reduce((s, d) => s + (cab.days[d]?.[k] || 0), 0)]));
const hasStep = (cab, dates, k) => dates.some(d => cab.days[d] && cab.days[d][k] != null);

export function funnelOf(cab, dates) {
  const sum = sumDays(cab, dates);
  const steps = STEPS.map((s, i) => {
    const prev = i ? STEPS[i - 1].id : null, has = hasStep(cab, dates, s.id);
    const conv = prev && sum[prev] > 0 && has ? sum[s.id] / sum[prev] : null;
    return { ...s, n:sum[s.id], has, conv, bench:BENCH[s.id] ?? null, ratio:conv != null && BENCH[s.id] ? conv / BENCH[s.id] : null };
  });
  // where the data stops: steps without numbers after the first step that has them
  const firstHas = steps.findIndex(s => s.has);
  const gaps = firstHas < 0 ? [] : steps.slice(firstHas + 1).filter(s => !s.has).map(s => ({ id:s.id, name:s.name }));
  const gap = gaps[0] || null;
  const known = steps.filter(s => s.ratio != null && s.n >= 0);
  const bottleneck = known.length ? known.reduce((a, b) => b.ratio < a.ratio ? b : a) : null;
  return { steps, revenue:sum.revenue, gap, gaps, bottleneck:bottleneck && bottleneck.ratio < 1 ? { id:bottleneck.id, name:bottleneck.name, conv:bottleneck.conv, bench:bottleneck.bench } : null };
}

function contourValue(cab, c, week, total) {
  if (c.kind === 'goal') return { value:total.steps.find(s => s.id === 'paid').n, target:num(cab.campaign.goalTarget) || null, unit:'оплат' };
  if (c.kind === 'sum') return { value:week.steps.find(s => s.id === c.step).n, target:num(cab.targets[c.id]) || null, unit:'' };
  if (c.kind === 'units') {
    const from = daysBack(7).at(-1);
    return { value:cab.units.filter(u => (u.date || '') >= from).length, target:num(cab.targets[c.id]) || null, unit:'шт.' };
  }
  const f = week.steps.find(s => s.id === c.from), t = week.steps.find(s => s.id === c.to);
  return { value:f.n > 0 && t.has ? Math.round(t.n / f.n * 1000) / 10 : null, target:num(cab.targets[c.id]) || null, unit:'%' };
}

// the one screen of the day
export function screen(cab, { desk, agents = {}, nowMs = Date.now() } = {}) {
  const today = msk(new Date(nowMs)), week = daysBack(7, new Date(nowMs));
  const start = isDate(cab.campaign.start) ? cab.campaign.start : (Object.keys(cab.days).sort()[0] || today);
  const allDates = Object.keys(cab.days).filter(d => d >= start).sort();
  const w = funnelOf(cab, week), total = funnelOf(cab, allDates);
  const yesterday = funnelOf(cab, [msk(new Date(nowMs - 864e5))]);
  const paid = total.steps.find(s => s.id === 'paid').n, target = num(cab.campaign.goalTarget);
  let pace = null;
  if (target && isDate(cab.campaign.end) && cab.campaign.end > start) {
    const span = (Date.parse(cab.campaign.end) - Date.parse(start)) / 864e5, gone = Math.min(span, Math.max(0, (Date.parse(today) - Date.parse(start)) / 864e5 + 1));
    const due = target * gone / span;
    pace = { due:Math.round(due * 10) / 10, ahead:paid >= due, daysLeft:Math.max(0, Math.round(span - gone)) };
  }
  const taskOf = id => { const v = id && desk?.get(id); return v ? { id:v.id, status:v.status, statusText:v.statusText, title:v.route?.title || v.text.slice(0, 80), agent:v.agent?.name || '' } : null; };
  const findings = cab.findings.map(f => {
    const age = nowMs - Date.parse(f.created);
    return { ...f, ageDays:Math.floor(age / 864e5), overdue:f.status !== 'done' && age > ESCALATE_MS, task:taskOf(f.taskId),
      ownerName:agents[f.owner]?.name || f.owner || '', contourName:CONTOURS.find(c => c.id === f.contour)?.name || '' };
  }).sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.overdue - a.overdue || Date.parse(a.created) - Date.parse(b.created));
  const units = cab.units.map(u => ({ ...u, typeName:UNIT_TYPES[u.type] || u.type, links:linksOf(cab, u),
    contourName:CONTOURS.find(c => c.id === u.contour)?.name || '' }))
    .sort((a, b) => (b.stats.paid || 0) - (a.stats.paid || 0) || (b.stats.apply || 0) - (a.stats.apply || 0) || (b.stats.lead || 0) - (a.stats.lead || 0) || String(b.date).localeCompare(String(a.date)));
  const contours = CONTOURS.map(c => {
    const open = findings.filter(f => f.contour === c.id && f.status !== 'done');
    return { ...c, ...contourValue(cab, c, w, total), agents:c.agents.filter(id => agents[id]).map(id => ({ id, name:agents[id].name, color:agents[id].color })),
      open:open.length, overdue:open.filter(f => f.overdue).length };
  });
  const tasks = cab.tasks.map(taskOf).filter(Boolean).slice(0, 30);
  return {
    today, campaign:cab.campaign, goal:{ paid, target:target || null, revenue:total.revenue, pace },
    week:w, total, yesterday:yesterday.steps.map(s => ({ id:s.id, n:s.n, has:s.has })), contours, units, findings, tasks,
    counts:{ units:units.length, untracked:units.filter(u => !STEP_IDS.some(k => u.stats[k])).length,
      open:findings.filter(f => f.status !== 'done').length, overdue:findings.filter(f => f.overdue).length,
      tasksOpen:tasks.filter(t => !['done', 'cancelled'].includes(t.status)).length },
    days:Object.keys(cab.days).sort().slice(-21).map(d => ({ date:d, ...cab.days[d] })),
    steps:STEPS, types:UNIT_TYPES, escalateDays:ESCALATE_MS / 864e5,
  };
}

// the text the agent «Штаб» gets for «Разбор дня»
export function briefText(cab, s) {
  const pct = v => v == null ? '—' : (v * 100).toFixed(1).replace('.', ',') + '%';
  const lines = [
    `Кабинет «${cab.campaign.product}» (тестовый, hq2.aicex.club/neuro/). Разбор дня ${s.today}: один экран вместо пяти отчётов.`,
    `Кампания: ${cab.campaign.name}${cab.campaign.end ? `, до ${cab.campaign.end}` : ''}. Главная цифра — оплаты: ${s.goal.paid}${s.goal.target ? ` из ${s.goal.target}` : ' (цель не задана)'}${s.goal.pace ? `, по плану на сегодня ${s.goal.pace.due} — ${s.goal.pace.ahead ? 'идём в плане' : 'отстаём'}` : ''}. Выручка: ${s.goal.revenue}.`,
    'Воронка за 7 дней: ' + s.week.steps.map(x => `${x.name} ${x.has ? x.n : 'нет данных'}${x.conv != null ? ` (${pct(x.conv)})` : ''}`).join(' → ') + '.',
    s.week.gaps.length ? `Нет данных на шагах: ${s.week.gaps.map(g => `«${g.name}»`).join(', ')}.` : '',
    s.week.bottleneck ? `Узкое место: «${s.week.bottleneck.name}» — ${pct(s.week.bottleneck.conv)} при норме ${pct(s.week.bottleneck.bench)}.` : '',
    'Контуры: ' + s.contours.map(c => `${c.name} — ${c.metric}: ${c.value ?? 'нет данных'}${c.unit && c.value != null ? ' ' + c.unit : ''}${c.target ? ` / цель ${c.target}` : ''}${c.open ? `, открытых находок ${c.open}${c.overdue ? ` (просрочено ${c.overdue})` : ''}` : ''}`).join('; ') + '.',
    s.units.length ? 'Контент по меткам (лучшие сверху): ' + s.units.slice(0, 12).map(u => `${u.tag} ${u.typeName} «${u.title}» — касаний ${u.stats.touch || 0}, подписок ${u.stats.lead || 0}, заявок ${u.stats.apply || 0}, оплат ${u.stats.paid || 0}`).join('; ') + '.' : 'Контента с метками пока нет.',
    s.findings.filter(f => f.status !== 'done').length ? 'Открытые находки: ' + s.findings.filter(f => f.status !== 'done').map(f => `«${f.text}» — ${f.contourName}, ответственный ${f.ownerName || 'не назначен'}, ${f.ageDays} дн.${f.overdue ? ', ПРОСРОЧЕНА' : ''}`).join('; ') + '.' : 'Открытых находок нет.',
    '',
    'Сделай один экран дня (страница out/index.html, коротко): 1) главная цифра и темп; 2) что изменилось со вчера; 3) узкое место воронки и где нет данных; 4) три действия на сегодня — у каждого контур, ответственный агент и срок не больше 2 дней; 5) новые находки списком «находка — контур — ответственный». Не выдумывай цифры: чего нет в данных — так и пиши «нет данных».',
  ];
  return lines.filter(x => x !== '').join('\n');
}

export function initCabinet({ dataDir, desk = null, agents = () => ({}), notify = null, token = process.env.HQ_CABINET_TOKEN || '' }) {
  const DIR = path.join(dataDir, 'cabinet');
  fs.mkdirSync(DIR, { recursive:true });
  const cache = {};
  const file = id => path.join(DIR, id + '.json');
  function load(id) {
    if (cache[id]) return cache[id];
    let c = null;
    try { c = JSON.parse(fs.readFileSync(file(id), 'utf8')); } catch {}
    return (cache[id] = { ...blank(id), ...(c || {}) });
  }
  function save(cab) { const f = file(cab.id); fs.writeFileSync(f + '.tmp', JSON.stringify(cab, null, 1)); fs.renameSync(f + '.tmp', f); }
  const note = (cab, text) => { cab.log.unshift({ at:new Date().toISOString(), text:str(text, 300) }); cab.log.length = Math.min(cab.log.length, 200); };
  const unitByTag = (cab, tag) => cab.units.find(u => u.tag === String(tag || '').trim().toLowerCase());

  // an event: adds n to the day (and to the unit when tagged); amount → revenue (paid)
  function addEvent(cab, { tag, step, n = 1, amount = 0, date }) {
    if (!STEP_IDS.includes(step)) throw new Error('Неизвестный шаг воронки.');
    const d = isDate(date) ? date : msk(), k = num(n) || 1, sum = num(amount);
    const day = (cab.days[d] ||= {});
    day[step] = (day[step] || 0) + k;
    if (sum) day.revenue = (day.revenue || 0) + sum;
    const u = tag ? unitByTag(cab, tag) : null;
    if (tag && !u) throw new Error(`Нет контента с меткой ${tag}.`);
    if (u) { u.stats[step] = (u.stats[step] || 0) + k; if (sum) u.stats.revenue = (u.stats.revenue || 0) + sum; }
    return { date:d, unit:u?.tag || '' };
  }

  function sendFinding(cab, f) {
    if (!desk) throw new Error('Рабочий стол недоступен.');
    const c = CONTOURS.find(x => x.id === f.contour);
    const text = `Кабинет «${cab.campaign.product}» (тест), контур «${c?.name || '—'}». Находка: ${f.text}\n` +
      `${f.detail ? `Подробности: ${f.detail}\n` : ''}Срок — 2 дня, дальше находка уходит Илье. Сделай, что нужно, и в отчёте напиши, что изменилось в цифрах кампании или как это проверить.`;
    const { task } = desk.createTask({ text, agent:f.owner || '', source:'cabinet' });
    f.taskId = task.id; f.status = 'task';
    if (!cab.tasks.includes(task.id)) cab.tasks.unshift(task.id);
    return task;
  }

  function act(id, b) {
    const cab = load(id), a = String(b.action || '');
    const A = agents();
    if (a === 'campaign') {
      const c = cab.campaign;
      for (const k of ['name', 'note']) if (b[k] != null) c[k] = str(b[k], k === 'note' ? 1000 : 120);
      for (const k of ['start', 'end']) if (b[k] != null) c[k] = isDate(b[k]) ? b[k] : '';
      for (const k of ['goalTarget', 'budget']) if (b[k] != null) c[k] = num(b[k]);
      for (const k of ['botUrl', 'landingUrl']) if (b[k] != null) c[k] = url(b[k]);
      note(cab, 'изменил кампанию');
    } else if (a === 'contour') {
      if (!CONTOUR_IDS.includes(b.id)) throw new Error('Нет такого контура.');
      cab.targets[b.id] = num(b.target);
      note(cab, `цель контура «${CONTOURS.find(c => c.id === b.id).name}»: ${cab.targets[b.id]}`);
    } else if (a === 'day') {
      if (!isDate(b.date)) throw new Error('Нужна дата.');
      const day = (cab.days[b.date] ||= {});
      for (const k of [...STEP_IDS, 'revenue']) {
        if (b.values?.[k] === '' || b.values?.[k] === null) delete day[k];
        else if (b.values?.[k] != null) day[k] = num(b.values[k]);
      }
      if (!Object.keys(day).length) delete cab.days[b.date];
      note(cab, `внёс цифры за ${b.date}`);
    } else if (a === 'unit') {
      const title = str(b.title, 160);
      if (!title) throw new Error('Назовите единицу контента.');
      const tag = `${CABINETS[id].tagPrefix}-${String(++cab.seq).padStart(3, '0')}`;
      const u = { tag, type:UNIT_TYPES[b.type] ? b.type : 'other', title, url:url(b.url), contour:CONTOUR_IDS.includes(b.contour) ? b.contour : 'editorial',
        word:str(b.word, 40), date:isDate(b.date) ? b.date : msk(), created:new Date().toISOString(), stats:{} };
      cab.units.unshift(u);
      note(cab, `добавил контент ${tag} «${title}»`);
      save(cab);
      return { unit:{ ...u, links:linksOf(cab, u) } };
    } else if (a === 'unit-update') {
      const u = unitByTag(cab, b.tag);
      if (!u) throw new Error('Нет такой метки.');
      for (const k of ['title', 'word']) if (b[k] != null) u[k] = str(b[k], k === 'word' ? 40 : 160);
      if (b.url != null) u.url = url(b.url);
      if (b.type && UNIT_TYPES[b.type]) u.type = b.type;
      if (CONTOUR_IDS.includes(b.contour)) u.contour = b.contour;
      if (isDate(b.date)) u.date = b.date;
      if (b.stats) for (const k of [...STEP_IDS, 'revenue']) if (b.stats[k] != null) u.stats[k] = num(b.stats[k]);
      note(cab, `обновил ${u.tag}`);
    } else if (a === 'unit-remove') {
      const i = cab.units.findIndex(u => u.tag === b.tag);
      if (i < 0) throw new Error('Нет такой метки.');
      note(cab, `убрал ${b.tag}`); cab.units.splice(i, 1);
    } else if (a === 'result') {
      const r = addEvent(cab, b);
      note(cab, `${STEPS.find(s => s.id === b.step).name} +${num(b.n) || 1}${r.unit ? ` по ${r.unit}` : ''}`);
    } else if (a === 'finding') {
      const text = str(b.text, 400);
      if (!text) throw new Error('Опишите находку.');
      const f = { id:crypto.randomBytes(4).toString('hex'), text, detail:str(b.detail, 2000), contour:CONTOUR_IDS.includes(b.contour) ? b.contour : 'hq',
        owner:A[b.owner] ? b.owner : '', created:new Date().toISOString(), status:'open', taskId:'', escalated:'' };
      cab.findings.unshift(f);
      note(cab, `находка: ${text}`);
      if (b.toTask) sendFinding(cab, f);
    } else if (a === 'finding-task' || a === 'finding-done' || a === 'finding-reopen' || a === 'finding-remove') {
      const f = cab.findings.find(x => x.id === b.id);
      if (!f) throw new Error('Нет такой находки.');
      if (a === 'finding-task') { if (b.owner && A[b.owner]) f.owner = b.owner; sendFinding(cab, f); note(cab, `находка в работу: ${f.text}`); }
      if (a === 'finding-done') { f.status = 'done'; f.closedAt = new Date().toISOString(); note(cab, `находка закрыта: ${f.text}`); }
      if (a === 'finding-reopen') { f.status = f.taskId ? 'task' : 'open'; f.closedAt = ''; f.created = new Date().toISOString(); f.escalated = ''; note(cab, `находка снова открыта: ${f.text}`); }
      if (a === 'finding-remove') { cab.findings.splice(cab.findings.indexOf(f), 1); note(cab, `находка удалена: ${f.text}`); }
    } else if (a === 'brief') {
      if (!desk) throw new Error('Рабочий стол недоступен.');
      const s = screen(cab, { desk, agents:A });
      const { task } = desk.createTask({ text:briefText(cab, s), agent:A.shtab ? 'shtab' : '', source:'cabinet' });
      cab.tasks.unshift(task.id);
      note(cab, 'разбор дня отдан Штабу');
      save(cab);
      return { task:{ id:task.id } };
    } else throw new Error('Неизвестное действие.');
    save(cab);
    return {};
  }

  // the escalation: a finding open more than 2 days goes to the owner once; a finding whose task was accepted closes itself
  async function tick(nowMs = Date.now()) {
    for (const id of Object.keys(CABINETS)) {
      if (!fs.existsSync(file(id))) continue;
      const cab = load(id); let changed = false;
      for (const f of cab.findings) {
        if (f.status === 'task' && f.taskId && desk?.get(f.taskId)?.status === 'done') {
          f.status = 'done'; f.closedAt = new Date(nowMs).toISOString(); changed = true; note(cab, `находка закрыта — задача принята: ${f.text}`);
          continue;
        }
        if (f.status !== 'done' && !f.escalated && nowMs - Date.parse(f.created) > ESCALATE_MS) {
          f.escalated = new Date(nowMs).toISOString(); changed = true;
          const who = agents()[f.owner]?.name || 'не назначен';
          note(cab, `находка ушла Илье — открыта больше 2 дней: ${f.text}`);
          if (notify) await notify(`⚠️ Кабинет «${cab.campaign.product}»: находка висит больше 2 дней\n«${f.text}»\nКонтур: ${CONTOURS.find(c => c.id === f.contour)?.name || '—'} · ответственный: ${who}\nhttps://hq2.aicex.club/neuro/#f-${f.id}`).catch(e => console.error('cabinet notify:', e.message));
        }
      }
      if (changed) save(cab);
    }
  }
  setInterval(() => { tick().catch(e => console.error('cabinet tick:', e.message)); }, 10 * 60e3).unref();

  const json = (res, code, body) => { res.writeHead(code, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }); res.end(JSON.stringify(body)); };
  async function readJson(req, limit = 64e3) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > limit) { const e = new Error('too large'); e.code = 413; throw e; } chunks.push(c); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
  }

  async function handle(req, res, rest, who) {
    const [id, sub] = rest.split('/');
    if (!CABINETS[id]) return json(res, 404, { error:'Нет такого кабинета.' });
    if (req.method === 'POST' && sub === 'hook') {
      const t = String(req.headers['x-cabinet-token'] || new URL(req.url, 'http://x').searchParams.get('token') || '');
      if (!token || t.length !== token.length || !crypto.timingSafeEqual(Buffer.from(t), Buffer.from(token))) return json(res, 403, { error:'token' });
      const b = await readJson(req);
      const cab = load(id);
      try { const r = addEvent(cab, { tag:b.tag, step:b.step, n:b.n, amount:b.amount, date:b.date }); note(cab, `событие извне: ${b.step}${r.unit ? ` по ${r.unit}` : ''}`); save(cab); return json(res, 200, { ok:true, ...r }); }
      catch (e) { return json(res, 400, { error:e.message }); }
    }
    if (!who?.owner) return json(res, 403, { error:'Кабинет пока тестовый — он открыт только владельцу.' });
    if (req.method === 'GET' && !sub) return json(res, 200, { ...screen(load(id), { desk, agents:agents() }), log:load(id).log.slice(0, 30), hook:Boolean(token) });
    if (req.method === 'POST' && !sub) {
      const b = await readJson(req);
      try { const r = act(id, b); return json(res, 200, { ok:true, ...r, ...screen(load(id), { desk, agents:agents() }), log:load(id).log.slice(0, 30), hook:Boolean(token) }); }
      catch (e) { return json(res, 400, { error:e.message }); }
    }
    return json(res, 404, { error:'not found' });
  }

  return { handle, act, tick, load, screen:id => screen(load(id), { desk, agents:agents() }) };
}
