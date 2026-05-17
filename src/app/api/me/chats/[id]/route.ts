import { NextRequest, NextResponse } from 'next/server'
import { deleteSession, getSession, listMessages, renameSession } from '@/lib/chats-db'
import { requireTelegramAuth } from '@/lib/telegram-auth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate
  const session = getSession(params.id)
  if (!session) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  const messages = listMessages(session.id).map((m) => ({ role: m.role, content: m.content }))
  return NextResponse.json({ session, messages })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate
  const body = (await req.json().catch(() => ({}))) as { title?: string }
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'Нужно непустое title' }, { status: 400 })
  const ok = renameSession(params.id, title)
  if (!ok) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  const session = getSession(params.id)
  return NextResponse.json({ session })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate
  const ok = deleteSession(params.id)
  if (!ok) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
