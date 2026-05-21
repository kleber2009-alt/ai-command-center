// Personal "second brain" chat. Uses the singleton profile from
// the local Postgres + (optionally) RAG over the document library.
// RAG via pgvector is not enabled yet on this deployment, so the
// retrieval block stays empty — the model answers from the profile
// and the conversation alone. When pgvector lands, fill in the
// retrieval branch and rebuild.

import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
import { loadProfile, profileToContext } from '@/lib/me-db'
import { streamAnthropic } from '@/lib/anthropic-stream'

export const maxDuration = 60

type Msg = { role: 'user' | 'assistant'; content: string }
type Body = { messages: Msg[]; topK?: number }

const SYSTEM_INSTRUCTIONS = `Ты — личный «второй мозг» пользователя. Ты знаешь о нём всё, что приведено ниже в блоке ## Профиль и в найденных фрагментах ## Контекст.

Правила:
- Опирайся в первую очередь на профиль и найденный контекст. Если данных не хватает — прямо скажи, что в базе этого нет.
- Не выдумывай факты о пользователе, его проектах или академии. Если уточнить нужно — задай короткий конкретный вопрос.
- Говори как близкий, но компетентный помощник: коротко, по делу, без воды и канцелярита.
- При цитировании конкретного материала ссылайся на источник в формате [Название документа].
- Соблюдай голос и стиль пользователя, если он описан в блоке "Голос и стиль".`

export async function POST(req: NextRequest) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'me-chat', max: 20, windowMs: 60_000 },
    requireInitData: false,
  })
  if (!guard.ok) return guard.response

  const body = (await req.json()) as Body
  const messages = Array.isArray(body.messages) ? body.messages : []

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Последнее сообщение должно быть от пользователя' }, { status: 400 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не настроен' }, { status: 500 })
  }

  const profile = await loadProfile()
  const profileBlock = profileToContext(profile)

  const systemParts: string[] = [SYSTEM_INSTRUCTIONS]
  if (profileBlock) systemParts.push('## Профиль\n' + profileBlock)
  systemParts.push('## Контекст\n(RAG-поиск по документам пока не подключён — отвечай по профилю и диалогу)')
  const system = systemParts.join('\n\n')

  return streamAnthropic(
    {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-6',
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content.slice(0, 50000) })),
    },
    { citations: [] },
  )
}
