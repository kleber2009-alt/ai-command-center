import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { isConfigured as elevenConfigured } from '@/lib/elevenlabs';
import { isConfigured as anthropicConfigured } from '@/lib/anthropic';
import { isS3Enabled } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  let dbOk = false;
  try {
    await query('select 1');
    dbOk = true;
  } catch {}

  return NextResponse.json({
    ok: true,
    db: dbOk,
    elevenlabs: elevenConfigured(),
    anthropic: anthropicConfigured(),
    s3: isS3Enabled(),
    tg_bot: Boolean(process.env.TG_BOT_TOKEN),
    public_base_url: process.env.PUBLIC_BASE_URL || null,
    owner: process.env.OWNER_HANDLE || null,
  });
}
