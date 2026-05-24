import type { SupabaseClient } from '@supabase/supabase-js'
import type { Campaign } from '@/types/database'
import { embed, toVectorLiteral } from './embeddings'
import { performanceScore } from './scoring'
import { isDemo } from './demo/store'

export interface LibraryInput {
  type: string
  source?: string
  topic?: string | null
  hook?: string | null
  content?: string | null
  cta?: string | null
  format?: string | null
  visual_style?: string | null
  metrics?: Record<string, number>
}

interface RetrievedItem {
  id: string
  type: string
  source: string
  topic: string | null
  hook: string | null
  cta: string | null
  format: string | null
  performance_score: number
}

export interface RagContext {
  best: RetrievedItem[]
  worst: RetrievedItem[]
  learnings: { insight: string; learning_type: string; confidence: number }[]
  avoidTags: string[]
  text: string
}

// Flattens a library item into a single string for embedding / retrieval.
function libraryText(i: LibraryInput): string {
  return [i.type, i.source, i.topic, i.hook, i.content, i.cta, i.format, i.visual_style]
    .filter(Boolean)
    .join(' — ')
}

// Inserts one knowledge-base item (manual upload), embedding it when possible.
export async function ingestLibraryItem(
  supabase: SupabaseClient,
  userId: string,
  item: LibraryInput,
) {
  const score = item.metrics ? performanceScore(item.metrics) : 0
  const vec = await embed(libraryText(item))
  const row = {
    user_id: userId,
    type: item.type,
    source: item.source ?? 'own',
    topic: item.topic ?? null,
    hook: item.hook ?? null,
    content: item.content ?? null,
    cta: item.cta ?? null,
    format: item.format ?? null,
    visual_style: item.visual_style ?? null,
    metrics: item.metrics ?? {},
    performance_score: score,
    embedding: vec ? toVectorLiteral(vec) : null,
  }
  return supabase.from('content_library').insert(row).select('*').single()
}

// Upserts a published content unit into the library with its metrics + score,
// so the knowledge base grows automatically from real results.
export async function ingestPublishedContent(
  supabase: SupabaseClient,
  userId: string,
  args: {
    contentDayId: string
    contentType: 'reels' | 'carousel'
    topic: string | null
    hook: string | null
    content: string | null
    cta: string | null
    metrics: Record<string, number>
  },
) {
  if (isDemo()) return
  const score = performanceScore(args.metrics)
  const vec = await embed(
    libraryText({ type: args.contentType, topic: args.topic, hook: args.hook, content: args.content, cta: args.cta }),
  )
  const row = {
    user_id: userId,
    type: args.contentType,
    source: 'own',
    topic: args.topic,
    hook: args.hook,
    content: args.content,
    cta: args.cta,
    metrics: args.metrics,
    performance_score: score,
    embedding: vec ? toVectorLiteral(vec) : null,
    content_day_id: args.contentDayId,
    content_type: args.contentType,
  }
  await supabase
    .from('content_library')
    .upsert(row, { onConflict: 'content_day_id,content_type' })
    .then(undefined, (e: unknown) => console.error('ingest upsert failed:', e))
}

function mapItem(r: Record<string, unknown>): RetrievedItem {
  return {
    id: String(r.id),
    type: String(r.type ?? ''),
    source: String(r.source ?? 'own'),
    topic: (r.topic as string) ?? null,
    hook: (r.hook as string) ?? null,
    cta: (r.cta as string) ?? null,
    format: (r.format as string) ?? null,
    performance_score: Number(r.performance_score) || 0,
  }
}

// Builds the RAG context for a generation: top + bottom performing similar
// content, persistent learnings, and negative-feedback tags to avoid.
export async function retrieveContext(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  campaign?: Campaign | null,
): Promise<RagContext> {
  let candidates: RetrievedItem[] = []

  const vec = await embed(query)
  if (vec) {
    const { data, error } = await supabase.rpc('match_content_library', {
      query_embedding: toVectorLiteral(vec),
      match_count: 15,
    })
    if (!error && Array.isArray(data)) candidates = data.map(mapItem)
  }

  // Fallback (no embeddings / demo): rank the library by raw performance.
  if (candidates.length === 0) {
    const { data } = await supabase
      .from('content_library')
      .select('id, type, source, topic, hook, cta, format, performance_score')
      .order('performance_score', { ascending: false })
      .limit(15)
    if (Array.isArray(data)) candidates = data.map(mapItem)
  }

  const best = [...candidates]
    .sort((a, b) => b.performance_score - a.performance_score)
    .slice(0, 5)
  const bestIds = new Set(best.map((b) => b.id))
  const worst = [...candidates]
    .filter((c) => !bestIds.has(c.id))
    .sort((a, b) => a.performance_score - b.performance_score)
    .slice(0, 3)

  const { data: learningRows } = await supabase
    .from('agent_learnings')
    .select('insight, learning_type, confidence')
    .order('confidence', { ascending: false })
    .limit(10)
  const learnings = (learningRows ?? []).map((l: Record<string, unknown>) => ({
    insight: String(l.insight ?? ''),
    learning_type: String(l.learning_type ?? 'general'),
    confidence: Number(l.confidence) || 0,
  }))

  const { data: fbRows } = await supabase
    .from('feedback')
    .select('rating, feedback_tags')
    .order('created_at', { ascending: false })
    .limit(30)
  const avoidTags = Array.from(
    new Set(
      (fbRows ?? [])
        .filter((f: Record<string, unknown>) => Number(f.rating) <= 2)
        .flatMap((f: Record<string, unknown>) => (Array.isArray(f.feedback_tags) ? (f.feedback_tags as string[]) : [])),
    ),
  )

  return { best, worst, learnings, avoidTags, text: formatRagContext({ best, worst, learnings, avoidTags, campaign }) }
}

function fmtItem(i: RetrievedItem): string {
  const parts = [
    `[score ${i.performance_score}]`,
    i.hook ? `hook: "${i.hook}"` : null,
    i.topic ? `topic: "${i.topic}"` : null,
    i.format ? `format: ${i.format}` : null,
  ].filter(Boolean)
  return `- ${parts.join('  ')}`
}

function formatRagContext(ctx: {
  best: RetrievedItem[]
  worst: RetrievedItem[]
  learnings: { insight: string; learning_type: string; confidence: number }[]
  avoidTags: string[]
  campaign?: Campaign | null
}): string {
  const blocks: string[] = []

  if (ctx.best.length) {
    blocks.push(
      '## What worked before (emulate these patterns)\n' + ctx.best.map(fmtItem).join('\n'),
    )
  }
  if (ctx.worst.length) {
    blocks.push(
      '## What underperformed (avoid these patterns)\n' + ctx.worst.map(fmtItem).join('\n'),
    )
  }
  if (ctx.learnings.length) {
    blocks.push(
      '## Brand learnings (apply them)\n' +
        ctx.learnings.map((l) => `- (${l.learning_type}, conf ${l.confidence}) ${l.insight}`).join('\n'),
    )
  }
  if (ctx.avoidTags.length) {
    blocks.push('## Recent negative feedback to avoid\n- ' + ctx.avoidTags.join(', '))
  }
  if (ctx.campaign) {
    const c = ctx.campaign
    const rules = [
      c.tone_of_voice ? `Tone: ${c.tone_of_voice}` : null,
      c.offer ? `Offer to tie back to: ${c.offer}` : null,
      c.lead_magnet ? `Lead magnet: ${c.lead_magnet}` : null,
      c.cta ? `Signature CTA: ${c.cta}` : null,
    ].filter(Boolean)
    if (rules.length) blocks.push('## Brand rules\n- ' + rules.join('\n- '))
  }

  if (!blocks.length) return ''
  return (
    'Use the following knowledge from past performance and brand memory. ' +
    'Treat high-performing patterns as guidance and avoid low-performing ones.\n\n' +
    blocks.join('\n\n')
  )
}
