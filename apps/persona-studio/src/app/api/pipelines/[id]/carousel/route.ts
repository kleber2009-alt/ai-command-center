// GET   /api/pipelines/:id/carousel — the carousel branch state for the
//       CarouselPipeline UI: source post (+ own-median rank), remix draft, post.
// PATCH /api/pipelines/:id/carousel — edit the remix:
//       { slides?, hookChoice?, hooks?, codeWord?, caption?, look? }
//       Any visual change (slides / hook / code word / look) drops the rendered
//       images, so the branch goes back to the remix stage until re-rendered.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isValidStyle } from '@/lib/carousel/styles';
import {
  normalizeCodeWord,
  ORIGINAL_LOOK,
  sanitizeSlides,
  swapCtaWord,
  type RemixMeta,
  type RemixSlide,
} from '@/lib/carousel/remix';
import { CAROUSEL_STAGE, carouselView, draftStyleFor, isCtxError, loadCarouselCtx } from '@/lib/carousel/remix-server';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const ctx = await loadCarouselCtx(auth.user.id, id);
  if (isCtxError(ctx)) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  return NextResponse.json(await carouselView(ctx));
}

const Hook = z.object({ id: z.enum(['A', 'B']), title: z.string().max(160), sub: z.string().max(200), why: z.string().max(300).optional() });

const Patch = z
  .object({
    slides: z.array(z.unknown()).min(2).max(20),
    hookChoice: z.enum(['A', 'B']),
    hooks: z.array(Hook).length(2),
    codeWord: z.string().max(24),
    caption: z.string().max(2200),
    look: z.string().max(60),
  })
  .partial()
  .strict();

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const ctx = await loadCarouselCtx(auth.user.id, id);
  if (isCtxError(ctx)) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const draft = ctx.draft;
  if (!draft || !draft.remix) return NextResponse.json({ error: 'no_draft' }, { status: 409 });

  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  const body = parsed.data;

  const meta = { ...(draft.remix as unknown as RemixMeta) };
  let slides = (Array.isArray(draft.slides) ? draft.slides : []) as unknown as RemixSlide[];
  let visual = false;

  if (body.slides) {
    const clean = sanitizeSlides(body.slides, draft.sourceImages.length);
    if (!clean) return NextResponse.json({ error: 'bad_slides', message: 'Нужны обложка первой и CTA последним.' }, { status: 400 });
    slides = clean;
    visual = true;
  }
  if (body.hooks) {
    meta.hooks = body.hooks.map((h) => ({ id: h.id, title: h.title.trim(), sub: h.sub.trim(), why: h.why ?? '' }));
  }
  if (body.hookChoice && body.hookChoice !== meta.hookChoice) {
    meta.hookChoice = body.hookChoice;
    // Switching A/B rewrites the cover text unless the client sent slides too.
    if (!body.slides) {
      const h = meta.hooks.find((x) => x.id === body.hookChoice);
      if (h) slides = slides.map((s) => (s.role === 'cover' ? { ...s, title: h.title, body: h.sub } : s));
      visual = true;
    }
  }
  if (body.codeWord !== undefined) {
    const word = normalizeCodeWord(body.codeWord);
    if (!word) return NextResponse.json({ error: 'bad_code_word', message: 'Кодовое слово не может быть пустым.' }, { status: 400 });
    if (word !== meta.codeWord) {
      const old = meta.codeWord;
      meta.codeWord = word;
      slides = slides.map((s) => (s.role === 'cta' ? { ...s, title: swapCtaWord(s.title, old, word) } : s));
      // keep the caption's first line in sync when it carried the old word
      if (body.caption === undefined) meta.caption = meta.caption.split(`«${old}»`).join(`«${word}»`);
      visual = true;
    }
  }
  if (body.caption !== undefined) meta.caption = body.caption.trim();
  if (body.look !== undefined) {
    const look = body.look === ORIGINAL_LOOK || isValidStyle(body.look) ? body.look : null;
    if (!look) return NextResponse.json({ error: 'bad_style' }, { status: 400 });
    if (look !== meta.look) {
      meta.look = look;
      visual = true;
    }
  }

  await prisma.carouselDraft.update({
    where: { id: draft.id },
    data: {
      slides: slides as unknown as object,
      slidesCount: slides.length,
      remix: meta as unknown as object,
      style: draftStyleFor(meta.look),
      ...(visual ? { imageUrls: [], status: 'draft', completedAt: null } : {}),
    },
  });
  if (visual && ctx.pipeline.stage === CAROUSEL_STAGE.ready && !ctx.pipeline.scheduledPostId) {
    await prisma.pipeline.update({ where: { id: ctx.pipeline.id }, data: { stage: CAROUSEL_STAGE.remix } });
  }

  const fresh = await loadCarouselCtx(auth.user.id, id);
  if (isCtxError(fresh)) return NextResponse.json({ error: fresh.error }, { status: fresh.status });
  return NextResponse.json(await carouselView(fresh));
}
