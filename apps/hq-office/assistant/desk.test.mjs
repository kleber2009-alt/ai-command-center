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
import { startTelegram, wantsFiles } from './tg.mjs';

process.env.HQ_ROUTINES = 'off';
const OFFICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOK = 'tok';
const R = { authorization:'Bearer ' + TOK };
const dirs = [], servers = [];
after(() => { for (const s of servers) s.close(); for (const d of dirs) fs.rmSync(d, { recursive:true, force:true }); });

const ROUTE = { action:'assign', agent:'slides', skill:'', title:'Задача', brief:'сделай', deliverable:'slides', why:'по профилю', question:'',
  visual:'none', style_named:'', transcribe:false, pipeline:'none' };

function setup({ claude = true, telegram } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-test-')); dirs.push(dataDir);
  const routes = [];
  const fake = { beta:{ messages:{ create:async () => ({ stop_reason:'end_turn', content:[{ type:'text', text:JSON.stringify({ ...ROUTE, ...(routes.shift() || {}) }) }] }) } },
    messages:{ create:async () => ({ content:[{ type:'text', text:'- правило' }] }) } };
  const desk = createDesk({ claude:claude ? fake : null, model:'m', fallback:{}, dataDir, officeDir:OFFICE, runnerToken:TOK, telegram });
  const srv = http.createServer((req, res) => desk.handle(req, res, req.url.split('?')[0].replace(/^\/desk\/?/, ''), req.headers['x-head'] ? { head:JSON.parse(decodeURIComponent(req.headers['x-head'])) } : req.headers['x-guest'] !== '1')).listen(0);
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
    async claim(body = {}) { const r = await call('POST', 'runner/claim', body, R); return r.status === 204 || r.j?.idle ? null : r.j; },
    claimRaw:(body = {}) => call('POST', 'runner/claim', body, R),
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

test('задача из офиса Нейроворонки уходит только его команде', async () => {
  const d = setup();
  d.routes.push({ agent:'nfbot', deliverable:'doc' });
  const id = await d.task('почини цепочку практикума', { scope:'neuro' });
  const t = await d.get(id);
  assert.equal(t.source, 'neuro');
  assert.equal(t.route.agent, 'nfbot');
  d.routes.push({ agent:'slides' });
  const id2 = await d.task('сделай презентацию', { scope:'neuro' });
  assert.equal((await d.get(id2)).status, 'error');           // an agent of the main office is not allowed here
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

/* ---------- the owner's controls (also the Telegram buttons): pause, resume, urgent, snooze ---------- */

test('пауза в работе останавливает исполнителя, «Продолжить» идёт в той же сессии', async () => {
  const d = setup();
  const id = await d.task('сделай презентацию');
  const job = await d.claim();
  assert.equal(job.kind, 'run');
  assert.equal((await d.call('POST', `tasks/${id}/pause`, {})).status, 200);
  let t = await d.get(id); assert.equal(t.status, 'paused'); assert.equal(t.paused.from, 'work');
  // the runner sees «cancelled» on its next step, stops and reports the session
  assert.equal((await d.step(id, 'рендер')).j.cancelled, true);
  await d.call('POST', `runner/${id}/session`, { session:'S-paused' }, R);
  assert.equal(await d.claim(), null);   // nothing to do while paused
  await d.call('POST', `tasks/${id}/resume`, {});
  const again = await d.claim();
  assert.equal(again.kind, 'resume'); assert.equal(again.session, 'S-paused'); assert.match(again.prompt, /паузе/);
  await d.deliver(again);
  t = await d.get(id); assert.ok(['queued', 'review'].includes(t.status));   // the first delivery still goes through QA
});

test('пауза в очереди и «отложить до» — задача возвращается сама; срочная идёт первой', async () => {
  const d = setup();
  const a = await d.task('первая'), b = await d.task('вторая'), c = await d.task('третья');
  await d.call('POST', `tasks/${c}/urgent`, { on:true });
  assert.equal((await d.get(c)).queuePos, 1);
  await d.call('POST', `tasks/${a}/snooze`, { until:new Date(Date.now() + 50).toISOString() });
  assert.equal((await d.get(a)).status, 'paused');
  assert.equal((await d.claim()).id, c);
  await new Promise(r => setTimeout(r, 80));
  d.desk.tickPauses();
  const t = await d.get(a); assert.equal(t.status, 'queued'); assert.equal(t.paused, null);
  assert.ok(b);
});

test('отложить вопрос или результат: статус тот же, после времени снова ждёт владельца', async () => {
  const d = setup();
  const id = await d.toReview();
  assert.equal((await d.call('POST', `tasks/${id}/snooze`, { until:new Date(Date.now() - 1000).toISOString() })).status, 400);
  await d.call('POST', `tasks/${id}/snooze`, { until:new Date(Date.now() + 50).toISOString() });
  let t = await d.get(id); assert.equal(t.status, 'review'); assert.ok(t.snoozed);
  await new Promise(r => setTimeout(r, 80));
  d.desk.tickPauses();
  t = await d.get(id); assert.equal(t.snoozed, '');
  assert.equal(d.desk.act(id, 'approve', '', 'up').task.status, 'done');
  assert.match(d.desk.act(id, 'pause').error, /паузу/);
});

test('подписка на изменения и загрузка файла для задачи (как из Telegram)', async () => {
  const d = setup(), seen = [];
  d.desk.onChange(t => seen.push(t.status));
  const up = d.desk.putUpload('ref.jpg', Buffer.from('jpg'));
  const { task } = d.desk.createTask({ text:'обложка по фото', uploads:[up.id], source:'telegram' });
  await new Promise(r => setTimeout(r, 30));
  const v = d.desk.get(task.id);
  assert.equal(v.source, 'telegram'); assert.deepEqual(v.files, ['ref.jpg']);
  assert.ok(seen.includes('routing') && seen.includes('queued'));
});

test('карточка Telegram: ветка, кнопки и текст по статусу', async () => {
  const { topicOf, cardKeyboard, cardText, snoozeUntil, reportBrief } = await import('./tg.mjs');
  const base = { id:'ab12', text:'x', statusText:'s', agent:{ name:'Слайды' }, route:{ title:'Презентация' }, steps:[] };
  const keys = v => cardKeyboard(v).inline_keyboard.flat().map(b => b.callback_data?.split(':')[0]);
  assert.equal(topicOf({ ...base, status:'review' }), 'inbox');
  assert.equal(topicOf({ ...base, status:'review', snoozed:'2030-01-01' }), 'work');
  assert.equal(topicOf({ ...base, status:'error' }), 'errors');
  assert.equal(topicOf({ ...base, status:'review', routine:'social-daily' }), 'morning');
  assert.deepEqual(keys({ ...base, status:'review' }).slice(0, 3), ['ok', 'up', 'dn']);
  assert.ok(keys({ ...base, status:'work' }).includes('p'));
  assert.ok(keys({ ...base, status:'paused' }).includes('r'));
  assert.ok(keys({ ...base, status:'queued' }).includes('u'));
  assert.ok(keys({ ...base, status:'question', question:{ text:'?', options:[{ id:'1', label:'Стекло' }] } }).includes('o'));
  assert.ok(cardKeyboard({ ...base, status:'review' }).inline_keyboard.flat().every(b => !b.callback_data || Buffer.byteLength(b.callback_data) <= 64));
  const txt = cardText({ ...base, status:'review', result:{ summary:'## Что сделано\nСобрал <12> слайдов.\n## Главное\n- хук\n- цена', files:[{ path:'index.html' }], main:'index.html' } }, 'https://hq2.aicex.club');
  assert.match(txt, /Собрал &lt;12&gt; слайдов/); assert.match(txt, /• хук/); assert.match(txt, /#desk-ab12/);
  assert.equal(reportBrief('просто текст').done, 'просто текст');
  const mon = snoozeUntil('mon', new Date('2026-11-04T12:00:00Z'));   // Wednesday → Monday 9:00 MSK = 06:00 UTC
  assert.equal(mon.toISOString(), '2026-11-09T06:00:00.000Z');
  assert.equal(snoozeUntil('eve', new Date('2026-11-04T17:00:00Z')).toISOString(), '2026-11-05T16:00:00.000Z');
});

/* ---------- department heads: their agents only, the rest read-only ---------- */

const FIRUZA = { 'x-head':encodeURIComponent(JSON.stringify({ id:'firuza', name:'Фируза', dept:'marketing', agents:['slides', 'landings'] })) };

test('руководитель ставит задачи только своим агентам; диспетчер выбирает из них', async () => {
  const d = setup();
  let r = await d.call('POST', 'tasks', { text:'лендинг', agent:'landings' }, FIRUZA);
  assert.equal(r.status, 200); assert.equal(r.j.task.by.name, 'Фируза');
  r = await d.call('POST', 'tasks', { text:'ответь в директ', agent:'chats' }, FIRUZA);
  assert.equal(r.status, 403);
  r = await d.call('POST', 'tasks', { text:'оффер и лендинг', pipeline:'offer-landing' }, FIRUZA);
  assert.equal(r.status, 403);
  // the dispatcher is offered only her agents: an answer with another agent is refused and the task errs
  d.routes.push({ agent:'chats' });
  r = await d.call('POST', 'tasks', { text:'что-нибудь' }, FIRUZA);
  await new Promise(res => setTimeout(res, 40));
  assert.equal((await d.get(r.j.task.id)).status, 'error');
});

test('руководитель управляет своими задачами, чужие видит только для просмотра', async () => {
  const d = setup();
  const own = await d.toReview('сделай презентацию');            // slides — агент Фирузы
  d.routes.push({ agent:'chats' });
  const other = await d.task('скрипт продаж');                    // chats — не её
  assert.equal((await d.call('GET', 'tasks', null, FIRUZA)).status, 200);
  let r = await d.call('POST', `tasks/${other}/cancel`, {}, FIRUZA);
  assert.equal(r.status, 403);
  r = await d.call('POST', `tasks/${own}/approve`, { publish:true }, FIRUZA);
  assert.equal(r.status, 200);
  const t = await d.get(own);
  assert.equal(t.status, 'done'); assert.match(t.steps.at(-2)?.text || t.steps.map(x => x.text).join(' '), /Фируза/);
  const hist = (await d.call('GET', 'history.json', null, { 'x-guest':'1' })).j;
  assert.ok(hist.find(h => h.id === 'desk-' + own).people.includes('firuza'));
  // a guest sees who set it in the public feed, but not the text
  const live = (await d.call('GET', 'live.json', null, { 'x-guest':'1' })).j;
  assert.ok(live.tasks.every(x => !('text' in x)));
});

/* ---------- the owner's admin panel: the patch over agents.js reaches the dispatcher ---------- */

test('админ-панель: отпуск, новый агент и перевод в другой отдел сразу видны диспетчеру', async () => {
  const { initAdmin } = await import('./admin.mjs');
  const { setOfficePatch, officeWindow } = await import('./office.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-test-')); dirs.push(dir);
  const admin = initAdmin(dir);
  setOfficePatch(() => ({ patch:admin.patch(), stamp:admin.stamp() }));
  try {
    const d = setup();
    const base = () => { const W = officeWindow(OFFICE); return { list:W.OFFICE_AGENTS.list, away:W.OFFICE_AGENTS.away }; };
    const ids = () => d.desk.agents().map(a => a.id);
    assert.ok(ids().includes('slides'));
    admin.act({ action:'vacation', id:'slides', on:true }, 'Илья', base());
    assert.ok(!ids().includes('slides'));
    const { id } = admin.act({ action:'create', name:'Подкасты', role:'Монтирует выпуски подкаста', dept:'marketing', tasks:'Нарезает клипы' }, 'Илья', base());
    assert.ok(ids().includes(id));
    assert.equal(d.desk.agents().find(a => a.id === id).dept, 'marketing');
    admin.act({ action:'edit', id:'landings', dept:'sales' }, 'Илья', base());
    assert.equal(d.desk.agents().find(a => a.id === 'landings').dept, 'sales');
    admin.act({ action:'remove', id }, 'Илья', base());
    assert.ok(!ids().includes(id));
    assert.match(admin.log()[0].text, /удалил агента «Подкасты»/);
    assert.match(admin.script(), /OFFICE_AGENTS\.apply/);
  } finally { setOfficePatch(null); }
});

/* ---------- Telegram, the queue, the disk ---------- */

test('Telegram: сообщение на вопрос, результат и ошибку — по одному на каждое', async () => {
  const sent = [];
  // the card follows every status; the owner is called (a sound) only on a question, a result and an error — once each
  let last = '';
  const d = setup({ telegram:{ sync:v => { const k = `${v.status}:${v.question?.from || v.result?.version || ''}`;
    if (['question', 'review', 'error'].includes(v.status) && k !== last) sent.push(k); last = k; } } });
  d.routes.push({ action:'ask', question:'Для какого эфира?' }, { action:'assign' });
  const id = await d.task('презентация');
  assert.deepEqual(sent, ['question:dispatcher']);
  await d.call('POST', `tasks/${id}/answer`, { text:'вторник' }); await new Promise(r => setTimeout(r, 30));
  const job = await d.claim();
  await d.step(id, 'работаю'); await d.step(id, 'ещё работаю');
  await d.deliver(job);
  assert.equal(sent.length, 1);  // the QA checks first — nothing for the owner yet
  await d.claim(); await d.finish(id, { result:'qa', verdict:'ok' });
  assert.deepEqual(sent, ['question:dispatcher', 'review:1']);
  await d.call('POST', `tasks/${id}/revise`, { text:'крупнее' });
  await d.deliver(await d.claim());
  assert.deepEqual(sent.at(-1), 'review:2');
  const id2 = await d.task('ещё');
  await d.claim(); await d.finish(id2, { result:'error', error:'сломалось' });
  assert.equal(sent.at(-1), 'error:');
});

test('Telegram: бот «Офис» — подтверждение задачи, карточка с кнопками, принять с оценкой, вариант стиля, правка ответом, чужие не слышны', async () => {
  // a fake Bot API (HQ_TG_API): every call is recorded, getUpdates hands out what the test pushes
  const calls = []; let updates = [], mid = 500;
  const api = http.createServer(async (req, res) => {
    const parts = []; for await (const c of req) parts.push(c);
    const method = req.url.split('/').pop(); let body = {};
    try { body = JSON.parse(Buffer.concat(parts).toString() || '{}'); } catch { body = { form:true }; }
    if (method === 'getUpdates') { await new Promise(r => setTimeout(r, 20)); return res.end(JSON.stringify({ ok:true, result:updates.splice(0) })); }
    calls.push({ method, body });
    const result = method === 'getMe' ? { username:'AI_Growth_Office_Bot' } : method === 'getWebhookInfo' ? { url:'' }
      : /^send/.test(method) ? { message_id:++mid } : true;
    res.end(JSON.stringify({ ok:true, result }));
  }).listen(0);
  servers.push(api);
  process.env.HQ_TG_API = `http://127.0.0.1:${api.address().port}`;
  const d = setup();
  const bot = startTelegram({ desk:d.desk, dataDir:d.dataDir, token:'T', owners:['42'], site:'https://hq', ask:async t => 'двойник: ' + t, ownerVoice:async () => null });
  const chat = { id:42, type:'private' }, owner = { id:42 };
  let uid = 1;
  const push = u => updates.push({ update_id:uid++, ...u });
  const wait = (ms = 200) => new Promise(r => setTimeout(r, ms));
  const lastSend = () => calls.filter(c => c.method === 'sendMessage').at(-1).body;
  const press = (data) => push({ callback_query:{ id:'q' + uid, from:owner, data, message:{ message_id:1, chat } } });
  try {
    await wait();
    // a plain message → «Поставить задачу?» → the task, from Telegram
    push({ message:{ message_id:2, from:owner, chat, text:'сделай карусель про офис' } }); await wait();
    const key = lastSend().reply_markup.inline_keyboard[0][0].callback_data;
    assert.match(key, /^nt:/);
    press(key); await wait();
    const fromTg = d.desk.list(30).find(x => x.text === 'сделай карусель про офис');
    assert.ok(fromTg); assert.equal(fromTg.source, 'telegram');
    d.desk.act(fromTg.id, 'cancel');   // out of the queue: the next ones go through the fake runner in order
    // a stranger is not heard
    push({ message:{ message_id:3, from:{ id:7 }, chat:{ id:7, type:'private' }, text:'привет' } }); await wait();
    assert.equal(d.desk.list(30).filter(x => x.text === 'привет').length, 0);
    // a result to check: its card carries «Принять / 👍 / 👎»; 👍 accepts with the rating up
    const id = await d.toReview('презентация для бота'); await wait(300);
    const card = bot.state().cards[id];
    assert.equal(card.topic, 'inbox');
    press(`up:${id}`); await wait();
    assert.equal(d.desk.get(id).status, 'done'); assert.equal(d.desk.get(id).rating.value, 'up');
    // a style option by its button
    d.routes.push({ agent:'montage', deliverable:'video', visual:'video' });
    const id2 = await d.task('смонтируй рилс'); await wait();
    const opt = d.desk.get(id2).question.options[0];
    press(`o:${id2}:${opt.id}`); await wait();
    assert.equal(d.desk.get(id2).style, opt.label);
    // a reply to the card of a result is a revision
    const id3 = await d.toReview('ещё презентация'); await wait(300);
    push({ message:{ message_id:9, from:owner, chat, text:'добавь слайд с ценой', reply_to_message:{ message_id:bot.state().cards[id3].mid } } }); await wait();
    assert.equal(d.desk.get(id3).status, 'queued'); assert.match(d.desk.get(id3).steps.at(-1).text, /добавь слайд с ценой/);
    // pause and «Продолжить» from the card
    press(`p:${id3}`); await wait(); assert.equal(d.desk.get(id3).status, 'paused');
    press(`r:${id3}`); await wait(); assert.equal(d.desk.get(id3).status, 'queued');
  } finally { bot.stop(); delete process.env.HQ_TG_API; }
});

test('очередь: ответы и проверка раньше новой работы; лёгкий поток не берёт монтаж; монтаж — со слотом тяжёлых задач', async () => {
  const d = setup();
  d.routes.push({ agent:'montage', deliverable:'video', visual:'video', style_named:'стекло' });
  const reel = await d.task('смонтируй рилс');
  const deck = await d.task('презентация');
  // a light worker skips the montage
  let job = await d.claim({ worker:'w1', light:true });
  assert.equal(job.id, deck); assert.equal(job.heavy, false);
  await d.finish(deck, { result:'need', question:'Сколько слайдов?', session:'S1' });
  await d.call('POST', `tasks/${deck}/answer`, { text:'десять' });
  // the answer goes before the montage that waits longer
  job = await d.claim({ worker:'w0' });
  assert.equal(job.id, deck); assert.equal(job.kind, 'answer');
  job = await d.claim({ worker:'w1', light:true });
  assert.equal(job, null);
  job = await d.claim({ worker:'w2' });
  assert.equal(job.id, reel); assert.equal(job.heavy, true);
  // a worker asking again gives back only its own unfinished task (and takes it again); the other worker's task stays in work
  const again = await d.claim({ worker:'w0' });
  assert.equal(again.id, deck); assert.ok((await d.get(deck)).steps.some(x => /не сдал/.test(x.text)));
  assert.equal((await d.get(reel)).status, 'work'); assert.ok(!(await d.get(reel)).steps.some(x => /не сдал/.test(x.text)));
});

test('диск: через 30 дней — без материалов и старых версий, исполнитель получает purge, а для правки — restore', async () => {
  const d = setup();
  const id = await d.toReview();
  await d.call('POST', `tasks/${id}/revise`, { text:'v2' });
  await d.deliver(await d.claim(), { 'index.html':'<h1>v2</h1>' });
  await d.call('POST', `tasks/${id}/approve`, { publish:true });
  const dir = path.join(d.dataDir, 'desk', 'tasks', id);
  assert.ok(fs.existsSync(path.join(dir, 'v1')) && fs.existsSync(path.join(dir, 'v2')));
  assert.ok(d.desk.tidy(Date.now() + 40 * 864e5) > 0);
  assert.ok(!fs.existsSync(path.join(dir, 'v1')) && fs.existsSync(path.join(dir, 'v2')));
  assert.equal((await d.call('GET', `files/${id}/v2/index.html`, null, { 'x-guest':'1' })).status, 200);
  const real = Date.now;
  Date.now = () => real() + 10 * 864e5;
  try {
    const r = await d.claimRaw({ worker:'w' });
    assert.deepEqual(r.j.purge, [id]); assert.equal(r.j.idle, true);
  } finally { Date.now = real; }
  await d.call('POST', `tasks/${id}/revise`, { text:'v3' });
  const job = await d.claim({ worker:'w' });
  assert.equal(job.kind, 'revise'); assert.deepEqual(job.restore, ['index.html']);
  const got = await d.call('GET', `runner/${id}/result/index.html`, null, R);
  assert.equal(got.status, 200); assert.match(String(got.j), /v2/);
});

test('очередь: главный поток при лёгких соседях берёт рендер первым', async () => {
  const d = setup();
  const deck = await d.task('презентация');
  d.routes.push({ agent:'montage', deliverable:'video', visual:'video', style_named:'стекло' });
  const reel = await d.task('смонтируй рилс');
  assert.equal((await d.claim({ worker:'w0', prefer_heavy:true })).id, reel);
  assert.equal((await d.claim({ worker:'w1', light:true })).id, deck);
});

/* ---------- control agents: the evening report for the owner ---------- */

test('агент контроля: отчёт по отделу приходит владельцу на проверку, руководитель его не видит, в историю не попадает', async () => {
  const d = setup();
  const own = await d.toReview('сделай презентацию');               // slides — маркетинг
  const t = await d.desk.controlReport('marketing', { manual:true });
  assert.equal(t.status, 'review'); assert.ok(t.control); assert.equal(t.route.agent, 'mkcontrol');
  assert.ok((await d.call('GET', `files/${t.id}/v1/index.html`)).status === 200);
  const owner = (await d.call('GET', 'tasks')).j.tasks;
  assert.ok(owner.some(x => x.id === t.id));
  const head = (await d.call('GET', 'tasks', null, FIRUZA)).j.tasks;
  assert.ok(!head.some(x => x.id === t.id)); assert.ok(head.some(x => x.id === own));
  assert.equal((await d.call('POST', `tasks/${t.id}/approve`, { publish:true }, FIRUZA)).status, 403);
  await d.call('POST', `tasks/${t.id}/approve`, { publish:true });
  const done = await d.get(t.id);
  assert.equal(done.status, 'done'); assert.equal(done.published, false);
  assert.ok(!(await d.call('GET', 'history.json', null, { 'x-guest':'1' })).j.some(h => h.id === 'desk-' + t.id));
  // the dispatcher never gets a control agent, and it is not among the agents a head can be given
  assert.ok(!d.desk.agents().some(a => a.id === 'mkcontrol'));
  // a quiet department makes no evening report
  assert.equal(await d.desk.controlReport('traffic'), null);
});

test('Telegram: материалы результата — слайды альбомом по порядку, видео роликом, презентация файлом; карточка с кнопками после них', async () => {
  const calls = []; let updates = [], mid = 900;
  const api = http.createServer(async (req, res) => {
    const parts = []; for await (const c of req) parts.push(c);
    const method = req.url.split('/').pop(), raw = Buffer.concat(parts).toString('latin1');
    let body = {};
    if (/^multipart/.test(req.headers['content-type'] || '')) {
      // the names of the fields and files of the form, in order
      for (const m of raw.matchAll(/name="([^"]+)"(?:; filename="([^"]+)")?\r\n(?:[^\r\n]+\r\n)*\r\n([^\r]*)/g)) body[m[1]] = m[2] ? `<file ${m[2]}>` : Buffer.from(m[3], 'latin1').toString('utf8');
    } else try { body = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); } catch {}
    if (method === 'getUpdates') { await new Promise(r => setTimeout(r, 20)); return res.end(JSON.stringify({ ok:true, result:updates.splice(0) })); }
    calls.push({ method, body });
    res.end(JSON.stringify({ ok:true, result:method === 'getWebhookInfo' ? { url:'' } : method === 'getMe' ? { username:'b' } : /^send/.test(method) ? (method === 'sendMediaGroup' ? [{ message_id:++mid }] : { message_id:++mid }) : true }));
  }).listen(0);
  servers.push(api);
  process.env.HQ_TG_API = `http://127.0.0.1:${api.address().port}`;
  const d = setup();
  const bot = startTelegram({ desk:d.desk, dataDir:d.dataDir, token:'T', owners:['42'], site:'https://hq', ask:async () => '', ownerVoice:async () => null });
  const wait = (ms = 250) => new Promise(r => setTimeout(r, ms));
  try {
    await wait();
    const id = await d.task('карусель и ролик'); await wait();
    const quiet = calls.filter(c => c.method === 'sendMessage').at(-1);
    assert.equal(quiet.body.disable_notification, true);   // a quiet card while in work
    const job = await d.claim();
    await d.deliver(job, { 'slide-10.png':'p10', 'slide-2.png':'p2', 'slide-1.png':'p1', 'rils.mp4':'v', 'deck.pdf':'d', 'index.html':'<h1>x</h1>' }, { main:'index.html' });
    calls.length = 0;
    await d.claim(); await d.finish(id, { result:'qa', verdict:'ok' }); await wait(500);
    const seq = calls.map(c => c.method).filter(m => /^(send|delete)/.test(m));
    assert.deepEqual(seq, ['deleteMessage', 'sendMediaGroup', 'sendVideo', 'sendDocument', 'sendMessage', 'sendMessage']);
    assert.match(calls.filter(c => c.method === 'sendMessage').at(-2).body.text, /превью.*«📎 Файлы»/s);   // the album is a preview
    const g = calls.find(c => c.method === 'sendMediaGroup').body, album = JSON.parse(g.media);
    assert.equal(album.length, 3); assert.equal(album[0].caption, 'Задача');
    assert.deepEqual([g.f0, g.f1, g.f2], ['<file slide-1.png>', '<file slide-2.png>', '<file slide-10.png>']);
    assert.equal(calls.find(c => c.method === 'sendVideo').body.video, '<file rils.mp4>');
    assert.equal(calls.find(c => c.method === 'sendDocument').body.document, '<file deck.pdf>');
    const card = calls.filter(c => c.method === 'sendMessage').at(-1).body;
    assert.ok(!card.disable_notification); assert.ok(card.reply_markup.inline_keyboard.flat().some(b => b.callback_data === `ok:${id}`));
    assert.equal(card.reply_markup.inline_keyboard.at(-1)[0].web_app.url, `https://hq/app/#t=${id}`);   // «Открыть» — the mini app
    // accepted: the card moves to «Готово» — the materials are not sent again
    calls.length = 0;
    d.desk.act(id, 'approve'); await wait(400);
    assert.ok(!calls.some(c => ['sendMediaGroup', 'sendVideo', 'sendDocument'].includes(c.method)));
    assert.match(calls.filter(c => c.method === 'sendMessage').at(-1).body.text, /В истории офиса|Принято/);
    // «📎 Файлы»: every file separately, as a document, original bytes — the main video, slides in order, the PDF, the page last
    calls.length = 0;
    await bot.sendFiles(id);
    const docs = calls.filter(c => /^send(Photo|Video|Document|MediaGroup)$/.test(c.method));
    assert.ok(docs.every(c => c.method === 'sendDocument' && c.body.disable_content_type_detection === 'true'));
    assert.deepEqual(docs.map(c => c.body.document), ['<file rils.mp4>', '<file slide-1.png>', '<file slide-2.png>', '<file slide-10.png>', '<file deck.pdf>', '<file index.html>']);
    assert.match(docs[0].body.caption, /^1\/6 · /);
    assert.match(calls.find(c => c.method === 'sendMessage').body.text, /6 файлов в исходном качестве/);
  } finally { bot.stop(); delete process.env.HQ_TG_API; }
});

test('Telegram: «пришли файлом» ответом на карточку — это просьба о файлах, а не правка', () => {
  for (const t of ['файлом', 'Пришли файлами', 'скинь оригиналы', 'дай в лучшем качестве', 'без сжатия пришли']) assert.ok(wantsFiles(t), t);
  for (const t of ['переделай третий слайд', 'добавь файл с ценами', 'сделай хук короче', '']) assert.ok(!wantsFiles(t), t);
});

test('оценка времени: без истории — типичное время, очередь ждёт свободный поток, после запусков — по истории агента', async () => {
  const d = setup();
  const a = await d.task('первая'), b = await d.task('вторая'), c = await d.task('третья');
  const ea = (await d.get(a)).eta, ec = (await d.get(c)).eta;
  assert.ok(ea && ea.basis === 'typical' && ea.ms >= 15 * 60e3 && ea.ms <= 20 * 60e3, JSON.stringify(ea));
  assert.ok(ec.ms > ea.ms, 'третья ждёт, пока освободится поток');
  assert.match((await d.get(a)).steps.at(-1).text, /Результат — примерно через \d+ мин \(к \d\d:\d\d МСК\)/);
  const job = await d.claim({ worker:'w1' });
  assert.equal(job.id, a);
  const w = await d.get(a);
  assert.equal(w.status, 'work'); assert.ok(w.eta && w.eta.ms > 0 && !w.eta.late);
  assert.match(w.steps.at(-1).text, /взял задачу в работу\. Результат — примерно через/);
  // the public view has the estimate too, without details
  const pub = (await d.call('GET', 'live.json', null, { 'x-guest':'1' })).j;
  assert.ok(pub.tasks.find(t => t.id === a)?.eta?.at);
  await d.deliver(job);
  const j2 = await d.claim({ worker:'w1' });
  if (j2?.kind === 'qa') await d.finish(j2.id, { result:'qa', verdict:'ok', notes:'ок' });
  const j3 = await d.claim({ worker:'w1' }); await d.deliver(j3);
  for (const t of [a, b, c]) assert.notEqual((await d.get(t)).status, 'question');
  const e = (await d.get(c)).eta;
  assert.ok(e && e.basis === 'history', JSON.stringify(e));
  assert.equal((await d.get(a)).eta, null, 'на проверке у владельца — без оценки');
});
