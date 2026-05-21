// ═══════════════════════════════════════════════════════════════════
// POST /api/avatar/train
// ───────────────────────────────────────────────────────────────────
// MVP scaffold for avatar training from accumulated video samples.
//
// Phase 1 (this commit): records the training intent and returns a
// stub avatar row. Actual upload to HeyGen Custom Photo Avatar / Higgs-
// field character creation is wired in a follow-up — it requires:
//   - extracting a high-quality frame OR concatenating video samples
//     into one source clip
//   - HeyGen `photo_avatar/photo/generate` + train flow (different
//     from the talking-photo path used in persona-studio)
//   - 5-15 min training pipeline (BullMQ worker)
//
// For now this endpoint:
//   1) reserves an `avatars` row (status='pending')
//   2) marks the pending avatar_samples as consumed
//   3) returns the avatar_id so the cabinet UI can show "Training…"
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, normalizeOwnerHandle } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {}

  const owner =
    normalizeOwnerHandle(body.owner_handle as string | undefined) ||
    normalizeOwnerHandle(req.nextUrl.searchParams.get('owner'));
  if (!owner) return NextResponse.json({ error: 'owner_required' }, { status: 400 });

  const provider = (String(body.provider || 'heygen').toLowerCase() === 'higgsfield'
    ? 'higgsfield'
    : 'heygen') as 'heygen' | 'higgsfield';

  const samples = await query<{ id: string; duration_seconds: number | null }>(
    `select id, duration_seconds from avatar_samples
     where owner_handle = $1 and consumed = false`,
    [owner],
  );
  if (!samples.length) {
    return NextResponse.json({ error: 'no_pending_samples' }, { status: 400 });
  }

  const totalSeconds = samples.reduce((s, r) => s + Number(r.duration_seconds || 0), 0);

  // Archive previous active avatar for this provider.
  await query(
    `update avatars set archived_at = now()
     where owner_handle = $1 and provider = $2 and archived_at is null`,
    [owner, provider],
  );

  // For now: stub avatar — real provider call lives in follow-up worker.
  // Stub uses a placeholder provider_avatar_id we'll overwrite when
  // training completes.
  const avatar = await queryOne<{ id: string; created_at: string }>(
    `insert into avatars
       (owner_handle, display_name, provider, provider_avatar_id, status,
        source_seconds, meta)
     values ($1, $2, $3, $4, 'pending', $5, $6::jsonb)
     returning id, created_at`,
    [
      owner,
      String(body.display_name || owner),
      provider,
      `stub_${Date.now()}`,
      Math.round(totalSeconds) || null,
      JSON.stringify({ sample_count: samples.length, note: 'training-pipeline-pending' }),
    ],
  );

  if (!avatar) return NextResponse.json({ error: 'db_insert_failed' }, { status: 500 });

  // Mark samples consumed against this avatar.
  await query(
    `update avatar_samples
     set consumed = true, consumed_at = now(), consumed_avatar_id = $1
     where id = any($2::uuid[])`,
    [avatar.id, samples.map((s) => s.id)],
  );

  return NextResponse.json({
    ok: true,
    avatar_id: avatar.id,
    provider,
    status: 'pending',
    consumed_samples: samples.length,
    seconds_used: Math.round(totalSeconds),
    note:
      'Avatar training pipeline is scaffolded but the provider call is wired in a follow-up. ' +
      'Samples are marked consumed; provider_avatar_id is a placeholder until the worker runs.',
  });
}
