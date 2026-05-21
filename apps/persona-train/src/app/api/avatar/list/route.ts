import { NextRequest, NextResponse } from 'next/server';
import { query, normalizeOwnerHandle } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const owner = normalizeOwnerHandle(req.nextUrl.searchParams.get('owner'));
  if (!owner) return NextResponse.json({ error: 'owner_required' }, { status: 400 });

  const avatars = await query(
    `select id, display_name, provider, provider_avatar_id, preview_url, status,
            source_seconds, meta, created_at, archived_at
     from avatars where owner_handle = $1
     order by created_at desc limit 50`,
    [owner],
  );

  return NextResponse.json({ owner_handle: owner, avatars });
}
