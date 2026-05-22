// ═══════════════════════════════════════════════════════════════════
// lib/submagic.js — обёртка над Submagic API (auto-captions + B-roll)
// ───────────────────────────────────────────────────────────────────
// docs.submagic.co/llms.txt:
//   POST /v1/projects   — { title, language, videoUrl, templateName }
//     headers: x-api-key: sk-…
//     201    → { id, status: "uploading", … }
//   GET  /v1/projects/{id}
//     → { status: 'uploading'|'transcribing'|'processing'|'exporting'|'completed'|'failed',
//         downloadUrl?, directUrl?, previewUrl?, failureReason? … }
//   rate-limit: ~100 reqs/h.
//
// language — ISO-2 ('ru','en',…). Whisper отдаёт полное имя
// ("russian", "english"), мап в LANG_MAP ниже. Если нет — 'en'.
//
// SUBMAGIC_BYPASS=1 — режим отладки: проект не создаётся, status
// сразу 'completed' с videoUrl = bypassedFrom (HeyGen mp4). Без
// внешнего вызова, полезно когда ключ невалиден или для smoke без
// списания кредитов.
// ═══════════════════════════════════════════════════════════════════

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const KEY = process.env.SUBMAGIC_API_KEY || '';
const BASE = process.env.SUBMAGIC_API_BASE || 'https://api.submagic.co';
const CREATE_PATH = process.env.SUBMAGIC_CREATE_PATH || '/v1/projects';
const STATUS_PATH_TEMPLATE = process.env.SUBMAGIC_STATUS_PATH_TEMPLATE || '/v1/projects/{id}';
// "Hormozi 2" точно подтверждён в публичных доках Submagic. Дефолтный
// у них "Sara", но он мягче. Hormozi даёт жирные субтитры — лучше для
// viral-контента.
const DEFAULT_TEMPLATE = process.env.SUBMAGIC_DEFAULT_TEMPLATE || 'Hormozi 2';
// Magic B-rolls/Zooms — по умолчанию у Submagic выключены. Включаем по
// дефолту, потому что весь смысл «монтажа от Submagic» — это они.
const DEFAULT_MAGIC_BROLLS = process.env.SUBMAGIC_MAGIC_BROLLS !== '0';
const DEFAULT_MAGIC_ZOOMS = process.env.SUBMAGIC_MAGIC_ZOOMS !== '0';
const DEFAULT_MAGIC_BROLLS_PCT = parseInt(process.env.SUBMAGIC_MAGIC_BROLLS_PCT || '50', 10);
const BYPASS = process.env.SUBMAGIC_BYPASS === '1';

// Whisper отдаёт полное название языка; Submagic хочет ISO-2.
const LANG_MAP = {
  russian: 'ru', english: 'en', spanish: 'es', french: 'fr',
  german: 'de', italian: 'it', portuguese: 'pt', polish: 'pl',
  arabic: 'ar', chinese: 'zh', japanese: 'ja', korean: 'ko',
  ukrainian: 'uk', dutch: 'nl', turkish: 'tr',
};
function toIsoLang(input) {
  if (!input) return 'en';
  const v = String(input).toLowerCase().trim();
  if (v.length === 2) return v;
  return LANG_MAP[v] || 'en';
}

export function isSubmagicConfigured() {
  return BYPASS || Boolean(KEY);
}

/**
 * BYPASS mode (env SUBMAGIC_BYPASS=1) — отдаём входной url как готовый.
 * Полезно для интеграционного тестирования всей связки без оплаты Submagic.
 */
export function isBypass() {
  return BYPASS;
}

/**
 * Создать проект: даём готовый url видеоисточника (HeyGen mp4),
 * получаем id обработки.
 * @param {object} p
 * @param {string} p.videoUrl
 * @param {string} [p.template]
 * @param {string} [p.title]
 * @param {string} [p.language] — Whisper-имя или ISO-2 (мапим)
 */
export async function submitProject(p) {
  if (BYPASS) {
    return { ok: true, projectId: `bypass:${Date.now()}`, bypassedFrom: p.videoUrl };
  }
  if (!KEY) return { ok: false, error: 'SUBMAGIC_API_KEY missing' };
  if (!p?.videoUrl) return { ok: false, error: 'videoUrl required' };

  const body = {
    title: p.title || 'viral-clone',
    language: toIsoLang(p.language),
    videoUrl: p.videoUrl,
    templateName: p.template || DEFAULT_TEMPLATE,
    magicBrolls: typeof p.magicBrolls === 'boolean' ? p.magicBrolls : DEFAULT_MAGIC_BROLLS,
    magicBrollsPercentage: Number.isFinite(p.magicBrollsPercentage) ? p.magicBrollsPercentage : DEFAULT_MAGIC_BROLLS_PCT,
    magicZooms: typeof p.magicZooms === 'boolean' ? p.magicZooms : DEFAULT_MAGIC_ZOOMS,
  };

  let res;
  try {
    res = await fetch(`${BASE}${CREATE_PATH}`, {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: `submagic submit fetch: ${e.message}` };
  }
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `submagic ${res.status}: ${text.slice(0, 400)}` };
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) {
    return { ok: false, error: `submagic non-json: ${text.slice(0, 300)}` };
  }
  const projectId = parsed.id;
  if (!projectId) return { ok: false, error: `submagic no id in: ${text.slice(0, 300)}` };

  return { ok: true, projectId };
}

export async function pollStatus(projectId, opts = {}) {
  if (BYPASS && String(projectId).startsWith('bypass:')) {
    // Сразу «готово» — handler возьмёт bypassedFrom url из payload.
    return { ok: true, status: 'completed', videoUrl: opts.bypassedFrom || null };
  }
  if (!KEY) return { ok: false, error: 'SUBMAGIC_API_KEY missing' };
  if (!projectId) return { ok: false, error: 'projectId required' };

  const url = `${BASE}${STATUS_PATH_TEMPLATE.replace('{id}', encodeURIComponent(projectId))}`;
  let res;
  try {
    res = await fetch(url, { headers: { 'x-api-key': KEY } });
  } catch (e) {
    return { ok: false, error: `submagic status fetch: ${e.message}` };
  }
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `submagic status ${res.status}: ${text.slice(0, 400)}` };
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) {
    return { ok: false, error: `submagic status non-json: ${text.slice(0, 300)}` };
  }

  // Нормализуем под общий контракт handler'а: status ∈ completed|failed|*=processing.
  // Submagic возвращает: uploading|transcribing|processing|exporting|completed|failed.
  // downloadUrl — direct mp4 (то, что нам нужно), directUrl — embed-only.
  const status = parsed.status || 'unknown';
  const videoUrl = parsed.downloadUrl || parsed.directUrl || null;
  const errorMessage = parsed.failureReason || null;
  return { ok: true, status, videoUrl, errorMessage, raw: parsed };
}

export async function downloadTo(url, destPath) {
  if (!url) return { ok: false, error: 'url required' };
  if (!destPath) return { ok: false, error: 'destPath required' };
  try {
    await mkdir(path.dirname(destPath), { recursive: true });
  } catch (e) {
    return { ok: false, error: `submagic download mkdir: ${e.message}` };
  }
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    return { ok: false, error: `submagic download fetch: ${e.message}` };
  }
  if (!res.ok || !res.body) return { ok: false, error: `submagic download ${res.status}` };
  try {
    await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
  } catch (e) {
    return { ok: false, error: `submagic download pipe: ${e.message}` };
  }
  return { ok: true, path: destPath };
}
