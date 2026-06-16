// POST /api/generations/:id/produce — стадия «Видео» (Модуль B, §4).
// Из утверждённого сценария (gate ≠ block) создаёт VideoGeneration через
// персону (аватар+голос) и ставит в очередь существующего воркера.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { GENERATION_INCLUDE, serializeGeneration } from '@/lib/studio/brief';
import { startVideoStage, type ProduceError } from '@/lib/studio/produce';

export const runtime = 'nodejs';

export function produceErrorStatus(err: ProduceError): number {
  switch (err.code) {
    case 'not_found':
      return 404;
    case 'insufficient_tokens':
      return 402;
    case 'blocked_by_gate':
    case 'no_script':
    case 'persona_required':
    case 'avatar_required':
    case 'voice_required':
    case 'bad_stage':
      return 409;
    default:
      return 400;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const result = await startVideoStage({ userId: ctx.user.id, generationId: id });
  if (!result.ok) {
    return NextResponse.json({ error: result.error.code, detail: result.error }, { status: produceErrorStatus(result.error) });
  }

  const gen = await prisma.generation.findUnique({ where: { id }, include: GENERATION_INCLUDE });
  return NextResponse.json({ ok: true, generation: gen ? serializeGeneration(gen) : null });
}
