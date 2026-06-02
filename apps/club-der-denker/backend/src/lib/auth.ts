import { NextRequest } from 'next/server';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Minimal auth primitives (spec 3.2). Scaffold uses signed stateless tokens;
 * swap for Auth.js / Supabase Auth or a sessions table before production.
 * Passwords are hashed with scrypt (modern, salted) — never store plaintext.
 */

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

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

export function issueToken(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export interface AuthResult {
  ok: boolean;
  userId?: string;
}

export async function requireUser(req: NextRequest): Promise<AuthResult> {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return { ok: false };

  const [payload, sig] = token.split('.');
  if (!payload || !sig) return { ok: false };

  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    return { ok: false };
  }

  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof exp !== 'number' || exp < Date.now() / 1000) return { ok: false };
    return { ok: true, userId: sub };
  } catch {
    return { ok: false };
  }
}
