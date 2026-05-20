import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function GET(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (r) {
    return r as Response;
  }

  const url = new URL(req.url);
  const generationId = url.searchParams.get("generationId");

  const where = generationId
    ? { userId: user.id, generationId }
    : { userId: user.id };

  const [avatars, generation] = await Promise.all([
    prisma.avatar.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    generationId
      ? prisma.generation.findFirst({
          where: { id: generationId, userId: user.id },
          select: { id: true, status: true, errorMessage: true },
        })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({ avatars, generation });
}
