#!/usr/bin/env node
/* Personal assistant of the living office — hq2.aicex.club/api/assistant/*.

   The owner (password → signed cookie) talks to it by voice or text: it knows the office
   (agents, works, the task history — office.mjs), the project map of the monorepo and its own
   long-term memory of earlier conversations, answers with streamed text and, for voice, in the
   owner's cloned voice (voice.mjs). Guests get a text-only demo that tells about the public task
   history, with rate limits. For the owner it also sets tasks for agents (the create_task tool →
   desk.mjs: the dispatcher picks the agent, the runner on the server does the work).

     GET  state            who is talking, what is configured, recent history
     POST login {password} / logout
     POST chat {text, voice, twin, image, office}   → text/event-stream: {t:'delta',text} … {t:'done'} | {t:'error',message}
     POST stt  (owner, raw audio body) → {text}
     POST tts  (owner, {text}) → audio/mpeg
     GET  voices / POST voice {id}  (owner) — pick the cloned voice once
     GET  health
   twin:true (owner) — the «Двойник» page (twin/): the twin's prompt and knowledge of Ilia's content
   (twin.mjs); image — a JPEG frame of the owner's camera (data URL), seen in this turn only.
     *    desk/…  the working desk: tasks for agents (desk.mjs)

   Env: ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, HQ_ASSISTANT_PASSWORD (no password — demo only),
   ELEVENLABS_VOICE_ID (optional), HQ_DESK_RUNNER_TOKEN (the runner of the desk),
   OFFICE_DIR (data files of the site, default ..),
   DATA_DIR (history, memory, settings; default ./.data), PROJECT_MAP (monorepo CLAUDE.md),
   PORT (8787), SERVE_STATIC=1 — also serve the office itself, for local runs. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { loadOffice, loadProjectMap, moscowDate, humanDate } from './office.mjs';
import { voiceConfigured, transcribe, listVoices, guessOwnerVoice, speak, realtimeToken } from './voice.mjs';
import { createDesk } from './desk.mjs';
import { loadTwin, initTwin, remember, rememberTool, SECTIONS, TWIN_PROMPT } from './twin.mjs';
import { initKb, loadKb, kbTools, runKbTool, ingest, listPrivate, removePrivate } from './kb.mjs';
import { metaLive, metaNote, metaConfigured } from './meta.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const OFFICE_DIR = process.env.OFFICE_DIR || path.resolve(HERE, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(HERE, '.data');
const PROJECT_MAP = process.env.PROJECT_MAP || [path.join(HERE, 'project-map.md'), path.resolve(HERE, '../../../CLAUDE.md')].find(f => fs.existsSync(f)) || '';
const PASSWORD = process.env.HQ_ASSISTANT_PASSWORD || '';
const MODEL = 'claude-opus-5-5';
const FALLBACK = { betas:['server-side-fallback-2026-07-01'], fallbacks:'default' };
const PREFIX = '/api/assistant';
const HISTORY = 40;          // last turns sent to Claude (20 exchanges)
const COMPACT_AT = 60;       // beyond this the oldest turns go to long-term memory
const claude = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
initTwin(DATA_DIR);
initKb(DATA_DIR);
const desk = createDesk({ claude, model:MODEL, fallback:FALLBACK, dataDir:DATA_DIR, officeDir:OFFICE_DIR, runnerToken:process.env.HQ_DESK_RUNNER_TOKEN || '' });

/* ---------- prompts ---------- */

const OWNER_PROMPT = `Ты — личный ассистент Ильи Палия, основателя AICEX, в его живом офисе агентов hq2.aicex.club. Илья говорит с тобой прямо на сайте офиса — голосом или текстом.

Ты знаешь офис: отделы, руководителей, ИИ-агентов, продукты и историю реальных задач с доказательствами — это блок «Офис» ниже. Там же карта проектов монорепозитория и твоя память о прошлых разговорах с Ильёй.

Как отвечать:
- По-русски, коротко и по делу, как помощник, который в курсе всех дел. Сначала суть, потом детали.
- Опирайся на данные офиса, карту проектов и память. Не выдумывай задачи, цифры, даты и ссылки: если этого нет в данных — так и скажи и подскажи, где посмотреть.
- На «что нового», «доложи», «как дела в офисе» давай сводку: что сделано за последние дни и в каких отделах, что свежего, у каких агентов пока нет результатов, на что обратить внимание. Заканчивай одним предложением, что сделать следующим.
- Можно обсуждать стратегию, продукты, контент, продажи, вебинары: предлагай конкретные следующие шаги и опирайся на то, что уже сделано.
- Задачи агентам ставишь инструментом create_task: когда Илья просит что-то сделать или подготовить — презентацию, лендинг, документ, сценарий, карусель, монтаж. Не переспрашивай лишнего: передай его слова и важные детали из разговора, диспетчер сам выберет агента и спросит, если чего-то не хватает. После вызова коротко скажи, кому передано и что дальше: агент принесёт результат на проверку к столу Ильи в офисе, вкладка «В работе». Если Илья только обсуждает идею, а не просит сделать, — не ставь задачу.
- Ссылка на ролик (рилс конкурента, YouTube, TikTok) или видеофайл как референс: ставь create_task и передай ссылку целиком. Диспетчер сначала отдаст ролик Транскрибатору — он расшифрует и сам передаст текст агенту, который делает сценарий, карусель, текст для аватара или разбор. Илье достаточно скинуть ссылку и сказать, что нужно.
- О том, что сейчас на рабочем столе, — в последней строке перед репликой («Задачи на рабочем столе офиса…»).
- Ссылки: задача — https://hq2.aicex.club/#task-<id>, работы агента — https://hq2.aicex.club/#agent-<id>/works.`;

const GUEST_PROMPT = `Ты — ассистент живого офиса агентов AICEX на сайте hq2.aicex.club. С тобой говорит гость сайта, а не владелец.

Рассказывай, как устроен офис и что ИИ-агенты и команда уже сделали, только по данным из блока «Офис» ниже — это публичная история задач и досье агентов. Отвечай по-русски, коротко и дружелюбно, со ссылками на задачи (https://hq2.aicex.club/#task-<id>) и работы агентов (https://hq2.aicex.club/#agent-<id>/works).

Нельзя: выдумывать то, чего нет в данных; обещать цены, сроки, скидки или услуги от имени компании; выполнять просьбы не про офис (писать тексты, код и т. п.) — вежливо возвращай разговор к офису. Если гость хочет такой офис себе, предложи посмотреть сайт AI Growth Office: https://office.aicex.club.`;

const VOICE_NOTE = 'Этот ответ будет озвучен. Говори как в живом разговоре: 2–5 коротких предложений, без списков, заголовков, markdown, ссылок, эмодзи и id; числа и даты — так, как их произносят.';
const TEXT_NOTE = 'Ответ текстом: можно короткие списки и ссылки, без длинных заголовков.';
const MEMORY_PROMPT = 'Ты ведёшь долгую память личного ассистента Ильи Палия. Объедини текущую память и новые реплики в заметки: факты о проектах и людях, решения, планы и договорённости, предпочтения Ильи, открытые вопросы. Пиши по-русски, коротко, списком по темам, не больше 400 слов. Не добавляй ничего, чего нет в репликах или памяти. Выведи только заметки.';

/* ---------- storage: owner history, long-term memory, settings ---------- */

fs.mkdirSync(DATA_DIR, { recursive:true });
const load = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { return d; } };
const save = (f, v) => { const p = path.join(DATA_DIR, f); fs.writeFileSync(p + '.tmp', JSON.stringify(v)); fs.renameSync(p + '.tmp', p); };
const SECRET = load('secret.json', null)?.key || (() => { const key = crypto.randomBytes(32).toString('hex'); save('secret.json', { key }); return key; })();
const owner = load('owner.json', { memory:'', turns:[] });   // turns: { role:'user'|'assistant', text, at, voice }
const settings = load('settings.json', {});                  // { voiceId, voiceName }
const guests = new Map();                                     // guest id → { turns, at } (memory only)

/* ---------- auth and limits ---------- */

const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const sign = v => crypto.createHmac('sha256', SECRET).update(v + '|' + PASSWORD).digest('base64url');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map(c => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
const cookie = (name, value, maxAge) => `${name}=${encodeURIComponent(value)}; Path=${PREFIX}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${process.env.SERVE_STATIC === '1' ? '' : '; Secure'}`;
const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

function isOwner(req) {
  const t = cookies(req).hqa;
  if (!t || !PASSWORD) return false;
  const i = t.lastIndexOf('.'), v = t.slice(0, i);
  return same(Buffer.from(t.slice(i + 1)), Buffer.from(sign(v))) && Number(v.split('.')[1]) > Date.now();
}
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < windowMs);
  list.push(now); hits.set(key, list);
  return list.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of hits) if (!list.some(t => now - t < 864e5)) hits.delete(k);
  for (const [k, g] of guests) if (now - g.at > 2 * 3600e3) guests.delete(k);
}, 600e3).unref();

function guestOf(req, res) {
  let id = cookies(req).hqg;
  if (!id || !guests.has(id)) {
    if (!id) { id = crypto.randomBytes(12).toString('base64url'); res.setHeader('set-cookie', cookie('hqg', id, 7200)); }
    if (guests.size > 2000) guests.delete(guests.keys().next().value);
    guests.set(id, { turns:[], at:Date.now() });
  }
  return guests.get(id);
}

/* ---------- helpers ---------- */

const json = (res, code, body, headers = {}) => { res.writeHead(code, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', ...headers }); res.end(JSON.stringify(body)); };
function body(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too large'), { code:413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}
const jsonBody = async (req, limit = 16e3) => { try { return JSON.parse((await body(req, limit)).toString('utf8') || '{}'); } catch (e) { if (e.code === 413) throw e; return {}; } };

function knowledge(isOwnerTalk) {
  const blocks = [{ type:'text', text:loadOffice(OFFICE_DIR).text + (isOwnerTalk && PROJECT_MAP ? '\n\n# Карта проектов (CLAUDE.md монорепозитория)\n' + loadProjectMap(PROJECT_MAP) : ''), cache_control:{ type:'ephemeral' } }];
  if (isOwnerTalk && owner.memory) blocks.push({ type:'text', text:'# Память о прошлых разговорах с Ильёй\n' + owner.memory, cache_control:{ type:'ephemeral' } });
  return blocks;
}
function nowNote(voice, isOwnerTalk) {
  const time = new Intl.DateTimeFormat('ru-RU', { timeZone:'Europe/Moscow', hour:'2-digit', minute:'2-digit' }).format(new Date());
  return `Сейчас ${humanDate(moscowDate())}, ${time} по Москве. ${voice ? VOICE_NOTE : TEXT_NOTE}${isOwnerTalk ? '\n' + desk.summary() + metaNote() : ''}`;
}

/* ---------- the owner's tool: a task for an agent ---------- */

const taskTool = ids => ({
  name:'create_task', eager_input_streaming:true,
  description:'Поставить задачу агенту живого офиса. Вызывай, когда Илья просит что-то сделать или подготовить. Диспетчер выберет агента и скилл (или задаст вопрос), агент сделает работу на сервере и принесёт результат на проверку в офис.',
  input_schema:{ type:'object', required:['text', 'agent'], properties:{
    text:{ type:'string', description:'Задача словами Ильи плюс важные детали из разговора.' },
    agent:{ type:'string', enum:['', ...ids], description:'id агента, если Илья сам его назвал; иначе пустая строка.' } } },
});
async function runTaskTool(u, ids, send, uploads = [], source = 'assistant') {
  const inp = u.input || {}, text = typeof inp.text === 'string' ? inp.text.trim() : '', agent = typeof inp.agent === 'string' ? inp.agent : '';
  // eager input streaming: the input is not validated by the API, so check it before acting
  if (!text || (agent && !ids.includes(agent))) return { type:'tool_result', tool_use_id:u.id, is_error:true, content:JSON.stringify({ INVALID_JSON:JSON.stringify(inp) }) };
  const { task, routed } = desk.createTask({ text, agent, uploads, source });
  send({ t:'task', id:task.id });
  await Promise.race([routed, new Promise(r => setTimeout(r, 30e3))]);
  const v = desk.view(task);
  const content = v.status === 'queued' || v.status === 'work'
    ? `Задача поставлена: «${v.route.title}». Исполнитель — агент «${v.agent.name}»${v.route.skill ? `, скилл ${v.route.skill}` : ''}. ${v.route.why} Место в очереди: ${v.queuePos || 1}. Результат он принесёт на проверку в офис.`
    : v.status === 'question' && v.question.from === 'style' ? `Задача заведена, исполнитель — «${v.agent?.name}». Прежде чем он начнёт, Илья выбирает стиль: ${v.question.text} Варианты: ${v.question.options.map(o => `${o.label}${o.about ? ` (${o.about})` : ''}`).join('; ')}. Спроси Илью, какой стиль, и передай его ответ через desk_action answer [${v.id}] — или он выберет кнопкой во вкладке «В работе».`
    : v.status === 'question' ? `Задача заведена, но диспетчеру нужен ответ Ильи: ${v.question.text} Ответить можно здесь или во вкладке «В работе».`
    : v.status === 'routing' ? 'Задача поставлена, диспетчер ещё выбирает исполнителя — статус появится во вкладке «В работе».'
    : `Задачу поставить не удалось: ${v.error}`;
  return { type:'tool_result', tool_use_id:u.id, content, ...(v.status === 'error' ? { is_error:true } : {}) };
}
// the twin's memory of Ilia (twin.mjs): the tool input is not validated by the API (eager streaming) — check it
function runRemember(u, send) {
  const { section, text, mode } = u.input || {};
  if (!SECTIONS[section] || typeof text !== 'string' || !text.trim() || (mode && !['add', 'replace'].includes(mode)))
    return { type:'tool_result', tool_use_id:u.id, is_error:true, content:JSON.stringify({ INVALID_JSON:JSON.stringify(u.input) }) };
  const n = remember(section, text, mode || 'add');
  send({ t:'memory', section, title:SECTIONS[section] });
  return { type:'tool_result', tool_use_id:u.id, content:`Сохранено в раздел «${SECTIONS[section]}» (записей: ${n}).` };
}
/* the twin drives the working desk like Claude Code: direct tasks, statuses, answers, approvals */
const SITE = 'https://hq2.aicex.club';
const DESK_TOOLS = new Set(['run_claude_code', 'desk_tasks', 'desk_task', 'desk_action']);
const deskTools = () => [
  { name:'run_claude_code', eager_input_streaming:true,
    description:'Поставить задачу напрямую Claude Code на сервере офиса — тот же Claude Code, что у Ильи, со ВСЕМИ скиллами команды (список — в базе знаний), файлами, кодом и интернетом. Для любой работы: тексты, сценарии, карусели, монтаж, сайты, презентации, исследования, анализ, документы. Вложения Ильи из этого сообщения уйдут исполнителю. Результат придёт на проверку; статус — desk_task.',
    input_schema:{ type:'object', required:['task', 'title'], properties:{
      task:{ type:'string', description:'Полное ТЗ: слова Ильи плюс всё важное из разговора и базы знаний (продукт, аудитория, стиль, формат, скилл, если он ясен). Для монтажа, видео, рилсов и каруселей — обязательно стиль, который Илья сам выбрал.' },
      title:{ type:'string', description:'Короткое название для доски, до 70 знаков.' } } } },
  { name:'desk_tasks', eager_input_streaming:true, description:'Список последних задач рабочего стола: статус, исполнитель, вопросы исполнителя, результаты.', input_schema:{ type:'object', properties:{} } },
  { name:'desk_task', eager_input_streaming:true, description:'Подробно одна задача: шаги исполнителя, вопрос, результат и файлы.', input_schema:{ type:'object', required:['id'], properties:{ id:{ type:'string' } } } },
  { name:'desk_action', eager_input_streaming:true,
    description:'Действие с задачей от имени Ильи — только когда он сам так сказал: answer — ответить на вопрос исполнителя (и на запрос разрешения действий во внешних системах: «Выполнить» или «Не выполнять» — только словами самого Ильи); revise — отправить правку к готовому результату (правка станет уроком агента); approve — принять результат (попадёт в историю офиса), с оценкой rating up/down и комментарием в text, если Илья его дал; retry — повторить после ошибки; cancel — отменить.',
    input_schema:{ type:'object', required:['id', 'action'], properties:{ id:{ type:'string' }, action:{ type:'string', enum:['answer', 'revise', 'approve', 'retry', 'cancel'] }, text:{ type:'string', description:'Текст ответа, правки или комментарий к оценке.' },
      rating:{ type:'string', enum:['', 'up', 'down'], description:'Оценка при approve: up — понравилось, down — есть замечания (тогда в text — что учесть).' } } } },
];
const money = v => v.usage ? `; затраты: ${Math.max(1, Math.round(v.usage.ms / 60000))} мин${v.usage.cost ? `, $${v.usage.cost.toFixed(2)}` : ''}` : '';
const taskLine = v => `[${v.id}] «${v.route?.title || v.text.slice(0, 70)}» — ${v.pipeline ? `конвейер «${v.pipeline.label}», этап ${v.pipeline.idx + 1}/${v.pipeline.stages.length}, ` : ''}${v.agent?.name || 'диспетчер'}, ${v.statusText}${money(v)}${v.qa?.verdict ? `; контролёр: ${v.qa.verdict === 'ok' ? 'проверено' : v.qa.verdict === 'fix' ? 'вернул на доработку' : 'не проверил'}` : ''}${v.question ? `; вопрос: ${v.question.text}${v.question.options ? ` (варианты: ${v.question.options.map(o => o.label).join(', ')})` : ''}` : ''}${v.style ? `; стиль: ${v.style}` : ''}${v.result ? `; результат: ${v.result.summary || v.result.main} — ${SITE}${v.result.mainUrl}` : ''}${v.error ? `; ошибка: ${v.error}` : ''}`;
function runDeskTool(u, send, take) {
  const inp = u.input || {}, bad = () => ({ type:'tool_result', tool_use_id:u.id, is_error:true, content:JSON.stringify({ INVALID_JSON:JSON.stringify(inp) }) });
  if (u.name === 'run_claude_code') {
    if (typeof inp.task !== 'string' || !inp.task.trim()) return bad();
    const files = take();
    const { task } = desk.createTask({ text:inp.task, title:String(inp.title || ''), direct:true, uploads:files });
    send({ t:'task', id:task.id });
    const v = desk.view(task);
    return { type:'tool_result', tool_use_id:u.id, content:`Задача поставлена Claude Code: [${v.id}] «${v.route.title}», место в очереди ${v.queuePos || 1}${v.files.length ? `, файлы: ${v.files.join(', ')}` : ''}. Результат придёт на проверку к Илье (вкладка «В работе» в офисе и список задач у двойника).` };
  }
  if (u.name === 'desk_tasks') { const list = desk.list(15); return { type:'tool_result', tool_use_id:u.id, content:list.length ? list.map(taskLine).join('\n') : 'Задач пока нет.' }; }
  if (u.name === 'desk_task') {
    if (typeof inp.id !== 'string') return bad();
    const v = desk.get(inp.id.replace(/^\[|\]$/g, ''));
    if (!v) return { type:'tool_result', tool_use_id:u.id, is_error:true, content:'Нет такой задачи — возьми id из desk_tasks.' };
    return { type:'tool_result', tool_use_id:u.id, content:[taskLine(v), v.route?.brief ? 'ТЗ: ' + v.route.brief : '', 'Шаги:', ...v.steps.slice(-15).map(x => `- ${x.at.slice(11, 16)} ${x.text}`),
      v.result ? 'Файлы результата: ' + v.result.files.map(f => `${f.path} — ${SITE}${f.url}`).join('; ') : '', v.result?.note ? 'Последняя правка: ' + v.result.note : ''].filter(Boolean).join('\n') };
  }
  if (u.name === 'desk_action') {
    if (typeof inp.id !== 'string' || !['answer', 'revise', 'approve', 'retry', 'cancel'].includes(inp.action)) return bad();
    const r = desk.act(inp.id.replace(/^\[|\]$/g, ''), inp.action, inp.text, inp.rating);
    if (r.error) return { type:'tool_result', tool_use_id:u.id, is_error:true, content:r.error };
    send({ t:'task', id:r.task.id });
    return { type:'tool_result', tool_use_id:u.id, content:'Готово: ' + taskLine(r.task) };
  }
  return bad();
}
function errorText(e) {
  if (e instanceof Anthropic.RateLimitError) return 'Claude сейчас перегружен — повторите через минуту.';
  if (e instanceof Anthropic.AuthenticationError) return 'Ключ Claude не подходит — проверьте секрет HQ_OFFICE_ANTHROPIC_API_KEY.';
  if (e instanceof Anthropic.APIError) return `Claude ответил ошибкой${e.status ? ' ' + e.status : ''} — попробуйте ещё раз.`;
  return 'Не удалось получить ответ — попробуйте ещё раз.';
}

let voiceCache = { at:0, voice:null };
async function ownerVoice() {
  if (settings.voiceId) return { id:settings.voiceId, name:settings.voiceName || '' };
  if (process.env.ELEVENLABS_VOICE_ID) return { id:process.env.ELEVENLABS_VOICE_ID, name:'' };
  if (!voiceConfigured()) return null;
  if (Date.now() - voiceCache.at > 600e3) {
    try { voiceCache = { at:Date.now(), voice:await guessOwnerVoice() }; } catch (e) { console.error(e.message); voiceCache = { at:Date.now(), voice:null }; }
  }
  return voiceCache.voice;
}

/* ---------- long-term memory: the oldest turns are folded into notes ---------- */

let compacting = false;
async function compact() {
  if (compacting || !claude || owner.turns.length <= COMPACT_AT) return;
  compacting = true;
  const old = owner.turns.slice(0, owner.turns.length - HISTORY);
  try {
    const transcript = old.map(t => `${t.role === 'user' ? 'Илья' : 'Ассистент'}: ${t.text}`).join('\n');
    const msg = await claude.beta.messages.create({
      model:MODEL, max_tokens:16000, ...FALLBACK, output_config:{ effort:'low' }, system:MEMORY_PROMPT,
      messages:[{ role:'user', content:`Текущая память:\n${owner.memory || '(пусто)'}\n\nНовые реплики:\n${transcript}` }],
    });
    const notes = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (msg.stop_reason === 'end_turn' && notes) {
      owner.memory = notes;
      owner.turns = owner.turns.slice(old.length);
      save('owner.json', owner);
    }
  } catch (e) { console.error('memory:', e.message); }
  compacting = false;
}

/* ---------- chat ---------- */

async function chat(req, res, isOwnerTalk) {
  const b = await jsonBody(req, isOwnerTalk ? 30e6 : 16e3);
  const text = String(b.text || '').trim().slice(0, isOwnerTalk ? 4000 : 600);
  const voice = isOwnerTalk && b.voice === true;
  const twin = isOwnerTalk && b.twin === true;
  const frame = twin && typeof b.image === 'string' ? /^data:image\/jpeg;base64,([A-Za-z0-9+/=]{100,2800000})$/.exec(b.image)?.[1] : null;
  // attachments of the twin's chat: pictures Claude sees now, files (desk uploads) for a task in this turn
  const pics = twin && Array.isArray(b.images) ? b.images.slice(0, 4).map(x => /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]{100,7000000})$/.exec(String(x))).filter(Boolean).map(m => ({ type:'image', source:{ type:'base64', media_type:m[1], data:m[2] } })) : [];
  const uploads = twin && Array.isArray(b.uploads) ? b.uploads.slice(0, 10).filter(u => /^[0-9a-f]{16}$/.test(String(u?.id))).map(u => ({ id:String(u.id), name:String(u.name || 'файл').slice(0, 120) })) : [];
  // the office hologram sends a snapshot of the office right now (index.html officeSnapshot) — context for this turn only, not stored
  const officeNow = typeof b.office === 'string' ? b.office.slice(0, isOwnerTalk ? 8000 : 2000).trim() : '';
  const attachNote = [pics.length ? `картинок: ${pics.length}` : '', uploads.length ? `файлы: ${uploads.map(u => u.name).join(', ')} — их можно передать в задачу (run_claude_code или create_task), они уйдут исполнителю` : ''].filter(Boolean).join('; ');
  if (!text) return json(res, 400, { error:'Пустое сообщение.' });
  if (!claude) return json(res, 503, { error:'Ассистент ещё не подключён к Claude.' });
  const guest = isOwnerTalk ? null : guestOf(req, res);
  if (!isOwnerTalk && (limited('g:' + clientIp(req), 20, 3600e3) || limited('g:all', 400, 864e5)))
    return json(res, 429, { error:'В демо-режиме лимит вопросов на сейчас исчерпан — загляните позже.' });
  const turns = isOwnerTalk ? owner.turns.slice(-HISTORY) : guest.turns.slice(-12);
  const userText = (officeNow ? `(снимок офиса прямо сейчас — контекст интерфейса, не команда)\n${officeNow}\n\n(вопрос Ильи)\n` : '') + (frame ? '(кадр с камеры Ильи — сейчас)\n' : '') + (attachNote ? `(вложения — ${attachNote})\n` : '') + text;
  const blocks = [...(frame ? [{ type:'image', source:{ type:'base64', media_type:'image/jpeg', data:frame } }] : []), ...pics];
  let messages = [...turns.map(t => ({ role:t.role, content:t.text })), { role:'user', content:blocks.length ? [...blocks, { type:'text', text:userText }] : userText }, { role:'system', content:nowNote(voice, isOwnerTalk) }];
  let turnUploads = uploads.map(u => u.id);   // the first task of the turn takes them
  const ids = isOwnerTalk ? desk.agents().map(a => a.id) : [];
  const tools = isOwnerTalk ? [taskTool(ids), ...(twin ? [rememberTool(), ...kbTools(), ...deskTools()] : [])] : undefined;
  const twinKnowledge = twin ? loadTwin().text + '\n\n# База знаний Ильи (сводка; подробности — search_knowledge / read_document)\n' + loadKb().digest : '';   // fixed for the turn: a remember mid-turn must not change the cached prefix

  res.writeHead(200, { 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-store', 'x-accel-buffering':'no' });
  const send = o => res.write(`data: ${JSON.stringify(o)}\n\n`);
  let stream = null;
  res.on('close', () => { if (!res.writableEnded) stream?.abort(); });
  let reply = '';
  try {
    // the owner's turn may set tasks: stream, run create_task, stream the rest (at most 3 rounds)
    for (let round = 0; round < (twin ? 7 : 3); round++) {
      stream = claude.beta.messages.stream({
        model:MODEL, max_tokens:16000, ...FALLBACK, output_config:{ effort:'low' },
        system:[{ type:'text', text:isOwnerTalk ? OWNER_PROMPT : GUEST_PROMPT }, ...(twin ? [{ type:'text', text:TWIN_PROMPT }] : []), ...knowledge(isOwnerTalk), ...(twin ? [{ type:'text', text:twinKnowledge, cache_control:{ type:'ephemeral' } }] : [])], messages, ...(tools ? { tools } : {}),
      });
      for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { reply += ev.delta.text; send({ t:'delta', text:ev.delta.text }); }
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') { reply = ''; send({ t:'error', message:'На этот вопрос я не отвечу.' }); break; }
      if (msg.stop_reason === 'max_tokens') { reply += '…'; break; }
      const uses = msg.content.filter(b => b.type === 'tool_use');
      if (msg.stop_reason !== 'tool_use' || !uses.length) break;
      const results = [];
      for (const u of uses) {
        if (twin && (u.name === 'search_knowledge' || u.name === 'read_document')) send({ t:'kb', name:u.name, query:String(u.input?.query || u.input?.path || '').slice(0, 120) });
        const take = () => { const x = turnUploads; turnUploads = []; return x; };
        results.push(u.name === 'create_task' ? await runTaskTool(u, ids, send, twin ? take() : [], twin ? 'twin' : 'assistant')
          : u.name === 'remember' && twin ? runRemember(u, send)
          : twin && (u.name === 'search_knowledge' || u.name === 'read_document') ? runKbTool(u)
          : twin && DESK_TOOLS.has(u.name) ? runDeskTool(u, send, take)
          : { type:'tool_result', tool_use_id:u.id, is_error:true, content:'Нет такого инструмента.' });
      }
      messages = [...messages, { role:'assistant', content:msg.content }, { role:'user', content:results }];
      if (reply && !/\s$/.test(reply)) { reply += '\n\n'; send({ t:'delta', text:'\n\n' }); }
    }
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError) return;
    console.error('chat:', e.message);
    reply = ''; send({ t:'error', message:errorText(e) });
  }
  if (reply.trim()) {
    const at = new Date().toISOString(), list = isOwnerTalk ? owner.turns : guest.turns;
    list.push({ role:'user', text:attachNote ? `${text}\n[вложения — ${attachNote}]` : text, at, voice }, { role:'assistant', text:reply.trim(), at, voice });
    if (isOwnerTalk) { save('owner.json', owner); compact(); }
    else { guest.at = Date.now(); if (guest.turns.length > 24) guest.turns.splice(0, guest.turns.length - 24); }
  }
  send({ t:'done' }); res.end();
}

/* ---------- routes ---------- */

const ROUTES = {
  'GET health': (req, res) => json(res, 200, { ok:true }),
  'GET state': async (req, res, o) => {
    const v = o ? await ownerVoice() : null;
    json(res, 200, {
      owner:o, configured:{ chat:Boolean(claude), voice:voiceConfigured(), login:Boolean(PASSWORD) },
      voice:v ? { id:v.id, name:v.name } : null, memory:o ? Boolean(owner.memory) : false,
      twin:o ? { ...(({ sources, empty, profile }) => ({ sources, empty, profile }))(loadTwin()), kb:(({ counts, builtAt }) => ({ ...counts, builtAt }))(loadKb()) } : null,
      history:(o ? owner.turns : guestOf(req, res).turns).slice(-30).map(t => ({ role:t.role, text:t.text, at:t.at })),
    });
  },
  'POST login': async (req, res) => {
    if (!PASSWORD) return json(res, 503, { error:'Пароль владельца ещё не задан (секрет HQ_ASSISTANT_PASSWORD).' });
    if (limited('login:' + clientIp(req), 8, 900e3)) return json(res, 429, { error:'Слишком много попыток — подождите 15 минут.' });
    const { password } = await jsonBody(req);
    // wrong passwords from all addresses together: brute force through many IPs stalls too
    if (!same(sha(password || ''), sha(PASSWORD))) return json(res, limited('login:fail', 60, 3600e3) ? 429 : 401, { error:'Неверный пароль.' });
    const v = `owner.${Date.now() + 90 * 864e5}`;
    json(res, 200, { ok:true }, { 'set-cookie':cookie('hqa', `${v}.${sign(v)}`, 90 * 86400) });
  },
  'POST logout': (req, res) => json(res, 200, { ok:true }, { 'set-cookie':cookie('hqa', '', 0) }),
  'POST chat': (req, res, o) => chat(req, res, o),
  // live numbers of the Meta ad account (agent «Цифры Meta», department of Nurken) — owner only, read-only, cached 5 min
  'GET meta/live': async (req, res, o) => {
    if (!o) return json(res, 403, { error:'Цифры рекламного кабинета видит только владелец — войдите.' });
    json(res, 200, await metaLive(new URL(req.url, 'http://x').searchParams.get('fresh') === '1'));
  },
  // the twin's knowledge base: Ilia's own materials (files, the claude.ai export) — owner only
  'GET twin/kb': (req, res, o) => o ? json(res, 200, { ...loadKb().counts, builtAt:loadKb().builtAt, mine:listPrivate() }) : json(res, 403, { error:'Только для владельца.' }),
  'POST twin/kb': async (req, res, o) => {
    if (!o) return json(res, 403, { error:'Только для владельца.' });
    const name = path.basename(String(new URL(req.url, 'http://x').searchParams.get('name') || 'file.txt')).slice(0, 120);
    const buf = await body(req, 80e6);
    try { const saved = ingest(name, buf); json(res, 200, { ok:true, saved:saved.length, titles:saved.slice(0, 20).map(s => s.title) }); }
    catch (e) { json(res, 400, { error:e.message }); }
  },
  'POST twin/kb/delete': async (req, res, o) => {
    if (!o) return json(res, 403, { error:'Только для владельца.' });
    const { id } = await jsonBody(req);
    json(res, removePrivate(String(id || '')) ? 200 : 404, { ok:true });
  },
  // phones: streaming recognition straight from the browser to ElevenLabs with a single-use token (15 min)
  'POST stt-token': async (req, res, o) => {
    if (!o) return json(res, 403, { error:'Голос доступен только владельцу.' });
    if (!voiceConfigured()) return json(res, 503, { error:'Голос не подключён (ключ ElevenLabs).' });
    try { json(res, 200, { token:await realtimeToken() }); } catch (e) { console.error('stt-token:', e.message); json(res, 502, { error:'Не удалось получить токен распознавания.' }); }
  },
  'POST stt': async (req, res, o) => {
    if (!o) return json(res, 403, { error:'Голос доступен только владельцу.' });
    if (!voiceConfigured()) return json(res, 503, { error:'Голос не подключён (ключ ElevenLabs).' });
    const audio = await body(req, 10e6);
    if (audio.length < 1000) return json(res, 400, { error:'Запись слишком короткая.' });
    try { json(res, 200, { text:await transcribe(audio, String(req.headers['content-type'] || '')) }); }
    catch (e) { console.error('stt:', e.message); json(res, 502, { error:'Не удалось распознать речь — попробуйте ещё раз.' }); }
  },
  'POST tts': async (req, res, o) => {
    if (!o) return json(res, 403, { error:'Голос доступен только владельцу.' });
    const text = String((await jsonBody(req)).text || '').trim().slice(0, 800);
    const v = await ownerVoice();
    if (!text) return json(res, 400, { error:'Пустой текст.' });
    if (!v) return json(res, 409, { error:'Голос не выбран.' });
    let r;
    try { r = await speak(v.id, text); } catch (e) { console.error('tts:', e.message); return json(res, 502, { error:'Не удалось озвучить ответ.' }); }
    res.writeHead(200, { 'content-type':'audio/mpeg', 'cache-control':'no-store' });
    Readable.fromWeb(r.body).on('error', () => res.end()).pipe(res);
  },
  'GET voices': async (req, res, o) => {
    if (!o) return json(res, 403, { error:'Только для владельца.' });
    json(res, 200, { voices:await listVoices(), current:(await ownerVoice())?.id || null });
  },
  'POST voice': async (req, res, o) => {
    if (!o) return json(res, 403, { error:'Только для владельца.' });
    const { id } = await jsonBody(req), v = (await listVoices()).find(x => x.id === id);
    if (!v) return json(res, 400, { error:'Такого голоса нет в аккаунте ElevenLabs.' });
    Object.assign(settings, { voiceId:v.id, voiceName:v.name }); save('settings.json', settings);
    json(res, 200, { ok:true, voice:v });
  },
};

// local runs (SERVE_STATIC=1): the office itself on the same origin as the API
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.json':'application/json', '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.webp':'image/webp', '.mp4':'video/mp4', '.glb':'model/gltf-binary' };
function serveStatic(req, res, p) {
  const rel = path.normalize(decodeURIComponent(p.endsWith('/') ? p + 'index.html' : p)).replace(/^([/\\])+/, '');
  const file = path.join(OFFICE_DIR, rel);
  if (!file.startsWith(OFFICE_DIR) || /^(assistant|sync|deploy|runner)([/\\]|$)/.test(rel) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, { error:'not found' });
  res.writeHead(200, { 'content-type':MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (!p.startsWith(PREFIX + '/')) return process.env.SERVE_STATIC === '1' ? serveStatic(req, res, p) : json(res, 404, { error:'not found' });
  const rest = p.slice(PREFIX.length + 1);
  const route = rest.startsWith('desk/') ? (rq, rs, o) => desk.handle(rq, rs, rest.slice(5), o) : ROUTES[`${req.method} ${rest}`];
  if (!route) return json(res, 404, { error:'not found' });
  try { await route(req, res, isOwner(req)); }
  catch (e) {
    console.error(p, e.message);
    if (!res.headersSent) json(res, e.code === 413 ? 413 : 502, { error:e.code === 413 ? 'Слишком большой запрос.' : 'Ошибка сервиса — попробуйте ещё раз.' });
    else res.end();
  }
}).listen(PORT, () => console.log(`hq assistant :${PORT} · office ${OFFICE_DIR} · claude ${claude ? 'on' : 'off'} · voice ${voiceConfigured() ? 'on' : 'off'} · owner login ${PASSWORD ? 'on' : 'off'} · desk runner ${process.env.HQ_DESK_RUNNER_TOKEN ? 'on' : 'off'} · meta ads ${metaConfigured() ? 'on' : 'off'}`));
// warm the cache of the Meta numbers, so the assistant and the desk see them from the first question
if (metaConfigured()) metaLive().catch(() => {});
