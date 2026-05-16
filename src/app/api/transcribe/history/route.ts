import { NextResponse } from 'next/server'
import { listTranscripts } from '@/lib/transcripts-db'

export async function GET() {
  try {
    const items = listTranscripts(20)
    return NextResponse.json({ items, configured: true })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Ошибка получения истории' },
      { status: 500 },
    )
  }
}
