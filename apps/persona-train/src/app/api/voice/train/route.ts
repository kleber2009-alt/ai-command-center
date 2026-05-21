// ═══════════════════════════════════════════════════════════════════
// POST /api/voice/train
// ───────────────────────────────────────────────────────────────────
// Take all pending (consumed=false) voice_samples for owner_handle,
// pack into one ElevenLabs IVC call, archive the previous active
// voice, insert a new row in `voices`, and mark the consumed samples.
// Triggered manually (cabinet button, bot /train) or automatically by
// the sample upload route when pending_seconds >= AUTO_RETRAIN_SECONDS.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, normalizeOwnerHandle } from '@/lib/db';
import { cloneVoice, type CloneFile } from '@/lib/elevenlabs';
import { readSample } from '@/lib/storage';
import type { Voice } from '@/lib/voice-pipeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ElevenLabs IVC limits:
//   - up to 25 files
//   - 11MB total payload size
//   - duration ceiling depends on tier. Free / older Starter caps at
//     45min (2700s); newer Creator+ tiers allow ~60min for IVC and
//     longer for PVC. We attempt our optimistic cap (default 60min)
//     and auto-fallback to 45min if ElevenLabs replies audio_too_long.
const MAX_TOTAL_BYTES = 11 * 1024 * 1024;
const MAX_TOTAL_SECONDS = Number(process.env.ELEVENLABS_IVC_MAX_SECONDS || 3600);
const FALLBACK_TOTAL_SECONDS = 2700;
const MAX_FILES = 25;

type SampleRow = {
  id: string;
  storage_kind: 'fs' | 's3';
  storage_path: string;
  byte_size: number;
  duration_seconds: number | null;
  mime_type: string;
  created_at: string;
};

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // Body is optional — owner via query string also OK.
  }

  const owner =
    normalizeOwnerHandle(body.owner_handle as string | undefined) ||
    normalizeOwnerHandle(req.nextUrl.searchParams.get('owner'));
  if (!owner) return NextResponse.json({ error: 'owner_required' }, { status: 400 });

  const samples = await query<SampleRow>(
    `select id, storage_kind, storage_path, byte_size, duration_seconds, mime_type, created_at
     from voice_samples
     where owner_handle = $1 and consumed = false
     order by created_at asc
     limit $2`,
    [owner, MAX_FILES],
  );

  if (!samples.length) {
    return NextResponse.json({ error: 'no_pending_samples' }, { status: 400 });
  }

  // Greedy-fit under ALL ElevenLabs IVC limits (bytes + seconds + files).
  // Newest-first so the freshest material always lands in the next clone;
  // older samples that don't fit stay pending for a future /train.
  const ordered = [...samples].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const selected: SampleRow[] = [];
  let totalBytes = 0;
  let totalSeconds = 0;
  for (const s of ordered) {
    const dur = Number(s.duration_seconds || 0);
    if (selected.length >= MAX_FILES) break;
    if (totalBytes + s.byte_size > MAX_TOTAL_BYTES) continue;
    if (dur > 0 && totalSeconds + dur > MAX_TOTAL_SECONDS) continue;
    selected.push(s);
    totalBytes += s.byte_size;
    totalSeconds += dur;
  }
  if (!selected.length) {
    return NextResponse.json(
      {
        error: 'no_samples_fit',
        details: `Каждый pending sample либо >11MB, либо >${Math.round(MAX_TOTAL_SECONDS / 60)}min — выкини их через /reset_samples и догрузи короче.`,
      },
      { status: 413 },
    );
  }

  // Read bytes from storage (we cache so the fallback path can reuse).
  type Loaded = { sample: SampleRow; file: CloneFile };
  const loaded: Loaded[] = [];
  for (const s of selected) {
    const buf = await readSample(s.storage_kind, s.storage_path, 'voice-notes');
    const ext = s.storage_path.split('.').pop() || 'mp3';
    loaded.push({ sample: s, file: { buffer: buf, filename: `${s.id}.${ext}` } });
  }

  const displayName = String(body.display_name || owner).slice(0, 80);

  let attempted = loaded;
  let attemptedSeconds = totalSeconds;
  let usedFallback = false;

  let clone = await cloneVoice({
    name: displayName,
    description: `persona-train (${loaded.length} samples, ~${Math.round(totalSeconds)}s) for ${owner}`,
    files: loaded.map((l) => l.file),
  });

  // ── auto-fallback: tier rejected our >45min payload ──
  if (
    !clone.ok &&
    clone.status === 400 &&
    /audio_too_long|voice_too_long|45 minutes/i.test(clone.details)
  ) {
    // Trim newest-first to fit FALLBACK_TOTAL_SECONDS.
    const trimmed: Loaded[] = [];
    let tSec = 0;
    let tBytes = 0;
    for (const l of loaded) {
      const dur = Number(l.sample.duration_seconds || 0);
      if (tBytes + l.sample.byte_size > MAX_TOTAL_BYTES) continue;
      if (dur > 0 && tSec + dur > FALLBACK_TOTAL_SECONDS) continue;
      trimmed.push(l);
      tSec += dur;
      tBytes += l.sample.byte_size;
    }
    if (trimmed.length && trimmed.length < loaded.length) {
      clone = await cloneVoice({
        name: displayName,
        description: `persona-train fallback45 (${trimmed.length} samples, ~${Math.round(tSec)}s) for ${owner}`,
        files: trimmed.map((l) => l.file),
      });
      if (clone.ok) {
        attempted = trimmed;
        attemptedSeconds = tSec;
        usedFallback = true;
      }
    }
  }

  if (!clone.ok) {
    return NextResponse.json(
      { ok: false, error: 'eleven_clone_failed', status: clone.status, details: clone.details },
      { status: clone.status >= 400 ? clone.status : 502 },
    );
  }

  const finalSelected = attempted.map((l) => l.sample);
  totalSeconds = attemptedSeconds;
  const skipped = samples.length - finalSelected.length;

  // Archive prior active voice.
  await query(
    `update voices set archived_at = now()
     where owner_handle = $1 and archived_at is null`,
    [owner],
  );

  const newVoice = await queryOne<Voice>(
    `insert into voices (owner_handle, display_name, provider, provider_voice_id, sample_seconds)
     values ($1, $2, 'elevenlabs', $3, $4)
     returning *`,
    [owner, displayName, clone.providerVoiceId, Math.round(totalSeconds) || null],
  );

  if (!newVoice) return NextResponse.json({ error: 'db_insert_failed' }, { status: 500 });

  // Mark samples consumed.
  await query(
    `update voice_samples
     set consumed = true, consumed_at = now(), consumed_voice_id = $1
     where id = any($2::uuid[])`,
    [newVoice.id, finalSelected.map((s) => s.id)],
  );

  return NextResponse.json({
    ok: true,
    voice_id: newVoice.id,
    provider_voice_id: newVoice.provider_voice_id,
    display_name: newVoice.display_name,
    consumed_samples: finalSelected.length,
    seconds_used: Math.round(totalSeconds),
    bytes_used: attempted.reduce((s, l) => s + l.sample.byte_size, 0),
    skipped_samples: skipped,
    used_fallback_45min: usedFallback,
    cap_seconds_attempted: MAX_TOTAL_SECONDS,
  });
}
