/**
 * Daily time-lock engine (spec 3.3 "Жёсткая временная блокировка").
 *
 * After completing the 4 items of a day, the next pack of 4 unlocks at exactly
 * 00:00 in the user's LOCAL device time zone. Verification runs on the backend
 * using the user's local midnight. Time-zone changes must be tolerated: the
 * client sends its current IANA tz with every progress write, and the backend
 * always computes "today" relative to that tz.
 */

import { ITEMS_PER_DAY, itemsDoneToday } from './levels';

/** The local calendar day (YYYY-MM-DD) for an instant in a given IANA tz. */
export function localDay(instant: Date, timeZone: string): string {
  // en-CA yields ISO-like YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export interface UnlockState {
  /** true if the user may start/continue today's pack right now. */
  unlocked: boolean;
  /** items already completed within the current pack of 4 (0..4). */
  doneToday: number;
  /** local day used for the decision (YYYY-MM-DD). */
  today: string;
}

/**
 * Decide whether the next item is available.
 *
 * Rules:
 *  - If fewer than 4 items have been done in the current pack, the pack is
 *    in-progress and remains unlocked regardless of day.
 *  - If 4 items were completed and the last completion happened on the same
 *    local day as `now`, the user is locked until local midnight (next day).
 *  - On a new local day, the next pack is unlocked.
 */
export function evaluateUnlock(params: {
  itemsCompleted: number;
  lastCompletionDay: string | null; // local day of the most recent completion
  timeZone: string;
  now?: Date;
}): UnlockState {
  const now = params.now ?? new Date();
  const today = localDay(now, params.timeZone);
  const doneToday = itemsDoneToday(params.itemsCompleted);

  // Mid-pack: always allowed to continue.
  if (doneToday !== 0) {
    return { unlocked: true, doneToday, today };
  }

  // Pack boundary (doneToday === 0): a fresh pack is available only if the last
  // completed pack was finished on an earlier local day.
  const unlocked = params.lastCompletionDay == null || params.lastCompletionDay < today;
  return { unlocked, doneToday, today };
}

export { ITEMS_PER_DAY };
