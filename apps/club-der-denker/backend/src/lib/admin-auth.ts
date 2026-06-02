import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createHmac, scryptSync, timingSafeEqual, randomBytes } from 'crypto';
import { serviceClient } from './supabase/server';

/**
 * Admin authentication (spec 6). A signed, httpOnly session cookie carries the
 * admin id. Admins live in cdd_admins; a single admin can be bootstrapped from
 * ADMIN_EMAIL / ADMIN_PASSWORD env on first login.
 */
const COOKIE = 'cdd_admin';
const TTL_SECONDS = 60 * 60 * 12; // 12h

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is required');
  return s;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function sign(adminId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ sub: adminId, exp })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verify(token: string): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof exp !== 'number' || exp < Date.now() / 1000) return null;
    return sub as string;
  } catch {
    return null;
  }
}

/** Validate credentials, bootstrapping the env admin if the table is empty. */
export async function authenticateAdmin(email: string, password: string): Promise<string | null> {
  const db = serviceClient();
  const { data: admin } = await db.from('cdd_admins').select('id, password_hash').eq('email', email).maybeSingle();

  if (admin) {
    return verifyPassword(password, admin.password_hash) ? admin.id : null;
  }

  // Bootstrap: allow the env-configured admin and persist it on first login.
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD &&
      email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    const { data } = await db
      .from('cdd_admins')
      .insert({ email, password_hash: hashPassword(password) })
      .select('id')
      .single();
    return data?.id ?? null;
  }

  return null;
}

export function setSessionCookie(adminId: string) {
  cookies().set(COOKIE, sign(adminId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

/** Returns the admin id if the request carries a valid session, else null. */
export function currentAdmin(): string | null {
  const token = cookies().get(COOKIE)?.value;
  return token ? verify(token) : null;
}

/**
 * API-route guard. Returns a 401 response when there is no valid admin session,
 * or null when the request may proceed:
 *
 *   const denied = adminGuard();
 *   if (denied) return denied;
 */
export function adminGuard(): NextResponse | null {
  if (!currentAdmin()) {
    return NextResponse.json({ ok: false, error: { message: 'unauthorized' } }, { status: 401 });
  }
  return null;
}
