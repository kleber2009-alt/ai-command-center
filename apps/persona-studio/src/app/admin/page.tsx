import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { maybeUser } from "@/lib/session";
import { Card, CardTitle } from "@/components/ui/card";

export default async function AdminPage() {
  const user = await maybeUser();
  if (!user) redirect("/api/auth/signin");
  if (!isAdmin(user.email)) redirect("/dashboard");

  const [userCount, genCount, avatarCount, coverCount, recentUsers, recentGens] =
    await Promise.all([
      prisma.user.count(),
      prisma.generation.count(),
      prisma.avatar.count(),
      prisma.cover.count(),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          email: true,
          name: true,
          tokenBalance: true,
          createdAt: true,
        },
      }),
      prisma.generation.findMany({
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { user: { select: { email: true } } },
      }),
    ]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>

      <div className="grid sm:grid-cols-4 gap-4">
        {[
          ["Users", userCount],
          ["Generations", genCount],
          ["Avatars", avatarCount],
          ["Covers", coverCount],
        ].map(([label, n]) => (
          <Card key={label as string}>
            <div className="text-xs uppercase tracking-wider text-ink-500">
              {label}
            </div>
            <div className="mt-1 text-3xl font-semibold">{n}</div>
          </Card>
        ))}
      </div>

      <div>
        <CardTitle className="mb-3">Recent users</CardTitle>
        <ul className="rounded-2xl border border-white/10 bg-ink-900/60 divide-y divide-white/5">
          {recentUsers.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between px-5 py-3 text-sm"
            >
              <div>
                <div className="font-medium">{u.email}</div>
                <div className="text-xs text-ink-500">
                  {u.name || "—"} · {new Date(u.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="text-xs text-ink-500">
                tokens: {u.tokenBalance}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <CardTitle className="mb-3">Recent generations</CardTitle>
        <ul className="rounded-2xl border border-white/10 bg-ink-900/60 divide-y divide-white/5">
          {recentGens.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between px-5 py-3 text-sm"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-6 items-center rounded-md bg-ink-800 px-2 text-xs text-ink-500">
                  {g.kind}
                </span>
                <span>{g.user.email}</span>
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
      </div>
    </div>
  );
}
