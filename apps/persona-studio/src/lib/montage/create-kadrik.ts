// Kadrik montage creation — shared by POST /api/montages and the pipeline
// wizard (POST /api/pipelines/:id/montage). Charges tokens, creates the Montage
// row and enqueues it; refunds when the queue is down.

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, InsufficientTokensError, COSTS } from '@/lib/tokens';
import { kadrikMontageQueue } from '@/lib/queue';
import { publicUrl } from '@/lib/storage';
import { findKadrikStyle, kadrikCostFactor, kadrikRunnable, KADRIK_STYLES } from '@/lib/montage/kadrik-styles';
import { kadrikConfigured } from '@/lib/montage/kadrik';

export const MontageBody = z.object({
  style: z.string().refine((s) => Boolean(findKadrikStyle(s)), {
    message: `unknown_style (allowed: ${KADRIK_STYLES.map((p) => p.id).join(', ')})`,
  }),
  videoGenerationId: z.string().min(1).optional(),
  sourceUrl: z.string().url().optional(),
  link: z.string().trim().url().max(500).optional(),
  script: z.string().trim().max(20_000).optional(),
  wish: z.string().trim().max(1500).optional(),
  ctaWord: z.string().trim().max(24).optional(),
});
export type MontageInput = z.infer<typeof MontageBody>;

/** status + JSON body, so callers can hand it straight to NextResponse.json */
export type ApiResult = { status: number; body: Record<string, unknown> };

function res(body: Record<string, unknown>, init?: { status: number }): ApiResult {
  return { status: init?.status ?? 200, body };
}

export async function createKadrikMontage(userId: string, data: MontageInput): Promise<ApiResult> {
  const style = findKadrikStyle(data.style)!;
  if (!kadrikRunnable(style)) {
    return res({ error: 'style_local_only', message: 'Этот инструмент работает с папкой футажей на машине бота — запусти его в Студии Кадрика.' }, { status: 422 });
  }
  if (!kadrikConfigured()) {
    return res(
      { error: 'kadrik_not_configured', message: 'Монтаж по стилям пока не подключён: администратору нужно указать адрес и ключ Студии Кадрика.' },
      { status: 503 },
    );
  }

  let sourceUrl = '';
  let videoGenerationId: string | null = null;
  if (style.inp === 'video') {
    if (Boolean(data.videoGenerationId) === Boolean(data.sourceUrl)) {
      return res({ error: 'bad_body', message: 'нужен ровно один источник: videoGenerationId или sourceUrl' }, { status: 400 });
    }
    if (data.videoGenerationId) {
      const video = await prisma.videoGeneration.findFirst({ where: { id: data.videoGenerationId, userId } });
      if (!video) return res({ error: 'video_not_found' }, { status: 404 });
      if (video.status !== 'completed' || !video.videoUrl) {
        return res({ error: 'video_not_ready', status: video.status }, { status: 409 });
      }
      sourceUrl = video.videoUrl;
      videoGenerationId = video.id;
    } else {
      const own = publicUrl(`video/${userId}/`);
      if (!data.sourceUrl!.startsWith(own)) {
        return res({ error: 'foreign_source', message: 'Источник должен быть загружен через /api/montages/upload.' }, { status: 400 });
      }
      sourceUrl = data.sourceUrl!;
    }
  } else if (style.inp === 'link') {
    if (!data.link) return res({ error: 'bad_body', message: 'нужна ссылка на видео' }, { status: 400 });
    sourceUrl = data.link;
  } else if (!data.script) {
    return res({ error: 'bad_body', message: 'нужен текст или сценарий' }, { status: 400 });
  }

  const cost = COSTS.kadrikMontage * kadrikCostFactor(style);
  try {
    await chargeTokens({ userId: userId, amount: cost, reason: `kadrik-montage:${style.id}` });
  } catch (e) {
    if (e instanceof InsufficientTokensError) {
      return res({ error: 'insufficient_tokens', have: e.have, need: e.need }, { status: 402 });
    }
    throw e;
  }

  const montage = await prisma.montage.create({
    data: {
      userId: userId,
      videoGenerationId,
      sourceUrl,
      style: style.id,
      format: style.format,
      ctaWord: data.ctaWord || null,
      options: {
        ...(style.inp === 'link' ? { link: data.link } : {}),
        ...(style.inp === 'text' ? { script: data.script } : {}),
        ...(data.wish ? { wish: data.wish } : {}),
      },
      tokensCost: cost,
      progress: 'в очереди',
    },
  });

  try {
    await kadrikMontageQueue().add('montage', { montageId: montage.id, userId: userId }, { jobId: montage.id });
  } catch (e) {
    console.error('[api/montages] enqueue failed', e);
    await refundTokens({ userId: userId, amount: cost, reason: 'kadrik-montage:enqueue-failed', refId: montage.id });
    await prisma.montage.update({ where: { id: montage.id }, data: { status: 'failed', errorMsg: 'enqueue_failed' } });
    return res({ error: 'enqueue_failed' }, { status: 500 });
  }

  return res({ id: montage.id, status: montage.status, cost });
}
