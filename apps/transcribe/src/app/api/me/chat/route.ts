import { NextRequest, NextResponse } from 'next/server'
import { embed } from '@/lib/embeddings'
import { getServerSupabase, loadProfile, profileToContext } from '@/lib/me-db'
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
  const body = (await req.json()) as Body
  const messages = Array.isArray(body.messages) ? body.messages : []
  const topK = Math.max(1, Math.min(20, body.topK ?? 8))

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Последнее сообщение должно быть от пользователя' }, { status: 400 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не настроен' }, { status: 500 })
  }
  const supabase = getServerSupabase()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase не настроен. Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_KEY + миграция 003_me.sql.' },
      { status: 500 },
    )
  }

  const profile = await loadProfile()
  const profileBlock = profileToContext(profile)

  const lastUser = messages[messages.length - 1].content
  let contextBlock = ''
  let citations: Array<{ document_id: string; document_title: string; chunk_index: number; similarity: number }> = []

  if (process.env.OPENAI_API_KEY) {
    try {
      const queryVec = await embed(lastUser)
      const { data: matches, error } = await supabase.rpc('match_me_chunks', {
        query_embedding: queryVec as any,
        match_count: topK,
      })
      if (!error && Array.isArray(matches)) {
        const filtered = matches.filter((m: any) => (m.similarity ?? 0) > 0.2)
        contextBlock = filtered
          .map(
            (m: any, i: number) =>
              `### Фрагмент ${i + 1} — [${m.document_title}] (sim ${(m.similarity * 100).toFixed(0)}%)\n${m.content}`,
          )
          .join('\n\n---\n\n')
        citations = filtered.map((m: any) => ({
          document_id: m.document_id,
          document_title: m.document_title,
          chunk_index: m.chunk_index,
          similarity: m.similarity,
        }))
      }
    } catch (e: any) {
      console.warn('[me/chat] retrieval failed:', e?.message)
    }
  }

  const systemParts: string[] = [SYSTEM_INSTRUCTIONS]
  if (profileBlock) systemParts.push('## Профиль\n' + profileBlock)
  if (contextBlock) systemParts.push('## Контекст (релевантные фрагменты из базы)\n' + contextBlock)
  else systemParts.push('## Контекст\n(релевантных фрагментов не найдено — используй только профиль и общие знания)')
  const system = systemParts.join('\n\n')

  return streamAnthropic(
    {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-6',
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content.slice(0, 50000) })),
    },
    { citations },
  )
}
