import { NextRequest, NextResponse } from 'next/server'
import { searchMessages, type ChatKind } from '@/lib/chats-db'
import { authenticate } from '@/lib/telegram-auth'

function parseKind(value: string | null): ChatKind | null {
  if (value === 'me' || value === 'assistant') return value
  return null
}

export async function GET(req: NextRequest) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  const url = new URL(req.url)
  const kind = parseKind(url.searchParams.get('kind'))
  const assistantId = url.searchParams.get('assistantId')
  const query = (url.searchParams.get('q') || '').trim()
  if (!kind) return NextResponse.json({ error: 'kind должен быть "me" или "assistant"' }, { status: 400 })
  if (kind === 'assistant' && !assistantId) {
    return NextResponse.json({ error: 'для kind=assistant нужен assistantId' }, { status: 400 })
  }
  if (!query) return NextResponse.json({ hits: [] })
  const hits = searchMessages(auth.user_id, kind, kind === 'assistant' ? assistantId : null, query, 30)
  return NextResponse.json({ hits })
}
