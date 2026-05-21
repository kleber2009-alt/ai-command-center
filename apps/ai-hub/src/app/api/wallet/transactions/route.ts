import { NextResponse } from "next/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { tokenTransactions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
  const cursor = searchParams.get("cursor");

  const rows = await db.select({
    id: tokenTransactions.id, type: tokenTransactions.type,
    amount: tokenTransactions.amount, balance_after: tokenTransactions.balanceAfter,
    tool_id: tokenTransactions.toolId, job_id: tokenTransactions.jobId,
    description: tokenTransactions.description, created_at: tokenTransactions.createdAt,
  })
    .from(tokenTransactions)
    .where(cursor
      ? and(eq(tokenTransactions.userId, user.id), lt(tokenTransactions.createdAt, new Date(cursor)))
      : eq(tokenTransactions.userId, user.id))
    .orderBy(desc(tokenTransactions.createdAt))
    .limit(limit);

  const next = rows.length === limit ? rows[rows.length - 1].created_at?.toISOString() ?? null : null;
  return NextResponse.json({ transactions: rows, nextCursor: next });
}
