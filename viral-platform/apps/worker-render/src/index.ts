import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clips, db, logJobFinish, logJobStart, projects, refundCredits, renders } from '@vp/db';
import { exportClip } from '@vp/ffmpeg';
import { type Job, QUEUE, type RenderJob, createWorker, publishProgress } from '@vp/queue';
import { CREDIT_COSTS } from '@vp/shared';
import { getObjectBuffer, putObject } from '@vp/storage';
import { eq } from 'drizzle-orm';

/**
 * worker-render (§5.8): export a clip in the requested aspect ratio. The base
 * crop/transcode is implemented here; B-roll overlay compositing and caption
 * burn-in (Remotion, §5.4) are layered on top in the compositing step — see the
 * TODO below. Final renders upload to R2 and store a signed download key.
 */
async function processRender(job: Job<RenderJob>): Promise<void> {
  const { projectId, userId, clipId, renderId, format, quality, preview } = job.data;
  const logId = await logJobStart(
    job.id ?? '',
    projectId,
    preview ? 'render-preview' : 'render-final',
  );
  const status = preview ? 'rendering_preview' : 'rendering_final';

  try {
    await db.update(renders).set({ status: 'rendering' }).where(eq(renders.id, renderId));
    if (!preview) await db.update(projects).set({ status }).where(eq(projects.id, projectId));
    await publishProgress({ projectId, status, pct: 10, message: 'Loading source' });

    const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
    if (!clip) throw new Error(`clip ${clipId} not found`);
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) throw new Error(`project ${projectId} not found`);

    const dir = await mkdtemp(join(tmpdir(), 'vp-render-'));
    const srcPath = join(dir, 'source');
    const outPath = join(dir, `out-${randomUUID()}.mp4`);
    const startedAt = Date.now();
    try {
      await writeFile(srcPath, await getObjectBuffer(project.sourceVideoR2Key));
      await publishProgress({ projectId, status, pct: 40, message: 'Rendering' });

      // TODO(compositing): before export, composite the clip's B-roll plan
      // (broll_plans.inserts) as fullscreen/PiP overlays with 200ms fades, then
      // burn captions for the chosen preset via Remotion. MVP exports the crop.
      await exportClip({
        inputPath: srcPath,
        outputPath: outPath,
        startMs: clip.startMs,
        endMs: clip.endMs,
        format,
      });

      const outputKey = `renders/${projectId}/${clipId}/${renderId}.mp4`;
      await putObject(outputKey, await readFile(outPath), 'video/mp4');

      await db
        .update(renders)
        .set({ status: 'done', outputR2Key: outputKey, durationRenderMs: Date.now() - startedAt })
        .where(eq(renders.id, renderId));
      if (!preview)
        await db.update(projects).set({ status: 'done' }).where(eq(projects.id, projectId));

      await publishProgress({
        projectId,
        status: preview ? status : 'done',
        pct: 100,
        message: 'Done',
      });
      await logJobFinish(logId, 'done');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } catch (err) {
    await db
      .update(renders)
      .set({ status: 'failed', failureReason: String(err) })
      .where(eq(renders.id, renderId));
    // Refund the render charge so a failed job doesn't cost the user (§9).
    if (!preview) {
      const cost =
        quality === '4k' ? CREDIT_COSTS.render4kPerClip : CREDIT_COSTS.render1080pPerClip;
      await refundCredits(userId, cost, `render ${renderId} failed`).catch(() => {});
    }
    await logJobFinish(logId, 'failed', String(err));
    throw err;
  }
}

createWorker(QUEUE.renderPreview, processRender);
createWorker(QUEUE.renderFinal, processRender);

console.log('[worker-render] ready');
