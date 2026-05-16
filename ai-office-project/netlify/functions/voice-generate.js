// ═══════════════════════════════════════════════════════════════════
// netlify/functions/voice-generate.js
// ───────────────────────────────────────────────────────────────────
// POST /api/voice-generate — TTS клонированным голосом через ElevenLabs.
//
// Body (JSON):
//   { text, voice_id?, provider_voice_id?, owner_handle?,
//     model_id?, stability?, similarity_boost?, source? }
//
// Возвращает audio_url из Supabase Storage + лог в voice_generations.
//
// Реальная логика — в _shared/voice-pipeline.js (используется также
// /api/tg-voice-webhook).
//
// Env: ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY.
// ═══════════════════════════════════════════════════════════════════

import { generateVoiceNote } from './_shared/voice-pipeline.js';

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const supaUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!elevenKey) return json(503, { error: 'eleven_not_configured' });
  if (!supaUrl || !serviceKey) return json(503, { error: 'supabase_not_configured' });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'bad_request', message: 'Invalid JSON' });
  }

  const result = await generateVoiceNote({
    supaUrl, serviceKey, elevenKey,
    text: String(body.text || '').trim(),
    voice_id: body.voice_id,
    owner_handle: body.owner_handle,
    provider_voice_id: body.provider_voice_id,
    model: body.model_id,
    stability: body.stability,
    similarity: body.similarity_boost,
    style: body.style,
    source: body.source || 'api',
  });

  if (!result.ok) {
    return json(result.status || 500, {
      error: result.code || 'failed',
      details: result.details,
    });
  }

  return json(200, {
    ok: true,
    generation_id: result.generationId,
    audio_url: result.audioUrl,
    audio_path: result.audioPath,
    char_count: result.charCount,
    bytes: result.bytes,
    provider_voice_id: result.providerVoiceId,
  });
};

export const config = { path: '/api/voice-generate' };
