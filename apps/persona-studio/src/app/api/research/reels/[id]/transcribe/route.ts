// POST /api/research/reels/:id/transcribe — заказать транскрибацию (5 кр.).
// На Этапе 3 это либо реальный whisper (если WHISPER_SERVICE_URL задан),
// либо caption-fallback с improve через Claude. Если в БД уже есть
// свежий transcript, возвращаем его без charge.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, COSTS, InsufficientTokensError } from '@/lib/tokens';
import { transcribeReel, improveTranscript } from '@/lib/research/transcribe';

export const runtime = 'nodejs';
export const maxDuration = 240;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const reel = await prisma.researchReel.findUnique({
    where: { id },
    include: { transcripts: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!reel) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Если уже есть improved-транскрипт — отдаём без charge
  const existing = reel.transcripts[0];
  if (existing && existing.improved) {
    return NextResponse.json({ ok: true, transcript: existing, cached: true });
  }

  const cost = COSTS.researchTranscribe;
  try {
    await chargeTokens({
      userId: ctx.user.id,
      amount: cost,
      reason: 'research_transcribe',
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
    const t = await transcribeReel({
      videoUrl: reel.videoUrl,
      caption: reel.caption,
      lang: reel.language || 'ru',
    });
    if (!t.ok) {
      await refundTokens({
        userId: ctx.user.id,
        amount: cost,
        reason: 'research_transcribe_failed',
        refId: reel.id,
      });
      return NextResponse.json({ error: 'transcribe_failed', message: t.error }, { status: 502 });
    }
    const improved = await improveTranscript(t.text, t.lang);
    const saved = await prisma.researchTranscript.create({
      data: {
        reelId: reel.id,
        lang: t.lang,
        text: improved.text,
        improved: improved.improved,
        source: t.source,
      },
    });
    return NextResponse.json({
      ok: true,
      transcript: saved,
      cached: false,
      note: t.source === 'caption'
        ? 'Whisper-сервис не настроен — использовано описание поста. Подключи WHISPER_SERVICE_URL для реальной транскрибации.'
        : null,
    });
  } catch (e) {
    await refundTokens({
      userId: ctx.user.id,
      amount: cost,
      reason: 'research_transcribe_error',
      refId: reel.id,
    });
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'transcribe_error', message: msg }, { status: 500 });
  }
}
