import { NextRequest, NextResponse } from 'next/server'
import { loadProfile, saveProfile } from '@/lib/me-db'
import { requireTelegramAuth } from '@/lib/telegram-auth'

export async function GET(req: NextRequest) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate
  try {
    return NextResponse.json({ profile: loadProfile(), configured: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка чтения профиля' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate
  try {
    const body = (await req.json()) as Record<string, any>
    const projectsList = Array.isArray(body.projects_list)
      ? body.projects_list
          .filter((p: any) => p && typeof p === 'object')
          .map((p: any) => ({
            id: typeof p.id === 'string' && p.id ? p.id : String(Math.random()).slice(2),
            name: String(p.name ?? ''),
            description: String(p.description ?? ''),
            stage: String(p.stage ?? ''),
            metrics: String(p.metrics ?? ''),
          }))
      : []
    const updated = saveProfile({
      bio: String(body.bio ?? ''),
      projects: String(body.projects ?? ''),
      projects_list: projectsList,
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
