// SendPulse Instagram chatbot REST client.
//
// OAuth2 client_credentials → bearer token cached in-memory until 60s before
// expiry. Single retry on 401 with a forced re-auth. All endpoints documented
// in https://api.sendpulse.com/.well-known/openapi/instagram.yaml.

import type { Logger } from '../logger.js';

const OAUTH_URL = 'https://api.sendpulse.com/oauth/access_token';
const API_BASE = 'https://api.sendpulse.com/instagram';

export interface SendPulseClientOptions {
  clientId: string;
  clientSecret: string;
  logger: Logger;
}

export interface SendPulseContact {
  id: string;
  bot_id: string;
  status?: number;
  channel_data?: {
    id?: number;
    user_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    profile_pic?: string | null;
  };
  tags?: string[];
  variables?: Record<string, unknown>;
}

export interface SendMessageResult {
  // SendPulse wraps responses in { success: true, data: {...} } — we
  // surface only the message_id if present (best-effort, schema varies).
  sendpulseMessageId: string | null;
  raw: unknown;
}

export interface SendPulseClient {
  sendText(contactId: string, text: string): Promise<SendMessageResult>;
  getContact(contactId: string): Promise<SendPulseContact | undefined>;
}

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

export function createSendPulseClient(opts: SendPulseClientOptions): SendPulseClient {
  let cached: CachedToken | null = null;

  async function fetchToken(): Promise<string> {
    const res = await fetch(OAUTH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`SendPulse OAuth failed: ${res.status} ${body}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };
    cached = {
      token: json.access_token,
      // Refresh 60s before the server says we expire to avoid races.
      expiresAt: Date.now() + Math.max(0, json.expires_in - 60) * 1000,
    };
    opts.logger.info('sendpulse oauth refreshed', { expires_in: json.expires_in });
    return json.access_token;
  }

  async function token(forceRefresh = false): Promise<string> {
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.token;
    return fetchToken();
  }

  async function call(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; json: unknown }> {
    const exec = async (bearer: string) => {
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${bearer}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let parsed: unknown = null;
      const txt = await res.text();
      if (txt) {
        try {
          parsed = JSON.parse(txt);
        } catch {
          parsed = txt;
        }
      }
      return { ok: res.ok, status: res.status, json: parsed };
    };

    let bearer = await token();
    let result = await exec(bearer);

    // Single retry with a fresh token if the cached one was rejected.
    if (result.status === 401) {
      opts.logger.warn('sendpulse 401, refreshing token');
      bearer = await token(true);
      result = await exec(bearer);
    }

    if (!result.ok) {
      const summary =
        typeof result.json === 'string' ? result.json : JSON.stringify(result.json);
      throw new Error(`SendPulse ${method} ${path} failed: ${result.status} ${summary}`);
    }

    return result;
  }

  return {
    async sendText(contactId, text) {
      const { json } = await call('POST', '/contacts/send', {
        contact_id: contactId,
        messages: [{ type: 'text', message: { text } }],
      });
      // Best-effort extraction — SendPulse's success envelope varies between
      // endpoints. Worst case sendpulseMessageId stays null and we still
      // persist the outbound message locally.
      let messageId: string | null = null;
      if (json && typeof json === 'object') {
        const data = (json as { data?: unknown }).data;
        if (data && typeof data === 'object') {
          const candidate = (data as { id?: string; message_id?: string }).id ??
            (data as { message_id?: string }).message_id;
          if (typeof candidate === 'string') messageId = candidate;
        }
      }
      return { sendpulseMessageId: messageId, raw: json };
    },

    async getContact(contactId) {
      try {
        const { json } = await call('GET', `/contacts/get?id=${encodeURIComponent(contactId)}`);
        if (json && typeof json === 'object') {
          const data = (json as { data?: unknown }).data;
          if (data && typeof data === 'object') return data as SendPulseContact;
        }
        return undefined;
      } catch (err) {
        opts.logger.warn('sendpulse getContact failed', {
          contactId,
          err: err instanceof Error ? err.message : String(err),
        });
        return undefined;
      }
    },
  };
}
