import { NextRequest, NextResponse } from 'next/server'
import { verifyTelegramInitData, TelegramUser } from './telegram-auth'
import { checkRateLimit } from './rate-limit'

export type GuardContext = { caller: string; tgUser?: TelegramUser }

const DEFAULT_MAX = 8
const DEFAULT_WINDOW_MS = 60_000

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

export function guardRequest(
  req: NextRequest,
  opts: { max?: number; windowMs?: number } = {},
): { ok: true; ctx: GuardContext } | { ok: false; res: NextResponse } {
  const max = opts.max ?? DEFAULT_MAX
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const requireTg = process.env.TELEGRAM_REQUIRE_INIT_DATA === 'true'
  const initData = req.headers.get('x-telegram-init-data') || ''

  let tgUser: TelegramUser | undefined
  if (botToken && initData) {
    const result = verifyTelegramInitData(initData, botToken)
    if (!result.ok) {
      return {
        ok: false,
        res: NextResponse.json({ error: `tg auth: ${result.reason}` }, { status: 401 }),
      }
    }
    tgUser = result.user
  } else if (requireTg) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'telegram init data required' }, { status: 401 }),
    }
  }

  const caller = tgUser ? `tg:${tgUser.id}` : `ip:${clientIp(req)}`
  const rl = checkRateLimit(caller, max, windowMs)
  if (!rl.ok) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'rate limit exceeded', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      ),
    }
  }
  return { ok: true, ctx: { caller, tgUser } }
}
