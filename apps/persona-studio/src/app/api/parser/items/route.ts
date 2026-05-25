// GET /api/parser/items — последний run пользователя + его items.
// PATCH /api/parser/items?id=<id> — сменить status (dismissed | new).
//
// «used» status выставляется автоматически API-роутом /api/videos когда
// видео запускается из ParserItem.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const lastRun = await prisma.parserRun.findFirst({
    where: { userId: ctx.user.id, status: 'completed' },
    orderBy: { startedAt: 'desc' },
  });

  if (!lastRun) {
    return NextResponse.json({ run: null, items: [] });
  }

  const items = await prisma.parserItem.findMany({
    where: { runId: lastRun.id, status: { not: 'dismissed' } },
    orderBy: [{ fitScore: 'desc' }, { velocityScore: 'desc' }],
  });

  return NextResponse.json({ run: lastRun, items });
}

const PatchBody = z.object({
  status: z.enum(['new', 'used', 'dismissed']),
});

export async function PATCH(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }

  const item = await prisma.parserItem.findFirst({
    where: { id, userId: ctx.user.id },
  });
  if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const updated = await prisma.parserItem.update({
    where: { id },
    data: { status: parsed.data.status },
  });

  return NextResponse.json({ item: updated });
}
