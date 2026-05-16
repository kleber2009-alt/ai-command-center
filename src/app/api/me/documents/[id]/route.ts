import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured, query, queryOne } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'DATABASE_URL не настроен' }, { status: 500 })
  try {
    const row = await queryOne(`select * from me_documents where id = $1`, [params.id])
    if (!row) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
    return NextResponse.json({ document: row })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка БД' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'DATABASE_URL не настроен' }, { status: 500 })
  try {
    await query(`delete from me_documents where id = $1`, [params.id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка БД' }, { status: 500 })
  }
}
