import type { StockAsset } from '@vp/shared';
import { describe, expect, it } from 'vitest';
import { planBroll } from '../src/engine.js';
import { buildWords, makeAsset, makeLibraryAsset, makeMockDeps, sentence } from './fixtures.js';

const asset = (id: string, provider: 'pexels' | 'pixabay', description: string): StockAsset =>
  makeAsset({
    id,
    provider,
    providerAssetId: id,
    url: `https://x/${id}.mp4`,
    description,
    durationMs: 10_000,
  });

describe('planBroll — integration', () => {
  it('produces one insert per accepted, well-spaced concept', async () => {
    // seg A (~0s) mentions "ocean"; a long pause then filler; seg with "rocket"
    // lands >8s later so the spacing rule lets both through.
    const words = buildWords([
      ['The', 80],
      ['ocean', 80],
      ['was', 80],
      ['calm', 80],
      ['that', 80],
      ['morning.', 6000],
      ['We', 80],
      ['walked', 80],
      ['along', 80],
      ['the', 80],
      ['quiet', 80],
      ['shore.', 2000],
      ['Then', 80],
      ['we', 80],
      ['built', 80],
      ['a', 80],
      ['rocket', 80],
      ['together.', 80],
    ]);

    const deps = makeMockDeps({
      verdicts: [
        { match: 'ocean', concept: 'ocean horizon', durationMs: 2500 },
        { match: 'rocket', concept: 'rocket launch', durationMs: 2500 },
      ],
      assetsByConcept: {
        ocean: [asset('o1', 'pexels', 'ocean horizon waves')],
        rocket: [asset('r1', 'pexels', 'rocket launch fire')],
      },
      embedTable: [
        { match: 'ocean', vector: [1, 0, 0] },
        { match: 'rocket', vector: [0, 1, 0] },
      ],
    });

    const plan = await planBroll({
      clip: { id: 'clip-1', startMs: 0, endMs: 30_000 },
      words,
      deps,
    });

    expect(plan.inserts).toHaveLength(2);
    expect(plan.inserts[0]?.query).toBe('ocean horizon');
    expect(plan.inserts[1]?.query).toBe('rocket launch');
    // chronological + spacing rule respected
    const spacing = (plan.inserts[1]?.startMs ?? 0) - (plan.inserts[0]?.startMs ?? 0);
    expect(spacing).toBeGreaterThanOrEqual(8000);
  });

  it('applies the diversity filter across a clip', async () => {
    const words = buildWords([
      ['Look', 80],
      ['at', 80],
      ['this', 80],
      ['first', 80],
      ['ocean', 80],
      ['scene', 80],
      ['right', 80],
      ['here', 80],
      ['okay', 5000], // ~3.5s segment, then a long pause forces a boundary
      ['And', 80],
      ['now', 80],
      ['watch', 80],
      ['the', 80],
      ['second', 80],
      ['ocean', 80],
      ['scene', 80],
      ['unfold', 80],
      ['slowly', 80],
      ['please', 80],
    ]);

    const deps = makeMockDeps({
      verdicts: [
        { match: 'first ocean', concept: 'ocean view', durationMs: 2500 },
        { match: 'second ocean', concept: 'ocean view', durationMs: 2500 },
      ],
      assetsByConcept: {
        ocean: [asset('waves', 'pexels', 'ocean waves'), asset('sunset', 'pexels', 'ocean sunset')],
      },
      // 'waves' and 'sunset' match before the generic 'ocean' query vector.
      embedTable: [
        { match: 'waves', vector: [1, 0, 0] },
        { match: 'sunset', vector: [0, 0, 1] },
        { match: 'ocean', vector: [0.9, 0.1, 0] },
      ],
    });

    const plan = await planBroll({
      clip: { id: 'clip-2', startMs: 0, endMs: 30_000 },
      words,
      deps,
    });

    expect(plan.inserts).toHaveLength(2);
    // Both segments ranked the 'waves' asset first; diversity forces the
    // second insert onto the different 'sunset' asset.
    expect(plan.inserts[0]?.assetId).toBe('waves');
    expect(plan.inserts[1]?.assetId).toBe('sunset');
  });

  it('returns an empty plan when the LLM declines every segment', async () => {
    const plan = await planBroll({
      clip: { id: 'clip-3', startMs: 0, endMs: 20_000 },
      words: sentence('this is a purely abstract reflection about how feelings change over time'),
      deps: makeMockDeps(),
    });
    expect(plan.inserts).toEqual([]);
    expect(plan.clipId).toBe('clip-3');
    expect(plan.version).toBe(1);
  });

  it('skips concepts with no matching stock assets', async () => {
    const deps = makeMockDeps({
      verdicts: [{ match: 'ocean', concept: 'ocean horizon', durationMs: 2500 }],
      assetsByConcept: {}, // no assets at all
      embedTable: [{ match: 'ocean', vector: [1, 0, 0] }],
    });
    const plan = await planBroll({
      clip: { id: 'clip-4', startMs: 0, endMs: 20_000 },
      words: sentence('The ocean was calm and bright that early morning today.'),
      deps,
    });
    expect(plan.inserts).toEqual([]);
  });
});

// --- Snapshot suite: 5 reference transcripts × 3 modes = 15 plans (§4.7) ---
describe('planBroll — reference snapshots', () => {
  const sharedDeps = () =>
    makeMockDeps({
      verdicts: [
        { match: 'algorithm', concept: 'glowing neural network', durationMs: 2500 },
        { match: 'mountain', concept: 'mountain summit sunrise', durationMs: 3000 },
        { match: 'startup', concept: 'rocket launch metaphor', durationMs: 2000 },
        { match: 'ocean', concept: 'deep ocean current', durationMs: 2500 },
        { match: 'brain', concept: 'synapses firing macro', durationMs: 2500 },
      ],
      assetsByConcept: {
        neural: [asset('n1', 'pexels', 'glowing neural network nodes')],
        mountain: [asset('m1', 'pixabay', 'mountain summit sunrise')],
        rocket: [asset('rk1', 'pexels', 'rocket launch metaphor')],
        ocean: [asset('oc1', 'pexels', 'deep ocean current')],
        synapses: [asset('s1', 'pixabay', 'synapses firing macro')],
      },
      embedTable: [
        { match: 'neural', vector: [1, 0, 0, 0, 0] },
        { match: 'mountain', vector: [0, 1, 0, 0, 0] },
        { match: 'rocket', vector: [0, 0, 1, 0, 0] },
        { match: 'ocean', vector: [0, 0, 0, 1, 0] },
        { match: 'synapses', vector: [0, 0, 0, 0, 1] },
      ],
      // A library asset per concept so my_library / hybrid have material.
      library: [
        makeLibraryAsset('lib-neural', [1, 0, 0, 0, 0], { description: 'my neural network shot' }),
        makeLibraryAsset('lib-mountain', [0, 1, 0, 0, 0], { description: 'my mountain shot' }),
        makeLibraryAsset('lib-rocket', [0, 0, 1, 0, 0], { description: 'my rocket shot' }),
        makeLibraryAsset('lib-ocean', [0, 0, 0, 1, 0], { description: 'my ocean shot' }),
        makeLibraryAsset('lib-synapses', [0, 0, 0, 0, 1], { description: 'my synapses shot' }),
      ],
    });

  const references: Record<string, string> = {
    podcast:
      'So the algorithm completely changed how we think. ' +
      'It was like climbing a mountain you never expected to summit. ' +
      'And honestly that startup energy carried the whole team forward.',
    educational:
      'Today we study how the brain forms memories. ' +
      'Every algorithm in the cortex competes for attention. ' +
      'Think of it like an ocean of signals washing over neurons.',
    emotional:
      'I felt completely lost and unsure about everything back then. ' +
      'There were no easy answers and no clear path forward at all.',
    interview:
      'You asked about scaling the startup in those early days. ' +
      'The algorithm we shipped was rough but it worked surprisingly well. ' +
      'It honestly felt like staring into the deep ocean of unknowns.',
    insight:
      'The single biggest lever is how your brain frames a problem. ' +
      'A great algorithm is just a sharpened version of that instinct.',
  };

  const modes = ['auto_stock', 'my_library', 'hybrid'] as const;

  for (const [name, text] of Object.entries(references)) {
    for (const mode of modes) {
      it(`matches the plan snapshot: ${name} / ${mode}`, async () => {
        const plan = await planBroll({
          clip: { id: `ref-${name}`, startMs: 0, endMs: 90_000 },
          words: sentence(text),
          deps: sharedDeps(),
          mode,
        });
        // Coverage never exceeds 40% of the clip (density invariant).
        const covered = plan.inserts.reduce((s, i) => s + (i.endMs - i.startMs), 0);
        expect(covered).toBeLessThanOrEqual(90_000 * 0.4);
        expect(plan).toMatchSnapshot();
      });
    }
  }
});
