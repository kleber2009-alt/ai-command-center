/**
 * Community read-access engine (spec 3.4 "Внутриигровое сообщество").
 *
 * On course purchase the user gets automatic read access for exactly 28
 * calendar days from the purchase date (continuous, independent of course
 * progress). After those 28 days OR upon reaching the final course level,
 * the feed is locked and replaced by an in-app subscription sales window —
 * unless an active community subscription extends access.
 */

export const COMMUNITY_ACCESS_DAYS = 28;

export interface CommunityAccessInput {
  purchasedAt: Date | null; // course purchase date
  subscriptionActiveUntil: Date | null; // active monthly subscription expiry
  level: number; // current course level (5 = final)
  now?: Date;
}

export interface CommunityAccess {
  /** true if the read-only feed is visible. */
  canRead: boolean;
  /** true if the paywall/subscription window should replace the feed. */
  showPaywall: boolean;
  /** when the initial 28-day window ends (null if never purchased). */
  initialWindowEnd: Date | null;
  reason: 'no_purchase' | 'initial_window' | 'subscription' | 'final_level' | 'window_expired';
}

export function evaluateCommunityAccess(input: CommunityAccessInput): CommunityAccess {
  const now = input.now ?? new Date();

  if (!input.purchasedAt) {
    return { canRead: false, showPaywall: false, initialWindowEnd: null, reason: 'no_purchase' };
  }

  const windowEnd = new Date(input.purchasedAt);
  windowEnd.setDate(windowEnd.getDate() + COMMUNITY_ACCESS_DAYS);

  // An active subscription always grants access (overrides final-level lock).
  if (input.subscriptionActiveUntil && input.subscriptionActiveUntil > now) {
    return { canRead: true, showPaywall: false, initialWindowEnd: windowEnd, reason: 'subscription' };
  }

  // Final level locks the feed even if days remain.
  if (input.level >= 5) {
    return { canRead: false, showPaywall: true, initialWindowEnd: windowEnd, reason: 'final_level' };
  }

  // Within the initial 28-day window.
  if (now < windowEnd) {
    return { canRead: true, showPaywall: false, initialWindowEnd: windowEnd, reason: 'initial_window' };
  }

  // Window expired, no subscription.
  return { canRead: false, showPaywall: true, initialWindowEnd: windowEnd, reason: 'window_expired' };
}
