import { NextRequest, NextResponse } from 'next/server'
import { requireTelegramAuth } from '@/lib/telegram-auth'

export const maxDuration = 60

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB safety cap

export async function POST(req: NextRequest) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate

  if (!process.env.DEEPGRAM_API_KEY) {
    return NextResponse.json({ error: 'DEEPGRAM_API_KEY не настроен на сервере' }, { status: 500 })
  }

  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Ожидаю multipart/form-data с полем audio' }, { status: 400 })
  }

  let file: File | null = null
  let language = 'ru'
  try {
    const form = await req.formData()
    file = form.get('audio') as File | null
    const langField = form.get('language')
    if (typeof langField === 'string' && langField.trim()) language = langField.trim()
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Не удалось прочитать форму' }, { status: 400 })
  }

  if (!file) return NextResponse.json({ error: 'Поле audio не получено' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'Пустой аудио-файл' }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Файл слишком большой (${file.size} > ${MAX_BYTES})` }, { status: 413 })
  }

  const mime = file.type || 'audio/webm'
  const buffer = Buffer.from(await file.arrayBuffer())

  const params = new URLSearchParams({
    model: 'nova-2',
    punctuate: 'true',
    smart_format: 'true',
  })
  if (language === 'auto') params.set('detect_language', 'true')
  else params.set('language', language)

  try {
    const res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': mime,
      },
      body: buffer,
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json(
        { error: `Deepgram (${res.status}): ${errText.slice(0, 300)}` },
        { status: res.status },
      )
    }

    const data = await res.json()
    const alt = data.results?.channels?.[0]?.alternatives?.[0]
    const text: string = (alt?.transcript ?? '').trim()
    const duration: number | null = data.metadata?.duration ?? null
    const detected: string | null = data.results?.channels?.[0]?.detected_language ?? null

    if (!text) {
      return NextResponse.json({ error: 'Не удалось распознать речь — попробуй ещё раз' }, { status: 422 })
    }

    return NextResponse.json({ text, duration, detectedLanguage: detected })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка транскрипции' }, { status: 500 })
  }
}
