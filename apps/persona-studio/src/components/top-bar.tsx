import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function TopBar() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const me = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { tokenBalance: true, email: true },
      })
    : null;

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/80 backdrop-blur-lg">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-14">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-6 w-6 rounded-full bg-gradient-to-br from-accent to-pink-400" />
          <span>Persona Studio</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {me ? (
            <>
              <Link
                className="px-3 py-1.5 rounded-lg hover:bg-white/5"
                href="/dashboard"
              >
                Dashboard
              </Link>
              <Link
                className="px-3 py-1.5 rounded-lg hover:bg-white/5"
                href="/generate"
              >
                Generate
              </Link>
              <Link
                className="px-3 py-1.5 rounded-lg hover:bg-white/5"
                href="/avatars"
              >
                Avatars
              </Link>
              <Link
                className="px-3 py-1.5 rounded-lg hover:bg-white/5"
                href="/covers"
              >
                Covers
              </Link>
              <Link
                href="/billing"
                className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-ink-800 px-3 py-1 text-xs"
              >
                <span className="text-ink-500 mr-1.5">Tokens</span>
                <span className="font-semibold text-ink-200">
                  {me.tokenBalance}
                </span>
              </Link>
            </>
          ) : (
            <Link
              href="/api/auth/signin"
              className="rounded-xl bg-accent px-4 py-2 text-ink-950 font-semibold hover:bg-accent-glow"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
