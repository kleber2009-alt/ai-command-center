import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, InsufficientTokensError, COSTS } from '@/lib/tokens';
import { editQueue } from '@/lib/queue';
import { STYLE_TEMPLATE_NAMES, SUBTITLE_LANGUAGES, isStyleTemplate } from '@/lib/edit-templates';

export const runtime = 'nodejs';

const SUPPORTED_LANGS = SUBTITLE_LANGUAGES.map((l) => l.code) as [string, ...string[]];

const Body = z.object({
  videoGenerationId: z.string().min(1),
  // template = canonical Submagic name (e.g. "Hormozi 2", "Beast", "Devin").
  template: z.string().min(1).refine(isStyleTemplate, {
    message: `unknown_template (allowed: ${STYLE_TEMPLATE_NAMES.length} from /v1/templates)`,
  }),
  subtitlesEnabled: z.boolean().optional().default(true),
  subtitleLanguage: z.enum(SUPPORTED_LANGS).optional().default('ru'),
  brollsEnabled: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentUserOrApiKey(req);
    if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    const user = ctx.user;

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
    }
    const data = parsed.data;

    const video = await prisma.videoGeneration.findFirst({
      where: { id: data.videoGenerationId, userId: user.id },
    });
    if (!video) return NextResponse.json({ error: 'video_not_found' }, { status: 404 });
    if (video.status !== 'completed' || !video.videoUrl) {
      return NextResponse.json({ error: 'video_not_ready', status: video.status }, { status: 409 });
    }

    const cost = COSTS.submagicEdit;
    try {
      await chargeTokens({
        userId: user.id,
        amount: cost,
        reason: `submagic-edit:${data.template}`,
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

    const edit = await prisma.videoEdit.create({
      data: {
        userId: user.id,
        videoGenerationId: data.videoGenerationId,
        template: data.template,
        subtitlesEnabled: data.subtitlesEnabled,
        subtitleLanguage: data.subtitleLanguage,
        brollsEnabled: data.brollsEnabled,
        status: 'pending',
        tokensCost: cost,
      },
    });

    try {
      await editQueue().add(
        'edit',
        { editId: edit.id, userId: user.id },
        { jobId: edit.id },
      );
    } catch (e) {
      console.error('[api/edits] enqueue failed', e);
      await refundTokens({
        userId: user.id,
        amount: cost,
        reason: 'submagic-edit:enqueue-failed',
        refId: edit.id,
      });
      await prisma.videoEdit.update({
        where: { id: edit.id },
        data: { status: 'failed', errorMsg: 'enqueue_failed' },
      });
      return NextResponse.json({ error: 'enqueue_failed' }, { status: 500 });
    }

    return NextResponse.json({ id: edit.id, status: edit.status });
  } catch (e) {
    console.error('[api/edits] unhandled error', e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'internal_error', message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const e = await prisma.videoEdit.findFirst({
      where: { id, userId: user.id },
      include: {
        videoGeneration: {
          select: {
            id: true,
            videoUrl: true,
            aspect: true,
            avatar: { select: { id: true, styleLabel: true, imageUrl: true } },
          },
        },
      },
    });
    if (!e) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(e);
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 200);
  const edits = await prisma.videoEdit.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      videoGeneration: {
        select: {
          id: true,
          aspect: true,
          videoUrl: true,
          avatar: { select: { id: true, styleLabel: true, imageUrl: true } },
        },
      },
    },
    take: limit,
  });
  return NextResponse.json({ edits });
}
