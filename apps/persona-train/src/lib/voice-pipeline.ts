import { queryOne } from './db';
import { generateTts } from './elevenlabs';
import { storeVoiceSample } from './storage';

export const MAX_TEXT_CHARS = 1500;

export type Voice = {
  id: string;
  owner_handle: string;
  display_name: string | null;
  provider: string;
  provider_voice_id: string;
  sample_seconds: number | null;
  created_at: string;
  archived_at: string | null;
};

export type ResolveError = { status: number; code: string };

export async function resolveVoice(input: {
  voice_id?: string;
  owner_handle?: string;
  provider_voice_id?: string;
}): Promise<{ voiceRow: Voice | null; providerVoiceId: string | null; error?: ResolveError }> {
  const { voice_id, owner_handle, provider_voice_id } = input;

  if (voice_id) {
    const row = await queryOne<Voice>('select * from voices where id = $1', [voice_id]);
    if (!row) return { voiceRow: null, providerVoiceId: null, error: { status: 404, code: 'voice_not_found' } };
    return { voiceRow: row, providerVoiceId: row.provider_voice_id };
  }

  if (owner_handle && !provider_voice_id) {
    const row = await queryOne<Voice>(
      'select * from voices where owner_handle = $1 and archived_at is null order by created_at desc limit 1',
      [owner_handle],
    );
    if (!row)
      return {
        voiceRow: null,
        providerVoiceId: null,
        error: { status: 404, code: 'no_active_voice_for_owner' },
      };
    return { voiceRow: row, providerVoiceId: row.provider_voice_id };
  }

  if (provider_voice_id) return { voiceRow: null, providerVoiceId: provider_voice_id };

  return { voiceRow: null, providerVoiceId: null, error: { status: 400, code: 'voice_id_or_owner_required' } };
}

export type GenerateResult =
  | {
      ok: true;
      audioBuf: ArrayBuffer;
      audioUrl: string;
      audioPath: string;
      storageKind: 'fs' | 's3';
      charCount: number;
      bytes: number;
      providerVoiceId: string;
      voiceRow: Voice | null;
      modelId: string;
    }
  | { ok: false; status: number; code: string; details?: string };

export async function generateVoiceNote(opts: {
  text: string;
  voice_id?: string;
  owner_handle?: string;
  provider_voice_id?: string;
  model?: string;
  stability?: number;
  similarity?: number;
  style?: number;
  outputFormat?: 'mp3_44100_128' | 'opus_48000_64';
}): Promise<GenerateResult> {
  const { text } = opts;
  if (!text || !text.trim()) return { ok: false, status: 400, code: 'text_required' };
  if (text.length > MAX_TEXT_CHARS)
    return {
      ok: false,
      status: 400,
      code: 'text_too_long',
      details: `max ${MAX_TEXT_CHARS}, got ${text.length}`,
    };

  const resolved = await resolveVoice(opts);
  if (resolved.error) return { ok: false, status: resolved.error.status, code: resolved.error.code };
  if (!resolved.providerVoiceId)
    return { ok: false, status: 500, code: 'no_provider_voice_id' };

  const tts = await generateTts({
    providerVoiceId: resolved.providerVoiceId,
    text,
    model: opts.model,
    stability: opts.stability,
    similarity: opts.similarity,
    style: opts.style,
    outputFormat: opts.outputFormat,
  });
  if (!tts.ok)
    return { ok: false, status: tts.status, code: 'eleven_tts_failed', details: tts.details };

  const owner = resolved.voiceRow?.owner_handle || opts.owner_handle || 'anon';
  const ext = opts.outputFormat?.startsWith('opus') ? 'ogg' : 'mp3';
  let stored;
  try {
    stored = await storeVoiceSample(tts.audioBuf, owner, ext);
  } catch (e) {
    return { ok: false, status: 500, code: 'storage_upload_failed', details: (e as Error).message };
  }

  return {
    ok: true,
    audioBuf: tts.audioBuf,
    audioUrl: stored.publicUrl,
    audioPath: stored.storagePath,
    storageKind: stored.storageKind,
    charCount: text.length,
    bytes: tts.audioBuf.byteLength,
    providerVoiceId: resolved.providerVoiceId,
    voiceRow: resolved.voiceRow,
    modelId: tts.modelId,
  };
}
