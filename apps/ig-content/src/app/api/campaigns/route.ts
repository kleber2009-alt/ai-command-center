import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser, jsonError } from '@/lib/api'

const createSchema = z.object({
  title: z.string().min(1),
  topic: z.string().optional(),
  goal: z.string().optional(),
  duration: z.coerce.number().int().refine((d) => [30, 60, 90].includes(d), {
    message: 'duration must be 30, 60 or 90',
  }),
  target_audience: z.string().optional(),
  offer: z.string().optional(),
  lead_magnet: z.string().optional(),
  tone_of_voice: z.string().optional(),
  cta: z.string().optional(),
  content_pillars: z.array(z.string()).optional(),
  formats: z.array(z.string()).optional(),
})

export async function GET() {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ campaigns: data })
}

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid body')

  const { data, error } = await supabase
    .from('campaigns')
    .insert({ ...parsed.data, user_id: user.id, status: 'active' })
    .select('*')
    .single()

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ campaign: data }, { status: 201 })
}
