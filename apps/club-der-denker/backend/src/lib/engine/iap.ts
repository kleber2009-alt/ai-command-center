/**
 * IAP access engine (spec 4). Server-side receipt validation results are
 * turned into access flags here. Card/payment data is NEVER handled — only
 * opaque store transaction identifiers (PCI-DSS via the store interfaces).
 *
 * The actual signature/receipt verification against Apple's App Store Server
 * API and Google Play Developer API is provider-specific and lives behind
 * `verifyAppleReceipt` / `verifyGoogleReceipt` (stubbed for the scaffold).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { COMMUNITY_ACCESS_DAYS } from './community';
import { grantJokerOnPurchase } from './streak';
import { ProductKind, PurchasePlatform } from '../types';

export interface ValidatedReceipt {
  userId: string;
  product: ProductKind;
  platform: PurchasePlatform;
  storeTransactionId: string;
  originalTransactionId?: string;
  receiptRef: string;
  purchasedAt: Date;
  expiresAt?: Date; // subscriptions only
  status: 'active' | 'expired' | 'refunded' | 'revoked';
}

/**
 * Apply a validated receipt: upsert the purchase row and flip the user's
 * access flags. On a fresh course_access purchase, grant community read access
 * for 28 days and the one-time joker.
 */
export async function applyValidatedReceipt(db: SupabaseClient, r: ValidatedReceipt) {
  await db
    .from('cdd_purchases')
    .upsert(
      {
        user_id: r.userId,
        product: r.product,
        platform: r.platform,
        status: r.status,
        store_transaction_id: r.storeTransactionId,
        original_transaction_id: r.originalTransactionId ?? null,
        receipt_ref: r.receiptRef,
        purchased_at: r.purchasedAt.toISOString(),
        expires_at: r.expiresAt?.toISOString() ?? null,
      },
      { onConflict: 'platform,store_transaction_id' },
    );

  if (r.product === 'course_access' && r.status === 'active') {
    const { data: user } = await db
      .from('cdd_users')
      .select('streak_days, joker_available, joker_used, last_active_day, community_access_until')
      .eq('id', r.userId)
      .single();

    const accessUntil = new Date(r.purchasedAt);
    accessUntil.setDate(accessUntil.getDate() + COMMUNITY_ACCESS_DAYS);

    const joker = grantJokerOnPurchase({
      streakDays: user?.streak_days ?? 0,
      jokerAvailable: user?.joker_available ?? false,
      jokerUsed: user?.joker_used ?? false,
      lastActiveDay: user?.last_active_day ?? null,
    });

    await db
      .from('cdd_users')
      .update({
        status: 'active',
        joker_available: joker.jokerAvailable,
        joker_used: joker.jokerUsed,
        // only set the window on first purchase; don't shrink an existing one
        community_access_until: user?.community_access_until ?? accessUntil.toISOString(),
      })
      .eq('id', r.userId);
  }
}
