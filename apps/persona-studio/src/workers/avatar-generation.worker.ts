import { Worker } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { connection, QUEUE_NAMES, type AvatarGenerationJob } from '@/lib/queue';
import { generateImageWithFlux, generateImage, KieError } from '@/lib/kie';
import { keyFor, uploadBuffer } from '@/lib/storage';
import { refundTokens } from '@/lib/tokens';
import { styleBySlug } from '@/lib/styles';
import { buildAvatarPrompt } from '@/lib/prompts';

const CONCURRENCY = Number(process.env.WORKER_AVATAR_CONCURRENCY ?? 2);
const PER_STYLE_PARALLEL = Number(process.env.WORKER_PER_STYLE_PARALLEL ?? 3);
const AVATAR_ENGINE = (process.env.AVATAR_ENGINE ?? 'flux').toLowerCase();  // 'flux' | 'nano-banana'

export function startAvatarWorker() {
  const worker = new Worker<AvatarGenerationJob>(
    QUEUE_NAMES.avatarGeneration,
    async (job) => {
      const { generationId, userId } = job.data;

      const generation = await prisma.avatarGeneration.findUnique({
        where: { id: generationId },
        include: { upload: true, avatars: { orderBy: { createdAt: 'asc' } } },
      });
      if (!generation) throw new Error('generation_missing');
      if (generation.userId !== userId) throw new Error('user_mismatch');

      await prisma.avatarGeneration.update({
        where: { id: generationId },
        data: { status: 'processing', startedAt: new Date() },
      });

      // Flux Kontext требует публично доступной HTTPS URL — наш MinIO
      // отдаёт фото через media.46-62-215-11.nip.io, kie серверы достанут.
      const refUrl = generation.upload.fileUrl;

      // Бьём 10 аватаров на пачки по PER_STYLE_PARALLEL чтобы не упереться
      // в kie rate-limit.
      const results: Array<'done' | 'failed'> = [];

      async function runOne(avatarId: string, styleSlug: string, label: string) {
        const style = styleBySlug(styleSlug);
        if (!style) {
          await prisma.avatar.update({
            where: { id: avatarId },
            data: { status: 'failed', errorMsg: 'unknown_style' },
          });
          return 'failed' as const;
        }
        const prompt = buildAvatarPrompt(style);
        try {
          const out =
            AVATAR_ENGINE === 'nano-banana'
              ? await generateImage({
                  prompt,
                  referenceImageUrl: refUrl,
                  aspectRatio: '3:4',
                  resolution: '1K',
                  outputFormat: 'jpg',
                })
              : await generateImageWithFlux({
                  prompt,
                  inputImageUrl: refUrl,
                  aspectRatio: '3:4',
                  outputFormat: 'jpeg',
                });
          const ext = out.mime.split('/')[1] ?? 'jpg';
          const key = keyFor('avatar', userId, ext);
          const url = await uploadBuffer({
            key,
            body: out.bytes,
            contentType: out.mime,
          });
          await prisma.avatar.update({
            where: { id: avatarId },
            data: {
              imageUrl: url,
              status: 'done',
              promptUsed: prompt,
            },
          });
          console.log(`[avatar-worker] ${label} done (${AVATAR_ENGINE} taskId=${out.taskId})`);
          return 'done' as const;
        } catch (e) {
          const msg = e instanceof KieError ? `${e.code}: ${e.message}` : (e instanceof Error ? e.message : String(e));
          await prisma.avatar.update({
            where: { id: avatarId },
            data: { status: 'failed', errorMsg: msg.slice(0, 500) },
          });
          console.warn(`[avatar-worker] ${label} failed: ${msg.slice(0, 200)}`);
          return 'failed' as const;
        }
      }

      // Sequential batches of N parallel tasks
      for (let i = 0; i < generation.avatars.length; i += PER_STYLE_PARALLEL) {
        const batch = generation.avatars.slice(i, i + PER_STYLE_PARALLEL);
        const batchResults = await Promise.all(
          batch.map((a) => runOne(a.id, a.style, a.styleLabel)),
        );
        results.push(...batchResults);
      }

      const doneCount = results.filter((r) => r === 'done').length;
      const failedCount = results.filter((r) => r === 'failed').length;

      let finalStatus: 'completed' | 'failed' | 'partial';
      if (doneCount === 0) finalStatus = 'failed';
      else if (failedCount === 0) finalStatus = 'completed';
      else finalStatus = 'partial';

      await prisma.avatarGeneration.update({
        where: { id: generationId },
        data: {
          status: finalStatus,
          completedAt: new Date(),
          errorMsg: finalStatus === 'failed' ? 'all_avatars_failed' : null,
        },
      });

      if (finalStatus === 'failed') {
        await refundTokens({
          userId,
          amount: generation.tokensCost,
          reason: 'avatar-generation:all-failed',
          refId: generationId,
        });
      } else if (finalStatus === 'partial') {
        const refund = Math.floor((generation.tokensCost * failedCount) / generation.avatars.length);
        if (refund > 0) {
          await refundTokens({
            userId,
            amount: refund,
            reason: `avatar-generation:partial-fail:${failedCount}/${generation.avatars.length}`,
            refId: generationId,
          });
        }
      }

      return { done: doneCount, failed: failedCount };
    },
    {
      connection: connection(),
      concurrency: CONCURRENCY,
    },
  );

  worker.on('failed', (job, err) => {
    console.error('[avatar-worker] job failed', job?.id, err?.message);
  });
  worker.on('completed', (job, result) => {
    console.log('[avatar-worker] job done', job.id, result);
  });

  return worker;
}
