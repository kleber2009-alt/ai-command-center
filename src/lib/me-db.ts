import { isDbConfigured, query, queryOne } from './db'

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

type ProfileRow = {
  bio: string | null
  projects: string | null
  academy: string | null
  social: string | null
  voice: string | null
  custom: Record<string, string> | null
  updated_at: string | null
}

function rowToProfile(row: ProfileRow | null): MeProfile {
  if (!row) return EMPTY_PROFILE
  return {
    bio: row.bio ?? '',
    projects: row.projects ?? '',
    academy: row.academy ?? '',
    social: row.social ?? '',
    voice: row.voice ?? '',
    custom: row.custom ?? {},
    updated_at: row.updated_at ?? new Date(0).toISOString(),
  }
}

export async function loadProfile(): Promise<MeProfile> {
  if (!isDbConfigured()) return EMPTY_PROFILE
  try {
    const row = await queryOne<ProfileRow>(
      `select bio, projects, academy, social, voice, custom, updated_at
       from me_profile where id = 'singleton'`,
    )
    return rowToProfile(row)
  } catch (e: any) {
    console.warn('[me-db] loadProfile failed:', e?.message)
    return EMPTY_PROFILE
  }
}

export async function saveProfile(p: Partial<MeProfile>): Promise<MeProfile | null> {
  if (!isDbConfigured()) return null
  try {
    const row = await queryOne<ProfileRow>(
      `insert into me_profile (id, bio, projects, academy, social, voice, custom, updated_at)
       values ('singleton', $1, $2, $3, $4, $5, $6::jsonb, now())
       on conflict (id) do update set
         bio = excluded.bio,
         projects = excluded.projects,
         academy = excluded.academy,
         social = excluded.social,
         voice = excluded.voice,
         custom = excluded.custom,
         updated_at = excluded.updated_at
       returning bio, projects, academy, social, voice, custom, updated_at`,
      [
        p.bio ?? null,
        p.projects ?? null,
        p.academy ?? null,
        p.social ?? null,
        p.voice ?? null,
        JSON.stringify(p.custom ?? {}),
      ],
    )
    return rowToProfile(row)
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

// Re-export db helpers so callers don't need to import from two places.
export { query, queryOne, isDbConfigured } from './db'
