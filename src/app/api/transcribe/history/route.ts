import { NextRequest, NextResponse } from 'next/server'
import { listTranscripts } from '@/lib/transcripts-db'
import { requireTelegramAuth } from '@/lib/telegram-auth'

export async function GET(req: NextRequest) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate
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
