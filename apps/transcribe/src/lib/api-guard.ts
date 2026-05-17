// Single entry-point for "should this request be allowed through?".
// Combines the in-memory rate limiter and optional Telegram initData
// HMAC validation. Routes call guardRequest(req, opts) at the top
// and bail with `result.response` if it's a deny.

import { NextRequest, NextResponse } from 'next/server'

import { ipFromHeaders, rateLimit } from './rate-limit'
import { verifyInitData, type VerifiedInitData } from './telegram-auth'

export interface GuardOptions {
  // Per-IP rate limit. Pass `null` to disable.
  rateLimit: { key: string; max: number; windowMs: number } | null
  // If true, requests without a valid x-telegram-init-data header
  // are rejected with 401. If false, header is verified when
  // present but absence is allowed. Defaults to env-driven —
  // TELEGRAM_REQUIRE_INIT_DATA=true → require.
  requireInitData?: boolean
  // If true, the verified Telegram user.id must match
  // OWNER_TELEGRAM_ID. Implies requireInitData=true regardless
  // of the global flag. Fails closed when bot token or owner id
  // are not configured — non-owner endpoints stay reachable, but
  // owner-only ones return 403 until the deployment is set up.
  ownerOnly?: boolean
}

export type GuardResult =
  | {
      ok: true
      // Set when initData was present AND verified.
      telegram?: VerifiedInitData
    }
  | { ok: false; response: NextResponse }

const INIT_DATA_HEADER = 'x-telegram-init-data'

export function guardRequest(req: NextRequest, options: GuardOptions): GuardResult {
  // 1. Rate limit (skips if options.rateLimit is null).
  if (options.rateLimit) {
    const { key, max, windowMs } = options.rateLimit
    const ip = ipFromHeaders(req.headers)
    const result = rateLimit(`${key}:${ip}`, max, windowMs)
    if (!result.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'rate_limited', retryAfter: result.retryAfter },
          { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
        ),
      }
    }
  }

  // 2. initData. We only verify when the bot token is configured —
  //    otherwise the HMAC algorithm has no secret and validation
  //    can't work. In that case we pass through (no header → no
  //    verification, header → ignored). Exception: ownerOnly
  //    routes require a configured bot token; without it they
  //    return 403, because we have no way to check who is calling.
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const headerInitData = req.headers.get(INIT_DATA_HEADER)
  const requireInitData =
    options.ownerOnly === true ||
    (options.requireInitData ?? process.env.TELEGRAM_REQUIRE_INIT_DATA === 'true')

  if (!botToken) {
    if (options.ownerOnly) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
      }
    }
    // Auth disabled at the deployment level — pass-through.
    return { ok: true }
  }

  let verified: VerifiedInitData | null = null
  if (headerInitData) {
    verified = verifyInitData(headerInitData, botToken)
    if (!verified) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'invalid_init_data' },
          { status: 401 },
        ),
      }
    }
  } else if (requireInitData) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'init_data_required' },
        { status: 401 },
      ),
    }
  }

  // 3. ownerOnly gate. At this point a valid `verified` is in hand
  //    (we've already rejected missing/invalid headers above).
  if (options.ownerOnly) {
    const ownerIdRaw = process.env.OWNER_TELEGRAM_ID
    const ownerId = ownerIdRaw ? parseInt(ownerIdRaw, 10) : NaN
    const userId = verified?.user?.id
    if (!Number.isFinite(ownerId) || !userId || userId !== ownerId) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
      }
    }
  }

  return { ok: true, telegram: verified ?? undefined }
}
