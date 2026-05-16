import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sql = getDb()
  if (!sql) return NextResponse.json({ error: 'Postgres не настроен' }, { status: 500 })
  try {
    const rows = await sql`select * from me_documents where id = ${params.id}`
    if (rows.length === 0) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
    return NextResponse.json({ document: rows[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const sql = getDb()
  if (!sql) return NextResponse.json({ error: 'Postgres не настроен' }, { status: 500 })
  try {
    await sql`delete from me_documents where id = ${params.id}`
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
