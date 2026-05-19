import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
import { getAnalysisReport, getTrendReport, listAllReports } from '@/lib/instagram-db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'ig-reports', max: 30, windowMs: 60_000 },
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

  const { id } = params

  // Special route: GET /api/instagram/reports/list → return all reports
  if (id === 'list') {
    const reports = await listAllReports()
    return NextResponse.json({ reports })
  }

  // Try analysis report first, then trend report
  const analysis = await getAnalysisReport(id)
  if (analysis) return NextResponse.json({ type: 'account', report: analysis })

  const trend = await getTrendReport(id)
  if (trend) return NextResponse.json({ type: 'trend', report: trend })

  return NextResponse.json({ error: 'Отчёт не найден' }, { status: 404 })
}
