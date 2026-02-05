import { NextRequest, NextResponse } from 'next/server'
import { getStripe, tierFromPriceId } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== 'subscription' || !session.subscription || !session.customer) break

      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id
      const customerId = typeof session.customer === 'string'
        ? session.customer
        : session.customer.id

      // Fetch subscription to get price/tier
      const subscription = await getStripe().subscriptions.retrieve(subscriptionId)
      const priceId = subscription.items.data[0]?.price.id || ''
      const tier = tierFromPriceId(priceId)

      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          subscriptionTier: tier,
          stripeSubscriptionId: subscriptionId,
        },
      })

      console.log(`[Stripe] ${event.type}: customer=${customerId} tier=${tier}`)
      break
    }

    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session
      console.log(`[Stripe] Async payment failed: session=${session.id}`)
      // TODO: Optionally notify user or log for support
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id
      const priceId = subscription.items.data[0]?.price.id || ''
      const tier = tierFromPriceId(priceId)

      const status = subscription.status
      // Active or trialing = keep tier; anything else = downgrade to free
      const effectiveTier = (status === 'active' || status === 'trialing') ? tier : 'free'

      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          subscriptionTier: effectiveTier,
          stripeSubscriptionId: subscription.id,
        },
      })

      console.log(`[Stripe] Subscription updated: customer=${customerId} status=${status} tier=${effectiveTier}`)
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id

      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          subscriptionTier: 'free',
          stripeSubscriptionId: null,
        },
      })

      console.log(`[Stripe] Subscription canceled: customer=${customerId} → free`)
      break
    }
  }

  return NextResponse.json({ received: true })
}
