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
  user_id: string
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
    `INSERT INTO transcripts (id, user_id, url, title, source, language, duration, transcript, paragraphs)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.user_id,
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

export function getTranscript(id: string, user_id: string): TranscriptRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM transcripts WHERE id = ? AND user_id = ?`)
    .get(id, user_id) as RawTranscriptRow | undefined
  return row ? hydrate(row) : null
}

export function deleteTranscript(id: string, user_id: string): boolean {
  const info = getDb()
    .prepare(`DELETE FROM transcripts WHERE id = ? AND user_id = ?`)
    .run(id, user_id)
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
  in_brain: 0 | 1
}

export function listTranscripts(user_id: string, limit = 20): TranscriptListItem[] {
  return getDb()
    .prepare(
      `SELECT t.id, t.created_at, t.url, t.title, t.source, t.language, t.duration,
              EXISTS (
                SELECT 1 FROM me_documents d
                WHERE d.source_type = 'transcript'
                  AND d.user_id = t.user_id
                  AND json_extract(d.source_meta, '$.transcript_id') = t.id
              ) AS in_brain
       FROM transcripts t
       WHERE t.user_id = ?
       ORDER BY t.created_at DESC
       LIMIT ?`,
    )
    .all(user_id, limit) as TranscriptListItem[]
}

export type MaterialItem = {
  transcript_id: string
  created_at: string
  url: string
  title: string | null
  source: string | null
  types: Array<'carousel' | 'reels-new' | 'reels-remix' | 'tg-post'>
  generations: Generations
}

export function listMaterials(user_id: string, limit = 100): MaterialItem[] {
  const rows = getDb()
    .prepare(
      `SELECT id, created_at, url, title, source, generations
       FROM transcripts
       WHERE user_id = ?
         AND generations IS NOT NULL AND generations != '{}' AND generations != 'null'
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(user_id, limit) as Array<{
    id: string
    created_at: string
    url: string
    title: string | null
    source: string | null
    generations: string | null
  }>
  return rows
    .map((r) => {
      const generations = parseJson<Generations>(r.generations) ?? {}
      const types = (['carousel', 'reels-new', 'reels-remix', 'tg-post'] as const).filter(
        (k) => generations[k] != null,
      )
      return {
        transcript_id: r.id,
        created_at: r.created_at,
        url: r.url,
        title: r.title,
        source: r.source,
        types: types as MaterialItem['types'],
        generations,
      }
    })
    .filter((m) => m.types.length > 0)
}

export function updateTranscriptSummary(
  id: string,
  user_id: string,
  summary: string,
  bullets: string[],
): void {
  getDb()
    .prepare(`UPDATE transcripts SET summary = ?, bullets = ? WHERE id = ? AND user_id = ?`)
    .run(summary, JSON.stringify(bullets), id, user_id)
}

export function updateTranscriptTranslation(
  id: string,
  user_id: string,
  lang: string,
  text: string,
): void {
  getDb()
    .prepare(`UPDATE transcripts SET translation = ? WHERE id = ? AND user_id = ?`)
    .run(JSON.stringify({ lang, text }), id, user_id)
}

export function mergeTranscriptGenerations(
  id: string,
  user_id: string,
  key: string,
  content: any,
): void {
  const db = getDb()
  const row = db
    .prepare(`SELECT generations FROM transcripts WHERE id = ? AND user_id = ?`)
    .get(id, user_id) as { generations: string | null } | undefined
  if (!row) return
  const current = parseJson<Record<string, any>>(row.generations) ?? {}
  current[key] = content
  db.prepare(`UPDATE transcripts SET generations = ? WHERE id = ? AND user_id = ?`).run(
    JSON.stringify(current),
    id,
    user_id,
  )
}
