import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured, query, queryOne } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'DATABASE_URL не настроен' }, { status: 503 })
  }
  try {
    const row = await queryOne(
      `select * from transcripts where id = $1`,
      [params.id],
    )
    if (!row) return NextResponse.json({ error: 'Не найден' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка БД' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'DATABASE_URL не настроен' }, { status: 503 })
  }
  try {
    await query(`delete from transcripts where id = $1`, [params.id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка БД' }, { status: 500 })
  }
}
