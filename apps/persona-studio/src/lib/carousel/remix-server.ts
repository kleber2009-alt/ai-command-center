// Server helpers for the carousel branch of the pipeline
// (/api/pipelines/[id]/carousel/**): load + authorize, the JSON view the
// CarouselPipeline UI consumes, remix creation and rendering.

import type { CarouselDraft, ParserItem, Pipeline } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { fetchMedia, uploadBuffer } from '@/lib/storage';
import { copySlides, isOurs } from '@/lib/blog/media';
import { daysSince, inRemixCooldown, rankOwnKind, type OwnMedians, type OwnPostInput } from '@/lib/blog/rank';
import { isValidStyle, type CarouselStyleId } from './styles';
import { renderSlide } from './render-slide';
import sharp from 'sharp';
import {
  buildRemixSpec,
  extractCodeWord,
  normalizeCodeWord,
  ORIGINAL_LOOK,
  sourceKindOf,
  type RemixMeta,
  type RemixSlide,
} from './remix';
import { generateRemixCopy } from './remix-ai';
import { normalizeKeepSlide, renderRemixSlide } from './render-remix';

/** Carousel branch stages (Pipeline.stage): source → script (remix text) → ready (rendered) → scheduled → published. */
export const CAROUSEL_STAGE = { source: 'source', remix: 'script', ready: 'ready' } as const;

export type CarouselCtx = {
  pipeline: Pipeline;
  item: ParserItem | null;
  draft: CarouselDraft | null;
};

export type CtxError = { error: string; status: number; message?: string };

export async function loadCarouselCtx(userId: string, pipelineId: string): Promise<CarouselCtx | CtxError> {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, userId } });
  if (!pipeline) return { error: 'not_found', status: 404 };
  if (pipeline.kind !== 'carousel') return { error: 'not_carousel', status: 409 };
  const [item, draft] = await Promise.all([
    pipeline.parserItemId ? prisma.parserItem.findFirst({ where: { id: pipeline.parserItemId, userId } }) : null,
    pipeline.carouselDraftId ? prisma.carouselDraft.findFirst({ where: { id: pipeline.carouselDraftId, userId } }) : null,
  ]);
  return { pipeline, item, draft };
}

export function isCtxError(x: CarouselCtx | CtxError): x is CtxError {
  return 'error' in x;
}

async function sourceRank(userId: string, itemId: string): Promise<{ medians: OwnMedians; winner: boolean; strongBody: boolean; best: boolean; score: number } | null> {
  const rows = await prisma.parserItem.findMany({
    where: { userId, source: 'own', kind: 'carousel', status: { not: 'dismissed' } },
    select: { id: true, plays: true, likes: true, comments: true, shares: true, postedAt: true },
    take: 500,
  });
  const inputs: OwnPostInput[] = rows.map((r) => ({ ...r, kind: 'carousel' }));
  const { medians, ranks } = rankOwnKind(inputs, 'carousel');
  const r = ranks.find((x) => x.id === itemId);
  return r ? { medians, winner: r.winner, strongBody: r.strongBody, best: r.best, score: r.score } : null;
}

export async function carouselView(ctx: CarouselCtx) {
  const { pipeline, item, draft } = ctx;
  const rank = item && item.source === 'own' ? await sourceRank(pipeline.userId, item.id) : null;
  const post = pipeline.scheduledPostId
    ? await prisma.scheduledPost.findFirst({
        where: { id: pipeline.scheduledPostId },
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          publishedAt: true,
          errorMsg: true,
          targets: { select: { platform: true, status: true, permalink: true, errorMsg: true } },
        },
      })
    : null;
  return {
    pipeline: {
      id: pipeline.id,
      stage: pipeline.stage,
      title: pipeline.title,
      errorMsg: pipeline.errorMsg,
      carouselDraftId: pipeline.carouselDraftId,
      scheduledPostId: pipeline.scheduledPostId,
    },
    source: item
      ? {
          id: item.id,
          url: item.url,
          owner: item.owner,
          caption: item.caption,
          thumbnailUrl: item.thumbnailUrl,
          slideImages: item.slideImages,
          likes: item.likes,
          comments: item.comments,
          shares: item.shares,
          postedAt: item.postedAt?.toISOString() ?? null,
          ageDays: daysSince(item.postedAt),
          cooldown: inRemixCooldown(item.postedAt),
          oldCodeWord: extractCodeWord(item.caption),
          rank,
        }
      : null,
    draft: draft
      ? {
          id: draft.id,
          status: draft.status,
          style: draft.style,
          slides: (Array.isArray(draft.slides) ? draft.slides : []) as unknown as RemixSlide[],
          sourceImages: draft.sourceImages,
          imageUrls: draft.imageUrls,
          remix: (draft.remix ?? null) as unknown as RemixMeta | null,
          errorMsg: draft.errorMsg,
        }
      : null,
    post: post
      ? { ...post, scheduledAt: post.scheduledAt.toISOString(), publishedAt: post.publishedAt?.toISOString() ?? null }
      : null,
  };
}

export type CarouselView = Awaited<ReturnType<typeof carouselView>>;

/** CarouselDraft.style for a remix: the chosen style id, or a marker for the original look. */
export function draftStyleFor(look: string): string {
  return look !== ORIGINAL_LOOK && isValidStyle(look) ? look : 'remix-original';
}

/**
 * Build (or rebuild) the remix draft from the source carousel. Copies any
 * slide that still points at the Instagram CDN, asks the AI for hooks / code
 * word / caption / order (template fallback without a provider).
 */
export async function createRemix(ctx: CarouselCtx, opts: { userId: string; niche?: string | null }): Promise<
  { ok: true; draft: CarouselDraft; usedAi: boolean; aiError?: string } | CtxError
> {
  const item = ctx.item;
  if (!item || item.kind !== 'carousel') return { error: 'no_source_slides', status: 409 };

  let slides = item.slideImages;
  if (slides.some((u) => !isOurs(u))) {
    slides = await copySlides(opts.userId, item.shortcode, item.url, slides);
    await prisma.parserItem.update({ where: { id: item.id }, data: { slideImages: slides } });
  }
  if (slides.length < 2) return { error: 'no_source_slides', status: 409 };

  const rank = await sourceRank(opts.userId, item.id);
  const sourceKind = sourceKindOf(rank);
  const caption = item.caption ?? '';
  const { ai, sawImages, error } = await generateRemixCopy({
    caption,
    slideImages: slides,
    sourceKind,
    metrics: { likes: item.likes, comments: item.comments, shares: item.shares },
    medians: rank?.medians ?? null,
    ageDays: daysSince(item.postedAt),
    niche: opts.niche,
    oldCodeWord: extractCodeWord(caption),
  });
  const spec = buildRemixSpec({ sourceImages: slides, caption, sourceKind, ai, allowDrop: sawImages });

  const data = {
    parserItemId: item.id,
    slidesCount: spec.slides.length,
    slides: spec.slides as unknown as object,
    style: draftStyleFor(spec.meta.look),
    status: 'draft',
    imageUrls: [] as string[],
    sourceImages: slides,
    remix: spec.meta as unknown as object,
    errorMsg: null,
    completedAt: null,
  };
  const draft = ctx.draft
    ? await prisma.carouselDraft.update({ where: { id: ctx.draft.id }, data })
    : await prisma.carouselDraft.create({ data: { ...data, userId: opts.userId } });

  await prisma.pipeline.update({
    where: { id: ctx.pipeline.id },
    data: { carouselDraftId: draft.id, stage: CAROUSEL_STAGE.remix, errorMsg: null },
  });
  if (item.status === 'new') await prisma.parserItem.update({ where: { id: item.id }, data: { status: 'used' } });
  return { ok: true, draft, usedAi: Boolean(ai), aiError: error };
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetchMedia(url, { signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`source_fetch_failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Render every slide of a remix draft to JPEG and store them in S3
 * (carousels/<userId>/<draftId>/NN.jpg?v=…). Unchanged slides are the
 * originals; cover/CTA are remix-rendered (look=original) or rendered in the
 * chosen carousel style over the original images.
 */
export async function renderRemixDraft(draft: CarouselDraft, opts: { userId: string; handle?: string }): Promise<string[]> {
  const slides = (Array.isArray(draft.slides) ? draft.slides : []) as unknown as RemixSlide[];
  const meta = (draft.remix ?? null) as unknown as RemixMeta | null;
  if (!meta || slides.length < 2) throw new Error('not_a_remix');
  const look = meta.look !== ORIGINAL_LOOK && isValidStyle(meta.look) ? (meta.look as CarouselStyleId) : null;

  const cache = new Map<number, Promise<Buffer>>();
  const srcBytes = (i: number) => {
    if (!cache.has(i)) {
      const url = draft.sourceImages[i];
      cache.set(i, url ? fetchBytes(url) : Promise.reject(new Error(`no source image #${i + 1}`)));
    }
    return cache.get(i)!;
  };

  const version = Date.now();
  const renderOne = async (s: RemixSlide, i: number): Promise<string> => {
    const src = await srcBytes(s.src);
    let out: { body: Buffer; contentType: string };
    if (s.role === 'keep') {
      out = await normalizeKeepSlide(src);
    } else if (!look) {
      out = await renderRemixSlide(s, src, meta.codeWord);
    } else {
      const png = await renderSlide({
        index: i + 1,
        total: slides.length,
        kind: s.role === 'cover' ? 'cover' : 'cta',
        title: s.role === 'cover' ? s.title : `пиши «${normalizeCodeWord(meta.codeWord)}»`,
        body: s.body || (s.role === 'cta' ? 'и получи материал в директ' : ' '),
        style: look,
        // The original cover carries its old text, so a styled cover is set
        // clean in the style (its own background), not over the old cover.
        handle: opts.handle,
      });
      out = { body: await sharp(png).jpeg({ quality: 93 }).toBuffer(), contentType: 'image/jpeg' };
    }
    const key = `carousels/${opts.userId}/${draft.id}/${String(i + 1).padStart(2, '0')}.jpg`;
    const url = await uploadBuffer({ key, body: out.body, contentType: out.contentType, cacheControl: 'public, max-age=2592000' });
    return `${url}?v=${version}`;
  };

  // Up to 3 slides at a time — satori + sharp are CPU-bound.
  const urls: string[] = new Array(slides.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, slides.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= slides.length) return;
        urls[i] = await renderOne(slides[i], i);
      }
    }),
  );
  return urls;
}
