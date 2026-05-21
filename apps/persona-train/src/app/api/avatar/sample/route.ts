// ═══════════════════════════════════════════════════════════════════
// POST /api/avatar/sample
// ───────────────────────────────────────────────────────────────────
// Accumulate one video sample (Telegram round video-note = "кружок",
// OR an uploaded MP4) attributed to owner_handle. Mirrors voice/sample
// for the avatar pipeline. Training is launched separately via
// /api/avatar/train (HeyGen Custom Avatar / Higgsfield character).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, normalizeOwnerHandle } from '@/lib/db';
import { storeVideoSample } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const owner = normalizeOwnerHandle(String(form.get('owner_handle') || ''));
  if (!owner) return NextResponse.json({ error: 'owner_required' }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file_required' }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });

  const source = String(form.get('source') || 'web');
  const duration = parseFloat(String(form.get('duration_seconds') || '')) || null;
  const tgChatId = parseInt(String(form.get('tg_chat_id') || ''), 10) || null;
  const tgMessageId = parseInt(String(form.get('tg_message_id') || ''), 10) || null;
  const tgFileId = String(form.get('tg_file_id') || '') || null;

  const buf = await file.arrayBuffer();
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().slice(0, 5);
  const stored = await storeVideoSample(buf, owner, ext);

  const row = await queryOne<{ id: string; created_at: string }>(
    `insert into avatar_samples
       (owner_handle, source, storage_kind, storage_path, mime_type, byte_size,
        duration_seconds, tg_chat_id, tg_message_id, tg_file_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id, created_at`,
    [
      owner,
      source,
      stored.storageKind,
      stored.storagePath,
      file.type || 'video/mp4',
      file.size,
      duration,
      tgChatId,
      tgMessageId,
      tgFileId,
    ],
  );

  const stats = await queryOne<{ pending_count: string; pending_seconds: string }>(
    `select count(*) as pending_count,
            coalesce(sum(duration_seconds), 0) as pending_seconds
     from avatar_samples
     where owner_handle = $1 and consumed = false`,
    [owner],
  );

  return NextResponse.json({
    ok: true,
    sample_id: row?.id,
    created_at: row?.created_at,
    pending_count: Number(stats?.pending_count || 0),
    pending_seconds: Number(stats?.pending_seconds || 0),
  });
}

export async function GET(req: NextRequest) {
  const owner = normalizeOwnerHandle(req.nextUrl.searchParams.get('owner'));
  if (!owner) return NextResponse.json({ error: 'owner_required' }, { status: 400 });

  const rows = await query<{
    id: string;
    source: string;
    duration_seconds: number | null;
    byte_size: number;
    consumed: boolean;
    created_at: string;
  }>(
    `select id, source, duration_seconds, byte_size, consumed, created_at
     from avatar_samples where owner_handle = $1
     order by created_at desc limit 100`,
    [owner],
  );

  return NextResponse.json({ owner_handle: owner, samples: rows });
}
