/* Working desk of the office — the owner sets tasks for agents: /api/assistant/desk/*.

   The owner writes (or tells the assistant) what is needed. The dispatcher — Claude over the agent
   catalog of the site (who does what, skills, examples) — picks the agent and the skill, writes the
   brief, or asks one question when the result would be wrong without the answer. The runner on the
   server (apps/hq-office/runner, Claude Code with the team's skills, the same login as the bots)
   takes queued tasks, reports steps, uploads the result and either brings it for review or asks.
   The owner looks at the result in the office: «ок» publishes it to the task history, or a revision
   goes back to the same agent and session.

     owner:  PUT upload?name=  · POST tasks {text, agent, uploads} · GET tasks · GET events (SSE)
             POST tasks/<id>/answer {text} · /approve {publish} · /revise {text} · /retry · /cancel
     runner: POST runner/hello · POST runner/claim · GET runner/<id>/input/<name>
             POST runner/<id>/step {text} · PUT runner/<id>/file?path= · POST runner/<id>/finish
     public: GET history.js | history.json (accepted and published tasks, in the format of tasks.js)
             GET files/<id>/v<n>/<path> — the owner always, everyone once published

   Statuses: routing → question | queued → work → review → done, plus cancelled and error. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import Anthropic from '@anthropic-ai/sdk';
import { officeWindow, moscowDate } from './office.mjs';

const FILE_LIMIT = 300e6;
const STEPS_KEPT = 80;
const KIND = { slides:'Презентация', document:'Документ', landing:'Сайт', script:'Сценарии', carousel:'Дизайн', video:'Видео', image:'Дизайн', research:'Исследование', other:'Разработка' };
const STATUS = { routing:'диспетчер разбирает', question:'нужен ваш ответ', queued:'в очереди', work:'в работе', review:'на проверке', done:'готово', cancelled:'отменена', error:'ошибка' };
const OPEN = ['routing', 'question', 'queued', 'work', 'review'];
const MIME = { '.html':'text/html; charset=utf-8', '.htm':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.md':'text/markdown; charset=utf-8',
  '.txt':'text/plain; charset=utf-8', '.pdf':'application/pdf', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml',
  '.mp4':'video/mp4', '.webm':'video/webm', '.mov':'video/quicktime', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.woff2':'font/woff2', '.ttf':'font/ttf', '.zip':'application/zip', '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation' };

const ROUTER_PROMPT = `Ты — диспетчер живого офиса агентов AICEX (hq2.aicex.club). Владелец, Илья Палий, ставит задачу своими словами. Ты решаешь, кто из агентов офиса её сделает, каким скиллом, и пишешь агенту ТЗ. Агенты — Claude Code со скиллами команды на сервере: делают презентации, сайты, документы, сценарии, карусели, монтаж видео и т. п. и сдают готовые файлы.

Как решать:
- agent — один агент из каталога ниже, чья это работа. Если владелец сам выбрал агента, оставь его, если задача ему хоть как-то по силам.
- skill — имя скилла этого агента из каталога (например sprint-slides, montazh-rils-kobalt, karusel) или пустая строка, если подходящего нет.
- title — короткое название задачи для доски, до 70 знаков, по-русски.
- brief — ТЗ агенту: что сделать, для кого и зачем, что должно получиться (формат, объём, стиль бренда AICEX), из каких материалов. Подставь разумные значения по умолчанию вместо вопросов.
- deliverable — тип результата.
- why — одной фразой, почему этот агент.
- action = ask и question — только если без ответа результат точно выйдет не тем: нет видео для монтажа, неясно, о каком продукте или эфире речь, и т. п. Один конкретный вопрос. Иначе action = assign и question пустой.
Пиши по-русски.`;

const RULES = `Как работать:
- Сначала проверь, твоя ли это задача и хватает ли материалов. Если задача не по твоему профилю или без ответа владельца результат выйдет не тем — ничего не делай, коротко объясни почему и последней строкой ответа напиши: NEED: <один конкретный вопрос владельцу>.
- Работаешь без окна: ничего не спрашивай по ходу и не жди подтверждений — делай результат целиком, в стиле бренда AICEX, по-русски.
- Всё, что сдаёшь, положи в папку out/ — только готовые файлы, без черновиков и исходников. Главный файл для просмотра: для презентации, сайта, документа или текста — out/index.html (одна страница, открывается в браузере, картинки и стили рядом в out/); для видео — out/<имя>.mp4; для картинок — out/<имя>.jpg или .png. Если по скиллу получается PDF или PPTX — положи их в out/ рядом с index.html.
- В конце напиши 2–3 предложения отчёта для владельца: что сделано и что посмотреть. Предпоследней строкой: SUMMARY: <одно предложение для истории офиса — что получилось и зачем, без имён файлов>. Последней строкой: RESULT: out/<главный файл>.`;

export function createDesk({ claude, model, fallback, dataDir, officeDir, runnerToken }) {
  const DIR = path.join(dataDir, 'desk');
  fs.mkdirSync(path.join(DIR, 'uploads'), { recursive:true });
  const STORE = path.join(DIR, 'tasks.json');
  let tasks = [];
  try { tasks = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch {}
  const clients = new Set();
  let runner = { seenAt:0, version:'' };

  const save = () => { fs.writeFileSync(STORE + '.tmp', JSON.stringify(tasks)); fs.renameSync(STORE + '.tmp', STORE); };
  const now = () => new Date().toISOString();
  const byId = id => tasks.find(t => t.id === id);
  const taskDir = id => path.join(DIR, 'tasks', id);

  /* ---------- the catalog: agents of the office, their skills and example tasks ---------- */

  function catalog() {
    const W = officeWindow(officeDir) || {};
    const CFG = W.OFFICE_CONFIG || { depts:[] }, CAT = W.AGENT_CATALOG || {}, AC = W.AGENT_CONTENT || {};
    const WS = W.OFFICE_WORKS?.skills || {}, EXTRA = W.OFFICE_SKILLS_LIBRARY?.extra || [];
    const agents = [], lines = ['# Агенты офиса (id в скобках)'];
    for (const d of CFG.depts) {
      lines.push('', `## ${d.name}`);
      for (const id of d.agents) {
        const c = AC[id] || {}, seen = new Set();
        const skills = [...(c.skills || []), ...(WS[id] || []), ...EXTRA.filter(s => (s.agents || []).includes(id))]
          .filter(s => s?.name && !seen.has(s.name) && seen.add(s.name));
        const a = { id, name:CAT[id]?.name || id, role:CAT[id]?.role || '', dept:d.id, deptName:d.name, lead:c.lead || '' };
        agents.push(a);
        lines.push(`- ${a.name} (${id}): ${a.role}. ${a.lead}`,
          skills.length ? `  Скиллы: ${skills.map(s => `${s.name} — ${s.title}`).join('; ')}` : '  Скиллы: нет',
          ...(c.templates || []).slice(0, 2).map(x => `  Пример задачи: «${x.prompt}»`));
      }
    }
    return { agents, text:lines.join('\n') };
  }
  const agentOf = id => catalog().agents.find(a => a.id === id);

  /* ---------- views and events ---------- */

  const fileUrl = (t, p) => `/api/assistant/desk/files/${t.id}/v${t.result.version}/${p.split('/').map(encodeURIComponent).join('/')}`;
  function view(t) {
    const a = t.route ? agentOf(t.route.agent) : t.agent ? agentOf(t.agent) : null;
    const waiting = tasks.filter(x => x.status === 'queued').sort((x, y) => x.queuedAt.localeCompare(y.queuedAt));
    return {
      id:t.id, created:t.created, updated:t.updated, text:t.text, files:t.files.map(f => f.name), askedAgent:t.agent || '',
      status:t.status, statusText:STATUS[t.status] || t.status, queuePos:t.status === 'queued' ? waiting.indexOf(t) + 1 : 0,
      agent:a ? { id:a.id, name:a.name, dept:a.dept } : null, route:t.route || null, question:t.question || null, answers:t.answers,
      steps:t.steps.slice(-40), error:t.error || '', published:Boolean(t.published), versions:t.versions || 0,
      result:t.result ? { version:t.result.version, summary:t.result.summary, note:t.result.note || '', main:t.result.main, mainUrl:t.result.main ? fileUrl(t, t.result.main) : '',
        files:t.result.files.map(f => ({ path:f.path, size:f.size, url:fileUrl(t, f.path) })) } : null,
    };
  }
  function emit(t) {
    t.updated = now(); save();
    const line = `data: ${JSON.stringify({ t:'task', task:view(t) })}\n\n`;
    for (const res of clients) res.write(line);
  }
  function step(t, text) {
    t.steps.push({ at:now(), text:String(text).slice(0, 300) });
    if (t.steps.length > STEPS_KEPT) t.steps.splice(0, t.steps.length - STEPS_KEPT);
  }
  const runnerView = () => ({ online:Date.now() - runner.seenAt < 90e3, seenAt:runner.seenAt ? new Date(runner.seenAt).toISOString() : '' });
  // keeps the stream open through proxies and tells the office whether the runner is alive
  setInterval(() => { const line = `data: ${JSON.stringify({ t:'runner', runner:runnerView() })}\n\n`; for (const res of clients) res.write(line); }, 25e3).unref();
  // uploads of a form that was never sent
  const sweep = () => {
    const root = path.join(DIR, 'uploads');
    for (const d of fs.readdirSync(root)) try { if (Date.now() - fs.statSync(path.join(root, d)).mtimeMs > 864e5) fs.rmSync(path.join(root, d), { recursive:true, force:true }); } catch {}
  };
  sweep(); setInterval(sweep, 3600e3).unref();

  /* ---------- the dispatcher ---------- */

  async function route(t) {
    if (!claude) { t.status = 'error'; t.error = 'Диспетчер не подключён к Claude (нет ключа).'; return emit(t); }
    const cat = catalog(), ids = cat.agents.map(a => a.id);
    const asked = t.agent && ids.includes(t.agent) ? agentOf(t.agent) : null;
    const request = [`Просьба владельца: «${t.text}»`,
      asked ? `Владелец сам выбрал агента: ${asked.name} (${asked.id}).` : 'Агента владелец не выбирал — выбери сам.',
      `Материалы от владельца: ${t.files.length ? t.files.map(f => f.name).join(', ') : 'нет'}.`,
      ...t.answers.map(x => `Уточнение. Вопрос: ${x.q} Ответ владельца: ${x.a}`)].join('\n');
    const schema = { type:'object', additionalProperties:false, required:['action', 'agent', 'skill', 'title', 'brief', 'deliverable', 'why', 'question'], properties:{
      action:{ type:'string', enum:['assign', 'ask'] }, agent:{ type:'string', enum:ids }, skill:{ type:'string' }, title:{ type:'string' }, brief:{ type:'string' },
      deliverable:{ type:'string', enum:Object.keys(KIND) }, why:{ type:'string' }, question:{ type:'string' } } };
    try {
      const msg = await claude.beta.messages.create({
        model, max_tokens:16000, ...fallback, output_config:{ effort:'low', format:{ type:'json_schema', schema } },
        system:[{ type:'text', text:ROUTER_PROMPT }, { type:'text', text:cat.text, cache_control:{ type:'ephemeral' } }],
        messages:[{ role:'user', content:request }],
      });
      if (msg.stop_reason !== 'end_turn') throw new Error('stop_reason ' + msg.stop_reason);
      const r = JSON.parse(msg.content.filter(b => b.type === 'text').map(b => b.text).join(''));
      if (!ids.includes(r.agent)) throw new Error('unknown agent ' + r.agent);
      const a = agentOf(r.agent);
      t.route = { agent:a.id, skill:String(r.skill || '').trim(), title:String(r.title || t.text).slice(0, 90), brief:String(r.brief || ''), deliverable:KIND[r.deliverable] ? r.deliverable : 'other', why:String(r.why || '') };
      if (r.action === 'ask' && String(r.question || '').trim()) {
        t.status = 'question'; t.question = { from:'dispatcher', text:r.question.trim() };
        step(t, `Диспетчер: задачу возьмёт «${a.name}», но сначала нужен ответ — ${r.question.trim()}`);
      } else {
        queue(t, { kind:'run' });
        step(t, `Диспетчер передал задачу агенту «${a.name}»${t.route.skill ? ` · скилл ${t.route.skill}` : ''}. ${t.route.why}`);
      }
    } catch (e) {
      console.error('desk route:', e.message);
      t.status = 'error';
      t.error = e instanceof Anthropic.APIError ? `Диспетчер: Claude ответил ошибкой${e.status ? ' ' + e.status : ''} — поставьте задачу ещё раз.` : 'Диспетчер не смог разобрать задачу — поставьте её ещё раз.';
    }
    emit(t);
  }
  function queue(t, pending) {
    t.status = 'queued'; t.pending = pending; t.queuedAt = now(); t.question = null;
  }
  // a task «in work» that the runner is no longer doing (it restarted, or lost us while this server
  // restarted): back to the queue once, an error the second time
  function orphan(t, why) {
    t.lost = (t.lost || 0) + 1;
    if (t.lost > 1) { t.status = 'error'; t.error = 'Исполнитель дважды не смог закончить задачу — нажмите «Повторить».'; step(t, t.error); }
    else { queue(t, t.pending || { kind:'run' }); step(t, why); }
    emit(t);
  }

  /* ---------- prompts for the runner ---------- */

  function jobPrompt(t) {
    const a = agentOf(t.route.agent), p = t.pending;
    if (p.kind === 'revise') return `Владелец посмотрел результат и просит правку: «${p.text}»\n\nВнеси правку в файлы out/ (главный файл — тот же), коротко скажи, что изменил. Правила те же: если суть результата изменилась — строка SUMMARY: <одно предложение для истории офиса>; последней строкой RESULT: out/<главный файл>, или NEED: <вопрос>, если без ответа владельца правку не сделать.`;
    if (p.kind === 'answer') return `Ответ владельца на твой вопрос: «${p.text}»\n\nПродолжай задачу по тем же правилам: предпоследней строкой SUMMARY: <одно предложение для истории офиса>, последней строкой RESULT: out/<главный файл>, или NEED: <вопрос>, если всё ещё не хватает.`;
    return [`Ты — агент «${a.name}» (${a.role}) живого офиса AICEX, отдел «${a.deptName}». Задачу поставил владелец, Илья Палий, прямо в офисе hq2.aicex.club.`,
      '', `Задача: ${t.route.title}`, `Слова владельца: «${t.text}»`, `ТЗ от диспетчера: ${t.route.brief}`,
      ...t.answers.map(x => `Уточнение. Вопрос: ${x.q} Ответ: ${x.a}`),
      t.route.skill ? `Скилл: ${t.route.skill} — вызови его инструментом Skill и работай по нему.` : 'Если среди твоих скиллов есть подходящий — работай по нему.',
      `Материалы от владельца: ${t.files.length ? t.files.map(f => 'in/' + f.name).join(', ') : 'нет'}.`, '', RULES].join('\n');
  }

  /* ---------- files ---------- */

  const safeName = n => path.basename(String(n || 'file')).replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 120) || 'file';
  function safeRel(p) {
    const rel = path.posix.normalize(String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/^out\//, ''));
    if (!rel || rel === '.' || rel.startsWith('..') || rel.split('/').some(x => x.startsWith('.'))) return '';
    return rel;
  }
  async function saveBody(req, file) {
    fs.mkdirSync(path.dirname(file), { recursive:true });
    let size = 0;
    const cap = new Transform({ transform(chunk, enc, cb) { size += chunk.length; cb(size > FILE_LIMIT ? Object.assign(new Error('too large'), { code:413 }) : null, chunk); } });
    try { await pipeline(req, cap, fs.createWriteStream(file)); } catch (e) { fs.rmSync(file, { force:true }); throw e; }
    return size;
  }
  function sendFile(req, res, file) {
    let st;
    try { st = fs.statSync(file); } catch { return notFound(res); }
    if (!st.isFile()) return notFound(res);
    const ext = path.extname(file).toLowerCase(), type = MIME[ext] || 'application/octet-stream';
    const head = { 'content-type':type, 'cache-control':'private, no-cache', 'accept-ranges':'bytes', 'x-content-type-options':'nosniff' };
    // results are pages written by an agent: an opaque origin, so they cannot act as the owner on this site
    if (ext === '.html' || ext === '.htm' || ext === '.svg') head['content-security-policy'] = 'sandbox allow-scripts allow-popups allow-forms allow-downloads';
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : st.size - Number(m[2]), end = m[1] && m[2] ? Number(m[2]) : st.size - 1;
      start = Math.max(0, start); end = Math.min(end, st.size - 1);
      if (start > end) { res.writeHead(416, { 'content-range':`bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...head, 'content-range':`bytes ${start}-${end}/${st.size}`, 'content-length':end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...head, 'content-length':st.size });
    fs.createReadStream(file).pipe(res);
  }
  const notFound = res => json(res, 404, { error:'Не найдено.' });
  const json = (res, code, body) => { res.writeHead(code, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }); res.end(JSON.stringify(body)); };
  async function readJson(req) {
    const parts = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 64e3) throw Object.assign(new Error('too large'), { code:413 }); parts.push(c); }
    try { return JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); } catch { return {}; }
  }

  /* ---------- history: what the owner accepted ---------- */

  function historyTask(t) {
    const a = agentOf(t.route.agent), main = t.result.main, url = main ? fileUrl(t, main) : '';
    const ext = path.extname(main || '').toLowerCase(), title = t.route.title;
    const media = !url ? [] : ext === '.mp4' || ext === '.webm' ? [{ type:'video', src:url, title, poster:'' }]
      : ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? [{ type:'img', src:url, title }]
      : ext === '.html' ? [{ type:'page', src:url, title }] : [];
    return { id:'desk-' + t.id, date:moscowDate(new Date(t.doneAt)), dateNote:'задачу поставили и приняли прямо в офисе', kind:KIND[t.route.deliverable] || 'Разработка',
      dept:a?.dept || 'ceo', people:['ilia'], agents:[t.route.agent], title, summary:t.result.history || t.result.summary || '',
      proof:[{ kind:'file', label:`Результат агента «${a?.name || t.route.agent}»`, url }], media, desk:true };
  }

  /* ---------- create, used by the routes and by the assistant's tool ---------- */

  function createTask({ text, agent = '', uploads = [] }) {
    const t = { id:crypto.randomBytes(4).toString('hex'), created:now(), updated:now(), text:String(text).trim().slice(0, 4000), agent:String(agent || ''),
      files:[], status:'routing', answers:[], steps:[], route:null, question:null, result:null, versions:0, published:false };
    for (const u of uploads.slice(0, 20)) {
      const src = path.join(DIR, 'uploads', safeName(u));
      if (!fs.existsSync(src)) continue;
      const name = fs.readdirSync(src)[0];
      if (!name) continue;
      fs.mkdirSync(path.join(taskDir(t.id), 'in'), { recursive:true });
      fs.renameSync(path.join(src, name), path.join(taskDir(t.id), 'in', name));
      fs.rmSync(src, { recursive:true, force:true });
      t.files.push({ name, size:fs.statSync(path.join(taskDir(t.id), 'in', name)).size });
    }
    step(t, 'Задача поставлена — диспетчер разбирает, кому её отдать.');
    tasks.unshift(t);
    emit(t);
    return { task:t, routed:route(t) };
  }

  // a short status block for the assistant: what is on the desk right now
  function summary() {
    const open = tasks.filter(t => OPEN.includes(t.status)).slice(0, 8);
    if (!open.length) return 'Задач в работе у агентов сейчас нет.';
    return 'Задачи на рабочем столе офиса: ' + open.map(t => `«${t.route?.title || t.text.slice(0, 60)}» — ${t.route ? (agentOf(t.route.agent)?.name || '') + ', ' : ''}${STATUS[t.status]}${t.question ? ` (вопрос: ${t.question.text})` : ''}`).join('; ') + '.';
  }

  // restart: interrupted routing is redone
  for (const t of tasks) if (t.status === 'routing') route(t);

  /* ---------- routes ---------- */

  async function handle(req, res, rest, isOwner) {
    const seg = rest.split('/').filter(Boolean), M = req.method;
    const url = new URL(req.url, 'http://x');

    if (M === 'GET' && (rest === 'history.js' || rest === 'history.json')) {
      const list = tasks.filter(t => t.status === 'done' && t.published && t.result).map(historyTask);
      if (rest === 'history.json') return json(res, 200, list);
      res.writeHead(200, { 'content-type':'text/javascript; charset=utf-8', 'cache-control':'no-cache' });
      return res.end(`window.OFFICE_TASKS_DESK = ${JSON.stringify(list)};\n`);
    }
    if (M === 'GET' && seg[0] === 'files' && seg.length >= 4) {
      const t = byId(seg[1]), v = Number(String(seg[2]).replace(/^v/, ''));
      if (!t || !t.result) return notFound(res);
      if (!isOwner && !(t.published && v === t.result.version)) return notFound(res);
      const rel = safeRel(seg.slice(3).map(decodeURIComponent).join('/'));
      if (!rel) return notFound(res);
      return sendFile(req, res, path.join(taskDir(t.id), 'v' + v, rel));
    }

    /* runner: Bearer token shared with apps/hq-office/runner */
    if (seg[0] === 'runner') {
      const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!runnerToken || auth.length !== runnerToken.length || !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(runnerToken))) return json(res, 403, { error:'runner token' });
      runner.seenAt = Date.now();
      if (M === 'POST' && seg[1] === 'hello') {
        // a (re)started runner has no running jobs: what it was doing goes back to the queue
        const b = await readJson(req); runner.version = String(b.version || '');
        for (const t of tasks) if (t.status === 'work') orphan(t, 'Исполнитель перезапустился — задача снова в очереди.');
        return json(res, 200, { ok:true });
      }
      if (M === 'POST' && seg[1] === 'claim') {
        // the runner does one task at a time: when it asks for the next one, nothing is in work
        for (const t of tasks) if (t.status === 'work') orphan(t, 'Исполнитель не сдал задачу — она снова в очереди.');
        const t = tasks.filter(x => x.status === 'queued').sort((x, y) => x.queuedAt.localeCompare(y.queuedAt))[0];
        if (!t) { res.writeHead(204); return res.end(); }
        const a = agentOf(t.route.agent);
        t.status = 'work'; t.versions = (t.versions || 0) + 1; t.workVersion = t.versions; t.error = '';
        step(t, t.pending.kind === 'revise' ? `«${a?.name}» вносит правку.` : t.pending.kind === 'answer' ? `«${a?.name}» получил ваш ответ и продолжает.` : `«${a?.name}» взял задачу в работу.`);
        emit(t);
        return json(res, 200, { id:t.id, kind:t.pending.kind, version:t.versions, agent:t.route.agent, skill:t.route.skill, title:t.route.title,
          prompt:jobPrompt(t), session:t.pending.kind === 'run' ? '' : t.session || '', files:t.files.map(f => f.name) });
      }
      const t = byId(seg[1]);
      if (!t) return notFound(res);
      if (M === 'GET' && seg[2] === 'input' && seg[3]) return sendFile(req, res, path.join(taskDir(t.id), 'in', safeName(decodeURIComponent(seg[3]))));
      if (M === 'POST' && seg[2] === 'step') {
        const b = await readJson(req);
        if (t.status === 'work' && b.text) { step(t, b.text); emit(t); }
        return json(res, 200, { cancelled:t.status !== 'work' });
      }
      if (M === 'PUT' && seg[2] === 'file') {
        const rel = safeRel(url.searchParams.get('path'));
        if (!rel || t.status !== 'work') return json(res, 400, { error:'path' });
        const size = await saveBody(req, path.join(taskDir(t.id), 'v' + t.workVersion, rel));
        return json(res, 200, { ok:true, size });
      }
      if (M === 'POST' && seg[2] === 'finish') {
        const b = await readJson(req);
        if (t.status !== 'work') return json(res, 200, { ok:true, ignored:true });
        if (b.session) t.session = String(b.session);
        t.lost = 0;
        if (b.result === 'review') {
          const root = path.join(taskDir(t.id), 'v' + t.workVersion), files = [];
          const walk = (d, pre) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes:true }) : []) { const rel = pre ? pre + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), rel); else files.push({ path:rel, size:fs.statSync(path.join(d, e.name)).size }); } };
          walk(root, '');
          const main = safeRel(b.main) && files.some(f => f.path === safeRel(b.main)) ? safeRel(b.main)
            : (files.find(f => f.path === 'index.html') || files.find(f => /\.(mp4|html|pdf|png|jpe?g)$/i.test(f.path)) || files[0])?.path || '';
          if (!files.length) { t.status = 'error'; t.error = 'Агент закончил, но не сдал ни одного файла.'; step(t, t.error); emit(t); return json(res, 200, { ok:true }); }
          // a revision keeps what the work is about; its own report goes to the note
          const before = t.result, revised = t.pending?.kind === 'revise' && before;
          t.result = { version:t.workVersion, main, files, summary:String((revised && before.summary) || b.summary || '').slice(0, 1200),
            note:revised ? String(b.summary || '').slice(0, 1200) : '', history:String(b.history || before?.history || '').slice(0, 400) };
          t.status = 'review'; t.pending = null;
          step(t, `Готово превью: ${main}. Агент несёт результат к вашему столу.`);
        } else if (b.result === 'need') {
          t.status = 'question'; t.question = { from:'agent', text:String(b.question || 'Агенту не хватает данных — уточните задачу.').slice(0, 800) };
          step(t, `«${agentOf(t.route.agent)?.name}» спрашивает: ${t.question.text}`);
        } else {
          t.status = 'error'; t.error = String(b.error || 'Агент не смог закончить задачу.').slice(0, 800);
          step(t, t.error);
        }
        emit(t);
        return json(res, 200, { ok:true });
      }
      return notFound(res);
    }

    /* owner */
    if (!isOwner) return json(res, 403, { error:'Ставить задачи агентам может только владелец — войдите в ассистенте.' });
    if (M === 'GET' && rest === 'tasks') return json(res, 200, { tasks:tasks.slice(0, 60).map(view), runner:runnerView(), agents:catalog().agents.map(a => ({ id:a.id, name:a.name, dept:a.dept, role:a.role })) });
    if (M === 'GET' && rest === 'events') {
      res.writeHead(200, { 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-store', 'x-accel-buffering':'no' });
      res.write(`data: ${JSON.stringify({ t:'snapshot', tasks:tasks.slice(0, 60).map(view), runner:runnerView() })}\n\n`);
      clients.add(res); req.on('close', () => clients.delete(res));
      return;
    }
    if (M === 'PUT' && rest === 'upload') {
      const id = crypto.randomBytes(8).toString('hex'), name = safeName(url.searchParams.get('name'));
      const size = await saveBody(req, path.join(DIR, 'uploads', id, name));
      return json(res, 200, { id, name, size });
    }
    if (M === 'POST' && rest === 'tasks') {
      const b = await readJson(req);
      if (!String(b.text || '').trim()) return json(res, 400, { error:'Опишите задачу.' });
      const { task } = createTask({ text:b.text, agent:b.agent, uploads:Array.isArray(b.uploads) ? b.uploads : [] });
      return json(res, 200, { task:view(task) });
    }
    if (seg[0] === 'tasks' && seg[1] && M === 'POST') {
      const t = byId(seg[1]);
      if (!t) return notFound(res);
      const b = await readJson(req), text = String(b.text || '').trim().slice(0, 4000);
      if (seg[2] === 'answer') {
        if (t.status !== 'question' || !text) return json(res, 400, { error:'Сейчас вопроса нет.' });
        t.answers.push({ q:t.question.text, a:text });
        if (t.question.from === 'agent') { queue(t, { kind:'answer', text }); step(t, `Ваш ответ: ${text}`); emit(t); }
        else { t.status = 'routing'; t.question = null; step(t, `Ваш ответ: ${text}`); emit(t); route(t); }
        return json(res, 200, { task:view(t) });
      }
      if (seg[2] === 'revise') {
        if (!['review', 'done'].includes(t.status) || !text) return json(res, 400, { error:'Правку можно дать к готовому результату.' });
        queue(t, { kind:'revise', text }); t.published = false; step(t, `Правка: ${text}`); emit(t);
        return json(res, 200, { task:view(t) });
      }
      if (seg[2] === 'approve') {
        if (t.status !== 'review') return json(res, 400, { error:'Принять можно результат на проверке.' });
        t.status = 'done'; t.doneAt = now(); t.published = b.publish !== false;
        step(t, t.published ? 'Принято — задача добавлена в историю офиса.' : 'Принято без публикации в истории.');
        emit(t);
        return json(res, 200, { task:view(t) });
      }
      if (seg[2] === 'retry') {
        if (t.status !== 'error') return json(res, 400, { error:'Повторить можно задачу, которая закончилась ошибкой.' });
        t.error = ''; t.lost = 0;
        if (t.route) { queue(t, t.pending || { kind:'run' }); step(t, 'Повтор — задача снова в очереди.'); emit(t); }
        else { t.status = 'routing'; step(t, 'Повтор — диспетчер разбирает задачу заново.'); emit(t); route(t); }
        return json(res, 200, { task:view(t) });
      }
      if (seg[2] === 'cancel') {
        if (!OPEN.includes(t.status)) return json(res, 400, { error:'Задача уже закрыта.' });
        t.status = 'cancelled'; t.pending = null; step(t, 'Задача отменена.'); emit(t);
        return json(res, 200, { task:view(t) });
      }
    }
    return notFound(res);
  }

  return { handle, createTask, summary, agents:() => catalog().agents, view };
}
