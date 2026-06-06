// Unit tests for the moderation decision logic. We mock ./env so importing the
// module doesn't pull zod (keeps the CI `npx tsx` run dependency-free); the
// actual decideVerdict() is pure and ignores env.
import { test, before, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module('../src/lib/env.ts', { namedExports: { env: {} } });

let decideVerdict: typeof import('../src/lib/moderation.ts').decideVerdict;

before(async () => {
  ({ decideVerdict } = await import('../src/lib/moderation.ts'));
});

test('accepts exactly one human SFW face', () => {
  assert.deepEqual(decideVerdict({ faces: 1, human: true, nsfw: false }), { ok: true });
});

test('rejects NSFW before anything else (even with a valid single face)', () => {
  const v = decideVerdict({ faces: 1, human: true, nsfw: true });
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.code, 'nsfw');
});

test('rejects non-human subjects', () => {
  const v = decideVerdict({ faces: 1, human: false, nsfw: false });
  assert.equal(v.ok === false && v.code, 'not_human');
});

test('rejects when no face is found', () => {
  const v = decideVerdict({ faces: 0, human: true, nsfw: false });
  assert.equal(v.ok === false && v.code, 'no_face');
});

test('rejects when multiple faces are present', () => {
  const v = decideVerdict({ faces: 3, human: true, nsfw: false });
  assert.equal(v.ok === false && v.code, 'multiple_faces');
});
