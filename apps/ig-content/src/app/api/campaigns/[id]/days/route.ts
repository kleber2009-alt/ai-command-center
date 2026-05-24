import { NextRequest, NextResponse } from 'next/server'
import { requireUser, jsonError } from '@/lib/api'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase
    .from('content_days')
    .select('*')
    .eq('campaign_id', params.id)
    .order('day_number', { ascending: true })

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ days: data })
}
