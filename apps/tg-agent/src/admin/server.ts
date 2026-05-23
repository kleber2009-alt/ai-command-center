import { createHmac, timingSafeEqual } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve, type ServerType } from '@hono/node-server';
import { getCookie } from 'hono/cookie';
import { Hono, type Context as HonoContext } from 'hono';
import { basicAuth } from 'hono/basic-auth';

import type { BillingService, SubPlan, SubStatus } from '../db/billing.js';
import type { ChatService } from '../db/chats.js';
import type { DealService, DealStage } from '../db/deals.js';
import type { DigestStore, DigestPayload, DigestRow } from '../db/digests.js';
import type { DraftService, DraftStatus } from '../db/drafts.js';
import type { LeadService } from '../db/leads.js';
import type { MessageStore } from '../db/messages.js';
import type { StatsService } from '../db/stats.js';
import type { HealthMonitor } from '../health.js';
import type { KbManager } from '../kb-manager.js';
import type { MemoryService } from '../memory/service.js';
import type { PromptConfig } from '../prompt-config.js';
import type { Logger } from '../logger.js';
import { createIgProxy, type IgProxy } from './ig_proxy.js';
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
  drafts: DraftService;
  stats: StatsService;
  health: HealthMonitor;
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
  kbManager: KbManager | undefined;
  dealService: DealService | undefined;
  billingService: BillingService | undefined;
  stripeWebhookSecret: string | undefined;
  stripeBasicPriceId: string | undefined;
  stripeProPriceId: string | undefined;
  stripeEnterprisePriceId: string | undefined;
  sendOwnerMessage: ((text: string) => Promise<void>) | undefined;
  promptConfig: PromptConfig | undefined;
  dataDir: string;
  digestStore: DigestStore | undefined;
  memory: MemoryService | undefined;
  // Federated ig-agent (Instagram DM CRM). Internal docker DNS
  // address: http://ig-agent:8081 — the «📱 Instagram» tab calls
  // through the proxy below.
  igAgentUrl: string | undefined;
  igAgentUsername: string | undefined;
  igAgentPassword: string | undefined;
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

  // Drafts list — backs the "Черновики" tab. Status query filter
  // accepts pending|editing|sent|deleted; anything else falls back to
  // "all drafts".
  app.get('/api/drafts', (c) => {
    const limitRaw = Number(c.req.query('limit') ?? 50);
    const limit = Math.min(
      MAX_MESSAGE_LIMIT,
      Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50,
    );
    const statusParam = c.req.query('status');
    const validStatuses = ['pending', 'editing', 'sent', 'deleted'];
    const status = validStatuses.includes(statusParam ?? '')
      ? (statusParam as DraftStatus)
      : undefined;
    return c.json({ items: deps.drafts.listRecent(limit, status) });
  });

  // Analytics endpoints. Each takes optional ?days= for time-bounded
  // queries; defaults are tuned for the default UI views.
  app.get('/api/stats/overview', (c) => c.json(deps.stats.overview()));

  app.get('/api/stats/messages-by-day', (c) => {
    const days = clampDays(c.req.query('days'), 30, 180);
    return c.json({ items: deps.stats.messagesByDay(days), days });
  });

  app.get('/api/stats/classes', (c) => {
    const days = clampDays(c.req.query('days'), 7, 90);
    return c.json({ items: deps.stats.classDistribution(days), days });
  });

  app.get('/api/stats/actions', (c) => {
    const days = clampDays(c.req.query('days'), 7, 90);
    return c.json({ items: deps.stats.actionDistribution(days), days });
  });

  app.get('/api/stats/leads', (c) =>
    c.json({ items: deps.stats.leadFunnel() }),
  );

  app.get('/api/health', (c) => c.json({ items: deps.health.snapshot() }));

  // ── KB routes ────────────────────────────────────────────────────────────
  if (deps.kbManager) {
    const km = deps.kbManager;
    app.get('/api/kb', (c) => c.json({ content: km.getContent(), source: km.getSource() }));
    app.post('/api/kb', async (c) => {
      const { content } = await c.req.json<{ content?: string }>();
      if (typeof content !== 'string') return c.json({ error: 'content required' }, 400);
      km.save(content);
      km.reload();
      return c.json({ ok: true });
    });
  }

  // ── Prompt config routes ─────────────────────────────────────────────────
  app.get('/api/prompts', (c) => {
    if (!deps.promptConfig) return c.json({ tone: '', strategies: {}, classifierExtra: '' });
    return c.json(deps.promptConfig.getAll());
  });
  app.patch('/api/prompts', async (c) => {
    if (!deps.promptConfig) return c.json({ error: 'not configured' }, 503);
    const body = await c.req.json<{ tone?: string; strategies?: Record<string,string>; classifierExtra?: string }>();
    deps.promptConfig.save(body);
    return c.json({ ok: true });
  });

  // ── Projects / daily reports ─────────────────────────────────────────────
  app.get('/api/projects', (c) => {
    const dir = join(deps.dataDir, 'projects');
    if (!existsSync(dir)) return c.json({ projects: [] });
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => ({ name: e.name, title: e.name.replace(/-/g, ' ') }));
    return c.json({ projects: entries });
  });
  app.get('/api/projects/summary', (c) => {
    const dir = join(deps.dataDir, 'projects');
    if (!existsSync(dir)) return c.json({ projects: [] });
    const items = readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => parseProjectSummary(join(dir, e.name), e.name));
    items.sort((a, b) => (b.messagesToday - a.messagesToday) || (b.totalMessages - a.totalMessages));
    return c.json({ projects: items });
  });
  app.get('/api/projects/:name/archive', (c) => {
    const archDir = join(deps.dataDir, 'projects', c.req.param('name'), 'archive');
    if (!existsSync(archDir)) return c.json({ files: [] });
    const files = readdirSync(archDir).filter(f => f.endsWith('.md'));
    return c.json({ files });
  });
  app.get('/api/projects/:name/archive/:file', (c) => {
    const p = join(deps.dataDir, 'projects', c.req.param('name'), 'archive', c.req.param('file'));
    if (!existsSync(p)) return c.json({ error: 'not found' }, 404);
    return c.json({ content: readFileSync(p, 'utf8') });
  });
  app.get('/api/projects/:name/:file', (c) => {
    const p = join(deps.dataDir, 'projects', c.req.param('name'), c.req.param('file'));
    if (!existsSync(p)) return c.json({ error: 'not found' }, 404);
    return c.json({ content: readFileSync(p, 'utf8') });
  });

  // ── Digests (AI-generated daily summaries) ───────────────────────────────
  if (deps.digestStore) {
    const ds = deps.digestStore;
    app.get('/api/digests', (c) => {
      return c.json({ items: ds.latestPerChat().map(serializeDigest) });
    });
    app.get('/api/digests/:chatId/history', (c) => {
      const chatId = Number(c.req.param('chatId'));
      if (!Number.isFinite(chatId)) return c.json({ error: 'invalid chat_id' }, 400);
      const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 30), 1), 200);
      return c.json({ items: ds.historyForChat(chatId, limit).map(serializeDigest) });
    });
    app.get('/api/digests/by-id/:id', (c) => {
      const id = Number(c.req.param('id'));
      if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400);
      const row = ds.getById(id);
      if (!row) return c.json({ error: 'not found' }, 404);
      return c.json(serializeDigest(row));
    });
  }

  // ── Pipeline (CRM deals) routes ───────────────────────────────────────────
  if (deps.dealService) {
    const ds = deps.dealService;
    app.get('/api/deals', (c) => c.json(ds.listAll()));
    app.post('/api/deals', async (c) => {
      const b = await c.req.json<{ chatId?: number; userId?: number; notes?: string }>();
      if (!b.chatId || !b.userId) return c.json({ error: 'chatId and userId required' }, 400);
      const deal = ds.create(b.chatId, b.userId);
      return c.json(deal, 201);
    });
    app.patch('/api/deals/:id/stage', async (c) => {
      const id = Number(c.req.param('id'));
      const { stage } = await c.req.json<{ stage?: string }>();
      if (!stage) return c.json({ error: 'stage required' }, 400);
      const updated = ds.updateStage(id, stage as DealStage);
      if (!updated) return c.json({ error: 'not found' }, 404);
      return c.json(updated);
    });
    app.patch('/api/deals/:id/notes', async (c) => {
      const id = Number(c.req.param('id'));
      const { notes } = await c.req.json<{ notes?: string }>();
      if (notes === undefined) return c.json({ error: 'notes required' }, 400);
      const updated = ds.updateNotes(id, notes);
      if (!updated) return c.json({ error: 'not found' }, 404);
      return c.json(updated);
    });
    app.patch('/api/deals/:id/amount', async (c) => {
      const id = Number(c.req.param('id'));
      const { amount } = await c.req.json<{ amount?: number | null }>();
      const updated = ds.updateAmount(id, amount ?? null);
      if (!updated) return c.json({ error: 'not found' }, 404);
      return c.json(updated);
    });
    app.delete('/api/deals/:id', (c) => {
      const id = Number(c.req.param('id'));
      ds.remove(id);
      return c.json({ ok: true });
    });
    app.get('/api/deals/contacts', (c) => c.json(ds.listContacts()));
  }

  // ── Demo mode routes ──────────────────────────────────────────────────────
  app.get('/api/demo/status', (c) =>
    c.json({ active: Boolean((globalThis as Record<string, unknown>).__demoActive) })
  );
  app.post('/api/demo/start', async (c) => {
    (globalThis as Record<string, unknown>).__demoActive = true;
    deps.logger.info('demo mode started');
    return c.json({ ok: true });
  });
  // alias used by ui.html
  app.post('/api/demo/activate', async (c) => {
    (globalThis as Record<string, unknown>).__demoActive = true;
    deps.logger.info('demo mode activated');
    return c.json({ ok: true });
  });
  app.post('/api/demo/stop', async (c) => {
    (globalThis as Record<string, unknown>).__demoActive = false;
    deps.logger.info('demo mode stopped');
    return c.json({ ok: true });
  });

  // ── Billing (subscription) routes ─────────────────────────────────────────
  if (deps.billingService) {
    const bs = deps.billingService;
    app.get('/api/billing/config', (c) => c.json({ configured: Boolean(deps.stripeWebhookSecret) }));
    app.get('/api/billing/subscriptions', (c) => c.json(bs.listAll()));
    app.get('/api/billing/stats', (c) => c.json(bs.stats()));
    // plan updates via Stripe webhook
  }

  // Stripe webhook (no auth middleware — raw body needed)
  app.post('/api/stripe/webhook', async (c) => {
    if (!deps.billingService) return c.json({ error: 'billing not configured' }, 503);
    const secret = deps.stripeWebhookSecret;
    const raw = await c.req.text();
    const sig = c.req.header('stripe-signature') ?? '';
    if (secret) {
      const parts: Record<string, string> = {};
      for (const part of sig.split(',')) {
        const [k, v] = part.split('=');
        if (k && v) parts[k] = v;
      }
      const ts = parts['t'];
      const v1 = parts['v1'];
      if (!ts || !v1) return c.json({ error: 'bad sig' }, 400);
      const expected = createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      const actualBuf = Buffer.from(v1, 'hex');
      if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
        return c.json({ error: 'sig mismatch' }, 400);
      }
    }
    let evt: { type: string; data?: { object?: Record<string, unknown> } };
    try { evt = JSON.parse(raw); } catch { return c.json({ error: 'bad json' }, 400); }

    const planFor = (pid: string | undefined): SubPlan => {
      if (pid === deps.stripeBasicPriceId) return 'basic';
      if (pid === deps.stripeProPriceId) return 'pro';
      if (pid === deps.stripeEnterprisePriceId) return 'enterprise';
      return 'basic';
    };
    const toIso = (v: number | null | undefined) =>
      v ? new Date(v * 1000).toISOString() : undefined;

    const obj = evt.data?.object ?? {};
    const subId = String(obj['id'] ?? '');
    const custId = String(obj['customer'] ?? '');
    const email = String(obj['customer_email'] ?? (obj['customer_details'] as Record<string,unknown>)?.['email'] ?? '');
    const items = (obj['items'] as Record<string, unknown> | undefined);
    const priceObj = ((items?.['data'] as unknown[] | undefined) ?? [])[0] as Record<string,unknown> | undefined;
    const priceId = String((priceObj?.['price'] as Record<string,unknown> | undefined)?.['id'] ?? '');

    if (evt.type === 'customer.subscription.created' || evt.type === 'customer.subscription.updated') {
      deps.billingService!.upsertBySubId({
        stripe_subscription_id: subId,
        stripe_customer_id: custId,
        plan: planFor(priceId),
        status: String(obj['status'] ?? 'active') as SubStatus,
        customer_email: email,
        trial_end: toIso(obj['trial_end'] as number | null),
        current_period_end: toIso(obj['current_period_end'] as number | null),
        cancel_at: toIso(obj['cancel_at'] as number | null),
      });
    } else if (evt.type === 'customer.subscription.deleted') {
      deps.billingService!.upsertBySubId({
        stripe_subscription_id: subId,
        stripe_customer_id: custId,
        status: 'canceled',
        customer_email: email,
      });
    } else if (evt.type === 'checkout.session.completed') {
      const sessionSubId = String(obj['subscription'] ?? '');
      if (sessionSubId) {
        deps.billingService!.upsertBySubId({
          stripe_subscription_id: sessionSubId,
          stripe_customer_id: custId,
          customer_email: email,
          status: 'active',
          plan: planFor(priceId),
        });
      }
      if (deps.sendOwnerMessage) {
        await deps.sendOwnerMessage(`💳 Новая оплата!\nEmail: ${email}\nSub: ${sessionSubId || subId}`);
      }
    }
    return c.json({ received: true });
  });

  // ── Memory (semantic search over all messages) ────────────────────────────
  if (deps.memory) {
    const mem = deps.memory;
    app.get('/api/memory/info', async (c) => {
      try {
        const info = await mem.info();
        return c.json({ ...info, enabled: mem.enabled });
      } catch (err) {
        return c.json(
          { enabled: mem.enabled, error: err instanceof Error ? err.message : String(err) },
          mem.enabled ? 503 : 200,
        );
      }
    });
    app.post('/api/memory/search', async (c) => {
      if (!mem.enabled) return c.json({ items: [], note: 'memory disabled' });
      let body: {
        query?: unknown;
        limit?: unknown;
        chatId?: unknown;
        source?: unknown;
        sinceDays?: unknown;
      };
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'invalid json' }, 400);
      }
      const query = typeof body.query === 'string' ? body.query.trim() : '';
      if (query.length === 0) return c.json({ error: 'query required' }, 400);
      const limit = typeof body.limit === 'number' ? Math.min(Math.max(body.limit, 1), 50) : 10;
      const chatId = typeof body.chatId === 'number' ? body.chatId : undefined;
      const source = typeof body.source === 'string' && body.source.length > 0
        ? body.source
        : undefined;
      const sinceIso = typeof body.sinceDays === 'number' && body.sinceDays > 0
        ? new Date(Date.now() - body.sinceDays * 86_400_000).toISOString()
        : undefined;
      try {
        const hits = await mem.search(query, { limit, chatId, source, sinceIso });
        return c.json({
          items: hits.map((h) => ({
            id: h.id,
            score: h.score,
            source: h.payload.source,
            kind: h.payload.kind,
            chat_id: h.payload.chat_id,
            chat_title: h.payload.chat_title,
            user_id: h.payload.user_id,
            username: h.payload.username,
            class: h.payload.class,
            title: h.payload.title,
            url: h.payload.url,
            text: h.payload.text,
            created_at: h.payload.created_at,
          })),
        });
      } catch (err) {
        deps.logger.error('memory: search failed', {
          query: query.slice(0, 80),
          error: err instanceof Error ? err.message : String(err),
        });
        return c.json({ error: 'search failed' }, 503);
      }
    });
  }
}

function clampDays(raw: string | undefined, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
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

type SerializedDigest = {
  id: number;
  chat_id: number;
  chat_title: string | null;
  window_hours: number;
  generated_at: string;
  messages_count: number;
  summary_md: string;
  delivered_at: string | null;
  payload: DigestPayload | null;
};

function serializeDigest(row: DigestRow): SerializedDigest {
  let payload: DigestPayload | null = null;
  try { payload = JSON.parse(row.payload_json) as DigestPayload; } catch { payload = null; }
  return {
    id: row.id,
    chat_id: row.chat_id,
    chat_title: row.chat_title,
    window_hours: row.window_hours,
    generated_at: row.generated_at,
    messages_count: row.messages_count,
    summary_md: row.summary_md,
    delivered_at: row.delivered_at,
    payload,
  };
}

type ProjectSummary = {
  name: string;
  title: string;
  updatedAt: string | null;
  totalMessages: number;
  messagesToday: number;
  classes: Array<{ label: string; count: number }>;
  deals: number;
};

function parseProjectSummary(dir: string, name: string): ProjectSummary {
  const summary: ProjectSummary = {
    name,
    title: name.replace(/-/g, ' '),
    updatedAt: null,
    totalMessages: 0,
    messagesToday: 0,
    classes: [],
    deals: 0,
  };
  const file = join(dir, '1-диалоги.md');
  if (!existsSync(file)) return summary;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);

  const titleMatch = lines[0]?.match(/^#\s*\d+\.\s*[^·]+·\s*(.+?)\s*$/);
  if (titleMatch?.[1]) summary.title = titleMatch[1];

  // Pass 1: scalar fields anywhere in the doc.
  let inAllTimeTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (summary.updatedAt == null) {
      const m = line.match(/^>\s*Обновлено:\s*(\d{4}-\d{2}-\d{2})/);
      if (m) summary.updatedAt = m[1]!;
    }
    const total = line.match(/^##\s*Всего сообщений:\s*(\d+)/);
    if (total) summary.totalMessages = Number(total[1]);
    const today = line.match(/Сегодня:\s*\*\*\+?(\d+)\*\*/);
    if (today) summary.messagesToday = Number(today[1]);
    const deals = line.match(/^##\s*Сделки в CRM:\s*(\d+)/);
    if (deals) summary.deals = Number(deals[1]);

    // Class table lives under "## Разбивка по классу (всё время)" and ends
    // at the next "##" heading.
    if (/^##\s*Разбивка по классу/i.test(line)) { inAllTimeTable = true; continue; }
    if (inAllTimeTable && /^##\s/.test(line)) { inAllTimeTable = false; continue; }
    if (inAllTimeTable) {
      const row = line.match(/^\|\s*([A-Z_]+)\s*\|\s*(\d+)\s*\|/);
      if (row) summary.classes.push({ label: row[1]!, count: Number(row[2]) });
    }
  }
  summary.classes.sort((a, b) => b.count - a.count);
  return summary;
}
