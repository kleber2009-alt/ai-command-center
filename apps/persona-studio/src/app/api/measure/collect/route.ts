// POST /api/measure/collect — по запросу собрать метрики опубликованных постов
// пользователя из API площадок (сейчас: Instagram через PostMyPost).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { collectForUser } from '@/lib/measure/collect';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const result = await collectForUser(ctx.user.id);
  return NextResponse.json({ ok: true, ...result });
}
