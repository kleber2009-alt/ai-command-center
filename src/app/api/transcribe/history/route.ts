import { NextResponse } from 'next/server'
import { isDbConfigured, queryMany } from '@/lib/db'

type ArtifactKey = 'summary' | 'translation' | 'carousel' | 'reels-new' | 'reels-remix' | 'tg-post'

type RawRow = {
  id: string
  created_at: string
  url: string
  title: string | null
  source: string | null
  language: string | null
  duration: number | null
  summary: string | null
  translation: { lang: string; text: string } | null
  generations: Record<string, unknown> | null
}

function flagsFor(row: RawRow): ArtifactKey[] {
  const flags: ArtifactKey[] = []
  if (row.summary) flags.push('summary')
  if (row.translation) flags.push('translation')
  const gens = row.generations ?? {}
  if (gens['carousel']) flags.push('carousel')
  if (gens['reels-new']) flags.push('reels-new')
  if (gens['reels-remix']) flags.push('reels-remix')
  if (gens['tg-post']) flags.push('tg-post')
  return flags
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ items: [], configured: false })
  }
  try {
    const rows = await queryMany<RawRow>(
      `select id, created_at, url, title, source, language, duration,
              summary, translation, generations
       from transcripts
       order by created_at desc
       limit 30`,
    )
    const items = rows.map(row => ({
      id: row.id,
      created_at: row.created_at,
      url: row.url,
      title: row.title,
      source: row.source,
      language: row.language,
      duration: row.duration,
      artifacts: flagsFor(row),
    }))
    return NextResponse.json({ items, configured: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка получения истории' }, { status: 500 })
  }
}
