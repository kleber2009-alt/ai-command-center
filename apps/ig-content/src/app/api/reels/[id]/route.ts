import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser, jsonError } from '@/lib/api'

const updateSchema = z.object({
  title: z.string().optional(),
  hooks: z.array(z.string()).optional(),
  main_script: z.string().optional(),
  video_structure: z.array(z.string()).optional(),
  b_roll_ideas: z.array(z.string()).optional(),
  caption: z.string().optional(),
  cta: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  visual_brief: z.string().optional(),
  status: z.string().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase.from('reels').select('*').eq('id', params.id).single()
  if (error) return jsonError('Reel not found', 404)
  return NextResponse.json({ reel: data })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid body')

  const { data, error } = await supabase
    .from('reels')
    .update(parsed.data)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ reel: data })
}
