import { NextRequest, NextResponse } from 'next/server'
import { getTranscript, deleteTranscript } from '@/lib/transcripts-db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const row = getTranscript(params.id)
  if (!row) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = deleteTranscript(params.id)
  if (!ok) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
