import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/me-db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServerSupabase()
  if (!supabase) return NextResponse.json({ error: 'Supabase не настроен' }, { status: 500 })
  const { data, error } = await supabase
    .from('me_documents')
    .select('*')
    .eq('id', params.id)
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message || 'Не найдено' }, { status: 404 })
  return NextResponse.json({ document: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServerSupabase()
  if (!supabase) return NextResponse.json({ error: 'Supabase не настроен' }, { status: 500 })
  const { error } = await supabase.from('me_documents').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
