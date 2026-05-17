import { NextRequest, NextResponse } from 'next/server'
import { createSession, listSessions, type ChatKind } from '@/lib/chats-db'
import { getAssistant } from '@/data/assistants'
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
  if (!kind) return NextResponse.json({ error: 'kind должен быть "me" или "assistant"' }, { status: 400 })
  if (kind === 'assistant' && !assistantId) {
    return NextResponse.json({ error: 'для kind=assistant нужен assistantId' }, { status: 400 })
  }
  const items = listSessions(kind, kind === 'assistant' ? assistantId : null, 30)
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate
  const body = (await req.json().catch(() => ({}))) as {
    kind?: string
    assistantId?: string
    docIds?: number[]
  }
  const kind = parseKind(body.kind ?? null)
  if (!kind) return NextResponse.json({ error: 'kind должен быть "me" или "assistant"' }, { status: 400 })

  let assistantId: string | null = null
  if (kind === 'assistant') {
    if (!body.assistantId) {
      return NextResponse.json({ error: 'для kind=assistant нужен assistantId' }, { status: 400 })
    }
    if (!getAssistant(body.assistantId)) {
      return NextResponse.json({ error: `Ассистент не найден: ${body.assistantId}` }, { status: 404 })
    }
    assistantId = body.assistantId
  }

  const docIds =
    kind === 'me' && Array.isArray(body.docIds)
      ? body.docIds.filter((n) => Number.isInteger(n))
      : null

  const session = createSession(kind, assistantId, docIds)
  return NextResponse.json({ session })
}
