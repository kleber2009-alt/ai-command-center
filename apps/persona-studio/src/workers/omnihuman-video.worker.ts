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

const MAX_TTS_CHARS = Number(process.env.OMNIHUMAN_MAX_TTS_CHARS ?? 400);

function toOmniAspect(s: string | null | undefined): OmniAspect {
  if (s === '9:16' || s === '1:1' || s === '16:9') return s;
  return 'auto';
}

export function startOmnihumanWorker() {
  const worker = new Worker<VideoJob>(
    QUEUE_NAMES.omnihumanVideo,
    async (job) => {
      const { videoId, userId } = job.data;

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

      try {
        // Step 1: ensure we have a public audio URL. If audioUrl already set
        // (advanced override), use it as-is. Otherwise synthesize via ElevenLabs.
        let audioUrl = row.audioUrl;
        if (!audioUrl) {
          const text = row.script!.slice(0, MAX_TTS_CHARS);
          console.log(`[omnihuman-worker] ${videoId} synthesizing TTS (eleven, voice=${row.voiceId}, ${text.length} chars)…`);
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
          console.log(`[omnihuman-worker] ${videoId} audio uploaded → ${audioUrl.slice(0, 80)}…`);
        }

        // Step 2: submit to OmniHuman with image + audio URLs.
        console.log(`[omnihuman-worker] ${videoId} submitting omnihuman (image=${row.avatar.imageUrl.slice(0, 60)}…, audio=${audioUrl.slice(0, 60)}…)`);
        const taskId = await submitOmnihuman({
          imageUrl: row.avatar.imageUrl,
          audioUrl,
          aspectRatio: toOmniAspect(row.aspect),
        });
        console.log(`[omnihuman-worker] ${videoId} task=${taskId}`);

        await prisma.videoGeneration.update({
          where: { id: videoId },
          data: { engineJobId: taskId },
        });

        const result = await waitForOmnihuman(taskId);
        if (result.state !== 'success') {
          const fail = result as { failCode: string; failMsg: string };
          throw new OmnihumanError(fail.failCode, fail.failMsg);
        }

        console.log(`[omnihuman-worker] ${videoId} downloading mp4 from ${result.videoUrl.slice(0, 80)}…`);
        const dl = await downloadVideo(result.videoUrl);
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
        console.log(`[omnihuman-worker] ${videoId} done (${dl.bytes.length} bytes)`);
        return { ok: true, bytes: dl.bytes.length };
      } catch (e) {
        const msg =
          e instanceof OmnihumanError
            ? `${e.code}: ${e.message}`
            : e instanceof ElevenlabsError
              ? `TTS_${e.code}: ${e.message}`
              : e instanceof Error
                ? e.message
                : String(e);
        await prisma.videoGeneration.update({
          where: { id: videoId },
          data: { status: 'failed', errorMsg: msg.slice(0, 500) },
        });
        await refundTokens({
          userId,
          amount: row.tokensCost,
          reason: 'omnihuman-video:failed',
          refId: videoId,
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
