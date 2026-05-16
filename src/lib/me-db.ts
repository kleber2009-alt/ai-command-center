// ═══════════════════════════════════════════════════════════════════
// src/lib/me-db.ts
// ───────────────────────────────────────────────────────────────────
// Профиль "обо мне" + типы для документов и чанков RAG-системы.
// Сами CRUD-запросы переписаны на pg в route-хендлерах.
// ═══════════════════════════════════════════════════════════════════

import { query, isConfigured } from './db'

export { isConfigured }

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

function rowToProfile(row: ProfileRow | undefined): MeProfile {
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
  const res = await query<ProfileRow>(
    `select bio, projects, academy, social, voice, custom, updated_at
       from me_profile where id = 'singleton'`,
  )
  if (!res) return EMPTY_PROFILE
  return rowToProfile(res.rows[0])
}

export async function saveProfile(p: Partial<MeProfile>): Promise<MeProfile | null> {
  // Upsert по id='singleton'. Незаданные поля не перезаписываются —
  // coalesce оставит существующее значение если в payload null.
  const res = await query<ProfileRow>(
    `insert into me_profile (id, bio, projects, academy, social, voice, custom, updated_at)
     values ('singleton', $1, $2, $3, $4, $5, $6::jsonb, now())
     on conflict (id) do update set
       bio        = coalesce(excluded.bio,      me_profile.bio),
       projects   = coalesce(excluded.projects, me_profile.projects),
       academy    = coalesce(excluded.academy,  me_profile.academy),
       social     = coalesce(excluded.social,   me_profile.social),
       voice      = coalesce(excluded.voice,    me_profile.voice),
       custom     = coalesce(excluded.custom,   me_profile.custom),
       updated_at = now()
     returning bio, projects, academy, social, voice, custom, updated_at`,
    [
      p.bio ?? null,
      p.projects ?? null,
      p.academy ?? null,
      p.social ?? null,
      p.voice ?? null,
      p.custom ? JSON.stringify(p.custom) : null,
    ],
  )
  if (!res) return null
  return rowToProfile(res.rows[0])
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
