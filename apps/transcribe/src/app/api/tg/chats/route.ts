import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/transcripts-db'
import { HOT_LEAD_STATUSES, type ChatRow, type ChatSummary } from '@/lib/tg-db'

export async function GET() {
  const supabase = getServerSupabase()
  if (!supabase) {
    return NextResponse.json({ items: [], configured: false })
  }

  const { data: chats, error } = await supabase
    .from('tg_chats')
    .select('chat_id, title, auto_reply, created_at, updated_at')
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const chatRows = (chats ?? []) as ChatRow[]
  if (chatRows.length === 0) {
    return NextResponse.json({ items: [], configured: true })
  }

  const chatIds = chatRows.map((c) => c.chat_id)

  // Per-chat aggregates. Two roundtrips beat one heavy join here since
  // Supabase's PostgREST doesn't expose group-by aggregates cleanly.
  const [{ data: msgAgg }, { data: leadAgg }] = await Promise.all([
    supabase
      .from('tg_messages')
      .select('chat_id, created_at')
      .in('chat_id', chatIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('tg_users')
      .select('chat_id, status')
      .in('chat_id', chatIds),
  ])

  const msgStats = new Map<number, { count: number; latest: string | null }>()
  for (const chatId of chatIds) msgStats.set(chatId, { count: 0, latest: null })
  for (const row of msgAgg ?? []) {
    const cid = Number((row as { chat_id: number }).chat_id)
    const ts = (row as { created_at: string }).created_at
    const cur = msgStats.get(cid) ?? { count: 0, latest: null }
    cur.count += 1
    if (!cur.latest || ts > cur.latest) cur.latest = ts
    msgStats.set(cid, cur)
  }

  const hotByChat = new Map<number, number>()
  for (const chatId of chatIds) hotByChat.set(chatId, 0)
  for (const row of leadAgg ?? []) {
    const cid = Number((row as { chat_id: number }).chat_id)
    const status = (row as { status: string }).status
    if (HOT_LEAD_STATUSES.has(status as never)) {
      hotByChat.set(cid, (hotByChat.get(cid) ?? 0) + 1)
    }
  }

  const items: ChatSummary[] = chatRows.map((c) => {
    const stats = msgStats.get(c.chat_id) ?? { count: 0, latest: null }
    return {
      ...c,
      total_messages: stats.count,
      hot_leads: hotByChat.get(c.chat_id) ?? 0,
      last_message_at: stats.latest,
    }
  })

  return NextResponse.json({ items, configured: true })
}
