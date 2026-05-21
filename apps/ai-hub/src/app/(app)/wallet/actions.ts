"use server";

import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { paymentPackages, payments, promoCodes, promoRedemptions } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";
import { createInvoiceLink } from "@/lib/telegram/stars";
import { credit } from "@/lib/wallet";

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

/** Pay-with-Stars flow. Creates pending payment row + Telegram invoice link
 *  and redirects user to t.me/$invoice_xxx. Webhook completes the loop. */
export async function buyPackageStars(formData: FormData) {
  const slug = formData.get("slug");
  if (typeof slug !== "string") throw new Error("slug required");

  const session = await auth();
  const user = session?.user as { id?: string; email?: string } | undefined;
  if (!user?.id) redirect("/login");

  const [pkg] = await db.select().from(paymentPackages)
    .where(eq(paymentPackages.slug, slug)).limit(1);
  if (!pkg || !pkg.isActive) throw new Error("package_not_found");
  if (!pkg.starsPrice || pkg.starsPrice < 1) throw new Error("stars_price_not_set");

  const tokensTotal = pkg.tokens + pkg.bonusTokens;

  const [payment] = await db.insert(payments).values({
    userId: user.id,
    packageId: pkg.id,
    provider: "telegram_stars",
    amountCents: pkg.starsPrice,                           // stars stored in amountCents column (no separate field)
    currency: "XTR",
    tokensToAdd: tokensTotal,
    status: "pending",
    metadata: { package_slug: pkg.slug, bonus_tokens: pkg.bonusTokens, stars: pkg.starsPrice },
  }).returning();

  const link = await createInvoiceLink({
    paymentId: payment.id,
    title: `${pkg.name} · ${tokensTotal.toLocaleString()} токенов`.slice(0, 32),
    description: pkg.bonusTokens > 0
      ? `${pkg.tokens.toLocaleString()} + ${pkg.bonusTokens.toLocaleString()} бонус. Оплата через Telegram Stars.`
      : `${pkg.tokens.toLocaleString()} токенов. Оплата через Telegram Stars.`,
    stars: pkg.starsPrice,
  });

  await db.update(payments)
    .set({ providerPaymentId: link })
    .where(eq(payments.id, payment.id));

  redirect(link);
}

/** Apply a promo code. Returns redirect to /wallet?promo=ok|already|invalid|expired|exhausted. */
export async function applyPromoCode(formData: FormData) {
  const codeRaw = formData.get("code");
  if (typeof codeRaw !== "string") redirect("/wallet?promo=invalid");

  const code = codeRaw.trim().toUpperCase();
  if (!code) redirect("/wallet?promo=invalid");

  const session = await auth();
  const user = session?.user as { id?: string; email?: string } | undefined;
  if (!user?.id) redirect("/login");

  const [promo] = await db.select().from(promoCodes)
    .where(eq(promoCodes.code, code)).limit(1);
  if (!promo || !promo.isActive) redirect("/wallet?promo=invalid");

  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
    redirect("/wallet?promo=expired");
  }
  if (promo.maxRedemptions !== null && promo.redemptions >= promo.maxRedemptions) {
    redirect("/wallet?promo=exhausted");
  }

  // Insert redemption row. Unique constraint on (promo_id, user_id) means
  // duplicate-by-same-user fails and we report "already".
  try {
    await db.insert(promoRedemptions).values({
      promoId: promo.id, userId: user.id, bonusTokens: promo.bonusTokens,
    });
  } catch {
    redirect("/wallet?promo=already");
  }

  // Bump redemptions counter atomically.
  await db.update(promoCodes)
    .set({ redemptions: sql`${promoCodes.redemptions} + 1` })
    .where(eq(promoCodes.id, promo.id));

  // Credit bonus tokens through wallet_credit (atomic + audit row).
  await credit({
    userId: user.id, amount: promo.bonusTokens,
    type: "bonus", description: `Promo code ${promo.code}: +${promo.bonusTokens} токенов`,
  });

  revalidatePath("/wallet");
  redirect(`/wallet?promo=ok&n=${promo.bonusTokens}`);
}
