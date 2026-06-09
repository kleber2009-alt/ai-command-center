/**
 * Level engine (spec 3.3 "Система уровней на основе прогресса").
 *
 * Levels depend ONLY on the number of completed course items — never on
 * correctness or time spent. There are exactly 112 course items.
 *
 *   Level 1 — guest status (0 items; voided after the free phase)
 *   Level 2 — from the 4th item (i.e. right after purchase)
 *   Level 3 — at 25% of total progress
 *   Level 4 — at 50% of total progress
 *   Level 5 — strictly after all 112 items are completed
 */

export const TOTAL_COURSE_ITEMS = 112;
export const ITEMS_PER_DAY = 4;
export const TOTAL_DAYS = 28; // 112 / 4

const L3_THRESHOLD = Math.ceil(TOTAL_COURSE_ITEMS * 0.25); // 28
const L4_THRESHOLD = Math.ceil(TOTAL_COURSE_ITEMS * 0.5); // 56

export type Level = 1 | 2 | 3 | 4 | 5;

/**
 * Resolve the current level from total completed course items.
 * `purchased` distinguishes guest (level 1) from a buyer who has not yet
 * completed an item (level 2 unlocks "right after purchase").
 */
export function levelForProgress(itemsCompleted: number, purchased: boolean): Level {
  if (itemsCompleted >= TOTAL_COURSE_ITEMS) return 5;
  if (itemsCompleted >= L4_THRESHOLD) return 4;
  if (itemsCompleted >= L3_THRESHOLD) return 3;
  if (purchased || itemsCompleted >= ITEMS_PER_DAY) return 2;
  return 1;
}

/** Progress as a 0..1 fraction of the paid course. */
export function progressFraction(itemsCompleted: number): number {
  return Math.min(1, itemsCompleted / TOTAL_COURSE_ITEMS);
}

/** Day index (1..28) the user is currently working through. */
export function currentDayIndex(itemsCompleted: number): number {
  return Math.min(TOTAL_DAYS, Math.floor(itemsCompleted / ITEMS_PER_DAY) + 1);
}

/** How many items of today's pack of 4 are already done (0..4). */
export function itemsDoneToday(itemsCompleted: number): number {
  return itemsCompleted % ITEMS_PER_DAY;
}
