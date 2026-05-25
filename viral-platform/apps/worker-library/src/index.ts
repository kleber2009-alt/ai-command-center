import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { embedOne, tagAssetFrames } from '@vp/ai';
import { db, logJobFinish, logJobStart, refundCredits, userAssets } from '@vp/db';
import { extractFrames, extractThumbnail, probeAsset } from '@vp/ffmpeg';
import { QUEUE, createWorker } from '@vp/queue';
import { type AssetAiMetadata, CREDIT_COSTS } from '@vp/shared';
import { getObjectBuffer, putObject } from '@vp/storage';
import { eq } from 'drizzle-orm';

/**
 * worker-library (§4.4.3): index a freshly-uploaded library asset.
 * FFprobe → thumbnail → 3-frame Gemini Vision tagging → embedding → pgvector.
 * On failure the asset is marked failed and the indexing credit is refunded.
 */
createWorker(
  QUEUE.indexAsset,
  async (job) => {
    const { userId, assetId } = job.data;
    const logId = await logJobStart(job.id ?? '', null, QUEUE.indexAsset);

    const [asset] = await db.select().from(userAssets).where(eq(userAssets.id, assetId)).limit(1);
    if (!asset) throw new Error(`user asset ${assetId} not found`);

    try {
      const dir = await mkdtemp(join(tmpdir(), 'vp-library-'));
      const srcPath = join(dir, 'asset');
      const thumbPath = join(dir, 'thumb.jpg');
      try {
        await writeFile(srcPath, await getObjectBuffer(asset.r2Key, 'library'));

        const probe = await probeAsset(srcPath);
        const isImage = asset.type === 'image';
        await extractThumbnail(srcPath, thumbPath, isImage ? 0 : 1);
        const thumbKey = `${asset.r2Key}_thumb.jpg`;
        await putObject(thumbKey, await readFile(thumbPath), 'image/jpeg', 'library');

        const frames = await extractFrames(srcPath, dir, probe.durationMs, isImage ? 1 : 3);
        const raw = await tagAssetFrames(frames);

        const meta: AssetAiMetadata = {
          description: raw.description,
          tags: raw.tags,
          sceneType: raw.scene_type,
          mood: raw.mood,
          dominantColors: raw.dominant_colors,
          hasFaces: raw.has_faces,
          hasTextOverlay: raw.has_text_overlay,
          motionIntensity: raw.motion_intensity,
          usabilityScore: raw.usability_score,
        };
        const embedding = await embedOne(`${meta.description} ${meta.tags.join(' ')}`);

        await db
          .update(userAssets)
          .set({
            durationMs: probe.durationMs,
            width: probe.width,
            height: probe.height,
            orientation: probe.orientation,
            thumbnailR2Key: thumbKey,
            aiMetadata: meta,
            embedding,
            status: 'ready',
            errorReason: null,
          })
          .where(eq(userAssets.id, assetId));

        await logJobFinish(logId, 'done');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    } catch (err) {
      await db
        .update(userAssets)
        .set({ status: 'failed', errorReason: String(err) })
        .where(eq(userAssets.id, assetId));
      // Refund the indexing charge on the final attempt (§9).
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await refundCredits(
          userId,
          CREDIT_COSTS.indexAssetCredits,
          `index ${assetId} failed`,
        ).catch(() => {});
      }
      await logJobFinish(logId, 'failed', String(err));
      throw err;
    }
  },
  { concurrency: 5 }, // up to 5 assets in parallel per worker (§4.4.3)
);

console.log('[worker-library] ready');
