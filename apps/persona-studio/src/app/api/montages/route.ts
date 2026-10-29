// /api/montages — монтаж по стилям Студии Кадрика (31 скилл Creator Pack).
// POST создаёт Montage, списывает токены и ставит задачу в очередь kadrik-montage:
// воркер отдаёт её боту Кадрика, тот монтирует скиллом через Claude Code.
// Вход по стилю: видео — готовое (videoGenerationId) или своя запись через
// /api/montages/upload (sourceUrl — только из своего S3-префикса, без SSRF);
// ссылка (link) или текст (script) — для скиллов, которым видео не нужно.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/ratelimit';
import { prisma } from '@/lib/prisma';
import { createKadrikMontage, MontageBody } from '@/lib/montage/create-kadrik';

export const runtime = 'nodejs';

const Body = MontageBody;

export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentUserOrApiKey(req);
    if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    const limited = await enforceRateLimit(ctx, 'generate');
    if (limited) return limited;
    const user = ctx.user;

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
    }
    const r = await createKadrikMontage(user.id, parsed.data);
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('[api/montages] unhandled error', e);
    return NextResponse.json({ error: 'internal_error', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

const LIST_SELECT = {
  id: true,
  style: true,
  format: true,
  hookTitle: true,
  ctaWord: true,
  status: true,
  resultUrl: true,
  durationSec: true,
  tokensCost: true,
  errorMsg: true,
  progress: true,
  createdAt: true,
  completedAt: true,
  videoGenerationId: true,
} as const;

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const m = await prisma.montage.findFirst({ where: { id, userId: user.id }, select: LIST_SELECT });
    if (!m) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(m);
  }
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 200);
  const montages = await prisma.montage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: LIST_SELECT,
  });
  return NextResponse.json({ montages });
}
