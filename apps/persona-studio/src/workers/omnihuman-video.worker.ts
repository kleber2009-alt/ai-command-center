import { Worker } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { connection, QUEUE_NAMES, type VideoJob } from '@/lib/queue';
import {
  submitOmnihuman,
  waitForOmnihuman,
  downloadVideo,
  OmnihumanError,
  type OmniAspect,
} from '@/lib/omnihuman';
import { synthesize, ElevenlabsError } from '@/lib/elevenlabs';
import { keyFor, uploadBuffer } from '@/lib/storage';
import { refundTokens } from '@/lib/tokens';
import { concatVideos, FfmpegError } from '@/lib/ffmpeg';
import { segmentScript } from '@/lib/segment';
import { env } from '@/lib/env';
import { refreshAppSettings } from '@/lib/app-settings';

function logEvent(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...data }));
}

function toOmniAspect(s: string | null | undefined): OmniAspect {
  if (s === '9:16' || s === '1:1' || s === '16:9') return s;
  return 'auto';
}

function errCode(e: unknown): string {
  if (e instanceof OmnihumanError) return e.code;
  if (e instanceof ElevenlabsError) return e.code;
  if (e instanceof FfmpegError) return `FFMPEG_${e.code}`;
  return 'UNKNOWN';
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Один клип OmniHuman: submit → poll → download → bytes. */
async function renderClip(opts: {
  imageUrl: string;
  audioUrl: string;
  aspect: OmniAspect;
  videoId: string;
}): Promise<Buffer> {
  const taskId = await submitOmnihuman({
    imageUrl: opts.imageUrl,
    audioUrl: opts.audioUrl,
    aspectRatio: opts.aspect,
  });
  // engineJobId — для наблюдаемости; при нескольких клипах хранит последний taskId.
  await prisma.videoGeneration.update({
    where: { id: opts.videoId },
    data: { engineJobId: taskId },
  });
  logEvent('omnihuman_submitted', { videoGenId: opts.videoId, taskId });
  const cdnUrl = await waitForOmnihuman({ taskId, maxMs: env.OMNIHUMAN_MAX_POLL_MS });
  const dl = await downloadVideo(cdnUrl);
  return dl.bytes;
}

export function startOmnihumanWorker() {
  const worker = new Worker<VideoJob>(
    QUEUE_NAMES.omnihumanVideo,
    async (job) => {
      await refreshAppSettings(); // admin-set provider keys (see lib/app-settings.ts)
      const { videoId, userId } = job.data;
      const startMs = Date.now();

      const row = await prisma.videoGeneration.findUnique({
        where: { id: videoId },
        include: { avatar: true },
      });
      if (!row) throw new Error('video_missing');
      if (row.userId !== userId) throw new Error('user_mismatch');
      if (row.engine !== 'omnihuman-1.5') throw new Error(`wrong_engine:${row.engine}`);
      if (!row.avatar?.imageUrl) throw new Error('avatar_no_image');
      if (!row.audioUrl && (!row.script || !row.voiceId)) {
        throw new Error('audio_or_script_required');
      }

      await prisma.videoGeneration.update({
        where: { id: videoId },
        data: { status: 'processing' },
      });

      logEvent('video_generation_started', {
        videoGenId: videoId,
        userId,
        engine: 'omnihuman-1.5',
        charsCount: row.script?.length ?? null,
        hasAudioOverride: !!row.audioUrl,
      });

      // OmniHuman (kie.ai) деградирует на аудио >15с («зажёвывает» голос),
      // поэтому длинный скрипт режется на чанки ≤ CHUNK_CHARS (≈14с речи), каждый
      // рендерится отдельным клипом, клипы склеиваются ffmpeg. Готовое аудио
      // (advanced override) сегментировать нельзя — рендерим одним клипом.
      const aspect = toOmniAspect(row.aspect);
      const avatarImage = row.avatar.imageUrl; // narrowed by the check above
      let stage: 'tts' | 'engine' = row.audioUrl ? 'engine' : 'tts';

      try {
        let finalVideo: Buffer;
        let clipCount: number;

        if (row.audioUrl) {
          // ── Override: готовое аудио → один клип ──
          stage = 'engine';
          finalVideo = await renderClip({ imageUrl: avatarImage, audioUrl: row.audioUrl, aspect, videoId });
          clipCount = 1;
        } else {
          // ── TTS из скрипта + нарезка + рендер по клипам ──
          const fullText = row.script!.slice(0, env.OMNIHUMAN_MAX_TTS_CHARS);
          const chunks = segmentScript(fullText, {
            maxChars: env.OMNIHUMAN_CHUNK_CHARS,
            maxChunks: env.OMNIHUMAN_MAX_CHUNKS,
          });
          if (chunks.length === 0) throw new Error('empty_script_after_segment');
          clipCount = chunks.length;
          logEvent('video_segmented', { videoGenId: videoId, chunks: clipCount });

          const clips: Buffer[] = [];
          for (let i = 0; i < chunks.length; i++) {
            // Stage 1 (per chunk): TTS → S3
            stage = 'tts';
            const ttsStart = Date.now();
            const tts = await synthesize({ text: chunks[i], voiceId: row.voiceId! });
            const chunkAudioUrl = await uploadBuffer({
              key: keyFor('audio', userId, 'mp3'),
              body: tts.bytes,
              contentType: tts.mime,
              cacheControl: 'public, max-age=86400',
            });
            // Первый чанк пишем в audioUrl — для превью/отладки.
            if (i === 0) {
              await prisma.videoGeneration.update({
                where: { id: videoId },
                data: { audioUrl: chunkAudioUrl },
              });
            }
            logEvent('video_tts_chunk_done', {
              videoGenId: videoId, idx: i, chars: chunks[i].length, ttsMs: Date.now() - ttsStart,
            });

            // Stage 2 (per chunk): OmniHuman → клип
            stage = 'engine';
            clips.push(await renderClip({ imageUrl: avatarImage, audioUrl: chunkAudioUrl, aspect, videoId }));
          }

          finalVideo = clipCount > 1 ? await concatVideos(clips) : clips[0];
        }

        // ── Загрузка финального видео ──
        const stableUrl = await uploadBuffer({
          key: keyFor('video', userId, 'mp4'),
          body: finalVideo,
          contentType: 'video/mp4',
          cacheControl: 'public, max-age=86400',
        });
        await prisma.videoGeneration.update({
          where: { id: videoId },
          data: { videoUrl: stableUrl, status: 'completed', completedAt: new Date() },
        });

        const totalMs = Date.now() - startMs;
        logEvent('video_generation_completed', {
          videoGenId: videoId, userId, engine: 'omnihuman-1.5',
          clips: clipCount, bytes: finalVideo.length, totalMs,
        });
        return { ok: true, clips: clipCount, bytes: finalVideo.length, totalMs };
      } catch (e) {
        const code = errCode(e);
        const msg = errMsg(e);
        const errorMsg = `OMNIHUMAN_${stage.toUpperCase()}_${code}: ${msg}`.slice(0, 500);
        // BullMQ retries the job (attempts: 3); refund and mark failed only once,
        // on the last attempt — otherwise every attempt refunds the same charge.
        const isFinal = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        if (!isFinal) {
          await prisma.videoGeneration.update({ where: { id: videoId }, data: { errorMsg } });
          throw e;
        }
        await refundTokens({
          userId,
          amount: row.tokensCost,
          reason: `omnihuman-video:${stage}-failed`,
          refId: videoId,
        });
        await prisma.videoGeneration.update({
          where: { id: videoId },
          data: { status: 'failed', errorMsg },
        });
        logEvent('video_generation_failed', {
          videoGenId: videoId,
          userId,
          engine: 'omnihuman-1.5',
          errorStage: stage,
          errorCode: code,
        });
        throw e;
      }
    },
    {
      connection: connection(),
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    console.error('[omnihuman-worker] job failed', job?.id, err?.message);
  });
  worker.on('completed', (job, result) => {
    console.log('[omnihuman-worker] job done', job.id, result);
  });

  return worker;
}
