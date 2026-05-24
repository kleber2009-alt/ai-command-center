import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser, jsonError } from '@/lib/api'

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  topic: z.string().optional(),
  goal: z.string().optional(),
  duration: z.coerce.number().int().optional(),
  target_audience: z.string().optional(),
  offer: z.string().optional(),
  lead_magnet: z.string().optional(),
  tone_of_voice: z.string().optional(),
  cta: z.string().optional(),
  content_pillars: z.array(z.string()).optional(),
  formats: z.array(z.string()).optional(),
  status: z.string().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error) return jsonError('Campaign not found', 404)
  return NextResponse.json({ campaign: data })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid body')

  const { data, error } = await supabase
    .from('campaigns')
    .update(parsed.data)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ campaign: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { error } = await supabase.from('campaigns').delete().eq('id', params.id)
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true })
}
