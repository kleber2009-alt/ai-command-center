import { describe, expect, it } from 'vitest';
import { pickWithDiversity, rankAssets } from '../src/rank.js';
import { makeAsset } from './fixtures.js';

describe('rankAssets', () => {
  it('orders assets by cosine similarity to the query', () => {
    const query = [1, 0, 0];
    const a = makeAsset({ id: 'a' }); // aligned with query
    const b = makeAsset({ id: 'b' }); // orthogonal
    const c = makeAsset({ id: 'c' }); // opposite
    const embeddings = new Map([
      ['a', [1, 0, 0]],
      ['b', [0, 1, 0]],
      ['c', [-1, 0, 0]],
    ]);
    const ranked = rankAssets(query, [c, b, a], embeddings, 3);
    expect(ranked.map((r) => r.asset.id)).toEqual(['a', 'b', 'c']);
    expect(ranked[0]?.similarity).toBeCloseTo(1, 5);
  });

  it('drops assets without an embedding', () => {
    const ranked = rankAssets([1, 0, 0], [makeAsset({ id: 'x' })], new Map());
    expect(ranked).toEqual([]);
  });

  it('truncates to topN', () => {
    const assets = ['a', 'b', 'c', 'd'].map((id) => makeAsset({ id }));
    const embeddings = new Map(assets.map((a, i) => [a.id, [1, i * 0.01, 0]]));
    expect(rankAssets([1, 0, 0], assets, embeddings, 2)).toHaveLength(2);
  });
});

describe('pickWithDiversity', () => {
  const embeddings = new Map([
    ['ocean1', [1, 0, 0]],
    ['ocean2', [0.99, 0.01, 0]], // nearly identical to ocean1
    ['city', [0, 1, 0]],
  ]);

  it('returns the top match when nothing was used yet', () => {
    const ranked = [
      { asset: makeAsset({ id: 'ocean1' }), similarity: 0.9 },
      { asset: makeAsset({ id: 'city' }), similarity: 0.7 },
    ];
    expect(pickWithDiversity(ranked, embeddings, [])?.asset.id).toBe('ocean1');
  });

  it('skips a candidate too similar to an already-used asset', () => {
    const ranked = [
      { asset: makeAsset({ id: 'ocean2' }), similarity: 0.95 },
      { asset: makeAsset({ id: 'city' }), similarity: 0.6 },
    ];
    // ocean1 already used → ocean2 (cosine ~1) is rejected, city wins.
    const picked = pickWithDiversity(ranked, embeddings, [[1, 0, 0]], 0.92);
    expect(picked?.asset.id).toBe('city');
  });

  it('falls back to the top match if every candidate clashes', () => {
    const ranked = [{ asset: makeAsset({ id: 'ocean2' }), similarity: 0.95 }];
    const picked = pickWithDiversity(ranked, embeddings, [[1, 0, 0]], 0.92);
    expect(picked?.asset.id).toBe('ocean2');
  });

  it('returns undefined for an empty shortlist', () => {
    expect(pickWithDiversity([], embeddings, [])).toBeUndefined();
  });
});
