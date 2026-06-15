import { NextRequest, NextResponse } from 'next/server'
import { getOfficeDecisionsPageData, updateOfficeDecision } from '@/lib/office-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_STATUS = ['pending', 'approved', 'rejected', 'deferred'] as const

export async function GET() {
  try {
    const payload = await getOfficeDecisionsPageData()
    return NextResponse.json(payload)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body?.id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }
    if (!body?.status || !ALLOWED_STATUS.includes(body.status)) {
      return NextResponse.json({ error: 'bad status' }, { status: 400 })
    }

    const result = await updateOfficeDecision({
      id: body.id,
      status: body.status,
      resolutionNote: body.resolutionNote,
      selectedOptionKey: body.selectedOptionKey,
      actorId: body.actorId,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? String(error) }, { status: 500 })
  }
}
