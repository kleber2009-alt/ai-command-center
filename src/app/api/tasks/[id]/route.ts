import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured, query, queryOne } from '@/lib/db'
import type { Task, TaskStatus, TaskPriority } from '@/lib/tasks-db'

type PatchBody = Partial<{
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  stage: string | null
  position: number
}>

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'DATABASE_URL не настроен' }, { status: 503 })
  }
  const body = (await req.json()) as PatchBody

  const sets: string[] = []
  const values: unknown[] = []
  let i = 1
  const push = (col: string, val: unknown) => {
    sets.push(`${col} = $${i}`)
    values.push(val)
    i++
  }

  if (typeof body.title === 'string') push('title', body.title)
  if (body.description === null || typeof body.description === 'string') push('description', body.description)
  if (body.status) push('status', body.status)
  if (body.priority) push('priority', body.priority)
  if (body.stage === null || typeof body.stage === 'string') push('stage', body.stage)
  if (typeof body.position === 'number') push('position', body.position)

  if (sets.length === 0) {
    return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
  }

  values.push(params.id)
  try {
    const row = await queryOne<Task>(
      `update tasks set ${sets.join(', ')} where id = $${i} returning *`,
      values,
    )
    if (!row) {
      return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 })
    }
    return NextResponse.json(row)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка БД' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'DATABASE_URL не настроен' }, { status: 503 })
  }
  try {
    await query(`delete from tasks where id = $1`, [params.id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка БД' }, { status: 500 })
  }
}
