import { prisma } from './prisma';

export class InsufficientTokensError extends Error {
  constructor(public have: number, public need: number) {
    super(`Insufficient tokens: have ${have}, need ${need}`);
    this.name = 'InsufficientTokensError';
  }
}

/**
 * Atomic reservation: списывает amount у пользователя и пишет транзакцию.
 * Бросает InsufficientTokensError если баланс мал.
 */
export async function chargeTokens(opts: {
  userId: string;
  amount: number;
  reason: string;
  refId?: string;
}) {
  if (opts.amount <= 0) return;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: opts.userId },
      select: { tokenBalance: true },
    });
    if (!user) throw new Error('USER_NOT_FOUND');
    if (user.tokenBalance < opts.amount) {
      throw new InsufficientTokensError(user.tokenBalance, opts.amount);
    }
    await tx.user.update({
      where: { id: opts.userId },
      data: { tokenBalance: { decrement: opts.amount } },
    });
    await tx.tokenTransaction.create({
      data: {
        userId: opts.userId,
        amount: -opts.amount,
        type: 'charge',
        reason: opts.reason,
        refId: opts.refId,
      },
    });
  });
}

/**
 * Возврат токенов (при failed generation).
 */
export async function refundTokens(opts: {
  userId: string;
  amount: number;
  reason: string;
  refId?: string;
}) {
  if (opts.amount <= 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: opts.userId },
      data: { tokenBalance: { increment: opts.amount } },
    });
    await tx.tokenTransaction.create({
      data: {
        userId: opts.userId,
        amount: opts.amount,
        type: 'refund',
        reason: opts.reason,
        refId: opts.refId,
      },
    });
  });
}

/**
 * Ручное / покупное начисление.
 */
export async function creditTokens(opts: {
  userId: string;
  amount: number;
  type: 'purchase' | 'manual' | 'signup_bonus';
  reason: string;
  refId?: string;
}) {
  if (opts.amount <= 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: opts.userId },
      data: { tokenBalance: { increment: opts.amount } },
    });
    await tx.tokenTransaction.create({
      data: {
        userId: opts.userId,
        amount: opts.amount,
        type: opts.type,
        reason: opts.reason,
        refId: opts.refId,
      },
    });
  });
}

import { env } from './env';

export const COSTS = {
  avatarGeneration: env.COST_AVATAR_GENERATION,
  coverGeneration: env.COST_COVER_GENERATION,
  heygenVideo: env.COST_HEYGEN_VIDEO,
  omnihumanVideo: env.COST_OMNIHUMAN_VIDEO,
  submagicEdit: env.COST_SUBMAGIC_EDIT,
  slideImage: env.COST_SLIDE_IMAGE,
};
