// GET    /api/research/folders        — список папок юзера (опц filter by type)
// POST   /api/research/folders        — { name, type } → создать папку

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const FolderType = z.enum(['bloggers', 'videos', 'ideas']);
const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: FolderType,
});

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const where: Record<string, unknown> = { userId: ctx.user.id };
  if (type) where.type = type;

  const folders = await prisma.researchFolder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { items: true } } },
  });
  return NextResponse.json({ ok: true, folders });
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }
  const folder = await prisma.researchFolder.create({
    data: { userId: ctx.user.id, name: body.name, type: body.type },
  });
  return NextResponse.json({ ok: true, folder });
}
