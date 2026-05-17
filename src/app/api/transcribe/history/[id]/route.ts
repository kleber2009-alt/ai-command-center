import { NextRequest, NextResponse } from 'next/server'
import { getTranscript, deleteTranscript } from '@/lib/transcripts-db'
import { requireTelegramAuth } from '@/lib/telegram-auth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate
  const row = getTranscript(params.id)
  if (!row) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  return NextResponse.json(row)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate
  const ok = deleteTranscript(params.id)
  if (!ok) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
