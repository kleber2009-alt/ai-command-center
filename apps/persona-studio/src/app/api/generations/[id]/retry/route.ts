// POST /api/generations/:id/retry — вернуть упавшую генерацию на стадию
// «сценарий», чтобы заново запустить видео. Сценарий и gate сохраняются,
// токены не списываются (видео спишет свою цену при новом запуске; упавший
// рендер воркер уже вернул). Без сценария (упал сам сценарий) — 409, клиент
// генерирует сценарий заново через /api/briefs/:id/generate.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { GENERATION_INCLUDE, serializeGeneration } from '@/lib/studio/brief';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const gen = await prisma.generation.findFirst({ where: { id, userId: ctx.user.id } });
  if (!gen) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (gen.stage !== 'error') return NextResponse.json({ error: 'bad_stage', stage: gen.stage }, { status: 409 });
  if (!gen.script) return NextResponse.json({ error: 'no_script' }, { status: 409 });

  const updated = await prisma.generation.update({
    where: { id },
    data: { stage: 'script', status: 'completed', errorMsg: null, videoGenerationId: null, videoEditId: null },
    include: GENERATION_INCLUDE,
  });
  return NextResponse.json({ ok: true, generation: serializeGeneration(updated) });
}
