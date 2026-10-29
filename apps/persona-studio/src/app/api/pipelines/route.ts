// GET  /api/pipelines — the user's branches («Мои ветки»), newest first.
// POST /api/pipelines — start a branch, usually from a «Мой блог» item
//      ({ parserItemId, kind }). Idempotent per (parserItemId, kind): a second
//      «Уникализировать» on the same post opens the existing branch.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pipelineView } from '@/lib/pipeline/server';

export const runtime = 'nodejs';

const Body = z.object({
  parserItemId: z.string().min(1).optional(),
  kind: z.enum(['reel', 'carousel']).optional(),
  title: z.string().trim().max(200).optional(),
  sourceText: z.string().trim().max(20_000).optional(),
});

/** First line of a caption, trimmed to a card title. */
function titleFrom(caption: string | null | undefined): string | null {
  const line = (caption ?? '').split('\n').map((l) => l.trim()).find(Boolean);
  if (!line) return null;
  return line.length > 90 ? `${line.slice(0, 87)}…` : line;
}

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const kind = sp.get('kind');
  const limit = Math.min(Number(sp.get('limit') ?? 60) || 60, 200);
  const rows = await prisma.pipeline.findMany({
    where: { userId: ctx.user.id, ...(kind === 'reel' || kind === 'carousel' ? { kind } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  const pipelines = await Promise.all(rows.map((p) => pipelineView(p)));
  return NextResponse.json({ pipelines });
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const userId = ctx.user.id;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  let kind = data.kind;
  let title = data.title ?? null;
  let sourceText = data.sourceText ?? null;

  if (data.parserItemId) {
    const item = await prisma.parserItem.findFirst({ where: { id: data.parserItemId, userId } });
    if (!item) return NextResponse.json({ error: 'parser_item_not_found' }, { status: 404 });
    kind = kind ?? (item.kind === 'carousel' ? 'carousel' : 'reel');
    const existing = await prisma.pipeline.findFirst({
      where: { userId, parserItemId: item.id, kind },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return NextResponse.json({ ok: true, existing: true, pipeline: await pipelineView(existing) });
    }
    title = title ?? titleFrom(item.caption);
    // the caption is a placeholder; /script replaces it with the reel transcript
    sourceText = sourceText ?? item.caption ?? null;
  }
  if (!kind) return NextResponse.json({ error: 'bad_body', message: 'Укажите тип ветки: рилс или карусель.' }, { status: 400 });

  const created = await prisma.pipeline.create({
    data: {
      userId,
      kind,
      stage: 'source',
      parserItemId: data.parserItemId ?? null,
      title,
      sourceText,
    },
  });
  return NextResponse.json({ ok: true, pipeline: await pipelineView(created) }, { status: 201 });
}
