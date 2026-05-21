// PATCH /api/admin/tools/:id { status?, tokenCost?, name?, description? }
// Admin-only edit of a tool. Schema/provider/model — read-only here (нужно через
// миграцию или прямой SQL, чтобы случайно не сломать API-контракт).

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { aiTools, type ToolStatus } from "@/lib/db/schema";
import { child } from "@/lib/logger";

const log = child("admin.tool");
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireAdminApi();
  if (!user) return response!;

  const body = (await req.json().catch(() => ({}))) as {
    status?: ToolStatus;
    tokenCost?: number;
    name?: string;
    description?: string;
  };

  const patch: Partial<typeof aiTools.$inferInsert> = {};
  if (body.status && ["active", "beta", "disabled"].includes(body.status)) patch.status = body.status;
  if (typeof body.tokenCost === "number" && body.tokenCost > 0) patch.tokenCost = Math.floor(body.tokenCost);
  if (typeof body.name === "string" && body.name.length > 0)    patch.name = body.name;
  if (typeof body.description === "string")                     patch.description = body.description;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const [updated] = await db.update(aiTools).set(patch)
    .where(eq(aiTools.id, id)).returning();

  if (!updated) return NextResponse.json({ error: "tool_not_found" }, { status: 404 });

  log.info("admin tool patched", { toolId: updated.id, by: user.email, patch });
  return NextResponse.json({ ok: true, tool: updated });
}
