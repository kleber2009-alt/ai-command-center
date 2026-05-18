import { NextRequest, NextResponse } from 'next/server'
import { getTranscript, deleteTranscript } from '@/lib/transcripts-db'
import { authenticate } from '@/lib/telegram-auth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  const row = getTranscript(params.id, auth.user_id)
  if (!row) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  return NextResponse.json(row)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  const ok = deleteTranscript(params.id, auth.user_id)
  if (!ok) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
