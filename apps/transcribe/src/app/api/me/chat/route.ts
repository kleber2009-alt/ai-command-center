// Personal "second brain" chat. Uses the singleton profile from
// the local Postgres + (optionally) RAG over the document library.
// RAG via pgvector is not enabled yet on this deployment, so the
// retrieval block stays empty — the model answers from the profile
// and the conversation alone. When pgvector lands, fill in the
// retrieval branch and rebuild.

import { NextRequest, NextResponse } from 'next/server'
import { embed } from '@/lib/embeddings'
import { loadProfile, profileToContext, searchChunks, type MeChunkMatch } from '@/lib/me-db'
import { streamAnthropic } from '@/lib/anthropic-stream'
import { authenticate } from '@/lib/telegram-auth'
import { appendTurn, getSession, replaceLastAssistant, truncateSession } from '@/lib/chats-db'

export const maxDuration = 60

type Msg = { role: 'user' | 'assistant'; content: string }
type Body = {
  messages: Msg[]
  topK?: number
  sessionId?: string
  regenerate?: boolean
  /** When set, drop everything in the session beyond this count before appending the new turn. */
  truncateToCount?: number
}

const SYSTEM_INSTRUCTIONS = `Ты — личный «второй мозг» пользователя. Ты знаешь о нём всё, что приведено ниже в блоке ## Профиль и в найденных фрагментах ## Контекст.

Правила:
- Опирайся в первую очередь на профиль и найденный контекст. Если данных не хватает — прямо скажи, что в базе этого нет.
- Не выдумывай факты о пользователе, его проектах или академии. Если уточнить нужно — задай короткий конкретный вопрос.
- Говори как близкий, но компетентный помощник: коротко, по делу, без воды и канцелярита.
- При цитировании конкретного материала ссылайся на источник в формате [Название документа].
- Соблюдай голос и стиль пользователя, если он описан в блоке "Голос и стиль".`

export async function POST(req: NextRequest) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
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

  // Resolve session early — we may need its doc_ids to scope RAG.
  const session = body.sessionId ? await getSession(body.sessionId, auth.user_id) : null
  const validSession = session && session.kind === 'me' ? session : null
  const restrictDocIds: string[] | undefined = Array.isArray(validSession?.doc_ids)
    ? validSession!.doc_ids.map(String)
    : undefined
  const topK = typeof body.topK === 'number' ? body.topK : 8

  const lastUser = messages[messages.length - 1].content
  let contextBlock = ''
  let citations: Array<{
    document_id: string
    document_title: string
    chunk_index: number
    similarity: number
    content: string
  }> = []

  if (process.env.OPENAI_API_KEY) {
    try {
      const queryVec = await embed(lastUser)
      const matches: MeChunkMatch[] = (
        await searchChunks(auth.user_id, queryVec, topK, restrictDocIds)
      ).filter((m) => m.similarity > 0.2)
      contextBlock = matches
        .map(
          (m, i) =>
            `### Фрагмент ${i + 1} — [${m.document_title}] (sim ${(m.similarity * 100).toFixed(0)}%)\n${m.content}`,
        )
        .join('\n\n---\n\n')
      citations = matches.map((m) => ({
        document_id: m.document_id,
        document_title: m.document_title,
        chunk_index: m.chunk_index,
        similarity: m.similarity,
        content: m.content,
      }))
    } catch (e: any) {
      console.warn('[me/chat] retrieval failed:', e?.message)
    }
  }

  const systemParts: string[] = [SYSTEM_INSTRUCTIONS]
  if (profileBlock) systemParts.push('## Профиль\n' + profileBlock)
  if (restrictDocIds) {
    systemParts.push(
      `## Ограничение контекста\nПользователь явно ограничил выборку этими документами (ids: ${restrictDocIds.join(', ')}). Используй только их.`,
    )
  }
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
    { citations, sessionId: validSession?.id ?? null },
    async (fullText) => {
      if (!validSession) return
      if (body.regenerate) {
        await replaceLastAssistant(validSession.id, auth.user_id, fullText)
        return
      }
      if (typeof body.truncateToCount === 'number') {
        await truncateSession(validSession.id, auth.user_id, body.truncateToCount)
      }
      await appendTurn({
        sessionId: validSession.id,
        user_id: auth.user_id,
        userMessage: lastUser,
        assistantMessage: fullText,
      })
    },
  )
}
