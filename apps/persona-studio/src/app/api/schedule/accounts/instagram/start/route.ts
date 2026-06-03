// GET /api/schedule/accounts/instagram/start — kick off Facebook Login OAuth.
// Requires a logged-in session. We sign the userId into `state` (HMAC) so the
// callback can trust it without a server-side session lookup.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { instagramConfigured, oauthStartUrl } from '@/lib/publish/instagram';
import { tokenCryptoReady } from '@/lib/publish/crypto';
import { signState } from '@/lib/publish/oauth-state';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.redirect(new URL('/sign-in', _req.url));
  }

  if (!instagramConfigured() || !tokenCryptoReady()) {
    return NextResponse.redirect(new URL('/schedule?error=ig_not_configured', _req.url));
  }

  const state = signState(user.id);
  return NextResponse.redirect(oauthStartUrl(state));
}
