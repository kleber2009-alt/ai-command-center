// POST /api/admin/users/:id/grant-tokens { amount, reason }
// Admin-issued bonus or correction. Positive amount = credit, negative = debit.

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { requireAdminApi } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { users, tokenWallets, tokenTransactions } from "@/lib/db/schema";
import { credit } from "@/lib/wallet";
import { child } from "@/lib/logger";

const log = child("admin.grant");
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, response } = await requireAdminApi();
  if (!user) return response!;

  const { amount, reason } = (await req.json().catch(() => ({}))) as { amount?: number; reason?: string };
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, params.id)).limit(1);
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const description = `Admin grant by ${user.email}: ${reason ?? "no reason"}`;

  if (amount! > 0) {
    await credit({ userId: params.id, amount: amount!, type: "adjustment", description });
  } else {
    // Negative grant: debit available, write audit row. Block if insufficient.
    const updated = await db.execute<{ available: number }>(sql`
      update token_wallets
        set available = available + ${amount}::bigint
        where user_id = ${params.id}
          and available + ${amount}::bigint >= 0
        returning available
    `);
    const row = (updated as unknown as Array<{ available: number }>)[0];
    if (!row) return NextResponse.json({ error: "insufficient_funds" }, { status: 400 });

    await db.insert(tokenTransactions).values({
      userId: params.id, type: "adjustment", amount: Math.abs(amount!),
      balanceAfter: row.available,
      description,
      metadata: { sign: "debit" },
    });
  }

  log.warn("admin grant", { userId: params.id, amount, by: user.email, reason });
  return NextResponse.json({ ok: true });
}
