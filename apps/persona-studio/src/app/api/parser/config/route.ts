// GET/POST /api/parser/config — настройки парсера юзера: ниша, конкуренты,
// хэштеги, пороги. Одна запись на юзера (unique userId). POST делает upsert.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const HANDLE_RE = /^[a-zA-Z0-9._]{1,30}$/;
const TAG_RE = /^[a-zA-Z0-9_]{1,50}$/;

const normalizeHandles = (arr: string[]) =>
  Array.from(
    new Set(
      arr
        .map((s) => s.trim().replace(/^@+/, '').toLowerCase())
        .filter((s) => HANDLE_RE.test(s)),
    ),
  );

const normalizeTags = (arr: string[]) =>
  Array.from(
    new Set(
      arr
        .map((s) => s.trim().replace(/^#+/, '').toLowerCase())
        .filter((s) => TAG_RE.test(s)),
    ),
  );

const Body = z.object({
  nicheDescription: z.string().max(500).optional().nullable(),
  competitors: z.array(z.string()).max(50).optional().default([]),
  hashtags: z.array(z.string()).max(20).optional().default([]),
  postedWithinDays: z.number().int().min(1).max(30).optional(),
  perTargetLimit: z.number().int().min(5).max(100).optional(),
  minPlays: z.number().int().min(0).optional(),
  minLikes: z.number().int().min(0).optional(),
  minComments: z.number().int().min(0).optional(),
  minShares: z.number().int().min(0).optional(),
  reelsCount: z.number().int().min(1).max(20).optional(),
  carouselsCount: z.number().int().min(1).max(20).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const config = await prisma.parserConfig.findUnique({ where: { userId: ctx.user.id } });
  return NextResponse.json({ config });
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  const competitors = data.competitors ? normalizeHandles(data.competitors) : undefined;
  const hashtags = data.hashtags ? normalizeTags(data.hashtags) : undefined;

  const config = await prisma.parserConfig.upsert({
    where: { userId: ctx.user.id },
    create: {
      userId: ctx.user.id,
      nicheDescription: data.nicheDescription ?? null,
      competitors: competitors ?? [],
      hashtags: hashtags ?? [],
      postedWithinDays: data.postedWithinDays ?? 7,
      perTargetLimit: data.perTargetLimit ?? 25,
      minPlays: data.minPlays ?? 100000,
      minLikes: data.minLikes ?? 0,
      minComments: data.minComments ?? 1000,
      minShares: data.minShares ?? 1000,
      reelsCount: data.reelsCount ?? 5,
      carouselsCount: data.carouselsCount ?? 5,
      enabled: data.enabled ?? true,
    },
    update: {
      nicheDescription: data.nicheDescription ?? undefined,
      competitors,
      hashtags,
      postedWithinDays: data.postedWithinDays,
      perTargetLimit: data.perTargetLimit,
      minPlays: data.minPlays,
      minLikes: data.minLikes,
      minComments: data.minComments,
      minShares: data.minShares,
      reelsCount: data.reelsCount,
      carouselsCount: data.carouselsCount,
      enabled: data.enabled,
    },
  });

  return NextResponse.json({ config });
}
