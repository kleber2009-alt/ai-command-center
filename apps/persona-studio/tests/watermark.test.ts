// Unit tests for the free-plan watermark gate. Pure, import-free module → runs
// under the dependency-free CI runner.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldWatermark } from '../src/lib/watermark-gate.ts';

test('watermarks a free (never-paid) user when the feature is enabled', () => {
  assert.equal(shouldWatermark(true, false), true);
});

test('never watermarks a paying user, even with the feature enabled', () => {
  assert.equal(shouldWatermark(true, true), false);
});

test('does nothing when the feature is disabled (default off)', () => {
  assert.equal(shouldWatermark(false, false), false);
  assert.equal(shouldWatermark(false, true), false);
});
