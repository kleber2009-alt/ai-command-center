import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
import { getAssistant } from '@/data/assistants'
import { streamAnthropic } from '@/lib/anthropic-stream'

export const maxDuration = 60

type Msg = { role: 'user' | 'assistant'; content: string }
type Body = { assistantId: string; messages: Msg[] }

export async function POST(req: NextRequest) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'assistants-chat', max: 20, windowMs: 60_000 },
  })
  if (!guard.ok) return guard.response

  const { assistantId, messages } = (await req.json()) as Body

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

  return streamAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-6',
    system: assistant.systemPrompt,
    messages: cleaned,
  })
}
