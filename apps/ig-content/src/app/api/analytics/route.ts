import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/api'
import { fetchMetrics, summarize } from '@/lib/analytics'

export async function GET() {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const rows = await fetchMetrics(supabase)
  return NextResponse.json({ summary: summarize(rows) })
}
