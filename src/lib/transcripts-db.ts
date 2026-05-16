// ═══════════════════════════════════════════════════════════════════
// transcripts-db.ts — Postgres-backed transcripts DAO
// ───────────────────────────────────────────────────────────────────
// Previously talked to Supabase via @supabase/supabase-js. After
// self-hosting migration, talks directly to Postgres via `pg`.
// The exported API surface (`getTranscriptsDb`, makeTitle, types)
// is preserved as much as possible so route handlers don't need to
// change their flow significantly.
// ═══════════════════════════════════════════════════════════════════

import { Pool, type PoolClient } from 'pg'

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

let pool: Pool | null = null

function getPool(): Pool | null {
  if (pool) return pool
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) return null
  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
  pool.on('error', (err) => console.error('[db] idle client error:', err.message))
  return pool
}

/**
 * Returns a tiny query API or `null` when DATABASE_URL is not set
 * (so dev environments can run without a database — features just
 * gracefully no-op like they did with Supabase).
 */
export function getTranscriptsDb() {
  const p = getPool()
  if (!p) return null
  return {
    async listRecent(limit = 20): Promise<Pick<TranscriptRow, 'id' | 'created_at' | 'url' | 'title' | 'source' | 'language' | 'duration'>[]> {
      const { rows } = await p.query(
        `select id, created_at, url, title, source, language, duration
           from transcripts
          order by created_at desc
          limit $1`,
        [limit],
      )
      return rows
    },

    async getById(id: string): Promise<TranscriptRow | null> {
      const { rows } = await p.query<TranscriptRow>(
        'select * from transcripts where id = $1',
        [id],
      )
      return rows[0] || null
    },

    async deleteById(id: string): Promise<boolean> {
      const res = await p.query('delete from transcripts where id = $1', [id])
      return (res.rowCount ?? 0) > 0
    },

    async insertTranscript(input: {
      url: string
      title: string
      source: string | null
      language: string | null
      duration: number | null
      transcript: string
      paragraphs: Paragraph[]
    }): Promise<string | null> {
      const { rows } = await p.query<{ id: string }>(
        `insert into transcripts
           (url, title, source, language, duration, transcript, paragraphs)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb)
         returning id`,
        [
          input.url,
          input.title,
          input.source,
          input.language,
          input.duration,
          input.transcript,
          JSON.stringify(input.paragraphs),
        ],
      )
      return rows[0]?.id ?? null
    },

    async updateSummary(id: string, summary: string, bullets: string[]): Promise<void> {
      await p.query(
        'update transcripts set summary = $2, bullets = $3::jsonb where id = $1',
        [id, summary, JSON.stringify(bullets)],
      )
    },

    async updateTranslation(id: string, translation: { lang: string; text: string }): Promise<void> {
      await p.query(
        'update transcripts set translation = $2::jsonb where id = $1',
        [id, JSON.stringify(translation)],
      )
    },

    /** Patch one key inside the `generations` jsonb column. */
    async updateGeneration(id: string, key: keyof Generations, value: unknown): Promise<void> {
      await p.query(
        `update transcripts
            set generations = coalesce(generations, '{}'::jsonb)
                              || jsonb_build_object($2::text, $3::jsonb)
          where id = $1`,
        [id, key, JSON.stringify(value)],
      )
    },
  }
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

// ═══════════════════════════════════════════════════════════════════
// Back-compat shim: `getServerSupabase()` used to return a thenable
// query builder. Route handlers call `.from('transcripts').insert(...)`
// etc. We keep the export name as a stub returning `null` — every
// route handler must be updated to use `getTranscriptsDb()` instead.
//
// If you see this called from production code: it's a leftover migration
// site and should be updated. Greppable marker: AIO_MIGRATION_PENDING.
// ═══════════════════════════════════════════════════════════════════
export function getServerSupabase(): null {
  return null
}
