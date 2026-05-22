import { NextRequest, NextResponse } from 'next/server';
import { generateVoiceNote } from '@/lib/voice-pipeline';
import { normalizeOwnerHandle } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const result = await generateVoiceNote({
    text: String(body.text || ''),
    voice_id: body.voice_id as string | undefined,
    owner_handle: normalizeOwnerHandle(body.owner_handle as string | undefined) || undefined,
    provider_voice_id: body.provider_voice_id as string | undefined,
    model: body.model as string | undefined,
    stability: body.stability as number | undefined,
    similarity: body.similarity as number | undefined,
    style: body.style as number | undefined,
    outputFormat: body.output_format as 'mp3_44100_128' | 'opus_48000_64' | undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.code, details: result.details },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    audio_url: result.audioUrl,
    audio_path: result.audioPath,
    storage_kind: result.storageKind,
    char_count: result.charCount,
    bytes: result.bytes,
    provider_voice_id: result.providerVoiceId,
    model: result.modelId,
  });
}
