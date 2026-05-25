import {
  BROLL,
  type BRollCandidate,
  type BRollInsert,
  type OverlayStyle,
  type StockAsset,
} from '@vp/shared';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Short inserts read better as picture-in-picture than a full cutaway (§4.2 step 5). */
function chooseOverlay(durationMs: number): OverlayStyle {
  return durationMs < BROLL.pipThresholdMs ? 'picture-in-picture' : 'fullscreen';
}

/** Build a single insert from an accepted candidate and its chosen asset. */
export function buildInsert(
  candidate: BRollCandidate,
  asset: StockAsset,
  confidence: number,
  clipStartMs: number,
  clipEndMs: number,
): BRollInsert {
  const duration = clamp(candidate.suggestedDurationMs, BROLL.insertMinMs, BROLL.insertMaxMs);
  const startMs = clamp(candidate.insertAtMs, clipStartMs, clipEndMs - duration);
  const endMs = Math.min(startMs + duration, clipEndMs);
  return {
    startMs,
    endMs,
    query: candidate.visualConcept,
    source: asset.provider,
    assetId: asset.id,
    assetUrl: asset.url,
    thumbnailUrl: asset.thumbnailUrl,
    confidence,
    overlayStyle: chooseOverlay(endMs - startMs),
    reason: candidate.reasoning,
  };
}

/**
 * Density cap (§4.2 step 5): B-roll may cover at most maxCoverageRatio of the
 * clip. When over budget, drop the lowest-confidence inserts until under it.
 * Pure and deterministic. Inserts are returned in chronological order.
 */
export function enforceDensity(
  inserts: BRollInsert[],
  clipDurationMs: number,
  maxRatio = BROLL.maxCoverageRatio,
): BRollInsert[] {
  const budget = clipDurationMs * maxRatio;
  const byConfidence = [...inserts].sort((a, b) => b.confidence - a.confidence);

  const kept: BRollInsert[] = [];
  let covered = 0;
  for (const ins of byConfidence) {
    const len = ins.endMs - ins.startMs;
    if (covered + len <= budget) {
      kept.push(ins);
      covered += len;
    }
  }
  return kept.sort((a, b) => a.startMs - b.startMs);
}
