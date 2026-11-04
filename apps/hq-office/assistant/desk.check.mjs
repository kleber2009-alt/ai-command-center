/* Check of the working desk (desk.mjs) with a fake runner and a fake Claude — runs on every deploy (deploy-hq-office.yml):
   pipelines hand files to the next stage, the QA returns once, approvals gate actions in outside systems,
   revisions and ratings become lessons in the next prompt, usage adds up into the month totals.
   Run: HQ_ROUTINES=off node desk.check.mjs */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

import { fileURLToPath } from 'node:url';
const OFFICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createDesk } = await import('./desk.mjs');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-'));
let route = {};
const claude = {
  beta:{ messages:{ create:async () => ({ stop_reason:'end_turn', content:[{ type:'text', text:JSON.stringify(route) }] }) } },
  messages:{ create:async () => ({ content:[{ type:'text', text:'- правило один\n- правило два' }] }) },
};
const desk = createDesk({ claude, model:'m', fallback:{}, dataDir, officeDir:OFFICE, runnerToken:'tok' });
const srv = http.createServer((req, res) => desk.handle(req, res, req.url.split('?')[0].replace(/^\/desk\/?/, ''), true)).listen(0);
const base = `http://127.0.0.1:${srv.address().port}/desk/`;
const R = { authorization:'Bearer tok' };
async function call(method, p, body, headers = {}) {
  const r = await fetch(base + p, { method, headers:{ 'content-type':'application/json', ...headers }, body:body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const t = await r.text();
  return { status:r.status, j:t ? JSON.parse(t) : null };
}
const claim = () => call('POST', 'runner/claim', {}, R);
async function deliver(job, files, extra = {}) {
  for (const [n, c] of Object.entries(files)) {
    const r = await fetch(`${base}runner/${job.id}/file?path=${encodeURIComponent(n)}`, { method:'PUT', headers:R, body:c });
    assert.equal(r.status, 200, 'upload ' + n);
  }
  return call('POST', `runner/${job.id}/finish`, { result:'review', main:Object.keys(files)[0], summary:'## Что сделано\nготово\n## Материалы\n- out/' + Object.keys(files)[0] + ' — файл', history:'итог', session:'s-' + job.kind, usage:{ cost:0.5, ms:120000, turns:7 }, ...extra }, R);
}
const get = async id => (await call('GET', 'tasks')).j.tasks.find(t => t.id === id);
await call('POST', 'runner/hello', { version:'7', claude:{ ok:true }, mcp:[{ name:'chatplace', read:12, write:9 }] }, R);

// 1) pipeline offer-landing: three stages, files handed over, QA at the end with one rework
route = { action:'assign', agent:'hormozi', skill:'', title:'Оффер и лендинг', brief:'сделай', deliverable:'landing', why:'потому', question:'', visual:'none', style_named:'', transcribe:false, pipeline:'offer-landing' };
let { j } = await call('POST', 'tasks', { text:'упакуй продукт и сделай лендинг' });
const id = j.task.id;
await new Promise(r => setTimeout(r, 50));
let t = await get(id);
assert.equal(t.status, 'queued'); assert.equal(t.pipeline.stages.length, 3); assert.equal(t.agent.id, 'hormozi'); assert.equal(t.qa.status, 'planned');
let job = (await claim()).j; assert.equal(job.agent, 'hormozi'); assert.match(job.prompt, /конвейер «Оффер → лендинг»/);
await deliver(job, { 'offer.md':'оффер' });
t = await get(id); assert.equal(t.pipeline.idx, 1); assert.equal(t.status, 'queued'); assert.ok(t.files.includes('etap1-offer.md'));
job = (await claim()).j; assert.equal(job.agent, 'legends'); assert.equal(job.session, ''); assert.ok(job.files.includes('etap1-offer.md')); assert.match(job.prompt, /in\/etap1-offer\.md/);
await deliver(job, { 'offer-final.md':'финал' });
job = (await claim()).j; assert.equal(job.agent, 'landings'); assert.match(job.prompt, /последний этап/);
await deliver(job, { 'index.html':'<h1>лендинг</h1>' });
t = await get(id); assert.equal(t.status, 'queued'); assert.equal(t.agent.id, 'qa'); assert.equal(t.qa.status, 'queued');
job = (await claim()).j; assert.equal(job.kind, 'qa'); assert.equal(job.effort, 'medium'); assert.match(job.prompt, /QA: ok/);
await call('POST', `runner/${id}/finish`, { result:'qa', verdict:'fix', notes:'1. Нет блока оплаты', usage:{ cost:0.1, ms:30000 } }, R);
t = await get(id); assert.equal(t.status, 'queued'); assert.equal(t.qa.verdict, 'fix');
job = (await claim()).j; assert.equal(job.kind, 'revise'); assert.equal(job.agent, 'landings'); assert.equal(job.session, 's-run'); assert.match(job.prompt, /Контролёр качества/);
await deliver(job, { 'index.html':'<h1>лендинг с оплатой</h1>' });
t = await get(id); assert.equal(t.status, 'review'); assert.equal(t.usage.runs, 5); assert.equal(t.usage.cost, 2.1);
// approve with a rating: lesson of the last stage's agent
let r = await call('POST', `tasks/${id}/approve`, { publish:true, rating:'down', comment:'кнопка оплаты должна быть сверху' });
assert.equal(r.j.task.status, 'done'); assert.equal(r.j.task.rating.value, 'down');
assert.equal(desk.lessonsOf('landings').items.at(-1).text, 'кнопка оплаты должна быть сверху');
const hist = (await call('GET', 'history.json')).j; assert.deepEqual(hist[0].agents, ['hormozi', 'legends', 'landings']);

// 2) approval of actions in outside systems, then execute
route = { action:'assign', agent:'mailings', skill:'', title:'Рассылка', brief:'b', deliverable:'other', why:'w', question:'', visual:'none', style_named:'', transcribe:false, pipeline:'none' };
({ j } = await call('POST', 'tasks', { text:'сделай рассылку по базе' }));
const id2 = j.task.id; await new Promise(r => setTimeout(r, 50));
job = (await claim()).j; assert.equal(job.agent, 'mailings'); assert.match(job.prompt, /APPROVE:/);
// next lesson goes into the prompt of the agent
await call('POST', `runner/${id2}/finish`, { result:'approve', actions:['Рассылка по сегменту «тёплые» (412 чел.), текст из out/text.md'], summary:'## Что сделано\nподготовил', session:'s2', usage:{ cost:0.2, ms:60000 } }, R);
t = await get(id2); assert.equal(t.status, 'question'); assert.equal(t.question.from, 'approval'); assert.equal(t.question.options[0].label, 'Выполнить');
r = await call('POST', `tasks/${id2}/answer`, { text:'Выполнить' }); assert.equal(r.j.task.status, 'queued');
job = (await claim()).j; assert.equal(job.kind, 'execute'); assert.equal(job.session, 's2'); assert.match(job.prompt, /412 чел/);
await deliver(job, { 'index.html':'отправлено' });
t = await get(id2); assert.equal(t.agent.id, 'qa'); // first delivery → controller
job = (await claim()).j; await call('POST', `runner/${id2}/finish`, { result:'qa', verdict:'ok', notes:'всё ок' }, R);
t = await get(id2); assert.equal(t.status, 'review'); assert.equal(t.approval.status, 'yes');
// revision by the owner → lesson; no second QA
await call('POST', `tasks/${id2}/revise`, { text:'добавь ссылку на оплату' });
assert.equal(desk.lessonsOf('mailings').items.at(-1).kind, 'revise');
job = (await claim()).j; assert.equal(job.kind, 'revise'); await deliver(job, { 'index.html':'v3' });
t = await get(id2); assert.equal(t.status, 'review');
// a new task of the same agent gets the lesson in its prompt
({ j } = await call('POST', 'tasks', { text:'ещё рассылка' })); await new Promise(r => setTimeout(r, 50));
job = (await claim()).j; assert.match(job.prompt, /добавь ссылку на оплату/);
await call('POST', `tasks/${job.id}/cancel`, {});

// 3) «не выполнять» → answer to the agent, nothing executed
({ j } = await call('POST', 'tasks', { text:'запусти рекламу' })); const id3 = j.task.id; await new Promise(r => setTimeout(r, 50));
job = (await claim()).j;
await call('POST', `runner/${id3}/finish`, { result:'approve', actions:['Запустить кампанию, $50/день'], summary:'s', session:'s3' }, R);
await call('POST', `tasks/${id3}/answer`, { text:'Не выполнять' });
job = (await claim()).j; assert.equal(job.kind, 'answer'); assert.match(job.prompt, /НЕ разрешил/);

// 4) stats of the month
const st = (await call('GET', 'stats')).j;
assert.ok(st.total.cost > 2.5, JSON.stringify(st.total)); assert.ok(st.agents.find(a => a.id === 'qa'));
console.log('month', st.total, st.agents.map(a => `${a.id}:${a.cost}/${a.runs}`).join(' '));
assert.match(desk.summary(), /За этот месяц/);
console.log('desk check: ok');
srv.close(); fs.rmSync(dataDir, { recursive:true, force:true }); process.exit(0);
