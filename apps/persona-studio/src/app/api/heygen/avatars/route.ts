// GET /api/heygen/avatars — looks from the owner's HeyGen account (private
// first; ?public=1 adds a page of the public library; ?fresh=1 skips the
// 5-minute cache). Listing is free on the HeyGen side.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { refreshAppSettings } from '@/lib/app-settings';
import { listHeygenAvatars } from '@/lib/heygen-account';
import { heygenListError } from '@/lib/heygen-http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  await refreshAppSettings();
  const sp = req.nextUrl.searchParams;
  try {
    const avatars = await listHeygenAvatars({ includePublic: sp.get('public') === '1', fresh: sp.get('fresh') === '1' });
    return NextResponse.json({ avatars });
  } catch (e) {
    return heygenListError(e);
  }
}
