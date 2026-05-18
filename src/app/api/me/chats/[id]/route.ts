import { NextRequest, NextResponse } from 'next/server'
import { deleteSession, getSession, listMessages, renameSession, setSessionPinned } from '@/lib/chats-db'
import { authenticate } from '@/lib/telegram-auth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  const session = getSession(params.id, auth.user_id)
  if (!session) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  const messages = listMessages(session.id, auth.user_id).map((m) => ({ role: m.role, content: m.content }))
  return NextResponse.json({ session, messages })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  const body = (await req.json().catch(() => ({}))) as { title?: string; pinned?: boolean }
  const title = typeof body.title === 'string' ? body.title.trim() : undefined
  const pinned = typeof body.pinned === 'boolean' ? body.pinned : undefined

  if (title === undefined && pinned === undefined) {
    return NextResponse.json({ error: 'Передай title или pinned' }, { status: 400 })
  }

  if (title !== undefined) {
    if (!title) return NextResponse.json({ error: 'Нужно непустое title' }, { status: 400 })
    const ok = renameSession(params.id, auth.user_id, title)
    if (!ok) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  }
  if (pinned !== undefined) {
    const ok = setSessionPinned(params.id, auth.user_id, pinned)
    if (!ok) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  }

  const session = getSession(params.id, auth.user_id)
  return NextResponse.json({ session })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  const ok = deleteSession(params.id, auth.user_id)
  if (!ok) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
