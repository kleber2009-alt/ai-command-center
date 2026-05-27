/**
 * Demo / no-auth mode. When NEXT_PUBLIC_AUTH_DISABLED=true the app builds and
 * runs without Clerk (no keys at all) under a single shared demo user. Opt-in
 * only — with the flag unset, real Clerk auth is used. The NEXT_PUBLIC_ prefix
 * makes the flag available in both client components and server code, and
 * inlines it at build time.
 */
export const AUTH_DISABLED = process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true';
export const DEMO_USER_ID = 'demo-user';
