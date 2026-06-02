// POST   /api/research/folders/:id/items — добавить { itemType, itemId, note? }
// DELETE /api/research/folders/:id/items — убрать { itemType, itemId }
//
// Каждый folder.type ограничивает разрешённые itemType:
//   bloggers → author; videos → reel; ideas → idea

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const ItemType = z.enum(['author', 'reel', 'idea']);
const bodySchema = z.object({
  itemType: ItemType,
  itemId: z.string().min(1),
  note: z.string().max(2000).optional(),
});

const ALLOWED: Record<string, z.infer<typeof ItemType>> = {
  bloggers: 'author',
  videos: 'reel',
  ideas: 'idea',
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const folder = await prisma.researchFolder.findFirst({
    where: { id, userId: ctx.user.id },
  });
  if (!folder) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }
  const expected = ALLOWED[folder.type];
  if (expected && body.itemType !== expected) {
    return NextResponse.json(
      { error: 'wrong_item_type', message: `Папка типа '${folder.type}' принимает только '${expected}'` },
      { status: 422 },
    );
  }

  const item = await prisma.researchFolderItem.upsert({
    where: {
      folderId_itemType_itemId: {
        folderId: folder.id,
        itemType: body.itemType,
        itemId: body.itemId,
      },
    },
    create: {
      folderId: folder.id,
      itemType: body.itemType,
      itemId: body.itemId,
      note: body.note || null,
    },
    update: body.note !== undefined ? { note: body.note } : {},
  });
  return NextResponse.json({ ok: true, item });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const folder = await prisma.researchFolder.findFirst({
    where: { id, userId: ctx.user.id },
  });
  if (!folder) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let body: { itemType: string; itemId: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  await prisma.researchFolderItem
    .delete({
      where: {
        folderId_itemType_itemId: {
          folderId: folder.id,
          itemType: body.itemType,
          itemId: body.itemId,
        },
      },
    })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
