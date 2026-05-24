import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser, jsonError } from '@/lib/api'
import { CONTENT_DAY_STATUSES } from '@/lib/templates'

const updateSchema = z.object({
  topic: z.string().optional(),
  main_hook: z.string().optional(),
  daily_meaning: z.string().optional(),
  cta: z.string().optional(),
  reels_idea: z.string().optional(),
  carousel_idea: z.string().optional(),
  date: z.string().optional(),
  status: z.enum(CONTENT_DAY_STATUSES).optional(),
})

// Returns a day plus its campaign, reel, carousel and metrics in one shot.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data: day, error } = await supabase
    .from('content_days')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !day) return jsonError('Content day not found', 404)

  const [{ data: campaign }, { data: reel }, { data: carousel }, { data: metrics }] =
    await Promise.all([
      supabase.from('campaigns').select('*').eq('id', day.campaign_id).single(),
      supabase.from('reels').select('*').eq('content_day_id', day.id).maybeSingle(),
      supabase.from('carousels').select('*').eq('content_day_id', day.id).maybeSingle(),
      supabase.from('metrics').select('*').eq('content_day_id', day.id),
    ])

  return NextResponse.json({ day, campaign, reel, carousel, metrics: metrics ?? [] })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid body')

  const { data, error } = await supabase
    .from('content_days')
    .update(parsed.data)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ day: data })
}
