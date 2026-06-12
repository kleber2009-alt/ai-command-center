// GET /api/parser/runs/[id] — конкретный прогон парсера + его items (не
// dismissed). Используется при раскрытии записи в «Истории поиска»: items
// подгружаются лениво, только когда юзер открывает прошлый прогон.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const run = await prisma.parserRun.findFirst({
    where: { id, userId: auth.user.id },
  });
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const items = await prisma.parserItem.findMany({
    where: { runId: run.id, status: { not: 'dismissed' } },
    orderBy: [{ fitScore: 'desc' }, { velocityScore: 'desc' }],
  });

  return NextResponse.json({ run, items });
}
