import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser, jsonError } from '@/lib/api'
import { ingestLibraryItem } from '@/lib/knowledge'

const itemSchema = z.object({
  type: z.enum([
    'reels', 'carousel', 'post', 'story', 'dm',
    'offer', 'case', 'review', 'prompt', 'reference', 'hook',
  ]),
  source: z.enum(['own', 'competitor', 'reference']).default('own'),
  topic: z.string().optional(),
  hook: z.string().optional(),
  content: z.string().optional(),
  cta: z.string().optional(),
  format: z.string().optional(),
  visual_style: z.string().optional(),
  metrics: z.record(z.coerce.number()).optional(),
})

// GET — list the user's knowledge-base items (newest first).
export async function GET() {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase
    .from('content_library')
    .select('id, type, source, topic, hook, cta, format, performance_score, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ items: data ?? [] })
}

// POST — add one item to the knowledge base (embedded for retrieval).
export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

  const parsed = itemSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid body')

  const { data, error } = await ingestLibraryItem(supabase, user.id, parsed.data)
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ item: data }, { status: 201 })
}
