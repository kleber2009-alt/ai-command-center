export type Paragraph = { text: string; start: number; end: number }
export type Source = 'youtube' | 'deepgram' | 'ytdlp+deepgram'

export type CarouselContent = {
  slides: Array<{ n: number; title: string; body: string }>
}
export type ReelsContent = {
  hook: string
  promise: string
  body: Array<{ time: string; text: string }>
  cta: string
  text_on_screen: string[]
  caption: string
  hashtags: string[]
}
export type TgPostContent = { text: string }

export type GenType = 'carousel' | 'reels-new' | 'reels-remix' | 'tg-post'
export type Generations = {
  carousel?: CarouselContent
  'reels-new'?: ReelsContent
  'reels-remix'?: ReelsContent
  'tg-post'?: TgPostContent
}

export type Summary = { summary: string; bullets: string[] }
export type Translation = { text: string; lang: 'ru' | 'en' }

export type Artifact = 'summary' | 'translation' | 'carousel' | 'reels-new' | 'reels-remix' | 'tg-post'

export type HistoryItem = {
  id: string
  created_at: string
  url: string
  title: string | null
  source: string | null
  language: string | null
  duration: number | null
  artifacts: Artifact[]
}

export type TranscriptData = {
  id: string
  url: string
  transcript: string
  paragraphs: Paragraph[]
  duration: number | null
  detectedLanguage: string | null
  source: Source
  title?: string | null
  summary?: string | null
  bullets?: string[] | null
  translation?: { text: string; lang: 'ru' | 'en' } | null
  generations?: Generations | null
}

export const ARTIFACT_LABELS: Record<Artifact, { label: string; color: string }> = {
  summary:       { label: 'саммари',     color: 'bg-violet-500/10 text-violet-300 border-violet-500/20' },
  translation:   { label: 'перевод',     color: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
  carousel:      { label: 'карусель',    color: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' },
  'reels-new':   { label: 'рилс',        color: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20' },
  'reels-remix': { label: 'рилс-ремикс', color: 'bg-pink-500/10 text-pink-300 border-pink-500/20' },
  'tg-post':     { label: 'TG-пост',     color: 'bg-sky-500/10 text-sky-300 border-sky-500/20' },
}
