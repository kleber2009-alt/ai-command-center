// POST /api/measure/:postTargetId — записать суточный снимок метрик
// опубликованного поста (ручной ввод или будущий коллектор площадки).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { recordMetric } from '@/lib/measure/measure';

export const runtime = 'nodejs';

const bodySchema = z
  .object({
    views: z.number().int().min(0),
    likes: z.number().int().min(0).optional(),
    comments: z.number().int().min(0).optional(),
    saves: z.number().int().min(0).optional(),
    shares: z.number().int().min(0).optional(),
    source: z.string().max(20).optional(),
  })
  .strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ postTargetId: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { postTargetId } = await params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }

  // Снимок датируем сегодняшним днём (00:00 UTC).
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const result = await recordMetric({ userId: ctx.user.id, postTargetId, day, ...body });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === 'not_found' ? 404 : 400 });
  }
  return NextResponse.json({ ok: true });
}
