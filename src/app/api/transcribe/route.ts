import { NextRequest, NextResponse } from 'next/server'
import { fetchYoutubeCaptions, getYoutubeVideoId, YoutubeCaptionsError } from '@/lib/youtube-captions'
import { makeTitle, Paragraph } from '@/lib/transcripts-db'
import { isDbConfigured, queryOne } from '@/lib/db'
import {
  extractDirectMediaUrl,
  isSocialMediaUrl,
  isYtdlpServiceConfigured,
  YtdlpServiceError,
} from '@/lib/ytdlp-client'
import { fetchInstagramViaApify, isApifyConfigured, ApifyError } from '@/lib/apify-instagram'

export const maxDuration = 60

type Body = { url?: string; language?: 'auto' | 'ru' | 'en' }
type Ok = {
  transcript: string
  paragraphs: Paragraph[]
  duration: number | null
  detectedLanguage: string | null
  source: 'youtube' | 'deepgram' | 'ytdlp+deepgram' | 'apify+deepgram'
}
type Err = { error: string; status: number }
type Result = Ok | Err

function isYoutube(url: string): boolean {
  return getYoutubeVideoId(url) !== null
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

async function fetchYoutubeCaptionsPath(url: string, language: 'auto' | 'ru' | 'en'): Promise<Result> {
  try {
    const { segments, language: detectedLang } = await fetchYoutubeCaptions(url, language)
    if (segments.length === 0) {
      return { error: 'YouTube вернул пустые субтитры', status: 400 }
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

    return {
      transcript: flatTranscript,
      paragraphs,
      duration,
      detectedLanguage: detectedLang,
      source: 'youtube',
    }
  } catch (e: any) {
    if (e instanceof YoutubeCaptionsError) {
      const status = e.code === 'fetch-blocked' ? 503 : 400
      return { error: e.message, status }
    }
    return { error: e?.message || 'Ошибка YouTube', status: 500 }
  }
}

async function fetchViaYtdlpThenDeepgram(
  url: string,
  language: 'auto' | 'ru' | 'en',
): Promise<Result> {
  try {
    const { url: directUrl } = await extractDirectMediaUrl(url)
    const deepgramResult = await fetchDeepgram(directUrl, language)
    if ('error' in deepgramResult) return deepgramResult
    return { ...deepgramResult, source: 'ytdlp+deepgram' }
  } catch (e: any) {
    if (e instanceof YtdlpServiceError) {
      return { error: e.message, status: e.status }
    }
    return { error: e?.message || 'Ошибка yt-dlp', status: 500 }
  }
}

async function fetchViaApifyThenDeepgram(
  url: string,
  language: 'auto' | 'ru' | 'en',
): Promise<Result> {
  try {
    const { url: directUrl } = await fetchInstagramViaApify(url)
    const deepgramResult = await fetchDeepgram(directUrl, language)
    if ('error' in deepgramResult) return deepgramResult
    return { ...deepgramResult, source: 'apify+deepgram' }
  } catch (e: any) {
    if (e instanceof ApifyError) {
      return { error: e.message, status: e.status }
    }
    return { error: e?.message || 'Ошибка Apify', status: 500 }
  }
}

async function fetchDeepgram(url: string, language: 'auto' | 'ru' | 'en'): Promise<Result> {
  if (!process.env.DEEPGRAM_API_KEY) {
    return { error: 'DEEPGRAM_API_KEY не настроен на сервере', status: 500 }
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
    return { error: `Deepgram (${res.status}): ${errText.slice(0, 300)}`, status: res.status }
  }

  const data = await res.json()
  const channel = data.results?.channels?.[0]
  const alt = channel?.alternatives?.[0]
  const flatTranscript: string = alt?.transcript ?? ''
  const paragraphsObj = alt?.paragraphs?.paragraphs as
    | Array<{ sentences: Array<{ text: string }>; start: number; end: number }>
    | undefined

  const paragraphs: Paragraph[] =
    paragraphsObj?.map(p => ({
      text: p.sentences.map(s => s.text).join(' '),
      start: p.start,
      end: p.end,
    })) ?? []

  return {
    transcript: flatTranscript,
    paragraphs,
    duration: data.metadata?.duration ?? null,
    detectedLanguage: channel?.detected_language ?? null,
    source: 'deepgram',
  }
}

async function saveTranscript(url: string, result: Ok): Promise<string | null> {
  if (!isDbConfigured()) return null
  try {
    const row = await queryOne<{ id: string }>(
      `insert into transcripts (url, title, source, language, duration, transcript, paragraphs)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)
       returning id`,
      [
        url,
        makeTitle(result.transcript, url),
        result.source,
        result.detectedLanguage,
        result.duration,
        result.transcript,
        JSON.stringify(result.paragraphs),
      ],
    )
    return row?.id ?? null
  } catch (e: any) {
    console.warn('saveTranscript failed:', e?.message)
    return null
  }
}

async function dispatch(url: string, language: 'auto' | 'ru' | 'en'): Promise<Result> {
  if (isYoutube(url)) {
    const captionsResult = await fetchYoutubeCaptionsPath(url, language)
    if (!('error' in captionsResult)) return captionsResult

    // Fall back to yt-dlp + Deepgram for any captions-side failure
    // (no subtitles, IP block, wrong language) when the service is
    // configured. The only error we don't try to rescue is a bad URL.
    if (isYtdlpServiceConfigured()) {
      const ytdlpResult = await fetchViaYtdlpThenDeepgram(url, language)
      if (!('error' in ytdlpResult)) return ytdlpResult
      // Both failed — surface the more informative of the two
      return ytdlpResult.status >= 500 ? captionsResult : ytdlpResult
    }
    return captionsResult
  }

  if (isSocialMediaUrl(url)) {
    // Instagram specifically: prefer Apify when configured (isolates our
    // IG account + IP). Fall back to yt-dlp if Apify fails or isn't set.
    const isInstagram = /(?:^|\/\/[^/]*\b)instagram\.com\b/i.test(url)
    if (isInstagram && isApifyConfigured()) {
      const apifyResult = await fetchViaApifyThenDeepgram(url, language)
      if (!('error' in apifyResult)) return apifyResult
      if (isYtdlpServiceConfigured()) {
        const ytdlpResult = await fetchViaYtdlpThenDeepgram(url, language)
        if (!('error' in ytdlpResult)) return ytdlpResult
        return apifyResult.status >= 500 ? ytdlpResult : apifyResult
      }
      return apifyResult
    }

    if (!isYtdlpServiceConfigured()) {
      return {
        error: 'Для Instagram / TikTok / X нужен yt-dlp сервис (YTDLP_SERVICE_URL) или APIFY_API_TOKEN.',
        status: 503,
      }
    }
    return await fetchViaYtdlpThenDeepgram(url, language)
  }

  return await fetchDeepgram(url, language)
}

export async function POST(req: NextRequest) {
  const { url, language = 'ru' } = (await req.json()) as Body

  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: 'Укажите ссылку (http/https) на YouTube-видео, Instagram-Reel или прямой медиафайл' },
      { status: 400 },
    )
  }

  try {
    const result = await dispatch(url, language)

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const id = await saveTranscript(url, result)
    return NextResponse.json({ ...result, id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка транскрибации' }, { status: 500 })
  }
}
