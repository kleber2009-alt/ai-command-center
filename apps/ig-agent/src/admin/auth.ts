// Stateless HMAC tokens — same scheme as tg-agent so the admin auth
// pattern is consistent across both bots. See apps/tg-agent/src/admin/auth.ts
// for full design notes.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'ig_admin_session';
const MAGIC_TOKEN_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SignedToken {
  token: string;
  expiresAt: number;
}

export function createTokenSigner(secret: string) {
  if (!secret || secret.length < 16) {
    throw new Error('ADMIN_SESSION_SECRET must be at least 16 chars');
  }

  function sign(payload: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  function build(kind: 'magic' | 'session', ttlMs: number): SignedToken {
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = Date.now() + ttlMs;
    const payload = `${kind}.${nonce}.${expiresAt}`;
    const mac = sign(payload);
    return { token: `${kind}.${nonce}.${expiresAt}.${mac}`, expiresAt };
  }

  function verify(kind: 'magic' | 'session', token: string | undefined): boolean {
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 4) return false;
    const k = parts[0];
    const nonce = parts[1];
    const expiresStr = parts[2];
    const mac = parts[3];
    if (!k || !nonce || !expiresStr || !mac) return false;
    if (k !== kind) return false;
    const expiresAt = Number(expiresStr);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
    const expected = sign(`${k}.${nonce}.${expiresAt}`);
    const a = Buffer.from(mac, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  return {
    issueMagic(): SignedToken {
      return build('magic', MAGIC_TOKEN_TTL_MS);
    },
    issueSession(): SignedToken {
      return build('session', SESSION_TTL_MS);
    },
    verifyMagic(token: string | undefined): boolean {
      return verify('magic', token);
    },
    verifySession(token: string | undefined): boolean {
      return verify('session', token);
    },
  };
}

export type TokenSigner = ReturnType<typeof createTokenSigner>;

export function createThrottle(windowMs = 30_000) {
  let lastAt = 0;
  return {
    take(): boolean {
      const now = Date.now();
      if (now - lastAt < windowMs) return false;
      lastAt = now;
      return true;
    },
  };
}

export function buildSessionCookie(token: string, secure: boolean): string {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function buildClearCookie(secure: boolean): string {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

// Constant-time compare for basic-auth fallback.
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
