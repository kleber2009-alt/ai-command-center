/**
 * Streak + Joker engine (spec 3.3 "Система активности и буфера (Джокер)").
 *
 * - On course purchase the user gets ONE single-use, non-replenishable joker.
 * - If a calendar day is fully skipped, the system automatically spends the
 *   joker and the streak counter is PRESERVED.
 * - If the joker is already used and another day is skipped, the streak breaks
 *   and the counter resets to 0.
 * - CRITICAL: resetting the streak must NEVER affect overall course progress
 *   (items_completed). The user only loses the visual day-streak; the course
 *   continues from exactly where they left off.
 */

export interface StreakState {
  streakDays: number;
  jokerAvailable: boolean;
  jokerUsed: boolean;
  lastActiveDay: string | null; // local YYYY-MM-DD
}

export interface StreakTransition extends StreakState {
  jokerConsumedNow: boolean;
  streakResetNow: boolean;
}

/** Difference in whole calendar days between two YYYY-MM-DD strings. */
function dayDiff(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
}

/**
 * Apply the activity rules when the user completes an item on `today`.
 * Pure function: returns the next state plus what happened.
 *
 * Note: this models the streak at the moment of activity. A separate daily
 * sweep (cron) handles the case where the user is INACTIVE — see
 * `applyInactivitySweep`.
 */
export function registerActivity(prev: StreakState, today: string): StreakTransition {
  if (prev.lastActiveDay == null) {
    return {
      ...prev,
      streakDays: Math.max(1, prev.streakDays || 1),
      lastActiveDay: today,
      jokerConsumedNow: false,
      streakResetNow: false,
    };
  }

  const gap = dayDiff(prev.lastActiveDay, today);

  if (gap <= 0) {
    // Same local day — no streak change, just keep activity.
    return { ...prev, jokerConsumedNow: false, streakResetNow: false };
  }

  if (gap === 1) {
    // Consecutive day — extend streak.
    return {
      ...prev,
      streakDays: prev.streakDays + 1,
      lastActiveDay: today,
      jokerConsumedNow: false,
      streakResetNow: false,
    };
  }

  // gap >= 2: one or more full calendar days were skipped.
  const skipped = gap - 1;
  return resolveSkips(prev, skipped, today);
}

/**
 * Daily inactivity sweep (run by a cron at each user's local midnight).
 * Call with the number of fully-skipped days since lastActiveDay up to
 * yesterday (>=1 means at least one missed day).
 */
export function applyInactivitySweep(prev: StreakState, skippedDays: number): StreakTransition {
  if (skippedDays <= 0) {
    return { ...prev, jokerConsumedNow: false, streakResetNow: false };
  }
  return resolveSkips(prev, skippedDays, prev.lastActiveDay);
}

function resolveSkips(prev: StreakState, skipped: number, today: string | null): StreakTransition {
  // First skipped day can be absorbed by the joker (if available & unused).
  if (skipped === 1 && prev.jokerAvailable && !prev.jokerUsed) {
    return {
      streakDays: prev.streakDays, // preserved
      jokerAvailable: false,
      jokerUsed: true,
      lastActiveDay: today,
      jokerConsumedNow: true,
      streakResetNow: false,
    };
  }

  // Joker unavailable/used, or more than one day skipped -> streak breaks.
  return {
    streakDays: 0,
    jokerAvailable: prev.jokerAvailable && !prev.jokerUsed ? prev.jokerAvailable : false,
    jokerUsed: prev.jokerUsed,
    lastActiveDay: today,
    jokerConsumedNow: false,
    streakResetNow: true,
  };
}

/** Grant the one-time joker at course purchase. */
export function grantJokerOnPurchase(prev: StreakState): StreakState {
  return { ...prev, jokerAvailable: true, jokerUsed: false };
}
