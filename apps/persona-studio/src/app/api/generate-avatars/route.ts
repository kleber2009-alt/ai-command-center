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
  uploadId: z.string().min(1),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (r) {
    return r as Response;
  }

  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const upload = await prisma.upload.findFirst({
    where: { id: parsed.data.uploadId, userId: user.id },
  });
  if (!upload) {
    return NextResponse.json({ error: "upload not found" }, { status: 404 });
  }

  const cost = TOKEN_COST.avatarBatch;

  const generation = await prisma.generation.create({
    data: {
      userId: user.id,
      kind: "AVATAR_BATCH",
      uploadId: upload.id,
      tokensSpent: cost,
    },
  });

  try {
    await spendTokens(user.id, cost, "Avatar batch", generation.id);
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

  const job = await getQueue(QUEUES.AVATAR).add(
    "avatar-batch",
    { generationId: generation.id, userId: user.id, uploadId: upload.id },
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
