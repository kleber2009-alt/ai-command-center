import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const ALLOWED_STATUS = ['done', 'in_progress', 'planned']

// POST /api/projects/:slug/milestones → создать новый этап
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const body = await req.json()
  const { title, notes, status, ordinal } = body
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  if (status && !ALLOWED_STATUS.includes(status)) {
    return NextResponse.json({ error: 'bad status' }, { status: 400 })
  }

  try {
    let finalOrdinal = ordinal
    if (finalOrdinal == null) {
      const { rows } = await db.query<{ max: number | null }>(
        `SELECT MAX(ordinal)::int AS max FROM project_milestones WHERE project_slug = $1`,
        [params.slug],
      )
      finalOrdinal = (rows[0]?.max ?? 0) + 1
    }

    const { rows } = await db.query(
      `INSERT INTO project_milestones (project_slug, ordinal, title, notes, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, ordinal, title, notes, status, created_at, updated_at`,
      [params.slug, finalOrdinal, title, notes ?? null, status ?? 'planned'],
    )
    return NextResponse.json(rows[0])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
