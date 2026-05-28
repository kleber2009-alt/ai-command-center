// POST /api/carousels/draft — создать черновик карусели из ParserItem
// (или произвольного caption). Шаги:
//   1. Достаём caption и niche (из ParserItem + ParserConfig)
//   2. Claude разбивает на N слайдов по структуре hook → раскрытие → CTA
//   3. coverAvatarId — selected или первый готовый Avatar (override через body)
//   4. Сохраняем CarouselDraft со slides[], возвращаем draftId + slides
//
// Long-running: Claude до ~30 сек на 20 слайдов. runtime=nodejs.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { splitCaptionIntoSlides, isClaudeConfigured } from '@/lib/parser/claude';
import { DEFAULT_STYLE, isValidStyle } from '@/lib/carousel/styles';

export const runtime = 'nodejs';
export const maxDuration = 90;

const Body = z
  .object({
    parserItemId: z.string().optional(),
    caption: z.string().max(3000).optional(),
    slidesCount: z.number().int().min(3).max(20).default(6),
    coverAvatarId: z.string().optional(),
    style: z.string().optional(),
  })
  .refine((b) => Boolean(b.parserItemId || b.caption), {
    message: 'parserItemId or caption required',
  });

export async function POST(req: NextRequest) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = auth.user;

  if (!isClaudeConfigured()) {
    return NextResponse.json(
      { error: 'claude_not_configured', message: 'ANTHROPIC_API_KEY не задан в окружении сервера.' },
      { status: 503 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  // Resolve source: parserItem → caption + fitWhy, либо free-form caption.
  let caption = '';
  let fitWhy: string | null = null;
  let parserItem: { id: string; caption: string | null; fitWhy: string | null } | null = null;
  if (data.parserItemId) {
    parserItem = await prisma.parserItem.findFirst({
      where: { id: data.parserItemId, userId: user.id },
      select: { id: true, caption: true, fitWhy: true },
    });
    if (!parserItem) return NextResponse.json({ error: 'parser_item_not_found' }, { status: 404 });
    caption = parserItem.caption || '';
    fitWhy = parserItem.fitWhy;
  }
  if (data.caption) caption = data.caption;
  if (!caption.trim()) {
    return NextResponse.json({ error: 'empty_caption', message: 'Источник пуст.' }, { status: 400 });
  }

  // Resolve cover avatar — explicit или selected или первый done.
  let coverAvatarId = data.coverAvatarId || null;
  if (coverAvatarId) {
    const avatar = await prisma.avatar.findFirst({
      where: { id: coverAvatarId, userId: user.id, status: 'done' },
      select: { id: true },
    });
    if (!avatar) coverAvatarId = null;
  }
  if (!coverAvatarId) {
    const fallback = await prisma.avatar.findFirst({
      where: { userId: user.id, status: 'done' },
      orderBy: [{ selected: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    coverAvatarId = fallback?.id ?? null;
  }

  // Niche — из ParserConfig (если есть). Не требуем — без неё Claude даст
  // более generic слайды, но это приемлемо.
  const cfg = await prisma.parserConfig.findUnique({
    where: { userId: user.id },
    select: { nicheDescription: true },
  });

  const style = data.style && isValidStyle(data.style) ? data.style : DEFAULT_STYLE;

  const splitResult = await splitCaptionIntoSlides({
    niche: cfg?.nicheDescription || '',
    userName: user.name || user.email.split('@')[0] || 'эксперт',
    caption,
    fitWhy,
    slidesCount: data.slidesCount,
    styleId: style,
  });
  if (!splitResult.ok) {
    return NextResponse.json(
      { error: 'split_failed', message: splitResult.error },
      { status: 502 },
    );
  }

  const draft = await prisma.carouselDraft.create({
    data: {
      userId: user.id,
      parserItemId: parserItem?.id ?? null,
      coverAvatarId,
      slidesCount: splitResult.slides.length,
      slides: splitResult.slides,
      style,
      status: 'draft',
    },
  });

  // Помечаем parser-item как used (как делает rewrite-flow для рилсов).
  if (parserItem) {
    await prisma.parserItem.update({
      where: { id: parserItem.id },
      data: { status: 'used' },
    });
  }

  return NextResponse.json({
    ok: true,
    draftId: draft.id,
    slides: splitResult.slides,
    coverAvatarId,
  });
}

export async function GET(req: NextRequest) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const drafts = await prisma.carouselDraft.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({ drafts });
}
