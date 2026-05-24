import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
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
  const guard = guardRequest(req, {
    rateLimit: { key: 'tasks-mod', max: 30, windowMs: 60_000 },
    requireInitData: false,
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

  const db = getDb()
  if (!db) return NextResponse.json({ error: 'db_unavailable' }, { status: 503 })

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
    const [row] = await db`
      UPDATE tasks SET ${db(update)} WHERE id = ${params.id}::uuid
      RETURNING *
    `
    if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'db_error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'tasks-mod', max: 30, windowMs: 60_000 },
    requireInitData: false,
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

  const db = getDb()
  if (!db) return NextResponse.json({ error: 'db_unavailable' }, { status: 503 })

  try {
    await db`DELETE FROM tasks WHERE id = ${params.id}::uuid`
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'db_error' }, { status: 500 })
  }
}
