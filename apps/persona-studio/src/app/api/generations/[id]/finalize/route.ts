// POST /api/generations/:id/finalize — финал без монтажа: готовое видео
// становится итоговым ассетом (finalUrl), стадия → done.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { GENERATION_INCLUDE, serializeGeneration } from '@/lib/studio/brief';
import { finalizeWithoutMontage } from '@/lib/studio/produce';
import { produceErrorStatus } from '../produce/route';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const result = await finalizeWithoutMontage({ userId: ctx.user.id, generationId: id });
  if (!result.ok) {
    return NextResponse.json({ error: result.error.code, detail: result.error }, { status: produceErrorStatus(result.error) });
  }

  const gen = await prisma.generation.findUnique({ where: { id }, include: GENERATION_INCLUDE });
  return NextResponse.json({ ok: true, generation: gen ? serializeGeneration(gen) : null });
}
