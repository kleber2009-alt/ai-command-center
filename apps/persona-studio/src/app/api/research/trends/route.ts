// GET /api/research/trends?niche=<tag|all>&window=7|30 — Модуль F (§8).
// Тренды ниши: топ аудио, архетипы хуков, растущие форматы/темы.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { computeTrends, type TrendWindow } from '@/lib/research/trends';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const niche = (req.nextUrl.searchParams.get('niche') || 'all').slice(0, 80);
  const windowRaw = Number(req.nextUrl.searchParams.get('window'));
  const windowDays: TrendWindow = windowRaw === 30 ? 30 : 7;

  const trends = await computeTrends({ niche, windowDays, now: Date.now() });
  return NextResponse.json({ ok: true, trends });
}
