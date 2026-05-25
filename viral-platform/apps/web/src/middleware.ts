import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Everything except the landing, auth pages, and Clerk/Stripe webhooks requires sign-in.
const isPublic = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)', '/api/webhooks/(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
