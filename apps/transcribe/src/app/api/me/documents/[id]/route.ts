import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
import { getServerSupabase } from '@/lib/me-db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'docs-item', max: 60, windowMs: 60_000 },
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'docs-item', max: 60, windowMs: 60_000 },
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

  const supabase = getServerSupabase()
  if (!supabase) return NextResponse.json({ error: 'Supabase не настроен' }, { status: 500 })
  const { error } = await supabase.from('me_documents').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
