// GET /api/owner-login?key=<OWNER_LOGIN_KEY> — personal sign-in link for the
// studio owner, no e-mail round-trip. Opens a 30-day database session for
// OWNER_EMAIL (made admin) and redirects to the dashboard. Disabled unless both env vars
// are set; the key is a 32-byte random secret generated on the server
// (deploy/login-link.sh). Wrong key → plain 404, compared in constant time.

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSION_DAYS = 30;

function keyMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const expected = process.env.OWNER_LOGIN_KEY;
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const given = req.nextUrl.searchParams.get('key') ?? '';
  if (!expected || expected.length < 32 || !email || !keyMatches(given, expected)) {
    return new NextResponse('Not found', { status: 404 });
  }

  // The owner is the studio admin (sidebar «Админ», token top-ups).
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'admin' },
    create: {
      email,
      emailVerified: new Date(),
      role: 'admin',
      tokenBalance: Number(process.env.SIGNUP_BONUS_TOKENS ?? 10),
    },
  });

  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });

  // Behind Caddy the request reaches Next over http; the public origin is https.
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host;
  const secure = proto === 'https';
  const res = NextResponse.redirect(`${proto}://${host}/dashboard`);
  // Auth.js reads __Secure-authjs.session-token on https, authjs.session-token on http.
  res.cookies.set(secure ? '__Secure-authjs.session-token' : 'authjs.session-token', sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires,
  });
  return res;
}
