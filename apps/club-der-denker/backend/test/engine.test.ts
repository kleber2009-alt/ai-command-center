import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelForProgress, currentDayIndex, itemsDoneToday } from '../src/lib/engine/levels';
import { evaluateUnlock, localDay } from '../src/lib/engine/unlock';
import { registerActivity, applyInactivitySweep, grantJokerOnPurchase } from '../src/lib/engine/streak';
import { evaluateCommunityAccess } from '../src/lib/engine/community';
import { validateAppleCertChain } from '../src/lib/engine/iap-verify';

test('levels: thresholds per spec 3.3', () => {
  assert.equal(levelForProgress(0, false), 1); // guest
  assert.equal(levelForProgress(0, true), 2); // right after purchase
  assert.equal(levelForProgress(4, true), 2);
  assert.equal(levelForProgress(27, true), 2);
  assert.equal(levelForProgress(28, true), 3); // 25%
  assert.equal(levelForProgress(55, true), 3);
  assert.equal(levelForProgress(56, true), 4); // 50%
  assert.equal(levelForProgress(111, true), 4);
  assert.equal(levelForProgress(112, true), 5); // final
});

test('levels: day index & items done today', () => {
  assert.equal(currentDayIndex(0), 1);
  assert.equal(currentDayIndex(4), 2);
  assert.equal(currentDayIndex(111), 28);
  assert.equal(itemsDoneToday(4), 0);
  assert.equal(itemsDoneToday(6), 2);
});

test('unlock: mid-pack always unlocked', () => {
  const r = evaluateUnlock({ itemsCompleted: 2, lastCompletionDay: '2026-06-02', timeZone: 'Europe/Berlin', now: new Date('2026-06-02T10:00:00Z') });
  assert.equal(r.unlocked, true);
});

test('unlock: locked same local day after finishing pack', () => {
  const now = new Date('2026-06-02T22:00:00Z'); // Berlin = midnight+ but same day region check
  const today = localDay(now, 'Europe/Berlin');
  const r = evaluateUnlock({ itemsCompleted: 4, lastCompletionDay: today, timeZone: 'Europe/Berlin', now });
  assert.equal(r.unlocked, false);
});

test('unlock: new local day unlocks next pack', () => {
  const r = evaluateUnlock({ itemsCompleted: 4, lastCompletionDay: '2026-06-01', timeZone: 'Europe/Berlin', now: new Date('2026-06-02T08:00:00Z') });
  assert.equal(r.unlocked, true);
});

test('streak: consecutive days extend', () => {
  let s = { streakDays: 1, jokerAvailable: true, jokerUsed: false, lastActiveDay: '2026-06-01' };
  const t = registerActivity(s, '2026-06-02');
  assert.equal(t.streakDays, 2);
  assert.equal(t.jokerConsumedNow, false);
});

test('streak: one skipped day consumes joker, streak preserved', () => {
  const s = { streakDays: 5, jokerAvailable: true, jokerUsed: false, lastActiveDay: '2026-06-01' };
  const t = applyInactivitySweep(s, 1);
  assert.equal(t.jokerConsumedNow, true);
  assert.equal(t.streakDays, 5); // preserved
  assert.equal(t.jokerUsed, true);
});

test('streak: skip after joker used breaks streak (progress untouched is caller concern)', () => {
  const s = { streakDays: 5, jokerAvailable: false, jokerUsed: true, lastActiveDay: '2026-06-01' };
  const t = applyInactivitySweep(s, 1);
  assert.equal(t.streakResetNow, true);
  assert.equal(t.streakDays, 0);
});

test('streak: two days skipped at once breaks even with joker', () => {
  const s = { streakDays: 9, jokerAvailable: true, jokerUsed: false, lastActiveDay: '2026-06-01' };
  const t = applyInactivitySweep(s, 2);
  assert.equal(t.streakDays, 0);
  assert.equal(t.streakResetNow, true);
});

test('joker granted on purchase', () => {
  const s = grantJokerOnPurchase({ streakDays: 0, jokerAvailable: false, jokerUsed: false, lastActiveDay: null });
  assert.equal(s.jokerAvailable, true);
  assert.equal(s.jokerUsed, false);
});

test('community: within 28-day window', () => {
  const purchasedAt = new Date('2026-06-01T00:00:00Z');
  const a = evaluateCommunityAccess({ purchasedAt, subscriptionActiveUntil: null, level: 3, now: new Date('2026-06-10T00:00:00Z') });
  assert.equal(a.canRead, true);
  assert.equal(a.reason, 'initial_window');
});

test('community: window expired -> paywall', () => {
  const purchasedAt = new Date('2026-06-01T00:00:00Z');
  const a = evaluateCommunityAccess({ purchasedAt, subscriptionActiveUntil: null, level: 3, now: new Date('2026-07-15T00:00:00Z') });
  assert.equal(a.canRead, false);
  assert.equal(a.showPaywall, true);
});

test('community: final level locks even within window', () => {
  const purchasedAt = new Date('2026-06-01T00:00:00Z');
  const a = evaluateCommunityAccess({ purchasedAt, subscriptionActiveUntil: null, level: 5, now: new Date('2026-06-10T00:00:00Z') });
  assert.equal(a.canRead, false);
  assert.equal(a.reason, 'final_level');
});

test('community: active subscription overrides final-level lock', () => {
  const purchasedAt = new Date('2026-06-01T00:00:00Z');
  const a = evaluateCommunityAccess({ purchasedAt, subscriptionActiveUntil: new Date('2026-08-01T00:00:00Z'), level: 5, now: new Date('2026-07-15T00:00:00Z') });
  assert.equal(a.canRead, true);
  assert.equal(a.reason, 'subscription');
});

test('apple chain: rejects empty / single-cert chains', () => {
  assert.throws(() => validateAppleCertChain([]), /incomplete x5c chain/);
  assert.throws(() => validateAppleCertChain(['onlyleaf']), /incomplete x5c chain/);
});

test('apple chain: rejects malformed cert data', () => {
  // two entries pass the length guard but are not valid DER certificates
  assert.throws(() => validateAppleCertChain(['bm90LWFzbg==', 'bm90LWFzbg==']));
});
