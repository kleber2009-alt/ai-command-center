import { NextRequest, NextResponse } from 'next/server'
import { query, isConfigured } from '@/lib/transcripts-db'
import type { Task, TaskStatus, TaskPriority } from '@/lib/tasks-db'

type PatchBody = Partial<{
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  stage: string | null
  position: number
}>

const ALLOWED = ['title', 'description', 'status', 'priority', 'stage', 'position'] as const

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'База данных не настроена' }, { status: 503 })
  }
  const body = (await req.json()) as PatchBody

  // Whitelist + динамический набор колонок → параметризованный UPDATE.
  const sets: string[] = []
  const values: any[] = []
  for (const key of ALLOWED) {
    const v = (body as any)[key]
    if (key === 'title' && typeof v === 'string') {
      values.push(v); sets.push(`title = $${values.length}`)
    } else if (key === 'description' && (v === null || typeof v === 'string')) {
      values.push(v); sets.push(`description = $${values.length}`)
    } else if (key === 'status' && typeof v === 'string') {
      values.push(v); sets.push(`status = $${values.length}`)
    } else if (key === 'priority' && typeof v === 'string') {
      values.push(v); sets.push(`priority = $${values.length}`)
    } else if (key === 'stage' && (v === null || typeof v === 'string')) {
      values.push(v); sets.push(`stage = $${values.length}`)
    } else if (key === 'position' && typeof v === 'number') {
      values.push(v); sets.push(`position = $${values.length}`)
    }
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
  }
  values.push(params.id)

  try {
    const res = await query<Task>(
      `update tasks set ${sets.join(', ')} where id = $${values.length} returning *`,
      values,
    )
    if (!res?.rows[0]) {
      return NextResponse.json({ error: 'Task не найден' }, { status: 404 })
    }
    return NextResponse.json(res.rows[0])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка обновления' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'База данных не настроена' }, { status: 503 })
  }
  try {
    await query(`delete from tasks where id = $1`, [params.id])
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка удаления' }, { status: 500 })
  }
}
