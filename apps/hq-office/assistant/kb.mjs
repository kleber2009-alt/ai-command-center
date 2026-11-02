/* The twin's knowledge base: everything about Ilia's businesses that exists as text.

   From the repository (built at deploy time into twin-kb/index.json, next to the server):
     - the project registry (apps/command-center/registry/projects.mjs) — every product, status, links;
     - every README / CLAUDE.md / ROADMAP / spec in the monorepo (apps/*, docs/, .claude/skills/*);
     - the visible text of every landing page (offers, prices, programs).
   Ilia's own materials (uploaded on the twin page, stored on the server in DATA_DIR/kb-private, never in git):
     - .md / .txt / .csv / .html files;
     - the claude.ai data export (conversations.json, projects.json) — each chat and project becomes a document.

   The twin always sees the digest (registry + architecture + list of documents) and searches the rest with
   the search_knowledge / read_document tools.

     node kb.mjs build <repo root>     write twin-kb/index.json (the deploy runs this) */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILT = path.join(HERE, 'twin-kb', 'index.json');
const SKIP_DIR = /^(node_modules|\.git|\.next|dist|build|__pycache__|\.venv|venv|test|tests|fixtures|media|works)$/;
const SKIP_FILE = /^(CHANGELOG|LICENSE|CODE_OF_CONDUCT)/i;

/* ---------- text helpers ---------- */
const htmlText = html => html
  .replace(/<(script|style|svg|noscript|template)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section|tr)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, '’').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n').trim();
const titleOf = (text, fallback) => (text.match(/^#\s+(.+)$/m)?.[1] || text.match(/<title>([^<]+)<\/title>/i)?.[1] || fallback).trim().slice(0, 140);

/* ---------- build from the repository ---------- */
function walk(dir, root, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes:true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.test(e.name) && !(e.name.startsWith('.') && e.name !== '.claude')) walk(p, root, out); continue; }
    if (SKIP_FILE.test(e.name)) continue;
    const rel = path.relative(root, p).replace(/\\/g, '/');
    if (/\.md$/i.test(e.name)) out.push({ rel, kind:'doc' });
    else if (/^landings\/.+\.html$/i.test(rel)) out.push({ rel, kind:'landing' });
  }
}
async function registry(root) {
  const f = path.join(root, 'apps/command-center/registry/projects.mjs');
  if (!fs.existsSync(f)) return [];
  try { return (await import(pathToFileURL(f).href)).projects || []; } catch (e) { console.error('registry:', e.message); return []; }
}
const projectText = p => [`## ${p.name} (${p.slug}) — ${p.status || ''}`, p.tagline || '', p.description || '',
  p.technologies?.length ? 'Технологии: ' + p.technologies.join(', ') : '',
  ...(p.links || []).map(l => `- ${l.label}: ${l.url}`)].filter(Boolean).join('\n');

export async function build(root, out = BUILT) {
  const files = []; walk(root, root, files);
  const docs = [];
  for (const { rel, kind } of files) {
    const raw = fs.readFileSync(path.join(root, rel), 'utf8');
    const text = kind === 'landing' ? htmlText(raw) : raw.trim();
    if (text.length < 200) continue;
    docs.push({ path:rel, title:(kind === 'landing' ? 'Лендинг: ' : '') + titleOf(kind === 'landing' ? raw : text, rel), kind, text:text.slice(0, 200000) });
  }
  const projects = await registry(root);
  if (projects.length) docs.unshift({ path:'apps/command-center/registry/projects.mjs', title:'Реестр всех проектов AICEX (projects.aicex.club)', kind:'registry', text:projects.map(projectText).join('\n\n') });
  // the digest the twin always sees: every project in brief + the architecture
  const brief = projects.map(p => `- ${p.name} [${p.status}] — ${p.tagline || ''}${p.description ? ' ' + p.description.replace(/\s+/g, ' ').slice(0, 420) : ''}${(p.links || []).filter(l => l.kind === 'live').slice(0, 2).map(l => ` ${l.url}`).join('')}`).join('\n');
  const arch = fs.existsSync(path.join(root, 'docs/ARCHITECTURE.md')) ? fs.readFileSync(path.join(root, 'docs/ARCHITECTURE.md'), 'utf8') : '';
  const digest = `## Все проекты и бизнесы Ильи (реестр, ${projects.length})\n${brief}\n\n## Архитектура AICEX\n${arch}`;
  fs.mkdirSync(path.dirname(out), { recursive:true });
  fs.writeFileSync(out, JSON.stringify({ builtAt:new Date().toISOString(), digest, docs }));
  return { docs:docs.length, chars:docs.reduce((n, d) => n + d.text.length, 0), digest:digest.length };
}

/* ---------- Ilia's own materials (server side) ---------- */
let PRIV = '', SKILLS = '';
export function initKb(dataDir) { PRIV = path.join(dataDir, 'kb-private'); SKILLS = path.join(dataDir, 'desk', 'skills.json'); fs.mkdirSync(PRIV, { recursive:true }); }
// skills installed on the runner's server (the desk saves what the runner reports)
function serverSkills() { try { return JSON.parse(fs.readFileSync(SKILLS, 'utf8')); } catch { return []; } }
const privFiles = () => PRIV && fs.existsSync(PRIV) ? fs.readdirSync(PRIV).filter(f => f.endsWith('.json')) : [];

// one uploaded file → documents (a claude.ai export becomes one document per chat / project)
export function ingest(name, buf) {
  const ext = path.extname(name).toLowerCase(), raw = buf.toString('utf8'), docs = [];
  if (ext === '.json') {
    let data; try { data = JSON.parse(raw); } catch { throw new Error('Файл не похож на JSON.'); }
    const list = Array.isArray(data) ? data : [data];
    for (const it of list) {
      if (Array.isArray(it?.chat_messages)) {   // claude.ai conversations.json
        const msgs = it.chat_messages.map(m => {
          const t = m.text || (m.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
          return t?.trim() ? `${m.sender === 'human' ? 'Илья' : 'Claude'}: ${t.trim()}` : '';
        }).filter(Boolean);
        if (msgs.length) docs.push({ title:'Чат Claude: ' + (it.name || 'без названия') + (it.created_at ? ` (${it.created_at.slice(0, 10)})` : ''), kind:'claude-chat', text:msgs.join('\n\n').slice(0, 120000) });
      } else if (it && (Array.isArray(it.docs) || it.prompt_template)) {   // claude.ai projects.json
        const parts = [it.description, it.prompt_template && 'Инструкции проекта:\n' + it.prompt_template, ...(it.docs || []).map(d => `### ${d.filename}\n${d.content}`)].filter(Boolean);
        if (parts.length) docs.push({ title:'Проект Claude: ' + (it.name || 'без названия'), kind:'claude-project', text:parts.join('\n\n').slice(0, 200000) });
      }
    }
    if (!docs.length) docs.push({ title:name, kind:'file', text:JSON.stringify(data, null, 1).slice(0, 200000) });
  } else if (['.md', '.txt', '.csv', '.html', '.htm'].includes(ext)) {
    const text = ext.startsWith('.htm') ? htmlText(raw) : raw.trim();
    if (text.length) docs.push({ title:titleOf(text, name), kind:'file', text:text.slice(0, 300000) });
  } else throw new Error('Поддерживаются .md, .txt, .csv, .html и .json (в том числе выгрузка claude.ai).');
  const saved = [];
  for (const d of docs) {
    const id = crypto.createHash('sha1').update(d.title + d.text.length + d.text.slice(0, 2000)).digest('hex').slice(0, 16);
    const doc = { ...d, path:`мои материалы/${name}${docs.length > 1 ? ' → ' + d.title : ''}`, file:name, id, at:new Date().toISOString() };
    fs.writeFileSync(path.join(PRIV, id + '.json'), JSON.stringify(doc));
    saved.push({ id, title:d.title });
  }
  cache.key = '';
  return saved;
}
export function listPrivate() {
  return privFiles().map(f => { try { const d = JSON.parse(fs.readFileSync(path.join(PRIV, f), 'utf8')); return { id:d.id, title:d.title, file:d.file, kind:d.kind, chars:d.text.length, at:d.at }; } catch { return null; } }).filter(Boolean);
}
export function removePrivate(id) { if (!/^[0-9a-f]{16}$/.test(id)) return false; const f = path.join(PRIV, id + '.json'); if (!fs.existsSync(f)) return false; fs.unlinkSync(f); cache.key = ''; return true; }

/* ---------- load + search ---------- */
let cache = { key:'' };
const STOP = new Set('и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между the and of to in a is for on with'.split(' '));
const stem = w => w.length > 6 ? w.slice(0, w.length > 9 ? 7 : 6) : w;
const tokens = s => (s.toLowerCase().replace(/ё/g, 'е').match(/[a-zа-я0-9]+/g) || []).filter(w => w.length > 1 && !STOP.has(w)).map(stem);
function chunk(doc) {
  const parts = [], lines = doc.text.split('\n'); let cur = [], head = doc.title, size = 0;
  const flush = () => { if (cur.length) parts.push({ head, text:cur.join('\n') }); cur = []; size = 0; };
  for (const l of lines) {
    if (/^#{1,3}\s/.test(l) && size > 400) { flush(); head = doc.title + ' → ' + l.replace(/^#+\s*/, ''); }
    else if (/^#{1,3}\s/.test(l)) head = doc.title + ' → ' + l.replace(/^#+\s*/, '');
    cur.push(l); size += l.length + 1;
    if (size > 1800) flush();
  }
  flush();
  return parts;
}
export function loadKb() {
  const built = fs.existsSync(BUILT) ? BUILT : '';
  const skStamp = SKILLS && fs.existsSync(SKILLS) ? fs.statSync(SKILLS).mtimeMs : 0;
  const key = (built ? fs.statSync(built).mtimeMs : 0) + '|' + skStamp + '|' + privFiles().join(',');
  if (cache.key === key) return cache;
  let base = { digest:'', docs:[] };
  if (built) try { base = JSON.parse(fs.readFileSync(built, 'utf8')); } catch (e) { console.error('kb:', e.message); }
  const priv = privFiles().map(f => { try { return JSON.parse(fs.readFileSync(path.join(PRIV, f), 'utf8')); } catch { return null; } }).filter(Boolean);
  const skills = serverSkills();
  const skillDocs = skills.map(x => ({ path:'скиллы сервера/' + x.name, title:'Скилл ' + x.name, kind:'skill', text:x.text || x.description }));
  const docs = [...base.docs, ...skillDocs, ...priv];
  const chunks = [], df = new Map();
  for (const d of docs) for (const c of chunk(d)) {
    const tf = new Map(); for (const t of tokens(c.head + ' ' + c.text)) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    chunks.push({ path:d.path, head:c.head, text:c.text, tf, len:[...tf.values()].reduce((a, b) => a + b, 0) });
  }
  const avg = chunks.reduce((n, c) => n + c.len, 0) / Math.max(1, chunks.length);
  const list = [...base.docs, ...priv].map(d => `- ${d.title} — ${d.path}`).join('\n');
  const skillList = skills.length ? `## Скиллы команды на сервере (${skills.length}) — их выполняет Claude Code (run_claude_code)\n` + skills.map(x => `- ${x.name} — ${x.description.slice(0, 220)}`).join('\n') + '\n\n' : '';
  const digest = (base.digest ? base.digest + '\n\n' : '') + skillList +
    `## База знаний: все документы (ищи по ним search_knowledge, читай read_document по пути)\n${list}`;
  cache = { key, digest, docs, chunks, df, avg, builtAt:base.builtAt || null, counts:{ repo:base.docs.length, mine:priv.length, skills:skills.length } };
  return cache;
}
export function search(query, k = 6) {
  const kb = loadKb(), q = [...new Set(tokens(query))], N = kb.chunks.length;
  if (!q.length || !N) return [];
  const scored = kb.chunks.map(c => {
    let s = 0;
    for (const t of q) { const f = c.tf.get(t); if (!f) continue; const idf = Math.log(1 + (N - kb.df.get(t) + 0.5) / (kb.df.get(t) + 0.5)); s += idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * c.len / kb.avg)); }
    return { c, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  const out = [], perDoc = new Map();
  for (const { c } of scored) { const n = perDoc.get(c.path) || 0; if (n >= 2) continue; perDoc.set(c.path, n + 1); out.push(c); if (out.length >= k) break; }
  return out.map(c => ({ path:c.path, head:c.head, text:c.text }));
}
export function readDoc(p, offset = 0) {
  const d = loadKb().docs.find(x => x.path === p) || loadKb().docs.find(x => x.path.endsWith(p) || x.title === p);
  if (!d) return null;
  const part = d.text.slice(offset, offset + 24000);
  return { path:d.path, title:d.title, text:part, more:offset + part.length < d.text.length ? offset + part.length : null };
}

/* ---------- tools for Claude ---------- */
export const kbTools = () => [
  { name:'search_knowledge', eager_input_streaming:true,
    description:'Поиск по базе знаний Ильи: все его проекты и бизнесы (реестр, README, CLAUDE.md, спецификации, роадмапы), тексты лендингов (офферы, цены, программы), скиллы команды, и его собственные материалы — чаты и проекты из Claude, документы. Ищи здесь, прежде чем спрашивать Илью или говорить, что не знаешь.',
    input_schema:{ type:'object', required:['query'], properties:{ query:{ type:'string', description:'Ключевые слова: названия продуктов, темы, термины (по-русски и/или по-английски).' } } } },
  { name:'read_document', eager_input_streaming:true,
    description:'Прочитать документ базы знаний целиком (до 24 000 знаков за раз) по пути из списка документов или из результатов поиска.',
    input_schema:{ type:'object', required:['path'], properties:{ path:{ type:'string' }, offset:{ type:'integer', description:'С какого знака читать дальше (из поля more прошлого ответа).' } } } },
];
export function runKbTool(u) {
  const inp = u.input || {};
  if (u.name === 'search_knowledge') {
    if (typeof inp.query !== 'string' || !inp.query.trim()) return { type:'tool_result', tool_use_id:u.id, is_error:true, content:JSON.stringify({ INVALID_JSON:JSON.stringify(inp) }) };
    const hits = search(inp.query);
    return { type:'tool_result', tool_use_id:u.id, content:hits.length ? hits.map(h => `### ${h.head}\nпуть: ${h.path}\n${h.text}`).join('\n\n---\n\n') : 'Ничего не нашлось — попробуй другие слова или посмотри список документов.' };
  }
  if (typeof inp.path !== 'string' || (inp.offset != null && !Number.isInteger(inp.offset))) return { type:'tool_result', tool_use_id:u.id, is_error:true, content:JSON.stringify({ INVALID_JSON:JSON.stringify(inp) }) };
  const d = readDoc(inp.path, Math.max(0, inp.offset || 0));
  return { type:'tool_result', tool_use_id:u.id, ...(d ? { content:`# ${d.title}\nпуть: ${d.path}${d.more ? `\n(продолжение: offset=${d.more})` : ''}\n\n${d.text}` } : { is_error:true, content:'Нет такого документа — возьми путь из списка или из поиска.' }) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) && process.argv[2] === 'build') {
  build(path.resolve(process.argv[3] || path.resolve(HERE, '../../..'))).then(r => console.log(`twin kb: ${r.docs} docs, ${r.chars} chars, digest ${r.digest} chars`)).catch(e => { console.error(e); process.exit(1); });
}
