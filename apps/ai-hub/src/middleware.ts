// Edge middleware. Database sessions can't be validated here (Drizzle is
// node-only), so we just check that an Auth.js session cookie is present and
// let the protected page do real validation via `auth()`.
//
// Also forwards the pathname as `x-pathname` header so server components can
// read the current route — needed for the onboarding gate in (app)/layout.

import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/dashboard", "/tools", "/wallet", "/history", "/gallery", "/admin", "/play", "/showcase", "/onboard", "/research", "/agents"];

const COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
];

export default function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));

  const headers = new Headers(req.headers);
  headers.set("x-pathname", path);

  if (!isProtected) {
    return NextResponse.next({ request: { headers } });
  }

  const hasSession = COOKIE_NAMES.some((n) => req.cookies.has(n));
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/dashboard/:path*", "/tools/:path*", "/wallet/:path*", "/history/:path*",
    "/gallery/:path*", "/admin/:path*", "/play/:path*", "/showcase/:path*",
    "/onboard/:path*", "/research/:path*", "/agents/:path*",
  ],
};
