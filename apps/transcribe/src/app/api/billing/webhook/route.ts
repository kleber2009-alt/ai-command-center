import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { updateUserStripe, getUserByStripeCustomer, type UserTier } from '@/lib/users-db'

// Raw body needed for Stripe signature verification
export const runtime = 'nodejs'

function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set')
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 })
  }

  const stripe = getStripe()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    console.warn('[billing/webhook] signature verification failed:', err.message)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.client_reference_id
        if (!userId || !session.subscription) break

        const sub = await stripe.subscriptions.retrieve(session.subscription as string)
        const tier = (sub.metadata.tier as UserTier | undefined) ?? 'pro'

        await updateUserStripe(userId, {
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: sub.id,
          subscription_tier: tier,
        })
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const user = await getUserByStripeCustomer(sub.customer as string)
        if (!user) break

        const tier: UserTier =
          sub.status === 'active' ? ((sub.metadata.tier as UserTier | undefined) ?? 'pro') : 'free'

        await updateUserStripe(user.id, {
          subscription_tier: tier,
          stripe_subscription_id: sub.id,
        })
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const user = await getUserByStripeCustomer(sub.customer as string)
        if (!user) break

        await updateUserStripe(user.id, {
          subscription_tier: 'free',
          stripe_subscription_id: null,
        })
        break
      }

      default:
        // Ignore unhandled events
        break
    }
  } catch (err: any) {
    console.error('[billing/webhook] handler error:', err.message)
    return NextResponse.json({ error: 'handler_error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
