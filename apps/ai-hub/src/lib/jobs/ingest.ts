// Media ingest: walk provider output for media URLs, download each, upload to
// our MinIO bucket, record a media_assets row.
// Best-effort: failure does not fail the parent job — the raw provider URL is
// still kept in ai_jobs.output.

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { mediaAssets, type MediaType } from "@/lib/db/schema";
import { ingestFromUrl } from "@/lib/storage";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp"]);
const VIDEO_EXT = new Set(["mp4", "webm", "mov", "mkv", "m4v"]);
const AUDIO_EXT = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac"]);

function extOf(url: string): string {
  const path = url.split("?")[0].split("#")[0];
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "";
  return path.slice(dot + 1).toLowerCase();
}

function typeFromExt(ext: string): MediaType | null {
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  return null;
}

/** Walk arbitrary JSON, collect http(s) strings that look like media files. */
export function extractMediaUrls(output: unknown): Array<{ url: string; type: MediaType }> {
  const seen = new Set<string>();
  const found: Array<{ url: string; type: MediaType }> = [];

  function walk(v: unknown) {
    if (typeof v === "string") {
      if (!/^https?:\/\//i.test(v)) return;
      if (seen.has(v)) return;
      const t = typeFromExt(extOf(v));
      if (!t) return;
      seen.add(v);
      found.push({ url: v, type: t });
      return;
    }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") { Object.values(v as Record<string, unknown>).forEach(walk); }
  }

  walk(output);
  return found;
}

export async function ingestJobMedia(args: {
  jobId: string;
  userId: string;
  output: unknown;
}): Promise<number> {
  const urls = extractMediaUrls(args.output);
  if (urls.length === 0) return 0;

  let inserted = 0;
  for (const [i, { url, type }] of urls.entries()) {
    try {
      const ext = extOf(url) || "bin";
      const key = `users/${args.userId}/jobs/${args.jobId}/${i}-${randomUUID().slice(0, 8)}.${ext}`;
      const { mimeType, size } = await ingestFromUrl(url, key);

      await db.insert(mediaAssets).values({
        userId:      args.userId,
        jobId:       args.jobId,
        type,
        storagePath: key,
        mimeType:    mimeType ?? null,
        sizeBytes:   size,
        metadata:    { source_url: url },
      });
      inserted++;
    } catch (err) {
      console.error("[ingest] failed for", url, err instanceof Error ? err.message : err);
    }
  }
  return inserted;
}
