// GET /api/parser/runs — список завершённых прогонов парсера (история поиска).
// Лёгкий: только мета прогонов (без items). Используется секцией «История
// поиска» на /parser. Самый свежий прогон = текущая выдача, всё остальное —
// история. Параметр ?limit (1..100, по умолчанию 30).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const limitParam = Number(req.nextUrl.searchParams.get('limit'));
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 30, 1), 100);

  const runs = await prisma.parserRun.findMany({
    where: { userId: ctx.user.id, status: 'completed' },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ runs });
}
