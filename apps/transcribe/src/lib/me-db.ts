import { getServerSupabase } from './transcripts-db'
import { getDb } from './db'

export type MeProfile = {
  bio: string
  projects: string
  academy: string
  social: string
  voice: string
  custom: Record<string, string>
  updated_at: string
}

export const EMPTY_PROFILE: MeProfile = {
  bio: '',
  projects: '',
  academy: '',
  social: '',
  voice: '',
  custom: {},
  updated_at: new Date(0).toISOString(),
}

export type MeDocumentRow = {
  id: string
  created_at: string
  title: string
  source_type: 'paste' | 'file' | 'transcript'
  source_meta: Record<string, any>
  char_count: number
  chunk_count: number
}

export type MeChunkMatch = {
  id: string
  document_id: string
  document_title: string
  chunk_index: number
  content: string
  similarity: number
}

export { getServerSupabase }

// Singleton me-profile row keyed by id='singleton' (single-tenant app).
// Backed by the `me_profile` table in the local `aio` Postgres instance.

const SINGLETON = 'singleton'

function rowToProfile(row: any): MeProfile {
  return {
    bio: row.bio ?? '',
    projects: row.projects ?? '',
    academy: row.academy ?? '',
    social: row.social ?? '',
    voice: row.voice ?? '',
    custom: row.custom ?? {},
    updated_at:
      typeof row.updated_at === 'string'
        ? row.updated_at
        : new Date(row.updated_at ?? 0).toISOString(),
  }
}

export async function loadProfile(): Promise<MeProfile> {
  const db = getDb()
  if (!db) return EMPTY_PROFILE
  try {
    const [row] = await db`SELECT * FROM me_profile WHERE id = ${SINGLETON}`
    return row ? rowToProfile(row) : EMPTY_PROFILE
  } catch (e: any) {
    console.warn('[me-db] loadProfile failed:', e?.message)
    return EMPTY_PROFILE
  }
}

export async function saveProfile(p: Partial<MeProfile>): Promise<MeProfile | null> {
  const db = getDb()
  if (!db) return null
  try {
    const [row] = await db`
      INSERT INTO me_profile (id, bio, projects, academy, social, voice, custom, updated_at)
      VALUES (
        ${SINGLETON}, ${p.bio ?? ''}, ${p.projects ?? ''}, ${p.academy ?? ''},
        ${p.social ?? ''}, ${p.voice ?? ''}, ${db.json(p.custom ?? {})}, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        bio        = EXCLUDED.bio,
        projects   = EXCLUDED.projects,
        academy    = EXCLUDED.academy,
        social     = EXCLUDED.social,
        voice      = EXCLUDED.voice,
        custom     = EXCLUDED.custom,
        updated_at = NOW()
      RETURNING *
    `
    return row ? rowToProfile(row) : null
  } catch (e: any) {
    console.warn('[me-db] saveProfile failed:', e?.message)
    return null
  }
}

export function profileToContext(p: MeProfile): string {
  const parts: string[] = []
  if (p.bio.trim()) parts.push(`## О пользователе\n${p.bio.trim()}`)
  if (p.projects.trim()) parts.push(`## Проекты\n${p.projects.trim()}`)
  if (p.academy.trim()) parts.push(`## Академия / знания\n${p.academy.trim()}`)
  if (p.social.trim()) parts.push(`## Соцсети\n${p.social.trim()}`)
  if (p.voice.trim()) parts.push(`## Голос и стиль\n${p.voice.trim()}`)
  const custom = Object.entries(p.custom ?? {}).filter(([, v]) => typeof v === 'string' && v.trim())
  for (const [k, v] of custom) parts.push(`## ${k}\n${v.trim()}`)
  return parts.join('\n\n')
}
