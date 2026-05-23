import { NextRequest, NextResponse } from 'next/server'
import { getTranscript, updateTranscriptSummary } from '@/lib/transcripts-db'
import { streamAnthropic } from '@/lib/anthropic-stream'
import { authenticate } from '@/lib/telegram-auth'
import { indexTranscribeRow } from '@/lib/memory'

export const maxDuration = 60

type Body = { id?: string; transcript?: string }

const PROMPT = (text: string) => `Прочитай транскрипт видео или аудиозаписи и сделай саммари на русском:

1. Сначала блок \`## Саммари\` — 2-3 предложения с сутью.
2. Затем блок \`## Тезисы\` — 5 ключевых тезисов как маркированный список (\`- ...\`).

Без вступлений и заключений. Только эти два блока.

Транскрипт:
"""
${text.slice(0, 30000)}
"""`

/** Pull a "## Саммари ... ## Тезисы\n- ..." markdown back into the legacy
 *  {summary, bullets} shape so we can keep storing both fields. */
function parseSummary(markdown: string): { summary: string; bullets: string[] } {
  const sumMatch = markdown.match(/##\s*Саммари\s*\n([\s\S]*?)(?=\n##\s|$)/i)
  const bulletsMatch = markdown.match(/##\s*Тезисы\s*\n([\s\S]*)$/i)
  const summary = sumMatch ? sumMatch[1].trim() : markdown.split(/\n##\s/)[0].trim()
  const bullets: string[] = []
  if (bulletsMatch) {
    for (const line of bulletsMatch[1].split('\n')) {
      const m = line.match(/^[\s]*[-*•]\s+(.+)$/)
      if (m) bullets.push(m[1].trim())
    }
  }
  return { summary, bullets }
}

function ndjsonResponse(events: Array<Record<string, any>>): Response {
  const enc = new TextEncoder()
  const body = events.map((e) => JSON.stringify(e) + '\n').join('')
  return new Response(enc.encode(body), {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  })
}

export async function POST(req: NextRequest) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  const { id, transcript } = (await req.json()) as Body

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не настроен на сервере' }, { status: 500 })
  }

  let text = transcript
  if (id) {
    const row = getTranscript(id, auth.user_id)
    if (!row) return NextResponse.json({ error: 'Не найден транскрипт' }, { status: 404 })
    if (row.summary && row.bullets) {
      // Replay cached saved summary as a single delta + done.
      const cachedMd = `## Саммари\n${row.summary}\n\n## Тезисы\n${row.bullets.map((b) => `- ${b}`).join('\n')}`
      return ndjsonResponse([
        { type: 'meta', cached: true },
        { type: 'delta', text: cachedMd },
        { type: 'done' },
      ])
    }
    text = row.transcript
  }

  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: 'Пустой транскрипт' }, { status: 400 })
  }

  return streamAnthropic(
    {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-haiku-4-5-20251001',
      system: '',
      messages: [{ role: 'user', content: PROMPT(text) }],
      maxTokens: 1024,
    },
    { cached: false },
    async (fullText) => {
      if (!id) return
      const { summary, bullets } = parseSummary(fullText)
      if (summary || bullets.length > 0) {
        updateTranscriptSummary(id, auth.user_id, summary, bullets)
        // Index the summary as a separate point — short, condensed
        // text scores higher for top-of-the-funnel queries than the
        // raw transcript. Key is `<id>-summary` so it lives alongside
        // the transcript point without overwriting it.
        const tgId = auth.user_id.startsWith('tg:')
          ? Number(auth.user_id.slice(3)) || null
          : null
        const indexText = bullets.length > 0
          ? `${summary}\n\n${bullets.map((b) => `• ${b}`).join('\n')}`
          : summary
        indexTranscribeRow({
          naturalKey: `${id}-summary`,
          kind: 'summary',
          text: indexText,
          ownerTelegramId: tgId,
          title: null,
          url: null,
          createdAt: new Date().toISOString(),
        }).catch(() => {})
      }
    },
  )
}
