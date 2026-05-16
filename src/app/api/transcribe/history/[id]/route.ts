import { NextRequest, NextResponse } from 'next/server'
import { query, isConfigured } from '@/lib/transcripts-db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'База данных не настроена' }, { status: 503 })
  }
  try {
    const res = await query(`select * from transcripts where id = $1`, [params.id])
    const row = res?.rows[0]
    if (!row) {
      return NextResponse.json({ error: 'Транскрипт не найден' }, { status: 404 })
    }
    return NextResponse.json(row)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка чтения' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'База данных не настроена' }, { status: 503 })
  }
  try {
    await query(`delete from transcripts where id = $1`, [params.id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка удаления' }, { status: 500 })
  }
}
