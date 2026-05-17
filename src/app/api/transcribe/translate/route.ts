import { NextRequest, NextResponse } from 'next/server'
import { getTranscript, updateTranscriptTranslation } from '@/lib/transcripts-db'
import { requireTelegramAuth } from '@/lib/telegram-auth'

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
  const gate = requireTelegramAuth(req)
  if (gate) return gate
  const { id, transcript, targetLang } = (await req.json()) as Body

  if (!targetLang || !['ru', 'en'].includes(targetLang)) {
    return NextResponse.json({ error: 'targetLang должен быть "ru" или "en"' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не настроен на сервере' }, { status: 500 })
  }

  let text = transcript
  if (id) {
    const row = getTranscript(id)
    if (!row) {
      return NextResponse.json({ error: 'Не найден транскрипт' }, { status: 404 })
    }
    if (row.translation && row.translation.lang === targetLang) {
      return NextResponse.json({ translation: row.translation.text, lang: targetLang, cached: true })
    }
    text = row.transcript
  }

  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: 'Пустой транскрипт' }, { status: 400 })
  }

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
        max_tokens: 8192,
        messages: [{ role: 'user', content: PROMPT(text, targetLang) }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json(
        { error: `Anthropic (${res.status}): ${errText.slice(0, 300)}` },
        { status: res.status },
      )
    }

    const data = await res.json()
    const translation: string = (data.content?.[0]?.text || '').trim()

    if (id) {
      updateTranscriptTranslation(id, targetLang, translation)
    }

    return NextResponse.json({ translation, lang: targetLang, cached: false })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка перевода' }, { status: 500 })
  }
}
