import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getQueue, QUEUES } from "@/lib/queue";
import {
  InsufficientTokensError,
  TOKEN_COST,
  spendTokens,
} from "@/lib/tokens";

const Body = z.object({
  avatarId: z.string().min(1),
  title: z.string().trim().min(1).max(140),
  subtitle: z.string().trim().max(200).default(""),
  cta: z.string().trim().max(80).default(""),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (r) {
    return r as Response;
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { avatarId, title, subtitle, cta } = parsed.data;

  const avatar = await prisma.avatar.findFirst({
    where: { id: avatarId, userId: user.id },
  });
  if (!avatar) {
    return NextResponse.json({ error: "avatar not found" }, { status: 404 });
  }

  const cost = TOKEN_COST.cover;

  const generation = await prisma.generation.create({
    data: {
      userId: user.id,
      kind: "COVER",
      tokensSpent: cost,
      meta: { avatarId, title, subtitle, cta },
    },
  });

  try {
    await spendTokens(user.id, cost, "Cover generation", generation.id);
  } catch (e) {
    await prisma.generation.delete({ where: { id: generation.id } });
    if (e instanceof InsufficientTokensError) {
      return NextResponse.json(
        { error: "insufficient tokens", required: e.required, balance: e.balance },
        { status: 402 }
      );
    }
    throw e;
  }

  const job = await getQueue(QUEUES.COVER).add(
    "cover",
    {
      generationId: generation.id,
      userId: user.id,
      avatarId,
      title,
      subtitle,
      cta,
    },
    { removeOnComplete: 100, removeOnFail: 50, attempts: 2 }
  );

  await prisma.generation.update({
    where: { id: generation.id },
    data: { jobId: job.id ?? null },
  });

  return NextResponse.json({
    generationId: generation.id,
    jobId: job.id,
    status: "QUEUED",
  });
}
