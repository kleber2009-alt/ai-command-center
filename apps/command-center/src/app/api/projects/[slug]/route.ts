import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const ALLOWED_STATUS = ['production', 'dev', 'paused', 'archived']

// GET /api/projects/:slug → проект + все milestones
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const [{ rows: pRows }, { rows: mRows }] = await Promise.all([
      db.query(
        `SELECT slug, name, emoji, tagline, status, description, technologies, links,
                sort_order, created_at, updated_at
         FROM projects WHERE slug = $1`,
        [params.slug],
      ),
      db.query(
        `SELECT id, ordinal, title, notes, status, completed_at, created_at, updated_at
         FROM project_milestones
         WHERE project_slug = $1
         ORDER BY ordinal, created_at`,
        [params.slug],
      ),
    ])
    if (!pRows.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ project: pRows[0], milestones: mRows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/projects/:slug → обновить редактируемые поля
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const body = await req.json()
  const allowed = ['name', 'emoji', 'tagline', 'status', 'description', 'technologies', 'links', 'sort_order']
  const sets: string[] = []
  const values: any[] = []
  for (const k of allowed) {
    if (k in body) {
      if (k === 'status' && !ALLOWED_STATUS.includes(body[k])) {
        return NextResponse.json({ error: 'bad status' }, { status: 400 })
      }
      values.push(k === 'links' ? JSON.stringify(body[k]) : body[k])
      sets.push(`${k} = $${values.length}`)
    }
  }
  if (!sets.length) return NextResponse.json({ error: 'no fields' }, { status: 400 })
  values.push(params.slug)
  try {
    const { rowCount } = await db.query(
      `UPDATE projects SET ${sets.join(', ')}, updated_at = NOW() WHERE slug = $${values.length}`,
      values,
    )
    if (!rowCount) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ slug: params.slug, updated: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/projects/:slug
export async function DELETE(_req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const { rowCount } = await db.query(`DELETE FROM projects WHERE slug = $1`, [params.slug])
    if (!rowCount) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ slug: params.slug, deleted: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
