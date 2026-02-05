import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStripe, getOrCreateStripeCustomer } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { priceId } = await req.json()
  if (!priceId) {
    return NextResponse.json({ error: 'Price ID required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, stripeSubscriptionId: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // If user already has an active subscription, sync tier from Stripe and send to portal
  if (user.stripeSubscriptionId) {
    // Sync tier from Stripe in case webhook was missed
    try {
      const subscription = await getStripe().subscriptions.retrieve(user.stripeSubscriptionId)
      if (subscription.status === 'active' || subscription.status === 'trialing') {
        const priceId = subscription.items.data[0]?.price.id || ''
        const { tierFromPriceId } = await import('@/lib/stripe')
        const tier = tierFromPriceId(priceId)
        await prisma.user.update({
          where: { id: user.id },
          data: { subscriptionTier: tier },
        })
      }
    } catch (e) {
      console.error('[Stripe] Failed to sync subscription tier:', e)
    }

    return NextResponse.json({
      error: 'ALREADY_SUBSCRIBED',
      message: 'Use the billing portal to change your plan',
    }, { status: 400 })
  }

  const customerId = await getOrCreateStripeCustomer(
    user.id,
    session.user.email,
    user.name
  )

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  const checkoutSession = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/pricing?success=true`,
    cancel_url: `${baseUrl}/pricing?canceled=true`,
    metadata: { userId: user.id },
  })

  return NextResponse.json({ url: checkoutSession.url })
}
