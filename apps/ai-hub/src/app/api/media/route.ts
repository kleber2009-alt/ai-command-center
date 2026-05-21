import { NextResponse } from "next/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { presignGet } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "30"), 100);
  const cursor = searchParams.get("cursor");
  const onlyFav = searchParams.get("favorite") === "1";

  const conditions = [eq(mediaAssets.userId, user.id)];
  if (onlyFav) conditions.push(eq(mediaAssets.isFavorite, true));
  if (cursor)  conditions.push(lt(mediaAssets.createdAt, new Date(cursor)));

  const rows = await db.select().from(mediaAssets)
    .where(and(...conditions))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(limit);

  const enriched = await Promise.all(rows.map(async (m) => ({
    ...m, url: await presignGet(m.storagePath, 60 * 60),
  })));

  const next = rows.length === limit ? rows[rows.length - 1].createdAt?.toISOString() ?? null : null;
  return NextResponse.json({ media: enriched, nextCursor: next });
}
