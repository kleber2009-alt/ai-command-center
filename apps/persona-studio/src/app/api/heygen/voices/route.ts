// GET /api/heygen/voices — voices of the owner's HeyGen account: private clones
// first, then the public Russian and English library (?fresh=1 skips the cache).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { refreshAppSettings } from '@/lib/app-settings';
import { listHeygenVoices } from '@/lib/heygen-account';
import { heygenListError } from '@/lib/heygen-http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  await refreshAppSettings();
  try {
    const voices = await listHeygenVoices({ fresh: req.nextUrl.searchParams.get('fresh') === '1' });
    return NextResponse.json({ voices });
  } catch (e) {
    return heygenListError(e);
  }
}
