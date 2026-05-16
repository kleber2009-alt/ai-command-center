import { NextRequest, NextResponse } from 'next/server'
import { query, isConfigured } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isConfigured()) return NextResponse.json({ error: 'База данных не настроена' }, { status: 500 })
  try {
    const res = await query(`select * from me_documents where id = $1`, [params.id])
    const row = res?.rows[0]
    if (!row) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
    return NextResponse.json({ document: row })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка чтения' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isConfigured()) return NextResponse.json({ error: 'База данных не настроена' }, { status: 500 })
  try {
    // Каскад на me_chunks через FK on delete cascade.
    await query(`delete from me_documents where id = $1`, [params.id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка удаления' }, { status: 500 })
  }
}
