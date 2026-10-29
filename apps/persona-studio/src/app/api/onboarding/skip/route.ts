// GET /api/onboarding/skip — remember that the user skipped the first-run
// onboarding (cookie, 1 year) and land on the dashboard. Without it the
// dashboard keeps redirecting users with no avatar batches back to /generate.

import { NextResponse } from 'next/server';

const ONBOARDING_SKIP_COOKIE = 'ps_onboarding_skipped';

export function GET() {
  // Relative Location: behind Caddy req.url carries the container's own
  // host:port (https://<container>:3020), which the browser cannot reach.
  const res = new NextResponse(null, { status: 307, headers: { Location: '/dashboard' } });
  res.cookies.set(ONBOARDING_SKIP_COOKIE, '1', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
  });
  return res;
}
