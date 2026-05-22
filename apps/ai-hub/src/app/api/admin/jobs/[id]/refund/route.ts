// POST /api/admin/jobs/:id/refund
// Manual refund — credits the user wallet for the specified amount and
// flips the job to 'refunded'. Idempotent: re-running on a refunded job is a no-op.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { aiJobs } from "@/lib/db/schema";
import { credit } from "@/lib/wallet";
import { child } from "@/lib/logger";

const log = child("admin.refund");
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, response } = await requireAdminApi();
  if (!user) return response!;

  const { amount, reason } = (await req.json().catch(() => ({}))) as { amount?: number; reason?: string };

  const [job] = await db.select().from(aiJobs).where(eq(aiJobs.id, params.id)).limit(1);
  if (!job) return NextResponse.json({ error: "job_not_found" }, { status: 404 });
  if (job.status === "refunded") return NextResponse.json({ ok: true, already: true });

  const refundAmount = amount ?? job.chargedTokens ?? job.costTokens;
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  // wallet_credit (type='adjustment') — это не возврат в reserved, а прямой
  // плюс к available. Корректно для пост-фактум рефанда уже списанной задачи.
  await credit({
    userId: job.userId, amount: refundAmount, type: "adjustment",
    description: `Admin refund for job ${job.id}: ${reason ?? "manual"}`,
  });

  await db.update(aiJobs).set({
    status: "refunded",
    errorCode: job.errorCode ?? "ADMIN_REFUND",
    errorMessage: reason ?? job.errorMessage ?? "Manually refunded by admin",
  }).where(eq(aiJobs.id, job.id));

  log.warn("admin refund", { jobId: job.id, userId: job.userId, amount: refundAmount, by: user.email, reason });

  return NextResponse.json({ ok: true, refunded: refundAmount });
}
