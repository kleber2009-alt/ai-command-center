import Link from "next/link";
import { prisma } from "@/lib/db";
import { maybeUser } from "@/lib/session";
import { CoversClient } from "./client";

export default async function CoversPage({
  searchParams,
}: {
  searchParams: Promise<{ avatarId?: string }>;
}) {
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

  const { avatarId } = await searchParams;

  const [avatars, covers] = await Promise.all([
    prisma.avatar.findMany({
      where: { userId: user.id },
      orderBy: [{ selected: "desc" }, { createdAt: "desc" }],
      take: 60,
    }),
    prisma.cover.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
  ]);

  if (!avatars.length) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Generate an avatar first
        </h1>
        <p className="mt-2 text-ink-500">
          Covers are built on top of an AI avatar.
        </p>
        <Link
          href="/generate"
          className="mt-6 inline-flex items-center rounded-xl bg-accent px-6 h-12 text-ink-950 font-semibold"
        >
          Generate avatars
        </Link>
      </div>
    );
  }

  const initialAvatarId =
    avatarId ||
    avatars.find((a) => a.selected)?.id ||
    avatars[0].id;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <CoversClient
        avatars={avatars.map((a) => ({
          id: a.id,
          imageUrl: a.imageUrl,
          style: a.style,
          selected: a.selected,
        }))}
        initialAvatarId={initialAvatarId}
        existing={covers.map((c) => ({
          id: c.id,
          imageUrl: c.imageUrl,
          title: c.title,
          subtitle: c.subtitle,
          cta: c.cta,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
