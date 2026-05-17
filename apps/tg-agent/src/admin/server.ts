import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';

import type { ChatService } from '../db/chats.js';
import type { LeadService } from '../db/leads.js';
import type { MessageStore } from '../db/messages.js';
import type { Logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_HTML_PATH = join(__dirname, 'ui.html');

const MAX_MESSAGE_LIMIT = 200;
const DEFAULT_MESSAGE_LIMIT = 50;

export interface AdminDeps {
  chats: ChatService;
  leads: LeadService;
  messages: MessageStore;
  logger: Logger;
  port: number;
  username: string;
  password: string;
}

export interface AdminHandle {
  close(): Promise<void>;
}

export function startAdminServer(deps: AdminDeps): AdminHandle {
  const ui = readFileSync(UI_HTML_PATH, 'utf-8');
  const app = new Hono();

  // Healthcheck endpoint — no auth, used by Docker / load balancers
  // to verify the process is up.
  app.get('/healthz', (c) => c.text('ok'));

  // Everything else is gated by basic auth. Empty password should
  // never reach here — main.ts guards that — but double-check.
  if (!deps.password) {
    throw new Error('admin: ADMIN_PASSWORD is empty');
  }
  app.use(
    '*',
    basicAuth({ username: deps.username, password: deps.password, realm: 'tg-agent admin' }),
  );

  app.get('/', (c) => c.html(ui));

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

  const server: ServerType = serve({ fetch: app.fetch, port: deps.port });
  deps.logger.info('admin server started', { port: deps.port, username: deps.username });

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
