import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const ALLOWED_STATUS = ['done', 'in_progress', 'planned']

// PATCH /api/milestones/:id → обновить status / title / notes / ordinal
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const allowed = ['title', 'notes', 'status', 'ordinal']
  const sets: string[] = []
  const values: any[] = []
  for (const k of allowed) {
    if (k in body) {
      if (k === 'status' && !ALLOWED_STATUS.includes(body[k])) {
        return NextResponse.json({ error: 'bad status' }, { status: 400 })
      }
      values.push(body[k])
      sets.push(`${k} = $${values.length}`)
    }
  }
  if (!sets.length) return NextResponse.json({ error: 'no fields' }, { status: 400 })

  // completed_at автоматически выставляем при переходе в done
  if ('status' in body) {
    if (body.status === 'done') sets.push(`completed_at = NOW()`)
    else sets.push(`completed_at = NULL`)
  }

  values.push(params.id)
  try {
    const { rows } = await db.query(
      `UPDATE project_milestones SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id, project_slug, ordinal, title, notes, status, completed_at, updated_at`,
      values,
    )
    if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/milestones/:id
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { rowCount } = await db.query(
      `DELETE FROM project_milestones WHERE id = $1`,
      [params.id],
    )
    if (!rowCount) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ id: params.id, deleted: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
