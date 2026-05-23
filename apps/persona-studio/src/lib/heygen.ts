// HeyGen client — talking-photo flow на Avatar V (model_version='v5').
//
// Flow (validated 2026-05-21):
//   1) uploadAsset(buf, mime) → image_key
//      POST https://upload.heygen.com/v1/asset
//        X-Api-Key, Content-Type: image/jpeg|png
//        body: raw binary
//      → { code: 100, data: { id, image_key, url } }   (code=100 == success у HeyGen)
//
//   2) createTalkingPhoto(image_key) → look_id (= talking_photo_id)
//      GET https://api.heygen.com/v1/talking_photo.create   (yes, GET with JSON body — HeyGen quirk)
//      → { code: 100, data: { id, look_id, is_valid, status } }
//      asset.id из шага 1 ≠ talking_photo_id; нужен этот промежуточный шаг
//      чтобы зарегистрировать загруженное фото как Photo Avatar V3 look.
//
//   3) createVideo({ talking_photo_id, voice_id, script, aspect }) → video_id
//      POST https://api.heygen.com/v2/video/generate
//      character.type = "talking_photo", talking_photo_id = look_id from step 2
//
//   4) pollVideo(video_id) → { state, video_url? }
//      GET https://api.heygen.com/v1/video_status.get?video_id=...
//      states: pending | waiting | processing | completed | failed

import { request as httpsRequest } from 'node:https';

const HEYGEN_KEY_ENV = 'HEYGEN_API_KEY';
const HEYGEN_BASE = process.env.HEYGEN_API_BASE || 'https://api.heygen.com';
const HEYGEN_UPLOAD = process.env.HEYGEN_UPLOAD_BASE || 'https://upload.heygen.com';

const SUBMIT_TIMEOUT_MS = 60_000;
const STATUS_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 8_000;
const POLL_MAX_ATTEMPTS = 75;   // ~10 минут

export class HeygenError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HeygenError';
  }
}

function keyOrThrow(): string {
  const k = process.env[HEYGEN_KEY_ENV];
  if (!k) throw new HeygenError('MISSING_KEY', `${HEYGEN_KEY_ENV} is not set`);
  return k;
}

type AssetUploadResp = {
  code?: number;
  data?: { id?: string; url?: string; image_key?: string };
  msg?: string | null;
  message?: string | null;
};

/**
 * Step 1: Upload binary image → returns asset id + image_key.
 * Note: asset.id ≠ talking_photo_id; нужен ещё createTalkingPhoto() ниже.
 */
export async function uploadAsset(opts: {
  bytes: Buffer;
  mime: string;
}): Promise<{ id: string; url: string; imageKey: string }> {
  const key = keyOrThrow();
  const res = await fetch(`${HEYGEN_UPLOAD}/v1/asset`, {
    method: 'POST',
    headers: {
      'X-Api-Key': key,
      'Content-Type': opts.mime || 'image/jpeg',
    },
    body: new Uint8Array(opts.bytes),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new HeygenError(`UPLOAD_HTTP_${res.status}`, text.slice(0, 400));

  let parsed: AssetUploadResp;
  try { parsed = JSON.parse(text) as AssetUploadResp; }
  catch { throw new HeygenError('UPLOAD_NON_JSON', text.slice(0, 300)); }

  if (parsed.code !== 100 || !parsed.data?.id || !parsed.data?.image_key) {
    throw new HeygenError(`UPLOAD_${parsed.code ?? 'NO_CODE'}`, parsed.msg || parsed.message || text.slice(0, 300));
  }
  return {
    id: parsed.data.id,
    url: parsed.data.url ?? '',
    imageKey: parsed.data.image_key,
  };
}

type TalkingPhotoCreateResp = {
  code?: number;
  data?: {
    id?: string;
    look_id?: string;
    image_url?: string;
    is_valid?: boolean;
    status?: string;
  };
  msg?: string | null;
  message?: string | null;
};

/**
 * Internal: HeyGen `.create` endpoints expect GET with JSON body, which Node's
 * undici-based fetch refuses ("Request with GET/HEAD method cannot have body").
 * Bypass via raw https.request().
 */
function heygenGetWithBody<T>(urlString: string, body: object, timeoutMs: number): Promise<T> {
  const url = new URL(urlString);
  const key = keyOrThrow();
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        method: 'GET',
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + (url.search || ''),
        headers: {
          'X-Api-Key': key,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new HeygenError(`HTTP_${res.statusCode}`, text.slice(0, 400)));
            return;
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch {
            reject(new HeygenError('NON_JSON', text.slice(0, 300)));
          }
        });
        res.on('error', (err: Error) => reject(new HeygenError('RES_ERR', err.message)));
      },
    );
    req.on('error', (err: Error) => reject(new HeygenError('REQ_ERR', err.message)));
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

/**
 * Step 2: Register uploaded asset as Photo Avatar look → returns talking_photo_id.
 * Uses HeyGen's unusual GET-with-body convention.
 */
export async function createTalkingPhoto(imageKey: string): Promise<{ talkingPhotoId: string; imageUrl: string }> {
  const parsed = await heygenGetWithBody<TalkingPhotoCreateResp>(
    `${HEYGEN_BASE}/v1/talking_photo.create`,
    { storage_key: imageKey },
    SUBMIT_TIMEOUT_MS,
  );
  if (parsed.code !== 100 || !parsed.data?.id) {
    throw new HeygenError(`TP_CREATE_${parsed.code ?? 'NO_CODE'}`, parsed.msg || parsed.message || JSON.stringify(parsed).slice(0, 300));
  }
  return {
    talkingPhotoId: parsed.data.look_id ?? parsed.data.id,
    imageUrl: parsed.data.image_url ?? '',
  };
}

/**
 * Step 2b: Poll HeyGen until a freshly-created talking photo is processed.
 *
 * `talking_photo.create` returns immediately with status='pending' and
 * image_width=0. If we hand the talking_photo_id to /v2/video/generate at this
 * point, HeyGen rejects with "missing image dimensions". We must wait for
 * `GET /v2/photo_avatar/{id}` to report status='completed' first (~10–30s
 * empirically; capped at 90s to fail loud on truly stuck uploads).
 */
async function waitForTalkingPhotoReady(talkingPhotoId: string): Promise<void> {
  const key = keyOrThrow();
  const deadline = Date.now() + 90_000;
  const intervalMs = 3_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${HEYGEN_BASE}/v2/photo_avatar/${encodeURIComponent(talkingPhotoId)}`, {
      headers: { 'X-Api-Key': key },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    if (res.ok) {
      const json = await res.json() as { data?: { status?: string } };
      const status = json.data?.status;
      if (status === 'completed') return;
      if (status === 'failed') {
        throw new HeygenError('TP_READY_FAILED', `talking_photo ${talkingPhotoId} reported failed`);
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new HeygenError('TP_READY_TIMEOUT', `talking_photo ${talkingPhotoId} not ready after 90s`);
}

/**
 * Convenience: upload bytes + register as talking photo + wait until processed.
 * Returns the talking_photo_id ready to use in /v2/video/generate.
 */
export async function uploadTalkingPhoto(opts: {
  bytes: Buffer;
  mime: string;
}): Promise<{ id: string; imageUrl: string }> {
  const asset = await uploadAsset(opts);
  const tp = await createTalkingPhoto(asset.imageKey);
  await waitForTalkingPhotoReady(tp.talkingPhotoId);
  return { id: tp.talkingPhotoId, imageUrl: tp.imageUrl || asset.url };
}

export type Aspect = '9:16' | '1:1' | '16:9';
export type HeygenModelVersion = 'V' | 'IV';
export type Quality = '1080p' | '2k';

// 1080p = FullHD; 2K = QHD (1440p short side). HeyGen принимает произвольные
// размеры; для согласованности с YouTube/Reels-стандартами держим:
//   9:16  → 1080×1920  / 1440×2560
//   1:1   → 1080×1080  / 2048×2048
//   16:9  → 1920×1080  / 2560×1440
function dimensionFor(aspect: Aspect, quality: Quality = '2k'): { width: number; height: number } {
  if (quality === '2k') {
    switch (aspect) {
      case '1:1':  return { width: 2048, height: 2048 };
      case '16:9': return { width: 2560, height: 1440 };
      case '9:16':
      default:     return { width: 1440, height: 2560 };
    }
  }
  switch (aspect) {
    case '1:1':  return { width: 1080, height: 1080 };
    case '16:9': return { width: 1920, height: 1080 };
    case '9:16':
    default:     return { width: 1080, height: 1920 };
  }
}

// Motion prompt по умолчанию — максимально «живая» подача для talking photo.
// Передаётся в character.motion_prompt только в Avatar IV (V его не принимает).
// Константа живёт в client-safe файле heygen-motion.ts, чтобы её мог импортить UI.
export { MAX_REALISM_MOTION_PROMPT } from './heygen-motion';
import { MAX_REALISM_MOTION_PROMPT } from './heygen-motion';

// ── Avatar engines: V (v3 API) vs IV (v2 API) ────────────────────────────
// HeyGen на 2026-05 даёт три движка для photo-input, но API у них РАЗНЫЙ:
//
//   Avatar III — legacy default в v2 без флагов. Старый движок, слабая мимика.
//   Avatar IV  — v2 /v2/video/generate с use_avatar_iv_model=true.
//                Принимает motion_prompt. Hi-Def talking-photo.
//   Avatar V   — ТОЛЬКО v3 /v3/videos с engine.type='avatar_v'.
//                Cross-reference-driven animation, latest model.
//                НЕ принимает motion_prompt (rejected API-side); HeyGen строит
//                движение сам по референсу. Quality: 720p/1080p/4k (нет 2k).
//
// Раньше мы слали `model_version: 'v5'` в v2 — HeyGen этот ключ игнорировал,
// поэтому при выборе «Avatar V» юзер получал Avatar III. Теперь createVideoAvatarV
// идёт по v3 цепочке (asset → photo_avatar → video → poll), и UI-слот реально
// рендерится через Avatar V.
//
// Источники:
//   https://developers.heygen.com/models.md  ("Avatar V (v3, opt-in)")
//   https://developers.heygen.com/reference/create-video.md
//   https://docs.heygen.com/changelog/avatar-iv-support-now-available-in-create-avatar-video-api

export type CreateVideoBaseOpts = {
  talkingPhotoId: string;
  voiceId: string;
  script: string;
  aspect?: Aspect;
  quality?: Quality;          // 1080p (FullHD) | 2k (QHD); default — '2k'
  background?: string;        // hex like "#000000"; default — black
  testMode?: boolean;
};

export type CreateVideoAvatarVOpts = CreateVideoBaseOpts;

export type CreateVideoAvatarIVOpts = CreateVideoBaseOpts & {
  motionPrompt?: string;      // English; '' to disable; default — MAX_REALISM_MOTION_PROMPT
};

type VideoGenerateResp = {
  data?: { video_id?: string };
  error?: { message?: string; detail?: string } | null;
  message?: string | null;
};

function validateBase(opts: CreateVideoBaseOpts): void {
  if (!opts.script || opts.script.trim().length < 5) {
    throw new HeygenError('BAD_SCRIPT', 'script too short');
  }
  if (!opts.talkingPhotoId) throw new HeygenError('MISSING_PHOTO_ID', 'talkingPhotoId required');
  if (!opts.voiceId)        throw new HeygenError('MISSING_VOICE_ID', 'voiceId required');
}

async function submitVideo(opts: CreateVideoBaseOpts, character: Record<string, unknown>): Promise<string> {
  const key = keyOrThrow();
  const body = {
    video_inputs: [
      {
        character,
        voice: {
          type: 'text',
          voice_id: opts.voiceId,
          input_text: opts.script.slice(0, 1500),
        },
        background: { type: 'color', value: opts.background ?? '#000000' },
      },
    ],
    dimension: dimensionFor(opts.aspect ?? '9:16', opts.quality ?? '2k'),
    test: opts.testMode ?? false,
  };

  const res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: 'POST',
    headers: {
      'X-Api-Key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new HeygenError(`SUBMIT_HTTP_${res.status}`, text.slice(0, 400));

  let parsed: VideoGenerateResp;
  try { parsed = JSON.parse(text) as VideoGenerateResp; }
  catch { throw new HeygenError('SUBMIT_NON_JSON', text.slice(0, 300)); }

  const id = parsed.data?.video_id;
  if (!id) throw new HeygenError('SUBMIT_NO_VIDEO_ID', text.slice(0, 300));
  return id;
}

/**
 * Avatar V — DEPRECATED stub. Реальный Avatar V живёт на v3 endpoint и идёт
 * по совершенно другой цепочке (uploadAssetV3 → createPhotoAvatarV3 →
 * createVideoV3AvatarV → waitForVideoV3). Эта функция оставлена только для
 * того, чтобы не сломать импорты — воркер для version='V' использует v3 flow.
 */
export async function createVideoAvatarV(_opts: CreateVideoAvatarVOpts): Promise<string> {
  throw new HeygenError(
    'AVATAR_V_USE_V3',
    'Avatar V доступен только через v3 API — используй createVideoV3AvatarV',
  );
}

/**
 * Avatar IV — expressive motion engine (use_avatar_iv_model=true).
 * Принимает motion_prompt; model_version не передаётся (этот флаг полностью
 * переопределяет движок).
 */
export async function createVideoAvatarIV(opts: CreateVideoAvatarIVOpts): Promise<string> {
  validateBase(opts);
  const motionPrompt = opts.motionPrompt ?? MAX_REALISM_MOTION_PROMPT;
  const character: Record<string, unknown> = {
    type: 'talking_photo',
    talking_photo_id: opts.talkingPhotoId,
    use_avatar_iv_model: true,
  };
  if (motionPrompt.trim().length > 0) {
    character.motion_prompt = motionPrompt.slice(0, 2000);
  }
  return submitVideo(opts, character);
}

/**
 * Dispatch helper — выбирает функцию по версии.
 * Удобно для воркера, где версия приходит из БД.
 */
export function createVideoForVersion(
  version: HeygenModelVersion,
  opts: CreateVideoAvatarIVOpts,
): Promise<string> {
  if (version === 'IV') return createVideoAvatarIV(opts);
  return createVideoAvatarV(opts);
}

type VideoStatusResp = {
  data?: {
    status?: 'pending' | 'waiting' | 'processing' | 'completed' | 'failed' | string;
    video_url?: string | null;
    thumbnail_url?: string | null;
    error?: { message?: string; detail?: string } | null;
    duration?: number | null;
  };
};

export type HeygenVideoStatus =
  | { state: 'pending' | 'waiting' | 'processing'; videoId: string }
  | { state: 'completed'; videoId: string; videoUrl: string; thumbnailUrl: string | null; duration: number | null }
  | { state: 'failed'; videoId: string; errorMessage: string };

export async function getVideoStatus(videoId: string): Promise<HeygenVideoStatus> {
  const key = keyOrThrow();
  const res = await fetch(
    `${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
    {
      headers: { 'X-Api-Key': key },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new HeygenError(`STATUS_HTTP_${res.status}`, text.slice(0, 400));

  let parsed: VideoStatusResp;
  try { parsed = JSON.parse(text) as VideoStatusResp; }
  catch { throw new HeygenError('STATUS_NON_JSON', text.slice(0, 300)); }

  const d = parsed.data ?? {};
  const state = d.status ?? 'pending';

  if (state === 'completed') {
    if (!d.video_url) throw new HeygenError('NO_URL', 'completed but no video_url');
    return {
      state: 'completed',
      videoId,
      videoUrl: d.video_url,
      thumbnailUrl: d.thumbnail_url ?? null,
      duration: d.duration ?? null,
    };
  }
  if (state === 'failed') {
    return {
      state: 'failed',
      videoId,
      errorMessage: d.error?.detail || d.error?.message || 'heygen returned failed',
    };
  }
  return { state: (state as 'pending' | 'waiting' | 'processing') ?? 'pending', videoId };
}

export async function waitForVideo(videoId: string): Promise<HeygenVideoStatus> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const s = await getVideoStatus(videoId);
    if (s.state === 'completed' || s.state === 'failed') return s;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new HeygenError('TIMEOUT', `video ${videoId} did not finish in ${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS}ms`);
}

export async function downloadBytes(url: string): Promise<{ bytes: Buffer; mime: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new HeygenError(`DL_HTTP_${res.status}`, `download failed: ${url}`);
  const mime = res.headers.get('content-type') ?? 'video/mp4';
  const ab = await res.arrayBuffer();
  return { bytes: Buffer.from(ab), mime };
}

// ── Voices (статическая курация для MVP) ─────────────────────
// HeyGen возвращает >1000 голосов через /v2/voices, но для MVP UI
// проще предложить 4 проверенных дефолта на ru/en. Расширим позже.
//
// Get voices via API: GET https://api.heygen.com/v2/voices
//                     X-Api-Key
// Returns: { data: { voices: [{ voice_id, language, gender, name, preview_audio }, ...] } }

export { VOICE_PRESETS, voiceById, type VoicePreset } from './heygen-voices';

// ════════════════════════════════════════════════════════════════════════
// v3 API — Avatar V flow
// ════════════════════════════════════════════════════════════════════════
//
// Flow:
//   1) POST /v3/assets        (raw bytes)            → asset_id
//   2) POST /v3/avatars       ({type:photo, file:{asset_id}}) → avatar_id
//   3) POST /v3/videos        ({type:avatar, avatar_id, engine:{type:'avatar_v'}, ...}) → video_id
//   4) GET  /v3/videos/{id}                                  → status, video_url
//
// API contract: https://developers.heygen.com/reference/create-video.md
//

const HEYGEN_V3 = `${HEYGEN_BASE}/v3`;

export type V3Resolution = '720p' | '1080p' | '4k';
export type V3AspectRatio = '9:16' | '1:1' | '16:9' | '4:5' | '5:4' | 'auto';

/** Маппинг нашего UI quality → v3 resolution (v3 не знает «2k», берём 4k). */
export function v3ResolutionFromQuality(q: Quality | undefined): V3Resolution {
  return q === '2k' ? '4k' : '1080p';
}

type V3AssetResp = {
  code?: number;
  data?: { id?: string; asset_id?: string; url?: string };
  message?: string | null;
  msg?: string | null;
};

/** v3 Step 1: upload image bytes → asset_id. */
export async function uploadAssetV3(opts: { bytes: Buffer; mime: string }): Promise<string> {
  const key = keyOrThrow();
  const res = await fetch(`${HEYGEN_V3}/assets`, {
    method: 'POST',
    headers: { 'X-Api-Key': key, 'Content-Type': opts.mime || 'image/jpeg' },
    body: new Uint8Array(opts.bytes),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new HeygenError(`V3_ASSET_HTTP_${res.status}`, text.slice(0, 400));
  let parsed: V3AssetResp;
  try { parsed = JSON.parse(text) as V3AssetResp; }
  catch { throw new HeygenError('V3_ASSET_NON_JSON', text.slice(0, 300)); }
  const id = parsed.data?.id ?? parsed.data?.asset_id;
  if (!id) throw new HeygenError('V3_ASSET_NO_ID', text.slice(0, 300));
  return id;
}

type V3AvatarResp = {
  code?: number;
  data?: { avatar_item?: { id?: string; supported_api_engines?: string[] } };
  message?: string | null;
};

/** v3 Step 2: создать photo-аватар из uploaded asset → avatar_id. */
export async function createPhotoAvatarV3(opts: { assetId: string; name?: string }): Promise<{
  avatarId: string;
  supportedEngines: string[];
}> {
  const key = keyOrThrow();
  const body = {
    type: 'photo' as const,
    name: opts.name ?? `pers-${Date.now()}`,
    file: { type: 'asset_id' as const, asset_id: opts.assetId },
  };
  const res = await fetch(`${HEYGEN_V3}/avatars`, {
    method: 'POST',
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new HeygenError(`V3_AVATAR_HTTP_${res.status}`, text.slice(0, 400));
  let parsed: V3AvatarResp;
  try { parsed = JSON.parse(text) as V3AvatarResp; }
  catch { throw new HeygenError('V3_AVATAR_NON_JSON', text.slice(0, 300)); }
  const id = parsed.data?.avatar_item?.id;
  if (!id) throw new HeygenError('V3_AVATAR_NO_ID', text.slice(0, 300));
  return {
    avatarId: id,
    supportedEngines: parsed.data?.avatar_item?.supported_api_engines ?? [],
  };
}

export type CreateVideoV3AvatarVOpts = {
  avatarId: string;            // из createPhotoAvatarV3
  voiceId: string;
  script: string;
  aspect?: Aspect;
  quality?: Quality;           // мапим в V3Resolution
  background?: string;         // hex, v3 принимает background object — добавим если HeyGen откажет
};

type V3CreateVideoResp = {
  code?: number;
  data?: { video_id?: string };
  message?: string | null;
};

/**
 * v3 Step 3: создать видео с engine.type='avatar_v'.
 *
 * Avatar V не принимает motion_prompt — HeyGen строит движение по
 * cross-reference сам. См. "Avatar IV only; rejected when engine.type='avatar_v'"
 * в /reference/create-video.md.
 */
export async function createVideoV3AvatarV(opts: CreateVideoV3AvatarVOpts): Promise<string> {
  if (!opts.script || opts.script.trim().length < 5) {
    throw new HeygenError('BAD_SCRIPT', 'script too short');
  }
  if (!opts.avatarId) throw new HeygenError('MISSING_AVATAR_ID', 'avatarId required');
  if (!opts.voiceId)  throw new HeygenError('MISSING_VOICE_ID', 'voiceId required');

  const aspect = opts.aspect ?? '9:16';
  const resolution = v3ResolutionFromQuality(opts.quality ?? '2k');

  const body: Record<string, unknown> = {
    type: 'avatar',
    avatar_id: opts.avatarId,
    script: opts.script.slice(0, 1500),
    voice_id: opts.voiceId,
    resolution,
    aspect_ratio: aspect as V3AspectRatio,
    engine: { type: 'avatar_v' },
  };

  const key = keyOrThrow();
  const res = await fetch(`${HEYGEN_V3}/videos`, {
    method: 'POST',
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new HeygenError(`V3_VIDEO_HTTP_${res.status}`, text.slice(0, 400));
  let parsed: V3CreateVideoResp;
  try { parsed = JSON.parse(text) as V3CreateVideoResp; }
  catch { throw new HeygenError('V3_VIDEO_NON_JSON', text.slice(0, 300)); }
  const id = parsed.data?.video_id;
  if (!id) throw new HeygenError('V3_VIDEO_NO_ID', text.slice(0, 300));
  return id;
}

type V3VideoStatusResp = {
  code?: number;
  data?: {
    status?: string;
    video_url?: string | null;
    thumbnail_url?: string | null;
    duration?: number | null;
    error?: { message?: string; detail?: string } | null;
  };
  message?: string | null;
};

/** v3 Step 4a: GET /v3/videos/{id} status. */
export async function getVideoStatusV3(videoId: string): Promise<HeygenVideoStatus> {
  const key = keyOrThrow();
  const res = await fetch(`${HEYGEN_V3}/videos/${encodeURIComponent(videoId)}`, {
    headers: { 'X-Api-Key': key },
    signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new HeygenError(`V3_STATUS_HTTP_${res.status}`, text.slice(0, 400));
  let parsed: V3VideoStatusResp;
  try { parsed = JSON.parse(text) as V3VideoStatusResp; }
  catch { throw new HeygenError('V3_STATUS_NON_JSON', text.slice(0, 300)); }
  const d = parsed.data ?? {};
  const state = (d.status ?? 'pending').toLowerCase();
  if (state === 'completed' || state === 'success') {
    if (!d.video_url) throw new HeygenError('V3_NO_URL', 'completed but no video_url');
    return {
      state: 'completed',
      videoId,
      videoUrl: d.video_url,
      thumbnailUrl: d.thumbnail_url ?? null,
      duration: d.duration ?? null,
    };
  }
  if (state === 'failed' || state === 'error') {
    return {
      state: 'failed',
      videoId,
      errorMessage: d.error?.detail || d.error?.message || 'v3 video failed',
    };
  }
  // pending | waiting | processing
  const norm = state === 'processing' || state === 'pending' || state === 'waiting'
    ? (state as 'pending' | 'waiting' | 'processing')
    : 'processing';
  return { state: norm, videoId };
}

/** v3 Step 4b: poll until completed/failed. */
export async function waitForVideoV3(videoId: string): Promise<HeygenVideoStatus> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const s = await getVideoStatusV3(videoId);
    if (s.state === 'completed' || s.state === 'failed') return s;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new HeygenError('V3_TIMEOUT', `v3 video ${videoId} did not finish in ${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS}ms`);
}

/** Convenience: байты → asset_id → avatar_id за один вызов. */
export async function uploadPhotoAvatarV3(opts: {
  bytes: Buffer;
  mime: string;
  name?: string;
}): Promise<{ avatarId: string; supportedEngines: string[] }> {
  const assetId = await uploadAssetV3({ bytes: opts.bytes, mime: opts.mime });
  return createPhotoAvatarV3({ assetId, name: opts.name });
}
