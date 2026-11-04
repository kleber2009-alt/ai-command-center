/* CRM Директа — переписки из ChatPlace (Instagram Direct и Telegram-боты Ильи), очередь по приоритету для Богдана,
   разбор каждой переписки ИИ: этап воронки, источник, оценка ответов ИИ-менеджера; ответ вручную прямо из CRM.

   Env: CHATPLACE_MCP_JSON (mcp-config офиса, берётся сервер chatplace) или CHATPLACE_MCP_URL + CHATPLACE_MCP_TOKEN,
        ANTHROPIC_API_KEY (без него — без разбора, только переписки), CRM_MODEL (по умолчанию claude-opus-5-5),
        CRM_OWNER_PASSWORD, CRM_BOGDAN_PASSWORD или CRM_USERS_JSON, CRM_SESSION_SECRET (иначе создаётся в базе),
        DATA_DIR, PORT, PUBLIC_URL, SYNC_SEC (60), BACKFILL_DAYS (14), CRM_ANALYZE_BATCH (12). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { openDb } from './lib/db.mjs';
import { createChatPlace, chatPlaceFromMcpJson } from './lib/chatplace.mjs';
import { createSync } from './lib/sync.mjs';
import { createAnalyzer } from './lib/analyze.mjs';
import { createAuth, loadUsers } from './lib/auth.mjs';
import { createApi } from './lib/api.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const PORT = Number(env.PORT || 8795);
const DATA_DIR = env.DATA_DIR || path.join(HERE, '.data');
const PUBLIC = path.join(HERE, 'public');
const log = (...a) => console.log(new Date().toISOString(), ...a);

const db = openDb(DATA_DIR);
const users = loadUsers(env);
if (!Object.keys(users).length) log('! no users (CRM_OWNER_PASSWORD / CRM_BOGDAN_PASSWORD) — nobody can log in');

const cpCfg = chatPlaceFromMcpJson(env.CHATPLACE_MCP_JSON) || (env.CHATPLACE_MCP_URL
  ? { url:env.CHATPLACE_MCP_URL, headers:env.CHATPLACE_MCP_TOKEN ? { authorization:`Bearer ${env.CHATPLACE_MCP_TOKEN}` } : {} } : null);
const cp = cpCfg ? createChatPlace(cpCfg) : null;
if (!cp) log('! no ChatPlace connection (CHATPLACE_MCP_JSON) — the CRM shows what it already has');

const claude = env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const MODEL = env.CRM_MODEL || 'claude-opus-5-5';
const FALLBACK = /^claude-(opus-5|fable-5|sonnet-5-5)/.test(MODEL) ? { betas:['server-side-fallback-2026-07-01'], fallbacks:'default' } : {};

const sync = cp ? createSync({ db, cp, backfillDays:Number(env.BACKFILL_DAYS) || 14, log }) : { run:async () => ({ off:true }), pullMessages:async () => 0 };
const analyzer = createAnalyzer({ db, claude, model:MODEL, fallback:FALLBACK, batch:Number(env.CRM_ANALYZE_BATCH) || 12, log });
const auth = createAuth({ db, users, secret:env.CRM_SESSION_SECRET });
const api = createApi({ db, cp, auth, sync, analyzer, secure:/^https:/.test(env.PUBLIC_URL || ''), log });

const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
const SEC = { 'x-content-type-options':'nosniff', 'referrer-policy':'same-origin', 'x-frame-options':'DENY' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let f = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUBLIC, 'index.html');
    res.writeHead(200, { 'content-type':TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control':'no-cache', ...SEC });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    log('error', req.method, url.pathname, e.message);
    if (!res.headersSent) res.writeHead(e.code === 413 ? 413 : 500, { 'content-type':'application/json' });
    res.end(JSON.stringify({ error:'Ошибка сервера' }));
  }
});

let timer = null;
async function tick() {
  try {
    const s = await sync.run();
    if (s.chats || s.firstRun) log(`sync: ${s.chats} chats, ${s.messages} new messages${s.firstRun ? ' (first pass)' : ''}`);
    const a = await analyzer.run();
    if (a.analyzed || a.failed) log(`analyze: ${a.analyzed} chats${a.failed ? `, ${a.failed} failed` : ''}`);
  } catch (e) { log('tick:', e.message); }
  timer = setTimeout(tick, (Number(env.SYNC_SEC) || 60) * 1000);
}

server.listen(PORT, () => {
  log(`direct-crm :${PORT} · chatplace ${cp ? 'on' : 'off'} · claude ${claude ? MODEL : 'off'} · users ${Object.keys(users).join(', ') || 'none'}`);
  if (env.CRM_NO_LOOP !== '1') tick();
});
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { clearTimeout(timer); server.close(); db.close(); process.exit(0); });
