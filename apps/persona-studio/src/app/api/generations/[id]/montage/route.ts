// POST /api/generations/:id/montage — стадия «Монтаж» (опц., Submagic).
// Body: { template? }. Из готового видео создаёт VideoEdit.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { GENERATION_INCLUDE, serializeGeneration } from '@/lib/studio/brief';
import { startMontageStage } from '@/lib/studio/produce';
import { produceErrorStatus } from '../produce/route';

export const runtime = 'nodejs';

const bodySchema = z.object({ template: z.string().min(1).max(80).optional() }).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  let body: z.infer<typeof bodySchema> = {};
  try {
    body = bodySchema.parse(await req.json().catch(() => ({})));
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }

  const result = await startMontageStage({ userId: ctx.user.id, generationId: id, template: body.template });
  if (!result.ok) {
    return NextResponse.json({ error: result.error.code, detail: result.error }, { status: produceErrorStatus(result.error) });
  }

  const gen = await prisma.generation.findUnique({ where: { id }, include: GENERATION_INCLUDE });
  return NextResponse.json({ ok: true, generation: gen ? serializeGeneration(gen) : null });
}
