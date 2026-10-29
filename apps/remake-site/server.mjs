#!/usr/bin/env node
/* API сайта «Ремейк залёта» — remake.aicex.club/api/*. Без зависимостей.

   Прогоны пишет скилл remake-top-reel (report.py --push) с машины, где идёт прогон: Mac со «Студией Кадрика»
   или сессия Claude. Страница (index.html) опрашивает GET /api/runs раз в 10 секунд.

     GET  /api/health              {ok, runs, writable}
     GET  /api/runs                {runs: [...] новые сверху, до 30, state: {current}}
     PUT  /api/runs/<slug>         документ прогона (JSON-объект до 1 МБ)       — Authorization: Bearer <REMAKE_SITE_TOKEN>
     PUT  /api/media/<file>        кадр или видео (jpg/png/webp/mp4, до 60 МБ)   — то же; отдаёт Caddy по /media/<file>
     /api/studio/*                 студия: референс → расшифровка → сценарий → аватар HeyGen → монтаж Кадрика (studio.mjs, вход по паролю)
     Telegram                      ветка «Instagram Reels»: залёты → карточки → ✅ → готовый рилс файлом (reels-bot.mjs, REMAKE_TG_BOT_TOKEN)

   Env: REMAKE_SITE_TOKEN (без него запись выключена), DATA_DIR (runs/, media/, state.json; по умолчанию ./data),
   PORT (8790), SERVE_STATIC=<папка> — заодно отдавать страницу и /media для локального запуска. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createStudio } from './studio.mjs';
import { createReelsBot } from './reels-bot.mjs';

const PORT = Number(process.env.PORT || 8790);
const DATA = path.resolve(process.env.DATA_DIR || './data');
const TOKEN = process.env.REMAKE_SITE_TOKEN || '';
const STATIC = process.env.SERVE_STATIC ? path.resolve(process.env.SERVE_STATIC) : '';
const RUNS = path.join(DATA, 'runs'), MEDIA = path.join(DATA, 'media'), STATE = path.join(DATA, 'state.json');
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FILE = /^[a-z0-9][a-z0-9._-]{0,99}\.(jpe?g|png|webp|mp4)$/i;
const SERVED = /^[a-z0-9][a-z0-9._-]{0,99}\.(jpe?g|png|webp|mp4|mov|m4v|webm|mkv|zip)$/i;  // studio files too (local runs)
const MAX_RUN = 1 << 20, MAX_MEDIA = 60 << 20, LIST = 30;
const TYPES = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.json': 'application/json',
  '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.zip': 'application/zip' };
for (const d of [RUNS, MEDIA]) fs.mkdirSync(d, { recursive: true });
let studio = null, reels = { enabled: false };  // assigned once send/receive exist

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
const authorized = (req) => {
  if (!TOKEN) return false;
  const got = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return crypto.timingSafeEqual(digest(got), digest(TOKEN));
};

function listRuns() {
  const runs = [];
  for (const f of fs.readdirSync(RUNS)) {
    if (!f.endsWith('.json')) continue;
    try { const r = JSON.parse(fs.readFileSync(path.join(RUNS, f), 'utf8')); if (r && typeof r === 'object') runs.push(r); } catch {}
  }
  runs.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch {}
  return { runs: runs.slice(0, LIST), state };
}

// write via a temp file and rename, so a reader never sees half a file
function receive(req, dest, max) {
  return new Promise((resolve, reject) => {
    const tmp = `${dest}.${process.pid}.${Date.now()}.part`;
    const out = fs.createWriteStream(tmp);
    let size = 0, failed = false;
    const fail = (code, msg) => { if (failed) return; failed = true; req.unpipe(out); out.destroy(); fs.rm(tmp, () => {}); reject(Object.assign(new Error(msg), { code })); };
    req.on('data', (chunk) => { size += chunk.length; if (size > max) fail(413, 'слишком большой файл'); });
    req.on('error', () => fail(400, 'обрыв загрузки'));
    out.on('error', () => fail(500, 'не записалось'));
    out.on('finish', () => { if (!failed) fs.rename(tmp, dest, (e) => (e ? reject(e) : resolve(size))); });
    req.pipe(out);
  });
}

async function putRun(req, res, slug) {
  const dest = path.join(RUNS, `${slug}.json`);
  const tmp = path.join(RUNS, `.${slug}.incoming`);
  await receive(req, tmp, MAX_RUN);
  let doc;
  try { doc = JSON.parse(fs.readFileSync(tmp, 'utf8')); } catch { fs.rmSync(tmp, { force: true }); return send(res, 400, { error: 'не JSON' }); }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) { fs.rmSync(tmp, { force: true }); return send(res, 400, { error: 'нужен JSON-объект' }); }
  doc.slug = slug;
  fs.writeFileSync(tmp, JSON.stringify(doc));
  fs.renameSync(tmp, dest);
  fs.writeFileSync(STATE + '.part', JSON.stringify({ current: slug, updated_at: new Date().toISOString() }));
  fs.renameSync(STATE + '.part', STATE);
  send(res, 200, { ok: true, slug });
}

function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: 'нет файла' });
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m) {
      const start = m[1] ? +m[1] : Math.max(0, st.size - +m[2]);
      const end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/api/health') return send(res, 200, { ok: true, runs: fs.readdirSync(RUNS).filter((f) => f.endsWith('.json')).length, writable: Boolean(TOKEN), studio: studio.enabled, reels: reels.enabled ? reels.status() : false });
    if (p.startsWith('/api/studio/')) return await studio.handle(req, res, p, url);
    if (p === '/api/runs' && req.method === 'GET') return send(res, 200, listRuns());
    let m = /^\/api\/runs\/([^/]+)$/.exec(p);
    if (m && req.method === 'PUT') {
      if (!authorized(req)) return send(res, TOKEN ? 401 : 403, { error: TOKEN ? 'нужен токен' : 'запись выключена: нет REMAKE_SITE_TOKEN' });
      if (!SLUG.test(m[1])) return send(res, 400, { error: 'slug: латиница, цифры, дефис' });
      return await putRun(req, res, m[1]);
    }
    m = /^\/api\/media\/([^/]+)$/.exec(p);
    if (m && req.method === 'PUT') {
      if (!authorized(req)) return send(res, TOKEN ? 401 : 403, { error: TOKEN ? 'нужен токен' : 'запись выключена: нет REMAKE_SITE_TOKEN' });
      if (!FILE.test(m[1])) return send(res, 400, { error: 'имя файла: латиница, .jpg/.png/.webp/.mp4' });
      const size = await receive(req, path.join(MEDIA, m[1]), MAX_MEDIA);
      return send(res, 200, { ok: true, url: `media/${m[1]}`, size });
    }
    if (STATIC && req.method === 'GET') {  // local runs only: in production Caddy serves the page and /media
      m = /^\/media\/([^/]+)$/.exec(p);
      if (m && SERVED.test(m[1])) return serveFile(req, res, path.join(MEDIA, m[1]));
      if (p === '/' || p === '/index.html') return serveFile(req, res, path.join(STATIC, 'index.html'));
    }
    send(res, 404, { error: 'нет такого адреса' });
  } catch (e) {
    send(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.message || 'ошибка' });
  }
});
studio = createStudio({ data: DATA, media: MEDIA, send, receive });
reels = createReelsBot({ studio: studio.bot, data: DATA });
server.requestTimeout = 30 * 60 * 1000;  // a 700 MB reference over a slow uplink
server.listen(PORT, () => console.log(`remake-site api :${PORT} · ветка Reels ${reels.enabled ? 'включена' : 'выключена (нет REMAKE_TG_BOT_TOKEN)'} · data ${DATA} · ${TOKEN ? 'запись по токену' : 'только чтение'} · студия ${studio.enabled ? 'по паролю' : 'закрыта'} ${JSON.stringify(studio.services())}`));
