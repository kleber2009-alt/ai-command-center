import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/transcripts-db'
import { guardRequest } from '@/lib/api-guard'

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
  const guard = guardRequest(req, { max: 10, windowMs: 60_000 })
  if (!guard.ok) return guard.res

  const { id, transcript, targetLang } = (await req.json()) as Body

  if (!targetLang || !['ru', 'en'].includes(targetLang)) {
    return NextResponse.json({ error: 'targetLang должен быть "ru" или "en"' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не настроен на сервере' }, { status: 500 })
  }

  let text = transcript
  const supabase = getServerSupabase()
  if (id && supabase) {
    const { data, error } = await supabase
      .from('transcripts')
      .select('transcript, translation')
      .eq('id', id)
      .single()
    if (error) {
      return NextResponse.json({ error: `Не найден транскрипт: ${error.message}` }, { status: 404 })
    }
    if (data.translation && data.translation.lang === targetLang) {
      return NextResponse.json({ translation: data.translation.text, lang: targetLang, cached: true })
    }
    text = data.transcript
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

    if (id && supabase) {
      await supabase
        .from('transcripts')
        .update({ translation: { lang: targetLang, text: translation } })
        .eq('id', id)
    }

    return NextResponse.json({ translation, lang: targetLang, cached: false })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка перевода' }, { status: 500 })
  }
}
