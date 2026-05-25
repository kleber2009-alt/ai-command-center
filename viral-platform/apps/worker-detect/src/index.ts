import { complete, extractJson } from '@vp/ai';
import { clips, db, logJobFinish, logJobStart, setProjectStatus, transcripts } from '@vp/db';
import { QUEUE, createWorker, enqueue, publishProgress } from '@vp/queue';
import {
  CLIP_DETECTION,
  type Transcript,
  clipDetectionSchema,
  renderClipDetectionPrompt,
} from '@vp/shared';
import { getJson } from '@vp/storage';
import { eq } from 'drizzle-orm';

/** Compact transcript into "[startMs] text" lines for the detection prompt. */
function transcriptToText(t: Transcript): string {
  if (t.paragraphs?.length) {
    return t.paragraphs.map((p) => `[${p.startMs}] ${p.text}`).join('\n');
  }
  // Fall back to ~12-word windows tagged with their start time.
  const lines: string[] = [];
  for (let i = 0; i < t.words.length; i += 12) {
    const chunk = t.words.slice(i, i + 12);
    if (chunk[0]) lines.push(`[${chunk[0].startMs}] ${chunk.map((w) => w.word).join(' ')}`);
  }
  return lines.join('\n');
}

/**
 * worker-detect (§5.3): Claude finds 5–20 self-contained viral fragments with
 * hook/retention/emotional/viral scores. Each detected clip is persisted and a
 * broll-plan job is enqueued. Status advances detecting → planning_broll.
 */
createWorker(QUEUE.detect, async (job) => {
  const { projectId, userId } = job.data;
  const logId = await logJobStart(job.id ?? '', projectId, QUEUE.detect);

  try {
    await setProjectStatus(projectId, 'detecting');
    await publishProgress({
      projectId,
      status: 'detecting',
      pct: 10,
      message: 'Loading transcript',
    });

    const [tRow] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.projectId, projectId))
      .limit(1);
    if (!tRow) throw new Error(`no transcript for project ${projectId}`);

    const transcript = await getJson<Transcript>(tRow.fullJsonR2Key);
    const prompt = renderClipDetectionPrompt(transcriptToText(transcript));

    await publishProgress({ projectId, status: 'detecting', pct: 40, message: 'Detecting clips' });
    const raw = await complete(prompt, { tier: 'smart', maxTokens: 4096 });
    const detected = clipDetectionSchema.parse(extractJson(raw));

    const bounded = detected
      .filter((c) => {
        const len = c.end_ms - c.start_ms;
        return len >= CLIP_DETECTION.minClipMs && len <= CLIP_DETECTION.maxClipMs;
      })
      .slice(0, CLIP_DETECTION.maxClips);

    const inserted = await db
      .insert(clips)
      .values(
        bounded.map((c) => ({
          projectId,
          startMs: c.start_ms,
          endMs: c.end_ms,
          title: c.title,
          hookScore: c.hook_score,
          retentionScore: c.retention_score,
          emotionalScore: c.emotional_score,
          viralScore: c.viral_score,
          reasoning: c.reasoning,
          status: 'pending' as const,
        })),
      )
      .returning({ id: clips.id });

    await setProjectStatus(projectId, 'planning_broll');
    for (const { id } of inserted) {
      await enqueue(QUEUE.broll, { projectId, userId, clipId: id }, `broll:${id}`);
    }

    await publishProgress({
      projectId,
      status: 'planning_broll',
      pct: 100,
      message: `${inserted.length} clips detected`,
    });
    await logJobFinish(logId, 'done');
  } catch (err) {
    await logJobFinish(logId, 'failed', String(err));
    throw err;
  }
});

console.log('[worker-detect] ready');
