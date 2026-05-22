import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { presignGet, deleteObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function load(userId: string, id: string) {
  const [row] = await db.select().from(mediaAssets)
    .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, userId))).limit(1);
  return row ?? null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, response } = await requireUser();
  if (!user) return response!;
  const row = await load(user.id, params.id);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = await presignGet(row.storagePath, 60 * 60);
  return NextResponse.json({ asset: { ...row, url } });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, response } = await requireUser();
  if (!user) return response!;
  const body = await req.json().catch(() => ({})) as { is_favorite?: boolean };
  const row = await load(user.id, params.id);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (typeof body.is_favorite === "boolean") {
    await db.update(mediaAssets).set({ isFavorite: body.is_favorite })
      .where(eq(mediaAssets.id, params.id));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, response } = await requireUser();
  if (!user) return response!;
  const row = await load(user.id, params.id);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try { await deleteObject(row.storagePath); } catch { /* tolerate missing */ }
  await db.delete(mediaAssets).where(eq(mediaAssets.id, params.id));
  return NextResponse.json({ ok: true });
}
