import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured, queryMany, queryOne } from '@/lib/db'
import type { Task, TaskStatus, TaskPriority } from '@/lib/tasks-db'

type CreateBody = {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  stage?: string
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ items: [], configured: false })
  }
  try {
    const items = await queryMany<Task>(
      `select * from tasks
       order by
         case status
           when 'backlog' then 1
           when 'in_progress' then 2
           when 'blocked' then 3
           when 'done' then 4
           else 5
         end,
         position asc,
         created_at asc`,
    )
    return NextResponse.json({ items, configured: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка БД' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'DATABASE_URL не настроен' }, { status: 503 })
  }
  const body = (await req.json()) as CreateBody
  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title обязателен' }, { status: 400 })
  }

  const status = body.status ?? 'backlog'
  try {
    const last = await queryOne<{ position: number }>(
      `select position from tasks where status = $1 order by position desc limit 1`,
      [status],
    )
    const nextPosition = (last?.position ?? -1) + 1

    const row = await queryOne<Task>(
      `insert into tasks (title, description, status, priority, stage, position)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [
        body.title.trim(),
        body.description ?? null,
        status,
        body.priority ?? 'medium',
        body.stage ?? null,
        nextPosition,
      ],
    )
    return NextResponse.json(row)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка БД' }, { status: 500 })
  }
}
