import { NextRequest, NextResponse } from 'next/server'
import { getAssistant } from '@/data/assistants'
import { streamAnthropic } from '@/lib/anthropic-stream'
import { authenticate } from '@/lib/telegram-auth'
import { appendTurn, getSession, replaceLastAssistant, truncateSession } from '@/lib/chats-db'
import { loadProfile, profileToContext, searchChunks } from '@/lib/me-db'
import { embed } from '@/lib/embeddings'

export const maxDuration = 60

type Msg = { role: 'user' | 'assistant'; content: string }
type Body = {
  assistantId: string
  messages: Msg[]
  sessionId?: string
  regenerate?: boolean
  /** When true, retrieve relevant chunks from the second-brain library too. */
  useBrainContext?: boolean
  /** Drop messages in the session beyond this count before appending the new turn. */
  truncateToCount?: number
}

export async function POST(req: NextRequest) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
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

  const session = sessionId ? getSession(sessionId, auth.user_id) : null
  const validSession =
    session && session.kind === 'assistant' && session.assistant_id === assistantId ? session : null

  // Always layer the user profile on top of the assistant's base prompt:
  // it's cheap, doesn't need extra API calls, and dramatically improves
  // personalisation. Library retrieval (RAG) is opt-in via useBrainContext.
  const profile = loadProfile(auth.user_id)
  const profileBlock = profileToContext(profile)

  let contextBlock = ''
  let citations: Array<{
    document_id: number
    document_title: string
    chunk_index: number
    similarity: number
    content: string
  }> = []

  const wantsContext = body.useBrainContext === true && !!process.env.OPENAI_API_KEY
  if (wantsContext) {
    try {
      const lastUser = cleaned[cleaned.length - 1].content
      const queryVec = await embed(lastUser)
      const matches = searchChunks(auth.user_id, queryVec, 6).filter((m) => m.similarity > 0.2)
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
      console.warn('[assistants/chat] retrieval failed:', e?.message)
    }
  }

  const systemParts: string[] = [assistant.systemPrompt]
  if (profileBlock) {
    systemParts.push(
      '## Контекст про пользователя (используй для попадания в его стиль, нишу, проекты)\n' + profileBlock,
    )
  }
  if (contextBlock) {
    systemParts.push('## Релевантные фрагменты из его материалов\n' + contextBlock)
  }
  const system = systemParts.join('\n\n')

  return streamAnthropic(
    {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-6',
      system,
      messages: cleaned,
    },
    validSession || citations.length > 0
      ? { sessionId: validSession?.id ?? null, citations }
      : undefined,
    async (fullText) => {
      if (!validSession) return
      if (regenerate) {
        replaceLastAssistant(validSession.id, auth.user_id, fullText)
        return
      }
      if (typeof body.truncateToCount === 'number') {
        truncateSession(validSession.id, auth.user_id, body.truncateToCount)
      }
      const lastUser = cleaned[cleaned.length - 1].content
      appendTurn({
        sessionId: validSession.id,
        user_id: auth.user_id,
        userMessage: lastUser,
        assistantMessage: fullText,
      })
    },
  )
}
