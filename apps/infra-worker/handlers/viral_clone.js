// ═══════════════════════════════════════════════════════════════════
// handlers/viral_clone.js — конвейер «залетевший рилс → клон под клиента»
// ───────────────────────────────────────────────────────────────────
// Один handler, внутри state-machine. Каждый тик:
//   1. Загружает viral_pipelines по pipeline_id из payload.
//   2. Диспатчит на текущую stage.
//   3. Делает один шаг, обновляет stage, сохраняет в БД.
//   4. Если впереди ещё работа — вставляет новый scheduled_jobs.
//   5. На любую ошибку — пишет в last_error и (если ретраить нет смысла)
//      ставит stage='failed', шлёт юзеру понятное сообщение в TG.
//
// Контракт с worker.js: всегда возвращаем {ok:true}. Свою retry-логику
// мы не отдаём worker'у, потому что один pipeline может требовать
// десятков тиков (поллинг HeyGen/Submagic), а у worker'а MAX_ATTEMPTS=3.
//
// Запуск: webhook (/clone <url|@handle>) → INSERT viral_pipelines →
// INSERT scheduled_jobs (kind='viral_clone', payload={pipeline_id}).
// ═══════════════════════════════════════════════════════════════════

import path from 'node:path';
import { readFile, stat, rm } from 'node:fs/promises';

import { query, queryOne } from '../lib/db.js';
import { chat } from '../lib/anthropic.js';
import { sendText, sendDocument } from '../lib/tg.js';
import { findTopViralReel, getInstagramDirect, isApifyConfigured } from '../lib/apify.js';
import { downloadVideo, downloadDirect } from '../lib/ytdlp.js';
import { transcribeFile, isWhisperConfigured } from '../lib/whisper.js';
import * as heygen from '../lib/heygen.js';
import * as submagic from '../lib/submagic.js';

const POLL_INTERVAL_SEC = parseInt(process.env.VIRAL_POLL_INTERVAL_SEC || '30', 10);
const MAX_POLL_ATTEMPTS = parseInt(process.env.VIRAL_MAX_POLL_ATTEMPTS || '40', 10); // 40 × 30s = 20 min
const NEXT_TICK_FAST_SEC = 5; // между быстрыми шагами (download/transcribe/...)

// Бюджет времени на каждую стадию (сек). Если pipeline сидит в стадии
// дольше — failPipeline на следующем тике. stage_started_at автообновляется
// триггером trg_viral_pipelines_stage_started (migration 020).
//
// Сумма budgets ≈ верхняя граница времени всего pipeline'а (~90 мин).
const STAGE_BUDGET_SEC = {
  init:                300,   // Apify discovery
  researched:          600,   // yt-dlp / Apify direct download (long vids)
  downloaded:          300,   // Whisper transcribe
  transcribed:         120,   // Claude rewrite
  rewritten:           180,   // HeyGen submit API call
  heygen_submitted:    1800,  // HeyGen polling (40×30s=20min + buffer)
  heygen_done:         180,   // Submagic submit API call
  submagic_submitted:  3900,  // Submagic polling (100/h rate-limit aware)
  submagic_done:       600,   // TG delivery (50MB upload может ползти)
};

export async function handle(job) {
  const pipelineId = job.payload?.pipeline_id;
  if (!pipelineId) return { ok: false, error: 'payload.pipeline_id required' };

  const pipeline = await queryOne(
    `SELECT * FROM viral_pipelines WHERE id = $1`,
    [pipelineId],
  );
  if (!pipeline) return { ok: false, error: `pipeline ${pipelineId} not found` };

  // Терминальные состояния — ничего не делаем.
  if (pipeline.stage === 'delivered' || pipeline.stage === 'failed') {
    return { ok: true, terminal: true, stage: pipeline.stage };
  }

  // Stage timeout: если сидим в стадии дольше бюджета — failed.
  // Защищает от: потерянного scheduled_job, fetch-hang в lib-хелпере
  // между тиками, любой ситуации где stage никак не двигается.
  const budget = STAGE_BUDGET_SEC[pipeline.stage];
  if (budget && pipeline.stage_started_at) {
    const ageSec = (Date.now() - new Date(pipeline.stage_started_at).getTime()) / 1000;
    if (ageSec > budget) {
      return await failPipeline(
        pipeline,
        `stage timeout: '${pipeline.stage}' held ${Math.round(ageSec / 60)}min ` +
          `(budget ${Math.round(budget / 60)}min)`,
      );
    }
  }

  console.log(`[viral_clone] pipeline=${pipelineId} stage=${pipeline.stage}`);

  try {
    switch (pipeline.stage) {
      case 'init':                 return await stepResearch(pipeline);
      case 'researched':           return await stepDownload(pipeline);
      case 'downloaded':           return await stepTranscribe(pipeline);
      case 'transcribed':          return await stepRewrite(pipeline);
      case 'rewritten':            return await stepHeygenSubmit(pipeline);
      case 'heygen_submitted':     return await stepHeygenPoll(pipeline);
      case 'heygen_done':          return await stepSubmagicSubmit(pipeline);
      case 'submagic_submitted':   return await stepSubmagicPoll(pipeline);
      case 'submagic_done':        return await stepDeliver(pipeline);
      default:
        return await failPipeline(pipeline, `unknown stage: ${pipeline.stage}`);
    }
  } catch (e) {
    console.error(`[viral_clone] crash stage=${pipeline.stage}:`, e);
    return await failPipeline(pipeline, `crash@${pipeline.stage}: ${e.message || e}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Stage 1 · research
// ═══════════════════════════════════════════════════════════════════
async function stepResearch(p) {
  // Если source_url уже задан — research проскакивает (single-shot mode).
  if (p.source_url) {
    await advance(p.id, 'researched', { last_error: null });
    return scheduleNext(p.id, NEXT_TICK_FAST_SEC);
  }

  // Иначе нужен competitor_account + Apify.
  if (!p.competitor_account) {
    return await failPipeline(p, 'no source_url and no competitor_account');
  }
  if (!isApifyConfigured()) {
    return await failPipeline(p, 'APIFY_TOKEN missing — cannot discover viral reels (pass source_url directly)');
  }

  const found = await findTopViralReel(p.competitor_account);
  if (!found.ok) {
    return await failPipeline(p, `apify: ${found.error}`);
  }

  await query(
    `UPDATE viral_pipelines
        SET source_url = $1,
            source_metadata = $2::jsonb,
            stage = 'researched',
            last_error = NULL
      WHERE id = $3`,
    [found.url, JSON.stringify(found.metadata || {}), p.id],
  );
  return scheduleNext(p.id, NEXT_TICK_FAST_SEC);
}

// ═══════════════════════════════════════════════════════════════════
// Stage 2 · download
// ═══════════════════════════════════════════════════════════════════
async function stepDownload(p) {
  if (!p.source_url) return failPipeline(p, 'stepDownload: source_url missing');

  // ── Instagram: yt-dlp без cookies упирается в login-wall.
  //    Используем Apify (он отдаёт прямой CDN URL) → fetch + stream → файл.
  //    Для остальных платформ (TikTok / YouTube Shorts / …) yt-dlp ок.
  const isInstagram = /(^|\.)instagram\.com\//i.test(p.source_url);
  let dl;
  if (isInstagram && isApifyConfigured()) {
    const direct = await getInstagramDirect(p.source_url);
    if (!direct.ok) {
      // Падать сразу на Apify-ошибке не хочется — пробуем yt-dlp как fallback
      console.warn(`[viral_clone] apify direct failed: ${direct.error} — trying yt-dlp`);
      dl = await downloadVideo(p.source_url, p.id);
      if (!dl.ok) return failPipeline(p, `apify: ${direct.error} · ytdlp: ${dl.error}`);
    } else {
      dl = await downloadDirect(direct.videoUrl, p.id);
      if (!dl.ok) return failPipeline(p, `apify direct dl: ${dl.error}`);
      // Подмешиваем мету из Apify (play_count и т.п. для caption финального TG)
      Object.assign(dl.info, direct.metadata || {});
    }
  } else {
    dl = await downloadVideo(p.source_url, p.id);
    if (!dl.ok) return failPipeline(p, `ytdlp: ${dl.error}`);
  }

  // Мёрджим info с тем, что уже есть в source_metadata (от Apify discovery, если был).
  const mergedMeta = { ...(p.source_metadata || {}), ...(dl.info || {}) };

  await query(
    `UPDATE viral_pipelines
        SET source_local_path = $1,
            source_duration_sec = $2,
            source_metadata = $3::jsonb,
            stage = 'downloaded',
            last_error = NULL
      WHERE id = $4`,
    [dl.path, dl.info?.duration ? Math.round(dl.info.duration) : null, JSON.stringify(mergedMeta), p.id],
  );
  return scheduleNext(p.id, NEXT_TICK_FAST_SEC);
}

// ═══════════════════════════════════════════════════════════════════
// Stage 3 · transcribe
// ═══════════════════════════════════════════════════════════════════
async function stepTranscribe(p) {
  if (!isWhisperConfigured()) return failPipeline(p, 'OPENAI_API_KEY missing for Whisper');
  if (!p.source_local_path) return failPipeline(p, 'stepTranscribe: source_local_path missing');

  const tr = await transcribeFile(p.source_local_path);
  if (!tr.ok) return failPipeline(p, `whisper: ${tr.error}`);
  if (!tr.text) return failPipeline(p, 'whisper: empty transcript');

  await query(
    `UPDATE viral_pipelines
        SET transcript = $1,
            transcript_language = $2,
            stage = 'transcribed',
            last_error = NULL
      WHERE id = $3`,
    [tr.text, tr.language?.slice(0, 8) || null, p.id],
  );
  return scheduleNext(p.id, NEXT_TICK_FAST_SEC);
}

// ═══════════════════════════════════════════════════════════════════
// Stage 4 · rewrite (Claude адаптирует под голос/нишу клиента)
// ═══════════════════════════════════════════════════════════════════
async function stepRewrite(p) {
  if (!p.transcript) return failPipeline(p, 'stepRewrite: transcript missing');

  // Имя клиента — из platform_users если есть user_id; контекст пока берём
  // из agent_memory.facts (рулится daily_briefing/welcome handler'ами).
  let userCtx = '';
  let userName = 'эксперт';
  if (p.user_id) {
    const u = await queryOne(
      `SELECT name FROM platform_users WHERE id = $1`,
      [p.user_id],
    );
    if (u?.name) userName = u.name;

    const mem = await queryOne(
      `SELECT summary, facts FROM agent_memory
        WHERE user_id = $1 AND agent_id = 'marketing-content-creator'
        ORDER BY last_seen DESC LIMIT 1`,
      [p.user_id],
    );
    if (mem) {
      const factsStr = mem.facts && typeof mem.facts === 'object'
        ? Object.entries(mem.facts).map(([k, v]) => `${k}: ${v}`).join('; ')
        : '';
      userCtx = [mem.summary, factsStr].filter(Boolean).join(' · ').slice(0, 800);
    }
  }

  const system = `Ты — контент-копирайтер. Тебе показывают расшифровку «залетевшего» рилса конкурента. Твоя задача — переписать сценарий так, чтобы он звучал из уст конкретного эксперта (см. ниже), сохранив структуру/крючок/динамику оригинала, но без плагиата и без упоминания исходного автора.

Эксперт: ${userName}.
Контекст эксперта: ${userCtx || 'эксперт в своей нише, продаёт через соцсети'}.

Требования:
- На русском, от первого лица.
- 45–60 секунд чтения вслух (≈ 110–140 слов).
- Сохрани силу первой фразы (hook) и структуру (проблема → инсайт → действие).
- Замени любые отсылки к чужим продуктам/именам на нейтральные формулировки.
- Никакого markdown, без преамбулы и без подписи. Только сам сценарий — чистый текст, который сразу пойдёт в озвучку.`;

  const userMsg = `Расшифровка оригинального рилса:\n\n${p.transcript.slice(0, 3000)}\n\nДай переписанный сценарий.`;

  const result = await chat({
    system,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 500,
  });
  if (!result.ok) {
    return failPipeline(p, `claude rewrite: ${result.status} ${String(result.details).slice(0, 200)}`);
  }
  const script = result.text.trim().slice(0, 1500);
  if (script.length < 40) {
    return failPipeline(p, `claude rewrite: too short (${script.length} chars)`);
  }

  await query(
    `UPDATE viral_pipelines
        SET rewritten_script = $1,
            stage = 'rewritten',
            last_error = NULL
      WHERE id = $2`,
    [script, p.id],
  );
  return scheduleNext(p.id, NEXT_TICK_FAST_SEC);
}

// ═══════════════════════════════════════════════════════════════════
// Stage 5 · HeyGen submit
// ═══════════════════════════════════════════════════════════════════
async function stepHeygenSubmit(p) {
  if (!heygen.isHeygenConfigured()) return failPipeline(p, 'HEYGEN_API_KEY missing');
  if (!p.rewritten_script) return failPipeline(p, 'stepHeygenSubmit: rewritten_script missing');
  // Avatar V работает только по talking_photo юзера. Без фото — стопаем
  // пайплайн с понятным сообщением: пусть юзер сначала зарегистрирует фото.
  if (!p.heygen_talking_photo_id) {
    return failPipeline(p,
      'нет фото юзера: Avatar V работает только по talking_photo. ' +
      'Пришли фото боту, потом запусти /clone заново.');
  }

  // Pre-check API quota — HeyGen /v2/video/generate accepts the submit and
  // ONLY rejects with "Insufficient credit" minutes later in polling. That
  // burns 30 min of pipeline time and ack'ed user expectations. Estimate
  // required credits from script length (rough ≈ 1 credit per second, and
  // ~3 words/sec ≈ 18 chars/sec at 150 wpm Russian).
  const estSeconds = Math.max(15, Math.ceil((p.rewritten_script || '').length / 18));
  const q = await heygen.getRemainingQuota();
  if (q.ok && typeof q.apiQuota === 'number' && q.apiQuota < estSeconds) {
    await notifyAdminBilling(
      'HeyGen',
      `api quota = <b>${q.apiQuota}</b>, нужно ≥${estSeconds} на этот скрипт. ` +
        `Pipeline <code>${p.id}</code> остановлен до пополнения. ` +
        `Top up: https://app.heygen.com/settings/subscriptions`,
    );
    return failPipeline(
      p,
      `HeyGen quota = ${q.apiQuota} < ${estSeconds} required (billing). ` +
        `Top up at app.heygen.com/settings/subscriptions, потом /clone заново.`,
    );
  }

  const r = await heygen.submitVideo({
    script: p.rewritten_script,
    talkingPhotoId: p.heygen_talking_photo_id, // фото юзера из /clone (clone_user_photos)
    voiceId: p.heygen_voice_id,
    aspect: 'portrait',              // рилсы 9:16
  });
  if (!r.ok) return failPipeline(p, `heygen submit: ${r.error}`);

  await query(
    `UPDATE viral_pipelines
        SET heygen_video_id = $1,
            heygen_poll_attempts = 0,
            stage = 'heygen_submitted',
            last_error = NULL
      WHERE id = $2`,
    [r.videoId, p.id],
  );
  return scheduleNext(p.id, POLL_INTERVAL_SEC);
}

// ═══════════════════════════════════════════════════════════════════
// Stage 6 · HeyGen poll
// ═══════════════════════════════════════════════════════════════════
async function stepHeygenPoll(p) {
  if (!p.heygen_video_id) return failPipeline(p, 'stepHeygenPoll: heygen_video_id missing');

  const s = await heygen.pollStatus(p.heygen_video_id);
  if (!s.ok) {
    // Сетевая ошибка — увеличим счётчик и продолжим поллить.
    return bumpPollAndReschedule(p, 'heygen', `heygen poll fetch: ${s.error}`);
  }

  if (s.status === 'completed') {
    if (!s.videoUrl) return failPipeline(p, 'heygen completed but no video_url');
    const destPath = path.join(`/tmp/viral/${p.id}`, 'heygen.mp4');
    const dl = await heygen.downloadTo(s.videoUrl, destPath);
    if (!dl.ok) return failPipeline(p, `heygen download: ${dl.error}`);

    await query(
      `UPDATE viral_pipelines
          SET heygen_video_url = $1,
              heygen_local_path = $2,
              stage = 'heygen_done',
              last_error = NULL
        WHERE id = $3`,
      [s.videoUrl, destPath, p.id],
    );
    return scheduleNext(p.id, NEXT_TICK_FAST_SEC);
  }

  if (s.status === 'failed') {
    const msg = s.errorMessage || 'no detail';
    if (/insufficient.*credit|insufficient_credit/i.test(msg)) {
      await notifyAdminBilling(
        'HeyGen',
        `pipeline <code>${p.id}</code> упал на poll: <code>${escapeHtml(msg)}</code>. ` +
          `Top up: https://app.heygen.com/settings/subscriptions`,
      );
      return failPipeline(
        p,
        `HeyGen billing: ${msg}. Пополни баланс на app.heygen.com и /clone заново.`,
      );
    }
    return failPipeline(p, `heygen failed: ${msg}`);
  }

  // pending / waiting / processing — продолжаем поллить
  return bumpPollAndReschedule(p, 'heygen', null);
}

// ═══════════════════════════════════════════════════════════════════
// Stage 7 · Submagic submit
// ═══════════════════════════════════════════════════════════════════
async function stepSubmagicSubmit(p) {
  if (!p.heygen_video_url) return failPipeline(p, 'stepSubmagicSubmit: heygen_video_url missing');

  // Если Submagic не сконфигурен — проскакиваем шаг, отдаём heygen напрямую.
  if (!submagic.isSubmagicConfigured()) {
    console.log(`[viral_clone] submagic not configured — skipping captioner, delivering heygen as-is`);
    await query(
      `UPDATE viral_pipelines
          SET submagic_local_path = $1,
              stage = 'submagic_done',
              last_error = COALESCE(last_error, '') || ' [submagic skipped: no key]'
        WHERE id = $2`,
      [p.heygen_local_path, p.id],
    );
    return scheduleNext(p.id, NEXT_TICK_FAST_SEC);
  }

  const r = await submagic.submitProject({
    videoUrl: p.heygen_video_url,
    template: p.submagic_template,
    title: `viral-clone-${p.id.slice(0, 8)}`,
    language: p.transcript_language,
  });
  if (!r.ok) {
    // 402 / "Insufficient API credits" → skip captioner, deliver raw HeyGen.
    // Same fallback as when Submagic isn't configured at all. The video
    // still ships; user just gets it without subtitles/B-rolls.
    if (submagic.isInsufficientCreditsError(r.error)) {
      await notifyAdminBilling(
        'Submagic',
        `pipeline <code>${p.id}</code> — Submagic out of credits, отдаю HeyGen raw без субтитров. ` +
          `Top up: https://app.submagic.co/billing`,
      );
      console.warn(`[viral_clone] submagic out of credit — fallback to raw heygen for ${p.id}`);
      await query(
        `UPDATE viral_pipelines
            SET submagic_local_path = $1,
                stage = 'submagic_done',
                last_error = COALESCE(last_error, '') || ' [submagic skipped: out of credits]'
          WHERE id = $2`,
        [p.heygen_local_path, p.id],
      );
      return scheduleNext(p.id, NEXT_TICK_FAST_SEC);
    }
    return failPipeline(p, `submagic submit: ${r.error}`);
  }

  await query(
    `UPDATE viral_pipelines
        SET submagic_project_id = $1,
            submagic_poll_attempts = 0,
            stage = 'submagic_submitted',
            last_error = NULL
      WHERE id = $2`,
    [r.projectId, p.id],
  );
  return scheduleNext(p.id, POLL_INTERVAL_SEC);
}

// ═══════════════════════════════════════════════════════════════════
// Stage 8 · Submagic poll
// ═══════════════════════════════════════════════════════════════════
async function stepSubmagicPoll(p) {
  if (!p.submagic_project_id) return failPipeline(p, 'stepSubmagicPoll: submagic_project_id missing');

  const s = await submagic.pollStatus(p.submagic_project_id, { bypassedFrom: p.heygen_video_url });
  if (!s.ok) {
    // Same out-of-credits race during polling — fall back to raw HeyGen.
    if (submagic.isInsufficientCreditsError(s.error)) {
      await notifyAdminBilling(
        'Submagic',
        `pipeline <code>${p.id}</code> — Submagic out of credits на poll, отдаю HeyGen raw.`,
      );
      console.warn(`[viral_clone] submagic out of credit on poll — fallback to raw heygen for ${p.id}`);
      await query(
        `UPDATE viral_pipelines
            SET submagic_local_path = $1,
                stage = 'submagic_done',
                last_error = COALESCE(last_error, '') || ' [submagic skipped on poll: out of credits]'
          WHERE id = $2`,
        [p.heygen_local_path, p.id],
      );
      return scheduleNext(p.id, NEXT_TICK_FAST_SEC);
    }
    return bumpPollAndReschedule(p, 'submagic', `submagic poll fetch: ${s.error}`);
  }

  if (s.status === 'completed') {
    // В bypass-режиме videoUrl=heygen_video_url; качаем заново или копируем.
    let localPath;
    if (s.videoUrl && s.videoUrl !== p.heygen_video_url) {
      localPath = path.join(`/tmp/viral/${p.id}`, 'submagic.mp4');
      const dl = await submagic.downloadTo(s.videoUrl, localPath);
      if (!dl.ok) return failPipeline(p, `submagic download: ${dl.error}`);
    } else {
      // Bypass: переиспользуем уже скачанный heygen mp4.
      localPath = p.heygen_local_path;
    }

    await query(
      `UPDATE viral_pipelines
          SET submagic_video_url = $1,
              submagic_local_path = $2,
              stage = 'submagic_done',
              last_error = NULL
        WHERE id = $3`,
      [s.videoUrl || null, localPath, p.id],
    );
    return scheduleNext(p.id, NEXT_TICK_FAST_SEC);
  }

  if (s.status === 'failed') {
    return failPipeline(p, `submagic failed: ${s.errorMessage || 'no detail'}`);
  }

  return bumpPollAndReschedule(p, 'submagic', null);
}

// ═══════════════════════════════════════════════════════════════════
// Stage 9 · deliver to Telegram
// ═══════════════════════════════════════════════════════════════════
async function stepDeliver(p) {
  const finalPath = p.submagic_local_path || p.heygen_local_path;
  if (!finalPath) return failPipeline(p, 'stepDeliver: no final file path');

  // Проверка размера (TG bot multipart upload limit = 50 MB).
  // Submagic с magicBrolls на 1080p часто отдаёт 50-90 MB → fallback на ссылку.
  let buf;
  let oversized = false;
  let sizeBytes = 0;
  try {
    const s = await stat(finalPath);
    sizeBytes = s.size;
    if (s.size > 50 * 1024 * 1024) {
      oversized = true;
    } else {
      buf = await readFile(finalPath);
    }
  } catch (e) {
    return failPipeline(p, `deliver read: ${e.message}`);
  }

  const meta = p.source_metadata || {};
  const sourceCaption = meta.uploader || meta.owner
    ? `@${meta.uploader || meta.owner}`
    : (p.source_url || 'источник');
  const plays = meta.play_count || meta.view_count;
  const captionLines = [
    `🎬 <b>Клон рилса</b> от ${escapeHtml(sourceCaption)}`,
    plays ? `Оригинал собрал ~${formatCount(plays)} просмотров` : null,
    p.source_url ? `Источник: ${escapeHtml(p.source_url)}` : null,
  ].filter(Boolean);
  const caption = captionLines.join('\n');

  // Создаём deliverable до отправки (для WFDS-метрики).
  let deliverableId = null;
  if (p.user_id) {
    const d = await queryOne(
      `INSERT INTO deliverables
         (user_id, agent_id, agent_name, kind, title, body, metadata)
       VALUES ($1, 'marketing-content-creator', 'Аня', 'viral_clone',
               $2, $3, $4::jsonb)
       RETURNING id`,
      [
        p.user_id,
        `Клон рилса · ${sourceCaption}`,
        p.rewritten_script || '',
        JSON.stringify({
          pipeline_id: p.id,
          source_url: p.source_url,
          heygen_video_url: p.heygen_video_url,
          submagic_video_url: p.submagic_video_url,
          source_metadata: meta,
        }),
      ],
    );
    deliverableId = d?.id || null;
  }

  const replyMarkup = deliverableId ? {
    inline_keyboard: [[
      { text: '✅ Использовал', callback_data: `d:used:${deliverableId}` },
      { text: '❌ Не пригодилось', callback_data: `d:nope:${deliverableId}` },
    ]],
  } : undefined;

  let tgMessageId = null;
  if (oversized) {
    // Ссылка вместо файла — submagic.directUrl короче downloadUrl и r2-edge.
    const directLink = p.submagic_video_url || p.heygen_video_url || '';
    const oversizedCaption =
      `${caption}\n\n` +
      `<i>Файл ${(sizeBytes / 1024 / 1024).toFixed(1)} МБ — больше лимита TG-бота (50 МБ).</i>\n` +
      `🔗 <a href="${escapeHtml(directLink)}">скачать mp4</a>`;
    const send = await sendText(p.tg_chat_id, oversizedCaption, {
      bot: 'transcribe',
      reply_markup: replyMarkup,
      disable_web_page_preview: false,
    });
    if (!send.ok) {
      return failPipeline(p, `tg oversized sendText: ${send.status || ''} ${String(send.error).slice(0, 200)}`);
    }
    tgMessageId = send.result?.message_id || null;
  } else {
    const send = await sendDocument(p.tg_chat_id, buf, {
      filename: `viral-clone-${p.id.slice(0, 8)}.mp4`,
      caption,
      mimeType: 'video/mp4',
      replyMarkup,
      bot: 'transcribe',  // выдача рилсов идёт в @your_transscribe_bot
    });
    if (!send.ok) {
      return failPipeline(p, `tg sendDocument: ${send.status || ''} ${String(send.error).slice(0, 200)}`);
    }
    tgMessageId = send.result?.message_id || null;
  }

  await markDelivered(p, tgMessageId, finalPath, deliverableId);

  // Подчистим временные файлы (источник + heygen + submagic).
  cleanupPipelineDir(p.id).catch(() => { /* swallow */ });

  return { ok: true, terminal: true, delivered: true };
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

async function advance(pipelineId, newStage, extra = {}) {
  const sets = ['stage = $1'];
  const params = [newStage];
  let idx = 2;
  for (const [k, v] of Object.entries(extra)) {
    sets.push(`${k} = $${idx}`);
    params.push(v);
    idx++;
  }
  params.push(pipelineId);
  await query(
    `UPDATE viral_pipelines SET ${sets.join(', ')} WHERE id = $${idx}`,
    params,
  );
}

async function scheduleNext(pipelineId, delaySec) {
  await query(
    `INSERT INTO scheduled_jobs (kind, scheduled_at, status, payload)
     VALUES ('viral_clone', NOW() + ($1 || ' seconds')::interval, 'pending', $2::jsonb)`,
    [String(delaySec), JSON.stringify({ pipeline_id: pipelineId })],
  );
  return { ok: true, scheduled_next_in_sec: delaySec };
}

async function bumpPollAndReschedule(p, which /* 'heygen'|'submagic' */, errMsg) {
  const col = which === 'heygen' ? 'heygen_poll_attempts' : 'submagic_poll_attempts';
  const attempts = (p[col] || 0) + 1;
  if (attempts >= MAX_POLL_ATTEMPTS) {
    return failPipeline(p, `${which} poll timeout after ${attempts} attempts${errMsg ? ': ' + errMsg : ''}`);
  }
  await query(
    `UPDATE viral_pipelines SET ${col} = $1, last_error = $2 WHERE id = $3`,
    [attempts, errMsg, p.id],
  );
  return scheduleNext(p.id, POLL_INTERVAL_SEC);
}

async function failPipeline(p, reason) {
  console.warn(`[viral_clone] FAIL pipeline=${p.id} stage=${p.stage}: ${reason}`);
  await query(
    `UPDATE viral_pipelines
        SET stage = 'failed',
            last_error = $1,
            completed_at = NOW()
      WHERE id = $2`,
    [String(reason).slice(0, 1000), p.id],
  );
  // Уведомим юзера, что упало (без подробностей траблшутинга — короткий месседж).
  // ВАЖНО: вся выдача viral_clone'а идёт в @your_transscribe_bot, включая
  // ошибки — иначе юзер получает success в одном боте и fail в другом.
  if (p.tg_chat_id) {
    await sendText(p.tg_chat_id,
      `⚠️ Конвейер клонирования споткнулся на шаге <i>${escapeHtml(p.stage)}</i>.\n` +
      `Причина: <code>${escapeHtml(String(reason).slice(0, 200))}</code>`,
      { bot: 'transcribe' }).catch(() => {});
  }
  cleanupPipelineDir(p.id).catch(() => {});
  return { ok: true, terminal: true, failed: true };
}

async function markDelivered(p, tgMessageId, finalPath, deliverableId) {
  await query(
    `UPDATE viral_pipelines
        SET stage = 'delivered',
            tg_document_message_id = $1,
            deliverable_id = $2,
            submagic_local_path = COALESCE(submagic_local_path, $3),
            completed_at = NOW()
      WHERE id = $4`,
    [tgMessageId, deliverableId, finalPath, p.id],
  );
}

async function cleanupPipelineDir(pipelineId) {
  await rm(`/tmp/viral/${pipelineId}`, { recursive: true, force: true });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/**
 * Owner-only billing alert for the viral_clone pipeline. Debounced so a
 * stuck queue can't flood Telegram — at most one alert per provider per
 * `BILLING_ALERT_COOLDOWN_SEC` (default 1 hour). Falls back to log if no
 * owner chat configured, never throws.
 */
const BILLING_ALERT_COOLDOWN_SEC = parseInt(process.env.BILLING_ALERT_COOLDOWN_SEC || '3600', 10);
const lastBillingAlertAt = new Map(); // provider → ms
async function notifyAdminBilling(provider, html) {
  const chatId =
    process.env.OWNER_TELEGRAM_ID || process.env.ILYA_TG_CHAT_ID || process.env.OWNER_CHAT_ID || null;
  if (!chatId) {
    console.warn(`[viral_clone] billing alert (${provider}) skipped — no OWNER_TELEGRAM_ID env`);
    return;
  }
  const now = Date.now();
  const last = lastBillingAlertAt.get(provider) || 0;
  if (now - last < BILLING_ALERT_COOLDOWN_SEC * 1000) return;
  lastBillingAlertAt.set(provider, now);
  await sendText(
    Number(chatId),
    `💳 <b>${provider} billing</b>\n\n${html}`,
    { bot: 'transcribe', parse_mode: 'HTML' },
  ).catch((e) => console.error('[viral_clone] notifyAdminBilling failed:', e?.message || e));
}

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
