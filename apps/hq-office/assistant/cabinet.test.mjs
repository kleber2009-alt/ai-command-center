/* Tests of the test cabinet «Нейроворонка» (cabinet.mjs): the funnel, tags of content, findings → desk tasks, escalation.
   Run: cd apps/hq-office/assistant && npm test */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initCabinet, funnelOf, linksOf, parseFindings, ESCALATE_MS } from './cabinet.mjs';

const dirs = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive:true, force:true }); });

function setup() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cab-test-')); dirs.push(dataDir);
  const made = [], status = {}, sent = [], results = {};
  const desk = {
    createTask:({ text, agent, source }) => { const task = { id:'t' + made.length, text }; made.push({ text, agent, source }); status[task.id] = 'queued'; return { task, routed:Promise.resolve() }; },
    get:id => status[id] ? { id, status:status[id], statusText:status[id], text:made[Number(id.slice(1))].text, route:null, agent:null, result:results[id] ? { summary:results[id] } : null } : null,
  };
  const agents = { shtab:{ id:'shtab', name:'Штаб кампании' }, funnels:{ id:'funnels', name:'Воронки' }, nfbot:{ id:'nfbot', name:'Бот и прогрев' }, nfmail:{ id:'nfmail', name:'Рассылки кампании' } };
  const cab = initCabinet({ dataDir, desk, agents:() => agents, notify:async t => { sent.push(t); }, token:'secret' });
  return { cab, made, status, sent, results, dataDir };
}

test('the funnel shows where the data stops and the bottleneck', () => {
  const c = { days:{ '2026-11-01':{ reach:10000, word:200, bot:100, vsl:20 } } };
  const f = funnelOf(c, ['2026-11-01']);
  assert.equal(f.gap.id, 'landing');                    // no numbers after «Досмотр VSL»
  assert.deepEqual(f.gaps.map(g => g.id), ['landing', 'paid', 'study', 'upsell']);
  assert.equal(f.bottleneck.id, 'vsl');                 // 20% against the norm of 40%
  assert.equal(f.steps.find(s => s.id === 'bot').conv, 0.5);
});

test('content gets a tag and tagged links; events count per tag and per day', () => {
  const { cab } = setup();
  cab.act('neuro', { action:'campaign', botUrl:'https://t.me/neuro_bot', landingUrl:'https://neuro.example/l', goalTarget:30 });
  const { unit } = cab.act('neuro', { action:'unit', type:'reel', title:'Рилс про воронку', contour:'content' });
  assert.equal(unit.tag, 'nf-001');
  assert.equal(unit.links.bot, 'https://t.me/neuro_bot?start=nf-001');
  assert.match(unit.links.landing, /utm_content=nf-001/);
  cab.act('neuro', { action:'result', tag:'nf-001', step:'bot', n:5 });
  cab.act('neuro', { action:'result', tag:'NF-001', step:'paid', n:1, amount:9900 });
  const s = cab.screen('neuro');
  assert.equal(s.units[0].stats.bot, 5);
  assert.equal(s.units[0].stats.paid, 1);
  assert.equal(s.goal.paid, 1);
  assert.equal(s.goal.revenue, 9900);
  assert.equal(s.contours.find(c => c.id === 'analytics').value, 2);    // two stages have data: bot and paid
  assert.throws(() => cab.act('neuro', { action:'result', tag:'nf-999', step:'bot' }), /Нет контента/);
  assert.equal(linksOf({ id:'neuro', campaign:{ botUrl:'', landingUrl:'' } }, unit).bot, undefined);
});

test('a finding goes to the agent as a desk task and closes when the task is accepted', async () => {
  const { cab, made, status } = setup();
  cab.act('neuro', { action:'finding', text:'Регистрации не доходят до урока', contour:'funnels', owner:'funnels', toTask:true });
  assert.equal(made.length, 1);
  assert.equal(made[0].agent, 'funnels');
  assert.equal(made[0].source, 'cabinet');
  assert.match(made[0].text, /Воронка и продажи/);
  let s = cab.screen('neuro');
  assert.equal(s.findings[0].status, 'task');
  assert.equal(s.tasks[0].id, 't0');
  status.t0 = 'done';
  await cab.tick();
  s = cab.screen('neuro');
  assert.equal(s.findings[0].status, 'done');
});

test('a finding open more than 2 days escalates to the owner once', async () => {
  const { cab, sent } = setup();
  cab.act('neuro', { action:'finding', text:'Нет данных об оплатах', contour:'hq' });
  const f = cab.load('neuro').findings[0];
  f.created = new Date(Date.now() - ESCALATE_MS - 6e4).toISOString();
  await cab.tick();
  await cab.tick();
  assert.equal(sent.length, 1);
  assert.match(sent[0], /больше 2 дней/);
  const s = cab.screen('neuro');
  assert.equal(s.counts.overdue, 1);
  assert.ok(s.findings[0].overdue);
});

test('the brief goes to Штаб with the numbers of the day', () => {
  const { cab, made } = setup();
  cab.act('neuro', { action:'day', date:'2026-11-04', values:{ reach:5000, word:120, bot:60 } });
  cab.act('neuro', { action:'brief' });
  assert.equal(made[0].agent, 'shtab');
  assert.match(made[0].text, /Разбор дня/);
  assert.match(made[0].text, /нет данных/);
});

test('data survives a restart', () => {
  const { cab, dataDir } = setup();
  cab.act('neuro', { action:'unit', type:'carousel', title:'Карусель' });
  const again = initCabinet({ dataDir, agents:() => ({}) });
  assert.equal(again.load('neuro').units[0].tag, 'nf-001');
});

test('findings are read from the report of Штаб by id or by name', () => {
  const A = { nfbot:{ id:'nfbot', name:'Бот и прогрев' } };
  const f = parseFindings('## Что сделано\n…\nНАХОДКА: Цепочка зовёт на прошедший эфир | funnels | nfbot\n- **НАХОДКА: Нет данных об оплатах | Штаб | **\nНАХОДКА: Цепочка зовёт на прошедший эфир | funnels | nfbot', A);
  assert.equal(f.length, 2);
  assert.deepEqual(f[0], { text:'Цепочка зовёт на прошедший эфир', contour:'funnels', owner:'nfbot' });
  assert.equal(f[1].contour, 'hq');
  assert.equal(f[1].owner, '');
});

test('the office works on its own: the morning brief, then the findings of Штаб go to the agents', async () => {
  process.env.HQ_NEURO_AUTO_MAX = '1';
  const { cab, made, status, results } = setup();
  delete process.env.HQ_NEURO_AUTO_MAX;
  cab.act('neuro', { action:'day', date:'2026-11-04', values:{ reach:5000, bot:60 } });
  const morning = Date.parse('2026-11-05T06:45:00Z');          // 09:45 МСК
  await cab.tick(Date.parse('2026-11-05T05:00:00Z'));           // 08:00 МСК — рано
  assert.equal(made.length, 0);
  await cab.tick(morning);
  await cab.tick(morning + 60e3);                               // once a day
  assert.equal(made.length, 1);
  assert.equal(made[0].agent, 'shtab');
  assert.match(made[0].text, /НАХОДКА:/);
  status.t0 = 'review';
  results.t0 = 'Экран дня\nНАХОДКА: Цепочка зовёт на прошедший эфир | funnels | nfbot\nНАХОДКА: Рассылки остались черновиками | launch | nfmail';
  await cab.tick(morning + 120e3);
  const s = cab.screen('neuro');
  assert.equal(s.findings.length, 2);
  assert.equal(made.length, 2);                                 // only the first one went at once (HQ_NEURO_AUTO_MAX=1)
  assert.equal(made[1].agent, 'nfbot');
  assert.equal(s.findings.filter(f => f.status === 'task').length, 1);
  await cab.tick(morning + 180e3);                              // the report is read once
  assert.equal(cab.screen('neuro').findings.length, 2);
});

test('the plan: an item goes to its owner with the criterion and is done when the task is accepted; the routine runs on its days', async () => {
  const { cab, made, status } = setup();
  cab.act('neuro', { action:'plan-task', id:'b3' });
  assert.match(made[0].text, /Бот \+ VSL/);
  assert.match(made[0].text, /без участия команды/);
  let item = cab.screen('neuro').plan.flatMap(g => g.items).find(i => i.id === 'b3');
  assert.equal(item.status, 'work');
  status.t0 = 'done';
  const fri = Date.parse('2026-11-06T15:30:00Z');                // Friday 18:30 МСК
  await cab.tick(fri);
  item = cab.screen('neuro').plan.flatMap(g => g.items).find(i => i.id === 'b3');
  assert.equal(item.status, 'done');
  // Friday: the brief, the weekly summary and the report to the main office; not the Monday content week, not progress before the start
  assert.deepEqual(Object.keys(cab.load('neuro').runs).sort(), ['brief', 'metrics-week', 'report']);
  assert.equal(made.length, 4);
  await cab.tick(fri + 60e3);                                    // once a day
  assert.equal(made.length, 4);
});

test('the context for the agents of the office: the plan, the cabinet, the main office', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cab-test-')); dirs.push(dataDir);
  const cab = initCabinet({ dataDir, agents:() => ({}), plan:() => '# План', office:() => '# Главный офис', token:'tk-1' });
  const files = cab.contextFiles();
  assert.deepEqual(files.map(f => f.name), ['neuro-plan.md', 'neuro-cabinet.md', 'main-office.md']);
  assert.match(files[1].text, /Блоки системы/);
  assert.match(files[1].text, /x-cabinet-token: tk-1/);           // the agents wire ChatPlace and payments into the cabinet themselves
});
