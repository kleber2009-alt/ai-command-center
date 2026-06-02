// GET    /api/research/radars   — список радаров юзера
// POST   /api/research/radars   — создать { niche, filters, intervalHrs? }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const filtersSchema = z
  .object({
    period: z.enum(['all', '7d', '30d', '90d']).optional(),
    language: z.string().optional(),
    postType: z.enum(['reel', 'image', 'carousel']).optional(),
    durationBand: z.enum(['short', 'medium', 'long']).nullable().optional(),
    sortBy: z.enum(['viral_score', 'views', 'virality', 'engagement', 'date']).optional(),
  })
  .partial();

const createSchema = z.object({
  niche: z.string().min(2).max(200),
  filters: filtersSchema.optional(),
  intervalHrs: z.number().int().min(1).max(168).default(24),
});

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const radars = await prisma.researchRadar.findMany({
    where: { userId: ctx.user.id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ ok: true, radars });
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }
  const radar = await prisma.researchRadar.create({
    data: {
      userId: ctx.user.id,
      niche: body.niche,
      filters: body.filters ?? {},
      intervalHrs: body.intervalHrs,
      enabled: true,
    },
  });
  return NextResponse.json({ ok: true, radar });
}
