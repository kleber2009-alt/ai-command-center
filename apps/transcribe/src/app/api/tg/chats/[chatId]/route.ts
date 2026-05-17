import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/transcripts-db'

type PatchBody = { auto_reply?: boolean }

function parseChatId(raw: string): number | null {
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { chatId: string } },
) {
  const supabase = getServerSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен' }, { status: 503 })
  }

  const chatId = parseChatId(params.chatId)
  if (chatId === null) {
    return NextResponse.json({ error: 'invalid chat_id' }, { status: 400 })
  }

  const body = (await req.json()) as PatchBody
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.auto_reply === 'boolean') patch.auto_reply = body.auto_reply

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tg_chats')
    .update(patch)
    .eq('chat_id', chatId)
    .select('chat_id, title, auto_reply, created_at, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
