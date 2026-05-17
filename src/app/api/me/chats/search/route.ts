import { NextRequest, NextResponse } from 'next/server'
import { searchMessages, type ChatKind } from '@/lib/chats-db'
import { requireTelegramAuth } from '@/lib/telegram-auth'

function parseKind(value: string | null): ChatKind | null {
  if (value === 'me' || value === 'assistant') return value
  return null
}

export async function GET(req: NextRequest) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate
  const url = new URL(req.url)
  const kind = parseKind(url.searchParams.get('kind'))
  const assistantId = url.searchParams.get('assistantId')
  const query = (url.searchParams.get('q') || '').trim()
  if (!kind) return NextResponse.json({ error: 'kind должен быть "me" или "assistant"' }, { status: 400 })
  if (kind === 'assistant' && !assistantId) {
    return NextResponse.json({ error: 'для kind=assistant нужен assistantId' }, { status: 400 })
  }
  if (!query) return NextResponse.json({ hits: [] })
  const hits = searchMessages(kind, kind === 'assistant' ? assistantId : null, query, 30)
  return NextResponse.json({ hits })
}
