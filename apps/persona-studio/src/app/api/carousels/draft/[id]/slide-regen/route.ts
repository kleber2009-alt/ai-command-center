// POST /api/carousels/draft/:id/slide-regen?index=N
//
// AI-регенерация одного слайда карусели (title + body) через Claude с
// учётом Style DNA и соседних слайдов. После успеха обновляет draft.slides
// в БД и возвращает обновлённый массив + новый слайд.
//
// Body (опционально): { intent?: string } — словесная подсказка
// («сделай острее», «добавь цифру»).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { regenSlideCopy, isClaudeConfigured } from '@/lib/parser/claude';
import { isValidStyle, DEFAULT_STYLE } from '@/lib/carousel/styles';
import { isValidCoverType, type CoverType } from '@/lib/carousel/prompts';

export const runtime = 'nodejs';
export const maxDuration = 60;

type SlideJson = {
  title: string;
  body: string;
  accent?: string;
  image?: string;
  coverType?: CoverType;
};

const Body = z
  .object({
    intent: z.string().max(300).optional(),
  })
  .default({});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = auth.user;
  const { id } = await ctx.params;

  if (!isClaudeConfigured()) {
    return NextResponse.json(
      { error: 'claude_not_configured', message: 'ANTHROPIC_API_KEY не задан.' },
      { status: 503 },
    );
  }

  const indexRaw = req.nextUrl.searchParams.get('index');
  const index = indexRaw != null ? Number(indexRaw) : NaN;
  if (!Number.isFinite(index) || index < 0) {
    return NextResponse.json({ error: 'bad_index' }, { status: 400 });
  }

  const parsedBody = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsedBody.error.issues }, { status: 400 });
  }
  const { intent } = parsedBody.data;

  const draft = await prisma.carouselDraft.findFirst({
    where: { id, userId: user.id },
    select: { id: true, slides: true, style: true },
  });
  if (!draft) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const slides = Array.isArray(draft.slides) ? (draft.slides as unknown as SlideJson[]) : [];
  if (index >= slides.length) {
    return NextResponse.json({ error: 'index_out_of_range', message: `Нет слайда ${index + 1}.` }, { status: 400 });
  }
  const current = slides[index];
  if (!current?.title?.trim() || !current?.body?.trim()) {
    return NextResponse.json(
      { error: 'empty_slide', message: `Слайд ${index + 1} пуст — нечего регенерировать.` },
      { status: 400 },
    );
  }

  const cfg = await prisma.parserConfig.findUnique({
    where: { userId: user.id },
    select: { nicheDescription: true },
  });

  const styleId = isValidStyle(draft.style) ? draft.style : DEFAULT_STYLE;

  const result = await regenSlideCopy({
    niche: cfg?.nicheDescription || '',
    userName: user.name || user.email.split('@')[0] || 'эксперт',
    styleId,
    slideIndex: index,
    slidesTotal: slides.length,
    current: { title: current.title, body: current.body },
    neighbors: {
      prev: slides[index - 1] ? { title: slides[index - 1].title, body: slides[index - 1].body } : undefined,
      next: slides[index + 1] ? { title: slides[index + 1].title, body: slides[index + 1].body } : undefined,
    },
    intent,
  });
  if (!result.ok) {
    return NextResponse.json({ error: 'regen_failed', message: result.error }, { status: 502 });
  }

  // Сохраняем — title/body заменяются, accent/image/coverType остаются.
  const next: SlideJson = {
    ...current,
    title: result.title,
    body: result.body,
    // Очищаем coverType-санитизацию: в БД пускаем только валидный.
    ...(isValidCoverType(current.coverType) ? { coverType: current.coverType } : {}),
  };
  const nextSlides = slides.slice();
  nextSlides[index] = next;

  await prisma.carouselDraft.update({
    where: { id },
    data: { slides: nextSlides },
  });

  return NextResponse.json({
    ok: true,
    index,
    slide: next,
    slides: nextSlides,
  });
}
