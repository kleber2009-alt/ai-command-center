import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/conversations?status=active|paused|closed|escalated&channel=ig|tg&limit=50
// Список диалогов с базовой инфо о клиенте и последнем сообщении.
// Читает напрямую из ai-sales-схемы (clients + conversations + messages).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const channel = searchParams.get('channel')
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)

  const where: string[] = []
  const params: any[] = []
  if (status) {
    params.push(status)
    where.push(`c.status = $${params.length}`)
  }
  if (channel) {
    params.push(channel)
    where.push(`c.channel = $${params.length}`)
  }
  params.push(limit)

  try {
    const { rows } = await db.query(
      `SELECT
         c.id,
         c.channel,
         c.status,
         c.last_message_at,
         c.message_count,
         c.agent_is_active,
         cl.id           AS client_id,
         cl.display_name AS client_name,
         COALESCE(cl.ig_username, cl.tg_username) AS client_handle,
         cl.segment,
         cl.funnel_stage,
         cl.qual_score,
         (SELECT content FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC LIMIT 1) AS last_message,
         (SELECT direction FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC LIMIT 1) AS last_direction
       FROM conversations c
       JOIN clients cl ON cl.id = c.client_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
       LIMIT $${params.length}`,
      params,
    )
    return NextResponse.json({ conversations: rows })
  } catch (e: any) {
    // ai-sales-схема может ещё не быть применена; не валим страницу
    return NextResponse.json({ conversations: [], error: e.message }, { status: 200 })
  }
}
