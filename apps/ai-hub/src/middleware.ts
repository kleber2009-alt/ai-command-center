// Auth.js v5 edge middleware. Redirects unauthenticated users to /login.
import NextAuth from "next-auth";

const { auth: middleware } = NextAuth({
  providers: [],                                                          // edge can't import nodemailer; provider list lives only in node runtime
  session: { strategy: "database" },
});

const PROTECTED = ["/dashboard", "/tools", "/wallet", "/history", "/gallery", "/admin", "/play"];

export default middleware((req) => {
  const path = req.nextUrl.pathname;
  if (!PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) return;

  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", path);
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/tools/:path*", "/wallet/:path*", "/history/:path*", "/gallery/:path*", "/admin/:path*", "/play/:path*"],
};
