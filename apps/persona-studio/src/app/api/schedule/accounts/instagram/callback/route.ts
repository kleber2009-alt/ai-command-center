// GET /api/schedule/accounts/instagram/callback?code=…&state=…
//
// OAuth redirect target. Exchanges code → long-lived token, discovers the IG
// business account, stores it (token encrypted) as a SocialAccount, then
// redirects back to /schedule.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  exchangeCode,
  toLongLivedToken,
  discoverIgAccount,
  InstagramError,
} from '@/lib/publish/instagram';
import { encryptToken } from '@/lib/publish/crypto';
import { verifyState } from '@/lib/publish/oauth-state';

export const runtime = 'nodejs';

function back(req: NextRequest, qs: string) {
  return NextResponse.redirect(new URL(`/schedule?${qs}`, req.url));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) return back(req, `error=ig_denied`);
  if (!code || !state) return back(req, 'error=ig_missing_params');

  const userId = verifyState(state);
  if (!userId) return back(req, 'error=ig_bad_state');

  try {
    const shortToken = await exchangeCode(code);
    const { token, expiresInSec } = await toLongLivedToken(shortToken);
    const ig = await discoverIgAccount(token);

    await prisma.socialAccount.upsert({
      where: {
        userId_platform_externalId: {
          userId,
          platform: 'instagram',
          externalId: ig.igUserId,
        },
      },
      create: {
        userId,
        platform: 'instagram',
        displayName: ig.username ? `@${ig.username}` : ig.pageName,
        externalId: ig.igUserId,
        accessToken: encryptToken(token),
        tokenExpiresAt: new Date(Date.now() + expiresInSec * 1000),
        status: 'active',
        meta: { fbPageId: ig.fbPageId, pageName: ig.pageName, igUsername: ig.username },
      },
      update: {
        displayName: ig.username ? `@${ig.username}` : ig.pageName,
        accessToken: encryptToken(token),
        tokenExpiresAt: new Date(Date.now() + expiresInSec * 1000),
        status: 'active',
        meta: { fbPageId: ig.fbPageId, pageName: ig.pageName, igUsername: ig.username },
      },
    });

    return back(req, 'connected=instagram');
  } catch (e) {
    const code = e instanceof InstagramError ? e.code : 'ig_connect_failed';
    return back(req, `error=${encodeURIComponent(code)}`);
  }
}
