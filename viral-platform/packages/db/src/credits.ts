import { eq, sql } from 'drizzle-orm';
import { db } from './client.js';
import { creditsLedger, users } from './schema.js';

export class InsufficientCreditsError extends Error {
  constructor(
    public readonly required: number,
    public readonly available: number,
  ) {
    super(`insufficient credits: need ${required}, have ${available}`);
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * Atomically debit credits before starting a job (§9). Runs in a single
 * transaction with a row lock so concurrent jobs can't overspend. Records the
 * movement in the append-only ledger and returns the new balance.
 */
export async function debitCredits(
  userId: string,
  amount: number,
  reason: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ balance: users.creditsBalance })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!user) throw new Error(`user ${userId} not found`);
    if (user.balance < amount) throw new InsufficientCreditsError(amount, user.balance);

    const newBalance = user.balance - amount;
    await tx.update(users).set({ creditsBalance: newBalance }).where(eq(users.id, userId));
    await tx.insert(creditsLedger).values({
      userId,
      delta: -amount,
      reason,
      balanceAfter: newBalance,
    });
    return newBalance;
  });
}

/** Refund credits when a job fails (§9). Idempotency is the caller's job. */
export async function refundCredits(
  userId: string,
  amount: number,
  reason: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .update(users)
      .set({ creditsBalance: sql`${users.creditsBalance} + ${amount}` })
      .where(eq(users.id, userId))
      .returning({ balance: users.creditsBalance });

    if (!user) throw new Error(`user ${userId} not found`);
    await tx.insert(creditsLedger).values({
      userId,
      delta: amount,
      reason: `refund: ${reason}`,
      balanceAfter: user.balance,
    });
    return user.balance;
  });
}
