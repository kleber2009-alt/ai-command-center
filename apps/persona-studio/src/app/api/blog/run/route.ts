// POST /api/blog/run — «Мой блог»: scrape the owner's OWN Instagram account,
// keep reels + carousels as ParserItem(source='own'), copy media into our S3,
// rank against the owner's own medians.
//
// Body: { handle?: string, days?: number = 90, limit?: number = 60 }
//   handle → saved as ParserConfig.ownHandle (falls back to the saved one, then
//   the connected Instagram account name).
//
// Items are upserted per (userId, url): a re-run refreshes metrics and media
// without changing ids, so pipelines that point at a ParserItem keep working.
// Costs COSTS.researchRefreshAuthor (same Apify scrape as «обновить автора»),
// refunded when the scrape fails.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isApifyConfigured } from '@/lib/parser/apify';
import { guardedScrapeAccount } from '@/lib/research/apify-budget';
import { classify } from '@/lib/parser/scoring';
import type { ScoredPost } from '@/lib/parser/types';
import { chargeTokens, refundTokens, COSTS, InsufficientTokensError } from '@/lib/tokens';
import { apifyErrorText, rankOwnKind, type OwnPostInput } from '@/lib/blog/rank';
import { normalizeHandle } from '@/lib/blog/items';
import { copySlides, copyToS3, isOurs, mapLimit, postKeyBase } from '@/lib/blog/media';

export const runtime = 'nodejs';
export const maxDuration = 300;

const Body = z.object({
  handle: z.string().max(200).optional(),
  days: z.number().int().min(7).max(365).default(90),
  limit: z.number().int().min(5).max(200).default(60),
});

/** How many top reels get their mp4 copied right away (the rest lazily). */
const TOP_REELS_WITH_VIDEO = 3;

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const { days, limit } = parsed.data;

  const cfg = await prisma.parserConfig.findUnique({ where: { userId: user.id }, select: { ownHandle: true } });
  let handle = normalizeHandle(parsed.data.handle);
  if (parsed.data.handle && !handle) {
    return NextResponse.json({ error: 'bad_handle', message: 'Ник Instagram выглядит неверно — латиница, цифры, точка и _.' }, { status: 400 });
  }
  if (!handle) handle = normalizeHandle(cfg?.ownHandle);
  if (!handle) {
    const ig = await prisma.socialAccount.findFirst({
      where: { userId: user.id, platform: 'instagram' },
      select: { displayName: true },
      orderBy: { createdAt: 'asc' },
    });
    handle = normalizeHandle(ig?.displayName);
  }
  if (!handle) {
    return NextResponse.json({ error: 'no_handle', message: 'Укажите ник своего Instagram.' }, { status: 409 });
  }

  await prisma.parserConfig.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ownHandle: handle },
    update: { ownHandle: handle },
  });

  if (!isApifyConfigured()) {
    return NextResponse.json(
      { error: 'apify_not_configured', message: apifyErrorText('APIFY_TOKEN missing') },
      { status: 503 },
    );
  }

  const cost = COSTS.researchRefreshAuthor;
  try {
    await chargeTokens({ userId: user.id, amount: cost, reason: 'blog_refresh', refId: handle });
  } catch (e) {
    if (e instanceof InsufficientTokensError) {
      return NextResponse.json({ error: 'insufficient_tokens', have: e.have, need: e.need }, { status: 402 });
    }
    throw e;
  }

  const run = await prisma.parserRun.create({
    data: { userId: user.id, status: 'processing', source: 'own' },
  });

  const fail = async (status: number, error: string, message: string, raw?: string) => {
    await refundTokens({ userId: user.id, amount: cost, reason: 'blog_refresh:failed', refId: run.id });
    await prisma.parserRun.update({
      where: { id: run.id },
      data: { status: 'failed', errorMsg: message.slice(0, 1000), completedAt: new Date() },
    });
    if (raw) console.warn('[api/blog/run]', error, raw.slice(0, 300));
    return NextResponse.json({ error, message, runId: run.id }, { status });
  };

  try {
    const scraped = await guardedScrapeAccount(handle, { days, limit });
    if (!scraped.ok) return await fail(502, 'apify_failed', apifyErrorText(scraped.error), scraped.error);

    const cls = classify(scraped.items);
    // Profile scrapes can include collab posts owned by someone else.
    const mine = (p: ScoredPost) => !p.owner || p.owner.toLowerCase() === handle;
    const posts = [...cls.reels, ...cls.carousels].filter(mine);
    if (posts.length === 0) {
      return await fail(
        404,
        'no_posts',
        `За ${days} дней у @${handle} не нашлось рилсов и каруселей — увеличьте период или проверьте ник.`,
      );
    }

    // Rank this batch against its own medians (stored as velocityScore; the
    // UI re-ranks over all stored posts in loadBlogState).
    const inputs: OwnPostInput[] = posts.map((p) => ({
      id: p.url,
      kind: p.kind as 'reel' | 'carousel',
      plays: p.plays,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      postedAt: p.postedAtMs ? new Date(p.postedAtMs) : null,
    }));
    const reelRank = rankOwnKind(inputs, 'reel').ranks;
    const carRank = rankOwnKind(inputs, 'carousel').ranks;
    const scoreByUrl = new Map([...reelRank, ...carRank].map((r) => [r.id, r.score]));
    const topReelUrls = new Set(reelRank.slice(0, TOP_REELS_WITH_VIDEO).map((r) => r.id));

    const existing = await prisma.parserItem.findMany({
      where: { userId: user.id, source: 'own', url: { in: posts.map((p) => p.url) } },
      select: { id: true, url: true, thumbnailUrl: true, slideImages: true, videoUrl: true },
    });
    const byUrl = new Map(existing.map((e) => [e.url, e]));

    let copyMisses = 0;
    const saved = await mapLimit(posts, 3, async (p) => {
      const prev = byUrl.get(p.url);
      const base = postKeyBase(user.id, p.shortcode, p.url);

      // Slides: re-use our copies when the count did not change.
      let slideImages: string[] = [];
      if (p.kind === 'carousel') {
        const prevOk =
          prev && prev.slideImages.length === p.slideImages.length && prev.slideImages.every((u) => isOurs(u));
        slideImages = prevOk ? prev!.slideImages : await copySlides(user.id, p.shortcode, p.url, p.slideImages);
        copyMisses += slideImages.filter((u) => !isOurs(u)).length;
      }

      // Thumbnail: the carousel cover is slide 1; reels get their poster copied.
      let thumbnailUrl: string | null = prev?.thumbnailUrl && isOurs(prev.thumbnailUrl) ? prev.thumbnailUrl : null;
      if (!thumbnailUrl) {
        if (p.kind === 'carousel' && slideImages[0] && isOurs(slideImages[0])) thumbnailUrl = slideImages[0];
        else if (p.thumbnailUrl) {
          thumbnailUrl = (await copyToS3({ url: p.thumbnailUrl, keyBase: `${base}/thumb`, kind: 'image' })) ?? p.thumbnailUrl;
        }
      }

      // Reel mp4: keep our copy; copy now only for the top reels.
      let videoUrl: string | null = prev?.videoUrl && isOurs(prev.videoUrl) ? prev.videoUrl : p.videoUrl;
      if (p.kind === 'reel' && p.videoUrl && !isOurs(videoUrl) && topReelUrls.has(p.url)) {
        videoUrl = (await copyToS3({ url: p.videoUrl, keyBase: `${base}/video`, kind: 'video' })) ?? p.videoUrl;
      }

      const data = {
        runId: run.id,
        shortcode: p.shortcode,
        kind: p.kind,
        owner: p.owner ?? handle,
        thumbnailUrl,
        caption: p.fullCaption || p.caption || null,
        plays: p.plays,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        durationSec: p.durationSec,
        videoUrl,
        slideImages,
        ageHours: p.ageHours,
        postedAt: p.postedAtMs ? new Date(p.postedAtMs) : null,
        velocityScore: scoreByUrl.get(p.url) ?? 0,
      };
      if (prev) {
        return prisma.parserItem.update({ where: { id: prev.id }, data });
      }
      return prisma.parserItem.create({
        data: { ...data, userId: user.id, url: p.url, source: 'own', status: 'new' },
      });
    });

    const reels = saved.filter((s) => s.kind === 'reel').length;
    const carousels = saved.filter((s) => s.kind === 'carousel').length;
    const note = copyMisses > 0 ? `Не скопировано слайдов: ${copyMisses} (ссылки Instagram, могут устареть).` : null;

    await prisma.parserRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        postsScanned: scraped.items.length,
        reelsFound: reels,
        carouselsFound: carousels,
        errorMsg: note,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      runId: run.id,
      handle,
      postsScanned: scraped.items.length,
      reels,
      carousels,
      note,
    });
  } catch (e) {
    console.error('[api/blog/run] failed', e);
    return await fail(500, 'blog_run_failed', 'Не удалось обновить блог — попробуйте ещё раз.', String(e));
  }
}
