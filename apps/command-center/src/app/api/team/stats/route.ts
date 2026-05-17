import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const { rows } = await db.query<{
      agent_id: string
      total: string
      last_run: string | null
    }>(
      `SELECT agent_id,
              COUNT(*)::text AS total,
              MAX(created_at) AS last_run
       FROM agent_tasks
       GROUP BY agent_id`,
    )
    const stats = rows.map(r => ({
      agent_id: r.agent_id,
      total: Number(r.total),
      last_run: r.last_run,
    }))
    return NextResponse.json({ stats })
  } catch (e: any) {
    return NextResponse.json({ stats: [], error: e.message }, { status: 500 })
  }
}
