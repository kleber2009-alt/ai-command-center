import { NextRequest, NextResponse } from 'next/server'
import { getAssistant } from '@/data/assistants'

export const maxDuration = 60

type Msg = { role: 'user' | 'assistant'; content: string }
type Body = { assistantId: string; messages: Msg[] }

export async function POST(req: NextRequest) {
  const { assistantId, messages } = (await req.json()) as Body

  if (!assistantId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: 'Нужны поля assistantId и messages[]' },
      { status: 400 },
    )
  }

  const assistant = getAssistant(assistantId)
  if (!assistant) {
    return NextResponse.json({ error: `Ассистент не найден: ${assistantId}` }, { status: 404 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не настроен на сервере' }, { status: 500 })
  }

  const cleaned = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 50000) }))

  if (cleaned.length === 0 || cleaned[0].role !== 'user') {
    return NextResponse.json({ error: 'Первое сообщение должно быть от пользователя' }, { status: 400 })
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: assistant.systemPrompt,
        messages: cleaned,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json(
        { error: `Anthropic (${res.status}): ${errText.slice(0, 300)}` },
        { status: res.status },
      )
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    if (!text) {
      return NextResponse.json({ error: 'Пустой ответ от модели' }, { status: 500 })
    }

    return NextResponse.json({ text })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка генерации' }, { status: 500 })
  }
}
