// GET    /api/research/folders/:id   — папка + items + развёрнутые сущности
// PATCH  /api/research/folders/:id   — переименовать
// DELETE /api/research/folders/:id   — удалить (каскад items)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

async function loadFolder(userId: string, id: string) {
  return prisma.researchFolder.findFirst({ where: { id, userId } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const folder = await loadFolder(ctx.user.id, id);
  if (!folder) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const items = await prisma.researchFolderItem.findMany({
    where: { folderId: folder.id },
    orderBy: { createdAt: 'desc' },
  });

  // Раскрываем привязанные сущности батчами по типу
  const reelIds = items.filter((i) => i.itemType === 'reel').map((i) => i.itemId);
  const authorIds = items.filter((i) => i.itemType === 'author').map((i) => i.itemId);

  const [reels, authors] = await Promise.all([
    reelIds.length
      ? prisma.researchReel.findMany({ where: { id: { in: reelIds } }, include: { author: true } })
      : Promise.resolve([]),
    authorIds.length
      ? prisma.researchAuthor.findMany({ where: { id: { in: authorIds } } })
      : Promise.resolve([]),
  ]);

  const reelMap = new Map(reels.map((r) => [r.id, r]));
  const authorMap = new Map(authors.map((a) => [a.id, a]));

  return NextResponse.json({
    ok: true,
    folder,
    items: items.map((it) => ({
      ...it,
      reel: it.itemType === 'reel' ? reelMap.get(it.itemId) || null : null,
      author: it.itemType === 'author' ? authorMap.get(it.itemId) || null : null,
    })),
  });
}

const patchSchema = z.object({ name: z.string().min(1).max(100) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const folder = await loadFolder(ctx.user.id, id);
  if (!folder) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }
  const updated = await prisma.researchFolder.update({
    where: { id: folder.id },
    data: { name: body.name },
  });
  return NextResponse.json({ ok: true, folder: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const folder = await loadFolder(ctx.user.id, id);
  if (!folder) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await prisma.researchFolder.delete({ where: { id: folder.id } });
  return NextResponse.json({ ok: true });
}
