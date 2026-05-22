// ═══════════════════════════════════════════════════════════════════
// lib/ytdlp.js — обёртка над yt-dlp для скачивания рилсов/тиктоков
// ───────────────────────────────────────────────────────────────────
// Требует, чтобы в worker-контейнере были установлены `yt-dlp` и
// `ffmpeg` (см. Dockerfile). Возвращает локальный путь к MP4 и
// JSON-метаданные (длительность, заголовок, плейкоунт, дата).
//
// Каждое скачивание идёт в свою временную директорию под /tmp/viral/
// (имя — id пайплайна), чтобы конкурентные прогоны не топтали друг
// другу файлы. Чистить /tmp на стадии deliver/failed — задача
// handler'а, а не библиотеки.
// ═══════════════════════════════════════════════════════════════════

import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';
const WORK_ROOT = process.env.VIRAL_WORK_ROOT || '/tmp/viral';
const DOWNLOAD_TIMEOUT_MS = parseInt(process.env.YTDLP_TIMEOUT_MS || '120000', 10);

/**
 * Скачать видео по URL.
 * @param {string} url
 * @param {string} pipelineId — используется как имя поддиректории
 * @returns {Promise<{ok:true, path:string, info:object} | {ok:false, error:string}>}
 */
export async function downloadVideo(url, pipelineId) {
  if (!url) return { ok: false, error: 'url required' };
  if (!pipelineId) return { ok: false, error: 'pipelineId required' };

  const dir = path.join(WORK_ROOT, pipelineId);
  await mkdir(dir, { recursive: true });

  const outTpl = path.join(dir, 'source.%(ext)s');
  const infoJson = path.join(dir, 'source.info.json');

  // -f bv*+ba/b: лучший видеопоток + лучший аудио, или fallback на best
  // --write-info-json: рядом ляжет .info.json с метой (duration, view_count, …)
  // --no-playlist: не качать всю ленту, если url оказался листингом
  // --no-warnings, --quiet: меньше шума в логи
  const args = [
    '-f', 'bv*+ba/b',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--no-warnings',
    '--write-info-json',
    '-o', outTpl,
    url,
  ];

  const run = await execWithTimeout(YTDLP_BIN, args, DOWNLOAD_TIMEOUT_MS);
  if (!run.ok) return run;

  // Найти получившийся .mp4 (yt-dlp иногда отдаёт .mkv если merge не удался)
  let videoFile = null;
  try {
    const entries = await readdir(dir);
    videoFile =
      entries.find((f) => f.startsWith('source.') && f.endsWith('.mp4')) ||
      entries.find((f) => f.startsWith('source.') && /\.(mkv|webm|mov)$/i.test(f));
  } catch (_) { /* ignore */ }

  if (!videoFile) {
    return { ok: false, error: `yt-dlp finished but no video file in ${dir}` };
  }

  let info = {};
  try {
    const raw = await readFile(infoJson, 'utf8');
    const parsed = JSON.parse(raw);
    // Урезаем — нам не нужен весь дамп, только сигнал.
    info = {
      id: parsed.id,
      title: parsed.title,
      uploader: parsed.uploader || parsed.channel,
      duration: parsed.duration,
      view_count: parsed.view_count,
      like_count: parsed.like_count,
      comment_count: parsed.comment_count,
      upload_date: parsed.upload_date, // YYYYMMDD
      description: (parsed.description || '').slice(0, 1000),
      webpage_url: parsed.webpage_url || url,
      ext: parsed.ext,
    };
  } catch (_) { /* info.json опционален */ }

  return {
    ok: true,
    path: path.join(dir, videoFile),
    info,
  };
}

/**
 * Скачать видео по прямому CDN URL (без yt-dlp).
 * Используется когда источник за login-wall'ом (Instagram), а мы уже
 * добыли direct videoUrl через Apify.
 *
 * @param {string} videoUrl — прямая https://...mp4 ссылка
 * @param {string} pipelineId — для каталога /tmp/viral/<id>/source.mp4
 * @returns {Promise<{ok:true, path:string, info:object} | {ok:false, error:string}>}
 */
export async function downloadDirect(videoUrl, pipelineId) {
  if (!videoUrl) return { ok: false, error: 'videoUrl required' };
  if (!pipelineId) return { ok: false, error: 'pipelineId required' };

  const dir = path.join(WORK_ROOT, pipelineId);
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, 'source.mp4');

  let res;
  try {
    res = await fetch(videoUrl, {
      headers: {
        // graph-CDN иногда обижается на default node user-agent
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, error: `direct fetch: ${e.message}` };
  }
  if (!res.ok || !res.body) {
    return { ok: false, error: `direct download HTTP ${res.status}` };
  }
  try {
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  } catch (e) {
    return { ok: false, error: `direct pipe: ${e.message}` };
  }

  let size = 0;
  try { size = (await stat(dest)).size; } catch (_) { /* */ }
  if (size === 0) return { ok: false, error: 'direct downloaded 0 bytes' };

  return {
    ok: true,
    path: dest,
    info: { ext: 'mp4', size_bytes: size, source: 'apify-direct' },
  };
}

/**
 * Запустить процесс с таймаутом. Возвращает { ok, stdout, stderr }
 * или { ok:false, error }.
 */
function execWithTimeout(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    let child;
    let timer;
    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };

    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return settle({ ok: false, error: `spawn ${cmd}: ${e.message}` });
    }

    timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) { /* */ }
      settle({ ok: false, error: `${cmd} timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (e) => settle({ ok: false, error: `${cmd} error: ${e.message}` }));
    child.on('close', (code) => {
      if (code === 0) {
        settle({ ok: true, stdout, stderr });
      } else {
        settle({
          ok: false,
          error: `${cmd} exit ${code}: ${(stderr || stdout).slice(-500)}`,
        });
      }
    });
  });
}
