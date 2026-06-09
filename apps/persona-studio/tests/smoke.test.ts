// Smoke tests for the main-path configuration: avatar styles + video engines.
// These are pure modules (no DB, no env Zod parse — video-engines reads
// process.env directly with defaults), so they import cleanly and lock the
// happy-path wiring (Photo → Avatars → Video) against accidental breakage.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AVATAR_STYLES } from '../src/lib/styles.ts';
import {
  VIDEO_ENGINES,
  VIDEO_ENGINE_LIST,
  engineConfig,
  isVideoEngine,
} from '../src/lib/video-engines.ts';

test('avatar styles catalog is non-empty with unique slugs and required fields', () => {
  assert.ok(AVATAR_STYLES.length >= 10, `expected ≥10 styles, got ${AVATAR_STYLES.length}`);
  const slugs = AVATAR_STYLES.map((s) => s.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'slugs must be unique');
  for (const s of AVATAR_STYLES) {
    assert.ok(s.slug && s.label && s.promptStyle, `style ${s.slug} missing required fields`);
  }
});

test('every video engine has a positive cost and a valid queue', () => {
  const validQueues = new Set(['heygen-video', 'omnihuman-video']);
  for (const [slug, cfg] of Object.entries(VIDEO_ENGINES)) {
    assert.ok(cfg.cost > 0, `engine ${slug} must cost > 0`);
    assert.ok(validQueues.has(cfg.queueName), `engine ${slug} has unknown queue ${cfg.queueName}`);
  }
});

test('repriced video costs are reflected in engine defaults', () => {
  // After PS-6: HeyGen 100, OmniHuman 140 (env-overridable; unset in CI → default).
  assert.equal(VIDEO_ENGINES['heygen-v5'].cost, 100);
  assert.equal(VIDEO_ENGINES['omnihuman-1.5'].cost, 140);
});

test('engine helpers agree with the catalog', () => {
  assert.ok(VIDEO_ENGINE_LIST.length >= 1);
  for (const slug of VIDEO_ENGINE_LIST) {
    assert.ok(isVideoEngine(slug));
    assert.equal(engineConfig(slug), VIDEO_ENGINES[slug]);
  }
  assert.equal(isVideoEngine('not-an-engine'), false);
});
