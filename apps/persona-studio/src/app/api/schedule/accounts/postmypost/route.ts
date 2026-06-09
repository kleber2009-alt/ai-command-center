// GET  /api/schedule/accounts/postmypost — list Instagram accounts the user has
//      connected inside PostMyPost (across their projects), for the connect picker.
// POST /api/schedule/accounts/postmypost — link a chosen PostMyPost IG account as
//      a SocialAccount (platform=instagram, externalId=account_id, meta.projectId).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  postmypostConfigured,
  discoverInstagramAccounts,
  PostMyPostError,
} from '@/lib/publish/postmypost';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (!postmypostConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  try {
    const accounts = await discoverInstagramAccounts();
    return NextResponse.json({ accounts });
  } catch (e) {
    const msg = e instanceof PostMyPostError ? e.message : String(e);
    return NextResponse.json({ error: 'postmypost_error', message: msg }, { status: 502 });
  }
}

const Body = z.object({
  accountId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  displayName: z.string().min(1).max(120),
});

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (!postmypostConfigured()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const { accountId, projectId, displayName } = parsed.data;

  // Validate the account actually exists & is connected on PostMyPost's side.
  const available = await discoverInstagramAccounts().catch(() => []);
  const match = available.find((a) => a.accountId === accountId && a.projectId === projectId);
  if (!match) {
    return NextResponse.json({ error: 'account_unavailable' }, { status: 409 });
  }

  const account = await prisma.socialAccount.upsert({
    where: {
      userId_platform_externalId: {
        userId: ctx.user.id,
        platform: 'instagram',
        externalId: String(accountId),
      },
    },
    create: {
      userId: ctx.user.id,
      platform: 'instagram',
      displayName,
      externalId: String(accountId),
      status: 'active',
      meta: { provider: 'postmypost', projectId, login: match.login },
    },
    update: {
      displayName,
      status: 'active',
      meta: { provider: 'postmypost', projectId, login: match.login },
    },
    select: { id: true, platform: true, displayName: true, externalId: true, status: true },
  });

  return NextResponse.json({ ok: true, account }, { status: 201 });
}
