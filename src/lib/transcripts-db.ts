import { randomUUID } from 'crypto'
import { getDb } from './db'

export type Paragraph = { text: string; start: number; end: number }

export type CarouselSlide = { n: number; title: string; body: string }
export type ReelsScript = {
  hook: string
  promise: string
  body: Array<{ time: string; text: string }>
  cta: string
  text_on_screen: string[]
  caption: string
  hashtags: string[]
}
export type TgPost = { text: string }

export type Generations = {
  carousel?: { slides: CarouselSlide[] }
  'reels-new'?: ReelsScript
  'reels-remix'?: ReelsScript
  'tg-post'?: TgPost
}

export type TranscriptRow = {
  id: string
  created_at: string
  url: string
  title: string | null
  source: string | null
  language: string | null
  duration: number | null
  transcript: string
  paragraphs: Paragraph[] | null
  summary: string | null
  bullets: string[] | null
  translation: { lang: string; text: string } | null
  generations: Generations | null
}

type RawTranscriptRow = {
  id: string
  created_at: string
  url: string
  title: string | null
  source: string | null
  language: string | null
  duration: number | null
  transcript: string
  paragraphs: string | null
  summary: string | null
  bullets: string | null
  translation: string | null
  generations: string | null
}

export function makeTitle(transcript: string, url: string): string {
  const clean = transcript.trim().replace(/\s+/g, ' ')
  if (clean.length === 0) {
    try {
      return new URL(url).hostname
    } catch {
      return url.slice(0, 60)
    }
  }
  return clean.length > 80 ? clean.slice(0, 80).trim() + '…' : clean
}

function parseJson<T>(s: string | null): T | null {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

function hydrate(raw: RawTranscriptRow): TranscriptRow {
  return {
    id: raw.id,
    created_at: raw.created_at,
    url: raw.url,
    title: raw.title,
    source: raw.source,
    language: raw.language,
    duration: raw.duration,
    transcript: raw.transcript,
    paragraphs: parseJson<Paragraph[]>(raw.paragraphs),
    summary: raw.summary,
    bullets: parseJson<string[]>(raw.bullets),
    translation: parseJson<{ lang: string; text: string }>(raw.translation),
    generations: parseJson<Generations>(raw.generations),
  }
}

/** Always true in the local-SQLite setup. Kept so callers don't need to special-case. */
export function isDbConfigured(): boolean {
  return true
}

export function insertTranscript(input: {
  url: string
  title: string
  source: string
  language: string | null
  duration: number | null
  transcript: string
  paragraphs: Paragraph[]
}): string {
  const id = randomUUID()
  const db = getDb()
  db.prepare(
    `INSERT INTO transcripts (id, url, title, source, language, duration, transcript, paragraphs)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.url,
    input.title,
    input.source,
    input.language,
    input.duration,
    input.transcript,
    JSON.stringify(input.paragraphs ?? []),
  )
  return id
}

export function getTranscript(id: string): TranscriptRow | null {
  const row = getDb().prepare(`SELECT * FROM transcripts WHERE id = ?`).get(id) as
    | RawTranscriptRow
    | undefined
  return row ? hydrate(row) : null
}

export function deleteTranscript(id: string): boolean {
  const info = getDb().prepare(`DELETE FROM transcripts WHERE id = ?`).run(id)
  return info.changes > 0
}

export type TranscriptListItem = {
  id: string
  created_at: string
  url: string
  title: string | null
  source: string | null
  language: string | null
  duration: number | null
}

export function listTranscripts(limit = 20): TranscriptListItem[] {
  return getDb()
    .prepare(
      `SELECT id, created_at, url, title, source, language, duration
       FROM transcripts ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as TranscriptListItem[]
}

export function updateTranscriptSummary(id: string, summary: string, bullets: string[]): void {
  getDb()
    .prepare(`UPDATE transcripts SET summary = ?, bullets = ? WHERE id = ?`)
    .run(summary, JSON.stringify(bullets), id)
}

export function updateTranscriptTranslation(id: string, lang: string, text: string): void {
  getDb()
    .prepare(`UPDATE transcripts SET translation = ? WHERE id = ?`)
    .run(JSON.stringify({ lang, text }), id)
}

export function mergeTranscriptGenerations(id: string, key: string, content: any): void {
  const db = getDb()
  const row = db.prepare(`SELECT generations FROM transcripts WHERE id = ?`).get(id) as
    | { generations: string | null }
    | undefined
  if (!row) return
  const current = parseJson<Record<string, any>>(row.generations) ?? {}
  current[key] = content
  db.prepare(`UPDATE transcripts SET generations = ? WHERE id = ?`).run(JSON.stringify(current), id)
}
