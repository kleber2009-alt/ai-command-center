// GET /api/research/hooks — галерея с фильтрами (формула, ниша, язык, поиск).
//                            Возвращает топ-N по sourceViews desc по дефолту.
// POST /api/research/hooks — сохранить custom хук пользователя.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isValidFormulaSlug, HOOK_FORMULAS } from '@/lib/research/hook-formulas';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const url = new URL(req.url);
  const formula = url.searchParams.get('formula');
  const niche = url.searchParams.get('niche');
  const language = url.searchParams.get('language');
  const q = url.searchParams.get('q');
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '60', 10) || 60, 1), 200);
  const showCustom = url.searchParams.get('custom') === '1';

  const where: Record<string, unknown> = {};
  if (formula && formula !== 'all') {
    if (formula === 'свои') {
      where.userId = ctx.user.id;
      where.isCustom = true;
    } else if (isValidFormulaSlug(formula)) {
      where.formula = formula;
    }
  } else if (showCustom) {
    where.userId = ctx.user.id;
  } else {
    // Default — общий пул (origin=auto/generated). Custom этого юзера тоже.
    where.OR = [
      { isCustom: false },
      { userId: ctx.user.id },
    ];
  }
  if (niche) where.niche = niche;
  if (language) where.language = language;
  if (q) where.text = { contains: q, mode: 'insensitive' };

  const hooks = await prisma.researchHook.findMany({
    where,
    orderBy: [{ sourceViews: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    include: {
      sourceReel: {
        select: { id: true, url: true, thumbnailUrl: true, author: { select: { username: true } } },
      },
    },
  });

  return NextResponse.json({ ok: true, hooks, formulas: HOOK_FORMULAS });
}

const createSchema = z.object({
  text: z.string().min(5).max(500),
  formula: z.string().default('свои'),
  niche: z.string().max(200).optional(),
  language: z.string().max(10).optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }

  const formula = isValidFormulaSlug(body.formula) ? body.formula.toLowerCase() : 'свои';

  const hook = await prisma.researchHook.create({
    data: {
      text: body.text.trim(),
      formula,
      niche: body.niche || null,
      language: body.language || null,
      sourceViews: 0,
      origin: 'custom',
      isCustom: true,
      userId: ctx.user.id,
    },
  });

  return NextResponse.json({ ok: true, hook });
}
