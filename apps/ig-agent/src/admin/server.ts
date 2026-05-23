// Hono server hosting:
//   - POST /webhook/sendpulse        — unauthenticated, gated by shared token
//   - GET  /healthz                  — liveness
//   - GET  /login, /logout           — magic-link flow
//   - GET  /                         — inbox.html (default landing)
//   - GET  /<page>                   — every prototype page (pipeline, conversation, ...)
//   - GET  /api/...                  — JSON data endpoints (auth required)
//
// Static UI files live under dist/admin/ui/ (or src/admin/ui/ in dev).
// Auth uses the same magic-link scheme as tg-agent so muscle memory carries.

import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Hono } from 'hono';
import { serve } from '@hono/node-server';

import {
  buildClearCookie,
  buildSessionCookie,
  COOKIE_NAME,
  createThrottle,
  createTokenSigner,
  safeEqual,
  type TokenSigner,
} from './auth.js';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import type { ContactService, LeadStatus } from '../db/contacts.js';
import type { ConversationService } from '../db/conversations.js';
import type { MessageStore } from '../db/messages.js';
import type { RecommendationStore } from '../db/recommendations.js';
import type { PromptStore } from '../db/prompts.js';
import type { SettingsService } from '../db/settings.js';
import type { Notifier } from '../notifier.js';
import type { Pipeline } from '../pipeline.js';
import type { Analyst } from '../analyst.js';
import type { SendPulseClient } from '../sendpulse/client.js';
import { parseWebhookBody } from '../webhook.js';

const here = dirname(fileURLToPath(import.meta.url));
// Try both layouts: compiled (dist/admin/ui) and dev (src/admin/ui).
const UI_DIRS = [resolve(here, 'ui'), resolve(here, '..', '..', 'src', 'admin', 'ui')];

// Slugs the SPA exposes — each maps to <slug>.html. Adding `/` falls back
// to inbox.html so the landing route works.
const PAGES = [
  'inbox',
  'conversation',
  'pipeline',
  'pulse',
  'agents',
  'reports',
  'kb',
  'settings',
] as const;

// Shared browser-side client. Inlined as a string so we don't need a
// bundler and so it can be served via /assets/ig-admin.js.
const IG_ADMIN_JS = `
// Tiny helper module loaded by every admin page.
window.IG = (function () {
  async function api(path, init) {
    const res = await fetch(path, Object.assign({ credentials: 'same-origin', headers: { 'content-type': 'application/json' } }, init || {}));
    if (res.status === 401) { location.href = '/'; throw new Error('unauthorized'); }
    if (!res.ok) {
      let body = ''; try { body = await res.text(); } catch (_) {}
      throw new Error('HTTP ' + res.status + ' ' + path + ' ' + body.slice(0, 200));
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.indexOf('application/json') >= 0) return res.json();
    return res.text();
  }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }
  function fmtDay(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var M = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
    return d.getDate() + ' ' + M[d.getMonth()];
  }
  function nameOf(c) {
    if (!c) return '—';
    if (c.ig_username) return '@' + c.ig_username;
    var fn = (c.first_name || '') + ' ' + (c.last_name || '');
    fn = fn.trim();
    if (fn) return fn;
    return (c.sendpulse_contact_id || '').slice(0, 10);
  }
  function statusBadge(s) {
    var map = { new: '#b8b3a8', warm: '#f0c060', hot: '#f06090', customer: '#60c8f0', lost: '#666' };
    var lbl = { new: 'NEW', warm: 'WARM', hot: 'HOT', customer: 'CUSTOMER', lost: 'LOST' };
    var color = map[s] || '#b8b3a8';
    return '<span style="font-family:monospace;font-size:10px;letter-spacing:.1em;color:' + color + ';border:1px solid ' + color + ';padding:2px 6px;border-radius:3px">' + (lbl[s] || s || 'NEW') + '</span>';
  }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  // Mounts the global auto-reply toggle button into a container.
  // The button reflects /api/settings.auto_reply_enabled and flips it on
  // click. Other pages just call IG.mountAutoReplyToggle(containerEl).
  function mountAutoReplyToggle(container) {
    if (!container) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btnAutoReplyToggle';
    btn.style.cssText =
      'display:inline-flex;align-items:center;gap:6px;font-family:monospace;font-size:10px;' +
      'letter-spacing:.1em;padding:5px 10px;border-radius:4px;cursor:pointer;font-weight:700;' +
      'background:transparent;color:#8a8378;border:1px solid #262626;';
    btn.textContent = '… autoreply';
    container.appendChild(btn);

    var current = null;
    function render() {
      if (current === null) {
        btn.textContent = '…';
        return;
      }
      if (current) {
        btn.textContent = '🟢 AUTO-REPLY: ON';
        btn.style.color = '#9fd368';
        btn.style.borderColor = 'rgba(159,211,104,.35)';
        btn.style.background = 'rgba(159,211,104,.06)';
        btn.title = 'AI отвечает автоматически. Клик чтобы выключить — останется только анализ.';
      } else {
        btn.textContent = '⏸ AUTO-REPLY: OFF';
        btn.style.color = '#FFC56F';
        btn.style.borderColor = 'rgba(240,192,96,.4)';
        btn.style.background = 'rgba(240,192,96,.08)';
        btn.title = 'Агент только анализирует диалоги. AI-ответы не уходят. Клик чтобы включить.';
      }
    }

    async function load() {
      try {
        var data = await api('/api/settings');
        var s = (data && data.settings) || {};
        current = s.auto_reply_enabled === 'true' || s.auto_reply_enabled === undefined;
        render();
      } catch (e) {
        btn.textContent = '⚠ ' + (e.message || 'err');
      }
    }

    btn.addEventListener('click', async function () {
      if (current === null) return;
      var next = !current;
      btn.disabled = true;
      try {
        await api('/api/settings', {
          method: 'POST',
          body: JSON.stringify({ auto_reply_enabled: next }),
        });
        current = next;
        render();
      } catch (e) {
        alert(e.message);
      } finally {
        btn.disabled = false;
      }
    });

    load();
  }

  return {
    api: api, fmtTime: fmtTime, fmtDay: fmtDay, nameOf: nameOf,
    statusBadge: statusBadge, escapeHtml: escapeHtml, getParam: getParam,
    mountAutoReplyToggle: mountAutoReplyToggle,
  };
})();
`;

export interface AdminDeps {
  config: Config;
  logger: Logger;
  contacts: ContactService;
  conversations: ConversationService;
  messages: MessageStore;
  recommendations: RecommendationStore;
  prompts: PromptStore;
  settings: SettingsService;
  pipeline: Pipeline;
  analyst: Analyst;
  sendPulse: SendPulseClient;
  notifier: Notifier;
}

export interface AdminHandle {
  close(): Promise<void>;
}

function readUiFile(name: string): string | null {
  for (const dir of UI_DIRS) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
  }
  return null;
}

function parseCookies(header: string | null | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [k, ...vs] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(vs.join('='));
  }
  return out;
}

function isSecureRequest(url: string, xForwardedProto: string | null): boolean {
  if (xForwardedProto?.toLowerCase() === 'https') return true;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function startAdminServer(deps: AdminDeps): AdminHandle {
  const { config, logger } = deps;
  const app = new Hono();

  const signer: TokenSigner | null = config.adminSessionSecret
    ? createTokenSigner(config.adminSessionSecret)
    : null;
  const magicThrottle = createThrottle();

  const basicAuthEnabled = !!config.adminUsername && !!config.adminPassword;
  if (!signer && !basicAuthEnabled) {
    logger.warn('admin auth disabled — set ADMIN_SESSION_SECRET or ADMIN_PASSWORD');
  }

  // ---- Public routes ---------------------------------------------------

  app.get('/healthz', (c) => c.json({ ok: true }));

  // Static asset shims. The prototype HTML references /assets/sidebar.js
  // and (in conversation.html) os.css — both are no-ops here. We also
  // ship our own /assets/ig-admin.js with the small shared client helper
  // each page uses.
  app.get('/assets/sidebar.js', (c) => c.body('/* sidebar shim */', 200, {
    'content-type': 'application/javascript; charset=utf-8',
  }));
  app.get('/os.css', (c) => c.body('/* os.css shim */', 200, {
    'content-type': 'text/css; charset=utf-8',
  }));
  app.get('/assets/ig-admin.js', (c) => c.body(IG_ADMIN_JS, 200, {
    'content-type': 'application/javascript; charset=utf-8',
  }));

  app.post('/webhook/sendpulse', async (c) => {
    const token = c.req.query('token');
    if (!token || !safeEqual(token, config.sendPulseWebhookToken)) {
      return c.json({ ok: false, error: 'invalid token' }, 401);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    const parsed = parseWebhookBody(body);
    logger.info('webhook received', {
      events: Array.isArray(body) ? body.length : 1,
      messages: parsed.messages.length,
      ignored: parsed.ignored,
    });

    // Process events sequentially — Instagram DM rate is low and ordered
    // delivery matters for conversation flow. If volume grows, batch this
    // through a queue.
    for (const event of parsed.messages) {
      try {
        await deps.pipeline.handle(event);
      } catch (err) {
        logger.error('pipeline handle failed', {
          err: err instanceof Error ? err.message : String(err),
          sendpulseContactId: event.sendpulseContactId,
        });
      }
    }

    // Always 200 — SendPulse retries 5xx, but we never want to replay an
    // already-persisted message.
    return c.json({ ok: true, processed: parsed.messages.length });
  });

  // ---- Magic link ------------------------------------------------------

  app.post('/api/request-link', async (c) => {
    if (!signer) return c.json({ ok: false, error: 'magic link disabled' }, 503);
    if (!magicThrottle.take()) {
      return c.json({ ok: false, error: 'throttled' }, 429);
    }
    const { token } = signer.issueMagic();
    const base = config.adminPublicUrl ?? new URL(c.req.url).origin;
    const url = `${base}/login?token=${encodeURIComponent(token)}`;
    await deps.notifier.send(`🔐 ig-agent admin link (10 min):\n\n${url}`, {
      silent: false,
    });
    logger.info('magic link issued');
    return c.json({ ok: true });
  });

  app.get('/login', (c) => {
    const token = c.req.query('token');
    if (!signer || !signer.verifyMagic(token)) {
      return c.html('<h1>Invalid or expired link</h1>', 401);
    }
    const session = signer.issueSession();
    const secure = isSecureRequest(c.req.url, c.req.header('x-forwarded-proto') ?? null);
    c.header('Set-Cookie', buildSessionCookie(session.token, secure));
    return c.redirect('/');
  });

  app.post('/logout', (c) => {
    const secure = isSecureRequest(c.req.url, c.req.header('x-forwarded-proto') ?? null);
    c.header('Set-Cookie', buildClearCookie(secure));
    return c.json({ ok: true });
  });

  // ---- Auth middleware (applies to / and /api/*) ----------------------

  app.use('*', async (c, next) => {
    const path = new URL(c.req.url).pathname;
    // Public paths.
    if (
      path === '/healthz' ||
      path === '/login' ||
      path === '/webhook/sendpulse' ||
      path === '/api/request-link' ||
      path === '/os.css' ||
      path.startsWith('/assets/') ||
      path.startsWith('/static/')
    ) {
      return next();
    }

    // Session cookie path.
    if (signer) {
      const cookies = parseCookies(c.req.header('cookie'));
      if (signer.verifySession(cookies[COOKIE_NAME])) return next();
    }

    // Basic auth fallback.
    if (basicAuthEnabled) {
      const header = c.req.header('authorization') ?? '';
      if (header.startsWith('Basic ')) {
        const [user, pass] = Buffer.from(header.slice(6), 'base64')
          .toString('utf8')
          .split(':');
        if (
          user &&
          pass &&
          safeEqual(user, config.adminUsername!) &&
          safeEqual(pass, config.adminPassword!)
        ) {
          return next();
        }
      }
      c.header('WWW-Authenticate', 'Basic realm="ig-agent"');
      return c.text('Unauthorized', 401);
    }

    // No auth configured → render a self-serve "request link" page so the
    // owner can trigger the bot DM without ever typing credentials.
    if (path === '/' || PAGES.some((p) => path === `/${p}`)) {
      const login = readUiFile('login.html');
      if (login) return c.html(login, 401);
    }
    return c.text('Unauthorized', 401);
  });

  // ---- Static UI -------------------------------------------------------

  app.get('/', (c) => {
    const html = readUiFile('inbox.html');
    if (!html) return c.text('inbox.html missing', 500);
    return c.html(html);
  });

  for (const page of PAGES) {
    app.get(`/${page}`, (c) => {
      const html = readUiFile(`${page}.html`);
      if (!html) return c.text(`${page}.html missing`, 500);
      return c.html(html);
    });
  }

  // ---- JSON API --------------------------------------------------------

  function asLeadStatus(raw: string | undefined): LeadStatus | undefined {
    if (!raw) return undefined;
    if (
      raw === 'new' ||
      raw === 'warm' ||
      raw === 'hot' ||
      raw === 'customer' ||
      raw === 'lost'
    ) {
      return raw;
    }
    return undefined;
  }

  app.get('/api/contacts', async (c) => {
    const status = asLeadStatus(c.req.query('status'));
    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Math.min(Math.max(Number(limitRaw), 1), 500) : 100;
    const rows = await deps.contacts.list({ status, limit });
    return c.json({ contacts: rows });
  });

  app.get('/api/contacts/:id', async (c) => {
    const id = c.req.param('id');
    const contact = await deps.contacts.byId(id);
    if (!contact) return c.json({ error: 'not found' }, 404);
    const conv = await deps.conversations.byContact(id);
    return c.json({ contact, conversations: conv });
  });

  app.get('/api/contacts/:id/messages', async (c) => {
    const id = c.req.param('id');
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 200), 1), 1000);
    const rows = await deps.messages.listForContact(id, limit);
    return c.json({ messages: rows });
  });

  app.get('/api/contacts/:id/recommendations', async (c) => {
    const id = c.req.param('id');
    const rows = await deps.recommendations.forContact(id, 50);
    return c.json({ recommendations: rows });
  });

  app.post('/api/contacts/:id/takeover', async (c) => {
    const id = c.req.param('id');
    let body: { ai_handled?: boolean } = {};
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      body = {};
    }
    const aiHandled = body.ai_handled === true;
    await deps.conversations.setAiHandled(id, aiHandled);
    return c.json({ ok: true, ai_handled: aiHandled });
  });

  app.post('/api/contacts/:id/reply', async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json().catch(() => ({}))) as { text?: string };
    const text = body.text?.trim();
    if (!text) return c.json({ error: 'text required' }, 400);
    const contact = await deps.contacts.byId(id);
    if (!contact) return c.json({ error: 'not found' }, 404);
    let sendpulseMessageId: string | null = null;
    try {
      const r = await deps.sendPulse.sendText(contact.sendpulse_contact_id, text);
      sendpulseMessageId = r.sendpulseMessageId;
    } catch (err) {
      logger.error('manual reply send failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      return c.json({ error: 'send failed' }, 502);
    }
    const msg = await deps.messages.insert({
      contactId: id,
      direction: 'outgoing',
      source: 'manual',
      text,
      sendpulseMessageId,
    });
    return c.json({ ok: true, message: msg });
  });

  app.post('/api/contacts/:id/analyze', async (c) => {
    const id = c.req.param('id');
    const contact = await deps.contacts.byId(id);
    if (!contact) return c.json({ error: 'not found' }, 404);
    const conversations = await deps.conversations.byContact(id);
    const active = conversations.find((cv) => cv.status === 'active') ?? null;
    const history = await deps.messages.recentForContact(id, 10);
    // Use the most recent incoming message as the "trigger" the analyst
    // is reasoning about. If there are no incoming messages, refuse —
    // analyzing an empty context wastes tokens.
    const lastIncoming = [...history].reverse().find((m) => m.direction === 'incoming' && m.text);
    if (!lastIncoming) {
      return c.json({ error: 'no incoming message to analyze' }, 400);
    }
    try {
      const result = await deps.analyst.analyze({
        contact,
        conversation: active,
        history,
        incomingMessageId: lastIncoming.id,
        incomingText: lastIncoming.text ?? '',
      });
      return c.json({ ok: true, result });
    } catch (err) {
      logger.error('manual analyze failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      return c.json({ error: 'analyze failed' }, 502);
    }
  });

  app.get('/api/prompts', async (c) => {
    const rows = await deps.prompts.list();
    return c.json({ prompts: rows });
  });

  app.post('/api/prompts/:id/activate', async (c) => {
    const id = c.req.param('id');
    await deps.prompts.activate(id);
    return c.json({ ok: true });
  });

  // Global system settings — small k/v store. Only whitelisted keys can
  // be mutated through the UI; everything else is read-only on this API.
  const WRITABLE_SETTINGS = new Set(['auto_reply_enabled']);

  app.get('/api/settings', async (c) => {
    const all = await deps.settings.all();
    return c.json({ settings: all });
  });

  app.post('/api/settings', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const updates: Record<string, string> = {};
    for (const k of Object.keys(body)) {
      if (!WRITABLE_SETTINGS.has(k)) continue;
      const v = body[k];
      if (typeof v === 'boolean') updates[k] = v ? 'true' : 'false';
      else if (typeof v === 'string') updates[k] = v;
    }
    for (const [k, v] of Object.entries(updates)) {
      await deps.settings.set(k, v);
    }
    const all = await deps.settings.all();
    logger.info('settings updated', { keys: Object.keys(updates) });
    return c.json({ ok: true, settings: all });
  });

  // ---- Boot ------------------------------------------------------------

  const server = serve({ fetch: app.fetch, port: config.adminPort, hostname: '0.0.0.0' });
  logger.info('admin server listening', { port: config.adminPort });

  return {
    async close() {
      await new Promise<void>((res) => server.close(() => res()));
    },
  };
}
