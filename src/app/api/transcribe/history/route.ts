import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/transcripts-db'

export async function GET() {
  const supabase = getServerSupabase()
  if (!supabase) {
    return NextResponse.json({ items: [], configured: false })
  }
  try {
    const { data, error } = await supabase
      .from('transcripts')
      .select('id, created_at, url, title, source, language, duration')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ items: data ?? [], configured: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка получения истории' }, { status: 500 })
  }
}
