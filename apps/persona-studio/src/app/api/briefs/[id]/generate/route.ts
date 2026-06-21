// POST /api/briefs/:id/generate — стадия «Сценарий» (Модуль B, §4).
// Claude пишет net-new сценарий под персону → similarity-gate (§2) →
// provenance. Создаёт Generation(stage='script'). Кредиты резервируются и
// возвращаются при ошибке.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, InsufficientTokensError, COSTS } from '@/lib/tokens';
import { serializeGeneration } from '@/lib/studio/brief';
import { generateScript } from '@/lib/studio/generate-script';
import { checkSimilarity, recordProvenance } from '@/lib/studio/similarity';
import { normalizeTone } from '@/lib/studio/persona';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Единый прайс (§10) — стоимость стадии «Сценарий».
const SCRIPT_CREDITS = COSTS.studioScript;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const brief = await prisma.brief.findFirst({
    where: { id, userId: ctx.user.id },
    include: { persona: true },
  });
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Резервируем кредиты (атомарно). Недостаточно → 402 + апселл.
  try {
    await chargeTokens({
      userId: ctx.user.id,
      amount: SCRIPT_CREDITS,
      reason: `studio-script:${brief.id}`,
    });
  } catch (e) {
    if (e instanceof InsufficientTokensError) {
      return NextResponse.json(
        { error: 'INSUFFICIENT_TOKENS', have: e.have, need: e.need },
        { status: 402 },
      );
    }
    throw e;
  }

  const generation = await prisma.generation.create({
    data: {
      briefId: brief.id,
      userId: ctx.user.id,
      stage: 'script',
      status: 'processing',
      costCredits: SCRIPT_CREDITS,
    },
  });

  const persona = brief.persona;
  const tone = persona ? normalizeTone(persona.tone) : {};

  const gen = await generateScript({
    persona: {
      name: persona?.name ?? 'Автор',
      lang: persona?.lang ?? brief.lang,
      tone,
    },
    brief: {
      hookArchetype: brief.hookArchetype,
      format: brief.format,
      lengthSec: brief.lengthSec,
      lang: brief.lang,
      topic: brief.topic,
    },
  });

  if (!gen.ok) {
    // §3 white-label: сырую ошибку модели логируем, клиенту — нейтральный текст.
    console.error('[studio-script] generation failed:', gen.error);
    await refundTokens({
      userId: ctx.user.id,
      amount: SCRIPT_CREDITS,
      reason: `studio-script-refund:${brief.id}`,
    });
    const clientMsg = 'Не удалось сгенерировать сценарий. Повторите попытку.';
    const failed = await prisma.generation.update({
      where: { id: generation.id },
      data: { stage: 'error', status: 'failed', errorMsg: clientMsg, costCredits: 0 },
    });
    return NextResponse.json(
      { ok: false, error: clientMsg, generation: serializeGeneration(failed) },
      { status: 502 },
    );
  }

  // §2 similarity-gate против источника-вдохновения.
  const sim = await checkSimilarity({
    generatedText: gen.script,
    sourceReelId: brief.sourceReelId,
  });
  await recordProvenance({
    userId: ctx.user.id,
    result: sim,
    assetId: generation.id,
    assetType: 'generation',
    sourceReelId: brief.sourceReelId,
  });

  const saved = await prisma.generation.update({
    where: { id: generation.id },
    data: {
      script: gen.script,
      similarity: sim.similarity,
      gate: sim.gate,
      status: 'completed',
      meta: {
        inputTokens: gen.inputTokens ?? null,
        outputTokens: gen.outputTokens ?? null,
        gateReason: sim.reason ?? null,
      },
    },
  });

  return NextResponse.json({ ok: true, generation: serializeGeneration(saved) });
}
