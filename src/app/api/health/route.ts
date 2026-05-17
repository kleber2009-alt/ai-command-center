import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// Lightweight health endpoint. Touches the DB so a corrupt or
// inaccessible SQLite file is reported as unhealthy. Reports which
// optional API keys are configured so deploys can be diagnosed without
// shell access. Returns 200 when the app can serve requests.

export async function GET() {
  const status: Record<string, any> = {
    status: 'ok',
    uptime_seconds: Math.round(process.uptime()),
    node: process.version,
    timestamp: new Date().toISOString(),
  }

  let dbOk = false
  try {
    const row = getDb().prepare('SELECT 1 AS one').get() as { one: number } | undefined
    dbOk = row?.one === 1
    status.db = dbOk ? 'ok' : 'error'
  } catch (e: any) {
    status.status = 'error'
    status.db = 'error'
    status.db_error = e?.message || String(e)
  }

  status.keys = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    deepgram: !!process.env.DEEPGRAM_API_KEY,
    telegram_bot: !!process.env.TELEGRAM_BOT_TOKEN,
    ytdlp: !!process.env.YTDLP_SERVICE_URL,
  }

  return NextResponse.json(status, { status: status.status === 'ok' ? 200 : 503 })
}
