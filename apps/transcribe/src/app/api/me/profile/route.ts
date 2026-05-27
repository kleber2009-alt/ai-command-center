import { NextRequest, NextResponse } from 'next/server'
import { loadProfile, saveProfile } from '@/lib/me-db'
import { authenticate } from '@/lib/telegram-auth'

export async function GET(req: NextRequest) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  try {
    const profile = await loadProfile()
    return NextResponse.json({ profile, configured: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка чтения профиля' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  try {
    const body = (await req.json()) as Record<string, any>
    const updated = await saveProfile({
      bio: String(body.bio ?? ''),
      projects: String(body.projects ?? ''),
      academy: String(body.academy ?? ''),
      social: String(body.social ?? ''),
      voice: String(body.voice ?? ''),
      custom: body.custom && typeof body.custom === 'object' ? body.custom : {},
    })
    return NextResponse.json({ profile: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Не удалось сохранить профиль' }, { status: 500 })
  }
}
