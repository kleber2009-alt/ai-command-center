import { NextRequest, NextResponse } from 'next/server'
import { getOfficeHqView } from '@/lib/office-hq-server'
import type { OfficeHqView } from '@/lib/office-hq'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_VIEWS: OfficeHqView[] = ['snapshot', 'help', 'brief', 'standup', 'focus', 'escalations', 'decisions']

export async function GET(req: NextRequest) {
  try {
    const rawView = req.nextUrl.searchParams.get('view') ?? 'snapshot'
    const view = ALLOWED_VIEWS.includes(rawView as OfficeHqView) ? (rawView as OfficeHqView) : 'snapshot'
    const payload = await getOfficeHqView(view)
    return NextResponse.json(payload)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? String(error) }, { status: 500 })
  }
}
