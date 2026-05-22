// ═══════════════════════════════════════════════════════════════════
// lib/heygen.js — HeyGen Avatar V (talking-photo only, model_version='v5')
// ───────────────────────────────────────────────────────────────────
// ВНИМАНИЕ. Тут только Avatar V flow. Никаких avatar_id/Avatar IV
// fallback'ов: транскрибатор-бот работает только через фото юзера.
//
// Flow (validated 2026-05-21, портировано из persona-studio/src/lib/heygen.ts):
//   1) uploadAsset(buf, mime) → { id, url, imageKey }
//      POST https://upload.heygen.com/v1/asset
//        X-Api-Key, Content-Type: image/jpeg|png
//      → { code: 100, data: { id, image_key, url } }   (code=100 == success у HeyGen)
//
//   2) createTalkingPhoto(image_key) → { talkingPhotoId, imageUrl }
//      GET https://api.heygen.com/v1/talking_photo.create   (GET с JSON-body — quirk HeyGen)
//      body: { storage_key: image_key }
//      → { code: 100, data: { id, look_id, image_url, status } }
//      asset.id из шага 1 ≠ talking_photo_id; нужен этот промежуточный шаг,
//      чтобы зарегистрировать загруженное фото как Photo Avatar V look.
//
//   3) waitForTalkingPhotoReady(id) — ждём status='completed' через GET /v2/photo_avatar/{id}.
//      Без этого /v2/video/generate отбивает «missing image dimensions».
//
//   4) submitVideo({talkingPhotoId, voiceId, script, aspect}) → { videoId }
//      POST https://api.heygen.com/v2/video/generate
//      character.type = "talking_photo", model_version = "v5" (Avatar V).
//
//   5) pollStatus(videoId) → состояние; 6) downloadTo(url, path) — скачать.
//
// uploadTalkingPhoto(buf, contentType) — публичный helper, делает 1+2+3
// одним вызовом, потому что webhook.js принимает фото от Telegram и сразу
// ждёт готовый talking_photo_id.
// ═══════════════════════════════════════════════════════════════════

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { request as httpsRequest } from 'node:https';

const HEYGEN_KEY = process.env.HEYGEN_API_KEY || '';
const HEYGEN_BASE = process.env.HEYGEN_API_BASE || 'https://api.heygen.com';
const HEYGEN_UPLOAD_BASE = process.env.HEYGEN_UPLOAD_BASE || 'https://upload.heygen.com';

const DEFAULT_VOICE_ID = process.env.HEYGEN_DEFAULT_VOICE_ID || '';

const SUBMIT_TIMEOUT_MS = 60_000;
const STATUS_TIMEOUT_MS = 15_000;
const TP_READY_TIMEOUT_MS = 90_000;
const TP_READY_INTERVAL_MS = 3_000;

// Avatar IV motion engine — более выразительная мимика и естественные движения
// головы по сравнению со старым Unlimited engine. Включается отдельным флагом
// `use_avatar_iv_model: true` внутри character payload, независимо от
// model_version (model_version — это look, флаг — motion engine).
// Можно отключить через HEYGEN_EXPRESSIVE_MOTION=0.
// https://docs.heygen.com/changelog/avatar-iv-support-now-available-in-create-avatar-video-api
const USE_AVATAR_IV_MOTION = process.env.HEYGEN_EXPRESSIVE_MOTION !== '0';

export function isHeygenConfigured() {
  return Boolean(HEYGEN_KEY);
}

/**
 * GET /v2/user/remaining_quota → { api, generative_credit, ... }.
 * `api` is the credit pool that /v2/video/generate burns from. 1 credit ≈
 * 1 second of rendered video, so submitting a 30-sec reel needs ~30 there.
 *
 * Returns { ok: true, apiQuota, raw } or { ok: false, error }.
 */
export async function getRemainingQuota() {
  if (!HEYGEN_KEY) return { ok: false, error: 'HEYGEN_API_KEY missing' };
  let res;
  try {
    res = await fetch(`${HEYGEN_BASE}/v2/user/remaining_quota`, {
      method: 'GET',
      headers: { 'X-Api-Key': HEYGEN_KEY },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, error: `heygen quota fetch: ${e.message}` };
  }
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `heygen quota ${res.status}: ${text.slice(0, 200)}` };
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) {
    return { ok: false, error: `heygen quota non-json: ${text.slice(0, 200)}` };
  }
  const api = parsed?.data?.details?.api ?? parsed?.data?.remaining_quota ?? null;
  return {
    ok: true,
    apiQuota: typeof api === 'number' ? api : null,
    raw: parsed?.data ?? null,
  };
}

// ── Шаг 1: загрузка бинарника как asset ─────────────────────────
// Принимает изображения (image/jpeg|png) или аудио (audio/mpeg).
// HeyGen различает asset_type по Content-Type.
export async function uploadAsset(buf, contentType) {
  if (!HEYGEN_KEY) return { ok: false, error: 'HEYGEN_API_KEY missing' };
  if (!buf || !buf.length) return { ok: false, error: 'empty buffer' };
  const ct =
    contentType === 'image/png' ? 'image/png' :
    contentType === 'audio/mpeg' || contentType === 'audio/mp3' ? 'audio/mpeg' :
    contentType === 'audio/wav' ? 'audio/wav' :
    'image/jpeg';

  let res;
  try {
    res = await fetch(`${HEYGEN_UPLOAD_BASE}/v1/asset`, {
      method: 'POST',
      headers: { 'X-Api-Key': HEYGEN_KEY, 'Content-Type': ct },
      body: buf,
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, error: `heygen asset upload fetch: ${e.message}` };
  }
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `heygen asset ${res.status}: ${text.slice(0, 400)}` };

  let parsed;
  try { parsed = JSON.parse(text); } catch (_) {
    return { ok: false, error: `heygen asset non-json: ${text.slice(0, 300)}` };
  }
  if (parsed?.code !== 100 || !parsed?.data?.id) {
    return { ok: false, error: `heygen asset code ${parsed?.code}: ${parsed?.msg || parsed?.message || text.slice(0, 300)}` };
  }
  // image_key — нужен только для изображений (talking_photo.create step 2).
  // Аудио-asset'ы возвращают `id` без image_key — этого достаточно для
  // voice.type='audio'.
  const needsImageKey = ct.startsWith('image/');
  if (needsImageKey && !parsed.data.image_key) {
    return { ok: false, error: `heygen asset: image_key missing in response: ${text.slice(0, 200)}` };
  }
  return {
    ok: true,
    id: parsed.data.id,
    url: parsed.data.url || '',
    imageKey: parsed.data.image_key || null,
  };
}

// ── Хелпер: загрузить mp3 как HeyGen asset, вернуть asset_id для
//          submitVideo({audioAssetId, ...}).
export async function uploadAudioAsset(buf, contentType = 'audio/mpeg') {
  const a = await uploadAsset(buf, contentType);
  if (!a.ok) return a;
  return { ok: true, audioAssetId: a.id, url: a.url };
}

// HeyGen .create-эндпоинты ждут GET с JSON-body — undici fetch так не умеет
// («Request with GET/HEAD method cannot have body»). Идём через raw https.request.
function heygenGetWithBody(urlString, bodyObj, timeoutMs) {
  const url = new URL(urlString);
  const payload = JSON.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        method: 'GET',
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + (url.search || ''),
        headers: {
          'X-Api-Key': HEYGEN_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (!res.statusCode || res.statusCode >= 400) {
            resolve({ ok: false, error: `HTTP_${res.statusCode}: ${text.slice(0, 400)}` });
            return;
          }
          try {
            resolve({ ok: true, parsed: JSON.parse(text) });
          } catch (_) {
            resolve({ ok: false, error: `non-json: ${text.slice(0, 300)}` });
          }
        });
        res.on('error', (err) => resolve({ ok: false, error: `res err: ${err.message}` }));
      },
    );
    req.on('error', (err) => resolve({ ok: false, error: `req err: ${err.message}` }));
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

// ── Шаг 2: регистрируем asset как Photo Avatar V look ───────────
export async function createTalkingPhoto(imageKey) {
  if (!HEYGEN_KEY) return { ok: false, error: 'HEYGEN_API_KEY missing' };
  if (!imageKey) return { ok: false, error: 'imageKey required' };

  const r = await heygenGetWithBody(
    `${HEYGEN_BASE}/v1/talking_photo.create`,
    { storage_key: imageKey },
    SUBMIT_TIMEOUT_MS,
  );
  if (!r.ok) return { ok: false, error: `talking_photo.create: ${r.error}` };

  const parsed = r.parsed;
  if (parsed?.code !== 100 || !parsed?.data?.id) {
    return { ok: false, error: `talking_photo.create code ${parsed?.code}: ${parsed?.msg || parsed?.message || JSON.stringify(parsed).slice(0, 300)}` };
  }
  return {
    ok: true,
    talkingPhotoId: parsed.data.look_id || parsed.data.id,
    imageUrl: parsed.data.image_url || '',
  };
}

// ── Шаг 3: ждём пока HeyGen прожуёт фото ────────────────────────
// `talking_photo.create` сразу отвечает status='pending', image_width=0.
// /v2/video/generate в этот момент кидает «missing image dimensions».
export async function waitForTalkingPhotoReady(talkingPhotoId) {
  if (!HEYGEN_KEY) return { ok: false, error: 'HEYGEN_API_KEY missing' };
  if (!talkingPhotoId) return { ok: false, error: 'talkingPhotoId required' };

  const deadline = Date.now() + TP_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    let res;
    try {
      res = await fetch(`${HEYGEN_BASE}/v2/photo_avatar/${encodeURIComponent(talkingPhotoId)}`, {
        headers: { 'X-Api-Key': HEYGEN_KEY },
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      });
    } catch (_) {
      // сетевой блип — подождём и попробуем снова
      await new Promise((r) => setTimeout(r, TP_READY_INTERVAL_MS));
      continue;
    }
    if (res.ok) {
      let json;
      try { json = await res.json(); } catch (_) { json = null; }
      const status = json?.data?.status;
      if (status === 'completed') return { ok: true };
      if (status === 'failed') return { ok: false, error: `talking_photo ${talkingPhotoId} failed` };
    }
    await new Promise((r) => setTimeout(r, TP_READY_INTERVAL_MS));
  }
  return { ok: false, error: `talking_photo ${talkingPhotoId} not ready after ${TP_READY_TIMEOUT_MS / 1000}s` };
}

/**
 * Удобный helper: загрузить байты + зарегистрировать как talking photo +
 * подождать пока HeyGen его прожуёт. Возвращает готовый talking_photo_id,
 * который сразу годится для submitVideo().
 *
 * Используется из webhook.js при приёме фото от юзера.
 */
export async function uploadTalkingPhoto(buf, contentType) {
  const asset = await uploadAsset(buf, contentType);
  if (!asset.ok) return asset;

  const tp = await createTalkingPhoto(asset.imageKey);
  if (!tp.ok) return tp;

  const ready = await waitForTalkingPhotoReady(tp.talkingPhotoId);
  if (!ready.ok) return ready;

  return { ok: true, talkingPhotoId: tp.talkingPhotoId, url: tp.imageUrl || asset.url };
}

/**
 * POST /v2/video/generate — Avatar V (model_version='v5'), только talking_photo.
 *
 * Поддерживает два варианта голоса:
 *   • TTS на стороне HeyGen — передай `voiceId` + `script`. Используется
 *     для owner (свой HeyGen voice) и для клиентов без обученного голоса.
 *   • Внешнее аудио (ElevenLabs IVC через нас) — передай `audioAssetId`.
 *     HeyGen лип-синкает к нашему mp3, обходит свой voice provider quota.
 *
 * @param {object} p
 * @param {string} p.script — текст. Обязателен и для text-path (это TTS-вход),
 *                           и для audio-path (логирование/отладка).
 * @param {string} p.talkingPhotoId — обязательно, talking_photo_id из uploadTalkingPhoto()
 * @param {string} [p.voiceId] — HeyGen voice (text-path)
 * @param {string} [p.audioAssetId] — HeyGen audio asset_id (audio-path); если задан, voiceId игнорируется
 * @param {'portrait'|'landscape'|'square'} [p.aspect] — default portrait (для рилсов)
 */
export async function submitVideo(p) {
  if (!HEYGEN_KEY) return { ok: false, error: 'HEYGEN_API_KEY missing' };
  if (!p?.script || p.script.trim().length < 5) return { ok: false, error: 'script empty' };
  if (!p?.talkingPhotoId) {
    return { ok: false, error: 'talkingPhotoId required — Avatar V работает только по фото юзера' };
  }

  let voicePayload;
  if (p.audioAssetId) {
    voicePayload = { type: 'audio', audio_asset_id: p.audioAssetId };
  } else {
    const voiceId = p.voiceId || DEFAULT_VOICE_ID;
    if (!voiceId) return { ok: false, error: 'voiceId missing (set HEYGEN_DEFAULT_VOICE_ID or pass per-pipeline)' };
    voicePayload = { type: 'text', voice_id: voiceId, input_text: p.script.slice(0, 1500) };
  }

  const aspect = p.aspect || 'portrait';
  const dimension = aspect === 'landscape'
    ? { width: 1920, height: 1080 }
    : aspect === 'square'
      ? { width: 1080, height: 1080 }
      : { width: 1080, height: 1920 };

  const body = {
    video_inputs: [
      {
        character: {
          type: 'talking_photo',
          talking_photo_id: p.talkingPhotoId,
          model_version: 'v5',                       // Avatar V (latest look model)
          use_avatar_iv_model: USE_AVATAR_IV_MOTION, // Avatar IV motion engine (more expressive)
        },
        voice:     voicePayload,
        background:{ type: 'color', value: '#000000' },
      },
    ],
    dimension,
    test: process.env.HEYGEN_TEST_MODE === '1',
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
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
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
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
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
