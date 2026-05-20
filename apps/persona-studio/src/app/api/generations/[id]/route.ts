import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireUser();
  } catch (r) {
    return r as Response;
  }
  const { id } = await params;
  const gen = await prisma.generation.findFirst({
    where: { id, userId: user.id },
    include: { avatars: true, covers: true },
  });
  if (!gen) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(gen);
}
