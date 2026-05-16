import { NextRequest, NextResponse } from 'next/server'
import { loadProfile, saveProfile, EMPTY_PROFILE } from '@/lib/me-db'
import { isDbConfigured } from '@/lib/db'

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ profile: EMPTY_PROFILE, configured: false })
  }
  const profile = await loadProfile()
  return NextResponse.json({ profile, configured: true })
}

export async function PUT(req: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: 'DATABASE_URL не настроен. Поднимите Postgres и выполните миграцию 003_me.sql.' },
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
