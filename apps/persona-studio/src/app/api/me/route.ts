import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (r) {
    return r as Response;
  }
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      tokenBalance: true,
      createdAt: true,
    },
  });
  return NextResponse.json(me);
}
