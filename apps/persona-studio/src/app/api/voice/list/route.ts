// GET /api/voice/list — голоса пользователя (клоны) для пикера в персоне.
// Нейтрально, без бренда провайдера.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { listClonedVoices } from '@/lib/elevenlabs';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const voices = await listClonedVoices();
  return NextResponse.json({ ok: true, voices });
}
