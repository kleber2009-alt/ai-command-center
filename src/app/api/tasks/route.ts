import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const ALLOWED_STATUS = ['pending', 'in_progress', 'done', 'skipped'] as const
type Status = typeof ALLOWED_STATUS[number]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent')
  const status = searchParams.get('status')
  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500)

  const where: string[] = []
  const params: any[] = []
  if (agentId) {
    params.push(agentId)
    where.push(`agent_id = $${params.length}`)
  }
  if (status && ALLOWED_STATUS.includes(status as Status)) {
    params.push(status)
    where.push(`status = $${params.length}`)
  }
  params.push(limit)

  try {
    const { rows } = await db.query(
      `SELECT id, agent_id, agent_name, agent_emoji, text, impact, status, run_id,
              created_at, completed_at
       FROM agent_tasks
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    )
    return NextResponse.json({ tasks: rows })
  } catch (e: any) {
    return NextResponse.json({ tasks: [], error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json()
  if (!id || !ALLOWED_STATUS.includes(status)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }

  const completedAt = status === 'done' ? new Date() : null
  try {
    const { rows } = await db.query(
      `UPDATE agent_tasks
       SET status = $1, completed_at = $2
       WHERE id = $3
       RETURNING id, status, completed_at`,
      [status, completedAt, id],
    )
    if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
