import type { BRollCandidate, BRollInsert } from '@vp/shared';
import { describe, expect, it } from 'vitest';
import { buildInsert, enforceDensity } from '../src/plan.js';
import { makeAsset } from './fixtures.js';

function candidate(over: Partial<BRollCandidate> = {}): BRollCandidate {
  return {
    segment: { startMs: 1000, endMs: 4000, text: 'x', wordCount: 5 },
    shouldInsert: true,
    reasoning: 'r',
    keywords: ['k'],
    visualConcept: 'concept',
    style: 'metaphorical',
    suggestedDurationMs: 2500,
    insertAtMs: 1000,
    ...over,
  };
}

describe('buildInsert', () => {
  it('clamps duration into [1.5s, 4s]', () => {
    const short = buildInsert(candidate({ suggestedDurationMs: 500 }), makeAsset(), 0.8, 0, 60_000);
    expect(short.endMs - short.startMs).toBe(1500);

    const long = buildInsert(candidate({ suggestedDurationMs: 9000 }), makeAsset(), 0.8, 0, 60_000);
    expect(long.endMs - long.startMs).toBe(4000);
  });

  it('uses picture-in-picture for short inserts and fullscreen otherwise', () => {
    const pip = buildInsert(candidate({ suggestedDurationMs: 1600 }), makeAsset(), 0.8, 0, 60_000);
    expect(pip.overlayStyle).toBe('picture-in-picture');

    const full = buildInsert(candidate({ suggestedDurationMs: 3000 }), makeAsset(), 0.8, 0, 60_000);
    expect(full.overlayStyle).toBe('fullscreen');
  });

  it('keeps the insert inside the clip bounds', () => {
    const ins = buildInsert(
      candidate({ insertAtMs: 59_500, suggestedDurationMs: 4000 }),
      makeAsset(),
      0.8,
      0,
      60_000,
    );
    expect(ins.endMs).toBeLessThanOrEqual(60_000);
    expect(ins.startMs).toBeGreaterThanOrEqual(0);
  });

  it('copies asset + reasoning into the insert', () => {
    const ins = buildInsert(
      candidate(),
      makeAsset({ id: 'pexels:42', provider: 'pexels' }),
      0.73,
      0,
      60_000,
    );
    expect(ins.assetId).toBe('pexels:42');
    expect(ins.source).toBe('pexels');
    expect(ins.confidence).toBe(0.73);
    expect(ins.query).toBe('concept');
    expect(ins.fromUserLibrary).toBe(false);
  });

  it('flags user-library assets and labels their reason', () => {
    const ins = buildInsert(candidate(), makeAsset({ provider: 'user_library' }), 0.8, 0, 60_000);
    expect(ins.source).toBe('user_library');
    expect(ins.fromUserLibrary).toBe(true);
    expect(ins.reason).toContain('галереи');
  });

  it('carries a low-confidence flag when asked', () => {
    const ins = buildInsert(candidate(), makeAsset(), 0.4, 0, 60_000, { lowConfidence: true });
    expect(ins.lowConfidence).toBe(true);
  });
});

describe('enforceDensity', () => {
  const ins = (startMs: number, endMs: number, confidence: number): BRollInsert => ({
    startMs,
    endMs,
    query: 'q',
    source: 'pexels',
    assetId: `a${startMs}`,
    assetUrl: 'u',
    thumbnailUrl: 't',
    confidence,
    overlayStyle: 'fullscreen',
    reason: 'r',
    fromUserLibrary: false,
  });

  it('keeps all inserts when under the coverage budget', () => {
    const inserts = [ins(0, 2000, 0.9), ins(5000, 7000, 0.8)];
    // 4s of 30s clip = 13% < 40%
    expect(enforceDensity(inserts, 30_000)).toHaveLength(2);
  });

  it('drops lowest-confidence inserts when over budget', () => {
    // clip 10s, budget = 4s. Three 2s inserts (6s total) → keep 2 highest.
    const inserts = [ins(0, 2000, 0.5), ins(3000, 5000, 0.9), ins(6000, 8000, 0.7)];
    const kept = enforceDensity(inserts, 10_000);
    expect(kept).toHaveLength(2);
    expect(kept.map((i) => i.confidence).sort()).toEqual([0.7, 0.9]);
  });

  it('returns inserts in chronological order', () => {
    const inserts = [ins(6000, 8000, 0.7), ins(0, 2000, 0.9), ins(3000, 5000, 0.8)];
    const kept = enforceDensity(inserts, 30_000);
    expect(kept.map((i) => i.startMs)).toEqual([0, 3000, 6000]);
  });
});
