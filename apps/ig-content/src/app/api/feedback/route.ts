import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser, jsonError } from '@/lib/api'

const feedbackSchema = z.object({
  content_id: z.string().uuid().optional(),
  content_type: z.enum(['reels', 'carousel']).optional(),
  rating: z.coerce.number().int().min(1).max(5),
  feedback_tags: z.array(z.string()).default([]),
  comment: z.string().max(2000).optional(),
})

// Stores a user rating (1-5) + reason tags for a generated content unit. These
// feed the RAG context (negative tags) and the weekly learning summary.
export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth

  const parsed = feedbackSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid body')

  const { data, error } = await supabase
    .from('feedback')
    .insert({ user_id: user.id, ...parsed.data })
    .select('*')
    .single()

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ feedback: data }, { status: 201 })
}
