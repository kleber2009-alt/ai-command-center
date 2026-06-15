// GET /api/briefs/:id — бриф + его генерации

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { BRIEF_INCLUDE, serializeBrief } from '@/lib/studio/brief';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const brief = await prisma.brief.findFirst({
    where: { id, userId: ctx.user.id },
    include: BRIEF_INCLUDE,
  });
  if (!brief) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, brief: serializeBrief(brief) });
}
