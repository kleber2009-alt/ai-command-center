// PATCH  /api/research/radars/:id — { enabled?, intervalHrs?, niche?, filters? }
// DELETE /api/research/radars/:id

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  intervalHrs: z.number().int().min(1).max(168).optional(),
  niche: z.string().min(2).max(200).optional(),
  filters: z.record(z.unknown()).optional(),
});

async function loadRadar(userId: string, id: string) {
  return prisma.researchRadar.findFirst({ where: { id, userId } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const radar = await loadRadar(ctx.user.id, id);
  if (!radar) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }
  const updated = await prisma.researchRadar.update({
    where: { id: radar.id },
    data: {
      enabled: body.enabled,
      intervalHrs: body.intervalHrs,
      niche: body.niche,
      filters: body.filters === undefined ? undefined : (body.filters as object),
    },
  });
  return NextResponse.json({ ok: true, radar: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const radar = await loadRadar(ctx.user.id, id);
  if (!radar) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await prisma.researchRadar.delete({ where: { id: radar.id } });
  return NextResponse.json({ ok: true });
}
