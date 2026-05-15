// Lightweight YouTube captions fetcher. Avoids the broken youtube-transcript
// package by parsing the watch-page HTML and hitting the json3 timedtext
// endpoint directly with the signed URL embedded in the page.

export type CaptionSegment = { text: string; offset: number; duration: number }

export type CaptionsErrorCode =
  | 'invalid-url'
  | 'fetch-blocked'
  | 'no-tracks'
  | 'lang-not-found'
  | 'fetch-failed'

export class YoutubeCaptionsError extends Error {
  constructor(public code: CaptionsErrorCode, message: string) {
    super(message)
    this.name = 'YoutubeCaptionsError'
  }
}

const YOUTUBE_ID_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/

export function getYoutubeVideoId(url: string): string | null {
  const m = url.match(YOUTUBE_ID_RE)
  return m ? m[1] : null
}

type CaptionTrack = {
  baseUrl: string
  languageCode: string
  kind?: string
  name?: { simpleText?: string }
}

async function fetchWatchPage(videoId: string): Promise<string> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new YoutubeCaptionsError('fetch-failed', `YouTube вернул статус ${res.status}`)
  }
  return res.text()
}

function extractCaptionTracks(html: string): CaptionTrack[] {
  const marker = '"captionTracks":'
  const idx = html.indexOf(marker)
  if (idx === -1) return []
  const start = html.indexOf('[', idx)
  if (start === -1) return []

  let depth = 0
  let i = start
  let inString = false
  let escaped = false
  while (i < html.length) {
    const ch = html[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
    } else if (ch === '"') {
      inString = true
    } else if (ch === '[') {
      depth++
    } else if (ch === ']') {
      depth--
      if (depth === 0) {
        i++
        break
      }
    }
    i++
  }

  try {
    return JSON.parse(html.slice(start, i)) as CaptionTrack[]
  } catch {
    return []
  }
}

function pickTrack(tracks: CaptionTrack[], preferredLang?: string): CaptionTrack | null {
  if (tracks.length === 0) return null
  if (preferredLang && preferredLang !== 'auto') {
    const manualExact = tracks.find(t => t.languageCode === preferredLang && t.kind !== 'asr')
    if (manualExact) return manualExact
    const anyExact = tracks.find(t => t.languageCode === preferredLang)
    if (anyExact) return anyExact
    const manualPrefix = tracks.find(t => t.languageCode.startsWith(preferredLang) && t.kind !== 'asr')
    if (manualPrefix) return manualPrefix
    const anyPrefix = tracks.find(t => t.languageCode.startsWith(preferredLang))
    if (anyPrefix) return anyPrefix
    return null
  }
  return tracks.find(t => t.kind !== 'asr') ?? tracks[0]
}

type Json3Response = {
  events?: Array<{
    tStartMs?: number
    dDurationMs?: number
    segs?: Array<{ utf8?: string }>
  }>
}

async function fetchJson3(baseUrl: string): Promise<CaptionSegment[]> {
  const url = baseUrl + '&fmt=json3'
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new YoutubeCaptionsError('fetch-failed', `Эндпоинт субтитров вернул ${res.status}`)
  }
  const body = await res.text()
  if (!body.trim()) {
    throw new YoutubeCaptionsError(
      'fetch-blocked',
      'YouTube вернул пустой ответ на запрос субтитров — IP сервера, скорее всего, в чёрном списке',
    )
  }
  let data: Json3Response
  try {
    data = JSON.parse(body) as Json3Response
  } catch {
    throw new YoutubeCaptionsError(
      'fetch-blocked',
      'YouTube вернул не-JSON на запрос субтитров (вероятно, страница-заглушка для заблокированных IP)',
    )
  }
  if (!data.events) return []

  const segments: CaptionSegment[] = []
  for (const ev of data.events) {
    if (!ev.segs || ev.tStartMs === undefined) continue
    const text = ev.segs
      .map(s => s.utf8 ?? '')
      .join('')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) continue
    segments.push({
      text,
      offset: ev.tStartMs,
      duration: ev.dDurationMs ?? 0,
    })
  }
  return segments
}

export async function fetchYoutubeCaptions(
  url: string,
  preferredLang?: string,
): Promise<{ segments: CaptionSegment[]; language: string; trackName: string }> {
  const videoId = getYoutubeVideoId(url)
  if (!videoId) {
    throw new YoutubeCaptionsError('invalid-url', 'Не удалось извлечь ID видео из URL')
  }

  const html = await fetchWatchPage(videoId)

  if (html.length < 5000 || !html.includes('ytInitialPlayerResponse')) {
    throw new YoutubeCaptionsError(
      'fetch-blocked',
      'YouTube вернул капчу или заглушку (вероятно, IP сервера в чёрном списке)',
    )
  }

  const tracks = extractCaptionTracks(html)
  if (tracks.length === 0) {
    throw new YoutubeCaptionsError('no-tracks', 'У этого видео нет субтитров')
  }

  const track = pickTrack(tracks, preferredLang)
  if (!track) {
    const available = tracks.map(t => t.languageCode).join(', ')
    throw new YoutubeCaptionsError(
      'lang-not-found',
      `Субтитры на «${preferredLang}» не найдены. Доступны: ${available}`,
    )
  }

  const segments = await fetchJson3(track.baseUrl)
  return {
    segments,
    language: track.languageCode,
    trackName: track.name?.simpleText ?? track.languageCode,
  }
}
