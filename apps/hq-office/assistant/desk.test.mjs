/* Tests of the working desk (desk.mjs) — the state machine of a task with a fake runner and a fake Claude.
   Run: cd apps/hq-office/assistant && npm test   (also on every deploy, deploy-hq-office.yml)

   Each test gets its own desk (own data dir and HTTP server). The fake Claude answers the dispatcher with
   whatever the test puts into `routes` (one answer per call), the fake runner is plain HTTP calls with the token. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDesk } from './desk.mjs';

process.env.HQ_ROUTINES = 'off';
const OFFICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOK = 'tok';
const R = { authorization:'Bearer ' + TOK };
const dirs = [], servers = [];
after(() => { for (const s of servers) s.close(); for (const d of dirs) fs.rmSync(d, { recursive:true, force:true }); });

const ROUTE = { action:'assign', agent:'slides', skill:'', title:'Задача', brief:'сделай', deliverable:'slides', why:'по профилю', question:'',
  visual:'none', style_named:'', transcribe:false, pipeline:'none' };

function setup({ claude = true } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-test-')); dirs.push(dataDir);
  const routes = [];
  const fake = { beta:{ messages:{ create:async () => ({ stop_reason:'end_turn', content:[{ type:'text', text:JSON.stringify({ ...ROUTE, ...(routes.shift() || {}) }) }] }) } },
    messages:{ create:async () => ({ content:[{ type:'text', text:'- правило' }] }) } };
  const desk = createDesk({ claude:claude ? fake : null, model:'m', fallback:{}, dataDir, officeDir:OFFICE, runnerToken:TOK });
  const srv = http.createServer((req, res) => desk.handle(req, res, req.url.split('?')[0].replace(/^\/desk\/?/, ''), req.headers['x-guest'] !== '1')).listen(0);
  servers.push(srv);
  const base = `http://127.0.0.1:${srv.address().port}/desk/`;
  async function call(method, p, body, headers = {}) {
    const r = await fetch(base + p, { method, headers:{ 'content-type':'application/json', ...headers }, body:body == null ? undefined : JSON.stringify(body) });
    const t = await r.text();
    let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
    return { status:r.status, j };
  }
  const tick = () => new Promise(r => setTimeout(r, 30));
  const api = {
    desk, routes, call, dataDir,
    async task(text, extra = {}) { const { j } = await call('POST', 'tasks', { text, ...extra }); await tick(); return j.task.id; },
    async get(id) { return (await call('GET', 'tasks')).j.tasks.find(t => t.id === id); },
    async claim() { const r = await call('POST', 'runner/claim', {}, R); return r.status === 204 ? null : r.j; },
    async put(id, name, body) { const r = await fetch(`${base}runner/${id}/file?path=${encodeURIComponent(name)}`, { method:'PUT', headers:R, body }); return r.status; },
    finish:(id, body) => call('POST', `runner/${id}/finish`, body, R),
    step:(id, text) => call('POST', `runner/${id}/step`, { text }, R),
    hello:() => call('POST', 'runner/hello', { version:'t', claude:{ ok:true } }, R),
    async deliver(job, files = { 'index.html':'<h1>ok</h1>' }, extra = {}) {
      for (const [n, c] of Object.entries(files)) assert.equal(await api.put(job.id, n, c), 200);
      return api.finish(job.id, { result:'review', main:Object.keys(files)[0], summary:'## Что сделано\nготово', history:'итог', session:'S-' + job.kind, usage:{ cost:0.5, ms:60000, turns:3 }, ...extra });
    },
    // a task that goes straight to review: QA off for this desk
    async toReview(text = 'сделай презентацию') {
      const id = await api.task(text);
      const job = await api.claim();
      await api.deliver(job);
      const qa = await api.claim();
      if (qa?.kind === 'qa') await api.finish(id, { result:'qa', verdict:'ok', notes:'ок' });
      return id;
    },
  };
  return api;
}

/* ---------- the dispatcher ---------- */

test('без ключа Claude диспетчер сразу отдаёт ошибку, задача не теряется', async () => {
  const d = setup({ claude:false });
  const id = await d.task('что-нибудь');
  const t = await d.get(id);
  assert.equal(t.status, 'error'); assert.match(t.error, /нет ключа/);
});

test('диспетчер задаёт вопрос, ответ владельца — заново к диспетчеру, затем в очередь', async () => {
  const d = setup();
  d.routes.push({ action:'ask', question:'Для какого эфира?' }, { action:'assign' });
  const id = await d.task('сделай презентацию к эфиру');
  let t = await d.get(id);
  assert.equal(t.status, 'question'); assert.equal(t.question.from, 'dispatcher');
  await d.call('POST', `tasks/${id}/answer`, { text:'для вторничного' }); await new Promise(r => setTimeout(r, 30));
  t = await d.get(id);
  assert.equal(t.status, 'queued'); assert.equal(t.answers[0].a, 'для вторничного');
  const job = await d.claim();
  assert.match(job.prompt, /Ответ: для вторничного/);
});

test('монтаж ждёт выбора стиля; «стекло» выбирает стеклянную объяснялку и меняет скилл', async () => {
  const d = setup();
  d.routes.push({ agent:'montage', skill:'montazh-rils', deliverable:'video', visual:'video' });
  const id = await d.task('смонтируй рилс');
  let t = await d.get(id);
  assert.equal(t.status, 'question'); assert.equal(t.question.from, 'style');
  assert.ok(t.question.options.some(o => o.label === 'Выбери сам'));
  await d.call('POST', `tasks/${id}/answer`, { text:'давай стекло' });
  t = await d.get(id);
  assert.equal(t.status, 'queued'); assert.equal(t.style, 'Стеклянная объяснялка'); assert.equal(t.route.skill, 'glass-explainer-reel');
});

test('стиль, названный в задаче, не спрашивается', async () => {
  const d = setup();
  d.routes.push({ agent:'montage', deliverable:'video', visual:'video', style_named:'бизнес-рилс' });
  const id = await d.task('смонтируй бизнес-рилс');
  const t = await d.get(id);
  assert.equal(t.status, 'queued'); assert.equal(t.style, 'Бизнес-рилс');
});

/* ---------- the transcriber chain ---------- */

test('ссылка на ролик: сначала Транскрибатор, расшифровка ложится в in/ и задача переходит агенту', async () => {
  const d = setup();
  d.routes.push({ agent:'scripts', deliverable:'script', transcribe:true });
  const id = await d.task('вот рилс https://www.instagram.com/reel/abc/ — сделай сценарий в моём стиле');
  let t = await d.get(id);
  assert.equal(t.agent.id, 'transcriber'); assert.ok(t.chain);
  const job = await d.claim();
  assert.equal(job.kind, 'transcribe'); assert.deepEqual(job.sources, ['https://www.instagram.com/reel/abc/']);
  assert.equal(await d.put(id, 'transcript-1.md', 'текст ролика'), 200);
  await d.finish(id, { result:'transcribed', summary:'«abc» — 120 слов', files:['transcript-1.md'], usage:{ ms:20000 } });
  t = await d.get(id);
  assert.equal(t.status, 'queued'); assert.equal(t.agent.id, 'scripts'); assert.ok(t.files.includes('transcript-1.md')); assert.equal(t.chain.done, true);
  const next = await d.claim();
  assert.equal(next.kind, 'run'); assert.ok(next.files.includes('transcript-1.md')); assert.match(next.prompt, /расшифровал агент «Транскрибатор»/);
});

test('расшифровка без файлов — ошибка с подсказкой «Повторить»', async () => {
  const d = setup();
  d.routes.push({ agent:'scripts', transcribe:true });
  const id = await d.task('https://youtu.be/xyz сценарий по ролику');
  await d.claim();
  await d.finish(id, { result:'transcribed', files:['transcript-1.md'] });
  const t = await d.get(id);
  assert.equal(t.status, 'error'); assert.match(t.error, /Повторить/);
});

/* ---------- the runner ---------- */

test('без токена исполнитель получает 403', async () => {
  const d = setup();
  assert.equal((await d.call('POST', 'runner/claim', {}, { authorization:'Bearer wrong' })).status, 403);
});

test('перезапуск исполнителя: первый раз задача снова в очереди, второй — ошибка', async () => {
  const d = setup();
  const id = await d.task('презентация');
  await d.claim(); await d.hello();
  let t = await d.get(id);
  assert.equal(t.status, 'queued'); assert.match(t.steps.at(-1).text, /перезапустился/);
  await d.claim(); await d.hello();
  t = await d.get(id);
  assert.equal(t.status, 'error'); assert.match(t.error, /дважды/);
});

test('отмена владельцем: шаг исполнителя получает cancelled, поздняя сдача игнорируется', async () => {
  const d = setup();
  const id = await d.task('презентация');
  const job = await d.claim();
  assert.equal((await d.step(id, 'работаю')).j.cancelled, false);
  await d.call('POST', `tasks/${id}/cancel`, {});
  assert.equal((await d.step(id, 'всё ещё работаю')).j.cancelled, true);
  assert.equal((await d.finish(job.id, { result:'review' })).j.ignored, true);
  assert.equal((await d.get(id)).status, 'cancelled');
});

test('ошибка агента → «Повторить» возвращает ту же работу в очередь', async () => {
  const d = setup();
  const id = await d.task('презентация');
  await d.claim();
  await d.finish(id, { result:'error', error:'Агент не закончил', log:'хвост лога', usage:{ cost:0.2, ms:1000 } });
  let t = await d.get(id);
  assert.equal(t.status, 'error'); assert.equal(t.log, 'хвост лога'); assert.equal(t.usage.cost, 0.2);
  await d.call('POST', `tasks/${id}/retry`, {});
  t = await d.get(id);
  assert.equal(t.status, 'queued');
  assert.equal((await d.claim()).kind, 'run');
});

test('вопрос агента: ответ идёт в ту же сессию, задача продолжается', async () => {
  const d = setup();
  const id = await d.task('лендинг');
  await d.claim();
  await d.finish(id, { result:'need', question:'Какая цена?', session:'S1' });
  let t = await d.get(id);
  assert.equal(t.status, 'question'); assert.equal(t.question.from, 'agent');
  await d.call('POST', `tasks/${id}/answer`, { text:'9900' });
  const job = await d.claim();
  assert.equal(job.kind, 'answer'); assert.equal(job.session, 'S1'); assert.match(job.prompt, /9900/);
});

test('агент сдал без файлов — ошибка', async () => {
  const d = setup();
  const id = await d.task('лендинг');
  await d.claim();
  await d.finish(id, { result:'review', summary:'пусто' });
  assert.match((await d.get(id)).error, /ни одного файла/);
});

/* ---------- review, revisions, history, files ---------- */

test('правка: новая версия в той же сессии, история показывает только принятое', async () => {
  const d = setup();
  const id = await d.toReview();
  let t = await d.get(id);
  assert.equal(t.status, 'review'); assert.equal(t.result.version, 1);
  assert.equal((await d.call('GET', 'history.json')).j.length, 0);
  await d.call('POST', `tasks/${id}/revise`, { text:'крупнее заголовок' });
  const job = await d.claim();
  assert.equal(job.kind, 'revise'); assert.equal(job.session, 'S-run'); assert.equal(job.version, 2);
  await d.deliver(job, { 'index.html':'<h1>v2</h1>' }, { summary:'поменял заголовок' });
  t = await d.get(id);
  assert.equal(t.status, 'review'); assert.equal(t.result.version, 2); assert.equal(t.result.note, 'поменял заголовок');
  await d.call('POST', `tasks/${id}/approve`, { publish:true });
  const h = (await d.call('GET', 'history.json')).j;
  assert.equal(h.length, 1); assert.equal(h[0].id, 'desk-' + id);
});

test('файлы результата: владельцу всегда, гостю — только опубликованная версия', async () => {
  const d = setup();
  const id = await d.toReview();
  const url = `files/${id}/v1/index.html`;
  assert.equal((await d.call('GET', url)).status, 200);
  assert.equal((await d.call('GET', url, null, { 'x-guest':'1' })).status, 404);
  await d.call('POST', `tasks/${id}/approve`, { publish:true });
  const g = await d.call('GET', url, null, { 'x-guest':'1' });
  assert.equal(g.status, 200); assert.match(String(g.j), /<h1>ok<\/h1>/);
  assert.equal((await d.call('GET', `files/${id}/v1/..%2F..%2Ftasks.json`)).status, 404);
});

test('гость не может ставить задачи', async () => {
  const d = setup();
  assert.equal((await d.call('POST', 'tasks', { text:'x' }, { 'x-guest':'1' })).status, 403);
});

/* ---------- routines ---------- */

test('утренние задачи: проверка балансов без предупреждений закрывается сама', async () => {
  delete process.env.HQ_ROUTINES;
  const d = setup();
  const made = d.desk.tickRoutines(new Date('2026-11-04T07:00:00Z'));  // 10:00 МСК — обе задачи пора ставить
  process.env.HQ_ROUTINES = 'off';
  assert.deepEqual(made.map(t => t.routine).sort(), ['billing-daily', 'social-daily']);
  assert.equal(d.desk.tickRoutines(new Date('2026-11-04T08:00:00Z')).length, 0);  // второй раз за день — нет
  const billing = made.find(t => t.routine === 'billing-daily');
  let job;
  while ((job = await d.claim()) && job.id !== billing.id) await d.finish(job.id, { result:'error', error:'x' });
  await d.deliver(job, { 'index.html':'ok' }, { alerts:{ critical:[], warn:[] } });
  const t = await d.get(billing.id);
  assert.equal(t.status, 'done'); assert.equal(t.published, false); assert.equal(t.qa, null);
});

/* ---------- pipelines, QA, approvals, lessons, usage ---------- */

test('конвейер «Оффер → лендинг»: этапы передают файлы, контролёр возвращает один раз', async () => {
  const d = setup();
  d.routes.push({ agent:'hormozi', deliverable:'landing', pipeline:'offer-landing' });
  const id = await d.task('упакуй продукт и сделай лендинг');
  let t = await d.get(id);
  assert.equal(t.pipeline.stages.length, 3); assert.equal(t.qa.status, 'planned');
  let job = await d.claim(); assert.equal(job.agent, 'hormozi'); assert.match(job.prompt, /конвейер «Оффер → лендинг»/);
  await d.deliver(job, { 'offer.md':'оффер' });
  job = await d.claim(); assert.equal(job.agent, 'legends'); assert.equal(job.session, ''); assert.ok(job.files.includes('etap1-offer.md'));
  await d.deliver(job, { 'offer-final.md':'финал' });
  job = await d.claim(); assert.equal(job.agent, 'landings'); assert.match(job.prompt, /последний этап/);
  await d.deliver(job);
  job = await d.claim(); assert.equal(job.kind, 'qa'); assert.equal(job.effort, 'medium');
  await d.finish(id, { result:'qa', verdict:'fix', notes:'1. Нет блока оплаты', usage:{ cost:0.1, ms:30000 } });
  job = await d.claim(); assert.equal(job.kind, 'revise'); assert.equal(job.session, 'S-run'); assert.match(job.prompt, /Контролёр качества/);
  await d.deliver(job, { 'index.html':'<h1>с оплатой</h1>' });
  t = await d.get(id);
  assert.equal(t.status, 'review'); assert.equal(t.qa.verdict, 'fix'); assert.equal(t.usage.runs, 5); assert.equal(t.usage.cost, 2.1);
  await d.call('POST', `tasks/${id}/approve`, { publish:true, rating:'down', comment:'кнопка оплаты сверху' });
  assert.equal(d.desk.lessonsOf('landings').items.at(-1).text, 'кнопка оплаты сверху');
  assert.deepEqual((await d.call('GET', 'history.json')).j[0].agents, ['hormozi', 'legends', 'landings']);
});

test('ошибка контролёра не роняет задачу — результат идёт владельцу', async () => {
  const d = setup();
  const id = await d.task('презентация');
  await d.deliver(await d.claim());
  await d.claim();
  await d.finish(id, { result:'error', error:'Контролёр не смог' });
  const t = await d.get(id);
  assert.equal(t.status, 'review'); assert.equal(t.qa.verdict, 'skip');
});

test('действия во внешних системах — только после «Выполнить»; «Не выполнять» идёт агенту ответом', async () => {
  const d = setup();
  await d.hello();
  await d.call('POST', 'runner/hello', { version:'t', mcp:[{ name:'chatplace', read:12, write:9 }] }, R);
  d.routes.push({ agent:'mailings' }, { agent:'mailings' });
  const id = await d.task('сделай рассылку по базе');
  let job = await d.claim(); assert.match(job.prompt, /APPROVE:/);
  await d.finish(id, { result:'approve', actions:['Рассылка по сегменту «тёплые» (412 чел.)'], summary:'подготовил', session:'s2' });
  let t = await d.get(id);
  assert.equal(t.status, 'question'); assert.equal(t.question.from, 'approval'); assert.equal(t.question.options[0].label, 'Выполнить');
  await d.call('POST', `tasks/${id}/answer`, { text:'Выполнить' });
  job = await d.claim(); assert.equal(job.kind, 'execute'); assert.equal(job.session, 's2'); assert.match(job.prompt, /412 чел/);
  await d.deliver(job);
  assert.equal((await d.claim()).kind, 'qa'); await d.finish(id, { result:'qa', verdict:'ok' });
  t = await d.get(id); assert.equal(t.status, 'review'); assert.equal(t.approval.status, 'yes');
  const id2 = await d.task('ещё рассылка');
  job = await d.claim();
  await d.finish(id2, { result:'approve', actions:['Запустить рассылку'], summary:'s', session:'s3' });
  await d.call('POST', `tasks/${id2}/answer`, { text:'Не выполнять' });
  job = await d.claim(); assert.equal(job.kind, 'answer'); assert.match(job.prompt, /НЕ разрешил/);
});

test('правка владельца становится уроком в следующей задаче агента; затраты месяца считаются', async () => {
  const d = setup();
  const id = await d.toReview();
  await d.call('POST', `tasks/${id}/revise`, { text:'всегда добавляй слайд с ценой' });
  await d.deliver(await d.claim());
  await d.task('ещё презентация');
  const job = await d.claim();
  assert.match(job.prompt, /всегда добавляй слайд с ценой/);
  assert.equal((await d.get(job.id)).lessons, 1);
  const st = (await d.call('GET', 'stats')).j;
  assert.equal(st.total.runs, 2); assert.ok(st.agents.some(a => a.id === 'slides' && a.lessons === 1));
  assert.match(d.desk.summary(), /За этот месяц/);
});
