// POST /api/checkout { packageSlug }
// Creates a Stripe Checkout session and a pending payments row.
// Uses `price_data` so we don't need to pre-create Stripe products manually.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { paymentPackages, payments } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { packageSlug } = (await req.json().catch(() => ({}))) as { packageSlug?: string };
  if (!packageSlug) return NextResponse.json({ error: "package_required" }, { status: 400 });

  const [pkg] = await db.select().from(paymentPackages)
    .where(eq(paymentPackages.slug, packageSlug)).limit(1);
  if (!pkg || !pkg.isActive) {
    return NextResponse.json({ error: "package_not_found" }, { status: 404 });
  }

  const tokensTotal = pkg.tokens + pkg.bonusTokens;

  // Pre-create our payments row so the webhook can find it by metadata.payment_id.
  const [payment] = await db.insert(payments).values({
    userId: user.id,
    packageId: pkg.id,
    provider: "stripe",
    amountCents: pkg.priceCents,
    currency: pkg.currency,
    tokensToAdd: tokensTotal,
    status: "pending",
    metadata: { package_slug: pkg.slug, bonus_tokens: pkg.bonusTokens },
  }).returning();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: pkg.currency.toLowerCase(),
        unit_amount: pkg.priceCents,
        product_data: {
          name: `${pkg.name} · ${tokensTotal.toLocaleString()} токенов`,
          description: pkg.bonusTokens > 0
            ? `${pkg.tokens.toLocaleString()} + ${pkg.bonusTokens.toLocaleString()} бонусных`
            : undefined,
        },
      },
    }],
    metadata: {
      payment_id: payment.id,
      user_id: user.id,
      package_slug: pkg.slug,
      tokens_to_add: String(tokensTotal),
    },
    success_url: `${appUrl}/wallet?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${appUrl}/wallet?checkout=cancelled`,
  });

  await db.update(payments)
    .set({ providerPaymentId: session.id })
    .where(eq(payments.id, payment.id));

  return NextResponse.json({ url: session.url, sessionId: session.id });
}
