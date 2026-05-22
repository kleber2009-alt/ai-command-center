import { NextRequest, NextResponse } from 'next/server'
import { listTranscripts } from '@/lib/transcripts-db'
import { authenticate } from '@/lib/telegram-auth'

export async function GET(req: NextRequest) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  try {
    const items = listTranscripts(auth.user_id, 20)
    return NextResponse.json({ items, configured: true })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Ошибка получения истории' },
      { status: 500 },
    )
  }
}
