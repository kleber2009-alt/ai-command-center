import { NextRequest, NextResponse } from 'next/server'
import { verifyBasicAuth, verifyTelegramInitData } from '@/lib/auth'

// Two layers of protection:
//
//   /admin/* and /api/tasks/*   → HTTP Basic Auth using ADMIN_BASIC_AUTH
//                                  ("user:password"). Browser prompts.
//
//   /api/transcribe/* and /api/me/*
//                                → Telegram initData HMAC check using
//                                  TELEGRAM_BOT_TOKEN. Client sends the
//                                  raw initData in the `tg_init_data` cookie
//                                  (set by TelegramInit) or in the
//                                  `X-Telegram-Init-Data` header.
//
// Both checks are opt-in: if the relevant env var isn't set, the
// corresponding paths are open. This keeps local dev frictionless.

const ADMIN_PATHS = [/^\/admin(\/|$)/, /^\/api\/tasks(\/|$)/]
const TG_PATHS = [/^\/api\/transcribe(\/|$)/, /^\/api\/me(\/|$)/]

function matches(pathname: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(pathname))
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // --- /admin & /api/tasks: HTTP Basic Auth ----------------------------
  if (matches(pathname, ADMIN_PATHS)) {
    const expected = process.env.ADMIN_BASIC_AUTH
    if (expected) {
      const ok = verifyBasicAuth(req.headers.get('authorization'), expected)
      if (!ok) {
        return new NextResponse('Authentication required', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="ai-command-center"',
            'Content-Type': 'text/plain; charset=utf-8',
          },
        })
      }
    }
    return NextResponse.next()
  }

  // --- /api/transcribe & /api/me: Telegram initData verification -------
  if (matches(pathname, TG_PATHS)) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (botToken) {
      const initData =
        req.headers.get('x-telegram-init-data') ?? req.cookies.get('tg_init_data')?.value ?? null
      const result = await verifyTelegramInitData(initData, botToken)
      if (!result.ok) {
        return NextResponse.json(
          { error: `Telegram auth failed: ${result.reason}` },
          { status: 401 },
        )
      }
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

// Run only on the paths we actually want to protect. Anything not listed
// here skips the middleware entirely (faster, no overhead on static pages).
export const config = {
  matcher: ['/admin/:path*', '/api/tasks/:path*', '/api/transcribe/:path*', '/api/me/:path*'],
}
