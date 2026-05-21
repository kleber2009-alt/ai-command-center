import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

const Body = z.object({ avatarId: z.string().min(1) });

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (r) {
    return r as Response;
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const target = await prisma.avatar.findFirst({
    where: { id: parsed.data.avatarId, userId: user.id },
  });
  if (!target) {
    return NextResponse.json({ error: "avatar not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.avatar.updateMany({
      where: { userId: user.id, selected: true },
      data: { selected: false },
    }),
    prisma.avatar.update({
      where: { id: target.id },
      data: { selected: true },
    }),
  ]);

  return NextResponse.json({ ok: true, avatarId: target.id });
}
