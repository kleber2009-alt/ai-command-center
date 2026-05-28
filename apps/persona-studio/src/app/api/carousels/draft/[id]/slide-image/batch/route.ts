// POST /api/carousels/draft/:id/slide-image/batch
//   Batch-enqueue AI image generation for the whole carousel (или подмножество).
//
//   body: {
//     slides?: number[]   // 0-based indices; default = все слайды
//     skipExisting?: boolean   // skip слайды у которых уже есть image (default: true)
//     modeOverride?: 'hero-avatar' | 'object' | 'ui' | 'slide-media'
//                       // если задан — все enqueued слайды идут этим mode'ом
//   }
//
//   Mode авто-выбирается по роли + cover type:
//     - slide[0] + coverType=avatar  → hero-avatar (требует draft.coverAvatarId)
//     - slide[0] + coverType=object  → object
//     - slide[0] + coverType=ui      → ui
//     - slide[0] + coverType=split   → SKIP (split-обложке AI не нужна)
//     - все остальные                → slide-media
//
//   Списываем токены ПОСЛАЙДОВО при успешной постановке в очередь. Если
//   баланс кончился посередине — то что enqueued остаётся в работе, а
//   остаток возвращаем 402 с deltaQueued.
//
//   Возвращает 202 со списком enqueued + skipped и причинами.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { slideImageQueue } from '@/lib/queue';
import { chargeTokens, InsufficientTokensError, COSTS } from '@/lib/tokens';
import { patchSlideStatus, type SlideImageMode } from '@/lib/carousel/image-gen';
import { isValidCoverType, type CoverType } from '@/lib/carousel/prompts';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z
  .object({
    slides: z.array(z.number().int().min(0).max(19)).max(20).optional(),
    skipExisting: z.boolean().default(true),
    modeOverride: z
      .enum(['hero-avatar', 'object', 'ui', 'slide-media'])
      .optional(),
  })
  .default({});

type SlideJson = {
  title: string;
  body: string;
  image?: string;
  coverType?: CoverType;
  imageStatus?: 'pending' | 'done' | 'failed';
};

type Decision =
  | { index: number; action: 'enqueue'; mode: SlideImageMode }
  | { index: number; action: 'skip'; reason: string };

function decideMode(
  index: number,
  total: number,
  slide: SlideJson,
  hasAvatar: boolean,
): { mode: SlideImageMode } | { skip: string } {
  const isCover = index === 0;
  if (isCover) {
    const ct = isValidCoverType(slide.coverType) ? slide.coverType : 'avatar';
    if (ct === 'split') return { skip: 'split cover — AI image не нужна' };
    if (ct === 'avatar') {
      if (!hasAvatar) return { skip: 'нет cover-аватара' };
      return { mode: 'hero-avatar' };
    }
    if (ct === 'object') return { mode: 'object' };
    if (ct === 'ui') return { mode: 'ui' };
  }
  // reveal / cta — generic editorial visual
  void total;
  return { mode: 'slide-media' };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = auth.user;
  const { id } = await ctx.params;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const { slides: filter, skipExisting, modeOverride } = parsed.data;

  const draft = await prisma.carouselDraft.findFirst({
    where: { id, userId: user.id },
    select: { id: true, slides: true, coverAvatarId: true },
  });
  if (!draft) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const slides = Array.isArray(draft.slides) ? (draft.slides as unknown as SlideJson[]) : [];
  if (slides.length < 2) {
    return NextResponse.json({ error: 'not_enough_slides' }, { status: 400 });
  }
  const hasAvatar = Boolean(draft.coverAvatarId);

  // ── Build decision list ─────────────────────────────────────────────
  const decisions: Decision[] = [];
  const targetIndices = filter && filter.length > 0 ? filter : slides.map((_, i) => i);
  for (const i of targetIndices) {
    if (i < 0 || i >= slides.length) {
      decisions.push({ index: i, action: 'skip', reason: 'out of range' });
      continue;
    }
    const s = slides[i];
    if (!s?.title?.trim() || !s?.body?.trim()) {
      decisions.push({ index: i, action: 'skip', reason: 'empty slide' });
      continue;
    }
    if (s.imageStatus === 'pending') {
      decisions.push({ index: i, action: 'skip', reason: 'already pending' });
      continue;
    }
    if (skipExisting && s.image && s.imageStatus === 'done') {
      decisions.push({ index: i, action: 'skip', reason: 'image already generated' });
      continue;
    }
    if (modeOverride) {
      // Override: проверяем только наличие аватара для hero-avatar.
      if (modeOverride === 'hero-avatar' && !hasAvatar) {
        decisions.push({ index: i, action: 'skip', reason: 'нет cover-аватара' });
        continue;
      }
      decisions.push({ index: i, action: 'enqueue', mode: modeOverride });
      continue;
    }
    const d = decideMode(i, slides.length, s, hasAvatar);
    if ('skip' in d) {
      decisions.push({ index: i, action: 'skip', reason: d.skip });
    } else {
      decisions.push({ index: i, action: 'enqueue', mode: d.mode });
    }
  }

  const toEnqueue = decisions.filter((d): d is Extract<Decision, { action: 'enqueue' }> => d.action === 'enqueue');
  const skipped = decisions.filter((d): d is Extract<Decision, { action: 'skip' }> => d.action === 'skip');

  if (toEnqueue.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        enqueued: [],
        skipped,
        message: 'нет слайдов для генерации',
      },
      { status: 200 },
    );
  }

  // ── Per-slide charge + enqueue. Если токенов не хватит посередине —
  //    останавливаем, возвращаем что успели + 402 в message.
  const enqueued: Array<{ index: number; mode: SlideImageMode; jobId?: string }> = [];
  let insufficient: { have: number; need: number } | null = null;

  for (const d of toEnqueue) {
    try {
      await chargeTokens({
        userId: user.id,
        amount: COSTS.slideImage,
        reason: 'slide-image:batch',
        refId: `${id}:${d.index}`,
      });
    } catch (e) {
      if (e instanceof InsufficientTokensError) {
        insufficient = { have: e.have, need: e.need };
        break;
      }
      throw e;
    }
    await patchSlideStatus(id, d.index, {
      imageStatus: 'pending',
      imageError: undefined,
    });
    const job = await slideImageQueue().add(
      'generate',
      { draftId: id, userId: user.id, slideIndex: d.index, mode: d.mode },
      { jobId: `${id}:${d.index}:${Date.now()}` },
    );
    enqueued.push({ index: d.index, mode: d.mode, jobId: job.id });
  }

  if (insufficient) {
    return NextResponse.json(
      {
        ok: false,
        error: 'insufficient_tokens',
        message: `Хватило только на ${enqueued.length} из ${toEnqueue.length} слайдов. Баланс: ${insufficient.have}, нужно за слайд: ${insufficient.need}.`,
        enqueued,
        skipped,
        ...insufficient,
      },
      { status: 402 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      enqueued,
      skipped,
      tokensCharged: enqueued.length * COSTS.slideImage,
    },
    { status: 202 },
  );
}
