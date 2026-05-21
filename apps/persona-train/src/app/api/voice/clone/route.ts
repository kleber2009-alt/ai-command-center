import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, normalizeOwnerHandle } from '@/lib/db';
import { cloneVoice, type CloneFile } from '@/lib/elevenlabs';
import type { Voice } from '@/lib/voice-pipeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_TOTAL_BYTES = 11 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const ownerHandle = normalizeOwnerHandle(String(form.get('owner_handle') || ''));
  if (!ownerHandle) return NextResponse.json({ error: 'owner_handle_required' }, { status: 400 });

  const displayName = String(form.get('display_name') || ownerHandle).trim().slice(0, 80);
  const sampleSeconds = parseInt(String(form.get('sample_seconds') || ''), 10) || null;

  const rawFiles = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!rawFiles.length) return NextResponse.json({ error: 'no_audio_files' }, { status: 400 });

  const totalBytes = rawFiles.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      {
        error: 'payload_too_large',
        max_mb: MAX_TOTAL_BYTES / 1024 / 1024,
        got_mb: +(totalBytes / 1024 / 1024).toFixed(2),
      },
      { status: 413 },
    );
  }

  const files: CloneFile[] = [];
  for (const f of rawFiles) {
    files.push({ buffer: await f.arrayBuffer(), filename: f.name || 'sample.mp3' });
  }

  const clone = await cloneVoice({
    name: displayName,
    description: `persona-train voice clone for ${ownerHandle}`,
    files,
  });
  if (!clone.ok) {
    return NextResponse.json(
      { error: 'eleven_clone_failed', status: clone.status, details: clone.details },
      { status: clone.status >= 400 ? clone.status : 502 },
    );
  }

  await query(
    `update voices set archived_at = now()
     where owner_handle = $1 and archived_at is null`,
    [ownerHandle],
  );

  const row = await queryOne<Voice>(
    `insert into voices (owner_handle, display_name, provider, provider_voice_id, sample_seconds)
     values ($1, $2, 'elevenlabs', $3, $4)
     returning *`,
    [ownerHandle, displayName, clone.providerVoiceId, sampleSeconds],
  );

  if (!row) return NextResponse.json({ error: 'db_insert_failed' }, { status: 500 });

  return NextResponse.json({
    ok: true,
    voice_id: row.id,
    provider_voice_id: row.provider_voice_id,
    display_name: row.display_name,
    owner_handle: row.owner_handle,
    created_at: row.created_at,
  });
}
