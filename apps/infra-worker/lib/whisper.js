// ═══════════════════════════════════════════════════════════════════
// lib/whisper.js — транскрибация MP4/аудио через OpenAI Whisper API
// ───────────────────────────────────────────────────────────────────
// Шлём файл в /v1/audio/transcriptions, model=whisper-1, response_format=json.
// Цена ~$0.006/мин — мизер по сравнению с HeyGen/Submagic, ради него
// нет смысла держать локальный whisper.cpp.
//
// Лимит файла у OpenAI — 25 МБ. Один Reels вписывается, но если на
// вход прилетит длинный TikTok — handler должен сначала прогнать
// через ffmpeg (audio-only @ 16 kHz моно ogg) и только потом сюда.
// Эта проверка пока не реализована — TODO когда увидим первый
// «file too large».
// ═══════════════════════════════════════════════════════════════════

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-1';

export function isWhisperConfigured() {
  return Boolean(OPENAI_KEY);
}

/**
 * Транскрибировать локальный файл.
 * @param {string} filePath
 * @param {object} [opts] language?: 'ru'|'en'|… (опционально, Whisper и так определит)
 * @returns {Promise<{ok:true, text:string, language:string, duration?:number} | {ok:false, error:string}>}
 */
export async function transcribeFile(filePath, opts = {}) {
  if (!OPENAI_KEY) return { ok: false, error: 'OPENAI_API_KEY missing' };
  if (!filePath) return { ok: false, error: 'filePath required' };

  let buf;
  try {
    const s = await stat(filePath);
    if (s.size > 25 * 1024 * 1024) {
      return { ok: false, error: `file too large for whisper (${s.size} bytes, max 25MB) — preprocess to audio first` };
    }
    buf = await readFile(filePath);
  } catch (e) {
    return { ok: false, error: `read ${filePath}: ${e.message}` };
  }

  const form = new FormData();
  form.append('file', new Blob([buf]), path.basename(filePath));
  form.append('model', WHISPER_MODEL);
  form.append('response_format', 'verbose_json');
  if (opts.language) form.append('language', opts.language);

  let res;
  try {
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: form,
    });
  } catch (e) {
    return { ok: false, error: `whisper fetch: ${e.message}` };
  }

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `whisper ${res.status}: ${body.slice(0, 400)}` };
  }

  const json = await res.json();
  return {
    ok: true,
    text: String(json.text || '').trim(),
    language: json.language || opts.language || 'unknown',
    duration: typeof json.duration === 'number' ? json.duration : undefined,
  };
}
