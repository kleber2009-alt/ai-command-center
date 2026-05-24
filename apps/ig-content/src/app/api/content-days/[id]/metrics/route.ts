import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser, jsonError } from '@/lib/api'

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
  const { supabase } = auth

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

  return NextResponse.json({ metric: data }, { status: 201 })
}
