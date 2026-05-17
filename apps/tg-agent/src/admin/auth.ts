import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Two stateless token kinds, both HMAC-SHA256 over the same secret:
//
//   <nonce>.<expiresAt>.<hmac>
//
// - "magic" tokens are emailed (well, DM'd) to the owner and grant a
//   single redemption — there's no DB-side revocation, just the TTL.
//   We rely on the short TTL (10 minutes) and the fact that the bot
//   only sends one to OWNER_TELEGRAM_ID.
// - "session" tokens live in an HttpOnly cookie for 7 days and grant
//   access to the admin UI / API. Same shape, longer TTL.
//
// HMAC means we don't need a sessions table — rotating
// ADMIN_SESSION_SECRET invalidates every outstanding token, which is
// the only "logout everywhere" knob.

export const COOKIE_NAME = 'tg_admin_session';
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
    // Constant-time comparison to defeat timing side-channels.
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

// Throttle the magic-link DM so a casual attacker can't spam the
// owner. In-memory is fine: the worst case after a restart is one
// extra DM allowed, and we don't run multiple replicas.
export function createThrottle(windowMs: number = 30_000) {
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

// Cookie serializer with the attributes we want everywhere. `secure`
// is on whenever the request URL is HTTPS — see admin/server.ts for
// the detection.
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
  const attrs = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}
