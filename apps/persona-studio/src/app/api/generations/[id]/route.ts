// GET   /api/generations/:id — поллинг статуса генерации
// PATCH /api/generations/:id — правка сценария в редакторе (§4) → пере-gate (§2)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeGeneration } from '@/lib/studio/brief';
import { checkSimilarity, recordProvenance } from '@/lib/studio/similarity';

export const runtime = 'nodejs';

const patchSchema = z.object({ script: z.string().min(20).max(8000) }).strict();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const gen = await prisma.generation.findFirst({ where: { id, userId: ctx.user.id } });
  if (!gen) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, generation: serializeGeneration(gen) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const gen = await prisma.generation.findFirst({
    where: { id, userId: ctx.user.id },
    include: { brief: { select: { sourceReelId: true } } },
  });
  if (!gen) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (gen.stage !== 'script') {
    return NextResponse.json({ error: 'script_locked' }, { status: 409 });
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }

  // Отредактированный текст заново проходит §2-gate.
  const sim = await checkSimilarity({
    generatedText: body.script,
    sourceReelId: gen.brief.sourceReelId,
  });
  await recordProvenance({
    userId: ctx.user.id,
    result: sim,
    assetId: gen.id,
    assetType: 'script',
    sourceReelId: gen.brief.sourceReelId,
  });

  const saved = await prisma.generation.update({
    where: { id: gen.id },
    data: { script: body.script, similarity: sim.similarity, gate: sim.gate },
  });
  return NextResponse.json({ ok: true, generation: serializeGeneration(saved) });
}
