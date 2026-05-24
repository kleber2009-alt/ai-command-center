import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
import { dbListTranscripts, type TranscriptRow } from '@/lib/transcripts-db'

type ArtifactKey = 'summary' | 'translation' | 'carousel' | 'carousel-image' | 'reels-new' | 'reels-remix' | 'tg-post'

function flagsFor(row: TranscriptRow): ArtifactKey[] {
  const flags: ArtifactKey[] = []
  if (row.summary) flags.push('summary')
  if (row.translation) flags.push('translation')
  const gens = row.generations ?? {}
  if (gens['carousel']) flags.push('carousel')
  if (gens['carousel-image']) flags.push('carousel-image')
  if (gens['reels-new']) flags.push('reels-new')
  if (gens['reels-remix']) flags.push('reels-remix')
  if (gens['tg-post']) flags.push('tg-post')
  return flags
}

export async function GET(req: NextRequest) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'history-list', max: 60, windowMs: 60_000 },
    requireInitData: false,
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

  const rows = await dbListTranscripts(30)
  if (rows.length === 0 && !process.env.DATABASE_URL) {
    return NextResponse.json({ items: [], configured: false })
  }

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
}
