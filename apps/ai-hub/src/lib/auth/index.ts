// Auth.js v5 (NextAuth) — single source of truth for sessions.
// Strategy: passwordless magic-link via SMTP.
//
// Usage:
//   - In server components: `const session = await auth(); session?.user`
//   - In Route Handlers:    same, `import { auth } from "@/lib/auth"`
//   - In Client comps:      `useSession()` from "next-auth/react"

import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Email from "next-auth/providers/email";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import { sendVerificationEmail } from "@/lib/email";

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // Behind Caddy reverse-proxy. Auth.js v5 default rejects non-localhost Host
  // headers unless trusted. We're inside our own reverse proxy chain, so OK.
  trustHost: true,
  session: { strategy: "database", maxAge: 60 * 60 * 24 * 30 },          // 30 days
  pages: { signIn: "/login", verifyRequest: "/login?check=email" },
  providers: [
    Email({
      // Auth.js v5 Email provider validates `server` at construction (even
      // when sendVerificationRequest is custom). Stub fallback lets `next build`
      // collect page data; real SMTP comes from SMTP_URL at runtime via sendVerificationEmail.
      server: process.env.SMTP_URL ?? "smtp://build-stub:build-stub@localhost:1025",
      from: process.env.SMTP_FROM ?? "no-reply@localhost",
      maxAge: 60 * 60 * 24,                                              // 24h link validity
      async sendVerificationRequest({ identifier, url }) {
        await sendVerificationEmail({ to: identifier, url });
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as { id?: string }).id = user.id;
        (session.user as { role?: string }).role = (user as { role?: string }).role ?? "user";
      }
      return session;
    },
  },
});

export async function requireUser() {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string; role?: string } | undefined;
  if (!user?.id) return { user: null as null, response: null as null };
  return { user: { id: user.id, email: user.email!, role: user.role ?? "user" }, response: null };
}
