import { NextRequest, NextResponse } from 'next/server'

const AGENT_PROMPTS: Record<string, string> = {
  analyst: 'Ты Data Analyst AI-команды. Проанализируй ситуацию: 3 пользователя, 0 платных, 0% конверсия, цель 4%. Дай 2 конкретные задачи для роста метрик. JSON: [{text, impact}]',
  cfo: 'Ты CFO AI-команды. MRR=$0, цель $10M/мес в рублях. Дай 2 финансовых действия на сегодня. JSON: [{text, impact}]',
  cmo: 'Ты CMO AI-команды. Нужно привлечь первых платных пользователей в AI Mastery Platform. Дай 2 маркетинговых задачи. JSON: [{text, impact}]',
  cs: 'Ты Customer Success Manager AI-команды. 3 пользователя, 0 платных, 0% completion rate. Дай 2 задачи для удержания. JSON: [{text, impact}]',
  ceo: 'Ты CEO AI-команды. Дай 2 стратегических приоритета на сегодня для AI Mastery Platform. JSON: [{text, impact}]',
}

export async function POST(req: NextRequest) {
  const { agentId } = await req.json()

  try {
    const prompt = AGENT_PROMPTS[agentId] || 'Дай 2 задачи для бизнеса. JSON: [{text, impact}]'

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt + ' Отвечай ТОЛЬКО JSON массивом, без markdown.' }],
      }),
    })

    const data = await res.json()
    const text = data.content?.[0]?.text || '[]'
    const tasks = JSON.parse(text.replace(/```json?|```/g, '').trim())
    return NextResponse.json({ tasks })
  } catch {
    return NextResponse.json({ tasks: [
      { text: 'Ошибка агента. Проверьте ANTHROPIC_API_KEY', impact: '–' }
    ]})
  }
}
