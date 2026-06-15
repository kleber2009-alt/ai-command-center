import { NextResponse } from 'next/server'
import { getOfficeAgentsPageData } from '@/lib/office-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const payload = await getOfficeAgentsPageData()
    return NextResponse.json(payload)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? String(error) }, { status: 500 })
  }
}
