// Индексация автора: получаем его последние N рилсов через Apify,
// считаем медиану и средний ER, апсёртим ResearchAuthor и
// ResearchReel'ы. Эта функция — критическая часть Этапа 1, потому что
// без медианы автора виральность не считается.
//
// Вызывается:
//   - синхронно из POST /api/research/search для каждого нового автора
//     в выдаче (см. usage в search/route.ts)
//   - позже, из BullMQ-воркера для watchlist-рефреша по cron
//
// Стратегия кэша: если у автора lastIndexedAt свежий (см. AUTHOR_TTL_HOURS),
// не дёргаем Apify повторно. TTL зависит от размера аудитории — крупные
// аккаунты обновляются чаще, у мелких медиана стабильна.

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { guardedScrapeAccount, guardedScrapeDetails } from './apify-budget';
import { classify } from '@/lib/parser/scoring';
import type { ScoredPost } from '@/lib/parser/types';
import {
  computeAuthorMedian,
  computeAuthorEngagementAvg,
  computeReelMetrics,
  type ScoreInput,
  computeViralScores,
} from './metrics';
import { captionHash } from './dedupe';

const DEFAULT_MEDIAN_WINDOW = 30;          // ТЗ §15 default
const APIFY_LOOKBACK_DAYS = 180;            // широкое окно чтобы набрать N рилсов
const TTL_HOURS_LARGE = 24;                 // >100k follow → раз в сутки
const TTL_HOURS_MEDIUM = 24 * 3;            // 10k-100k → 3 дня
const TTL_HOURS_SMALL = 24 * 7;             // <10k → неделя

function ttlHoursFor(followers: number | null): number {
  if (!followers) return TTL_HOURS_SMALL;
  if (followers >= 100_000) return TTL_HOURS_LARGE;
  if (followers >= 10_000) return TTL_HOURS_MEDIUM;
  return TTL_HOURS_SMALL;
}

function isFresh(lastIndexedAt: Date | null | undefined, followers: number | null): boolean {
  if (!lastIndexedAt) return false;
  const ttlMs = ttlHoursFor(followers) * 3_600_000;
  return Date.now() - lastIndexedAt.getTime() < ttlMs;
}

export type IndexAuthorResult = {
  authorId: string;
  username: string;
  fromCache: boolean;
  medianViews: number | null;
  followers: number | null;
  reelCount: number;
  error?: string;
};

/**
 * Главная функция индексации. Идемпотентна — повторный вызов в течение
 * TTL возвращает закэшированного автора без скрейпа.
 *
 * @param username — без @
 * @param opts.force — игнорировать TTL и перескрейпить (для «Обновить статистику»)
 * @param opts.medianWindow — N для медианы (по умолчанию 30)
 */
export async function indexAuthor(
  username: string,
  opts: { force?: boolean; medianWindow?: number } = {},
): Promise<IndexAuthorResult> {
  const handle = username.replace(/^@/, '').trim().toLowerCase();
  if (!handle) {
    return {
      authorId: '',
      username: '',
      fromCache: false,
      medianViews: null,
      followers: null,
      reelCount: 0,
      error: 'empty_username',
    };
  }

  const medianWindow = opts.medianWindow || DEFAULT_MEDIAN_WINDOW;

  const existing = await prisma.researchAuthor.findUnique({
    where: { platform_username: { platform: 'instagram', username: handle } },
  });

  if (!opts.force && existing && isFresh(existing.lastIndexedAt, existing.followers)) {
    return {
      authorId: existing.id,
      username: handle,
      fromCache: true,
      medianViews: existing.medianViews,
      followers: existing.followers,
      reelCount: 0,
    };
  }

  // Скрейп: достаём последние рилсы. Apify-actor отдаёт и followers/owner
  // в каждом item-е, и сам список рилсов. Берём оттуда и то и другое.
  const scraped = await guardedScrapeAccount(handle, {
    days: APIFY_LOOKBACK_DAYS,
    limit: medianWindow,
  });

  if (!scraped.ok) {
    // Не валим всю функцию — если автор уже есть в БД, отдаём что есть
    if (existing) {
      return {
        authorId: existing.id,
        username: handle,
        fromCache: true,
        medianViews: existing.medianViews,
        followers: existing.followers,
        reelCount: 0,
        error: scraped.error,
      };
    }
    // Создаём пустую запись, чтобы повторный поиск не пытался скрейпить мгновенно
    const stub = await prisma.researchAuthor.upsert({
      where: { platform_username: { platform: 'instagram', username: handle } },
      create: {
        platform: 'instagram',
        username: handle,
        lowConfidence: true,
        lastIndexedAt: new Date(),
      },
      update: { lastIndexedAt: new Date() },
    });
    return {
      authorId: stub.id,
      username: handle,
      fromCache: false,
      medianViews: null,
      followers: null,
      reelCount: 0,
      error: scraped.error,
    };
  }

  // Apify items → классификация → берём reels
  const cls = classify(scraped.items);
  const reels: ScoredPost[] = cls.reels;

  // Профиль аккаунта: followers / postsCount / avatar лежат ТОЛЬКО в
  // resultsType:'details' — обычный скрейп рилсов ('posts') их не несёт.
  // Поэтому делаем отдельный дешёвый details-вызов. Best-effort: если он
  // не удался, падаем на (как правило пустые) поля из items.
  const details = await guardedScrapeDetails(handle);
  const profile = details.ok ? details.profile : null;
  const profileExternalId =
    profile && (typeof profile.id === 'string' || typeof profile.id === 'number')
      ? String(profile.id)
      : null;

  // Followers — у разных версий actor'а лежит в разных полях. Сначала из
  // профиля (details), затем пробегаемся по items как fallback.
  const followersFromItems = (() => {
    if (typeof profile?.followersCount === 'number' && profile.followersCount > 0) {
      return profile.followersCount;
    }
    for (const it of scraped.items) {
      const f =
        (it as Record<string, unknown>).ownerFollowersCount ||
        (it as Record<string, unknown>).followersCount ||
        ((it as { owner?: { followersCount?: number } }).owner?.followersCount);
      if (typeof f === 'number' && f > 0) return f;
    }
    return null;
  })();

  const postsCountFromItems = (() => {
    if (typeof profile?.postsCount === 'number' && profile.postsCount > 0) {
      return profile.postsCount;
    }
    for (const it of scraped.items) {
      const p =
        (it as Record<string, unknown>).ownerPostsCount ||
        (it as Record<string, unknown>).postsCount ||
        ((it as { owner?: { postsCount?: number } }).owner?.postsCount);
      if (typeof p === 'number' && p > 0) return p;
    }
    return null;
  })();

  const avatarUrl = (() => {
    const fromProfile = profile?.profilePicUrlHD || profile?.profilePicUrl;
    if (typeof fromProfile === 'string' && fromProfile.length > 0) return fromProfile;
    for (const it of scraped.items) {
      const a =
        (it as Record<string, unknown>).ownerProfilePicUrl ||
        ((it as { owner?: { profile_pic_url?: string } }).owner?.profile_pic_url);
      if (typeof a === 'string' && a.length > 0) return a;
    }
    return null;
  })();

  const reelViews = reels.map((r) => r.plays || 0);
  const medianStats = computeAuthorMedian(reelViews);
  const erAvg = computeAuthorEngagementAvg(
    reels.map((r) => ({ views: r.plays, likes: r.likes, comments: r.comments })),
  );

  const author = await prisma.researchAuthor.upsert({
    where: { platform_username: { platform: 'instagram', username: handle } },
    create: {
      platform: 'instagram',
      username: handle,
      externalId: profileExternalId,
      followers: followersFromItems,
      postsCount: postsCountFromItems,
      avatarUrl,
      profileUrl: `https://www.instagram.com/${handle}/`,
      rawStats: profile ? (profile as Prisma.InputJsonValue) : undefined,
      medianViews: medianStats.median,
      medianWindow: medianStats.windowUsed || medianWindow,
      engagementAvg: erAvg,
      lowConfidence: medianStats.lowConfidence,
      lastIndexedAt: new Date(),
    },
    update: {
      externalId: profileExternalId ?? existing?.externalId ?? null,
      followers: followersFromItems ?? existing?.followers ?? null,
      postsCount: postsCountFromItems ?? existing?.postsCount ?? null,
      avatarUrl: avatarUrl ?? existing?.avatarUrl ?? null,
      profileUrl: `https://www.instagram.com/${handle}/`,
      ...(profile ? { rawStats: profile as Prisma.InputJsonValue } : {}),
      medianViews: medianStats.median,
      medianWindow: medianStats.windowUsed || medianWindow,
      engagementAvg: erAvg,
      lowConfidence: medianStats.lowConfidence,
      lastIndexedAt: new Date(),
    },
  });

  // Сохраняем сами рилсы автора с уже посчитанными per-reel метриками.
  // Используем upsert по (platform, externalId) — следующая индексация
  // того же автора обновит просмотры/лайки. viralScore пересчитываем
  // здесь же относительно только-что-индексированного корпуса автора.
  if (reels.length > 0) {
    const metricsInputs: ScoreInput[] = reels.map((r) => {
      const m = computeReelMetrics({
        views: r.plays,
        likes: r.likes,
        comments: r.comments,
        postedAtMs: r.postedAtMs,
        authorMedianViews: medianStats.median,
        authorFollowers: followersFromItems,
      });
      return {
        reach: m.reach,
        engagementRate: m.engagementRate,
        velocity: m.velocity,
        virality: m.virality,
      };
    });
    const viralScores = computeViralScores(metricsInputs);

    await Promise.all(
      reels.map(async (r, idx) => {
        if (!r.shortcode) return;
        const m = computeReelMetrics({
          views: r.plays,
          likes: r.likes,
          comments: r.comments,
          postedAtMs: r.postedAtMs,
          authorMedianViews: medianStats.median,
          authorFollowers: followersFromItems,
        });
        await prisma.researchReel.upsert({
          where: { platform_externalId: { platform: 'instagram', externalId: r.shortcode } },
          create: {
            platform: 'instagram',
            externalId: r.shortcode,
            authorId: author.id,
            url: r.url,
            thumbnailUrl: r.thumbnailUrl,
            caption: r.caption || null,
            captionHash: captionHash(r.caption || ''),
            postedAt: r.postedAtMs ? new Date(r.postedAtMs) : null,
            views: r.plays,
            likes: r.likes,
            comments: r.comments,
            shares: r.shares,
            durationSec: r.durationSec,
            postType: 'reel',
            virality: m.virality,
            engagementRate: m.engagementRate,
            velocity: m.velocity,
            viralScore: viralScores[idx],
            reach: m.reach,
          },
          update: {
            url: r.url,
            thumbnailUrl: r.thumbnailUrl,
            caption: r.caption || null,
            captionHash: captionHash(r.caption || ''),
            views: r.plays,
            likes: r.likes,
            comments: r.comments,
            shares: r.shares,
            durationSec: r.durationSec,
            virality: m.virality,
            engagementRate: m.engagementRate,
            velocity: m.velocity,
            viralScore: viralScores[idx],
            reach: m.reach,
          },
        });
      }),
    );
  }

  return {
    authorId: author.id,
    username: handle,
    fromCache: false,
    medianViews: medianStats.median,
    followers: followersFromItems,
    reelCount: reels.length,
  };
}
