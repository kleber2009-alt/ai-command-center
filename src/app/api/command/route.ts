import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { AI_AGENTS } from '@/lib/agents'
import { AGENT_PROMPTS, AGENT_PROMPT_SUFFIX } from '@/lib/prompts'

type Task = { text: string; impact: string }

export async function POST(req: NextRequest) {
  const { agentId, runId } = await req.json()
  const prompt = AGENT_PROMPTS[agentId] ?? 'Дай 2 задачи для бизнеса. JSON: [{text, impact}]'
  const agent = AI_AGENTS.find(a => a.id === agentId)
  const agentName = agent?.name ?? agentId
  const agentEmoji = agent?.emoji ?? '🤖'

  let tasks: Task[]
  try {
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
        messages: [{ role: 'user', content: prompt + AGENT_PROMPT_SUFFIX }],
      }),
    })
    const data = await res.json()
    const text = data.content?.[0]?.text ?? '[]'
    const parsed = JSON.parse(text.replace(/```json?|```/g, '').trim())
    tasks = Array.isArray(parsed) ? parsed : []
  } catch {
    return NextResponse.json({
      tasks: [{ text: 'Ошибка агента. Проверьте ANTHROPIC_API_KEY', impact: '–' }],
    })
  }

  // Persist в БД, не блокируя ответ если БД временно недоступна.
  const effectiveRunId = runId ?? randomUUID()
  try {
    for (const t of tasks) {
      if (!t?.text || !t?.impact) continue
      await db.query(
        `INSERT INTO agent_tasks (agent_id, agent_name, agent_emoji, text, impact, run_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [agentId, agentName, agentEmoji, t.text, t.impact, effectiveRunId],
      )
    }
  } catch (e: any) {
    console.error('[api/command] persist failed:', e?.message)
  }

  return NextResponse.json({ tasks, runId: effectiveRunId })
}
