// GET    /api/briefs/:id — бриф + его генерации
// DELETE /api/briefs/:id — удалить бриф (не пока по нему идёт генерация)

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { BRIEF_INCLUDE, serializeBrief } from '@/lib/studio/brief';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const brief = await prisma.brief.findFirst({
    where: { id, userId: ctx.user.id },
    include: BRIEF_INCLUDE,
  });
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, brief: serializeBrief(brief) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const brief = await prisma.brief.findFirst({ where: { id, userId: ctx.user.id }, select: { id: true } });
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // A running pipeline still writes into its Generation row — don't pull it out
  // from under the worker. Finished/failed runs cascade away with the brief.
  const running = await prisma.generation.count({
    where: { briefId: id, status: { in: ['pending', 'processing'] }, stage: { notIn: ['done', 'error'] } },
  });
  if (running > 0) {
    return NextResponse.json(
      { error: 'generation_running', message: 'Дождитесь окончания генерации, потом удалите бриф.' },
      { status: 409 },
    );
  }
  await prisma.brief.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
