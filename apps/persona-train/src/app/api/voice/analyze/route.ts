// ═══════════════════════════════════════════════════════════════════
// POST /api/voice/analyze
// ───────────────────────────────────────────────────────────────────
// Two input modes:
//   { transcript: "...full text..." }
//   { sample_ids: ["uuid", ...] }  → load samples → transcribe via
//     Whisper (TODO when transcription service is wired) → analyze
//
// For now this endpoint accepts a pre-transcribed `transcript` field
// directly. Sample-based transcription will land alongside the
// audio-to-text wiring (we already use `media.voice_to_text` in the
// aisales api-v2 stack; will reuse via a shared service or a stub).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { queryOne, normalizeOwnerHandle } from '@/lib/db';
import { analyzeTranscripts } from '@/lib/voice-analyzer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const owner = normalizeOwnerHandle(body.owner_handle as string | undefined);
  if (!owner) return NextResponse.json({ error: 'owner_required' }, { status: 400 });

  const transcript = String(body.transcript || '');
  if (!transcript.trim()) {
    return NextResponse.json(
      {
        error: 'transcript_required',
        hint: 'Sample-id mode (transcribe-then-analyze) is not wired yet — pass `transcript` directly for now.',
      },
      { status: 400 },
    );
  }

  const res = await analyzeTranscripts(transcript);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.code, details: res.details },
      { status: res.status },
    );
  }

  const row = await queryOne<{ id: string; created_at: string }>(
    `insert into voice_analyses
       (owner_handle, transcript_chars, profile, model, cost_usd, input_tokens, output_tokens, elapsed_ms)
     values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
     returning id, created_at`,
    [
      owner,
      res.meta.transcript_chars,
      JSON.stringify(res.profile),
      res.meta.model,
      res.meta.cost_usd,
      res.meta.input_tokens,
      res.meta.output_tokens,
      res.meta.elapsed_ms,
    ],
  );

  return NextResponse.json({
    ok: true,
    analysis_id: row?.id,
    created_at: row?.created_at,
    profile: res.profile,
    meta: res.meta,
  });
}
