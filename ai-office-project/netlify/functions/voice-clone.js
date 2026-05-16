// ═══════════════════════════════════════════════════════════════════
// netlify/functions/voice-clone.js
// ───────────────────────────────────────────────────────────────────
// POST /api/voice-clone — клонирование голоса через ElevenLabs.
//
// Self-hosted версия (после переезда с Supabase):
//   · хранит запись в локальном Postgres (таблица voices)
//   · файлы пока никуда не пишет (mp3 генерится в voice-generate)
//
// Env:
//   ELEVENLABS_API_KEY  — ключ от api.elevenlabs.io
//   DATABASE_URL        — postgres://user:pass@host:5432/db
// ═══════════════════════════════════════════════════════════════════

import { query, isDbConfigured } from '../../server/db.js';

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
const MAX_TOTAL_BYTES = 11 * 1024 * 1024;

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

  if (!process.env.ELEVENLABS_API_KEY) {
    return json(503, { error: 'eleven_not_configured', hint: 'Задай ELEVENLABS_API_KEY' });
  }
  if (!isDbConfigured()) {
    return json(503, { error: 'db_not_configured', hint: 'Задай DATABASE_URL' });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: 'bad_request', message: 'Expected multipart/form-data' });
  }

  const ownerHandle = String(form.get('owner_handle') || '').trim();
  if (!ownerHandle) return json(400, { error: 'owner_handle_required' });

  const displayName = String(form.get('display_name') || ownerHandle).trim().slice(0, 80);
  const sampleSeconds = parseInt(form.get('sample_seconds'), 10) || null;

  const files = form.getAll('files').filter((f) => f && typeof f === 'object' && 'arrayBuffer' in f);
  if (!files.length) return json(400, { error: 'no_audio_files' });

  const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return json(413, {
      error: 'payload_too_large',
      max_mb: MAX_TOTAL_BYTES / 1024 / 1024,
      got_mb: +(totalBytes / 1024 / 1024).toFixed(2),
    });
  }

  // ── ElevenLabs clone ─────────────────────────────────────────────
  const elevenForm = new FormData();
  elevenForm.append('name', displayName);
  elevenForm.append('description', `AI Growth Office voice clone for ${ownerHandle}`);
  for (const file of files) {
    elevenForm.append('files', file, file.name || 'sample.mp3');
  }

  let cloneRes;
  try {
    cloneRes = await fetch(`${ELEVENLABS_API}/voices/add`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      body: elevenForm,
    });
  } catch (e) {
    return json(502, { error: 'eleven_unreachable', message: String(e?.message || e) });
  }

  if (!cloneRes.ok) {
    const text = await cloneRes.text();
    return json(cloneRes.status, {
      error: 'eleven_clone_failed',
      status: cloneRes.status,
      details: text.slice(0, 600),
    });
  }

  const cloneData = await cloneRes.json();
  const providerVoiceId = cloneData.voice_id;
  if (!providerVoiceId) {
    return json(502, { error: 'eleven_no_voice_id', details: cloneData });
  }

  // ── Архивируем прошлый активный голос владельца и пишем новый ───
  try {
    await query(
      `update voices set archived_at = now()
        where owner_handle = $1 and archived_at is null`,
      [ownerHandle],
    );

    const insert = await query(
      `insert into voices (owner_handle, display_name, provider, provider_voice_id, sample_seconds)
       values ($1, $2, 'elevenlabs', $3, $4)
       returning id, owner_handle, display_name, provider_voice_id, sample_seconds, created_at`,
      [ownerHandle, displayName, providerVoiceId, sampleSeconds],
    );
    const row = insert.rows[0];

    return json(200, {
      ok: true,
      voice_id: row.id,
      provider_voice_id: row.provider_voice_id,
      display_name: row.display_name,
      owner_handle: row.owner_handle,
      created_at: row.created_at,
    });
  } catch (e) {
    return json(500, {
      error: 'db_insert_failed',
      message: String(e?.message || e),
      provider_voice_id: providerVoiceId,
    });
  }
};

export const config = { path: '/api/voice-clone' };
