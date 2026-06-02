import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Social sign-in token verification (spec 3.2). Apple and Google both issue an
 * OIDC identity token (a JWT) signed with their published JWKS. We verify the
 * signature, issuer, audience and expiry, then return the stable provider
 * subject + email used to find or create the user.
 */
export interface SocialIdentity {
  provider: 'apple' | 'google';
  sub: string; // stable provider user id
  email: string | null;
  emailVerified: boolean;
}

const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/** Comma-separated allowed audiences (iOS / Android / Web client ids). */
function audiences(envVar: string): string[] {
  return (process.env[envVar] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function verifyAppleToken(identityToken: string): Promise<SocialIdentity> {
  const aud = audiences('APPLE_CLIENT_IDS');
  if (process.env.APPLE_BUNDLE_ID) aud.push(process.env.APPLE_BUNDLE_ID);
  if (aud.length === 0) throw new Error('APPLE_CLIENT_IDS / APPLE_BUNDLE_ID not configured');

  const { payload } = await jwtVerify(identityToken, appleJwks, {
    issuer: 'https://appleid.apple.com',
    audience: aud,
  });

  return {
    provider: 'apple',
    sub: String(payload.sub),
    email: (payload.email as string) ?? null,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
  };
}

export async function verifyGoogleToken(identityToken: string): Promise<SocialIdentity> {
  const aud = audiences('GOOGLE_CLIENT_IDS');
  if (aud.length === 0) throw new Error('GOOGLE_CLIENT_IDS not configured');

  const { payload } = await jwtVerify(identityToken, googleJwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: aud,
  });

  return {
    provider: 'google',
    sub: String(payload.sub),
    email: (payload.email as string) ?? null,
    emailVerified: payload.email_verified === true,
  };
}

export function verifySocialToken(provider: 'apple' | 'google', token: string): Promise<SocialIdentity> {
  return provider === 'apple' ? verifyAppleToken(token) : verifyGoogleToken(token);
}
