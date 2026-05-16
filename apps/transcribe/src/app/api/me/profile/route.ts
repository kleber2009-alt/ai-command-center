import { NextRequest, NextResponse } from 'next/server'
import { loadProfile, saveProfile, EMPTY_PROFILE } from '@/lib/me-db'
import { getDb } from '@/lib/db'

export async function GET() {
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ profile: EMPTY_PROFILE, configured: false })
  }
  const profile = await loadProfile()
  return NextResponse.json({ profile, configured: true })
}

export async function PUT(req: NextRequest) {
  const sql = getDb()
  if (!sql) {
    return NextResponse.json(
      { error: 'Postgres не настроен. Установите DATABASE_URL и накатите db/init.sql.' },
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
