import { complete, embed, searchPexels, searchPixabay } from '@vp/ai';
import { type BrollEngineDeps, planBroll } from '@vp/broll';
import {
  brollPlans,
  clips,
  db,
  logJobFinish,
  logJobStart,
  projects,
  searchLibraryAssets,
  setProjectStatus,
  transcripts,
} from '@vp/db';
import { QUEUE, createWorker, publishProgress, redisCache } from '@vp/queue';
import type { Transcript } from '@vp/shared';
import { getJson } from '@vp/storage';
import { and, eq, ne } from 'drizzle-orm';

// The stock + LLM half of the engine's contract, shared across jobs.
const baseDeps = {
  llmComplete: (prompt: string) => complete(prompt, { tier: 'smart' as const, maxTokens: 512 }),
  embed,
  searchPexels,
  searchPixabay,
  cache: redisCache,
  logger: (msg: string, meta?: Record<string, unknown>) => console.log('[broll]', msg, meta ?? ''),
};

/** Per-user deps: adds pgvector library search bound to the project owner. */
function depsForUser(userId: string): BrollEngineDeps {
  return {
    ...baseDeps,
    searchLibrary: (queryEmbedding, opts) => searchLibraryAssets(userId, queryEmbedding, opts),
  };
}

/**
 * worker-broll (§4): the flagship. Loads the transcript + clip, runs the B-roll
 * engine, persists a versioned plan, and marks the clip ready. When every clip
 * in the project is planned, the project advances to ready_for_review.
 */
createWorker(QUEUE.broll, async (job) => {
  const { projectId, clipId } = job.data;
  const logId = await logJobStart(job.id ?? '', projectId, QUEUE.broll);

  try {
    await db.update(clips).set({ status: 'planning' }).where(eq(clips.id, clipId));
    await publishProgress({
      projectId,
      status: 'planning_broll',
      pct: 20,
      message: 'Planning B-roll',
    });

    const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
    if (!clip) throw new Error(`clip ${clipId} not found`);

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) throw new Error(`project ${projectId} not found`);

    const [tRow] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.projectId, projectId))
      .limit(1);
    if (!tRow) throw new Error(`no transcript for project ${projectId}`);
    const transcript = await getJson<Transcript>(tRow.fullJsonR2Key);

    const plan = await planBroll({
      clip: { id: clip.id, startMs: clip.startMs, endMs: clip.endMs },
      words: transcript.words,
      deps: depsForUser(project.userId),
      mode: project.brollMode,
      libraryCollectionId: project.libraryCollectionId ?? undefined,
    });

    // Bump version on re-plan so the editor can diff (broll.regenerateBroll, §7).
    const [latest] = await db
      .select({ version: brollPlans.version })
      .from(brollPlans)
      .where(eq(brollPlans.clipId, clipId))
      .orderBy(brollPlans.version);
    const version = (latest?.version ?? 0) + 1;

    await db.insert(brollPlans).values({ clipId, version, inserts: plan.inserts });
    await db.update(clips).set({ status: 'ready' }).where(eq(clips.id, clipId));

    // Advance the project once no clip is still pending/planning.
    const [stillPending] = await db
      .select({ id: clips.id })
      .from(clips)
      .where(and(eq(clips.projectId, projectId), ne(clips.status, 'ready')))
      .limit(1);
    if (!stillPending) {
      await setProjectStatus(projectId, 'ready_for_review');
      await publishProgress({ projectId, status: 'ready_for_review', pct: 100, message: 'Ready' });
    }

    await logJobFinish(logId, 'done');
  } catch (err) {
    await db.update(clips).set({ status: 'failed' }).where(eq(clips.id, clipId));
    await logJobFinish(logId, 'failed', String(err));
    throw err;
  }
});

console.log('[worker-broll] ready');
