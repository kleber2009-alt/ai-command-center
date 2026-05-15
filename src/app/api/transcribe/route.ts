import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

type Body = { url?: string; language?: 'auto' | 'ru' | 'en' }

export async function POST(req: NextRequest) {
  const { url, language = 'ru' } = (await req.json()) as Body

  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'Укажите прямую ссылку (http/https) на аудио или видео файл' }, { status: 400 })
  }

  if (!process.env.DEEPGRAM_API_KEY) {
    return NextResponse.json({ error: 'DEEPGRAM_API_KEY не настроен на сервере' }, { status: 500 })
  }

  const params = new URLSearchParams({
    model: 'nova-2',
    punctuate: 'true',
    paragraphs: 'true',
    smart_format: 'true',
  })
  if (language === 'auto') {
    params.set('detect_language', 'true')
  } else {
    params.set('language', language)
  }

  try {
    const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json(
        { error: `Deepgram (${res.status}): ${errText.slice(0, 300)}` },
        { status: res.status },
      )
    }

    const data = await res.json()
    const channel = data.results?.channels?.[0]
    const alt = channel?.alternatives?.[0]
    const flatTranscript = alt?.transcript ?? ''
    const paragraphsObj = alt?.paragraphs?.paragraphs as
      | Array<{ sentences: Array<{ text: string }>; start: number; end: number }>
      | undefined

    const paragraphs =
      paragraphsObj?.map(p => ({
        text: p.sentences.map(s => s.text).join(' '),
        start: p.start,
        end: p.end,
      })) ?? []

    return NextResponse.json({
      transcript: flatTranscript,
      paragraphs,
      duration: data.metadata?.duration ?? null,
      detectedLanguage: channel?.detected_language ?? null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка транскрибации' }, { status: 500 })
  }
}
