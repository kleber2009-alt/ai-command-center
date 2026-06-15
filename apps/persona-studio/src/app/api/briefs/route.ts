// GET  /api/briefs — список брифов юзера (с генерациями)
// POST /api/briefs — создать бриф (Мастер-ТЗ §4). Из находки Research
//   (sourceReelId → «Клонировать формат», структура §2) или с нуля.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { BRIEF_INCLUDE, serializeBrief } from '@/lib/studio/brief';
import { deriveCloneStructure } from '@/lib/studio/clone-brief';

export const runtime = 'nodejs';

const createSchema = z.object({
  personaId: z.string().cuid().nullable().optional(),
  sourceReelId: z.string().cuid().nullable().optional(),
  hookArchetype: z.string().max(120).nullable().optional(),
  format: z.string().max(120).nullable().optional(),
  lengthSec: z.number().int().min(3).max(600).nullable().optional(),
  lang: z.string().min(2).max(8).optional(),
  topic: z.string().max(2000).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const briefs = await prisma.brief.findMany({
    where: { userId: ctx.user.id },
    include: BRIEF_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ ok: true, briefs: briefs.map(serializeBrief) });
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

  // Персона по умолчанию, если не указана.
  let personaId = body.personaId ?? null;
  if (!personaId) {
    const def = await prisma.persona.findFirst({
      where: { userId: ctx.user.id, isDefault: true },
      select: { id: true },
    });
    personaId = def?.id ?? null;
  }
  const personaLang = personaId
    ? (await prisma.persona.findUnique({ where: { id: personaId }, select: { lang: true } }))?.lang
    : undefined;

  // «Клонировать формат»: структура из reel (§2 — только структура, не текст).
  let structure = {
    hookArchetype: body.hookArchetype ?? null,
    format: body.format ?? null,
    lengthSec: body.lengthSec ?? null,
    lang: body.lang ?? personaLang ?? 'ru',
    topic: body.topic ?? null,
  };
  if (body.sourceReelId) {
    const derived = await deriveCloneStructure({
      reelId: body.sourceReelId,
      fallbackLang: personaLang,
    });
    if (!derived) return NextResponse.json({ error: 'source_reel_not_found' }, { status: 400 });
    // Явно переданные поля имеют приоритет над выведенными.
    structure = {
      hookArchetype: body.hookArchetype ?? derived.hookArchetype,
      format: body.format ?? derived.format,
      lengthSec: body.lengthSec ?? derived.lengthSec,
      lang: body.lang ?? derived.lang,
      topic: body.topic ?? derived.topic,
    };
  }

  const brief = await prisma.brief.create({
    data: {
      userId: ctx.user.id,
      personaId,
      sourceReelId: body.sourceReelId ?? null,
      hookArchetype: structure.hookArchetype,
      format: structure.format,
      lengthSec: structure.lengthSec,
      lang: structure.lang,
      topic: structure.topic,
      status: 'draft',
    },
    include: BRIEF_INCLUDE,
  });

  return NextResponse.json({ ok: true, brief: serializeBrief(brief) }, { status: 201 });
}
