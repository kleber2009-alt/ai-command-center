import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { aiJobs, mediaAssets } from "@/lib/db/schema";
import { presignGet } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireUser();
  if (!user) return response!;

  const [job] = await db.select().from(aiJobs)
    .where(and(eq(aiJobs.id, id), eq(aiJobs.userId, user.id))).limit(1);

  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const assets = await db.select().from(mediaAssets)
    .where(eq(mediaAssets.jobId, job.id))
    .orderBy(asc(mediaAssets.createdAt));

  const media = await Promise.all(assets.map(async (m) => ({
    id: m.id, type: m.type, mime_type: m.mimeType, size_bytes: m.sizeBytes,
    is_favorite: m.isFavorite,
    url: await presignGet(m.storagePath, 60 * 60),
  })));

  return NextResponse.json({ job: { ...job, media } });
}
