// Signed OAuth `state` for the Instagram connect flow.
//
// The callback runs without a guaranteed session cookie (it's a top-level
// redirect from facebook.com), so we carry the userId in `state` and sign it
// with HMAC-SHA256 to prevent tampering. Format: <userId>.<ts>.<sig-base64url>.
// Valid for 15 minutes.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

const TTL_MS = 15 * 60_000;

function secret(): string {
  const s = env.AUTH_SECRET || env.PUBLISH_TOKEN_SECRET;
  if (!s) throw new Error('AUTH_SECRET / PUBLISH_TOKEN_SECRET not set for OAuth state signing');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function signState(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the userId if the state is valid & fresh, else null. */
export function verifyState(state: string): string | null {
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [userId, tsStr, sig] = parts;
  const payload = `${userId}.${tsStr}`;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || Date.now() - ts > TTL_MS) return null;
  return userId;
}
