// Thin HTTP proxy from the tg-agent admin to ig-agent's REST API.
// Used by the «📱 Instagram» sidebar tab so the owner can browse
// Instagram DM contacts, threads and stats inside the same admin
// SPA as Telegram chats — one inbox, one cabinet.
//
// Networking: both containers sit on `aisales_aisales-net`, so
// `http://ig-agent:8081` resolves directly. The default URL points
// at that service alias; override via IG_AGENT_URL for local dev.
//
// Auth: optional Basic auth via IG_ADMIN_USERNAME / IG_ADMIN_PASSWORD.
// When the ig-agent's `ADMIN_PASSWORD` is unset (current prod), the
// proxy still works without credentials — the inner Hono falls
// through to a no-op gate for non-magic-link routes.

import type { Logger } from '../logger.js';

export interface IgProxyOptions {
  url: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
  logger: Logger;
}

export interface IgProxy {
  readonly configured: boolean;
  get(path: string): Promise<{ status: number; body: unknown }>;
  post(path: string, body: unknown): Promise<{ status: number; body: unknown }>;
}

export function createIgProxy(opts: IgProxyOptions): IgProxy {
  const base = opts.url.replace(/\/+$/, '');
  const timeoutMs = opts.timeoutMs ?? 4000;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.username && opts.password) {
    headers['authorization'] =
      'Basic ' + Buffer.from(`${opts.username}:${opts.password}`).toString('base64');
  }

  async function call(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }> {
    const url = `${base}${path}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = { error: 'non-json response', preview: text.slice(0, 200) };
      }
      return { status: res.status, body: parsed };
    } catch (err) {
      opts.logger.warn('ig-proxy request failed', {
        method,
        path,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        status: 503,
        body: { error: 'ig-agent unreachable', detail: err instanceof Error ? err.message : String(err) },
      };
    } finally {
      clearTimeout(t);
    }
  }

  return {
    configured: Boolean(base),
    get(path) {
      return call('GET', path);
    },
    post(path, body) {
      return call('POST', path, body);
    },
  };
}
