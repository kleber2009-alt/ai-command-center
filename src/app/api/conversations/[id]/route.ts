import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/conversations/:id — диалог + все сообщения в хронологии.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const [{ rows: convRows }, { rows: msgRows }] = await Promise.all([
      db.query(
        `SELECT
           c.id, c.channel, c.status, c.last_message_at, c.message_count,
           c.agent_is_active, c.created_at,
           cl.id AS client_id, cl.display_name AS client_name,
           COALESCE(cl.ig_username, cl.tg_username) AS client_handle,
           cl.segment, cl.funnel_stage, cl.qual_score, cl.tags,
           cl.notes, cl.email, cl.phone
         FROM conversations c
         JOIN clients cl ON cl.id = c.client_id
         WHERE c.id = $1`,
        [params.id],
      ),
      db.query(
        `SELECT id, direction, type, author, content, media_url,
                agent_model, tokens_used, latency_ms, cost_usd, created_at
         FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [params.id],
      ),
    ])
    if (!convRows.length) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ conversation: convRows[0], messages: msgRows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
