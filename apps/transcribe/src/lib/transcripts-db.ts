import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getDb } from './db'

export type Paragraph = { text: string; start: number; end: number }

export type CarouselSlide = { n: number; title: string; body: string }
export type CarouselImageSlide = { n: number; title: string; body: string; imageUrl: string | null }
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
  'carousel-image'?: { slides: CarouselImageSlide[] }
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
  user_id: string | null
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

// Legacy no-op: kept so routes that check `if (!supabase)` degrade gracefully.
// All DB operations now go through postgres.js via getDb().
export function getServerSupabase(): SupabaseClient | null {
  return null
}

// --- Transcript operations ---

export async function dbSaveTranscript(data: {
  url: string
  title: string | null
  source: string | null
  language: string | null
  duration: number | null
  transcript: string
  paragraphs: Paragraph[]
  user_id: string | null
}): Promise<string | null> {
  const db = getDb()
  if (!db) return null
  try {
    const [row] = await db`
      INSERT INTO transcripts (url, title, source, language, duration, transcript, paragraphs, user_id)
      VALUES (
        ${data.url}, ${data.title}, ${data.source}, ${data.language}, ${data.duration},
        ${data.transcript}, ${db.json(data.paragraphs)}, ${data.user_id}
      )
      RETURNING id
    `
    return row.id as string
  } catch (e: any) {
    console.warn('[db] saveTranscript failed:', e?.message)
    return null
  }
}

export async function dbGetTranscript(id: string): Promise<TranscriptRow | null> {
  const db = getDb()
  if (!db) return null
  try {
    const [row] = await db`SELECT * FROM transcripts WHERE id = ${id}::uuid`
    return (row as TranscriptRow) ?? null
  } catch {
    return null
  }
}

export async function dbListTranscripts(limit = 30): Promise<TranscriptRow[]> {
  const db = getDb()
  if (!db) return []
  try {
    return (await db`
      SELECT id, created_at, url, title, source, language, duration, summary, translation, generations
      FROM transcripts
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as TranscriptRow[]
  } catch {
    return []
  }
}

export async function dbDeleteTranscript(id: string): Promise<boolean> {
  const db = getDb()
  if (!db) return false
  try {
    await db`DELETE FROM transcripts WHERE id = ${id}::uuid`
    return true
  } catch {
    return false
  }
}

export async function dbSaveSummary(id: string, summary: string, bullets: string[]): Promise<void> {
  const db = getDb()
  if (!db) return
  try {
    await db`
      UPDATE transcripts SET summary = ${summary}, bullets = ${db.json(bullets)}
      WHERE id = ${id}::uuid
    `
  } catch (e: any) {
    console.warn('[db] saveSummary failed:', e?.message)
  }
}

export async function dbSaveTranslation(id: string, translation: { lang: string; text: string }): Promise<void> {
  const db = getDb()
  if (!db) return
  try {
    await db`
      UPDATE transcripts SET translation = ${db.json(translation)}
      WHERE id = ${id}::uuid
    `
  } catch (e: any) {
    console.warn('[db] saveTranslation failed:', e?.message)
  }
}

export async function dbMergeGenerations(id: string, type: string, content: unknown): Promise<void> {
  const db = getDb()
  if (!db) return
  try {
    const patch = JSON.stringify({ [type]: content })
    await db`
      UPDATE transcripts
      SET generations = COALESCE(generations, '{}'::jsonb) || ${patch}::jsonb
      WHERE id = ${id}::uuid
    `
  } catch (e: any) {
    console.warn('[db] mergeGenerations failed:', e?.message)
  }
}
