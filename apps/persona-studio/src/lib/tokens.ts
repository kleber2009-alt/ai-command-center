import { prisma } from "./db";

export const TOKEN_COST = {
  avatarBatch: Number(process.env.TOKENS_AVATAR_GENERATION || 10),
  cover: Number(process.env.TOKENS_COVER_GENERATION || 3),
};

export class InsufficientTokensError extends Error {
  constructor(public required: number, public balance: number) {
    super(`Need ${required} tokens, have ${balance}`);
    this.name = "InsufficientTokensError";
  }
}

/** Atomically debit tokens. Throws InsufficientTokensError if balance is too low. */
export async function spendTokens(
  userId: string,
  amount: number,
  note: string,
  ref?: string
) {
  if (amount <= 0) throw new Error("amount must be > 0");

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { tokenBalance: true },
    });
    if (!user) throw new Error("user not found");
    if (user.tokenBalance < amount) {
      throw new InsufficientTokensError(amount, user.tokenBalance);
    }
    await tx.user.update({
      where: { id: userId },
      data: { tokenBalance: { decrement: amount } },
    });
    await tx.tokenLedger.create({
      data: { userId, kind: "SPEND", amount: -amount, note, ref },
    });
  });
}

export async function refundTokens(
  userId: string,
  amount: number,
  note: string,
  ref?: string
) {
  if (amount <= 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { tokenBalance: { increment: amount } },
    });
    await tx.tokenLedger.create({
      data: { userId, kind: "REFUND", amount, note, ref },
    });
  });
}

export async function grantTokens(
  userId: string,
  amount: number,
  note: string,
  kind: "GRANT" | "PURCHASE" | "ADJUSTMENT" = "PURCHASE"
) {
  if (amount === 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { tokenBalance: { increment: amount } },
    });
    await tx.tokenLedger.create({
      data: { userId, kind, amount, note },
    });
  });
}

export async function balance(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenBalance: true },
  });
  return u?.tokenBalance ?? 0;
}
