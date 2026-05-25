import { BROLL, type TranscriptSegment, type TranscriptWord } from '@vp/shared';

const SENTENCE_END = /[.!?…]$/;

export interface SegmentOptions {
  minMs: number;
  maxMs: number;
  pauseThresholdMs: number;
}

const DEFAULTS: SegmentOptions = {
  minMs: BROLL.segmentMinMs,
  maxMs: BROLL.segmentMaxMs,
  pauseThresholdMs: BROLL.pauseThresholdMs,
};

/**
 * Step 1 (§4.2): split a word-level transcript into semantic "thought" blocks
 * of ~3–8s. Boundaries come from natural pauses (>threshold), sentence
 * endings, and a hard max length. Micro-blocks are then merged into neighbors.
 *
 * Pure and deterministic — the spec mentions an optional LLM merge pass, but
 * that lives outside this function so it stays unit-testable.
 */
export function segmentTranscript(
  words: TranscriptWord[],
  opts: Partial<SegmentOptions> = {},
): TranscriptSegment[] {
  const o = { ...DEFAULTS, ...opts };
  if (words.length === 0) return [];

  const raw: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i] as TranscriptWord;
    current.push(word);

    const next = words[i + 1];
    const gap = next ? next.startMs - word.endMs : Number.POSITIVE_INFINITY;
    const duration = word.endMs - (current[0] as TranscriptWord).startMs;

    const hardSplit = duration >= o.maxMs;
    const pauseSplit = gap > o.pauseThresholdMs && duration >= o.minMs;
    const sentenceSplit = SENTENCE_END.test(word.word) && duration >= o.minMs;

    if (hardSplit || pauseSplit || sentenceSplit || next === undefined) {
      raw.push(current);
      current = [];
    }
  }

  const merged = mergeMicroBlocks(raw, o.minMs);
  return merged.map(toSegment);
}

/** Fold blocks shorter than minMs into an adjacent block (prefer the previous). */
function mergeMicroBlocks(blocks: TranscriptWord[][], minMs: number): TranscriptWord[][] {
  const out: TranscriptWord[][] = [];
  for (const block of blocks) {
    const dur = blockDuration(block);
    if (dur < minMs && out.length > 0) {
      (out[out.length - 1] as TranscriptWord[]).push(...block);
    } else {
      out.push([...block]);
    }
  }
  // A leading micro-block can't merge backwards; fold it forwards instead.
  if (out.length > 1 && blockDuration(out[0] as TranscriptWord[]) < minMs) {
    const [first, second, ...rest] = out;
    return [[...(first as TranscriptWord[]), ...(second as TranscriptWord[])], ...rest];
  }
  return out;
}

function blockDuration(block: TranscriptWord[]): number {
  if (block.length === 0) return 0;
  return (block[block.length - 1] as TranscriptWord).endMs - (block[0] as TranscriptWord).startMs;
}

function toSegment(block: TranscriptWord[]): TranscriptSegment {
  const first = block[0] as TranscriptWord;
  const last = block[block.length - 1] as TranscriptWord;
  return {
    startMs: first.startMs,
    endMs: last.endMs,
    text: block.map((w) => w.word).join(' '),
    wordCount: block.length,
  };
}

/** Restrict words to those overlapping a clip's [startMs, endMs] window. */
export function wordsInClip(
  words: TranscriptWord[],
  startMs: number,
  endMs: number,
): TranscriptWord[] {
  return words.filter((w) => w.endMs > startMs && w.startMs < endMs);
}
