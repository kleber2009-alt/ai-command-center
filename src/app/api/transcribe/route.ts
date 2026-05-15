import { NextRequest, NextResponse } from 'next/server'
import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptVideoUnavailableError,
  YoutubeTranscriptTooManyRequestError,
} from 'youtube-transcript'

export const maxDuration = 60

type Body = { url?: string; language?: 'auto' | 'ru' | 'en' }
type Paragraph = { text: string; start: number; end: number }

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i

function isYoutube(url: string): boolean {
  return YT_RE.test(url)
}

function groupSegmentsIntoParagraphs(
  segments: Array<{ text: string; offset: number; duration: number }>,
  chunkSeconds = 25,
): Paragraph[] {
  if (segments.length === 0) return []
  const paragraphs: Paragraph[] = []
  let current: { texts: string[]; start: number; end: number } | null = null

  for (const seg of segments) {
    const startSec = seg.offset / 1000
    const endSec = (seg.offset + seg.duration) / 1000
    if (!current) {
      current = { texts: [seg.text], start: startSec, end: endSec }
    } else if (endSec - current.start > chunkSeconds) {
      paragraphs.push({ text: current.texts.join(' '), start: current.start, end: current.end })
      current = { texts: [seg.text], start: startSec, end: endSec }
    } else {
      current.texts.push(seg.text)
      current.end = endSec
    }
  }
  if (current) {
    paragraphs.push({ text: current.texts.join(' '), start: current.start, end: current.end })
  }
  return paragraphs
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

async function handleYoutube(url: string, language: 'auto' | 'ru' | 'en') {
  const fetchOpts = language === 'auto' ? undefined : { lang: language }
  let segments
  try {
    segments = await YoutubeTranscript.fetchTranscript(url, fetchOpts)
  } catch (e: any) {
    if (e instanceof YoutubeTranscriptDisabledError) {
      return NextResponse.json({ error: 'У этого видео отключены субтитры на YouTube' }, { status: 400 })
    }
    if (e instanceof YoutubeTranscriptNotAvailableError) {
      return NextResponse.json({ error: 'У этого видео нет субтитров на YouTube' }, { status: 400 })
    }
    if (e instanceof YoutubeTranscriptNotAvailableLanguageError) {
      if (language !== 'auto') {
        try {
          segments = await YoutubeTranscript.fetchTranscript(url)
        } catch (fallbackErr: any) {
          return NextResponse.json(
            { error: `Субтитры на «${language}» недоступны, и автоязык тоже не получилось получить` },
            { status: 400 },
          )
        }
      } else {
        return NextResponse.json({ error: 'Субтитры на запрошенном языке недоступны' }, { status: 400 })
      }
    } else if (e instanceof YoutubeTranscriptVideoUnavailableError) {
      return NextResponse.json({ error: 'Видео недоступно (приватное, удалено или с ограничением региона)' }, { status: 400 })
    } else if (e instanceof YoutubeTranscriptTooManyRequestError) {
      return NextResponse.json({ error: 'YouTube временно блокирует запросы. Попробуйте позже' }, { status: 429 })
    } else {
      return NextResponse.json({ error: `YouTube: ${e?.message || 'неизвестная ошибка'}` }, { status: 500 })
    }
  }

  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: 'Пустой транскрипт от YouTube' }, { status: 400 })
  }

  const normalized = segments.map(s => ({
    text: decodeHtmlEntities(s.text).trim(),
    offset: s.offset,
    duration: s.duration,
  }))

  const flatTranscript = normalized.map(s => s.text).join(' ')
  const paragraphs = groupSegmentsIntoParagraphs(normalized)
  const last = normalized[normalized.length - 1]
  const duration = (last.offset + last.duration) / 1000
  const detectedLanguage = (segments[0] as any)?.lang ?? null

  return NextResponse.json({
    transcript: flatTranscript,
    paragraphs,
    duration,
    detectedLanguage,
    source: 'youtube',
  })
}

async function handleDeepgram(url: string, language: 'auto' | 'ru' | 'en') {
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

  const paragraphs: Paragraph[] =
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
    source: 'deepgram',
  })
}

export async function POST(req: NextRequest) {
  const { url, language = 'ru' } = (await req.json()) as Body

  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'Укажите ссылку (http/https) на YouTube-видео или прямой файл' }, { status: 400 })
  }

  try {
    if (isYoutube(url)) {
      return await handleYoutube(url, language)
    }
    return await handleDeepgram(url, language)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка транскрибации' }, { status: 500 })
  }
}
