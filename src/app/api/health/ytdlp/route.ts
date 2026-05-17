import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Proxies to the internal ytdlp /diag for one-off diagnostics.
// Disabled when DEBUG_YTDLP_DIAG is not set.
export async function GET(req: NextRequest) {
  if (process.env.DEBUG_YTDLP_DIAG !== 'true') {
    return NextResponse.json({ error: 'disabled' }, { status: 404 })
  }
  const base = process.env.YTDLP_SERVICE_URL
  const key = process.env.YTDLP_SERVICE_API_KEY
  if (!base) return NextResponse.json({ error: 'ytdlp not configured' }, { status: 503 })
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'pass ?url=' }, { status: 400 })
  const headers: Record<string, string> = {}
  if (key) headers['Authorization'] = `Bearer ${key}`
  try {
    const r = await fetch(`${base}/diag?url=${encodeURIComponent(url)}`, { headers })
    const body = await r.text()
    return new NextResponse(body, { status: r.status, headers: { 'content-type': 'application/json' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'fetch failed' }, { status: 502 })
  }
}
