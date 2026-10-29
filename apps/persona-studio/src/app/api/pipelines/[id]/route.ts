// GET    /api/pipelines/:id — the branch + linked video/montage/post; reading it
//        advances the stage from those rows (the wizard polls this).
// PATCH  /api/pipelines/:id — edit fields (script edit, chosen avatar/voice,
//        montage style, carousel draft link, carousel stage).
// DELETE /api/pipelines/:id — drop the branch; produced videos/montages stay.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { findPipeline, pipelineView } from '@/lib/pipeline/server';
import { pipelineCosts } from '@/lib/pipeline/costs';
import { PIPELINE_STAGES } from '@/lib/pipeline/types';
import { checkSimilarity } from '@/lib/studio/similarity';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const p = await findPipeline(ctx.user.id, id);
  if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ pipeline: await pipelineView(p), costs: pipelineCosts() });
}

const Patch = z
  .object({
    title: z.string().trim().max(200).nullable(),
    script: z.string().max(1500).nullable(),
    sourceText: z.string().max(20_000).nullable(),
    heygenAvatarId: z.string().max(100).nullable(),
    heygenAvatarName: z.string().max(200).nullable(),
    heygenAvatarImage: z.string().max(2000).nullable(),
    voiceId: z.string().max(100).nullable(),
    voiceName: z.string().max(200).nullable(),
    montageStyle: z.string().max(100).nullable(),
    carouselDraftId: z.string().max(100).nullable(),
    // carousel branch drives its own stage; reels derive it from linked rows
    stage: z.enum(PIPELINE_STAGES),
  })
  .partial()
  .strict();

export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const p = await findPipeline(ctx.user.id, id);
  if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const data = { ...parsed.data };

  if (data.carouselDraftId) {
    const draft = await prisma.carouselDraft.findFirst({ where: { id: data.carouselDraftId, userId: ctx.user.id }, select: { id: true } });
    if (!draft) return NextResponse.json({ error: 'source_not_found' }, { status: 404 });
  }
  if (data.script !== undefined && p.videoGenerationId) {
    const v = await prisma.videoGeneration.findFirst({ where: { id: p.videoGenerationId }, select: { status: true } });
    if (v && (v.status === 'pending' || v.status === 'processing')) {
      return NextResponse.json({ error: 'generation_running' }, { status: 409 });
    }
  }
  if (p.kind === 'reel') delete data.stage;

  // A hand-edited script is no longer the gated text — re-check it against the
  // source (blocks only if the user pasted the original back).
  let gateData: { similarity: number | null; gate: string } | Record<string, never> = {};
  if (typeof data.script === 'string' && data.script.trim() !== (p.script ?? '').trim()) {
    const sim = await checkSimilarity({ generatedText: data.script, sourceText: p.sourceText });
    gateData = { similarity: sim.similarity, gate: sim.gate };
  }

  const row = await prisma.pipeline.update({ where: { id: p.id }, data: { ...data, ...gateData } });
  return NextResponse.json({ ok: true, pipeline: await pipelineView(row) });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const p = await findPipeline(ctx.user.id, id);
  if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await prisma.pipeline.delete({ where: { id: p.id } });
  return NextResponse.json({ ok: true });
}
