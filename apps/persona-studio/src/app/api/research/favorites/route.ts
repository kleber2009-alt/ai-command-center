// GET    /api/research/favorites — список избранного юзера (опционально filter by itemType)
// POST   /api/research/favorites — добавить в избранное (itemType + itemId)
// DELETE /api/research/favorites — убрать (тот же body)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const ItemType = z.enum(['reel', 'author', 'hook']);
const bodySchema = z.object({
  itemType: ItemType,
  itemId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const url = new URL(req.url);
  const itemType = url.searchParams.get('itemType');
  const where: Record<string, unknown> = { userId: ctx.user.id };
  if (itemType) where.itemType = itemType;

  const favorites = await prisma.researchFavorite.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      reel: {
        include: { author: true },
      },
    },
  });
  return NextResponse.json({ ok: true, favorites });
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }

  // Мягкая привязка reelId для include-запросов
  const reelId = body.itemType === 'reel' ? body.itemId : null;

  const fav = await prisma.researchFavorite.upsert({
    where: {
      userId_itemType_itemId: {
        userId: ctx.user.id,
        itemType: body.itemType,
        itemId: body.itemId,
      },
    },
    create: {
      userId: ctx.user.id,
      itemType: body.itemType,
      itemId: body.itemId,
      reelId,
    },
    update: {},
  });
  return NextResponse.json({ ok: true, favorite: fav });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }
  await prisma.researchFavorite
    .delete({
      where: {
        userId_itemType_itemId: {
          userId: ctx.user.id,
          itemType: body.itemType,
          itemId: body.itemId,
        },
      },
    })
    .catch(() => {}); // idempotent

  return NextResponse.json({ ok: true });
}
