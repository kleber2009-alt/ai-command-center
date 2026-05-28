import { Worker } from 'bullmq';
import { connection, QUEUE_NAMES, type SlideImageJob } from '@/lib/queue';
import { generateSlideImage } from '@/lib/carousel/image-gen';
import { refundTokens } from '@/lib/tokens';
import { env } from '@/lib/env';

/**
 * AI Carousel Engine — worker for slide-level image generation.
 * Дёргает high-level orchestrator (image-gen.ts) и в случае фейла
 * возвращает токены пользователю.
 *
 * Concurrency держим низким (2) — kie playground под нагрузкой даёт
 * больше fail'ов, чем мы хотим обрабатывать.
 */
export function startSlideImageWorker() {
  const worker = new Worker<SlideImageJob>(
    QUEUE_NAMES.slideImage,
    async (job) => {
      const { draftId, userId, slideIndex, mode } = job.data;
      console.log(
        `[slide-image-worker] start draft=${draftId} idx=${slideIndex} mode=${mode}`,
      );

      const result = await generateSlideImage({
        draftId,
        userId,
        slideIndex,
        mode,
      });

      if (!result.ok) {
        console.warn(
          `[slide-image-worker] failed draft=${draftId} idx=${slideIndex} mode=${mode} → ${result.code}: ${result.message}`,
        );
        // Возвращаем токены за неуспех. Не throw — мы хотим что job marked
        // completed (со статусом fail), а не «retry» — kie часто фейлит на
        // одном и том же промпте.
        await refundTokens({
          userId,
          amount: env.COST_SLIDE_IMAGE,
          reason: 'slide-image:failed',
          refId: `${draftId}:${slideIndex}`,
        }).catch((e) => {
          console.warn('[slide-image-worker] refund failed:', (e as Error).message);
        });
        return { ok: false, code: result.code, message: result.message };
      }

      console.log(
        `[slide-image-worker] done draft=${draftId} idx=${slideIndex} task=${result.taskId} credits=${result.creditsConsumed ?? '?'}`,
      );
      return {
        ok: true,
        imageUrl: result.imageUrl,
        taskId: result.taskId,
        creditsConsumed: result.creditsConsumed,
      };
    },
    {
      connection: connection(),
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    // Это срабатывает только когда мы throw — orchestrator сам ловит
    // ошибки kie и возвращает {ok:false}. Случается при unexpected DB-крашах.
    console.error('[slide-image-worker] job exception', job?.id, err?.message);
  });

  return worker;
}
