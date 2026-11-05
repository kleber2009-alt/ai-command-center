/* Tests of the test cabinet «Нейроворонка» (cabinet.mjs): the funnel, tags of content, findings → desk tasks, escalation.
   Run: cd apps/hq-office/assistant && npm test */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initCabinet, funnelOf, linksOf, ESCALATE_MS } from './cabinet.mjs';

const dirs = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive:true, force:true }); });

function setup() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cab-test-')); dirs.push(dataDir);
  const made = [], status = {}, sent = [];
  const desk = {
    createTask:({ text, agent, source }) => { const task = { id:'t' + made.length, text }; made.push({ text, agent, source }); status[task.id] = 'queued'; return { task, routed:Promise.resolve() }; },
    get:id => status[id] ? { id, status:status[id], statusText:status[id], text:made[Number(id.slice(1))].text, route:null, agent:null } : null,
  };
  const agents = { shtab:{ id:'shtab', name:'Штаб кампании' }, funnels:{ id:'funnels', name:'Воронки' } };
  const cab = initCabinet({ dataDir, desk, agents:() => agents, notify:async t => { sent.push(t); }, token:'secret' });
  return { cab, made, status, sent, dataDir };
}

test('the funnel shows where the data stops and the bottleneck', () => {
  const c = { days:{ '2026-11-01':{ reach:10000, touch:200, lead:100, reg:20 } } };
  const f = funnelOf(c, ['2026-11-01']);
  assert.equal(f.gap.id, 'came');                       // no numbers after «Регистрация»
  assert.deepEqual(f.gaps.map(g => g.id), ['came', 'offer', 'apply', 'paid']);
  assert.equal(f.bottleneck.id, 'reg');                 // 20% against the norm of 40%
  assert.equal(f.steps.find(s => s.id === 'lead').conv, 0.5);
});

test('content gets a tag and tagged links; events count per tag and per day', () => {
  const { cab } = setup();
  cab.act('neuro', { action:'campaign', botUrl:'https://t.me/neuro_bot', landingUrl:'https://neuro.example/l', goalTarget:30 });
  const { unit } = cab.act('neuro', { action:'unit', type:'reel', title:'Рилс про воронку', contour:'editorial' });
  assert.equal(unit.tag, 'nf-001');
  assert.equal(unit.links.bot, 'https://t.me/neuro_bot?start=nf-001');
  assert.match(unit.links.landing, /utm_content=nf-001/);
  cab.act('neuro', { action:'result', tag:'nf-001', step:'lead', n:5 });
  cab.act('neuro', { action:'result', tag:'NF-001', step:'paid', n:1, amount:9900 });
  const s = cab.screen('neuro');
  assert.equal(s.units[0].stats.lead, 5);
  assert.equal(s.units[0].stats.paid, 1);
  assert.equal(s.goal.paid, 1);
  assert.equal(s.goal.revenue, 9900);
  assert.equal(s.contours.find(c => c.id === 'production').value, 1);
  assert.throws(() => cab.act('neuro', { action:'result', tag:'nf-999', step:'lead' }), /Нет контента/);
  assert.equal(linksOf({ id:'neuro', campaign:{ botUrl:'', landingUrl:'' } }, unit).bot, undefined);
});

test('a finding goes to the agent as a desk task and closes when the task is accepted', async () => {
  const { cab, made, status } = setup();
  cab.act('neuro', { action:'finding', text:'Регистрации не доходят до урока', contour:'funnels', owner:'funnels', toTask:true });
  assert.equal(made.length, 1);
  assert.equal(made[0].agent, 'funnels');
  assert.equal(made[0].source, 'cabinet');
  assert.match(made[0].text, /Воронки/);
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
  cab.act('neuro', { action:'day', date:'2026-11-04', values:{ reach:5000, touch:120, lead:60 } });
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
