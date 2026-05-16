// ═══════════════════════════════════════════════════════════════════
// netlify/functions/voice-generate.js
// ───────────────────────────────────────────────────────────────────
// POST /api/voice-generate — TTS клонированным голосом через ElevenLabs.
//
// Self-hosted версия:
//   · mp3 сохраняется в локальную папку VOICE_NOTES_DIR/{owner}/{ts}.mp3
//   · публичный URL отдаёт наш Node-сервер по /files/voice-notes/...
//   · лог пишется в Postgres (таблица voice_generations)
//
// Body (JSON):
//   { text, voice_id?, provider_voice_id?, owner_handle?,
//     model_id?, stability?, similarity_boost?, style?, source? }
//
// Env:
//   ELEVENLABS_API_KEY, DATABASE_URL
//   VOICE_NOTES_DIR     — куда писать mp3 (default /data/voice-notes)
//   VOICE_NOTES_PUBLIC_URL — префикс для audio_url (default /files/voice-notes)
// ═══════════════════════════════════════════════════════════════════

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { query, isDbConfigured } from '../../server/db.js';

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
const DEFAULT_MODEL = 'eleven_multilingual_v2';
const MAX_TEXT_CHARS = 1500;

const VOICE_NOTES_DIR = process.env.VOICE_NOTES_DIR || '/data/voice-notes';
const VOICE_NOTES_PUBLIC_URL = (process.env.VOICE_NOTES_PUBLIC_URL || '/files/voice-notes').replace(/\/+$/, '');

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

function clamp01(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
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

  if (!process.env.ELEVENLABS_API_KEY) return json(503, { error: 'eleven_not_configured' });
  if (!isDbConfigured()) return json(503, { error: 'db_not_configured' });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'bad_request', message: 'Invalid JSON' });
  }

  const text = String(body.text || '').trim();
  if (!text) return json(400, { error: 'text_required' });
  if (text.length > MAX_TEXT_CHARS) {
    return json(400, { error: 'text_too_long', max: MAX_TEXT_CHARS, got: text.length });
  }

  // ── Резолвим голос ──────────────────────────────────────────────
  let voiceRow = null;
  let providerVoiceId = body.provider_voice_id || null;

  if (body.voice_id) {
    const res = await query(
      `select id, owner_handle, provider_voice_id from voices where id = $1`,
      [body.voice_id],
    );
    voiceRow = res?.rows[0];
    if (!voiceRow) return json(404, { error: 'voice_not_found', voice_id: body.voice_id });
    providerVoiceId = voiceRow.provider_voice_id;
  } else if (body.owner_handle && !providerVoiceId) {
    const res = await query(
      `select id, owner_handle, provider_voice_id
         from voices
        where owner_handle = $1 and archived_at is null
        order by created_at desc
        limit 1`,
      [body.owner_handle],
    );
    voiceRow = res?.rows[0];
    if (!voiceRow) {
      return json(404, { error: 'no_active_voice_for_owner', owner_handle: body.owner_handle });
    }
    providerVoiceId = voiceRow.provider_voice_id;
  }

  if (!providerVoiceId) {
    return json(400, { error: 'voice_id_or_owner_required' });
  }

  // ── ElevenLabs TTS ──────────────────────────────────────────────
  const ttsBody = {
    text,
    model_id: body.model_id || DEFAULT_MODEL,
    voice_settings: {
      stability: clamp01(body.stability, 0.55),
      similarity_boost: clamp01(body.similarity_boost, 0.85),
      style: clamp01(body.style, 0.0),
      use_speaker_boost: true,
    },
  };

  let ttsRes;
  try {
    ttsRes = await fetch(
      `${ELEVENLABS_API}/text-to-speech/${encodeURIComponent(providerVoiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify(ttsBody),
      },
    );
  } catch (e) {
    return json(502, { error: 'eleven_unreachable', message: String(e?.message || e) });
  }

  if (!ttsRes.ok) {
    const errText = await ttsRes.text();
    return json(ttsRes.status, {
      error: 'eleven_tts_failed',
      status: ttsRes.status,
      details: errText.slice(0, 600),
    });
  }

  const audioBuf = Buffer.from(await ttsRes.arrayBuffer());

  // ── Пишем mp3 на локальный диск ─────────────────────────────────
  const owner = voiceRow?.owner_handle || body.owner_handle || 'anon';
  const safeOwner = owner.replace(/[^a-z0-9._@-]/gi, '_');
  const filename = `${Date.now()}.mp3`;
  const relPath = `${safeOwner}/${filename}`;
  const absPath = path.join(VOICE_NOTES_DIR, relPath);

  try {
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, audioBuf);
  } catch (e) {
    return json(500, {
      error: 'fs_write_failed',
      message: String(e?.message || e),
      hint: `VOICE_NOTES_DIR=${VOICE_NOTES_DIR} должен быть writable`,
    });
  }

  const audioUrl = `${VOICE_NOTES_PUBLIC_URL}/${relPath}`;

  // ── Логируем генерацию (best-effort) ────────────────────────────
  let generationId = null;
  try {
    const ins = await query(
      `insert into voice_generations (voice_id, owner_handle, text, audio_path, audio_url, status, source, meta)
       values ($1, $2, $3, $4, $5, 'generated', $6, $7::jsonb)
       returning id`,
      [
        voiceRow?.id || null,
        owner,
        text,
        relPath,
        audioUrl,
        body.source || 'api',
        JSON.stringify({
          model_id: ttsBody.model_id,
          char_count: text.length,
          provider_voice_id: providerVoiceId,
        }),
      ],
    );
    generationId = ins?.rows[0]?.id ?? null;
  } catch (e) {
    console.warn('[voice-generate] log insert failed:', e?.message);
  }

  return json(200, {
    ok: true,
    generation_id: generationId,
    audio_url: audioUrl,
    audio_path: relPath,
    char_count: text.length,
    bytes: audioBuf.byteLength,
    provider_voice_id: providerVoiceId,
  });
};

export const config = { path: '/api/voice-generate' };
