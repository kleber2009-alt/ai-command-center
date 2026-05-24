import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser, jsonError } from '@/lib/api'

const slideSchema = z.object({
  slide: z.coerce.number(),
  title: z.string().optional(),
  body: z.string(),
})

const updateSchema = z.object({
  cover_title: z.string().optional(),
  slides: z.array(slideSchema).optional(),
  caption: z.string().optional(),
  cta: z.string().optional(),
  design_prompt: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  status: z.string().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase.from('carousels').select('*').eq('id', params.id).single()
  if (error) return jsonError('Carousel not found', 404)
  return NextResponse.json({ carousel: data })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid body')

  const { data, error } = await supabase
    .from('carousels')
    .update(parsed.data)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ carousel: data })
}
