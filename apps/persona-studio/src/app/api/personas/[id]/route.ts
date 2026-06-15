// GET    /api/personas/:id — одна персона
// PATCH  /api/personas/:id — обновить поля / сделать дефолтной
// DELETE /api/personas/:id — удалить (с переносом дефолта на свежую, если нужно)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PERSONA_INCLUDE, serializePersona } from '@/lib/studio/persona';

export const runtime = 'nodejs';

const brandSchema = z
  .object({
    primary: z.string().max(32).optional(),
    accent: z.string().max(32).optional(),
    fontHeading: z.string().max(120).optional(),
    fontBody: z.string().max(120).optional(),
    logoUrl: z.string().url().max(2000).optional(),
  })
  .partial();

const toneSchema = z
  .object({
    examples: z.array(z.string().max(2000)).max(20).optional(),
    taboo: z.array(z.string().max(80)).max(100).optional(),
    length: z.enum(['short', 'medium', 'long']).optional(),
  })
  .partial();

const patchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    avatarId: z.string().cuid().nullable().optional(),
    avatarModelRef: z.string().max(2000).nullable().optional(),
    voiceId: z.string().max(200).nullable().optional(),
    voiceProvider: z.string().max(40).optional(),
    lang: z.string().min(2).max(8).optional(),
    brand: brandSchema.optional(),
    tone: toneSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;
  const persona = await prisma.persona.findFirst({
    where: { id, userId: ctx.user.id },
    include: PERSONA_INCLUDE,
  });
  if (!persona) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, persona: serializePersona(persona) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const current = await prisma.persona.findFirst({
    where: { id, userId: ctx.user.id },
    select: { id: true },
  });
  if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'bad_request', details: String(e) }, { status: 400 });
  }

  if (body.avatarId) {
    const owned = await prisma.avatar.findFirst({
      where: { id: body.avatarId, userId: ctx.user.id },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: 'avatar_not_found' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.avatarId !== undefined) data.avatarId = body.avatarId;
  if (body.avatarModelRef !== undefined) data.avatarModelRef = body.avatarModelRef;
  if (body.voiceId !== undefined) data.voiceId = body.voiceId;
  if (body.voiceProvider !== undefined) data.voiceProvider = body.voiceProvider;
  if (body.lang !== undefined) data.lang = body.lang;
  if (body.brand !== undefined) data.brand = body.brand;
  if (body.tone !== undefined) data.tone = body.tone;

  const persona = await prisma.$transaction(async (tx) => {
    // Перевод дефолта: снять флаг с остальных, поставить на текущую.
    if (body.isDefault === true) {
      await tx.persona.updateMany({
        where: { userId: ctx.user.id, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
      data.isDefault = true;
    } else if (body.isDefault === false) {
      data.isDefault = false;
    }
    return tx.persona.update({ where: { id }, data, include: PERSONA_INCLUDE });
  });

  return NextResponse.json({ ok: true, persona: serializePersona(persona) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const persona = await prisma.persona.findFirst({
    where: { id, userId: ctx.user.id },
    select: { id: true, isDefault: true },
  });
  if (!persona) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.persona.delete({ where: { id } });
    // Если удалили дефолтную — назначаем дефолтом самую свежую из оставшихся.
    if (persona.isDefault) {
      const next = await tx.persona.findFirst({
        where: { userId: ctx.user.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (next) {
        await tx.persona.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
