import { NextRequest, NextResponse } from 'next/server'
import { requireTelegramAuth } from '@/lib/telegram-auth'

export const maxDuration = 30

type Msg = { role: 'user' | 'assistant'; content: string }
type Body = { messages: Msg[] }

const PROMPT = `Ниже — фрагмент диалога пользователя со «вторым мозгом». Сгенерируй ровно 3 КОРОТКИХ следующих вопроса, которые логично задать дальше: они должны углублять тему, проверять гипотезу или раскрывать соседний аспект. Каждый — одной строкой, до 80 символов, без нумерации и кавычек.

ОТВЕЧАЙ ТОЛЬКО JSON, без markdown:
{"questions": ["...", "...", "..."]}`

export async function POST(req: NextRequest) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate

  const body = (await req.json().catch(() => ({}))) as Body
  const messages = Array.isArray(body.messages) ? body.messages : []
  if (messages.length < 2) return NextResponse.json({ questions: [] })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ questions: [] })
  }

  // Take only the last few turns to keep the call cheap and focused.
  const recent = messages
    .slice(-6)
    .filter((m) => typeof m?.content === 'string' && m.content.trim().length > 0)
    .map((m) => `${m.role === 'user' ? 'Пользователь' : 'Ассистент'}: ${m.content.slice(0, 2000)}`)
    .join('\n\n')

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: PROMPT + '\n\nДиалог:\n' + recent }],
      }),
    })

    if (!res.ok) {
      return NextResponse.json({ questions: [] })
    }
    const data = await res.json()
    const raw = String(data.content?.[0]?.text || '').trim()
    const cleaned = raw.replace(/```json?|```/g, '').trim()
    try {
      const parsed = JSON.parse(cleaned)
      const qs = Array.isArray(parsed?.questions) ? parsed.questions : []
      const filtered: string[] = qs
        .map((q: any) => String(q || '').trim())
        .filter((q: string) => q.length > 0 && q.length <= 140)
        .slice(0, 3)
      return NextResponse.json({ questions: filtered })
    } catch {
      return NextResponse.json({ questions: [] })
    }
  } catch (e: any) {
    return NextResponse.json({ questions: [] })
  }
}
