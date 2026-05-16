import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// HTTP Basic Auth for private surfaces. Public Mini App entry points
// (/transcribe and /api/transcribe/*) are excluded via the matcher
// below — they need to work for anonymous Telegram users.
//
// When ADMIN_PASSWORD is empty, the middleware returns 401 on every
// matched request — fail-secure default.

const REALM = 'ai-command-center admin'

export function middleware(req: NextRequest) {
  const username = process.env.ADMIN_USERNAME || 'admin'
  const password = process.env.ADMIN_PASSWORD || ''

  if (!password) {
    return unauthorized('ADMIN_PASSWORD is not set on the server')
  }

  const header = req.headers.get('authorization') || ''
  if (!header.toLowerCase().startsWith('basic ')) {
    return unauthorized()
  }

  let decoded: string
  try {
    decoded = atob(header.slice(6).trim())
  } catch {
    return unauthorized()
  }

  const sep = decoded.indexOf(':')
  if (sep < 0) return unauthorized()
  const user = decoded.slice(0, sep)
  const pass = decoded.slice(sep + 1)

  if (!timingSafeEqual(user, username) || !timingSafeEqual(pass, password)) {
    return unauthorized()
  }

  return NextResponse.next()
}

function unauthorized(message = 'Authentication required') {
  return new NextResponse(message, {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
  })
}

// Constant-time string comparison to avoid leaking length / prefix
// info via timing. Inputs are normalized to equal length first.
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
  ],
}
