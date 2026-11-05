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

   The office of «Нейроворонка» (the third style of the site, ?theme=neuro) works on its own through this module:
   - the routine ROUTINES: «Разбор дня» → Штаб every morning at HQ_NEURO_BRIEF_AT (09:40 МСК), the week of content (Mon), the roadmap
     (Mon, Thu), the progress of students (Tue, Fri, after the sales start), the weekly summary of stages and the report to the main office
     (Fri); HQ_NEURO_DAILY=off — only by the buttons;
   - the reports end with lines «НАХОДКА: … | контур | агент»: when one comes for review, they become findings, and the first
     HQ_NEURO_AUTO_MAX (3) of them go to their agents as desk tasks at once (HQ_NEURO_AUTO=off — they wait for «В работу»);
   - PLAN — the plan of the project as a checklist with owners and criteria; contextFiles — what every agent of the office gets with a task.
   It answers to the main office: every task goes through the shared desk, the quality check and the owner's review.

   Owner only. Data — DATA_DIR/cabinet/<id>.json.
     GET  cabinet/neuro                 state + the computed screen (today)
     POST cabinet/neuro {action, …}     campaign | contour | day | unit | unit-update | unit-remove | result |
                                        finding | finding-task | finding-done | finding-reopen | finding-remove | brief
     POST cabinet/neuro/hook            an event from outside (ChatPlace incoming webhook, payments): {tag, step, n, amount, date}
                                        with the header x-cabinet-token = HQ_CABINET_TOKEN */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MATERIALS, MATERIAL_KINDS, PLAN_STARTED } from './neuro-materials.mjs';

// the funnel of the plan (neuro-plan.md → «Метрики и экономика»): content → code word → bot → VSL → landing → payment → lessons → upsell
export const STEPS = [
  { id:'reach', name:'Охват', hint:'просмотры контента кампании (статистика Instagram)' },
  { id:'word', name:'Кодовое слово', hint:'написали кодовое слово (сервис автоответов)' },
  { id:'bot', name:'Старт бота', hint:'нажали «старт» в боте' },
  { id:'vsl', name:'Досмотр VSL', hint:'досмотрели VSL до оффера (события бота)' },
  { id:'landing', name:'Лендинг', hint:'перешли по ссылке на лендинг (метки бота)' },
  { id:'paid', name:'Оплата', hint:'оплатили (платёжка)' },
  { id:'study', name:'Проходят уроки', hint:'открыли и проходят уроки (платформа уроков)' },
  { id:'upsell', name:'Мастер-группа', hint:'перешли в Мастер-группу' },
];
const STEP_IDS = STEPS.map(s => s.id);
// a sane conversion of each step from the previous one — the weakest stage is the one furthest below it (targets — after the test week)
const BENCH = { word:0.01, bot:0.6, vsl:0.4, landing:0.3, paid:0.08, study:0.7, upsell:0.1 };
export const UNIT_TYPES = { reel:'Рилс', carousel:'Карусель', vsl:'VSL', lesson:'Урок', stories:'Сторис', post:'Пост в канале', ad:'Реклама', mailing:'Сообщение бота', other:'Другое' };

// six contours of the office «Нейроворонка» — the same as office.config.js → neuro.contours, each with its own number
export const CONTOURS = [
  { id:'hq', name:'Штаб и запуск', role:'Оператор воронки, дорожная карта, контроль качества, оферта, связь с главным офисом', metric:'Оплаты к цели', kind:'goal',
    agents:['shtab', 'nfroadmap', 'nfqa', 'nflegal', 'nfliaison'] },
  { id:'strategy', name:'Стратегия и база знаний', role:'Блок 0: карта смыслов, оффер и тарифы, бренд, голос клиента, кейсы', metric:'Досмотр VSL → лендинг', kind:'conv', from:'vsl', to:'landing',
    agents:['nfkb', 'nfoffer', 'brandkeeper', 'nfvoice', 'cases'] },
  { id:'content', name:'Контент-завод', role:'Блок 1: ресёрч, сценарии, аватар, монтаж, карусели, публикации с метками', metric:'Охват за 7 дней', kind:'sum', step:'reach',
    agents:['nfresearch', 'nfscripts', 'nfpublish', 'nfavatar', 'nfvideo', 'nfcarousel'] },
  { id:'funnels', name:'Воронка и продажи', role:'Блоки 2–4: кодовые слова, бот и VSL, дожим, лендинг, оплата и доступ', metric:'Кодовое слово → оплата', kind:'conv', from:'word', to:'paid',
    agents:['nfwords', 'nfbot', 'nffollow', 'nflanding', 'nfpay'] },
  { id:'product', name:'Продукт и ученики', role:'Блок 5: уроки, презентации, запись, платформа, успеваемость, поддержка, апсейл', metric:'Оплатили → проходят уроки', kind:'conv', from:'paid', to:'study',
    agents:['nfmethod', 'nfslides', 'nflessons', 'nfplatform', 'nfprogress', 'nfsupport', 'nfupsell'] },
  { id:'analytics', name:'Метрики и аналитика', role:'Блок 6: конверсия этапов, сквозные метки, экономика, платный трафик', metric:'Этапов воронки с данными', kind:'coverage',
    agents:['nfanalyst', 'nftracking', 'nfeconomics', 'nfads'] },
];
// the plan as a checklist: blocks of the system with the criterion «готово, когда», the nine elements, the offer's obligations
// and the open decisions — each has an owner; «В работу» gives it to them with the criterion, an accepted task closes it
export const PLAN = [
  { group:'Блоки системы', items:[
    { id:'b0', name:'0. База знаний', owner:'nfkb', done:'Любой сценарий можно написать, ссылаясь только на базу, без ручных пояснений' },
    { id:'b1', name:'1. Контент-завод', owner:'nfscripts', done:'Неделя контента собирается за один цикл, Илья тратит не больше часа на утверждение' },
    { id:'b2', name:'2. Кодовые слова', owner:'nfwords', done:'Комментарий со словом за минуту приводит человека в бот, переход отслеживается' },
    { id:'b3', name:'3. Бот + VSL', owner:'nfbot', done:'Новый человек проходит путь от старта до ссылки на оплату без участия команды' },
    { id:'b4', name:'4. Лендинг', owner:'nflanding', done:'Оплата проходит, доступ выдаётся автоматически, чек уходит' },
    { id:'b5', name:'5. Продукт', owner:'nfmethod', done:'Все уроки потока записаны и открываются по расписанию из оферты' },
    { id:'b6', name:'6. Аналитика', owner:'nfanalyst', done:'Видно конверсию каждого этапа и доход по каждому кодовому слову' },
  ] },
  { group:'Что держит деньги и обязательства', items:[
    { id:'e1', name:'Автоответы на кодовые слова (API Meta)', owner:'nfwords', done:'Автоответы только через официальный API Meta, без серых ботов' },
    { id:'e2', name:'Дожим в боте 3–7 дней', owner:'nffollow', done:'Серия для досмотревших VSL и не купивших: кейсы, возражения, дедлайн' },
    { id:'e3', name:'Сегментация в боте', owner:'nffollow', done:'Теги: пришёл, досмотрел VSL, кликнул на лендинг, купил' },
    { id:'e4', name:'Оплата: две платёжки, 54-ФЗ, автовыдача', owner:'nfpay', done:'Тестовая покупка прошла, доступ выдан сам, чек ушёл' },
    { id:'e5', name:'Платформа уроков', owner:'nfplatform', done:'Платформа выбрана, уроки открываются по расписанию, доступ после оплаты' },
    { id:'e6', name:'Сквозная аналитика', owner:'nftracking', done:'Метка на каждое кодовое слово, события бота и оплаты приходят в кабинет' },
    { id:'e7', name:'Юридический контур', owner:'nflegal', done:'Оферта, согласие 152-ФЗ в боте, маркировка ИИ и рекламы' },
    { id:'e8', name:'Контроль качества', owner:'nfqa', done:'Чек-лист и утверждение Ильи перед каждой публикацией' },
    { id:'e9', name:'Апсейл в Мастер-группу', owner:'nfupsell', done:'Переход в старший продукт в конце курса и в боте' },
  ] },
  { group:'Обязательства в оферте', items:[
    { id:'o1', name:'Срок доступа и дата выхода каждого урока', owner:'nflegal', done:'Указано в оферте, график ведёт методист' },
    { id:'o2', name:'Формат поддержки: кто отвечает и в какой срок', owner:'nfsupport', done:'Формат и сроки в оферте, ответственный назначен' },
    { id:'o3', name:'Условия возврата', owner:'nflegal', done:'Условия в оферте' },
    { id:'o4', name:'Техподдержка по оплате и доступу — в течение рабочего дня', owner:'nfsupport', done:'База ответов и дежурный' },
    { id:'o5', name:'Обновления курса при смене инструментов', owner:'nfmethod', done:'Правило обновлений в оферте и план' },
    { id:'o6', name:'Обратная связь и кейсы после каждого потока', owner:'cases', done:'Опрос и сбор кейсов после потока' },
  ] },
  { group:'Решения и запуск', items:[
    { id:'d1', name:'Оффер, цена и тарифы', owner:'nfoffer', done:'Утверждены Ильёй' },
    { id:'d2', name:'Формат записи уроков: аватар или живой Илья', owner:'nflessons', done:'Решение и пробный урок' },
    { id:'d3', name:'Первые 3 кодовых слова и темы рилсов', owner:'nfwords', done:'Слова выбраны, автоответы готовы' },
    { id:'d4', name:'Первая версия сценария VSL (2 хука)', owner:'nfbot', done:'Сценарий утверждён' },
    { id:'d5', name:'Тестовая неделя: покупка, доступ, проход воронки', owner:'nfroadmap', done:'От кодового слова до оплаты без сбоев' },
    { id:'d6', name:'Ответственный оператор воронки и поддержки', owner:'shtab', done:'Назначен, график дежурств' },
  ] },
];
const PLAN_ITEMS = PLAN.flatMap(g => g.items.map(i => ({ ...i, group:g.group })));
// the routine of the office: it works on its own (HQ_NEURO_DAILY=off — only by the buttons). dow: 1 = Monday … 7 = Sunday, empty — every day;
// after — from the date the sales start (office.config.js → neuro.start)
export const ROUTINES = [
  { id:'brief', agent:'shtab', at:'09:40', dow:[], name:'Разбор дня', about:'экран дня и находки → задачи' },
  { id:'content-week', agent:'nfscripts', at:'10:30', dow:[1], name:'Неделя контента за один цикл', about:'сценарии рилсов и каруселей недели, текст для аватара, подписи с кодовыми словами — на проверку и утверждение',
    text:'Собери неделю контента Нейроворонки за один цикл (блок 1 плана): идеи от ресёрча и базы знаний → 5 сценариев рилсов и 2 карусели с кодовыми словами → текст для аватара → подписи с кодовым словом и маркировкой ИИ. Сдай одной страницей на утверждение — Илья должен потратить не больше часа.' },
  { id:'roadmap', agent:'nfroadmap', at:'11:00', dow:[1, 4], name:'Статус дорожной карты', about:'блоки и критерии готовности, что мешает старту',
    text:'Проверь статус дорожной карты Нейроворонки: 7 блоков системы и 9 элементов по критериям готовности (in/neuro-cabinet.md → «План»), что горит, что мешает продажам и первому потоку. Новые находки — строками «НАХОДКА: … | контур | агент».' },
  { id:'progress', agent:'nfprogress', at:'12:00', dow:[2, 5], after:'start', name:'Успеваемость потока', about:'кто проходит уроки, кто отстаёт',
    text:'Собери отчёт успеваемости потока Нейроворонки: кто открыл и прошёл уроки, кто отстаёт, кому нужна поддержка, кто кандидат в кейсы и Мастер-группу. Чего нет в данных — так и пиши.' },
  { id:'metrics-week', agent:'nfanalyst', at:'16:00', dow:[5], name:'Сводка недели по этапам', about:'конверсии этапов, слабый этап, гипотезы, обновление базы знаний',
    text:'Собери сводку недели по этапам воронки Нейроворонки (блок 6 плана): конверсия каждого этапа, формула выручки, доход по кодовым словам и меткам, самый слабый этап, 3 гипотезы, что обновить в базе знаний. Новые находки — строками «НАХОДКА: … | контур | агент».' },
  { id:'report', agent:'nfliaison', at:'18:00', dow:[5], name:'Отчёт главному офису', about:'оплаты, этапы, что сделано, что нужно от главного офиса',
    text:'Собери отчёт недели офиса Нейроворонки для главного офиса AICEX: оплаты к цели, этапы воронки, что сделано по плану, что мешает, что нужно от главного офиса (ресурсы, решения Ильи).' },
];
const CONTOUR_IDS = CONTOURS.map(c => c.id);
export const ESCALATE_MS = 2 * 864e5;
const PUBLIC_URL = (process.env.HQ_PUBLIC_URL || 'https://hq2.aicex.club').replace(/\/$/, '');
export const CABINETS = { neuro:{ product:'Нейроворонка', tagPrefix:'nf', name:'Нейроворонка — первый поток', start:'2026-11-10', end:'2026-11-30', landing:'https://neuro.aicex.club/' } };

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
    campaign:{ name:c.name || c.product, product:c.product, goalTarget:0, start:c.start || msk(), end:c.end || '', budget:0, botUrl:'', landingUrl:'', note:'' },
    targets:{}, days:{}, units:[], seq:0, findings:[], tasks:[], log:[], plan:{}, runs:{},
  };
}

// the tagged links of a unit: bot start parameter, utm on the landing
export function linksOf(cab, u) {
  const out = {};
  const bot = cab.campaign.botUrl;
  if (bot) out.bot = bot.replace(/[?#].*$/, '') + '?start=' + u.tag;
  const land = cab.campaign.landingUrl || CABINETS[cab.id]?.landing || '';
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
  if (c.kind === 'coverage') return { value:week.steps.filter(s => s.has).length, target:STEPS.length, unit:'' };
  const f = week.steps.find(s => s.id === c.from), t = week.steps.find(s => s.id === c.to);
  return { value:f.n > 0 && t.has ? Math.round(t.n / f.n * 1000) / 10 : null, target:num(cab.targets[c.id]) || null, unit:'%' };
}

// the one screen of the day
export function screen(cab, { desk, agents = {}, nowMs = Date.now() } = {}) {
  const today = msk(new Date(nowMs)), week = daysBack(7, new Date(nowMs));
  const start = isDate(cab.campaign.start) ? cab.campaign.start : (Object.keys(cab.days).sort()[0] || today);
  const allDates = Object.keys(cab.days).sort();   // the whole campaign: leads gather before the sales start too
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
    .sort((a, b) => (b.stats.paid || 0) - (a.stats.paid || 0) || (b.stats.landing || 0) - (a.stats.landing || 0) || (b.stats.bot || 0) - (a.stats.bot || 0) || String(b.date).localeCompare(String(a.date)));
  const contours = CONTOURS.map(c => {
    const open = findings.filter(f => f.contour === c.id && f.status !== 'done');
    return { ...c, ...contourValue(cab, c, w, total), agents:c.agents.filter(id => agents[id]).map(id => ({ id, name:agents[id].name, color:agents[id].color })),
      open:open.length, overdue:open.filter(f => f.overdue).length };
  });
  const tasks = cab.tasks.map(taskOf).filter(Boolean).slice(0, 30);
  // the plan: every block, element, obligation and decision with its owner, status and task
  const plan = PLAN.map(g => ({ group:g.group, items:g.items.map(i => { const st = cab.plan?.[i.id] || {};
    return { ...i, ownerName:agents[i.owner]?.name || i.owner, status:st.status || (PLAN_STARTED.includes(i.id) ? 'work' : 'todo'), task:taskOf(st.taskId), doneAt:st.doneAt || '',
      materials:MATERIALS.filter(m => m.plan.includes(i.id)).map(m => ({ id:m.id, title:m.title, status:m.status })) }; }) }));
  // ready materials of the project (neuro-materials.mjs) by kind
  const materials = Object.entries(MATERIAL_KINDS).map(([kind, name]) => ({ kind, name, items:MATERIALS.filter(m => m.kind === kind).map(m => ({ ...m,
    planNames:m.plan.map(id => PLAN_ITEMS.find(x => x.id === id)?.name).filter(Boolean) })) })).filter(g => g.items.length);
  const planCount = { all:PLAN_ITEMS.length, done:plan.flatMap(g => g.items).filter(i => i.status === 'done').length, work:plan.flatMap(g => g.items).filter(i => i.status === 'work').length };
  // the revenue formula of the plan: reach × CR(word) × CR(bot) × CR(VSL) × CR(landing) × CR(payment) × check
  const T = Object.fromEntries(total.steps.map(x => [x.id, x]));
  const formula = { reach:T.reach.has ? T.reach.n : null, crs:['word', 'bot', 'vsl', 'landing', 'paid'].map(id => ({ id, name:T[id].name, conv:T[id].conv })),
    check:paid ? Math.round(total.revenue / paid) : null, revenue:total.revenue };
  const startAt = cab.campaign.start, daysToStart = isDate(startAt) ? Math.ceil((Date.parse(startAt) - Date.parse(today)) / 864e5) : null;
  return {
    plan, planCount, formula, materials, materialsCount:{ all:MATERIALS.length, ready:MATERIALS.filter(m => m.status === 'ready').length }, roadmap:{ start:startAt, end:cab.campaign.end, daysToStart },
    routines:ROUTINES.map(r => ({ id:r.id, agent:r.agent, agentName:agents[r.agent]?.name || r.agent, at:r.at, dow:r.dow, after:r.after || '', name:r.name, about:r.about, last:cab.runs?.[r.id] || '' })),
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
export function snapshotText(cab, s) {
  const pct = v => v == null ? '—' : (v * 100).toFixed(1).replace('.', ',') + '%';
  const st = { todo:'не начато', work:'в работе', done:'готово' };
  return [
    `# Кабинет кампании «${cab.campaign.product}» — состояние на ${s.today} (hq2.aicex.club/neuro/)`,
    s.roadmap.start ? `Старт продаж: ${s.roadmap.start}${s.roadmap.daysToStart > 0 ? ` (через ${s.roadmap.daysToStart} дн.)` : ' (идут продажи)'}, система отлажена к ${s.roadmap.end || '—'}.` : '',
    `Кампания: ${cab.campaign.name}${cab.campaign.end ? `, до ${cab.campaign.end}` : ''}. Главная цифра — оплаты: ${s.goal.paid}${s.goal.target ? ` из ${s.goal.target}` : ' (цель не задана)'}${s.goal.pace ? `, по плану на сегодня ${s.goal.pace.due} — ${s.goal.pace.ahead ? 'идём в плане' : 'отстаём'}` : ''}. Выручка: ${s.goal.revenue}.`,
    'Воронка за 7 дней: ' + s.week.steps.map(x => `${x.name} ${x.has ? x.n : 'нет данных'}${x.conv != null ? ` (${pct(x.conv)})` : ''}`).join(' → ') + '.',
    s.week.gaps.length ? `Нет данных на шагах: ${s.week.gaps.map(g => `«${g.name}»`).join(', ')}.` : '',
    s.week.bottleneck ? `Узкое место: «${s.week.bottleneck.name}» — ${pct(s.week.bottleneck.conv)} при норме ${pct(s.week.bottleneck.bench)}.` : '',
    'Контуры: ' + s.contours.map(c => `${c.name} — ${c.metric}: ${c.value ?? 'нет данных'}${c.unit && c.value != null ? ' ' + c.unit : ''}${c.target ? ` / цель ${c.target}` : ''}${c.open ? `, открытых находок ${c.open}${c.overdue ? ` (просрочено ${c.overdue})` : ''}` : ''}`).join('; ') + '.',
    s.formula.check ? `Средний чек: ${s.formula.check}.` : '',
    s.units.length ? 'Контент по меткам (лучшие сверху): ' + s.units.slice(0, 12).map(u => `${u.tag} ${u.typeName} «${u.title}» — кодовое слово ${u.stats.word || 0}, бот ${u.stats.bot || 0}, лендинг ${u.stats.landing || 0}, оплат ${u.stats.paid || 0}`).join('; ') + '.' : 'Контента с метками пока нет.',
    s.findings.filter(f => f.status !== 'done').length ? 'Открытые находки: ' + s.findings.filter(f => f.status !== 'done').map(f => `«${f.text}» — ${f.contourName}, ответственный ${f.ownerName || 'не назначен'}, ${f.ageDays} дн.${f.overdue ? ', ПРОСРОЧЕНА' : ''}`).join('; ') + '.' : 'Открытых находок нет.',
    `## Готовые материалы (${s.materialsCount.all}, готово ${s.materialsCount.ready}) — опирайся на них, не переделывай с нуля`,
    ...s.materials.flatMap(g => [`${g.name}:`, ...g.items.map(m => `- ${m.title} — ${m.status === 'ready' ? 'готово' : 'черновик'}: ${/^media\//.test(m.url) ? PUBLIC_URL + '/' + m.url : m.url}. ${m.note}`)]),
    `## План (${s.planCount.done} из ${s.planCount.all} готово, ${s.planCount.work} в работе)`,
    ...s.plan.flatMap(g => [`${g.group}:`, ...g.items.map(i => `- ${i.name} — ${st[i.status]}; ответственный ${i.ownerName} (${i.owner}); готово, когда: ${i.done}`)]),
  ].filter(x => x !== '').join('\n');
}

// how a report hands findings back to the office: «НАХОДКА: … | контур | агент» lines (parseFindings)
export const FINDINGS_RULE = `В конце отчёта — новые находки, каждая отдельной строкой ровно так (от самой важной, не больше 5, без повторов уже открытых): «НАХОДКА: что не так и что сделать | контур | id агента». Контуры и агенты: ${CONTOURS.map(c => `${c.id} (${c.name}): ${c.agents.join(', ')}`).join('; ')}. Эти строки офис сам превратит в задачи агентам.`;

// the text the agent «Штаб» gets for «Разбор дня» (a task holds 4000 chars: the full state of the cabinet goes as in/neuro-cabinet.md)
export function briefText(cab, s) {
  const pct = v => v == null ? '—' : (v * 100).toFixed(1).replace('.', ',') + '%';
  return [
    `Разбор дня ${s.today} в офисе Нейроворонки: один экран вместо пяти отчётов. Полное состояние кабинета — цифры, контуры, метки, находки, план — в in/neuro-cabinet.md, план проекта — in/neuro-plan.md.`,
    `Оплаты: ${s.goal.paid}${s.goal.target ? ` из ${s.goal.target}` : ' (цель не задана)'}${s.goal.pace ? `, по плану на сегодня ${s.goal.pace.due} — ${s.goal.pace.ahead ? 'идём в плане' : 'отстаём'}` : ''}${s.roadmap.daysToStart > 0 ? `; до старта продаж ${s.roadmap.daysToStart} дн.` : ''}. План: ${s.planCount.done} из ${s.planCount.all} готово, ${s.planCount.work} в работе.`,
    'Воронка за 7 дней: ' + s.week.steps.map(x => `${x.name} ${x.has ? x.n : 'нет данных'}${x.conv != null ? ` (${pct(x.conv)})` : ''}`).join(' → ') + '.',
    s.week.bottleneck ? `Самый слабый этап: «${s.week.bottleneck.name}» — ${pct(s.week.bottleneck.conv)} при норме ${pct(s.week.bottleneck.bench)}.` : '',
    `Открытых находок: ${s.counts.open}, просрочено: ${s.counts.overdue}.`, '',
    'Сделай один экран дня (страница out/index.html, коротко): 1) главная цифра и темп; 2) что изменилось со вчера; 3) самый слабый этап воронки и где нет данных; 4) что горит по плану к старту продаж; 5) три действия на сегодня — у каждого контур, ответственный агент и срок не больше 2 дней. Не выдумывай цифры: чего нет в данных — так и пиши «нет данных».',
    FINDINGS_RULE,
  ].filter(Boolean).join('\n');
}

// «НАХОДКА: текст | контур | агент» in the report of Штаб → findings; contour and agent by id or by name
export function parseFindings(text, agents = {}) {
  const out = [], seen = new Set();
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/НАХОДКА\s*:\s*(.+)$/i);
    if (!m) continue;
    const [t, c = '', a = ''] = m[1].replace(/[*_`»«]+$/g, '').split('|').map(x => x.trim().replace(/^[«"*_`]+|[»"*_`]+$/g, ''));
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    const low = s => s.toLowerCase();
    const contour = CONTOURS.find(x => low(x.id) === low(c) || low(x.name) === low(c) || (c && low(x.name).startsWith(low(c))))?.id || 'hq';
    const agent = agents[a] ? a : Object.values(agents).find(x => low(x.name || '') === low(a))?.id || '';
    out.push({ text:t.slice(0, 400), contour, owner:agent });
  }
  return out.slice(0, 8);
}

export function initCabinet({ dataDir, desk = null, agents = () => ({}), notify = null, token = process.env.HQ_CABINET_TOKEN || '', plan = () => '', office = () => '' }) {
  const DIR = path.join(dataDir, 'cabinet');
  const DAILY = !/^(0|off|false|no)$/i.test(process.env.HQ_NEURO_DAILY || ''), BRIEF_AT = /^\d{2}:\d{2}$/.test(process.env.HQ_NEURO_BRIEF_AT || '') ? process.env.HQ_NEURO_BRIEF_AT : '09:40';
  const AUTO = !/^(0|off|false|no)$/i.test(process.env.HQ_NEURO_AUTO || ''), AUTO_MAX = Math.max(0, Number(process.env.HQ_NEURO_AUTO_MAX ?? 3) || 0);
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
    const text = `Офис Нейроворонки, контур «${c?.name || '—'}». Находка: ${f.text}\n` +
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
      const task = runRoutine(cab, ROUTINES[0], 'по кнопке');
      save(cab);
      return { task:{ id:task.id } };
    } else if (a === 'routine') {
      const r = ROUTINES.find(x => x.id === b.id);
      if (!r) throw new Error('Нет такого шага регламента.');
      const task = runRoutine(cab, r, 'по кнопке');
      save(cab);
      return { task:{ id:task.id } };
    } else if (a === 'plan-task' || a === 'plan-done' || a === 'plan-reopen') {
      const it = PLAN_ITEMS.find(x => x.id === b.id);
      if (!it) throw new Error('Нет такого пункта плана.');
      const st = ((cab.plan ||= {})[it.id] ||= { status:'todo' });
      if (a === 'plan-task') {
        if (!desk) throw new Error('Рабочий стол недоступен.');
        const owner = A[b.owner] ? b.owner : it.owner;
        const { task } = desk.createTask({ text:`План Нейроворонки, «${it.group}»: ${it.name}.\nГотово, когда: ${it.done}.\nСделай, что нужно для этого критерия, и в отчёте честно напиши, выполнен ли он и что осталось. План проекта — in/neuro-plan.md, состояние кампании — in/neuro-cabinet.md. Действия во внешних системах (оплата, ChatPlace, рассылки, реклама) — только через разрешение владельца.`,
          agent:A[owner] ? owner : '', source:'cabinet' });
        Object.assign(st, { status:'work', taskId:task.id, owner });
        if (!cab.tasks.includes(task.id)) cab.tasks.unshift(task.id);
        note(cab, `план в работу: ${it.name}`);
      }
      if (a === 'plan-done') { Object.assign(st, { status:'done', doneAt:new Date().toISOString() }); note(cab, `план готов: ${it.name}`); }
      if (a === 'plan-reopen') { Object.assign(st, { status:st.taskId ? 'work' : 'todo', doneAt:'' }); note(cab, `план снова открыт: ${it.name}`); }
    } else throw new Error('Неизвестное действие.');
    save(cab);
    return {};
  }

  // one step of the routine (or «Разбор дня» by the button): a desk task to its agent; the report is read for findings
  function runRoutine(cab, r, why = '', day = msk()) {
    if (!desk) throw new Error('Рабочий стол недоступен.');
    const A = agents();
    const text = r.id === 'brief' ? briefText(cab, screen(cab, { desk, agents:A })) : `${r.text}\nДанные кампании — in/neuro-cabinet.md, план проекта — in/neuro-plan.md.\n${FINDINGS_RULE}`;
    const { task } = desk.createTask({ text, agent:A[r.agent] ? r.agent : '', source:'cabinet' });
    cab.tasks.unshift(task.id);
    (cab.briefs ||= []).unshift({ taskId:task.id, date:day, parsed:false, routine:r.id });
    cab.briefs.length = Math.min(cab.briefs.length, 60);
    (cab.runs ||= {})[r.id] = day;
    note(cab, `«${r.name}» — ${A[r.agent]?.name || r.agent}${why ? ', ' + why : ''}`);
    return task;
  }
  // the report of Штаб came for review: its «НАХОДКА: …» lines become findings, the first few go to their agents at once
  function takeFindings(cab, b) {
    const v = desk?.get(b.taskId);
    if (!v || !['review', 'done'].includes(v.status) || !v.result?.summary) return false;
    b.parsed = true;
    const A = agents(), open = new Set(cab.findings.filter(f => f.status !== 'done').map(f => f.text.toLowerCase()));
    const found = parseFindings(v.result.summary, A).filter(f => !open.has(f.text.toLowerCase()));
    let sent = 0;
    for (const x of found) {
      const f = { id:crypto.randomBytes(4).toString('hex'), text:x.text, detail:`Из разбора дня Штаба ${b.date}.`, contour:x.contour, owner:x.owner,
        created:new Date().toISOString(), status:'open', taskId:'', escalated:'', from:ROUTINES.find(r => r.id === (b.routine || 'brief'))?.agent || 'shtab' };
      cab.findings.unshift(f);
      if (AUTO && sent < AUTO_MAX && f.owner) { try { sendFinding(cab, f); sent++; } catch (e) { console.error('cabinet auto:', e.message); } }
    }
    const who = ROUTINES.find(r => r.id === (b.routine || 'brief'));
    note(cab, `${who ? `«${who.name}»` : 'Штаб'}: ${found.length} ${found.length === 1 ? 'находка' : 'находок'}${sent ? `, ${sent} сразу ушли агентам` : ''}`);
    return true;
  }
  const mskTime = (d = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Moscow', hour:'2-digit', minute:'2-digit', hour12:false }).format(d);

  // the escalation: a finding open more than 2 days goes to the owner once; a finding whose task was accepted closes itself
  async function tick(nowMs = Date.now()) {
    for (const id of Object.keys(CABINETS)) {
      if (!fs.existsSync(file(id))) continue;
      const cab = load(id); let changed = false;
      // the office works on its own: the routine (ROUTINES) — each step once on its day after its time; then the findings of the reports
      const now = new Date(nowMs), today = msk(now), dow = ((new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1, time = mskTime(now);
      if (DAILY && desk) for (const r of ROUTINES) {
        const at = r.id === 'brief' ? BRIEF_AT : r.at;
        if (cab.runs?.[r.id] === today || time < at || (r.dow.length && !r.dow.includes(dow))) continue;
        if (r.after === 'start' && !(isDate(cab.campaign.start) && today >= cab.campaign.start)) continue;
        try { runRoutine(cab, r, 'по регламенту', today); } catch (e) { console.error('cabinet routine:', e.message); }
        changed = true;
      }
      // a plan item whose task was accepted is done
      for (const [pid, st] of Object.entries(cab.plan || {})) if (st.status === 'work' && st.taskId && desk?.get(st.taskId)?.status === 'done') {
        Object.assign(st, { status:'done', doneAt:now.toISOString() }); changed = true;
        note(cab, `план готов — задача принята: ${PLAN_ITEMS.find(x => x.id === pid)?.name || pid}`);
      }
      for (const b of cab.briefs || []) if (!b.parsed && takeFindings(cab, b)) changed = true;
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
  setInterval(() => { tick().catch(e => console.error('cabinet tick:', e.message)); }, 2 * 60e3).unref();

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
    if (!who?.owner) return json(res, 403, { error:'Кабинет кампании открыт только владельцу.' });
    if (req.method === 'GET' && !sub) return json(res, 200, { ...screen(load(id), { desk, agents:agents() }), log:load(id).log.slice(0, 30), hook:Boolean(token), auto:{ daily:DAILY, at:BRIEF_AT, send:AUTO, max:AUTO_MAX }, contoursAll:CONTOURS.map(c => ({ id:c.id, name:c.name })) });
    if (req.method === 'POST' && !sub) {
      const b = await readJson(req);
      try { const r = act(id, b); return json(res, 200, { ok:true, ...r, ...screen(load(id), { desk, agents:agents() }), log:load(id).log.slice(0, 30), hook:Boolean(token), auto:{ daily:DAILY, at:BRIEF_AT, send:AUTO, max:AUTO_MAX }, contoursAll:CONTOURS.map(c => ({ id:c.id, name:c.name })) }); }
      catch (e) { return json(res, 400, { error:e.message }); }
    }
    return json(res, 404, { error:'not found' });
  }

  // how agents wire events into the cabinet: a ChatPlace step «http_request» (Pro) in the automations of Нейроворонка, the payment system.
  // The token only adds numbers to the funnel of this cabinet (no reads), so the agents of the office may know it.
  const hookNote = () => token ? `\n\n## Как отдавать события в кабинет
Каждый шаг воронки Нейроворонки должен считаться сам. В автоматизациях ChatPlace Нейроворонки (только её, не практикума и не материалов) добавляй действие http_request на ключевых шагах, в платёжке — уведомление об оплате:
- POST ${PUBLIC_URL}/api/assistant/cabinet/neuro/hook
- заголовок x-cabinet-token: ${token}
- тело JSON: {"tag":"<метка nf-… или пусто>","step":"<${STEP_IDS.join(' | ')}>","n":1,"amount":<сумма для paid>}
Метка — из start-параметра бота или utm_content. Изменения в ChatPlace и платёжке — только после разрешения владельца (APPROVE).` : '';

  // what every agent of the office «Нейроворонка» gets with a task (desk.mjs → setContext): the plan of the project, the state of the
  // cabinet and the knowledge of the main office
  function contextFiles() {
    const cab = load('neuro');
    return [
      { name:'neuro-plan.md', text:plan() || '' },
      { name:'neuro-cabinet.md', text:snapshotText(cab, screen(cab, { desk, agents:agents() })) + hookNote() },
      { name:'main-office.md', text:office() || '' },
    ].filter(f => f.text);
  }

  return { handle, act, tick, load, contextFiles, screen:id => screen(load(id), { desk, agents:agents() }) };
}
