import { prisma } from './prisma';

/**
 * Whether a user has ever completed a paid purchase. This is the source of
 * truth for "free vs paid", since buying a token pack credits tokens but does
 * NOT change User.plan (which stays 'free'). Used for free-plan watermarking.
 */
export async function hasEverPaid(userId: string): Promise<boolean> {
  const n = await prisma.cryptoInvoice.count({ where: { userId, status: 'paid' } });
  return n > 0;
}
