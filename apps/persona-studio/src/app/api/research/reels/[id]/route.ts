// GET /api/research/reels/:id — детали ролика для страницы-разбора.
// Возвращает рилс + автора + transcripts[] + analyses[] (последний +
// все предыдущие для истории), favorite-флаг текущего юзера.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const reel = await prisma.researchReel.findUnique({
    where: { id },
    include: {
      author: true,
      transcripts: { orderBy: { createdAt: 'desc' }, take: 1 },
      analyses: {
        where: { userId: ctx.user.id },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!reel) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const favorite = await prisma.researchFavorite.findUnique({
    where: {
      userId_itemType_itemId: { userId: ctx.user.id, itemType: 'reel', itemId: reel.id },
    },
  });

  return NextResponse.json({
    ok: true,
    reel: {
      ...reel,
      isFavorite: Boolean(favorite),
    },
  });
}
