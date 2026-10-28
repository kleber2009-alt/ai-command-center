#!/usr/bin/env node
/* Keeps the task history of hq2.aicex.club fresh. Writes only ../tasks.auto.js.

     node sync.mjs prs              merged PRs since the last run → task cards
     node sync.mjs add --url <link> [--title …] [--dept …] [--summary …] [--date ГГГГ-ММ-ДД]
                                    one link (Claude artifact, PR, site) → one task
     --dry                          print the result, write nothing

   Run daily and after every merge by .github/workflows/hq-office-history.yml.
   PRs from one branch of one product merged within GROUP_DAYS become one task.
   PRs already referenced in tasks.js (the hand-made history) are skipped, and every
   processed PR goes to `seen`, so a task deleted from tasks.auto.js never comes back.

   Env: GITHUB_TOKEN (public repo works without it, rate-limited), GITHUB_REPOSITORY,
   ANTHROPIC_API_KEY — optional: Claude writes Russian titles and summaries from the PRs;
   without it (or if the call fails) the PR title and the first paragraph of its body are used,
   and the task keeps a `draft` hash so a later run with a key rewrites it.
   Inputs of `add` may also come from env: LINK, TITLE, DEPT, SUMMARY, DATE. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTO_FILE = path.join(APP, 'tasks.auto.js');
const REPO = process.env.GITHUB_REPOSITORY || 'kleber2009-alt/ai-command-center';
const GH = `https://github.com/${REPO}`;
const API = `https://api.github.com/repos/${REPO}`;
const TOKEN = process.env.GITHUB_TOKEN || '';
const MODEL = 'claude-opus-5-5';
const GROUP_DAYS = 3;
const MERGED = 'слияние PR на GitHub';
const FIRST_SINCE = '2026-10-28T03:10:11Z'; // last PR of the hand-made history (#147)

// GitHub login → person id (office.config.js heads, or 'ilia')
const PEOPLE = { 'kleber2009-alt': 'ilia' };

// Product by code path apps/<key> (also infra/services/<key>, landings/*, deploy-<key>.yml)
const PRODUCTS = {
  'hq-office':          { name:'Живой офис агентов', dept:'ceo', agents:['product', 'specs'], site:'https://hq2.aicex.club' },
  'funnel-analytics':   { name:'Сквозная аналитика', dept:'traffic', agents:['analytics', 'adreports', 'product'], site:'https://dashboard.aicex.club' },
  'persona-studio':     { name:'Persona Studio', dept:'ceo', agents:['product', 'avatar'] },
  'persona-train':      { name:'Persona Train', dept:'ceo', agents:['product', 'avatar'], site:'https://persona-train.aicex.club' },
  'threads-growth':     { name:'Threads Growth', dept:'marketing', agents:['product', 'audience', 'publish'] },
  'tg-viral-parser':    { name:'Парсер Telegram', dept:'marketing', agents:['audience', 'publish', 'scripts'] },
  'ai-content-factory': { name:'AI Content Factory', dept:'marketing', agents:['carousel', 'scripts', 'publish'] },
  'ig-content':         { name:'IG Serial Content', dept:'marketing', agents:['publish', 'scripts', 'analytics'] },
  'voice-circle-bot':   { name:'Бот видеокружков', dept:'marketing', agents:['product', 'montage'] },
  'landings':           { name:'Лендинги', dept:'marketing', agents:['landings'] },
  'tg-agent':           { name:'tg-agent', dept:'sales', agents:['chats', 'comments'] },
  'ig-agent':           { name:'ИИ-менеджер Instagram', dept:'sales', agents:['chats', 'comments', 'closer'] },
  'ai-sales':           { name:'AI Sales System', dept:'sales', agents:['closer', 'chats', 'consult'] },
  'transcribe':         { name:'Транскрибация', dept:'ceo', agents:['product'], site:'https://transcribe.aicex.club' },
  'ai-hub':             { name:'AI Creative Hub', dept:'ceo', agents:['product'], site:'https://aihub.aicex.club' },
  'ai-office':          { name:'AI Growth Office', dept:'ceo', agents:['product', 'landings'], site:'https://office.aicex.club' },
  'command-center':     { name:'Command Center', dept:'ceo', agents:['product'] },
  'infra-worker':       { name:'Office Worker', dept:'ceo', agents:['product', 'briefing'] },
  'ytdlp':              { name:'Сервис загрузки видео', dept:'ceo', agents:['product'] },
};
const ALIAS = { aisales:'ai-sales', 'persona-landing':'landings', 'persona':'persona-studio', 'landings':'landings' };
const productInfo = key => PRODUCTS[key] || { name:key === 'repo' ? 'Монорепозиторий' : key, dept:'ceo', agents:['product'], open:true };

const KINDS = ['Разработка', 'Продукт', 'Аналитика', 'Сайт', 'Дизайн', 'Документ', 'Видео', 'Контент', 'Воронка', 'Исследование', 'Стратегия', 'Презентация'];
const NOISE = /^(?:chore|ci|build|deps?|bump|revert)\b|\bbump\b|^actions\/|@v\d+\b|\btypo\b|опечатк/i;
const LABEL_SKIP = /^(hq:skip|не в историю)$/i;
const historyOnly = f => /^apps\/hq-office\/tasks(\.auto)?\.js$/.test(f) || f.startsWith('.claude/skills/hq-history/');

/* ───────── office data (same files the site loads) ───────── */
function loadOffice() {
  const window = {};
  for (const f of ['office.config.js', 'dept-content.js', 'agent-content.js', 'tasks.js'])
    vm.runInNewContext(fs.readFileSync(path.join(APP, f), 'utf8'), { window }, { filename:f });
  const depts = window.OFFICE_CONFIG.depts;
  const agents = window.AGENT_CATALOG;
  const tasksSrc = fs.readFileSync(path.join(APP, 'tasks.js'), 'utf8');
  const referenced = new Set();
  for (const m of tasksSrc.matchAll(/\bpr\(([\d,\s]+)\)/g)) for (const n of m[1].split(',')) if (n.trim()) referenced.add(+n);
  for (const m of tasksSrc.matchAll(/\/pull\/(\d+)/g)) referenced.add(+m[1]);
  return { depts, agents, manual:window.OFFICE_TASKS, referenced, tasksSrc };
}

function loadAuto() {
  if (!fs.existsSync(AUTO_FILE)) return { since:FIRST_SINCE, seen:[], tasks:[] };
  const window = {};
  vm.runInNewContext(fs.readFileSync(AUTO_FILE, 'utf8'), { window }, { filename:'tasks.auto.js' });
  const d = window.OFFICE_TASKS_AUTO || {};
  return { since:d.since || FIRST_SINCE, seen:d.seen || [], tasks:d.tasks || [] };
}

function saveAuto(data) {
  const head = `/* История задач, которая пополняется сама (sync/sync.mjs, workflow hq-office-history):
   новые PR на GitHub — после каждого слияния и раз в сутки — и ссылки из формы «Run workflow».
   Сайт показывает эти задачи вместе с tasks.js. Править можно прямо здесь: синк не трогает
   готовые задачи, только дописывает к ним новые PR той же ветки. Удалённая задача не вернётся —
   её PR остаются в seen. Чтобы задача стала «ручной», перенесите её в tasks.js. */\n`;
  data.seen = [...new Set(data.seen)].sort((a, b) => a - b);
  data.tasks.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  fs.writeFileSync(AUTO_FILE, head + 'window.OFFICE_TASKS_AUTO = ' + toJS(data) + ';\n');
}

// JSON, but short lists and proof links stay on one line — easier to read and edit by hand
function toJS(v, ind = '') {
  const flat = x => x === null || typeof x !== 'object';
  if (Array.isArray(v)) return v.every(flat) ? `[${v.map(x => JSON.stringify(x)).join(', ')}]`
    : `[\n${v.map(x => ind + '  ' + toJS(x, ind + '  ')).join(',\n')}\n${ind}]`;
  if (v && typeof v === 'object') {
    const ents = Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${toJS(x, ind + '  ')}`);
    return Object.values(v).every(flat) && ents.join(', ').length < 170 ? `{ ${ents.join(', ')} }`
      : `{\n${ents.map(e => ind + '  ' + e).join(',\n')}\n${ind}}`;
  }
  return JSON.stringify(v);
}

/* ───────── GitHub ───────── */
async function gh(p) {
  const r = await fetch(API + p, { headers:{
    accept:'application/vnd.github+json', 'x-github-api-version':'2022-11-28', 'user-agent':'hq-office-sync',
    ...(TOKEN && { authorization:`Bearer ${TOKEN}` }) } });
  if (!r.ok) throw new Error(`GitHub ${r.status} ${p}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function mergedSince(since) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const list = await gh(`/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100&page=${page}`);
    for (const p of list) if (p.merged_at && p.merged_at > since) out.push(p);
    if (list.length < 100 || list.at(-1).updated_at < since) break;
  }
  return out.sort((a, b) => a.merged_at.localeCompare(b.merged_at));
}

async function prFiles(n) {
  const files = [];
  for (let page = 1; page <= 3; page++) {
    const list = await gh(`/pulls/${n}/files?per_page=100&page=${page}`);
    files.push(...list.map(f => f.filename));
    if (list.length < 100) break;
  }
  return files;
}

function keyOfPath(f) {
  let m;
  if ((m = f.match(/^(?:apps|infra\/services)\/([^/]+)\//))) return [ALIAS[m[1]] || m[1], 1];
  if (f.startsWith('landings/')) return ['landings', 1];
  if ((m = f.match(/^\.github\/workflows\/(?:deploy|update|test)-([\w-]+)\.ya?ml$/))) return [ALIAS[m[1]] || m[1], 0.5];
  return null;
}

// Product: the title scope (`feat(persona-studio): …`, `funnel-analytics: …`) if it names
// a known product, else the app with the most changed files.
function productOf(title, files) {
  const m = title.match(/^\s*\w+\(([\w./-]+)\)\s*:/) || title.match(/^\s*([\w./-]+)\s*:/);
  const scope = m && m[1].split('/')[0];
  if (scope && PRODUCTS[ALIAS[scope] || scope]) return ALIAS[scope] || scope;
  const score = {};
  for (const f of files) { const k = keyOfPath(f); if (k) score[k[0]] = (score[k[0]] || 0) + k[1]; }
  return Object.entries(score).sort((a, b) => b[1] - a[1])[0]?.[0] || 'repo';
}

/* ───────── text helpers ───────── */
const clip = (s, n) => (s = String(s || '').replace(/\s+/g, ' ').trim()).length > n ? s.slice(0, n - 1).replace(/[\s,.;:—-]+\S*$/, '') + '…' : s;
const day = iso => iso.slice(0, 10);
const daysApart = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const stripScope = t => t.replace(/^\s*(?:\w+\([^)]*\)|[\w./-]+)\s*:\s*/, '').trim();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// Texts written without Claude are a draft: `draft` holds their hash. Once a key is there,
// the next run rewrites drafts nobody has edited by hand (the hash still matches).
const textHash = t => crypto.createHash('sha1').update(`${t.title}\n${t.summary}`).digest('hex').slice(0, 10);
const prProof = p => ({ kind:'github', label:clip(`PR #${p.number} · ${stripScope(p.title)}`, 90), url:`${GH}/pull/${p.number}` });

function firstParagraph(md) {
  return String(md || '').replace(/\r/g, '').replace(/```[\s\S]*?```/g, '').replace(/<!--[\s\S]*?-->/g, '')
    .split(/\n\s*\n/)
    .map(b => b.split('\n').filter(l => !/^\s*(#|>|\||- \[|---|🤖|https?:\/\/)/.test(l)).map(l => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, '')).join(' '))
    .map(s => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim())
    .find(s => s.length > 30) || '';
}

function plainCard(group) {
  const text = cap(stripScope(group.prs[0].title)), name = group.product.name;
  return {
    title:clip(text.toLowerCase().startsWith(name.toLowerCase()) ? text : `${name}: ${text}`, 110),
    summary:clip(group.prs.map(p => firstParagraph(p.body)).find(Boolean) || '', 280),
    kind:group.key.startsWith('landings|') ? 'Сайт' : 'Разработка',
    agents:group.product.agents, dept:group.product.dept, worth:!group.prs.every(p => NOISE.test(stripScope(p.title))),
  };
}

/* ───────── Claude: Russian titles and summaries ───────── */
function cardsSchema(office) {
  return { type:'object', additionalProperties:false, required:['cards'], properties:{ cards:{ type:'array', items:{
    type:'object', additionalProperties:false, required:['key', 'title', 'summary', 'kind', 'dept', 'agents', 'worth'],
    properties:{
      key:{ type:'string' }, title:{ type:'string' }, summary:{ type:'string' },
      kind:{ type:'string', enum:KINDS },
      dept:{ type:'string', enum:office.depts.map(d => d.id) },
      agents:{ type:'array', items:{ type:'string', enum:Object.keys(office.agents) } },
      worth:{ type:'boolean' },
    } } } } };
}

function systemPrompt(office) {
  const team = office.depts.map(d => `${d.id} — ${d.name}: ` + d.agents.map(id => `${id} (${office.agents[id]?.name}: ${office.agents[id]?.role})`).join(', ')).join('\n');
  const examples = office.manual.filter(t => t.dateNote === MERGED).slice(0, 5).map(t => `— ${t.title}\n  ${t.summary}`).join('\n');
  return `Ты ведёшь историю задач компании AICEX для живого офиса агентов hq2.aicex.club. Эту историю показывают на вебинарах как доказательство: «это мы действительно сделали — я, команда и агенты». Каждая задача подтверждается PR на GitHub.

По данным PR (заголовки, описания, изменённые файлы) напиши для каждой группы карточку задачи на русском:
- title — до 90 знаков: название продукта, двоеточие и что появилось или стало лучше, понятным владельцу бизнеса языком. Без слов fix/refactor/PR, имён файлов и веток.
- summary — одно-два предложения, до 260 знаков: что это даёт пользователю или бизнесу. Только то, что следует из PR: не придумывай функций и цифр, которых там нет.
- kind — тип работы из списка.
- dept — отдел, к которому относится работа (для известных продуктов он уже задан во входных данных — повтори его).
- agents — один–три id агентов, которые по смыслу делают такую работу (в основном из отдела задачи; для кода — product).
- worth — false, если группа — чистое обслуживание без видимого результата (обновление зависимостей, правка CI, опечатка); такую карточку не показываем.
- key — верни ключ группы без изменений.

Отделы и агенты:
${team}

Так выглядят готовые карточки из истории:
${examples}`;
}

async function describeGroups(groups, office) {
  const out = new Map();
  if (!groups.length) return out;
  if (!process.env.ANTHROPIC_API_KEY) { note('Тексты: из описаний PR — нет ключа ANTHROPIC_API_KEY'); return out; }
  const client = new Anthropic();
  const system = systemPrompt(office), schema = cardsSchema(office);
  for (let i = 0; i < groups.length; i += 8) {
    const chunk = groups.slice(i, i + 8).map(g => ({
      key:g.key, product:g.product.name, dept:g.product.dept,
      prs:g.prs.map(p => ({ number:p.number, title:p.title, body:clip(p.body, 1500), files:p.files.slice(0, 40) })),
    }));
    try {
      const res = await client.beta.messages.create({
        model:MODEL, max_tokens:16000,
        betas:['server-side-fallback-2026-07-01'], fallbacks:'default',
        output_config:{ effort:'low', format:{ type:'json_schema', schema } },
        system, messages:[{ role:'user', content:JSON.stringify({ groups:chunk }, null, 1) }],
      });
      if (res.stop_reason !== 'end_turn') throw new Error(`stop_reason ${res.stop_reason}`);
      const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
      for (const c of JSON.parse(text).cards || []) out.set(c.key, c);
      note(`Тексты: Claude (${res.model})`);
    } catch (err) {
      const why = err instanceof Anthropic.APIError && err.status ? `${err.status} ${err.message}` : err.message;
      note(`Тексты: из описаний PR — Claude недоступен (${why})`);
    }
  }
  return out;
}

// The department follows the product map; Claude picks it only for an unknown product.
function applyCard(task, card, office, pickDept) {
  const valid = new Set(Object.keys(office.agents));
  if (card.title) task.title = clip(card.title, 110);
  if (card.summary) task.summary = clip(card.summary, 300);
  if (KINDS.includes(card.kind)) task.kind = card.kind;
  if (pickDept && office.depts.some(d => d.id === card.dept)) task.dept = card.dept;
  const agents = (card.agents || []).filter(a => valid.has(a));
  if (agents.length) task.agents = [...new Set(agents)].slice(0, 4);
}

/* ───────── mode: prs ───────── */
async function syncPRs({ dry }) {
  const office = loadOffice(), data = loadAuto();
  const seen = new Set(data.seen);
  const prs = (await mergedSince(data.since)).filter(p => !seen.has(p.number));
  const fresh = [];
  for (const p of prs) {
    seen.add(p.number);
    const why = office.referenced.has(p.number) ? 'уже в tasks.js'
      : p.user?.type === 'Bot' || /\[bot\]$/.test(p.user?.login || '') ? 'бот'
      : (p.labels || []).some(l => LABEL_SKIP.test(l.name)) ? 'метка «не в историю»' : '';
    if (why) { console.log(`· #${p.number} пропущен: ${why}`); continue; }
    p.files = await prFiles(p.number);
    if (p.files.length && p.files.every(historyOnly)) { console.log(`· #${p.number} пропущен: правка самой истории`); continue; }
    p.product = productOf(p.title, p.files);
    fresh.push(p);
  }

  const groups = [], updated = new Set();
  for (const p of fresh) {
    const key = `${p.product}|${p.head?.ref || p.number}`, date = day(p.merged_at);
    const task = data.tasks.find(t => t.group === key && daysApart(t.date, date) <= GROUP_DAYS);
    if (task) { // later PR of an existing task: add the proof, keep the hand-edited texts
      const at = task.proof.findIndex(x => x.kind !== 'github');
      task.proof.splice(at < 0 ? task.proof.length : at, 0, prProof(p));
      task.prs = [...(task.prs || []), p.number];
      if (date > task.date) task.date = date;
      updated.add(task.id);
      continue;
    }
    const g = groups.find(g => g.key === key && daysApart(g.date, date) <= GROUP_DAYS);
    if (g) { g.prs.push(p); g.date = date; } else groups.push({ key, date, product:productInfo(p.product), prs:[p] });
  }

  // Drafts to rewrite with Claude: re-read their PRs (a hand-edited draft is left as is)
  const retext = [];
  let dirty = false;
  for (const t of process.env.ANTHROPIC_API_KEY ? data.tasks.filter(t => t.draft).slice(0, 16) : []) {
    if (textHash(t) !== t.draft || !(t.prs || []).length) { delete t.draft; dirty = true; continue; }
    const tprs = [];
    for (const n of t.prs) { const p = await gh(`/pulls/${n}`); p.files = await prFiles(n); tprs.push(p); }
    retext.push({ key:`retext:${t.id}`, date:t.date, product:productInfo((t.group || 'repo').split('|')[0]), prs:tprs, task:t });
  }

  const cards = await describeGroups([...groups, ...retext], office);
  const rewritten = [];
  for (const r of retext) {
    const card = cards.get(r.key);
    if (!card) continue;
    applyCard(r.task, card, office, r.product.open);
    delete r.task.draft; rewritten.push(r.task);
  }
  const added = [];
  for (const g of groups) {
    const plain = plainCard(g), card = { ...plain, ...(cards.get(g.key) || {}) };
    if (!plain.worth || !card.worth) { console.log(`· ${g.key}: обслуживание, не в историю (#${g.prs.map(p => p.number).join(', #')})`); continue; }
    const people = [...new Set(g.prs.map(p => PEOPLE[p.user?.login]).filter(Boolean))];
    const task = {
      id:`gh-${g.prs[0].number}`, date:g.date, dateNote:MERGED, kind:'Разработка', dept:g.product.dept,
      people:people.length ? people : ['ilia'], agents:g.product.agents, title:'', summary:'',
      proof:[...g.prs.map(prProof), ...(g.product.site ? [{ kind:'site', label:`${g.product.name} — живой сайт`, url:g.product.site }] : [])],
      group:g.key, prs:g.prs.map(p => p.number), auto:true,
    };
    applyCard(task, card, office, g.product.open);
    if (!cards.has(g.key)) task.draft = textHash(task);
    data.tasks.push(task); added.push(task);
  }

  const changed = prs.length > 0 || rewritten.length > 0 || dirty;
  if (prs.length) {
    data.seen = [...seen];
    data.since = prs.reduce((m, p) => p.merged_at > m ? p.merged_at : m, data.since);
  }
  const waiting = data.tasks.filter(t => t.draft).length;
  if (waiting && !process.env.ANTHROPIC_API_KEY) note(`Ждут ключа Claude: ${waiting} задач с текстами из описаний PR — перепишутся сами, когда появится ключ`);
  report(added, data.tasks.filter(t => updated.has(t.id)), prs.length, rewritten);
  if (changed && !dry) saveAuto(data);
  if (dry) console.log(JSON.stringify(added, null, 2));
}

/* ───────── mode: add ───────── */
async function pageMeta(url) {
  try {
    const r = await fetch(url, { headers:{ 'user-agent':'Mozilla/5.0 hq-office-sync' }, redirect:'follow', signal:AbortSignal.timeout(15000) });
    const html = (await r.text()).slice(0, 300000);
    const meta = name => html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)`, 'i'))?.[1];
    const title = meta('og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const decode = s => s && s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    return { title:decode(title), summary:decode(meta('og:description') || meta('description')) };
  } catch { return {}; }
}

async function addLink(opts, { dry }) {
  const office = loadOffice(), data = loadAuto();
  const url = (opts.url || '').trim();
  if (!/^https?:\/\//.test(url)) throw new Error('Нужна ссылка: https://…');
  const all = [...office.manual, ...data.tasks];
  const norm = u => u.replace(/^http:/, 'https:').replace(/[/#?]+$/, '');
  if (all.some(t => (t.proof || []).some(p => norm(p.url) === norm(url))))
    throw new Error(`Эта ссылка уже есть в истории: ${url}`);
  const date = opts.date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Дата в формате ГГГГ-ММ-ДД, а не «${date}»`);
  const dept = office.depts.some(d => d.id === opts.dept) ? opts.dept : '';
  let task;

  const prm = url.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
  if (prm) { // one PR, even an old one
    const n = +prm[1];
    if (office.referenced.has(n) || data.tasks.some(t => (t.prs || []).includes(n))) throw new Error(`PR #${n} уже в истории`);
    const p = await gh(`/pulls/${n}`);
    if (!p.merged_at) throw new Error(`PR #${n} ещё не слит`);
    p.files = await prFiles(n); p.product = productOf(p.title, p.files);
    const g = { key:`${p.product}|${p.head?.ref || n}`, date:day(p.merged_at), product:productInfo(p.product), prs:[p] };
    const llm = (await describeGroups([g], office)).get(g.key), card = { ...plainCard(g), ...(llm || {}) };
    task = { id:`gh-${n}`, date:opts.date || g.date, dateNote:MERGED, kind:'Разработка', dept:g.product.dept,
      people:[PEOPLE[p.user?.login] || 'ilia'], agents:g.product.agents, title:'', summary:'',
      proof:[prProof(p), ...(g.product.site ? [{ kind:'site', label:`${g.product.name} — живой сайт`, url:g.product.site }] : [])],
      group:g.key, prs:[n], auto:true };
    applyCard(task, card, office, g.product.open);
    if (!llm && !opts.title && !opts.summary) task.draft = textHash(task);
    data.seen.push(n);
  } else {
    const claude = /claude\.ai\/(?:code\/)?artifact\//.test(url);
    const meta = claude ? {} : await pageMeta(url);
    const title = (opts.title || meta.title || '').trim();
    if (!title) throw new Error(claude
      ? 'Артефакт Claude закрыт для чтения снаружи — укажите название задачи (поле title)'
      : 'Не удалось прочитать название страницы — укажите его (поле title)');
    const summary = clip(opts.summary || meta.summary || '', 300);
    task = { id:`link-${date}-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 6)}`, date,
      dateNote:claude ? 'артефакт в Claude, дата добавления в историю' : 'дата добавления в историю',
      kind:claude ? 'Документ' : 'Сайт', dept:dept || 'ceo', people:['ilia'], agents:[],
      title:clip(title, 110), summary, proof:[{ kind:claude ? 'claude' : 'site', label:clip(title, 90), url }], via:'link' };
    // Claude picks the agents (and the department, if not given); the texts stay as typed
    const g = { key:'link', date, product:{ name:'Ссылка', dept:task.dept, agents:[] }, prs:[{ number:0, title, body:summary, files:[] }] };
    const card = (await describeGroups([g], office)).get('link');
    if (card) applyCard(task, { kind:card.kind, dept:card.dept, agents:card.agents }, office, !dept);
  }
  if (opts.title) task.title = clip(opts.title, 110);
  if (opts.summary) task.summary = clip(opts.summary, 300);
  if (task.draft) task.draft = textHash(task);
  if (dept) task.dept = dept;
  if (all.some(t => t.id === task.id)) task.id += '-' + Date.now().toString(36);
  data.tasks.push(task);
  report([task], [], 0);
  if (dry) console.log(JSON.stringify(task, null, 2)); else saveAuto(data);
}

/* ───────── report ───────── */
function note(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n\n');
}

function report(added, updated, scanned, rewritten = []) {
  const lines = [`История hq2: ${added.length} новых задач, ${updated.length} дополнено, ${rewritten.length} переписано Claude (просмотрено PR: ${scanned})`];
  for (const t of added) lines.push(`- новая: **${t.title}** — ${t.date}, https://hq2.aicex.club/#task-${t.id}`);
  for (const t of updated) lines.push(`- дополнена: **${t.title}** — ${t.proof.filter(p => p.kind === 'github').map(p => p.label.split(' ·')[0]).join(', ')}`);
  for (const t of rewritten) lines.push(`- переписана: **${t.title}** — https://hq2.aicex.club/#task-${t.id}`);
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

const { values, positionals } = parseArgs({ allowPositionals:true, options:{
  url:{ type:'string' }, title:{ type:'string' }, dept:{ type:'string' }, summary:{ type:'string' }, date:{ type:'string' },
  dry:{ type:'boolean', default:false } } });
const env = k => (process.env[k] || '').trim() || undefined;
const mode = positionals[0] || 'prs';
try {
  if (mode === 'prs') await syncPRs(values);
  else if (mode === 'add') await addLink({ url:values.url ?? env('LINK'), title:values.title ?? env('TITLE'), dept:values.dept ?? env('DEPT'),
    summary:values.summary ?? env('SUMMARY'), date:values.date ?? env('DATE') }, values);
  else throw new Error(`Неизвестный режим «${mode}»: prs | add`);
} catch (err) {
  console.error(`✗ ${err.message}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `✗ ${err.message}\n`);
  process.exit(1);
}
