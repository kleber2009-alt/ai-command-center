// POST /api/research/reels/:id/translate — перевод транскрипта или caption.
// 1 кр. (ТЗ §11/12).
//
// Body: { source: 'transcript' | 'caption', targetLang?: string }
// Если source=transcript — берём последний improved=true ResearchTranscript
// (или любой свежий, если improved нет). Если transcripts нет — 422.
// Если source=caption — переводим reel.caption.
//
// Результат: { translated, targetLang, source }. Перевод НЕ сохраняется в
// БД отдельной таблицей — это короткая операция, юзер сам копирует.
// Если позже понадобится кэш переводов — добавим колонку translations[] в
// ResearchTranscript или отдельную сущность.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, COSTS, InsufficientTokensError } from '@/lib/tokens';
import { translateText } from '@/lib/research/translate';

export const runtime = 'nodejs';
export const maxDuration = 90;

const bodySchema = z.object({
  source: z.enum(['transcript', 'caption']).default('transcript'),
  targetLang: z.string().min(2).max(8).default('ru'),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json().catch(() => ({})));
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }

  const reel = await prisma.researchReel.findUnique({
    where: { id },
    include: {
      transcripts: { orderBy: [{ improved: 'desc' }, { createdAt: 'desc' }], take: 1 },
    },
  });
  if (!reel) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let sourceText: string | null = null;
  let sourceLang: string | null = null;
  if (body.source === 'transcript') {
    const t = reel.transcripts[0];
    if (!t) {
      return NextResponse.json(
        { error: 'no_transcript', message: 'Сначала закажи транскрибацию.' },
        { status: 422 },
      );
    }
    sourceText = t.text;
    sourceLang = t.lang;
  } else {
    sourceText = reel.caption;
  }
  if (!sourceText || sourceText.trim().length === 0) {
    return NextResponse.json({ error: 'empty_source' }, { status: 422 });
  }

  const cost = COSTS.researchTranslate;
  try {
    await chargeTokens({
      userId: ctx.user.id,
      amount: cost,
      reason: 'research_translate',
      refId: reel.id,
    });
  } catch (e) {
    if (e instanceof InsufficientTokensError) {
      return NextResponse.json(
        { error: 'insufficient_tokens', have: e.have, need: e.need },
        { status: 402 },
      );
    }
    throw e;
  }

  try {
    const result = await translateText({
      text: sourceText,
      targetLang: body.targetLang,
      sourceLang: sourceLang ?? undefined,
    });
    if (!result.ok) {
      await refundTokens({
        userId: ctx.user.id,
        amount: cost,
        reason: 'research_translate_failed',
        refId: reel.id,
      });
      return NextResponse.json(
        { error: 'translate_failed', message: result.error },
        { status: result.status || 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      source: body.source,
      sourceLang: sourceLang,
      targetLang: result.targetLang,
      translated: result.translated,
    });
  } catch (e) {
    await refundTokens({
      userId: ctx.user.id,
      amount: cost,
      reason: 'research_translate_error',
      refId: reel.id,
    });
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'translate_error', message: msg }, { status: 500 });
  }
}
