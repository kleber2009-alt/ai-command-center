import Link from "next/link";
import { prisma } from "@/lib/db";
import { maybeUser } from "@/lib/session";
import { Card, CardTitle } from "@/components/ui/card";
import { Sparkles, Image as ImageIcon, LayoutGrid } from "lucide-react";

export default async function DashboardPage() {
  const user = await maybeUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Sign in to continue
        </h1>
        <Link
          href="/api/auth/signin"
          className="mt-6 inline-flex items-center rounded-xl bg-accent px-6 h-12 text-ink-950 font-semibold hover:bg-accent-glow"
        >
          Sign in with Google
        </Link>
      </div>
    );
  }

  const [me, avatarCount, coverCount, recentGens] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { tokenBalance: true, email: true, name: true },
    }),
    prisma.avatar.count({ where: { userId: user.id } }),
    prisma.cover.count({ where: { userId: user.id } }),
    prisma.generation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome back{me?.name ? `, ${me.name}` : ""}.
        </h1>
        <p className="text-ink-500 mt-1">{me?.email}</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <div className="text-xs uppercase tracking-wider text-ink-500">
            Tokens
          </div>
          <div className="mt-1 text-3xl font-semibold">
            {me?.tokenBalance ?? 0}
          </div>
          <Link
            href="/billing"
            className="mt-3 inline-block text-sm text-accent hover:text-accent-glow"
          >
            Top up →
          </Link>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-ink-500">
            Avatars
          </div>
          <div className="mt-1 text-3xl font-semibold">{avatarCount}</div>
          <Link
            href="/avatars"
            className="mt-3 inline-block text-sm text-accent hover:text-accent-glow"
          >
            Gallery →
          </Link>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-ink-500">
            Covers
          </div>
          <div className="mt-1 text-3xl font-semibold">{coverCount}</div>
          <Link
            href="/covers"
            className="mt-3 inline-block text-sm text-accent hover:text-accent-glow"
          >
            Open →
          </Link>
        </Card>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Link
          href="/generate"
          className="rounded-2xl border border-accent/40 bg-gradient-to-br from-ink-800 to-ink-900 p-6 hover:border-accent transition-colors"
        >
          <Sparkles className="h-6 w-6 text-accent" />
          <div className="mt-4 font-semibold">Generate 10 avatars</div>
          <div className="text-sm text-ink-500">Upload a photo, get a batch.</div>
        </Link>
        <Link
          href="/avatars"
          className="rounded-2xl border border-white/10 bg-ink-900/60 p-6 hover:border-white/30 transition-colors"
        >
          <LayoutGrid className="h-6 w-6 text-ink-200" />
          <div className="mt-4 font-semibold">My avatars</div>
          <div className="text-sm text-ink-500">Pick, download, reuse.</div>
        </Link>
        <Link
          href="/covers"
          className="rounded-2xl border border-white/10 bg-ink-900/60 p-6 hover:border-white/30 transition-colors"
        >
          <ImageIcon className="h-6 w-6 text-ink-200" />
          <div className="mt-4 font-semibold">Covers</div>
          <div className="text-sm text-ink-500">Make viral Instagram covers.</div>
        </Link>
      </div>

      <div>
        <CardTitle className="mb-4">Recent activity</CardTitle>
        {recentGens.length === 0 ? (
          <div className="text-sm text-ink-500">
            Nothing yet. Run your first generation.
          </div>
        ) : (
          <ul className="rounded-2xl border border-white/10 bg-ink-900/60 divide-y divide-white/5">
            {recentGens.map((g) => (
              <li key={g.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-6 items-center rounded-md bg-ink-800 px-2 text-xs text-ink-500">
                    {g.kind}
                  </span>
                  <span>{new Date(g.createdAt).toLocaleString()}</span>
                </div>
                <span
                  className={
                    "text-xs " +
                    (g.status === "SUCCEEDED"
                      ? "text-emerald-400"
                      : g.status === "FAILED"
                      ? "text-red-400"
                      : "text-amber-300")
                  }
                >
                  {g.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
