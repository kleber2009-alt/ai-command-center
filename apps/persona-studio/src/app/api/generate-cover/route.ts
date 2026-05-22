import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, COSTS, InsufficientTokensError } from '@/lib/tokens';
import { coverQueue } from '@/lib/queue';

export const runtime = 'nodejs';

const Body = z.object({
  avatarId: z.string().min(1),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(200).optional().nullable(),
  cta: z.string().max(80).optional().nullable(),
  niche: z.string().max(120).optional().nullable(),
  style: z.string().max(40).optional().default('ai-visionary'),
  aspect: z.enum(['4:5', '1:1', '9:16']).optional().default('4:5'),
});

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }

  const { avatarId, title, subtitle, cta, niche, style, aspect } = parsed.data;

  const avatar = await prisma.avatar.findFirst({ where: { id: avatarId, userId: user.id } });
  if (!avatar) return NextResponse.json({ error: 'avatar_not_found' }, { status: 404 });
  if (avatar.status !== 'done' || !avatar.imageUrl) {
    return NextResponse.json({ error: 'avatar_not_ready' }, { status: 409 });
  }

  try {
    await chargeTokens({
      userId: user.id,
      amount: COSTS.coverGeneration,
      reason: 'cover-generation',
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

  const cover = await prisma.cover.create({
    data: {
      userId: user.id,
      avatarId,
      title,
      subtitle: subtitle ?? null,
      cta: cta ?? null,
      niche: niche ?? null,
      style,
      aspect,
      status: 'pending',
      tokensCost: COSTS.coverGeneration,
    },
  });

  try {
    await coverQueue().add('generate', { coverId: cover.id, userId: user.id }, { jobId: cover.id });
  } catch {
    await refundTokens({
      userId: user.id,
      amount: COSTS.coverGeneration,
      reason: 'cover-generation:enqueue-failed',
      refId: cover.id,
    });
    await prisma.cover.update({
      where: { id: cover.id },
      data: { status: 'failed', errorMsg: 'enqueue_failed' },
    });
    return NextResponse.json({ error: 'enqueue_failed' }, { status: 500 });
  }

  return NextResponse.json({ id: cover.id, status: cover.status });
}

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });

  const cover = await prisma.cover.findFirst({ where: { id, userId: user.id } });
  if (!cover) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json(cover);
}
