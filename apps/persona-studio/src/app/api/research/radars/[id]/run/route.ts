// POST /api/research/radars/:id/run — ручной запуск радара. Тот же
// пайплайн что и в /api/research/search, но через lib/research/run-radar.ts.
// Cron'у этот эндпоинт не нужен — он зовёт runRadar() напрямую.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runRadar } from '@/lib/research/run-radar';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const radar = await prisma.researchRadar.findFirst({
    where: { id, userId: ctx.user.id },
  });
  if (!radar) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const result = await runRadar(radar.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}
