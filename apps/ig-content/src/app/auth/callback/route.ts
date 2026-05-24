import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Auth callback handles two flows:
//   1) ?code=...                            — OAuth / PKCE exchange.
//   2) ?token_hash=...&type=magiclink|...   — server-side OTP verification.
// The second form lets us deliver magic links pointing at THIS app's domain
// even when the Supabase project's Site URL hasn't been configured yet.
//
// `origin` from `new URL(request.url)` resolves to the container's bind address
// (e.g. https://0.0.0.0:3010) behind Caddy, so we prefer the public origin from
// NEXT_PUBLIC_SITE_URL with x-forwarded-host as a fallback.
function publicOrigin(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')

  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (host) return `${proto}://${host}`

  return new URL(request.url).origin
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/dashboard'
  const origin = publicOrigin(request)

  const supabase = createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login`)
}
