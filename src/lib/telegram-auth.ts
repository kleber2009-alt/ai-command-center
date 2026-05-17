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

/** Convenience guard for API routes. Returns null on success or a Response on failure. */
import { NextRequest, NextResponse } from 'next/server'

export function requireTelegramAuth(req: NextRequest): Response | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  // When no bot token is configured the gate is disabled (open access, suitable for local dev).
  if (!botToken) return null

  const auth = req.headers.get('authorization') || ''
  const initData = auth.startsWith('tma ') ? auth.slice(4) : ''
  const result = verifyTelegramInitData(initData, botToken)
  if (result.ok) return null
  return NextResponse.json(
    { error: `Доступ только из Telegram (${result.reason})` },
    { status: 401 },
  )
}
