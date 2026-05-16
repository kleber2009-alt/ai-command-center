import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/transcripts-db'
import type { TaskStatus, TaskPriority } from '@/lib/tasks-db'

type CreateBody = {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  stage?: string
}

export async function GET() {
  const supabase = getServerSupabase()
  if (!supabase) {
    return NextResponse.json({ items: [], configured: false })
  }
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('status', { ascending: true })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ items: data ?? [], configured: true })
}

export async function POST(req: NextRequest) {
  const supabase = getServerSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен' }, { status: 503 })
  }
  const body = (await req.json()) as CreateBody
  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title обязателен' }, { status: 400 })
  }

  // Place new task at the end of its status column.
  const status = body.status ?? 'backlog'
  const { data: last } = await supabase
    .from('tasks')
    .select('position')
    .eq('status', status)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPosition = (last?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: body.title.trim(),
      description: body.description ?? null,
      status,
      priority: body.priority ?? 'medium',
      stage: body.stage ?? null,
      position: nextPosition,
    })
    .select('*')
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
