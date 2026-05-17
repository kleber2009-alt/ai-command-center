import { NextRequest, NextResponse } from 'next/server'
import { embed } from '@/lib/embeddings'
import { searchChunks } from '@/lib/me-db'
import { requireTelegramAuth } from '@/lib/telegram-auth'

type Body = { query?: string; topK?: number }

export async function POST(req: NextRequest) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate

  const body = (await req.json().catch(() => ({}))) as Body
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  const topK = Math.max(1, Math.min(50, body.topK ?? 20))

  if (!query) return NextResponse.json({ matches: [] })
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY не настроен' }, { status: 500 })
  }

  try {
    const vec = await embed(query)
    const matches = searchChunks(vec, topK).filter((m) => m.similarity > 0.18)
    return NextResponse.json({ matches })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка поиска' }, { status: 500 })
  }
}
