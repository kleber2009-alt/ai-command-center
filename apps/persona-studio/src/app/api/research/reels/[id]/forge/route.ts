// POST /api/research/reels/:id/forge — мост Research → Video pipeline.
// Берёт ResearchReel, создаёт синтетический ParserRun + ParserItem
// и сразу запускает rewrite (Claude) чтобы вернуть готовый сценарий.
//
// Это нужно потому, что весь pipeline "VideoForm подхватывает
// rewrittenScript из ParserItem" уже существует и работает. Не
// дублируем сценарист-логику.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rewriteScript, isClaudeConfigured } from '@/lib/parser/claude';

export const runtime = 'nodejs';
export const maxDuration = 90;

const FORGE_RUN_SUFFIX = '· Forge bridge';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;
  const { id } = await params;

  const reel = await prisma.researchReel.findUnique({
    where: { id },
    include: { author: true, analyses: { where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!reel) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Идемпотентность: если у юзера уже есть ParserItem для этого reel
  // (по URL), переиспользуем его
  const existing = await prisma.parserItem.findFirst({
    where: { userId: user.id, url: reel.url },
    orderBy: { createdAt: 'desc' },
  });
  if (existing && existing.rewrittenScript) {
    return NextResponse.json({
      ok: true,
      cached: true,
      parserItemId: existing.id,
      script: existing.rewrittenScript,
    });
  }

  // Создаём ParserRun-обёртку (synthetic, не настоящий парсер-прогон)
  // или переиспользуем последнюю forge-обёртку юзера за последние сутки
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
          // Мягкий маркер — отличает Forge-обёртки от настоящих run'ов
          errorMsg: FORGE_RUN_SUFFIX,
          completedAt: new Date(),
        },
      });

  // Создаём ParserItem из ResearchReel
  let item = existing;
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
        velocityScore: (reel.viralScore || 0) / 100, // нормировка 0..1
        // Если у юзера есть анализ — подставим fit-score из silaы лучшего хука
        fitScore: reel.analyses[0]
          ? Math.round(
              ((Array.isArray((reel.analyses[0].hooks as unknown[])) &&
                ((reel.analyses[0].hooks as Array<{ strength?: number }>)[0]?.strength)) ||
                7),
            )
          : null,
        fitWhy: reel.analyses[0]?.whyViral?.slice(0, 200) || null,
        status: 'new',
      },
    });
  }

  // Запускаем rewrite (Claude) для готового сценария
  if (!isClaudeConfigured()) {
    return NextResponse.json({
      ok: true,
      parserItemId: item.id,
      script: null,
      note: 'claude_not_configured — сценарий не сгенерирован, но ParserItem создан.',
    });
  }
  const cfg = await prisma.parserConfig.findUnique({ where: { userId: user.id } });
  const niche = cfg?.nicheDescription || '';

  const result = await rewriteScript({
    niche,
    userName: user.name || user.email.split('@')[0] || 'эксперт',
    caption: reel.caption || '',
    fitWhy: item.fitWhy,
  });
  if (!result.ok) {
    return NextResponse.json({
      ok: true,
      parserItemId: item.id,
      script: null,
      error: result.error,
    });
  }

  await prisma.parserItem.update({
    where: { id: item.id },
    data: { rewrittenScript: result.script, status: 'used' },
  });

  return NextResponse.json({
    ok: true,
    cached: false,
    parserItemId: item.id,
    script: result.script,
  });
}
