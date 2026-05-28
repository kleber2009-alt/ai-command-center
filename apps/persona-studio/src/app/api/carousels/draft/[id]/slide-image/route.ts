// POST /api/carousels/draft/:id/slide-image?index=N
//   → enqueue slide image generation job, charge tokens, mark slide as pending
//   body: { mode: 'hero-avatar' | 'object' | 'ui' | 'slide-media' }
//
// GET  /api/carousels/draft/:id/slide-image?index=N
//   → return current slide image status + URL
//
// Воркер живёт в src/workers/slide-image.worker.ts, оркестратор в
// src/lib/carousel/image-gen.ts.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { slideImageQueue } from '@/lib/queue';
import { chargeTokens, InsufficientTokensError, COSTS } from '@/lib/tokens';
import { patchSlideStatus, type SlideImageMode } from '@/lib/carousel/image-gen';

export const runtime = 'nodejs';

const Body = z.object({
  mode: z.enum(['hero-avatar', 'object', 'ui', 'slide-media']),
});

type SlideJson = {
  title: string;
  body: string;
  image?: string;
  coverType?: string;
  imageStatus?: 'pending' | 'done' | 'failed';
  imageError?: string;
};

function parseIndex(req: NextRequest): number | null {
  const raw = req.nextUrl.searchParams.get('index');
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function loadSlide(draftId: string, userId: string, index: number) {
  const draft = await prisma.carouselDraft.findFirst({
    where: { id: draftId, userId },
    select: { id: true, slides: true, coverAvatarId: true },
  });
  if (!draft) return null;
  const slides = Array.isArray(draft.slides) ? (draft.slides as unknown as SlideJson[]) : [];
  if (index >= slides.length) return null;
  return { draft, slides, slide: slides[index] };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = auth.user;
  const { id } = await ctx.params;

  const index = parseIndex(req);
  if (index == null) return NextResponse.json({ error: 'bad_index' }, { status: 400 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const mode = parsed.data.mode as SlideImageMode;

  const ctxData = await loadSlide(id, user.id, index);
  if (!ctxData) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { slide } = ctxData;
  if (!slide?.title?.trim() || !slide?.body?.trim()) {
    return NextResponse.json(
      { error: 'empty_slide', message: `Слайд ${index + 1} пуст — сначала заполни.` },
      { status: 400 },
    );
  }
  if (slide.imageStatus === 'pending') {
    return NextResponse.json(
      { error: 'already_pending', message: 'Генерация уже запущена.' },
      { status: 409 },
    );
  }
  if (mode === 'hero-avatar' && !ctxData.draft.coverAvatarId) {
    return NextResponse.json(
      { error: 'no_avatar', message: 'Выбери cover-аватар перед генерацией hero-avatar.' },
      { status: 400 },
    );
  }

  // Charge tokens up-front; refund в воркере при фейле.
  try {
    await chargeTokens({
      userId: user.id,
      amount: COSTS.slideImage,
      reason: 'slide-image:dispatch',
      refId: `${id}:${index}`,
    });
  } catch (e) {
    if (e instanceof InsufficientTokensError) {
      return NextResponse.json(
        {
          error: 'insufficient_tokens',
          message: `Нужно ${e.need} токенов, есть ${e.have}.`,
          have: e.have,
          need: e.need,
        },
        { status: 402 },
      );
    }
    throw e;
  }

  // Patch slide.imageStatus → pending. Чистим прошлую ошибку если была.
  await patchSlideStatus(id, index, {
    imageStatus: 'pending',
    imageError: undefined,
  });

  // Enqueue async job.
  const job = await slideImageQueue().add(
    'generate',
    { draftId: id, userId: user.id, slideIndex: index, mode },
    { jobId: `${id}:${index}:${Date.now()}` },
  );

  return NextResponse.json(
    {
      ok: true,
      jobId: job.id,
      index,
      mode,
      status: 'pending',
      tokensCharged: COSTS.slideImage,
    },
    { status: 202 },
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = auth.user;
  const { id } = await ctx.params;

  const index = parseIndex(req);
  if (index == null) return NextResponse.json({ error: 'bad_index' }, { status: 400 });

  const ctxData = await loadSlide(id, user.id, index);
  if (!ctxData) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { slide } = ctxData;
  return NextResponse.json({
    ok: true,
    index,
    status: slide?.imageStatus ?? (slide?.image ? 'done' : null),
    image: slide?.image ?? null,
    error: slide?.imageError ?? null,
  });
}
