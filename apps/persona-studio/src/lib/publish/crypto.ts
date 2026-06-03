// AES-256-GCM encryption for long-lived OAuth tokens at rest.
//
// Instagram Graph API long-lived tokens (~60 days) grant full publishing
// access to a user's IG business account — they must never be stored in
// plaintext in SocialAccount.accessToken. Key comes from PUBLISH_TOKEN_SECRET
// (32 bytes, base64 or hex or raw utf-8). Format on disk:
//   v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';

const ALGO = 'aes-256-gcm';
const PREFIX = 'v1';

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenCryptoError';
  }
}

/** Derive a 32-byte key from PUBLISH_TOKEN_SECRET (base64 → hex → utf-8 fallbacks). */
function key(): Buffer {
  const secret = env.PUBLISH_TOKEN_SECRET;
  if (!secret) throw new TokenCryptoError('PUBLISH_TOKEN_SECRET not set');

  // Try base64, then hex, then raw utf-8 — accept whichever yields 32 bytes.
  for (const enc of ['base64', 'hex'] as const) {
    try {
      const buf = Buffer.from(secret, enc);
      if (buf.length === 32) return buf;
    } catch {
      /* keep trying */
    }
  }
  const utf8 = Buffer.from(secret, 'utf-8');
  if (utf8.length === 32) return utf8;

  throw new TokenCryptoError(
    'PUBLISH_TOKEN_SECRET must decode to exactly 32 bytes (base64/hex) or be a 32-char string',
  );
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptToken(blob: string): string {
  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new TokenCryptoError('malformed encrypted token');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf-8');
}

/** True when a 32-byte secret is configured — gate IG connect on this. */
export function tokenCryptoReady(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}
