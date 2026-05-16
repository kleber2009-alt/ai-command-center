import { createClient, SupabaseClient } from '@supabase/supabase-js'

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

let cached: SupabaseClient | null = null

function normalizeSupabaseUrl(raw: string): string {
  // Users sometimes paste the full REST endpoint
  // (https://xxx.supabase.co/rest/v1/) into the URL var. supabase-js
  // appends "/rest/v1/..." itself, so we strip any path/trailing slash
  // and keep just the origin.
  try {
    return new URL(raw).origin
  } catch {
    return raw.replace(/\/(rest\/v1\/?)?$/i, '').replace(/\/+$/, '')
  }
}

export function getServerSupabase(): SupabaseClient | null {
  if (cached) return cached
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!rawUrl || !key) return null
  cached = createClient(normalizeSupabaseUrl(rawUrl), key, { auth: { persistSession: false } })
  return cached
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
