// POST /api/uploads/presign { filename, contentType, sizeBytes? }
// Returns:
//   - putUrl   — presigned PUT URL for direct browser → MinIO upload
//   - getUrl   — presigned GET URL (TTL 24h) that providers can fetch
//   - storageKey — internal key, in case we want to track it later
//
// Auth required. Per-user prefix in object key.

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { presignPut, presignGet } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_SIZE = 50 * 1024 * 1024;                        // 50 MB
const ALLOWED_MIME = /^(image\/|video\/|audio\/)/;

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const body = (await req.json().catch(() => ({}))) as {
    filename?: string; contentType?: string; sizeBytes?: number;
  };
  const filename = (body.filename ?? "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const contentType = body.contentType ?? "application/octet-stream";

  if (!ALLOWED_MIME.test(contentType)) {
    return NextResponse.json({ error: "unsupported_content_type", contentType }, { status: 400 });
  }
  if (typeof body.sizeBytes === "number" && body.sizeBytes > MAX_SIZE) {
    return NextResponse.json({ error: "file_too_large", max: MAX_SIZE }, { status: 413 });
  }

  const storageKey = `users/${user.id}/uploads/${randomUUID()}-${filename}`;
  const putUrl = await presignPut(storageKey, contentType, 600);              // 10 min to upload
  const getUrl = await presignGet(storageKey, 60 * 60 * 24);                  // 24h fetch (provider has window)

  return NextResponse.json({ storageKey, putUrl, getUrl, contentType });
}
