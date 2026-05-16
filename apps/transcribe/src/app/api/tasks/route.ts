import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import type { TaskStatus, TaskPriority, TaskProject } from '@/lib/tasks-db'

type CreateBody = {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  stage?: string
  project?: TaskProject
}

export async function GET(req: NextRequest) {
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ items: [], configured: false })
  }
  const project = req.nextUrl.searchParams.get('project')
  try {
    const rows = project
      ? await sql`
          select * from tasks
          where project = ${project}
          order by status asc, position asc, created_at asc
        `
      : await sql`
          select * from tasks
          order by status asc, position asc, created_at asc
        `
    return NextResponse.json({ items: rows, configured: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ error: 'Postgres не настроен' }, { status: 503 })
  }
  const body = (await req.json()) as CreateBody
  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title обязателен' }, { status: 400 })
  }

  const status = body.status ?? 'backlog'

  try {
    const lastRows = await sql`
      select position from tasks where status = ${status}
      order by position desc limit 1
    `
    const nextPosition = (lastRows[0]?.position ?? -1) + 1

    const inserted = await sql`
      insert into tasks (title, description, status, priority, stage, project, position)
      values (
        ${body.title.trim()},
        ${body.description ?? null},
        ${status},
        ${body.priority ?? 'medium'},
        ${body.stage ?? null},
        ${body.project ?? 'general'},
        ${nextPosition}
      )
      returning *
    `
    return NextResponse.json(inserted[0])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
