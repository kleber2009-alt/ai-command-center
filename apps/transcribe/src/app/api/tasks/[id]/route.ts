import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
import { getServerSupabase } from '@/lib/transcripts-db'
import type { TaskStatus, TaskPriority, TaskProject } from '@/lib/tasks-db'

type PatchBody = Partial<{
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  stage: string | null
  position: number
  project: TaskProject
}>

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'tasks-mod', max: 30, windowMs: 60_000 },
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

  const supabase = getServerSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен' }, { status: 503 })
  }
  const body = (await req.json()) as PatchBody

  // Whitelist allowed fields
  const update: Record<string, unknown> = {}
  if (typeof body.title === 'string') update.title = body.title
  if (body.description === null || typeof body.description === 'string') update.description = body.description
  if (body.status) update.status = body.status
  if (body.priority) update.priority = body.priority
  if (body.stage === null || typeof body.stage === 'string') update.stage = body.stage
  if (typeof body.position === 'number') update.position = body.position
  if (body.project) update.project = body.project

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(update)
    .eq('id', params.id)
    .select('*')
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'tasks-mod', max: 30, windowMs: 60_000 },
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

  const supabase = getServerSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен' }, { status: 503 })
  }
  const { error } = await supabase.from('tasks').delete().eq('id', params.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
