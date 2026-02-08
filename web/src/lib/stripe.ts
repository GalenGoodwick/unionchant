import Stripe from 'stripe'
import { prisma } from './prisma'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return _stripe
}

export const PLAN_TIERS = {
  free: { name: 'Free', memberLimit: null },
  pro: { name: 'Pro', memberLimit: 500 },
  business: { name: 'Organization', memberLimit: 5000 },
  scale: { name: 'Scale', memberLimit: null }, // unlimited
} as const

export type PlanTier = keyof typeof PLAN_TIERS

/**
 * Map Stripe Price IDs to subscription tiers.
 * Set these in environment variables.
 */
export function tierFromPriceId(priceId: string): PlanTier {
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return 'business'
  if (priceId === process.env.STRIPE_PRICE_SCALE) return 'scale'
  return 'free'
}

/**
 * Get or create a Stripe customer for a user.
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  name?: string | null
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  })

  if (user?.stripeCustomerId) return user.stripeCustomerId

  const customer = await getStripe().customers.create({
    email,
    name: name || undefined,
    metadata: { userId },
  })

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  })

  return customer.id
}

/**
 * Check if a tier allows private groups/chants.
 */
export function canCreatePrivate(tier: string): boolean {
  return tier === 'pro' || tier === 'business' || tier === 'scale'
}
