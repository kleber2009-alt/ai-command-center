// GET  /api/research/authors — каталог блогеров для страницы «Блогеры».
//   Отдаёт всех проиндексированных авторов с пометкой isWatching (папка
//   «Шпион» = watchlist текущего юзера) и folderIds (членство в папках типа
//   bloggers). Фильтрация/сортировка/пагинация делаются на клиенте, как в
//   исходном spy_bloggers — здесь мы просто отдаём аннотированный список.
//
// POST /api/research/authors — добавить блогера по username → indexAuthor
//   (первичный парс + медиана + рилсы с метриками). Списывает кредиты как
//   за refresh автора (тот же скрейп). Идемпотентно: повтор в пределах TTL
//   вернёт закэшированного автора без повторного списания скрейпа.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, COSTS, InsufficientTokensError } from '@/lib/tokens';
import { indexAuthor } from '@/lib/research/index-author';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const [authors, watchlist, folderItems] = await Promise.all([
    prisma.researchAuthor.findMany({
      orderBy: { followers: 'desc' },
      take: 500,
      select: {
        id: true,
        platform: true,
        username: true,
        followers: true,
        postsCount: true,
        avatarUrl: true,
        categories: true,
        medianViews: true,
        engagementAvg: true,
        lowConfidence: true,
        lastIndexedAt: true,
      },
    }),
    prisma.researchWatchlist.findMany({
      where: { userId: ctx.user.id },
      select: { authorId: true, refreshInterval: true, lastRefreshAt: true },
    }),
    // Членство авторов в bloggers-папках текущего юзера.
    prisma.researchFolderItem.findMany({
      where: { itemType: 'author', folder: { userId: ctx.user.id, type: 'bloggers' } },
      select: { itemId: true, folderId: true },
    }),
  ]);

  const watchMap = new Map(watchlist.map((w) => [w.authorId, w]));
  const folderMap = new Map<string, string[]>();
  for (const fi of folderItems) {
    const arr = folderMap.get(fi.itemId) ?? [];
    arr.push(fi.folderId);
    folderMap.set(fi.itemId, arr);
  }

  const rows = authors.map((a) => {
    const watch = watchMap.get(a.id);
    return {
      id: a.id,
      platform: a.platform,
      username: a.username,
      niche: a.categories[0] ?? null,
      followers: a.followers ?? 0,
      postsCount: a.postsCount ?? 0,
      medianViews: a.medianViews ?? 0,
      engagementAvg: a.engagementAvg ?? 0,
      avatarUrl: a.avatarUrl ?? '',
      lowConfidence: a.lowConfidence,
      lastIndexedAt: a.lastIndexedAt?.toISOString() ?? null,
      isWatching: Boolean(watch),
      refreshInterval: watch?.refreshInterval ?? null,
      folderIds: folderMap.get(a.id) ?? [],
    };
  });

  return NextResponse.json({ ok: true, authors: rows });
}

const addSchema = z.object({
  username: z.string().min(1).max(100),
  platform: z.enum(['instagram', 'tiktok', 'youtube']).optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let body: z.infer<typeof addSchema>;
  try {
    body = addSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }

  const handle = body.username.replace(/^@/, '').trim().toLowerCase();
  if (!handle) return NextResponse.json({ error: 'empty_username' }, { status: 400 });

  // Если автор уже проиндексирован и свежий — indexAuthor вернёт его из кэша,
  // и мы не списываем кредиты за скрейп.
  const existing = await prisma.researchAuthor.findUnique({
    where: { platform_username: { platform: 'instagram', username: handle } },
  });

  const cost = COSTS.researchRefreshAuthor;
  let charged = false;
  if (!existing) {
    try {
      await chargeTokens({
        userId: ctx.user.id,
        amount: cost,
        reason: 'research_add_author',
        refId: handle,
      });
      charged = true;
    } catch (e) {
      if (e instanceof InsufficientTokensError) {
        return NextResponse.json(
          { error: 'insufficient_tokens', have: e.have, need: e.need },
          { status: 402 },
        );
      }
      throw e;
    }
  }

  try {
    const result = await indexAuthor(handle);
    if (result.error && result.reelCount === 0 && !result.authorId) {
      if (charged) {
        await refundTokens({
          userId: ctx.user.id,
          amount: cost,
          reason: 'research_add_author_failed',
          refId: handle,
        });
      }
      return NextResponse.json(
        { error: 'index_failed', message: result.error },
        { status: 502 },
      );
    }
    const author = await prisma.researchAuthor.findUnique({ where: { id: result.authorId } });
    return NextResponse.json({ ok: true, author, fromCache: result.fromCache });
  } catch (e) {
    if (charged) {
      await refundTokens({
        userId: ctx.user.id,
        amount: cost,
        reason: 'research_add_author_error',
        refId: handle,
      });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'index_error', message: msg }, { status: 500 });
  }
}
