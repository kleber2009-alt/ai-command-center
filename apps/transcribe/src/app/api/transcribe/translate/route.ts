import { NextRequest, NextResponse } from 'next/server'
import { getTranscript, updateTranscriptTranslation } from '@/lib/transcripts-db'
import { streamAnthropic } from '@/lib/anthropic-stream'
import { authenticate } from '@/lib/telegram-auth'

export const maxDuration = 60

type Body = { id?: string; transcript?: string; targetLang: 'ru' | 'en' }

const LANG_NAME: Record<string, string> = {
  ru: 'русский',
  en: 'английский',
}

const PROMPT = (text: string, targetLang: 'ru' | 'en') =>
  `Переведи следующий транскрипт на ${LANG_NAME[targetLang]}. Сохрани структуру и смысл, но сделай текст естественным. Не добавляй никаких комментариев, заголовков или markdown — только переведённый текст.

Транскрипт:
"""
${text.slice(0, 30000)}
"""`

export async function POST(req: NextRequest) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  const { id, transcript, targetLang } = (await req.json()) as Body

  if (!targetLang || !['ru', 'en'].includes(targetLang)) {
    return NextResponse.json({ error: 'targetLang должен быть "ru" или "en"' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не настроен на сервере' }, { status: 500 })
  }

  let text = transcript
  if (id) {
    const row = getTranscript(id, auth.user_id)
    if (!row) {
      return NextResponse.json({ error: 'Не найден транскрипт' }, { status: 404 })
    }
    if (row.translation && row.translation.lang === targetLang) {
      // Cached: stream the cached text out as a single delta + done, so the
      // client can use the same NDJSON reader path.
      const enc = new TextEncoder()
      const lines = [
        JSON.stringify({ type: 'meta', lang: targetLang, cached: true }) + '\n',
        JSON.stringify({ type: 'delta', text: row.translation.text }) + '\n',
        JSON.stringify({ type: 'done' }) + '\n',
      ]
      return new Response(enc.encode(lines.join('')), {
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
      })
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
      messages: [{ role: 'user', content: PROMPT(text, targetLang) }],
      maxTokens: 8192,
    },
    { lang: targetLang, cached: false },
    async (fullText) => {
      if (id) updateTranscriptTranslation(id, auth.user_id, targetLang, fullText.trim())
    },
  )
}
