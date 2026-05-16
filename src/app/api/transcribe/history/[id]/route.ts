import { NextRequest, NextResponse } from 'next/server'
import { getTranscriptsDb } from '@/lib/transcripts-db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getTranscriptsDb()
  if (!db) {
    return NextResponse.json({ error: 'База не настроена (DATABASE_URL отсутствует)' }, { status: 503 })
  }
  const row = await db.getById(params.id)
  if (!row) {
    return NextResponse.json({ error: 'Транскрипт не найден' }, { status: 404 })
  }
  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getTranscriptsDb()
  if (!db) {
    return NextResponse.json({ error: 'База не настроена (DATABASE_URL отсутствует)' }, { status: 503 })
  }
  const deleted = await db.deleteById(params.id)
  if (!deleted) {
    return NextResponse.json({ error: 'Транскрипт не найден' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
