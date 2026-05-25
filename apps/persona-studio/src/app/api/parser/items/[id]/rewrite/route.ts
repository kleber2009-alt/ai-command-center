// POST /api/parser/items/:id/rewrite — переписать caption «залетевшего»
// поста в reels-сценарий (хук → боль → раскрытие → CTA) через Claude,
// сохранить в ParserItem.rewrittenScript, поднять status='used'.
//
// Идемпотентность: если rewrittenScript уже есть и не пришёл ?force=1 —
// возвращаем кэш без повторного вызова Claude.
//
// Без явного списания токенов: одна Claude-генерация ~600 input + 400 output
// токенов = копейки, пакетим в общий cost модели. Если станет дорого —
// добавим chargeTokens здесь.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rewriteScript, isClaudeConfigured } from '@/lib/parser/claude';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = auth.user;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const force = req.nextUrl.searchParams.get('force') === '1';

  const item = await prisma.parserItem.findFirst({
    where: { id, userId: user.id },
  });
  if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Кэш — повторный клик «Создать видео» без force отдаёт уже написанный
  // сценарий моментально, без оплаты Claude.
  if (item.rewrittenScript && !force) {
    if (item.status !== 'used') {
      await prisma.parserItem.update({ where: { id }, data: { status: 'used' } });
    }
    return NextResponse.json({
      ok: true,
      cached: true,
      script: item.rewrittenScript,
      parserItemId: id,
    });
  }

  if (!isClaudeConfigured()) {
    return NextResponse.json(
      { error: 'claude_not_configured', message: 'ANTHROPIC_API_KEY не задан в окружении сервера.' },
      { status: 503 },
    );
  }

  const cfg = await prisma.parserConfig.findUnique({ where: { userId: user.id } });
  const niche = cfg?.nicheDescription || '';

  const result = await rewriteScript({
    niche,
    userName: user.name || user.email.split('@')[0] || 'эксперт',
    caption: item.caption || '',
    fitWhy: item.fitWhy,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: 'rewrite_failed', message: result.error },
      { status: 502 },
    );
  }

  await prisma.parserItem.update({
    where: { id },
    data: { rewrittenScript: result.script, status: 'used' },
  });

  return NextResponse.json({
    ok: true,
    cached: false,
    script: result.script,
    parserItemId: id,
  });
}
