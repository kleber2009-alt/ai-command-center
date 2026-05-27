// GET / PATCH / DELETE /api/carousels/draft/:id — конкретный черновик
// карусели. PATCH принимает редактирование слайдов и/или смену
// coverAvatarId. Pure-JSON update, никакой Claude-magic здесь нет.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isValidStyle } from '@/lib/carousel/styles';

export const runtime = 'nodejs';

const SlideSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  accent: z.string().max(120).optional(),
  image: z.string().url().max(500).optional(),
});

const PatchBody = z.object({
  slides: z.array(SlideSchema).min(2).max(20).optional(),
  coverAvatarId: z.string().nullable().optional(),
  style: z.string().optional(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserOrApiKey(_req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await ctx.params;
  const draft = await prisma.carouselDraft.findFirst({
    where: { id, userId: auth.user.id },
    include: {
      coverAvatar: { select: { id: true, styleLabel: true, imageUrl: true } },
      parserItem: { select: { id: true, url: true, owner: true, fitScore: true } },
    },
  });
  if (!draft) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ draft });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await prisma.carouselDraft.findFirst({
    where: { id, userId: auth.user.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  // Если меняется coverAvatarId — валидируем что это аватар юзера и он done.
  if (data.coverAvatarId) {
    const avatar = await prisma.avatar.findFirst({
      where: { id: data.coverAvatarId, userId: auth.user.id, status: 'done' },
      select: { id: true },
    });
    if (!avatar) {
      return NextResponse.json({ error: 'bad_avatar' }, { status: 400 });
    }
  }

  if (data.style && !isValidStyle(data.style)) {
    return NextResponse.json({ error: 'bad_style' }, { status: 400 });
  }

  const draft = await prisma.carouselDraft.update({
    where: { id },
    data: {
      ...(data.slides ? { slides: data.slides, slidesCount: data.slides.length } : {}),
      ...(data.coverAvatarId !== undefined ? { coverAvatarId: data.coverAvatarId } : {}),
      ...(data.style ? { style: data.style } : {}),
    },
  });

  return NextResponse.json({ draft });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await prisma.carouselDraft.findFirst({
    where: { id, userId: auth.user.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await prisma.carouselDraft.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
