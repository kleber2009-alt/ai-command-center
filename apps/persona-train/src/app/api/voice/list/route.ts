import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, normalizeOwnerHandle } from '@/lib/db';
import type { Voice } from '@/lib/voice-pipeline';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const owner = normalizeOwnerHandle(req.nextUrl.searchParams.get('owner'));
  if (!owner) return NextResponse.json({ error: 'owner_required' }, { status: 400 });

  const current = await queryOne<Voice>(
    `select * from voices where owner_handle = $1 and archived_at is null
     order by created_at desc limit 1`,
    [owner],
  );

  const archived = await query<Voice>(
    `select * from voices where owner_handle = $1 and archived_at is not null
     order by created_at desc limit 20`,
    [owner],
  );

  const sampleStats = await queryOne<{
    pending_count: string;
    pending_seconds: string;
    total_count: string;
  }>(
    `select
       count(*) filter (where consumed = false) as pending_count,
       coalesce(sum(duration_seconds) filter (where consumed = false), 0) as pending_seconds,
       count(*) as total_count
     from voice_samples where owner_handle = $1`,
    [owner],
  );

  return NextResponse.json({
    owner_handle: owner,
    current,
    archived,
    samples: {
      pending_count: Number(sampleStats?.pending_count || 0),
      pending_seconds: Number(sampleStats?.pending_seconds || 0),
      total_count: Number(sampleStats?.total_count || 0),
    },
    auto_retrain_threshold_seconds: Number(process.env.AUTO_RETRAIN_SECONDS || 180),
  });
}
