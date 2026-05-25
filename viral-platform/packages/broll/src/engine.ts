import type { BRollInsert, BRollPlan, BrollMode, TranscriptWord } from '@vp/shared';
import { extractCandidates } from './candidates.js';
import type { BrollEngineDeps } from './deps.js';
import { buildInsert, enforceDensity } from './plan.js';
import { embedQuery, pickWithDiversity, rankAssets } from './rank.js';
import { segmentTranscript, wordsInClip } from './segment.js';
import { gatherCandidates } from './sourcing.js';

export interface PlanBrollInput {
  clip: { id: string; startMs: number; endMs: number };
  /** Full transcript words; the engine scopes them to the clip window. */
  words: TranscriptWord[];
  deps: BrollEngineDeps;
  /** B-roll sourcing mode (§4.0). Defaults to auto_stock. */
  mode?: BrollMode;
  /** Restrict library search to one collection (my_library / hybrid). */
  libraryCollectionId?: string;
}

/**
 * The B-roll engine (spec §4). Runs the five-step pipeline for one clip:
 *   1. segment transcript → thought blocks
 *   2. LLM decides which blocks get B-roll
 *   3. gather candidates per mode (stock / library / hybrid, §4.3–§4.5)
 *   4. embed + rank by cosine (hybrid bonus), diversity filter across the clip
 *   5. assemble the plan and cap density
 *
 * Returns a versioned BRollPlan. Candidates are processed in order so the
 * diversity filter can see everything already chosen for this clip.
 */
export async function planBroll(input: PlanBrollInput): Promise<BRollPlan> {
  const { clip, words, deps, libraryCollectionId } = input;
  const mode: BrollMode = input.mode ?? 'auto_stock';

  const scoped = wordsInClip(words, clip.startMs, clip.endMs);
  const segments = segmentTranscript(scoped);
  const candidates = await extractCandidates(segments, deps);

  const inserts: BRollInsert[] = [];
  const usedEmbeddings: number[][] = [];

  for (const candidate of candidates) {
    const queryEmbedding = await embedQuery(candidate.visualConcept, deps);

    const sourced = await gatherCandidates({
      mode,
      visualConcept: candidate.visualConcept,
      durationMs: candidate.suggestedDurationMs,
      queryEmbedding,
      collectionId: libraryCollectionId,
      deps,
    });
    if (sourced.assets.length === 0) {
      deps.logger?.('no assets found', { concept: candidate.visualConcept, mode });
      continue;
    }

    const ranked = rankAssets(
      queryEmbedding,
      sourced.assets,
      sourced.embeddings,
      undefined,
      sourced.scoreBonus,
    );
    const chosen = pickWithDiversity(ranked, sourced.embeddings, usedEmbeddings);
    if (!chosen) continue;

    inserts.push(
      buildInsert(candidate, chosen.asset, chosen.similarity, clip.startMs, clip.endMs, {
        lowConfidence: sourced.lowConfidence,
      }),
    );
    const v = sourced.embeddings.get(chosen.asset.id);
    if (v) usedEmbeddings.push(v);
  }

  const clipDuration = clip.endMs - clip.startMs;
  return {
    clipId: clip.id,
    version: 1,
    inserts: enforceDensity(inserts, clipDuration),
  };
}
