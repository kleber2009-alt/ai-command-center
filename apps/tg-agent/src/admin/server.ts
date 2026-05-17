import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve, type ServerType } from '@hono/node-server';
import { getCookie } from 'hono/cookie';
import { Hono, type Context as HonoContext } from 'hono';
import { basicAuth } from 'hono/basic-auth';

import type { ChatService } from '../db/chats.js';
import type { LeadService } from '../db/leads.js';
import type { MessageStore } from '../db/messages.js';
import type { Logger } from '../logger.js';
import {
  buildClearCookie,
  buildSessionCookie,
  COOKIE_NAME,
  createThrottle,
  createTokenSigner,
  type TokenSigner,
} from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_HTML_PATH = join(__dirname, 'ui.html');
const LOGIN_HTML_PATH = join(__dirname, 'login.html');

const MAX_MESSAGE_LIMIT = 200;
const DEFAULT_MESSAGE_LIMIT = 50;

export interface SendMagicLink {
  (telegramId: number, url: string): Promise<void>;
}

export interface AdminDeps {
  chats: ChatService;
  leads: LeadService;
  messages: MessageStore;
  logger: Logger;
  port: number;
  username: string;
  // For basic-auth mode (when sessionSecret is undefined).
  password: string;
  // When set together with ownerTelegramId + sendMagicLink, the server
  // switches to magic-link-via-Telegram + signed-cookie sessions.
  sessionSecret: string | undefined;
  ownerTelegramId: number | undefined;
  sendMagicLink: SendMagicLink | undefined;
  // Optional override for the magic-link base URL. If unset we derive
  // from each request's Host + X-Forwarded-Proto, which works behind
  // Caddy / Cloudflare Tunnel out of the box.
  publicUrl: string | undefined;
}

export interface AdminHandle {
  close(): Promise<void>;
}

export function startAdminServer(deps: AdminDeps): AdminHandle {
  const ui = readFileSync(UI_HTML_PATH, 'utf-8');
  const sessionMode = Boolean(
    deps.sessionSecret && deps.ownerTelegramId !== undefined && deps.sendMagicLink,
  );

  const app = new Hono();

  // No auth: healthcheck (Docker uses it).
  app.get('/healthz', (c) => c.text('ok'));

  if (sessionMode) {
    wireSessionAuth(app, deps, ui);
  } else {
    if (!deps.password) {
      throw new Error('admin: ADMIN_PASSWORD is empty and session auth not configured');
    }
    app.use(
      '*',
      basicAuth({ username: deps.username, password: deps.password, realm: 'tg-agent admin' }),
    );
    app.get('/', (c) => c.html(ui));
  }

  wireApi(app, deps);

  const server: ServerType = serve({ fetch: app.fetch, port: deps.port });
  deps.logger.info('admin server started', {
    port: deps.port,
    auth: sessionMode ? 'session+magic-link' : 'basic',
  });

  return {
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}

function wireSessionAuth(app: Hono, deps: AdminDeps, uiHtml: string): void {
  const login = readFileSync(LOGIN_HTML_PATH, 'utf-8');
  const signer = createTokenSigner(deps.sessionSecret!);
  const throttle = createThrottle(30_000);
  const ownerId = deps.ownerTelegramId!;
  const sendMagicLink = deps.sendMagicLink!;

  // Public routes (no session needed).
  app.get('/login', (c) => c.html(login));

  app.post('/login/request', async (c) => {
    if (!throttle.take()) {
      return c.json({ error: 'Слишком часто. Подождите 30 секунд.' }, 429);
    }
    const { token } = signer.issueMagic();
    const baseUrl = resolveBaseUrl(c, deps.publicUrl);
    const url = `${baseUrl}/login/verify?token=${encodeURIComponent(token)}`;
    try {
      await sendMagicLink(ownerId, url);
      deps.logger.info('magic link sent', { ownerId });
    } catch (err) {
      deps.logger.error('magic link send failed', {
        ownerId,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json({ error: 'Не получилось отправить ссылку. Проверьте логи бота.' }, 500);
    }
    return c.json({ ok: true });
  });

  app.get('/login/verify', (c) => {
    const token = c.req.query('token');
    if (!signer.verifyMagic(token)) {
      return c.html(loginErrorPage('Ссылка недействительна или истекла. Запросите новую.'), 401);
    }
    const session = signer.issueSession();
    const secure = isHttps(c);
    c.header('Set-Cookie', buildSessionCookie(session.token, secure));
    return c.redirect('/');
  });

  app.get('/logout', (c) => {
    const secure = isHttps(c);
    c.header('Set-Cookie', buildClearCookie(secure));
    return c.redirect('/login');
  });

  // Gate everything else behind a valid session cookie. /healthz is
  // already registered above and skipped here.
  app.use('*', async (c, next) => {
    if (
      c.req.path === '/healthz' ||
      c.req.path === '/login' ||
      c.req.path === '/login/request' ||
      c.req.path === '/login/verify' ||
      c.req.path === '/logout'
    ) {
      await next();
      return;
    }
    const cookie = getCookie(c, COOKIE_NAME);
    if (!signer.verifySession(cookie)) {
      if (c.req.path.startsWith('/api/')) {
        return c.json({ error: 'unauthenticated' }, 401);
      }
      return c.redirect('/login');
    }
    await next();
  });

  app.get('/', (c) => c.html(uiHtml));
}

function wireApi(app: Hono, deps: AdminDeps): void {
  app.get('/api/chats', (c) => {
    return c.json({ items: deps.chats.listAll() });
  });

  app.patch('/api/chats/:chatId', async (c) => {
    const chatId = Number(c.req.param('chatId'));
    if (!Number.isFinite(chatId)) {
      return c.json({ error: 'invalid chat_id' }, 400);
    }
    let body: { auto_reply?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid json' }, 400);
    }
    if (typeof body.auto_reply !== 'boolean') {
      return c.json({ error: 'auto_reply (boolean) required' }, 400);
    }
    const result = deps.chats.setAutoReply(chatId, body.auto_reply);
    if (!result) {
      return c.json({ error: 'chat not found' }, 404);
    }
    return c.json({
      chat_id: result.chatId,
      title: result.title ?? null,
      auto_reply: result.autoReply ? 1 : 0,
    });
  });

  app.get('/api/chats/:chatId/messages', (c) => {
    const chatId = Number(c.req.param('chatId'));
    if (!Number.isFinite(chatId)) {
      return c.json({ error: 'invalid chat_id' }, 400);
    }
    const limitRaw = Number(c.req.query('limit') ?? DEFAULT_MESSAGE_LIMIT);
    const limit = Math.min(
      MAX_MESSAGE_LIMIT,
      Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_MESSAGE_LIMIT,
    );
    return c.json({ items: deps.messages.listForChat(chatId, limit) });
  });

  app.get('/api/chats/:chatId/users', (c) => {
    const chatId = Number(c.req.param('chatId'));
    if (!Number.isFinite(chatId)) {
      return c.json({ error: 'invalid chat_id' }, 400);
    }
    return c.json({ items: deps.leads.listForChat(chatId) });
  });
}

function resolveBaseUrl(c: HonoContext, override: string | undefined): string {
  if (override) return override.replace(/\/+$/, '');
  const proto = c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '');
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? 'localhost';
  return `${proto}://${host}`;
}

function isHttps(c: HonoContext): boolean {
  const proto = c.req.header('x-forwarded-proto');
  if (proto) return proto.toLowerCase().startsWith('https');
  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function loginErrorPage(message: string): string {
  return `<!doctype html><html lang="ru" class="dark"><head><meta charset="UTF-8"/><title>tg-agent</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-950 text-slate-200 min-h-screen flex items-center justify-center px-4"><div class="w-full max-w-sm rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-300"><div class="mb-2 font-semibold text-rose-200">Не получилось</div><div>${escapeHtml(message)}</div><a href="/login" class="mt-4 inline-block text-indigo-300 hover:text-indigo-200">← Запросить заново</a></div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
