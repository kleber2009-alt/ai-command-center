import Link from "next/link";
import { prisma } from "@/lib/db";
import { maybeUser } from "@/lib/session";
import { AvatarsClient } from "./client";

export default async function AvatarsPage() {
  const user = await maybeUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <Link
          href="/api/auth/signin"
          className="mt-6 inline-flex items-center rounded-xl bg-accent px-6 h-12 text-ink-950 font-semibold"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const avatars = await prisma.avatar.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">My avatars</h1>
          <p className="text-ink-500 mt-1">
            Pick one to use as the base for a cover or video.
          </p>
        </div>
        <Link
          href="/generate"
          className="rounded-xl bg-accent px-4 h-10 inline-flex items-center font-semibold text-ink-950 hover:bg-accent-glow"
        >
          + New batch
        </Link>
      </div>
      <AvatarsClient
        initial={avatars.map((a) => ({
          id: a.id,
          imageUrl: a.imageUrl,
          style: a.style,
          selected: a.selected,
        }))}
      />
    </div>
  );
}
