import type { BRollInsert, BRollPlan, TranscriptWord } from '@vp/shared';
import { extractCandidates } from './candidates.js';
import type { BrollEngineDeps } from './deps.js';
import { buildInsert, enforceDensity } from './plan.js';
import { embedAssets, embedQuery, pickWithDiversity, rankAssets } from './rank.js';
import { searchAssets } from './search.js';
import { segmentTranscript, wordsInClip } from './segment.js';

export interface PlanBrollInput {
  clip: { id: string; startMs: number; endMs: number };
  /** Full transcript words; the engine scopes them to the clip window. */
  words: TranscriptWord[];
  deps: BrollEngineDeps;
}

/**
 * The B-roll engine (spec §4). Runs the five-step pipeline for one clip:
 *   1. segment transcript → thought blocks
 *   2. LLM decides which blocks get B-roll
 *   3. search stock for each visual concept
 *   4. embed + rank by cosine, with a diversity filter across the clip
 *   5. assemble the plan and cap density
 *
 * Returns a versioned BRollPlan. Candidates are processed in order so the
 * diversity filter can see everything already chosen for this clip.
 */
export async function planBroll(input: PlanBrollInput): Promise<BRollPlan> {
  const { clip, words, deps } = input;

  const scoped = wordsInClip(words, clip.startMs, clip.endMs);
  const segments = segmentTranscript(scoped);
  const candidates = await extractCandidates(segments, deps);

  const inserts: BRollInsert[] = [];
  const usedEmbeddings: number[][] = [];

  for (const candidate of candidates) {
    const duration = candidate.suggestedDurationMs;
    const assets = await searchAssets(candidate.visualConcept, duration, deps);
    if (assets.length === 0) {
      deps.logger?.('no assets found', { concept: candidate.visualConcept });
      continue;
    }

    const [queryEmbedding, assetEmbeddings] = await Promise.all([
      embedQuery(candidate.visualConcept, deps),
      embedAssets(assets, deps),
    ]);

    const ranked = rankAssets(queryEmbedding, assets, assetEmbeddings);
    const chosen = pickWithDiversity(ranked, assetEmbeddings, usedEmbeddings);
    if (!chosen) continue;

    inserts.push(buildInsert(candidate, chosen.asset, chosen.similarity, clip.startMs, clip.endMs));
    const v = assetEmbeddings.get(chosen.asset.id);
    if (v) usedEmbeddings.push(v);
  }

  const clipDuration = clip.endMs - clip.startMs;
  return {
    clipId: clip.id,
    version: 1,
    inserts: enforceDensity(inserts, clipDuration),
  };
}
