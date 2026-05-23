import { Worker } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { connection, QUEUE_NAMES, type HeygenVideoJob } from '@/lib/queue';
import {
  uploadTalkingPhoto,
  createVideo,
  waitForVideo,
  downloadBytes,
  HeygenError,
  type Aspect,
  type HeygenModelVersion,
  type Quality,
} from '@/lib/heygen';
import { keyFor, uploadBuffer } from '@/lib/storage';
import { refundTokens } from '@/lib/tokens';

async function fetchBytes(url: string): Promise<{ bytes: Buffer; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch_${res.status}`);
  const mime = res.headers.get('content-type') ?? 'image/jpeg';
  const ab = await res.arrayBuffer();
  return { bytes: Buffer.from(ab), mime };
}

export function startHeygenWorker() {
  const worker = new Worker<HeygenVideoJob>(
    QUEUE_NAMES.heygenVideo,
    async (job) => {
      const { videoId, userId } = job.data;

      const row = await prisma.videoGeneration.findUnique({
        where: { id: videoId },
        include: { avatar: true },
      });
      if (!row) throw new Error('video_missing');
      if (row.userId !== userId) throw new Error('user_mismatch');
      if (!row.avatar.imageUrl) throw new Error('avatar_no_image');
      if (!row.voiceId) throw new Error('voice_missing');
      if (!row.script || row.script.trim().length < 5) throw new Error('script_missing');

      await prisma.videoGeneration.update({
        where: { id: videoId },
        data: { status: 'processing' },
      });

      try {
        // На BullMQ-ретрае не запускаем новую генерацию в HeyGen, если уже
        // есть heygenJobId — продолжаем poll по существующему video_id.
        // Иначе одна VideoGeneration порождает до `attempts` HeyGen-видео.
        let heygenVideoId = row.heygenJobId;

        if (!heygenVideoId) {
          // 1) Upload avatar image to HeyGen → talking_photo_id
          console.log(`[heygen-worker] ${videoId} uploading avatar to heygen…`);
          const ref = await fetchBytes(row.avatar.imageUrl);
          const asset = await uploadTalkingPhoto({ bytes: ref.bytes, mime: ref.mime });
          const talkingPhotoId = asset.id;
          console.log(`[heygen-worker] ${videoId} talking_photo_id=${talkingPhotoId}`);

          // 2) Create video task on HeyGen
          heygenVideoId = await createVideo({
            talkingPhotoId,
            voiceId: row.voiceId,
            script: row.script,
            aspect: (row.aspect as Aspect) ?? '9:16',
            quality: (row.quality as Quality) ?? '2k',
            background: row.background ?? '#000000',
            version: (row.heygenVersion as HeygenModelVersion) ?? 'V',
            motionPrompt: row.motionPrompt ?? undefined,
          });
          console.log(`[heygen-worker] ${videoId} heygen_video_id=${heygenVideoId}`);

          await prisma.videoGeneration.update({
            where: { id: videoId },
            data: { heygenJobId: heygenVideoId },
          });
        } else {
          console.log(`[heygen-worker] ${videoId} resuming existing heygen_video_id=${heygenVideoId}`);
        }

        // 3) Poll until completed or failed (10 min max)
        const result = await waitForVideo(heygenVideoId);

        if (result.state !== 'completed') {
          const failMsg = result.state === 'failed' ? result.errorMessage : `unexpected state ${result.state}`;
          throw new HeygenError('HEYGEN_FAILED', failMsg);
        }

        // 4) Download mp4, re-host in our MinIO for stable URL
        console.log(`[heygen-worker] ${videoId} downloading mp4 from ${result.videoUrl.slice(0, 80)}…`);
        const dl = await downloadBytes(result.videoUrl);
        const ext = dl.mime.includes('mp4') ? 'mp4' : 'mp4';
        const key = keyFor('video', userId, ext);
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
        console.log(`[heygen-worker] ${videoId} done (${dl.bytes.length} bytes, ${result.duration ?? '?'}s)`);
        return { ok: true, bytes: dl.bytes.length };
      } catch (e) {
        const msg = e instanceof HeygenError ? `${e.code}: ${e.message}` : (e instanceof Error ? e.message : String(e));
        const maxAttempts = job.opts.attempts ?? 1;
        const isFinal = job.attemptsMade + 1 >= maxAttempts;
        if (isFinal) {
          await prisma.videoGeneration.update({
            where: { id: videoId },
            data: { status: 'failed', errorMsg: msg.slice(0, 500) },
          });
          await refundTokens({
            userId,
            amount: row.tokensCost,
            reason: 'heygen-video:failed',
            refId: videoId,
          });
        } else {
          // оставляем status=processing; следующий attempt продолжит poll по heygenJobId
          await prisma.videoGeneration.update({
            where: { id: videoId },
            data: { errorMsg: msg.slice(0, 500) },
          });
        }
        throw e;
      }
    },
    {
      connection: connection(),
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    console.error('[heygen-worker] job failed', job?.id, err?.message);
  });
  worker.on('completed', (job, result) => {
    console.log('[heygen-worker] job done', job.id, result);
  });

  return worker;
}
