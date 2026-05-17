import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/transcripts-db'

function parseChatId(raw: string): number | null {
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function GET(
  req: NextRequest,
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

  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const limit = Math.min(
    MAX_LIMIT,
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT,
  )

  const { data, error } = await supabase
    .from('tg_messages')
    .select(
      'id, chat_id, user_id, telegram_message_id, text, class, confidence, action, reasoning, response, created_at',
    )
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ items: data ?? [], configured: true })
}
