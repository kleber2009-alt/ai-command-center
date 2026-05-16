import { getServerSupabase } from './transcripts-db'

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

export async function loadProfile(): Promise<MeProfile> {
  const supabase = getServerSupabase()
  if (!supabase) return EMPTY_PROFILE
  const { data } = await supabase.from('me_profile').select('*').eq('id', 'singleton').single()
  if (!data) return EMPTY_PROFILE
  return {
    bio: data.bio ?? '',
    projects: data.projects ?? '',
    academy: data.academy ?? '',
    social: data.social ?? '',
    voice: data.voice ?? '',
    custom: data.custom ?? {},
    updated_at: data.updated_at ?? new Date(0).toISOString(),
  }
}

export async function saveProfile(p: Partial<MeProfile>): Promise<MeProfile | null> {
  const supabase = getServerSupabase()
  if (!supabase) return null
  const { data } = await supabase
    .from('me_profile')
    .upsert(
      {
        id: 'singleton',
        bio: p.bio,
        projects: p.projects,
        academy: p.academy,
        social: p.social,
        voice: p.voice,
        custom: p.custom,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select()
    .single()
  if (!data) return null
  return {
    bio: data.bio ?? '',
    projects: data.projects ?? '',
    academy: data.academy ?? '',
    social: data.social ?? '',
    voice: data.voice ?? '',
    custom: data.custom ?? {},
    updated_at: data.updated_at ?? new Date().toISOString(),
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
