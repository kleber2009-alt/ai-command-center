import { NextRequest, NextResponse } from 'next/server'
import { query, isConfigured } from '@/lib/transcripts-db'
import type { Task, TaskStatus, TaskPriority } from '@/lib/tasks-db'

type CreateBody = {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  stage?: string
}

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ items: [], configured: false })
  }
  try {
    const res = await query<Task>(
      `select * from tasks order by status asc, position asc, created_at asc`,
    )
    return NextResponse.json({ items: res?.rows ?? [], configured: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка чтения tasks' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'База данных не настроена' }, { status: 503 })
  }
  const body = (await req.json()) as CreateBody
  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title обязателен' }, { status: 400 })
  }

  const status = body.status ?? 'backlog'

  try {
    const res = await query<Task>(
      `insert into tasks (title, description, status, priority, stage, position)
       values (
         $1, $2, $3, $4, $5,
         coalesce((select max(position) + 1 from tasks where status = $3), 0)
       )
       returning *`,
      [
        body.title.trim(),
        body.description ?? null,
        status,
        body.priority ?? 'medium',
        body.stage ?? null,
      ],
    )
    return NextResponse.json(res?.rows[0])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка создания task' }, { status: 500 })
  }
}
