import { NextRequest, NextResponse } from 'next/server'

const AGENT_PROMPTS: Record<string, string> = {
  analyst: 'Ты Data Analyst AI-команды. Проанализируй ситуацию: 3 пользователя, 0 платных, 0% конверсия, цель 4%. Дай 2 конкретные задачи для роста метрик. JSON: [{text, impact}]',
  cfo: 'Ты CFO AI-команды. MRR=$0, цель $10M/мес в рублях. Дай 2 финансовых действия на сегодня. JSON: [{text, impact}]',
  cmo: 'Ты CMO AI-команды. Нужно привлечь первых платных пользователей в AI Mastery Platform. Дай 2 маркетинговых задачи. JSON: [{text, impact}]',
  cs: 'Ты Customer Success Manager AI-команды. 3 пользователя, 0 платных, 0% completion rate. Дай 2 задачи для удержания. JSON: [{text, impact}]',
  ceo: 'Ты CEO AI-команды. Дай 2 стратегических приоритета на сегодня для AI Mastery Platform. JSON: [{text, impact}]',
}

type Task = { text: string; impact: string }

function extractJsonArray(text: string): Task[] {
  const fenceStripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
  const start = fenceStripped.indexOf('[')
  const end = fenceStripped.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON array found in response')
  }
  const slice = fenceStripped.slice(start, end + 1)
  const parsed = JSON.parse(slice)
  if (!Array.isArray(parsed)) throw new Error('Parsed value is not an array')
  return parsed
    .filter((t: any) => t && typeof t.text === 'string')
    .map((t: any) => ({ text: t.text, impact: typeof t.impact === 'string' ? t.impact : '—' }))
}

export async function POST(req: NextRequest) {
  const { agentId } = await req.json()

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      tasks: [{ text: 'ANTHROPIC_API_KEY не настроен на сервере', impact: '—' }],
    })
  }

  const prompt = AGENT_PROMPTS[agentId] || 'Дай 2 задачи для бизнеса. JSON: [{text, impact}]'

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
        max_tokens: 800,
        messages: [
          {
            role: 'user',
            content: prompt + ' Отвечай ТОЛЬКО валидным JSON массивом, без markdown-обёртки и без комментариев.',
          },
        ],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.warn(`[/api/command] Anthropic ${res.status}: ${errText.slice(0, 300)}`)
      return NextResponse.json({
        tasks: [{ text: `Anthropic ${res.status}: ${errText.slice(0, 100)}`, impact: '—' }],
      })
    }

    const data = await res.json()
    const text = data.content?.[0]?.text ?? ''
    if (!text) {
      console.warn('[/api/command] Empty content:', JSON.stringify(data).slice(0, 300))
      return NextResponse.json({ tasks: [{ text: 'Пустой ответ от Anthropic', impact: '—' }] })
    }

    try {
      const tasks = extractJsonArray(text)
      return NextResponse.json({ tasks })
    } catch (parseErr: any) {
      console.warn(`[/api/command] parse failed: ${parseErr.message}. Raw text:`, text.slice(0, 300))
      return NextResponse.json({
        tasks: [{ text: `Не удалось распарсить ответ: ${parseErr.message}`, impact: '—' }],
      })
    }
  } catch (e: any) {
    console.warn(`[/api/command] fetch failed: ${e?.message}`)
    return NextResponse.json({
      tasks: [{ text: `Ошибка сети: ${e?.message ?? 'unknown'}`, impact: '—' }],
    })
  }
}
