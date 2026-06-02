// POST /api/research/hooks/generate — генерация хуков по формуле(ам) (1 кр./формула).
// Принимает array of formula-slugs. Charge атомарный за весь батч; если
// одна формула упала — refund только за неё.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, COSTS, InsufficientTokensError } from '@/lib/tokens';
import { generateHooks } from '@/lib/research/hooks-gen';
import { isValidFormulaSlug } from '@/lib/research/hook-formulas';

export const runtime = 'nodejs';
export const maxDuration = 120;

const bodySchema = z.object({
  formulas: z.array(z.string()).min(1).max(10),
  niche: z.string().max(200).optional(),
  language: z.string().max(10).default('ru'),
});

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }

  const formulas = body.formulas
    .map((f) => f.toLowerCase())
    .filter(isValidFormulaSlug);
  if (formulas.length === 0) {
    return NextResponse.json({ error: 'no_valid_formulas' }, { status: 400 });
  }

  const cost = COSTS.researchHookGen * formulas.length;
  try {
    await chargeTokens({
      userId: ctx.user.id,
      amount: cost,
      reason: 'research_hook_gen',
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

  const results = await Promise.all(
    formulas.map((f) =>
      generateHooks({ formula: f, niche: body.niche, language: body.language }),
    ),
  );

  // Refund за каждую упавшую формулу
  const failed = results.filter((r) => !r.ok).length;
  if (failed > 0) {
    await refundTokens({
      userId: ctx.user.id,
      amount: COSTS.researchHookGen * failed,
      reason: 'research_hook_gen_partial_refund',
    });
  }

  // Сохраняем успешные хуки в БД
  const toSave = results.flatMap((r) =>
    r.ok
      ? r.hooks.map((h) => ({
          text: h.text,
          formula: r.formula,
          niche: body.niche || null,
          language: body.language,
          sourceViews: 0,
          origin: 'generated',
          isCustom: false,
          userId: ctx.user.id, // generated hooks привязываем к юзеру (его «генерация»)
        }))
      : [],
  );
  if (toSave.length > 0) {
    await prisma.researchHook.createMany({ data: toSave });
  }

  return NextResponse.json({
    ok: true,
    generated: toSave.length,
    failed,
    results: results.map((r, i) => ({
      formula: formulas[i],
      ok: r.ok,
      hooks: r.ok ? r.hooks : [],
      error: r.ok ? null : r.error,
    })),
  });
}
