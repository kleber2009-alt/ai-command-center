import { NextRequest, NextResponse } from 'next/server'
import { loadProfile, saveProfile } from '@/lib/me-db'

export async function GET() {
  try {
    return NextResponse.json({ profile: loadProfile(), configured: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка чтения профиля' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, any>
    const updated = saveProfile({
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
