import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { guardWithUser } from '@/lib/api-guard'
import { updateUserStripe } from '@/lib/users-db'

function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set')
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

const TIER_PRICES: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  team: process.env.STRIPE_PRICE_TEAM,
}

type Body = { tier?: string; successUrl?: string; cancelUrl?: string }

export async function POST(req: NextRequest) {
  const guard = await guardWithUser(req, { rateLimit: null })
  if (!guard.ok) return guard.response

  const { tier, successUrl, cancelUrl } = (await req.json()) as Body

  if (!tier || !TIER_PRICES[tier]) {
    return NextResponse.json({ error: 'invalid_tier' }, { status: 400 })
  }

  const priceId = TIER_PRICES[tier]
  if (!priceId) {
    return NextResponse.json({ error: `STRIPE_PRICE_${tier.toUpperCase()} not configured` }, { status: 500 })
  }

  const stripe = getStripe()
  const { user } = guard

  let customerId = user.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: user.first_name ?? undefined,
      metadata: { user_id: user.id, telegram_id: String(user.telegram_id) },
    })
    customerId = customer.id
    await updateUserStripe(user.id, { stripe_customer_id: customerId })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl ?? `${appUrl}/transcribe?checkout=success`,
    cancel_url: cancelUrl ?? `${appUrl}/transcribe?checkout=cancel`,
    client_reference_id: user.id,
    subscription_data: {
      metadata: { user_id: user.id, tier },
    },
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
