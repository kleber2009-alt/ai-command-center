import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
import { getServerSupabase } from '@/lib/transcripts-db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'history-item', max: 60, windowMs: 60_000 },
  })
  if (!guard.ok) return guard.response

  const supabase = getServerSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен' }, { status: 503 })
  }
  const { data, error } = await supabase.from('transcripts').select('*').eq('id', params.id).single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'history-item', max: 60, windowMs: 60_000 },
  })
  if (!guard.ok) return guard.response

  const supabase = getServerSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase не настроен' }, { status: 503 })
  }
  const { error } = await supabase.from('transcripts').delete().eq('id', params.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
