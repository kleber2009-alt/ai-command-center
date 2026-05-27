import { AUTH_DISABLED } from '@/lib/auth';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Everything except the landing, auth pages, and Clerk/Stripe webhooks requires sign-in.
const isPublic = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)', '/api/webhooks/(.*)']);

// In demo mode skip Clerk entirely (the ternary never evaluates clerkMiddleware).
export default AUTH_DISABLED
  ? () => NextResponse.next()
  : clerkMiddleware(async (auth, req) => {
      if (!isPublic(req)) await auth.protect();
    });

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
