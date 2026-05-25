import { describe, expect, it } from 'vitest';
import { cosineSimilarity } from './cosine.js';
import { renderBRollPrompt } from './prompts/broll.js';

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });
  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
  it('is -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });
  it('returns 0 for a zero vector instead of NaN', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
  it('throws on length mismatch', () => {
    expect(() => cosineSimilarity([1, 2], [1])).toThrow();
  });
});

describe('renderBRollPrompt', () => {
  it('substitutes every placeholder', () => {
    const out = renderBRollPrompt({
      transcript: 'hello world',
      startMs: 1000,
      endMs: 4000,
      prevContext: 'before',
    });
    expect(out).toContain('hello world');
    expect(out).toContain('1000ms');
    expect(out).toContain('4000ms');
    expect(out).toContain('before');
    expect(out).not.toContain('{{');
  });
});
