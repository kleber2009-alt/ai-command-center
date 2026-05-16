import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
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
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ error: 'Postgres не настроен' }, { status: 503 })
  }
  const body = (await req.json()) as PatchBody

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

  try {
    const rows = await sql`
      update tasks set ${sql(update)}
      where id = ${params.id}
      returning *
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
    }
    return NextResponse.json(rows[0])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ error: 'Postgres не настроен' }, { status: 503 })
  }
  try {
    await sql`delete from tasks where id = ${params.id}`
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
