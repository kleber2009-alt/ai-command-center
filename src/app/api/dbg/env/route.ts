import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/transcripts-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const peek = (name: string) => {
    const v = process.env[name]
    return { present: v !== undefined, empty: v === '', length: typeof v === 'string' ? v.length : null }
  }
  const supabase = getServerSupabase()
  return NextResponse.json({
    nodeVersion: process.version,
    cwd: process.cwd(),
    NEXT_PUBLIC_SUPABASE_URL: peek('NEXT_PUBLIC_SUPABASE_URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: peek('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_KEY: peek('SUPABASE_SERVICE_KEY'),
    ANTHROPIC_API_KEY: peek('ANTHROPIC_API_KEY'),
    DEEPGRAM_API_KEY: peek('DEEPGRAM_API_KEY'),
    YTDLP_SERVICE_URL: peek('YTDLP_SERVICE_URL'),
    getServerSupabaseReturnedClient: supabase !== null,
  })
}
