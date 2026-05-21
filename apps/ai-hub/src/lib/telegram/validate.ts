// Telegram Mini App initData verification.
// Per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// initData is a URL-encoded query string passed by Telegram when opening
// the Mini App. We verify the HMAC `hash` field against bot token to ensure
// the request really came from Telegram and wasn't forged.

import { createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface TelegramInitData {
  user?: TelegramUser;
  auth_date: number;
  query_id?: string;
  hash: string;
  start_param?: string;
}

export class TelegramValidationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

/**
 * Validate initData query string against bot token.
 * Returns parsed payload (with user) on success, throws on failure.
 *
 * @param initDataRaw — the raw `tgWebAppData` value (URL-encoded query string)
 * @param botToken — bot's TELEGRAM_BOT_TOKEN
 * @param maxAgeSec — reject if auth_date older than this (default 24h)
 */
export function validateInitData(
  initDataRaw: string,
  botToken: string,
  maxAgeSec = 60 * 60 * 24,
): TelegramInitData {
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get("hash");
  if (!hash) throw new TelegramValidationError("NO_HASH", "initData missing hash");

  // Build data-check-string: all params except `hash`, sorted alphabetically
  // by key, joined with `\n` as `key=value` pairs.
  const pairs: string[] = [];
  for (const [k, v] of params.entries()) {
    if (k === "hash") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  // secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
  // (string "WebAppData" is the KEY, bot_token is the MESSAGE — per Telegram docs)
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calcHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (calcHash.length !== hash.length ||
      !timingSafeEqual(Buffer.from(calcHash), Buffer.from(hash))) {
    throw new TelegramValidationError("BAD_HASH", "hash mismatch");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) {
    throw new TelegramValidationError("NO_AUTH_DATE", "auth_date missing or invalid");
  }
  if (Date.now() / 1000 - authDate > maxAgeSec) {
    throw new TelegramValidationError("STALE", `initData older than ${maxAgeSec}s`);
  }

  const userRaw = params.get("user");
  const user: TelegramUser | undefined = userRaw ? JSON.parse(userRaw) : undefined;

  return {
    user,
    auth_date: authDate,
    query_id: params.get("query_id") ?? undefined,
    start_param: params.get("start_param") ?? undefined,
    hash,
  };
}

/** Synthetic email for Telegram-only users — Auth.js requires unique email. */
export function telegramEmail(userId: number): string {
  return `tg-${userId}@aihub.telegram`;
}
