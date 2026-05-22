import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/projects → все проекты с агрегатами по milestones
export async function GET() {
  try {
    const { rows } = await db.query(
      `SELECT
         p.slug, p.name, p.emoji, p.tagline, p.status, p.description,
         p.technologies, p.links, p.sort_order, p.created_at, p.updated_at,
         COALESCE(m.total, 0)::int AS milestones_total,
         COALESCE(m.done, 0)::int  AS milestones_done
       FROM projects p
       LEFT JOIN (
         SELECT project_slug,
                COUNT(*)                       AS total,
                COUNT(*) FILTER (WHERE status='done') AS done
         FROM project_milestones
         GROUP BY project_slug
       ) m ON m.project_slug = p.slug
       ORDER BY p.sort_order, p.name`,
    )
    return NextResponse.json({ projects: rows })
  } catch (e: any) {
    return NextResponse.json({ projects: [], error: e.message }, { status: 500 })
  }
}

// POST /api/projects → создать новый проект
const ALLOWED_STATUS = ['production', 'dev', 'paused', 'archived']
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { slug, name, emoji, tagline, status, description, technologies, links, sort_order } = body
  if (!slug || !name) return NextResponse.json({ error: 'slug & name required' }, { status: 400 })
  if (status && !ALLOWED_STATUS.includes(status)) {
    return NextResponse.json({ error: 'bad status' }, { status: 400 })
  }
  try {
    await db.query(
      `INSERT INTO projects (slug, name, emoji, tagline, status, description, technologies, links, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [slug, name, emoji ?? '🚀', tagline ?? '', status ?? 'dev', description ?? '',
       technologies ?? [], JSON.stringify(links ?? []), sort_order ?? 100],
    )
    return NextResponse.json({ slug, created: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
