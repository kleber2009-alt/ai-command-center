// ═══════════════════════════════════════════════════════════════════
// lib/heygen.js — HeyGen V2 API (avatar video generation)
// ───────────────────────────────────────────────────────────────────
// Flow:
//   1. submitVideo({avatarId, voiceId, script}) → { ok, videoId }
//   2. pollStatus(videoId) → { ok, status: 'processing'|'completed'|'failed', videoUrl? }
//   3. downloadTo(videoUrl, path) → { ok, path }
//
// HeyGen — асинхронный сервис: после submit нужно опросить
// /v1/video_status.get раз в ~30–60 сек. handler делает это,
// перезапланируя сам себя.
//
// docs: https://docs.heygen.com/reference/create-an-avatar-video-v2
// ═══════════════════════════════════════════════════════════════════

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const HEYGEN_KEY = process.env.HEYGEN_API_KEY || '';
const HEYGEN_BASE = process.env.HEYGEN_API_BASE || 'https://api.heygen.com';

// Дефолты, если в payload не пришли. Это «универсальный аватар» из
// HeyGen public library, какой именно — задаём через env, чтобы не
// хардкодить.
const DEFAULT_AVATAR_ID = process.env.HEYGEN_DEFAULT_AVATAR_ID || '';
const DEFAULT_VOICE_ID = process.env.HEYGEN_DEFAULT_VOICE_ID || '';

export function isHeygenConfigured() {
  return Boolean(HEYGEN_KEY);
}

/**
 * POST /v2/video/generate.
 * @param {object} p
 * @param {string} p.script — текст для озвучки (rendered под голос клиента)
 * @param {string} [p.avatarId]
 * @param {string} [p.voiceId]
 * @param {'portrait'|'landscape'|'square'} [p.aspect] — default portrait (для рилсов)
 */
export async function submitVideo(p) {
  if (!HEYGEN_KEY) return { ok: false, error: 'HEYGEN_API_KEY missing' };
  if (!p?.script || p.script.trim().length < 5) return { ok: false, error: 'script empty' };

  const avatarId = p.avatarId || DEFAULT_AVATAR_ID;
  const voiceId = p.voiceId || DEFAULT_VOICE_ID;
  if (!avatarId) return { ok: false, error: 'avatarId missing (set HEYGEN_DEFAULT_AVATAR_ID or pass per-pipeline)' };
  if (!voiceId) return { ok: false, error: 'voiceId missing (set HEYGEN_DEFAULT_VOICE_ID or pass per-pipeline)' };

  const aspect = p.aspect || 'portrait';
  const dimension = aspect === 'landscape'
    ? { width: 1920, height: 1080 }
    : aspect === 'square'
      ? { width: 1080, height: 1080 }
      : { width: 1080, height: 1920 };

  const body = {
    video_inputs: [
      {
        character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
        voice:     { type: 'text', voice_id: voiceId, input_text: p.script.slice(0, 1500) },
        background:{ type: 'color', value: '#000000' },
      },
    ],
    dimension,
    test: process.env.HEYGEN_TEST_MODE === '1', // в test=true HeyGen не списывает кредиты, но и помечает водяной знак
  };

  let res;
  try {
    res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: `heygen submit fetch: ${e.message}` };
  }

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `heygen ${res.status}: ${text.slice(0, 400)}` };
  }

  let parsed;
  try { parsed = JSON.parse(text); } catch (_) {
    return { ok: false, error: `heygen non-json response: ${text.slice(0, 300)}` };
  }
  const videoId = parsed?.data?.video_id;
  if (!videoId) return { ok: false, error: `heygen no video_id in: ${text.slice(0, 300)}` };

  return { ok: true, videoId };
}

/**
 * GET /v1/video_status.get.
 * Возможные статусы: pending, waiting, processing, completed, failed.
 */
export async function pollStatus(videoId) {
  if (!HEYGEN_KEY) return { ok: false, error: 'HEYGEN_API_KEY missing' };
  if (!videoId) return { ok: false, error: 'videoId required' };

  let res;
  try {
    res = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
      method: 'GET',
      headers: { 'X-Api-Key': HEYGEN_KEY },
    });
  } catch (e) {
    return { ok: false, error: `heygen status fetch: ${e.message}` };
  }

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `heygen status ${res.status}: ${text.slice(0, 400)}` };
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) {
    return { ok: false, error: `heygen status non-json: ${text.slice(0, 300)}` };
  }

  const status = parsed?.data?.status || 'unknown';
  const videoUrl = parsed?.data?.video_url || null;
  const errorMessage = parsed?.data?.error?.detail || parsed?.data?.error?.message || null;

  return { ok: true, status, videoUrl, errorMessage, raw: parsed?.data };
}

/**
 * Скачать готовый видео-файл в локальный путь.
 */
export async function downloadTo(url, destPath) {
  if (!url) return { ok: false, error: 'url required' };
  if (!destPath) return { ok: false, error: 'destPath required' };

  try {
    await mkdir(path.dirname(destPath), { recursive: true });
  } catch (e) {
    return { ok: false, error: `download mkdir: ${e.message}` };
  }

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    return { ok: false, error: `download fetch: ${e.message}` };
  }
  if (!res.ok || !res.body) {
    return { ok: false, error: `download ${res.status}` };
  }

  try {
    await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
  } catch (e) {
    return { ok: false, error: `download pipe: ${e.message}` };
  }
  return { ok: true, path: destPath };
}
