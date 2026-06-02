// GET /api/research/authors/:id — профиль автора + последние рилсы +
// существующий page-analysis для текущего юзера, watchlist-флаг.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const author = await prisma.researchAuthor.findUnique({
    where: { id },
    include: {
      reels: {
        orderBy: { postedAt: 'desc' },
        take: 30,
      },
      pageAnalyses: {
        where: { userId: ctx.user.id },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!author) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const watching = await prisma.researchWatchlist.findUnique({
    where: { userId_authorId: { userId: ctx.user.id, authorId: author.id } },
  });

  return NextResponse.json({
    ok: true,
    author: { ...author, isWatching: Boolean(watching) },
  });
}
