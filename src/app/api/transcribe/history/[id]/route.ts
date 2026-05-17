import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/transcripts-db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
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
