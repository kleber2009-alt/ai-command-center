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

export { getDb }

function rowToProfile(row: any): MeProfile {
  return {
    bio: row.bio ?? '',
    projects: row.projects ?? '',
    academy: row.academy ?? '',
    social: row.social ?? '',
    voice: row.voice ?? '',
    custom: row.custom ?? {},
    updated_at: (row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at) ?? new Date(0).toISOString(),
  }
}

export async function loadProfile(): Promise<MeProfile> {
  const sql = getDb()
  if (!sql) return EMPTY_PROFILE
  const rows = await sql`select * from me_profile where id = 'singleton'`
  if (rows.length === 0) return EMPTY_PROFILE
  return rowToProfile(rows[0])
}

export async function saveProfile(p: Partial<MeProfile>): Promise<MeProfile | null> {
  const sql = getDb()
  if (!sql) return null
  const rows = await sql`
    insert into me_profile (id, bio, projects, academy, social, voice, custom, updated_at)
    values (
      'singleton',
      ${p.bio ?? ''},
      ${p.projects ?? ''},
      ${p.academy ?? ''},
      ${p.social ?? ''},
      ${p.voice ?? ''},
      ${sql.json(p.custom ?? {})},
      now()
    )
    on conflict (id) do update set
      bio = excluded.bio,
      projects = excluded.projects,
      academy = excluded.academy,
      social = excluded.social,
      voice = excluded.voice,
      custom = excluded.custom,
      updated_at = now()
    returning *
  `
  if (rows.length === 0) return null
  return rowToProfile(rows[0])
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
