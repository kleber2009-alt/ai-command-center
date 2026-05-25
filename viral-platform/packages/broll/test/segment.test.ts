import { describe, expect, it } from 'vitest';
import { segmentTranscript, wordsInClip } from '../src/segment.js';
import { buildWords } from './fixtures.js';

describe('segmentTranscript', () => {
  it('returns empty for empty input', () => {
    expect(segmentTranscript([])).toEqual([]);
  });

  it('splits on a long pause once the min length is reached', () => {
    // Two ~4s clusters separated by a 1s pause.
    const words = buildWords([
      ['So', 80],
      ['here', 80],
      ['is', 80],
      ['the', 80],
      ['first', 80],
      ['idea', 80],
      ['that', 80],
      ['matters', 80],
      ['today', 80],
      ['really', 1000], // big pause after a >3s run
      ['and', 80],
      ['then', 80],
      ['the', 80],
      ['second', 80],
      ['idea', 80],
      ['comes', 80],
      ['right', 80],
      ['after', 80],
      ['it', 80],
      ['now', 80],
    ]);
    const segs = segmentTranscript(words);
    expect(segs.length).toBe(2);
    expect(segs[0]?.text.startsWith('So here')).toBe(true);
    expect(segs[1]?.text.startsWith('and then')).toBe(true);
  });

  it('does not split on a pause before the min length', () => {
    const words = buildWords([
      ['Quick', 80],
      ['note', 1000], // pause but only ~0.8s in
      ['then', 80],
      ['more', 80],
      ['words', 80],
      ['to', 80],
      ['cross', 80],
      ['the', 80],
      ['minimum', 80],
      ['length', 80],
    ]);
    const segs = segmentTranscript(words);
    // The early pause is ignored; the leading micro-block merges forward.
    expect(segs.length).toBe(1);
  });

  it('hard-splits when a block exceeds the max length', () => {
    // 40 words at ~430ms each ≈ 17s with no pauses or punctuation.
    const words = buildWords(
      Array.from({ length: 40 }, (_, i) => [`w${i}`, 80] as [string, number]),
    );
    const segs = segmentTranscript(words);
    expect(segs.length).toBeGreaterThan(1);
    // Blocks split at the 8s cap, but a trailing micro-block can merge into the
    // previous segment and push it a little past the cap (cap + < min length).
    for (const s of segs) {
      expect(s.endMs - s.startMs).toBeLessThanOrEqual(11_000);
    }
  });

  it('merges a trailing micro-block into the previous segment', () => {
    const words = buildWords([
      ['One', 80],
      ['two', 80],
      ['three', 80],
      ['four', 80],
      ['five', 80],
      ['six', 80],
      ['seven', 80],
      ['eight.', 1000], // sentence end after ~3.4s → boundary
      ['ok', 80], // lone trailing micro-block
    ]);
    const segs = segmentTranscript(words);
    expect(segs.length).toBe(1);
    expect(segs[0]?.text.endsWith('ok')).toBe(true);
  });
});

describe('wordsInClip', () => {
  it('keeps only words overlapping the window', () => {
    const words = buildWords([
      ['a', 0],
      ['b', 0],
      ['c', 0],
      ['d', 0],
    ]); // each 350ms, contiguous: a[0-350] b[350-700] c[700-1050] d[1050-1400]
    const inClip = wordsInClip(words, 360, 1040);
    expect(inClip.map((w) => w.word)).toEqual(['b', 'c']);
  });
});
