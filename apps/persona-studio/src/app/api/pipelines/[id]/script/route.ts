// POST /api/pipelines/:id/script — «Уникализировать» / «Перегенерировать».
// Reel: transcribe the source reel's mp4 (Whisper) when we have it, else use
// the caption → Claude writes a net-new script in the owner's voice → §2
// similarity gate (+ provenance). Costs COSTS.studioScript, refunded on failure.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/ratelimit';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, InsufficientTokensError, COSTS } from '@/lib/tokens';
import { refreshAppSettings } from '@/lib/app-settings';
import { isClaudeConfigured } from '@/lib/research/claude';
import { recordProvenance } from '@/lib/studio/similarity';
import { findPipeline, pipelineView, scriptVoiceFor } from '@/lib/pipeline/server';
import { resolveReelSourceText, uniquifyReelScript } from '@/lib/pipeline/script';

export const runtime = 'nodejs';
export const maxDuration = 300;

const Body = z.object({
  /** re-transcribe the source even if a transcript is cached */
  retranscribe: z.boolean().optional(),
  targetSec: z.number().int().min(10).max(120).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const limited = await enforceRateLimit(ctx, 'generate');
  if (limited) return limited;
  const userId = ctx.user.id;
  const { id } = await params;

  const p = await findPipeline(userId, id);
  if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (p.kind !== 'reel') return NextResponse.json({ error: 'bad_stage', message: 'Сценарий пишется только для рилса.' }, { status: 409 });
  const body = Body.safeParse(await req.json().catch(() => ({})));
  const opts = body.success ? body.data : {};

  if (p.videoGenerationId) {
    const v = await prisma.videoGeneration.findFirst({ where: { id: p.videoGenerationId }, select: { status: true } });
    if (v && (v.status === 'pending' || v.status === 'processing')) {
      return NextResponse.json({ error: 'generation_running' }, { status: 409 });
    }
  }

  await refreshAppSettings();
  if (!isClaudeConfigured()) return NextResponse.json({ error: 'claude_not_configured' }, { status: 503 });

  const item = p.parserItemId ? await prisma.parserItem.findFirst({ where: { id: p.parserItemId, userId } }) : null;

  const cost = COSTS.studioScript;
  try {
    await chargeTokens({ userId, amount: cost, reason: `pipeline-script:${p.id}`, refId: p.id });
  } catch (e) {
    if (e instanceof InsufficientTokensError) {
      return NextResponse.json({ error: 'insufficient_tokens', have: e.have, need: e.need }, { status: 402 });
    }
    throw e;
  }

  let settled = false; // refunded or delivered — the catch must not refund again
  try {
    // Source text: a cached transcript wins; the caption stored at creation is
    // only a placeholder, so the first run transcribes the reel when it can.
    let sourceText = p.sourceText ?? '';
    let sourceFrom: 'transcript' | 'caption' | 'cached' = 'cached';
    const cachedIsCaption = !!item && (p.sourceText ?? '').trim() === (item.caption ?? '').trim();
    if (item && (opts.retranscribe || !sourceText.trim() || cachedIsCaption)) {
      const r = await resolveReelSourceText({ videoUrl: item.videoUrl, caption: item.caption });
      if (r.text.trim()) {
        sourceText = r.text;
        sourceFrom = r.from;
      }
    }
    if (sourceText.trim().length < 10) {
      settled = true;
      await refundTokens({ userId, amount: cost, reason: `pipeline-script-refund:${p.id}`, refId: p.id });
      return NextResponse.json(
        { error: 'no_source_text', message: 'У исходного поста нет ни текста, ни распознаваемой речи — вставьте текст в поле «Источник».' },
        { status: 422 },
      );
    }

    const voice = await scriptVoiceFor(userId, item?.owner ? `@${item.owner}` : null);
    const gen = await uniquifyReelScript({ sourceText, voice, targetSec: item?.durationSec ?? null });
    if (!gen.ok) {
      console.error('[pipeline-script] failed:', gen.error);
      settled = true;
      await refundTokens({ userId, amount: cost, reason: `pipeline-script-refund:${p.id}`, refId: p.id });
      return NextResponse.json({ error: 'script_failed', message: 'Не удалось написать сценарий — токены возвращены. Попробуйте ещё раз.' }, { status: 502 });
    }

    await recordProvenance({ userId, result: gen.similarity, assetId: p.id, assetType: 'script' }).catch((e) =>
      console.warn('[pipeline-script] provenance failed', e),
    );

    const row = await prisma.pipeline.update({
      where: { id: p.id },
      data: {
        sourceText,
        script: gen.script,
        similarity: gen.similarity.similarity,
        gate: gen.similarity.gate,
      },
    });
    settled = true;
    return NextResponse.json({
      ok: true,
      script: gen.script,
      similarity: gen.similarity.similarity,
      gate: gen.similarity.gate,
      sourceFrom,
      cost,
      pipeline: await pipelineView(row),
    });
  } catch (e) {
    console.error('[pipeline-script] unhandled', e);
    if (settled) return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    await refundTokens({ userId, amount: cost, reason: `pipeline-script-refund:${p.id}`, refId: p.id });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
