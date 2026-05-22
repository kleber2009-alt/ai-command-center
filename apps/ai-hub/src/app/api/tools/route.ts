import { NextResponse } from "next/server";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiTools } from "@/lib/db/schema";

// Note: was `revalidate = 60` (ISR) but Next.js attempts to prerender at build
// time, which hits DB with build-stub URL → fails. Catalog query is <20ms,
// caching can come back later via per-request Cache headers or an in-memory
// short-TTL cache in lib/tools/registry.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select({
    id: aiTools.id, slug: aiTools.slug, name: aiTools.name, description: aiTools.description,
    category: aiTools.category, provider: aiTools.provider, model: aiTools.model,
    token_cost: aiTools.tokenCost, input_schema: aiTools.inputSchema,
    status: aiTools.status, sort_order: aiTools.sortOrder,
  })
    .from(aiTools)
    .where(inArray(aiTools.status, ["active", "beta"]))
    .orderBy(asc(aiTools.sortOrder));

  return NextResponse.json({ tools: rows });
}
