import { Worker } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { connection, QUEUE_NAMES, type CoverGenerationJob } from '@/lib/queue';
import { generateImageWithFlux, KieError } from '@/lib/kie';
import { keyFor, uploadBuffer } from '@/lib/storage';
import { refundTokens } from '@/lib/tokens';
import { styleBySlug } from '@/lib/styles';
import { buildCoverPrompt } from '@/lib/prompts';
import type { FluxAspect } from '@/lib/kie';

function aspectToFlux(aspect: string): FluxAspect {
  switch (aspect) {
    case '4:5': return '3:4';        // Flux не поддерживает 4:5 — ближайший по портрету
    case '1:1': return '1:1';
    case '9:16': return '9:16';
    case '3:4': return '3:4';
    case '16:9': return '16:9';
    default: return '3:4';
  }
}

export function startCoverWorker() {
  const worker = new Worker<CoverGenerationJob>(
    QUEUE_NAMES.coverGeneration,
    async (job) => {
      const { coverId, userId } = job.data;

      const cover = await prisma.cover.findUnique({
        where: { id: coverId },
        include: { avatar: true },
      });
      if (!cover) throw new Error('cover_missing');
      if (cover.userId !== userId) throw new Error('user_mismatch');
      if (!cover.avatar.imageUrl) throw new Error('avatar_missing_image');

      await prisma.cover.update({
        where: { id: coverId },
        data: { status: 'processing' },
      });

      const style = styleBySlug(cover.style) ?? { label: cover.style, promptStyle: '' };

      const prompt = buildCoverPrompt({
        title: cover.title,
        subtitle: cover.subtitle,
        cta: cover.cta,
        niche: cover.niche,
        styleLabel: style.label,
        aspect: cover.aspect,
      });

      try {
        // Используем уже сгенерированный аватар как input для Flux Kontext.
        // avatar.imageUrl публичен через media.46-62-215-11.nip.io — kie достанет.
        const out = await generateImageWithFlux({
          prompt,
          inputImageUrl: cover.avatar.imageUrl,
          aspectRatio: aspectToFlux(cover.aspect),
          outputFormat: 'jpeg',
        });

        const ext = out.mime.split('/')[1] ?? 'jpg';
        const key = keyFor('cover', userId, ext);
        const url = await uploadBuffer({ key, body: out.bytes, contentType: out.mime });

        await prisma.cover.update({
          where: { id: coverId },
          data: {
            imageUrl: url,
            promptUsed: prompt,
            status: 'completed',
            completedAt: new Date(),
            errorMsg: null,
          },
        });
        console.log(`[cover-worker] ${coverId} done (flux taskId=${out.taskId})`);
        return { ok: true, taskId: out.taskId };
      } catch (e) {
        const msg = e instanceof KieError ? `${e.code}: ${e.message}` : (e instanceof Error ? e.message : String(e));
        await prisma.cover.update({
          where: { id: coverId },
          data: { status: 'failed', errorMsg: msg.slice(0, 500) },
        });
        await refundTokens({
          userId,
          amount: cover.tokensCost,
          reason: 'cover-generation:failed',
          refId: coverId,
        });
        throw e;
      }
    },
    {
      connection: connection(),
      concurrency: 4,
    },
  );

  worker.on('failed', (job, err) => {
    console.error('[cover-worker] job failed', job?.id, err?.message);
  });
  worker.on('completed', (job, result) => {
    console.log('[cover-worker] job done', job.id, result);
  });

  return worker;
}
