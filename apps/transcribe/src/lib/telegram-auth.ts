// HMAC verification of a Telegram Mini App `initData` payload.
// Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

import { createHash, createHmac, timingSafeEqual } from 'crypto'

export type TelegramUser = {
  id: number
  username?: string
  first_name?: string
  last_name?: string
}

export type TelegramAuthResult =
  | { ok: true; user: TelegramUser | null }
  | { ok: false; reason: string }

/**
 * Verify a raw Telegram Mini App initData string against the bot token.
 * Returns the parsed Telegram user when valid, or an error reason.
 */
export function verifyTelegramInitData(initData: string, botToken: string): TelegramAuthResult {
  if (!initData) return { ok: false, reason: 'empty initData' }
  if (!botToken) return { ok: false, reason: 'TELEGRAM_BOT_TOKEN not set' }

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return { ok: false, reason: 'no hash in initData' }
  params.delete('hash')

  const dataCheckString = Array.from(params.entries())
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')

  // Telegram uses HMAC_SHA256 with key = HMAC_SHA256("WebAppData", botToken).
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex')

  if (
    expected.length !== hash.length ||
    !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(hash, 'hex'))
  ) {
    return { ok: false, reason: 'hash mismatch' }
  }

  // Reject stale payloads (older than 24h).
  const authDate = Number(params.get('auth_date') || 0)
  if (authDate && Date.now() / 1000 - authDate > 86400) {
    return { ok: false, reason: 'initData expired' }
  }

  let user: TelegramUser | null = null
  try {
    const rawUser = params.get('user')
    if (rawUser) user = JSON.parse(rawUser) as TelegramUser
  } catch {
    // ignore parse errors; verified payload without user is still valid for service auth
  }
  return { ok: true, user }
}

// Compat aliases for code that still references the legacy names.
// Returns the parsed user-object on success, null on failure — matches
// what api-guard.ts expects.
export type VerifiedInitData = { user: TelegramUser; auth_date: number }
export function verifyInitData(initData: string, botToken: string): VerifiedInitData | null {
  const r = verifyTelegramInitData(initData, botToken)
  if (!r.ok || !r.user) return null
  return { user: r.user, auth_date: 0 }
}

import { NextRequest, NextResponse } from 'next/server'

/**
 * Returns null on success or a 401 Response on failure. Kept for
 * backwards compatibility; new code should use authenticate() which
 * also returns the resolved user_id.
 */
export function requireTelegramAuth(req: NextRequest): Response | null {
  const a = authenticate(req)
  return 'error' in a ? a.error : null
}

export type Authenticated = { user_id: string; via: 'telegram' | 'header' | 'default' }
export type AuthResult = Authenticated | { error: Response }

/**
 * Resolve the caller's user_id from one of three sources, in order:
 *
 * 1. `X-Auth-User` header — set by a trusted reverse-proxy after it
 *    enforced basic-auth (we trust upstream headers because Next.js
 *    binds to 127.0.0.1 in production and only the proxy can reach it).
 *    Yields `auth:<sanitised-name>`.
 * 2. Verified Telegram `Authorization: tma <initData>` — yields
 *    `tg:<telegram-user-id>`. Required when `TELEGRAM_BOT_TOKEN` is set
 *    and no proxy header is present.
 * 3. Fully open mode (no bot token, no header) — yields `default`. Used
 *    only in local dev / single-tenant deploys.
 *
 * The user_id is the multi-tenant key for every content table; rows
 * created under one source are isolated from rows under another.
 */
export function authenticate(req: NextRequest): AuthResult {
  const headerUser = req.headers.get('x-auth-user')?.trim()
  if (headerUser) {
    const sanitised = headerUser.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)
    if (sanitised) return { user_id: `auth:${sanitised}`, via: 'header' }
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (botToken) {
    const auth = req.headers.get('authorization') || ''
    const initData = auth.startsWith('tma ') ? auth.slice(4) : ''
    const result = verifyTelegramInitData(initData, botToken)
    if (result.ok && result.user?.id) {
      return { user_id: `tg:${result.user.id}`, via: 'telegram' }
    }
    return {
      error: NextResponse.json(
        { error: `Доступ только из Telegram (${result.ok ? 'no user in initData' : result.reason})` },
        { status: 401 },
      ),
    }
  }

  return { user_id: 'default', via: 'default' }
}
