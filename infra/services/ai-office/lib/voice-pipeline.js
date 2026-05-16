// ═══════════════════════════════════════════════════════════════════
// lib/voice-pipeline.js — Voice resolution + generation + logging
// ───────────────────────────────────────────────────────────────────
// Replaces ai-office-project/netlify/functions/_shared/voice-pipeline.js
// for the self-hosted backend. Talks to local Postgres directly.
// ═══════════════════════════════════════════════════════════════════

import { queryOne } from './db.js';
import { generateTts, DEFAULT_MODEL } from './elevenlabs.js';
import { uploadVoiceNote } from './storage.js';
import { logGeneration } from './generations.js';

export const MAX_TEXT_CHARS = 1500;

/**
 * Resolves which provider voice_id to use given one of:
 *   { voice_id }          — our UUID from voices table
 *   { owner_handle }      — active voice of that owner
 *   { provider_voice_id } — direct passthrough (no DB lookup)
 *
 * Returns { voiceRow|null, providerVoiceId|null, error|null }.
 */
export async function resolveVoice({ voice_id, owner_handle, provider_voice_id }) {
  if (voice_id) {
    const row = await queryOne(
      'select * from voices where id = $1',
      [voice_id],
    );
    if (!row) return { error: { status: 404, code: 'voice_not_found' } };
    return { voiceRow: row, providerVoiceId: row.provider_voice_id };
  }

  if (owner_handle && !provider_voice_id) {
    const row = await queryOne(
      'select * from voices where owner_handle = $1 and archived_at is null order by created_at desc limit 1',
      [owner_handle],
    );
    if (!row) return { error: { status: 404, code: 'no_active_voice_for_owner' } };
    return { voiceRow: row, providerVoiceId: row.provider_voice_id };
  }

  if (provider_voice_id) {
    return { voiceRow: null, providerVoiceId: provider_voice_id };
  }

  return { error: { status: 400, code: 'voice_id_or_owner_required' } };
}

/**
 * End-to-end: resolve → TTS → upload → log.
 * Returns { ok, audioUrl, audioPath, generationId, charCount, bytes,
 * providerVoiceId, voiceRow } or { ok: false, status, code, details }.
 */
export async function generateVoiceNote({
  text,
  voice_id, owner_handle, provider_voice_id,
  model, stability, similarity, style,
  source, meta = {},
}) {
  if (!text || !text.trim()) {
    return { ok: false, status: 400, code: 'text_required' };
  }
  if (text.length > MAX_TEXT_CHARS) {
    return { ok: false, status: 400, code: 'text_too_long', details: `max ${MAX_TEXT_CHARS}, got ${text.length}` };
  }

  const resolved = await resolveVoice({ voice_id, owner_handle, provider_voice_id });
  if (resolved.error) return { ok: false, ...resolved.error };

  const tts = await generateTts({
    providerVoiceId: resolved.providerVoiceId,
    text,
    model, stability, similarity, style,
  });
  if (!tts.ok) {
    return { ok: false, status: tts.status, code: 'eleven_tts_failed', details: tts.details };
  }

  const owner = resolved.voiceRow?.owner_handle || owner_handle || 'anon';
  let uploaded;
  try {
    uploaded = await uploadVoiceNote(tts.audioBuf, owner);
  } catch (e) {
    return { ok: false, status: 500, code: 'storage_upload_failed', details: String(e.message || e) };
  }

  const generationId = await logGeneration({
    voice_id: resolved.voiceRow?.id || null,
    owner_handle: owner,
    text,
    audio_path: uploaded.audioPath,
    audio_url: uploaded.audioUrl,
    status: 'generated',
    source: source || 'api',
    meta: { ...meta, model_id: tts.modelId, char_count: text.length, provider_voice_id: resolved.providerVoiceId },
  });

  return {
    ok: true,
    audioBuf: tts.audioBuf,
    audioUrl: uploaded.audioUrl,
    audioPath: uploaded.audioPath,
    generationId,
    charCount: text.length,
    bytes: tts.audioBuf.byteLength,
    providerVoiceId: resolved.providerVoiceId,
    voiceRow: resolved.voiceRow,
  };
}
