"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { paymentPackages, payments } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";

export async function buyPackage(formData: FormData) {
  const slug = formData.get("slug");
  if (typeof slug !== "string") throw new Error("slug required");

  const session = await auth();
  const user = session?.user as { id?: string; email?: string } | undefined;
  if (!user?.id) redirect("/login");

  const [pkg] = await db.select().from(paymentPackages)
    .where(eq(paymentPackages.slug, slug)).limit(1);
  if (!pkg || !pkg.isActive) throw new Error("package_not_found");

  const tokensTotal = pkg.tokens + pkg.bonusTokens;

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3010";

  const checkout = await stripe().checkout.sessions.create({
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
    .set({ providerPaymentId: checkout.id })
    .where(eq(payments.id, payment.id));

  if (!checkout.url) throw new Error("stripe returned no checkout url");
  redirect(checkout.url);
}
