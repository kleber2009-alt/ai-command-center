import { db, users } from '@vp/db';
import { PLANS, createCheckoutInput } from '@vp/shared';
import { eq } from 'drizzle-orm';
import { protectedProcedure, router } from '../trpc.js';

/**
 * Billing surface (§7). Stripe Checkout + Customer Portal session creation is
 * stubbed here; the live integration (price ids, webhook fulfilment of
 * subscriptions + credit top-ups) is wired in week 4 (§11).
 */
export const billingRouter = router({
  plans: protectedProcedure.query(() => PLANS),

  balance: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await db
      .select({ plan: users.plan, credits: users.creditsBalance })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);
    return user ?? { plan: 'free' as const, credits: 0 };
  }),

  createCheckout: protectedProcedure.input(createCheckoutInput).mutation(async ({ input }) => {
    // TODO(stripe): create a Checkout Session for PLANS[input.plan] and return
    // its url. Fulfilment happens in the Stripe webhook (idempotent by event.id).
    return { url: `/billing?plan=${input.plan}&checkout=stub`, plan: input.plan };
  }),

  portal: protectedProcedure.mutation(async () => {
    // TODO(stripe): create a Customer Portal session and return its url.
    return { url: '/billing?portal=stub' };
  }),
});
