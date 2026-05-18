import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
import { loadProfile, saveProfile, getServerSupabase, EMPTY_PROFILE } from '@/lib/me-db'

export async function GET(req: NextRequest) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'profile', max: 60, windowMs: 60_000 },
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

  const supabase = getServerSupabase()
  if (!supabase) {
    return NextResponse.json({ profile: EMPTY_PROFILE, configured: false })
  }
  const profile = await loadProfile()
  return NextResponse.json({ profile, configured: true })
}

export async function PUT(req: NextRequest) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'profile', max: 60, windowMs: 60_000 },
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

  const supabase = getServerSupabase()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase не настроен. Добавьте NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_KEY и выполните миграцию 003_me.sql.' },
      { status: 500 },
    )
  }
  const body = (await req.json()) as Record<string, any>
  const updated = await saveProfile({
    bio: String(body.bio ?? ''),
    projects: String(body.projects ?? ''),
    academy: String(body.academy ?? ''),
    social: String(body.social ?? ''),
    voice: String(body.voice ?? ''),
    custom: body.custom && typeof body.custom === 'object' ? body.custom : {},
  })
  if (!updated) {
    return NextResponse.json({ error: 'Не удалось сохранить профиль' }, { status: 500 })
  }
  return NextResponse.json({ profile: updated })
}
