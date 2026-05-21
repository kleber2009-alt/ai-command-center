import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
import { dbGetTranscript, dbSaveTranslation } from '@/lib/transcripts-db'

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
  const guard = guardRequest(req, {
    rateLimit: { key: 'translate', max: 20, windowMs: 60_000 },
    requireInitData: false,
  })
  if (!guard.ok) return guard.response

  const { id, transcript, targetLang } = (await req.json()) as Body

  if (!targetLang || !['ru', 'en'].includes(targetLang)) {
    return NextResponse.json({ error: 'targetLang должен быть "ru" или "en"' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не настроен на сервере' }, { status: 500 })
  }

  let text = transcript
  if (id) {
    const row = await dbGetTranscript(id)
    if (!row) {
      return NextResponse.json({ error: 'Транскрипт не найден' }, { status: 404 })
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
      await dbSaveTranslation(id, { lang: targetLang, text: translation })
    }

    return NextResponse.json({ translation, lang: targetLang, cached: false })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка перевода' }, { status: 500 })
  }
}
