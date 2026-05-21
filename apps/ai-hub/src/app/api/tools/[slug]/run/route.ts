// POST /api/tools/:slug/run — main entrypoint for any AI generation.
// 1. Auth user
// 2. Load tool (must be active)
// 3. (Stage 5) validate input against tool.input_schema
// 4. Create ai_jobs row (pending)
// 5. wallet_reserve  →  402 on insufficient funds
// 6. Enqueue BullMQ
// 7. Return jobId; client polls GET /api/jobs/:id

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { aiTools, aiJobs } from "@/lib/db/schema";
import { reserve, InsufficientFundsError } from "@/lib/wallet";
import { getQueue } from "@/lib/jobs/queue";
import { checkRateLimit } from "@/lib/jobs/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, response } = await requireUser();
  if (!user) return response!;

  let body: { input?: Record<string, unknown>; idempotencyKey?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const [tool] = await db.select({
    id: aiTools.id, slug: aiTools.slug, provider: aiTools.provider,
    model: aiTools.model, tokenCost: aiTools.tokenCost, status: aiTools.status,
  }).from(aiTools).where(eq(aiTools.slug, slug)).limit(1);

  if (!tool || tool.status === "disabled") {
    return NextResponse.json({ error: "tool_not_found" }, { status: 404 });
  }

  const rl = await checkRateLimit(user.id);
  if (!rl.allowed) {
    return NextResponse.json({
      error: "rate_limit", inflight: rl.inflight, max: rl.max,
      message: `Уже ${rl.inflight} задач в работе. Подожди, пока что-нибудь завершится (макс ${rl.max} параллельно).`,
    }, { status: 429 });
  }

  const input = body.input ?? {};

  // Idempotency: if same key already submitted, return existing job
  if (body.idempotencyKey) {
    const [existing] = await db.select({ id: aiJobs.id, status: aiJobs.status })
      .from(aiJobs)
      .where(and(eq(aiJobs.userId, user.id), eq(aiJobs.idempotencyKey, body.idempotencyKey)))
      .limit(1);
    if (existing) return NextResponse.json({ job: existing, idempotent: true });
  }

  const jobId = randomUUID();

  await db.insert(aiJobs).values({
    id: jobId, userId: user.id, toolId: tool.id,
    provider: tool.provider, model: tool.model,
    status: "pending", input, costTokens: tool.tokenCost,
    idempotencyKey: body.idempotencyKey ?? null,
  });

  try {
    await reserve({
      userId: user.id, amount: tool.tokenCost,
      jobId, toolId: tool.id, description: `Reserve for ${tool.slug}`,
    });
  } catch (err) {
    await db.update(aiJobs).set({
      status: "failed", errorCode: "INSUFFICIENT_FUNDS",
      errorMessage: "Not enough tokens", completedAt: new Date(),
    }).where(eq(aiJobs.id, jobId));

    if (err instanceof InsufficientFundsError) {
      return NextResponse.json({ error: "insufficient_funds", required: tool.tokenCost }, { status: 402 });
    }
    return NextResponse.json({ error: "wallet_error" }, { status: 500 });
  }

  await db.update(aiJobs).set({ status: "queued" }).where(eq(aiJobs.id, jobId));

  await getQueue().add("run", {
    jobId, userId: user.id, toolId: tool.id,
    provider: tool.provider, model: tool.model,
    input, costTokens: tool.tokenCost,
  }, { jobId, attempts: 1, removeOnComplete: 1000, removeOnFail: 5000 });

  return NextResponse.json({ job: { id: jobId, status: "queued" } }, { status: 202 });
}
