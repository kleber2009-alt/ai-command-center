import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyTelegramInitData } from './lib/telegram-verify'

// Two gates running in middleware:
//
// 1. HTTP Basic Auth on the private surfaces (/admin, /me, /assistants
//    and their data-plane APIs). /transcribe stays open so the Telegram
//    Mini App works for anonymous users.
//
// 2. Telegram initData verification on the public Mini App APIs
//    (/api/transcribe/*). Opt-in: when TELEGRAM_BOT_TOKEN is set, every
//    request must carry a valid `X-Telegram-Init-Data` header (or a
//    matching Basic Auth, so the owner can still hit the API from a
//    browser). When the token is unset, the gate is bypassed — useful
//    for local dev.
//
// Fail-secure: when env vars are empty, the matched private paths
// return 401 on every request.

const REALM = 'ai-command-center'

const BASIC_AUTH_PATHS = [
  /^\/admin(?:\/|$)/,
  /^\/me(?:\/|$)/,
  /^\/assistants(?:\/|$)/,
  /^\/api\/tasks(?:\/|$)/,
  /^\/api\/me(?:\/|$)/,
  /^\/api\/assistants(?:\/|$)/,
]

const TELEGRAM_PATHS = [/^\/api\/transcribe(?:\/|$)/]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (BASIC_AUTH_PATHS.some((re) => re.test(pathname))) {
    return checkBasicAuth(req)
  }

  if (TELEGRAM_PATHS.some((re) => re.test(pathname))) {
    return checkTelegramOrBasicAuth(req)
  }

  return NextResponse.next()
}

function checkBasicAuth(req: NextRequest): NextResponse {
  const ok = matchBasicAuth(req)
  return ok ? NextResponse.next() : unauthorized()
}

async function checkTelegramOrBasicAuth(req: NextRequest): Promise<NextResponse> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || ''
  if (!botToken) return NextResponse.next() // dev mode — gate disabled

  const initData = req.headers.get('x-telegram-init-data') || ''
  if (initData) {
    const result = await verifyTelegramInitData(initData, botToken)
    if (result.ok) {
      // Surface the verified user id to downstream handlers / logs.
      const res = NextResponse.next()
      res.headers.set('x-telegram-user-id', String(result.userId))
      return res
    }
    // Fall through to Basic Auth on initData failure — lets the owner
    // recover via browser even if the Mini App misbehaves.
  }

  if (matchBasicAuth(req)) return NextResponse.next()
  return new NextResponse('Telegram verification or admin auth required', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
  })
}

function matchBasicAuth(req: NextRequest): boolean {
  const username = process.env.ADMIN_USERNAME || 'admin'
  const password = process.env.ADMIN_PASSWORD || ''
  if (!password) return false

  const header = req.headers.get('authorization') || ''
  if (!header.toLowerCase().startsWith('basic ')) return false

  let decoded: string
  try {
    decoded = atob(header.slice(6).trim())
  } catch {
    return false
  }
  const sep = decoded.indexOf(':')
  if (sep < 0) return false
  const user = decoded.slice(0, sep)
  const pass = decoded.slice(sep + 1)
  return timingSafeEqual(user, username) && timingSafeEqual(pass, password)
}

function unauthorized(): NextResponse {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
  })
}

function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let mismatch = a.length === b.length ? 0 : 1
  for (let i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return mismatch === 0
}

export const config = {
  matcher: [
    '/admin',
    '/admin/:path*',
    '/me',
    '/me/:path*',
    '/assistants',
    '/assistants/:path*',
    '/api/tasks',
    '/api/tasks/:path*',
    '/api/me',
    '/api/me/:path*',
    '/api/assistants',
    '/api/assistants/:path*',
    '/api/transcribe',
    '/api/transcribe/:path*',
  ],
}
