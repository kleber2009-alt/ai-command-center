import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/transcripts-db'

function parseChatId(raw: string): number | null {
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { chatId: string } },
) {
  const supabase = getServerSupabase()
  if (!supabase) {
    return NextResponse.json({ items: [], configured: false })
  }

  const chatId = parseChatId(params.chatId)
  if (chatId === null) {
    return NextResponse.json({ error: 'invalid chat_id' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tg_users')
    .select(
      'chat_id, user_id, username, first_name, last_name, status, status_updated_at, last_seen_at, created_at',
    )
    .eq('chat_id', chatId)
    .order('last_seen_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ items: data ?? [], configured: true })
}
