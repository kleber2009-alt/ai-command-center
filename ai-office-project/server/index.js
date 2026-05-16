// ═══════════════════════════════════════════════════════════════════════
// server/index.js
// ───────────────────────────────────────────────────────────────────────
// Self-hosted HTTP server for ai-office-project. Replaces Netlify with a
// plain Node.js process so the site can run on a VPS behind Nginx (or
// directly on port 80).
//
// What it does:
//   · Serves all static files from the repo root (../).
//   · Routes /api/* to the existing Netlify Functions in
//     ../netlify/functions/*.js by adapting Node IncomingMessage → Web
//     Request and Web Response → Node ServerResponse. Functions stay
//     untouched, so a future move back to Netlify is trivial.
//   · Implements the same clean-URL rewrites that live in _redirects
//     (/about → /about.html, /app → /mini-app/index.html, etc.).
//   · Applies the cache + security headers from netlify.toml.
//   · Falls back to /404.html for unknown paths.
//
// Run:
//   PORT=8080 node server/index.js
// ═══════════════════════════════════════════════════════════════════════

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// Каталог, куда voice-generate пишет mp3. Отдаётся клиентам через
// /files/voice-notes/*. Должен совпадать с VOICE_NOTES_DIR функции.
const VOICE_NOTES_DIR = process.env.VOICE_NOTES_DIR || '/data/voice-notes';

// ── API routes → Netlify-function modules ─────────────────────────────
// Lazy-loaded the first time a route is hit so a misconfigured handler
// doesn't crash the whole server on boot.
const API_ROUTES = {
  '/api/chat':           '../netlify/functions/chat.js',
  '/api/notify-tg':      '../netlify/functions/notify-tg.js',
  '/api/voice-clone':    '../netlify/functions/voice-clone.js',
  '/api/voice-generate': '../netlify/functions/voice-generate.js',
  '/api/voice-list':     '../netlify/functions/voice-list.js',
};
const API_HANDLERS = new Map();

async function loadApiHandler(route) {
  if (API_HANDLERS.has(route)) return API_HANDLERS.get(route);
  const modPath = API_ROUTES[route];
  if (!modPath) return null;
  const mod = await import(new URL(modPath, import.meta.url));
  const handler = mod.default;
  if (typeof handler !== 'function') {
    throw new Error(`Module ${modPath} has no default export function`);
  }
  API_HANDLERS.set(route, handler);
  return handler;
}

// ── Clean-URL rewrites (port of _redirects, status 200) ───────────────
const REWRITES = {
  '/':                            '/index.html',
  '/navigation':                  '/navigation.html',
  '/map':                         '/navigation.html',
  '/help':                        '/navigation.html',
  '/guide':                       '/navigation.html',
  '/app':                         '/mini-app/index.html',
  '/app/':                        '/mini-app/index.html',
  '/tma':                         '/mini-app/index.html',
  '/miniapp':                     '/mini-app/index.html',
  '/mini-app-preview':            '/mini-app-preview.html',
  '/about':                       '/about.html',
  '/pricing':                     '/pricing.html',
  '/cases':                       '/cases.html',
  '/roi':                         '/roi.html',
  '/compare':                     '/compare.html',
  '/demo':                        '/demo.html',
  '/glossary':                    '/glossary.html',
  '/partners':                    '/partners.html',
  '/faq':                         '/faq.html',
  '/onboarding':                  '/onboarding.html',
  '/agents':                      '/agents.html',
  '/persona-train':               '/persona-train.html',
  '/voice':                       '/persona-train.html',
  '/dashboard':                   '/dashboard.html',
  '/whats-new':                   '/whats-new.html',
  '/leads':                       '/leads-inbox.html',
  '/leads-inbox':                 '/leads-inbox.html',
  '/dev':                         '/dev-tools.html',
  '/admin':                       '/leads-inbox.html',
  '/test':                        '/test.html',
  '/blog':                        '/blog/index.html',
  '/blog/ai-vs-hire':             '/blog/ai-vs-hire.html',
  '/blog/smm-cost-2026':          '/blog/smm-cost-2026.html',
  '/blog/ai-agents-explained':    '/blog/ai-agents-explained.html',
  '/blog/how-to-write-prompt':    '/blog/how-to-write-prompt.html',
  '/blog/ai-for-online-schools':  '/blog/ai-for-online-schools.html',
  '/blog/checklist-choose-ai-tool': '/blog/checklist-choose-ai-tool.html',
  '/brand-kit':                   '/brand-kit.html',
  '/press':                       '/brand-kit.html',
};

// ── MIME types ────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.pdf':  'application/pdf',
  '.txt':  'text/plain; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.mp3':  'audio/mpeg',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.map':  'application/json; charset=utf-8',
};

// ── Cache rules (port of netlify.toml [[headers]]) ────────────────────
function cacheControlFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();
  if (base === 'manifest.json' || base === 'sw.js') {
    return 'public, max-age=0, must-revalidate';
  }
  if (ext === '.html' || ext === '.htm') {
    return 'public, max-age=0, must-revalidate';
  }
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.svg' || ext === '.webp' || ext === '.gif') {
    return 'public, max-age=31536000, immutable';
  }
  if (ext === '.js' || ext === '.mjs' || ext === '.css') {
    return 'public, max-age=3600, must-revalidate';
  }
  return 'public, max-age=300';
}

const SECURITY_HEADERS = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // HSTS is only useful over HTTPS; safe to include but harmless without TLS.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-XSS-Protection': '1; mode=block',
};

// ── Path resolution ───────────────────────────────────────────────────
async function resolveFile(urlPath) {
  // Rewrites first (exact match, before trailing-slash logic).
  if (REWRITES[urlPath]) urlPath = REWRITES[urlPath];

  // Block traversal.
  if (urlPath.includes('..')) return null;

  let candidate = path.join(ROOT, decodeURIComponent(urlPath));
  // Stay inside ROOT.
  if (!candidate.startsWith(ROOT)) return null;

  try {
    const stat = await fs.stat(candidate);
    if (stat.isDirectory()) {
      candidate = path.join(candidate, 'index.html');
      const dstat = await fs.stat(candidate).catch(() => null);
      if (!dstat || !dstat.isFile()) return null;
      return candidate;
    }
    if (stat.isFile()) return candidate;
  } catch {
    // not found, try .html fallback (matches Netlify's pretty-URL behavior)
    if (!path.extname(candidate)) {
      try {
        const stat = await fs.stat(candidate + '.html');
        if (stat.isFile()) return candidate + '.html';
      } catch { /* fall through */ }
    }
  }
  return null;
}

// ── Static file serving ───────────────────────────────────────────────
async function serveFile(filePath, status, res) {
  const data = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = status;
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', cacheControlFor(filePath));
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  res.setHeader('Content-Length', data.length);
  res.end(data);
}

async function serve404(res) {
  const file = path.join(ROOT, '404.html');
  try {
    await serveFile(file, 404, res);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('404 Not Found');
  }
}

// ── Node IncomingMessage → Web Request ────────────────────────────────
async function nodeToWebRequest(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  const url = new URL(req.url, `${proto}://${host}`);

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, String(item));
    } else {
      headers.set(k, String(v));
    }
  }

  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length) init.body = Buffer.concat(chunks);
  }
  return new Request(url, init);
}

// ── Web Response → Node ServerResponse ────────────────────────────────
async function writeWebResponse(webRes, nodeRes) {
  nodeRes.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => {
    // Avoid leaking the hop-by-hop `content-length` from a streamed body.
    if (key.toLowerCase() === 'content-length' && !webRes.body) return;
    nodeRes.setHeader(key, value);
  });
  if (!webRes.body) {
    nodeRes.end();
    return;
  }
  const reader = webRes.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    nodeRes.write(value);
  }
  nodeRes.end();
}

// ── Main request handler ──────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const urlPath = (req.url || '/').split('?')[0];

  try {
    // API routes
    if (urlPath in API_ROUTES) {
      const handler = await loadApiHandler(urlPath);
      const webReq = await nodeToWebRequest(req);
      const webRes = await handler(webReq, { ip: req.socket?.remoteAddress });
      await writeWebResponse(webRes, res);
      log(req, res, started);
      return;
    }

    // Healthcheck
    if (urlPath === '/healthz') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, ts: Date.now() }));
      log(req, res, started);
      return;
    }

    // /files/voice-notes/* — отдаём mp3 сгенерированные voice-generate
    if (urlPath.startsWith('/files/voice-notes/')) {
      const rel = decodeURIComponent(urlPath.slice('/files/voice-notes/'.length));
      // Защита от traversal: запрещаем .. и абсолютные пути.
      if (rel.includes('..') || rel.startsWith('/')) {
        res.statusCode = 400; res.end('bad path'); log(req, res, started); return;
      }
      const abs = path.join(VOICE_NOTES_DIR, rel);
      if (!abs.startsWith(VOICE_NOTES_DIR)) {
        res.statusCode = 400; res.end('bad path'); log(req, res, started); return;
      }
      try {
        const data = await fs.readFile(abs);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Content-Length', data.length);
        res.end(data);
      } catch {
        res.statusCode = 404;
        res.end('not found');
      }
      log(req, res, started);
      return;
    }

    // Static
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      log(req, res, started);
      return;
    }

    const filePath = await resolveFile(urlPath);
    if (!filePath) {
      await serve404(res);
      log(req, res, started);
      return;
    }
    await serveFile(filePath, 200, res);
    log(req, res, started);
  } catch (err) {
    console.error('[server] error handling', req.method, req.url, err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'internal_error', message: String(err?.message || err) }));
    } else {
      try { res.end(); } catch { /* ignore */ }
    }
    log(req, res, started);
  }
});

function log(req, res, startedAt) {
  const ms = Date.now() - startedAt;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '-';
  console.log(`${new Date().toISOString()} ${ip} ${req.method} ${req.url} ${res.statusCode} ${ms}ms`);
}

server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

function shutdown(signal) {
  console.log(`[server] received ${signal}, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, HOST, () => {
  console.log(`[server] ai-office-project listening on http://${HOST}:${PORT}`);
  console.log(`[server] serving static from ${ROOT}`);
  console.log(`[server] API routes: ${Object.keys(API_ROUTES).join(', ')}`);
});
