import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser, jsonError } from '@/lib/api'
import { ingestPublishedContent } from '@/lib/knowledge'

const metricsSchema = z.object({
  content_type: z.enum(['reels', 'carousel']),
  views: z.coerce.number().int().min(0).default(0),
  likes: z.coerce.number().int().min(0).default(0),
  comments: z.coerce.number().int().min(0).default(0),
  saves: z.coerce.number().int().min(0).default(0),
  shares: z.coerce.number().int().min(0).default(0),
  follows: z.coerce.number().int().min(0).default(0),
  leads: z.coerce.number().int().min(0).default(0),
  published_at: z.string().optional(),
})

// Records a metrics snapshot for one content unit (reels or carousel) on a day.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

  const parsed = metricsSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid body')

  const { data, error } = await supabase
    .from('metrics')
    .insert({
      content_day_id: params.id,
      ...parsed.data,
      published_at: parsed.data.published_at ?? new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) return jsonError(error.message, 500)

  // Recording metrics implies the unit went live.
  await supabase.from('content_days').update({ status: 'published' }).eq('id', params.id)

  // Grow the knowledge base: ingest the published unit with its real metrics
  // and performance score so future generations can learn from it.
  const { data: day } = await supabase
    .from('content_days')
    .select('topic, main_hook')
    .eq('id', params.id)
    .maybeSingle()

  let content: string | null = null
  let cta: string | null = null
  if (parsed.data.content_type === 'reels') {
    const { data: reel } = await supabase
      .from('reels')
      .select('main_script, caption, cta')
      .eq('content_day_id', params.id)
      .maybeSingle()
    content = [reel?.main_script, reel?.caption].filter(Boolean).join('\n\n') || null
    cta = reel?.cta ?? null
  } else {
    const { data: car } = await supabase
      .from('carousels')
      .select('slides, caption, cta')
      .eq('content_day_id', params.id)
      .maybeSingle()
    content = car ? `${JSON.stringify(car.slides)}\n\n${car.caption ?? ''}` : null
    cta = car?.cta ?? null
  }

  await ingestPublishedContent(supabase, user.id, {
    contentDayId: params.id,
    contentType: parsed.data.content_type,
    topic: day?.topic ?? null,
    hook: day?.main_hook ?? null,
    content,
    cta,
    metrics: {
      views: parsed.data.views,
      likes: parsed.data.likes,
      comments: parsed.data.comments,
      saves: parsed.data.saves,
      shares: parsed.data.shares,
      follows: parsed.data.follows,
      leads: parsed.data.leads,
    },
  })

  return NextResponse.json({ metric: data }, { status: 201 })
}
