import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
import { dbGetTranscript, dbDeleteTranscript } from '@/lib/transcripts-db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = guardRequest(_req, {
    rateLimit: { key: 'history-item', max: 60, windowMs: 60_000 },
    requireInitData: false,
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

  const row = await dbGetTranscript(params.id)
  if (!row) {
    return NextResponse.json({ error: 'Транскрипт не найден' }, { status: 404 })
  }
  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = guardRequest(_req, {
    rateLimit: { key: 'history-item', max: 60, windowMs: 60_000 },
    requireInitData: false,
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

  const ok = await dbDeleteTranscript(params.id)
  if (!ok) {
    return NextResponse.json({ error: 'Не удалось удалить транскрипт' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
