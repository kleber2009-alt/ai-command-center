// Single entry-point for "should this request be allowed through?".
// Combines the in-memory rate limiter and optional Telegram initData
// HMAC validation. Routes call guardRequest(req, opts) at the top
// and bail with `result.response` if it's a deny.
//
// guardWithUser() is the async extension that additionally resolves
// the Telegram user to an app user row and loads their quota.

import { NextRequest, NextResponse } from 'next/server'

import { ipFromHeaders, rateLimit } from './rate-limit'
import { verifyInitData, type VerifiedInitData } from './telegram-auth'
import { getOrCreateUser, getQuota, type AppUser, type QuotaInfo, type UserTier } from './users-db'

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
  // Dev escape hatch: set DEV_BYPASS_AUTH=true in .env to disable all auth
  // checks. Never enable in production.
  if (process.env.DEV_BYPASS_AUTH === 'true') {
    return { ok: true }
  }

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
  // Single-tenant mode: ownerOnly routes no longer force `requireInitData`,
  // because the ownerOnly gate below falls back to OWNER_TELEGRAM_ID when
  // initData is missing. Strict caller can still opt in via the explicit
  // `requireInitData: true` option.
  const requireInitData =
    options.requireInitData ?? process.env.TELEGRAM_REQUIRE_INIT_DATA === 'true'

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

  // 3. ownerOnly gate.
  //    - With verified initData: user.id must match OWNER_TELEGRAM_ID.
  //    - With trusted proxy header X-Auth-User (only set by Caddy after
  //      basic-auth on the admin-facing subdomain): pass through.
  //    - Otherwise: 403. Owner-only endpoints must NOT pass through
  //      to anonymous callers on the public TMA subdomain.
  //    - OWNER_TELEGRAM_ID not configured → 403 (closed by default).
  if (options.ownerOnly) {
    const ownerIdRaw = process.env.OWNER_TELEGRAM_ID
    const ownerId = ownerIdRaw ? parseInt(ownerIdRaw, 10) : NaN
    if (!Number.isFinite(ownerId)) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
      }
    }
    const userId = verified?.user?.id
    const proxyUser = req.headers.get('x-auth-user')?.trim()
    const verifiedAsOwner = userId === ownerId
    const verifiedAsProxy = Boolean(proxyUser)
    if (!verifiedAsOwner && !verifiedAsProxy) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
      }
    }
  }

  return { ok: true, telegram: verified ?? undefined }
}

// ---------------------------------------------------------------------------
// guardWithUser — async guard that resolves Telegram identity to an app user
// and loads the current quota. Use for endpoints that need billing/quotas.
// ---------------------------------------------------------------------------

export type GuardWithUserResult =
  | { ok: true; telegram: VerifiedInitData; user: AppUser; quota: QuotaInfo }
  | { ok: false; response: NextResponse }

export async function guardWithUser(
  req: NextRequest,
  options: { rateLimit: GuardOptions['rateLimit'] },
): Promise<GuardWithUserResult> {
  // Dev bypass — skip DB entirely; quota is unlimited in dev mode
  if (process.env.DEV_BYPASS_AUTH === 'true') {
    const devUser: AppUser = {
      id: 'dev',
      telegram_id: 0,
      username: 'dev',
      first_name: 'Dev',
      subscription_tier: 'pro',
      subscription_expires_at: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
    }
    const devQuota: QuotaInfo = { minutes_used: 0, minutes_limit: -1, resets_at: '' }
    const devTelegram: VerifiedInitData = { user: { id: 0, first_name: 'Dev' }, auth_date: 0 }
    return { ok: true, telegram: devTelegram, user: devUser, quota: devQuota }
  }

  // Single-tenant deployment: this transcribe app is owned by the
  // OWNER_TELEGRAM_ID user, so when initData isn't available (e.g.
  // the app is opened in a regular browser, not via Telegram WebApp)
  // we attribute the request to the owner. If multi-tenant is needed
  // later, restore `requireInitData: true` and remove the fallback.
  const base = guardRequest(req, { ...options, requireInitData: false })
  if (!base.ok) return base

  let tgUser = base.telegram?.user
  if (!tgUser?.id) {
    const ownerIdRaw = process.env.OWNER_TELEGRAM_ID
    const ownerId = ownerIdRaw ? parseInt(ownerIdRaw, 10) : NaN
    if (Number.isFinite(ownerId)) {
      tgUser = { id: ownerId, first_name: 'Owner' }
    }
  }
  if (!tgUser?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'telegram_user_required' }, { status: 401 }),
    }
  }

  const user = await getOrCreateUser({
    id: tgUser.id,
    username: tgUser.username,
    first_name: tgUser.first_name,
  })
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'user_init_failed' }, { status: 500 }),
    }
  }

  const quota = await getQuota(user.id, user.subscription_tier as UserTier)
  if (!quota) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'quota_load_failed' }, { status: 500 }),
    }
  }

  return { ok: true, telegram: base.telegram!, user, quota }
}
