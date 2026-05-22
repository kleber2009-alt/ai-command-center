// ═══════════════════════════════════════════════════════════════════
// POST /api/voice/sample
// ───────────────────────────────────────────────────────────────────
// Accumulate one voice sample (web upload OR TG voice note). The bot
// /api/telegram/webhook calls this internally when it receives a voice.
// Web users can also POST directly. After write, checks if total
// pending duration crosses AUTO_RETRAIN_SECONDS — auto-triggers
// /api/voice/train if it does.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, normalizeOwnerHandle } from '@/lib/db';
import { storeVoiceSample } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AUTO_RETRAIN_SECONDS = Number(process.env.AUTO_RETRAIN_SECONDS || 180);

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

  const source = String(form.get('source') || 'web');
  const duration = parseFloat(String(form.get('duration_seconds') || '')) || null;
  const tgChatId = parseInt(String(form.get('tg_chat_id') || ''), 10) || null;
  const tgMessageId = parseInt(String(form.get('tg_message_id') || ''), 10) || null;
  const tgFileId = String(form.get('tg_file_id') || '') || null;

  const buf = await file.arrayBuffer();
  const ext = (file.name.split('.').pop() || 'mp3').toLowerCase().slice(0, 5);
  const stored = await storeVoiceSample(buf, owner, ext);

  const row = await queryOne<{ id: string; created_at: string }>(
    `insert into voice_samples
       (owner_handle, source, storage_kind, storage_path, mime_type, byte_size,
        duration_seconds, tg_chat_id, tg_message_id, tg_file_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id, created_at`,
    [
      owner,
      source,
      stored.storageKind,
      stored.storagePath,
      file.type || 'application/octet-stream',
      file.size,
      duration,
      tgChatId,
      tgMessageId,
      tgFileId,
    ],
  );

  // Check pending threshold for auto-retrain.
  const stats = await queryOne<{ pending_count: string; pending_seconds: string }>(
    `select count(*) as pending_count,
            coalesce(sum(duration_seconds), 0) as pending_seconds
     from voice_samples
     where owner_handle = $1 and consumed = false`,
    [owner],
  );

  const pendingSeconds = Number(stats?.pending_seconds || 0);
  const pendingCount = Number(stats?.pending_count || 0);
  const shouldTrain = pendingSeconds >= AUTO_RETRAIN_SECONDS;

  // Optionally fire training in the background. We just hint; the bot
  // or cabinet can call /api/voice/train explicitly. Avoid blocking the
  // upload response with a long ElevenLabs call.
  return NextResponse.json({
    ok: true,
    sample_id: row?.id,
    created_at: row?.created_at,
    pending_count: pendingCount,
    pending_seconds: pendingSeconds,
    threshold_seconds: AUTO_RETRAIN_SECONDS,
    should_train: shouldTrain,
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
    consumed_at: string | null;
    created_at: string;
  }>(
    `select id, source, duration_seconds, byte_size, consumed, consumed_at, created_at
     from voice_samples
     where owner_handle = $1
     order by created_at desc
     limit 100`,
    [owner],
  );

  return NextResponse.json({ owner_handle: owner, samples: rows });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  await query('delete from voice_samples where id = $1 and consumed = false', [id]);
  return NextResponse.json({ ok: true });
}
