// GET    /api/research/watchlist — авторы в наблюдении
// POST   /api/research/watchlist — добавить { authorId }
// DELETE /api/research/watchlist — удалить { authorId }
//
// Сам фоновый рефреш делает n8n cron (раз в час) или будущий BullMQ-воркер,
// проходящий по authors с (now - lastRefreshAt) > refreshInterval часов.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const bodySchema = z.object({
  authorId: z.string().min(1),
  refreshInterval: z.number().int().min(1).max(168).optional(),
});

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const items = await prisma.researchWatchlist.findMany({
    where: { userId: ctx.user.id },
    orderBy: { addedAt: 'desc' },
    include: { author: true },
  });
  return NextResponse.json({ ok: true, watchlist: items });
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
  // Убедимся, что автор существует
  const author = await prisma.researchAuthor.findUnique({ where: { id: body.authorId } });
  if (!author) return NextResponse.json({ error: 'author_not_found' }, { status: 404 });

  const item = await prisma.researchWatchlist.upsert({
    where: { userId_authorId: { userId: ctx.user.id, authorId: body.authorId } },
    create: {
      userId: ctx.user.id,
      authorId: body.authorId,
      refreshInterval: body.refreshInterval ?? 24,
    },
    update: body.refreshInterval ? { refreshInterval: body.refreshInterval } : {},
  });
  return NextResponse.json({ ok: true, item });
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
  await prisma.researchWatchlist
    .delete({
      where: { userId_authorId: { userId: ctx.user.id, authorId: body.authorId } },
    })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
