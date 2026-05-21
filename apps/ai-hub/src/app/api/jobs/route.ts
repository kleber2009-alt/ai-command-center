import { NextResponse } from "next/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { aiJobs, type JobStatus } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "30"), 100);
  const status = searchParams.get("status") as JobStatus | null;
  const cursor = searchParams.get("cursor");

  const conditions = [eq(aiJobs.userId, user.id)];
  if (status) conditions.push(eq(aiJobs.status, status));
  if (cursor) conditions.push(lt(aiJobs.createdAt, new Date(cursor)));

  const rows = await db.select({
    id: aiJobs.id, tool_id: aiJobs.toolId, provider: aiJobs.provider, model: aiJobs.model,
    status: aiJobs.status, cost_tokens: aiJobs.costTokens, charged_tokens: aiJobs.chargedTokens,
    created_at: aiJobs.createdAt, completed_at: aiJobs.completedAt,
    error_message: aiJobs.errorMessage,
  })
    .from(aiJobs)
    .where(and(...conditions))
    .orderBy(desc(aiJobs.createdAt))
    .limit(limit);

  const next = rows.length === limit ? rows[rows.length - 1].created_at?.toISOString() ?? null : null;
  return NextResponse.json({ jobs: rows, nextCursor: next });
}
