import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
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
  const guard = guardRequest(req, {
    rateLimit: { key: 'tasks-list', max: 60, windowMs: 60_000 },
    requireInitData: false,
  })
  if (!guard.ok) return guard.response

  const db = getDb()
  if (!db) return NextResponse.json({ items: [], configured: false })

  const project = req.nextUrl.searchParams.get('project')
  try {
    const items = project
      ? await db`
          SELECT * FROM tasks
          WHERE project = ${project}
          ORDER BY status ASC, position ASC, created_at ASC
        `
      : await db`
          SELECT * FROM tasks
          ORDER BY status ASC, position ASC, created_at ASC
        `
    return NextResponse.json({ items, configured: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'db_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'tasks-create', max: 30, windowMs: 60_000 },
    requireInitData: false,
  })
  if (!guard.ok) return guard.response

  const db = getDb()
  if (!db) return NextResponse.json({ error: 'db_unavailable' }, { status: 503 })

  const body = (await req.json()) as CreateBody
  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title обязателен' }, { status: 400 })
  }

  const status: TaskStatus = body.status ?? 'backlog'
  try {
    // Place new task at the end of its status column.
    const [last] = await db`
      SELECT position FROM tasks WHERE status = ${status}
      ORDER BY position DESC LIMIT 1
    `
    const nextPosition = (last?.position ?? -1) + 1

    const [row] = await db`
      INSERT INTO tasks (title, description, status, priority, stage, project, position)
      VALUES (
        ${body.title.trim()},
        ${body.description ?? null},
        ${status},
        ${body.priority ?? 'medium'},
        ${body.stage ?? null},
        ${body.project ?? 'general'},
        ${nextPosition}
      )
      RETURNING *
    `
    return NextResponse.json(row)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'db_error' }, { status: 500 })
  }
}
