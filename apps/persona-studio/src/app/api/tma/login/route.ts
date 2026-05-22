// Telegram Mini App login: verify initData, find/create User by telegramId,
// create a NextAuth-compatible Session row + set the session cookie so the
// rest of the app sees the user as authenticated via the standard auth() helper.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyInitData, TelegramError } from '@/lib/telegram-tma';
import { creditTokens } from '@/lib/tokens';

export const runtime = 'nodejs';

const Body = z.object({ initData: z.string().min(1) });

const SESSION_TTL_DAYS = 30;
const SIGNUP_BONUS = Number(process.env.SIGNUP_BONUS_TOKENS ?? 10);

function cookieName(): string {
  const url = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? '';
  const secure = url.startsWith('https://');
  return `${secure ? '__Secure-' : ''}authjs.session-token`;
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }

  let verified;
  try {
    verified = verifyInitData(parsed.data.initData);
  } catch (e) {
    const code = e instanceof TelegramError ? e.code : 'VERIFY_FAILED';
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: code, detail: msg }, { status: 401 });
  }

  const tg = verified.user;
  const tgIdStr = String(tg.id);
  const displayName = [tg.first_name, tg.last_name].filter(Boolean).join(' ').trim() || tg.username || `tg_${tgIdStr}`;
  const placeholderEmail = `tg_${tgIdStr}@persona-studio.tg`;

  // Find or create the User row.
  let user = await prisma.user.findUnique({ where: { telegramId: tgIdStr } });

  if (!user) {
    // Fresh TG user → create with signup bonus.
    user = await prisma.user.create({
      data: {
        email: placeholderEmail,
        emailVerified: new Date(),                  // verified by Telegram identity
        name: displayName,
        image: tg.photo_url ?? null,
        telegramId: tgIdStr,
        telegramHandle: tg.username ?? null,
      },
    });
    if (SIGNUP_BONUS > 0) {
      await creditTokens({
        userId: user.id,
        amount: SIGNUP_BONUS,
        type: 'signup_bonus',
        reason: 'welcome:tma',
      });
    }
  } else {
    // Refresh handle / display name if changed.
    const patch: Record<string, unknown> = {};
    if (tg.username && user.telegramHandle !== tg.username) patch.telegramHandle = tg.username;
    if (displayName && user.name !== displayName) patch.name = displayName;
    if (tg.photo_url && user.image !== tg.photo_url) patch.image = tg.photo_url;
    if (Object.keys(patch).length > 0) {
      await prisma.user.update({ where: { id: user.id }, data: patch });
    }
  }

  // Create a database-backed session compatible with NextAuth PrismaAdapter.
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { sessionToken, userId: user.id, expires },
  });

  const jar = await cookies();
  const url = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? '';
  jar.set({
    name: cookieName(),
    value: sessionToken,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: url.startsWith('https://'),
    expires,
  });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, balance: user.tokenBalance },
  });
}
