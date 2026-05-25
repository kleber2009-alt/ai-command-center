import type { StockAsset } from '@vp/shared';
import { describe, expect, it } from 'vitest';
import { planBroll } from '../src/engine.js';
import { makeAsset, makeLibraryAsset, makeMockDeps, sentence } from './fixtures.js';

const stock = (id: string, provider: 'pexels' | 'pixabay', description: string): StockAsset =>
  makeAsset({
    id,
    provider,
    providerAssetId: id,
    url: `https://x/${id}.mp4`,
    description,
    durationMs: 10_000,
  });

// One ocean concept, embed vector [1,0,0]. Library assets sit near/far from it.
const oceanDeps = (over: Parameters<typeof makeMockDeps>[0] = {}) =>
  makeMockDeps({
    verdicts: [{ match: 'ocean', concept: 'deep ocean', durationMs: 2500 }],
    embedTable: [
      { match: 'ocean', vector: [1, 0, 0] },
      { match: 'waves', vector: [1, 0, 0] },
      { match: 'desert', vector: [0, 0, 1] },
    ],
    assetsByConcept: { ocean: [stock('s1', 'pexels', 'ocean waves stock')] },
    ...over,
  });

const oceanWords = () => sentence('The ocean was calm and bright that early morning today.');
const clip = { id: 'c', startMs: 0, endMs: 20_000 };

describe('my_library mode', () => {
  it('sources only from the library and flags the insert as from-library', async () => {
    const deps = oceanDeps({
      library: [makeLibraryAsset('lib-ocean', [1, 0, 0], { description: 'my ocean waves clip' })],
    });
    const plan = await planBroll({ clip, words: oceanWords(), deps, mode: 'my_library' });

    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]?.source).toBe('user_library');
    expect(plan.inserts[0]?.fromUserLibrary).toBe(true);
    expect(plan.inserts[0]?.assetId).toBe('lib-ocean');
  });

  it('marks low-confidence when fewer than 3 assets clear the similarity bar', async () => {
    // Only one weak (desert) asset → below the libraryMinSimilarity threshold.
    const deps = oceanDeps({
      library: [makeLibraryAsset('lib-desert', [0, 0, 1], { description: 'desert dunes' })],
    });
    const plan = await planBroll({ clip, words: oceanWords(), deps, mode: 'my_library' });

    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]?.lowConfidence).toBe(true);
    expect(plan.inserts[0]?.fromUserLibrary).toBe(true);
  });

  it('produces no inserts when the library is empty', async () => {
    const deps = oceanDeps({ library: [] });
    const plan = await planBroll({ clip, words: oceanWords(), deps, mode: 'my_library' });
    expect(plan.inserts).toEqual([]);
  });
});

describe('hybrid mode', () => {
  it('uses only the library when there are enough confident matches', async () => {
    const deps = oceanDeps({
      library: [
        makeLibraryAsset('h1', [1, 0, 0]),
        makeLibraryAsset('h2', [0.98, 0.02, 0]),
        makeLibraryAsset('h3', [0.96, 0.04, 0]),
      ],
    });
    const plan = await planBroll({ clip, words: oceanWords(), deps, mode: 'hybrid' });

    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]?.fromUserLibrary).toBe(true);
    expect(plan.inserts[0]?.assetId).toMatch(/^h[123]$/);
  });

  it('falls back to stock but the library still wins via the +0.15 bonus', async () => {
    // One library asset slightly worse than stock on raw cosine, but the bonus
    // pushes it ahead. Only 1 confident library hit → stock is also gathered.
    const deps = oceanDeps({
      library: [makeLibraryAsset('lib-close', [0.9, 0.1, 0], { description: 'ocean-ish library' })],
      assetsByConcept: { ocean: [stock('s-better', 'pexels', 'ocean waves stock')] },
    });
    // s-better embeds to 'ocean waves' → [1,0,0] (cosine 1). lib-close cosine ~0.99.
    const plan = await planBroll({ clip, words: oceanWords(), deps, mode: 'hybrid' });

    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]?.fromUserLibrary).toBe(true);
    expect(plan.inserts[0]?.assetId).toBe('lib-close');
  });

  it('uses stock when the library is empty', async () => {
    const deps = oceanDeps({ library: [] });
    const plan = await planBroll({ clip, words: oceanWords(), deps, mode: 'hybrid' });
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]?.source).toBe('pexels');
    expect(plan.inserts[0]?.fromUserLibrary).toBe(false);
  });
});
