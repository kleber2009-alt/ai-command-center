import { NextResponse } from 'next/server'
import { getTranscriptsDb } from '@/lib/transcripts-db'

export async function GET() {
  const db = getTranscriptsDb()
  if (!db) {
    return NextResponse.json({ items: [], configured: false })
  }
  try {
    const items = await db.listRecent(20)
    return NextResponse.json({ items, configured: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка получения истории' }, { status: 500 })
  }
}
