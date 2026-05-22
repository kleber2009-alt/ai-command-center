// POST /api/admin/media/:id/feature { featured: boolean }
// Admin-only toggle for is_featured on any user's media asset. Public Showcase
// page reads only is_featured=true rows.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireAdminApi();
  if (!user) return response!;

  const body = await req.json().catch(() => ({})) as { featured?: boolean };
  const featured = body.featured === true;

  const [row] = await db.select({ id: mediaAssets.id }).from(mediaAssets)
    .where(eq(mediaAssets.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await db.update(mediaAssets).set({
    isFeatured: featured,
    featuredAt: featured ? new Date() : null,
  }).where(eq(mediaAssets.id, id));

  return NextResponse.json({ ok: true, featured });
}
