// GET /api/measure — дашборд Measure (Мастер-ТЗ §6): опубликованные посты,
// твой Xn и связь с источником-вдохновением.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { getMeasureDashboard } from '@/lib/measure/measure';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const dashboard = await getMeasureDashboard(ctx.user.id);
  return NextResponse.json({ ok: true, ...dashboard });
}
