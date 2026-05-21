// Wallet wrappers — call the stored procedures defined in
// drizzle/migrations/0001_wallet_functions.sql. All atomicity/audit lives in SQL.

import { sql, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tokenWallets } from "@/lib/db/schema";

export class InsufficientFundsError extends Error {
  code = "INSUFFICIENT_FUNDS" as const;
  constructor() { super("Insufficient tokens"); }
}

export interface WalletSnapshot {
  available: number;
  reserved: number;
  total_purchased: number;
  total_spent: number;
}

export async function getWallet(userId: string): Promise<WalletSnapshot> {
  const rows = await db.select({
    available: tokenWallets.available,
    reserved: tokenWallets.reserved,
    total_purchased: tokenWallets.totalPurchased,
    total_spent: tokenWallets.totalSpent,
  }).from(tokenWallets).where(eq(tokenWallets.userId, userId)).limit(1);

  return rows[0] ?? { available: 0, reserved: 0, total_purchased: 0, total_spent: 0 };
}

async function callBigint(query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(query);
  // postgres-js returns rows; first column of first row contains bigint as string|number
  const row = (result as unknown as Array<Record<string, unknown>>)[0];
  if (!row) throw new Error("wallet RPC returned no row");
  const val = Object.values(row)[0];
  return typeof val === "string" ? Number(val) : (val as number);
}

export async function reserve(args: {
  userId: string; amount: number; jobId: string; toolId: string; description?: string;
}): Promise<number> {
  try {
    return await callBigint(sql`select wallet_reserve(${args.userId}, ${args.amount}::bigint,
      ${args.jobId}::uuid, ${args.toolId}::uuid, ${args.description ?? null})`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("INSUFFICIENT_FUNDS")) {
      throw new InsufficientFundsError();
    }
    throw err;
  }
}

export async function charge(args: {
  userId: string; amount: number; reserved: number;
  jobId: string; toolId: string; description?: string;
}): Promise<number> {
  return callBigint(sql`select wallet_charge(${args.userId}, ${args.amount}::bigint,
    ${args.reserved}::bigint, ${args.jobId}::uuid, ${args.toolId}::uuid, ${args.description ?? null})`);
}

export async function refund(args: {
  userId: string; amount: number; jobId: string; toolId: string; description?: string;
}): Promise<number> {
  return callBigint(sql`select wallet_refund(${args.userId}, ${args.amount}::bigint,
    ${args.jobId}::uuid, ${args.toolId}::uuid, ${args.description ?? null})`);
}

export async function credit(args: {
  userId: string; amount: number;
  type: "purchase" | "bonus" | "adjustment";
  paymentId?: string; description?: string;
}): Promise<number> {
  return callBigint(sql`select wallet_credit(${args.userId}, ${args.amount}::bigint,
    ${args.type}, ${args.paymentId ?? null}::uuid, ${args.description ?? null})`);
}
