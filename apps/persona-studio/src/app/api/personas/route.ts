// GET  /api/personas — список персон юзера (дефолтная первой)
// POST /api/personas — создать персону (Мастер-ТЗ §3, Модуль A)

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

const createSchema = z.object({
  name: z.string().min(1).max(120),
  avatarId: z.string().cuid().nullable().optional(),
  avatarModelRef: z.string().max(2000).nullable().optional(),
  voiceId: z.string().max(200).nullable().optional(),
  voiceProvider: z.string().max(40).optional(),
  lang: z.string().min(2).max(8).optional(),
  brand: brandSchema.optional(),
  tone: toneSchema.optional(),
  isDefault: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const personas = await prisma.persona.findMany({
    where: { userId: ctx.user.id },
    include: PERSONA_INCLUDE,
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json({ ok: true, personas: personas.map(serializePersona) });
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

  // Аватар, если указан, должен принадлежать юзеру.
  if (body.avatarId) {
    const owned = await prisma.avatar.findFirst({
      where: { id: body.avatarId, userId: ctx.user.id },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: 'avatar_not_found' }, { status: 400 });
  }

  // Первая персона юзера всегда дефолтная.
  const existing = await prisma.persona.count({ where: { userId: ctx.user.id } });
  const makeDefault = body.isDefault === true || existing === 0;

  const persona = await prisma.$transaction(async (tx) => {
    if (makeDefault) {
      await tx.persona.updateMany({
        where: { userId: ctx.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.persona.create({
      data: {
        userId: ctx.user.id,
        name: body.name,
        avatarId: body.avatarId ?? null,
        avatarModelRef: body.avatarModelRef ?? null,
        voiceId: body.voiceId ?? null,
        voiceProvider: body.voiceProvider ?? 'elevenlabs',
        lang: body.lang ?? 'ru',
        brand: body.brand ?? {},
        tone: body.tone ?? {},
        isDefault: makeDefault,
      },
      include: PERSONA_INCLUDE,
    });
  });

  return NextResponse.json({ ok: true, persona: serializePersona(persona) }, { status: 201 });
}
