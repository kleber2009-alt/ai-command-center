import { NextRequest, NextResponse } from 'next/server'
import { getCachedBalances } from '@/lib/balances'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/balances?refresh=1 — список балансов всех настроенных провайдеров
export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get('refresh') === '1'
  try {
    const { providers, cachedAt } = await getCachedBalances(refresh)
    return NextResponse.json({ providers, cachedAt })
  } catch (e: any) {
    return NextResponse.json({ providers: [], error: e?.message ?? String(e) }, { status: 500 })
  }
}
