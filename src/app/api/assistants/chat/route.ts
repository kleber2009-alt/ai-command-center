import { NextRequest, NextResponse } from 'next/server'
import { getAssistant } from '@/data/assistants'
import { streamAnthropic } from '@/lib/anthropic-stream'
import { requireTelegramAuth } from '@/lib/telegram-auth'
import { appendTurn, getSession, replaceLastAssistant } from '@/lib/chats-db'

export const maxDuration = 60

type Msg = { role: 'user' | 'assistant'; content: string }
type Body = { assistantId: string; messages: Msg[]; sessionId?: string; regenerate?: boolean }

export async function POST(req: NextRequest) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate
  const body = (await req.json()) as Body
  const { assistantId, messages, sessionId, regenerate } = body

  if (!assistantId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Нужны поля assistantId и messages[]' }, { status: 400 })
  }
  const assistant = getAssistant(assistantId)
  if (!assistant) {
    return NextResponse.json({ error: `Ассистент не найден: ${assistantId}` }, { status: 404 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не настроен' }, { status: 500 })
  }

  const cleaned = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 50000) }))

  if (cleaned.length === 0 || cleaned[0].role !== 'user') {
    return NextResponse.json({ error: 'Первое сообщение должно быть от пользователя' }, { status: 400 })
  }

  const session = sessionId ? getSession(sessionId) : null
  const validSession =
    session && session.kind === 'assistant' && session.assistant_id === assistantId ? session : null

  return streamAnthropic(
    {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-6',
      system: assistant.systemPrompt,
      messages: cleaned,
    },
    validSession ? { sessionId: validSession.id } : undefined,
    async (fullText) => {
      if (!validSession) return
      if (regenerate) {
        replaceLastAssistant(validSession.id, fullText)
      } else {
        const lastUser = cleaned[cleaned.length - 1].content
        appendTurn({
          sessionId: validSession.id,
          userMessage: lastUser,
          assistantMessage: fullText,
        })
      }
    },
  )
}
