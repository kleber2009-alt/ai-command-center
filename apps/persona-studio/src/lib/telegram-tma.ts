// Telegram Mini App initData verification + Bot API client (for Stars invoices).
//
// Docs:
//   https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//   https://core.telegram.org/bots/payments-stars
//
// initData format: querystring of `key=value` pairs including `hash`.
// To verify:
//   1. Strip `hash` from params.
//   2. Sort remaining keys alphabetically, join as `key=value\nkey=value...` (data_check_string).
//   3. secret_key = HMAC-SHA256(bot_token, key="WebAppData")
//   4. expected = HMAC-SHA256(data_check_string, secret_key) hex
//   5. expected === hash → valid. Also check `auth_date` is recent (within 24h).

import { createHmac, timingSafeEqual } from 'node:crypto';

export class TelegramError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'TelegramError';
  }
}

function botTokenOrThrow(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new TelegramError('MISSING_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN not set');
  return t;
}

export type TgUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
};

export type VerifiedInitData = {
  user: TgUser;
  authDate: number;                       // unix seconds
  queryId?: string;
};

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60; // 24h

export function verifyInitData(initData: string): VerifiedInitData {
  if (!initData) throw new TelegramError('EMPTY_INIT_DATA', 'initData is empty');
  const token = botTokenOrThrow();

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new TelegramError('NO_HASH', 'initData missing hash');
  params.delete('hash');

  // Build data_check_string: sort by key, join as `k=v\nk=v...`
  const pairs: string[] = [];
  const keys: string[] = [];
  params.forEach((_v, k) => { keys.push(k); });
  keys.sort();
  for (const k of keys) {
    pairs.push(`${k}=${params.get(k)}`);
  }
  const dataCheckString = pairs.join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  let ok = false;
  try {
    ok = expected.length === hash.length && timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
  } catch {
    ok = false;
  }
  if (!ok) throw new TelegramError('BAD_HASH', 'initData signature mismatch');

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) throw new TelegramError('NO_AUTH_DATE', 'auth_date missing');
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > MAX_AUTH_AGE_SECONDS) {
    throw new TelegramError('AUTH_EXPIRED', `initData is ${ageSec}s old, max ${MAX_AUTH_AGE_SECONDS}`);
  }

  const userRaw = params.get('user');
  if (!userRaw) throw new TelegramError('NO_USER', 'user payload missing');
  let user: TgUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new TelegramError('BAD_USER_JSON', 'user payload is not JSON');
  }
  if (typeof user.id !== 'number') throw new TelegramError('BAD_USER_ID', 'user.id is not a number');

  return { user, authDate, queryId: params.get('query_id') ?? undefined };
}

// ── Bot API client (createInvoiceLink for Stars) ─────────────

const BOT_API = 'https://api.telegram.org';

export async function botCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = botTokenOrThrow();
  const res = await fetch(`${BOT_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new TelegramError(`HTTP_${res.status}`, (await res.text().catch(() => '')).slice(0, 400));
  }
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string; error_code?: number };
  if (!data.ok) throw new TelegramError(`API_${data.error_code ?? 'UNKNOWN'}`, data.description ?? `${method} failed`);
  return data.result as T;
}

/**
 * Creates a one-shot Stars invoice link.
 *   prices: list of LabeledPrice — for Stars use currency 'XTR' and amount as integer Stars count.
 *   payload: max 128 chars, opaque — included in successful_payment webhook.
 */
export async function createStarsInvoiceLink(opts: {
  title: string;
  description: string;
  payload: string;
  stars: number;
}): Promise<string> {
  return botCall<string>('createInvoiceLink', {
    title: opts.title.slice(0, 32),
    description: opts.description.slice(0, 255),
    payload: opts.payload.slice(0, 128),
    provider_token: '',                               // Stars: provider_token must be empty
    currency: 'XTR',
    prices: [{ label: opts.title.slice(0, 32), amount: opts.stars }],
  });
}

// ── Star pack catalog ─────────────────────────────────────────
// 1 Star ≈ $0.013 (Telegram pricing varies). 65 Stars ≈ $1 trial.
// Round to ergonomic numbers. Tokens match USDT packs.

export type StarsPackSlug = 'trial' | 'starter' | 'pro' | 'agency';

// Perks/economics mirror cryptobot.ts PACKS (см. docs/UNIT_ECONOMICS.md).
// Trial = аватары + обложка, без премиум-видео.
export const STARS_PACKS: Record<StarsPackSlug, { tokens: number; stars: number; label: string; perks: string; trial?: boolean }> = {
  trial:   { tokens: 43,   stars: 75,   label: 'Trial',   perks: '10 аватаров + обложка', trial: true },
  starter: { tokens: 100,  stars: 650,  label: 'Starter', perks: '1 видео или ~8 батчей аватаров' },
  pro:     { tokens: 400,  stars: 2100, label: 'Pro',     perks: '~4 видео + аватары и обложки' },
  agency:  { tokens: 1200, stars: 5700, label: 'Agency',  perks: '~12 видео — для команды' },
};
