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
import { env } from '@/lib/env';

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
  return 'UNKNOWN';
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function startOmnihumanWorker() {
  const worker = new Worker<VideoJob>(
    QUEUE_NAMES.omnihumanVideo,
    async (job) => {
      const { videoId, userId } = job.data;
      const startMs = Date.now();

      const row = await prisma.videoGeneration.findUnique({
        where: { id: videoId },
        include: { avatar: true },
      });
      if (!row) throw new Error('video_missing');
      if (row.userId !== userId) throw new Error('user_mismatch');
      if (row.engine !== 'omnihuman-1.5') throw new Error(`wrong_engine:${row.engine}`);
      if (!row.avatar.imageUrl) throw new Error('avatar_no_image');
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

      // ── Stage 1: TTS (skip if audioUrl override already set) ──
      let audioUrl = row.audioUrl;
      let ttsMs: number | null = null;
      if (!audioUrl) {
        const ttsStart = Date.now();
        try {
          const text = row.script!.slice(0, env.OMNIHUMAN_MAX_TTS_CHARS);
          const tts = await synthesize({
            text,
            voiceId: row.voiceId!,
          });
          const audioKey = keyFor('audio', userId, 'mp3');
          audioUrl = await uploadBuffer({
            key: audioKey,
            body: tts.bytes,
            contentType: tts.mime,
            cacheControl: 'public, max-age=86400',
          });
          await prisma.videoGeneration.update({
            where: { id: videoId },
            data: { audioUrl },
          });
          ttsMs = Date.now() - ttsStart;
          logEvent('video_tts_done', { videoGenId: videoId, ttsMs, charsCount: text.length });
        } catch (e) {
          const code = errCode(e);
          const msg = errMsg(e);
          await refundTokens({
            userId,
            amount: row.tokensCost,
            reason: 'omnihuman-video:tts-failed',
            refId: videoId,
          });
          await prisma.videoGeneration.update({
            where: { id: videoId },
            data: {
              status: 'failed',
              errorMsg: `TTS_${code}: ${msg}`.slice(0, 500),
            },
          });
          logEvent('video_generation_failed', {
            videoGenId: videoId,
            userId,
            engine: 'omnihuman-1.5',
            errorStage: 'tts',
            errorCode: code,
          });
          throw e;
        }
      }

      // ── Stage 2: OmniHuman submit + poll + download ──
      const videoStart = Date.now();
      try {
        const taskId = await submitOmnihuman({
          imageUrl: row.avatar.imageUrl,
          audioUrl,
          aspectRatio: toOmniAspect(row.aspect),
        });

        await prisma.videoGeneration.update({
          where: { id: videoId },
          data: { engineJobId: taskId },
        });
        logEvent('omnihuman_submitted', { videoGenId: videoId, taskId });

        const videoCdnUrl = await waitForOmnihuman({
          taskId,
          maxMs: env.OMNIHUMAN_MAX_POLL_MS,
        });

        const dl = await downloadVideo(videoCdnUrl);
        const key = keyFor('video', userId, 'mp4');
        const stableUrl = await uploadBuffer({
          key,
          body: dl.bytes,
          contentType: dl.mime,
          cacheControl: 'public, max-age=86400',
        });

        await prisma.videoGeneration.update({
          where: { id: videoId },
          data: {
            videoUrl: stableUrl,
            status: 'completed',
            completedAt: new Date(),
          },
        });

        const videoMs = Date.now() - videoStart;
        const totalMs = Date.now() - startMs;
        logEvent('video_generation_completed', {
          videoGenId: videoId,
          userId,
          engine: 'omnihuman-1.5',
          ttsMs,
          videoMs,
          totalMs,
          bytes: dl.bytes.length,
        });
        return { ok: true, bytes: dl.bytes.length, ttsMs, videoMs, totalMs };
      } catch (e) {
        const code = errCode(e);
        const msg = errMsg(e);
        await refundTokens({
          userId,
          amount: row.tokensCost,
          reason: 'omnihuman-video:engine-failed',
          refId: videoId,
        });
        await prisma.videoGeneration.update({
          where: { id: videoId },
          data: {
            status: 'failed',
            errorMsg: `OMNIHUMAN_${code}: ${msg}`.slice(0, 500),
          },
        });
        logEvent('video_generation_failed', {
          videoGenId: videoId,
          userId,
          engine: 'omnihuman-1.5',
          errorStage: 'engine',
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
