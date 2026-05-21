// Per-user concurrent-jobs rate limit. Counts ai_jobs rows in
// queued/processing for the user. Cheap query — indexed scan only.

import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiJobs } from "@/lib/db/schema";

const DEFAULT_MAX = Number(process.env.MAX_CONCURRENT_JOBS_PER_USER ?? "5");

export async function countInflight(userId: string): Promise<number> {
  const [row] = await db.select({ n: count() })
    .from(aiJobs)
    .where(and(
      eq(aiJobs.userId, userId),
      inArray(aiJobs.status, ["queued", "processing"]),
    ));
  return Number(row?.n ?? 0);
}

export async function checkRateLimit(userId: string, max = DEFAULT_MAX) {
  const inflight = await countInflight(userId);
  return { allowed: inflight < max, inflight, max };
}
