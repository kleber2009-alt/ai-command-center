// POST /api/research/reels/:id/forge — мост Research → Video pipeline.
// Берёт ResearchReel, создаёт синтетический ParserRun + ParserItem и
// готовит сценарий по выбранному режиму, затем форма создания видео
// подхватывает rewrittenScript из ParserItem (этот pipeline уже работает).
//
// Body: { mode?: 'niche' | 'uniquify' | 'transcript' }  (default 'niche')
//   - niche      — новый сценарий под нишу/голос юзера (Claude rewriteScript)
//   - uniquify   — рерайт исходного текста: тот же смысл и язык, другие слова
//   - transcript — дословный текст из транскрипта (без переписывания)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rewriteScript, uniquifyScript, isClaudeConfigured } from '@/lib/parser/claude';

export const runtime = 'nodejs';
export const maxDuration = 90;

const FORGE_RUN_SUFFIX = '· Forge bridge';

const Body = z.object({
  mode: z.enum(['niche', 'uniquify', 'transcript']).default('niche'),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const mode = parsed.success ? parsed.data.mode : 'niche';

  const reel = await prisma.researchReel.findUnique({
    where: { id },
    include: {
      author: true,
      analyses: { where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 1 },
      transcripts: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!reel) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const transcript = reel.transcripts[0] || null;

  // Создаём ParserRun-обёртку (synthetic) или переиспользуем последнюю
  // forge-обёртку юзера за сутки.
  const recentForgeRun = await prisma.parserRun.findFirst({
    where: {
      userId: user.id,
      errorMsg: FORGE_RUN_SUFFIX,
      startedAt: { gte: new Date(Date.now() - 86_400_000) },
    },
    orderBy: { startedAt: 'desc' },
  });
  const run = recentForgeRun
    ? recentForgeRun
    : await prisma.parserRun.create({
        data: {
          userId: user.id,
          status: 'completed',
          postsScanned: 0,
          reelsFound: 0,
          carouselsFound: 0,
          errorMsg: FORGE_RUN_SUFFIX,
          completedAt: new Date(),
        },
      });

  // ParserItem идемпотентен по (userId, url) — переиспользуем, если есть.
  let item = await prisma.parserItem.findFirst({
    where: { userId: user.id, url: reel.url },
    orderBy: { createdAt: 'desc' },
  });
  if (!item) {
    item = await prisma.parserItem.create({
      data: {
        userId: user.id,
        runId: run.id,
        url: reel.url,
        shortcode: reel.externalId,
        kind: 'reel',
        owner: reel.author.username,
        thumbnailUrl: reel.thumbnailUrl,
        caption: reel.caption,
        plays: reel.views,
        likes: reel.likes,
        comments: reel.comments,
        ageHours: reel.postedAt
          ? Math.round((Date.now() - reel.postedAt.getTime()) / 3_600_000)
          : 0,
        velocityScore: (reel.viralScore || 0) / 100,
        fitScore: reel.analyses[0]
          ? Math.round(
              ((Array.isArray(reel.analyses[0].hooks as unknown[]) &&
                (reel.analyses[0].hooks as Array<{ strength?: number }>)[0]?.strength) ||
                7),
            )
          : null,
        fitWhy: reel.analyses[0]?.whyViral?.slice(0, 200) || null,
        status: 'new',
      },
    });
  }

  // ── Готовим текст сценария по режиму ──────────────────────────────
  let script: string | null = null;

  if (mode === 'transcript') {
    if (!transcript?.text) {
      return NextResponse.json(
        { error: 'no_transcript', message: 'Сначала закажи транскрибацию ролика.' },
        { status: 422 },
      );
    }
    script = transcript.text;
  } else if (mode === 'uniquify') {
    const source = (transcript?.text || reel.caption || '').trim();
    if (!source) {
      return NextResponse.json(
        { error: 'no_source_text', message: 'Нет исходного текста: закажи транскрибацию.' },
        { status: 422 },
      );
    }
    if (!isClaudeConfigured()) {
      return NextResponse.json({ ok: true, parserItemId: item.id, script: null, mode, note: 'claude_not_configured' });
    }
    const result = await uniquifyScript({ text: source });
    if (!result.ok) {
      return NextResponse.json({ error: 'uniquify_failed', message: result.error }, { status: 502 });
    }
    script = result.script;
  } else {
    // mode === 'niche'
    if (!isClaudeConfigured()) {
      return NextResponse.json({ ok: true, parserItemId: item.id, script: null, mode, note: 'claude_not_configured' });
    }
    const cfg = await prisma.parserConfig.findUnique({ where: { userId: user.id } });
    const result = await rewriteScript({
      niche: cfg?.nicheDescription || '',
      userName: user.name || user.email.split('@')[0] || 'эксперт',
      caption: reel.caption || '',
      fitWhy: item.fitWhy,
    });
    if (!result.ok) {
      return NextResponse.json({ error: 'rewrite_failed', message: result.error }, { status: 502 });
    }
    script = result.script;
  }

  await prisma.parserItem.update({
    where: { id: item.id },
    data: { rewrittenScript: script, status: 'used' },
  });

  return NextResponse.json({ ok: true, parserItemId: item.id, script, mode });
}
