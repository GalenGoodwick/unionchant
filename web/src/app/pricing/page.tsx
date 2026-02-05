'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useState, useEffect, Suspense } from 'react'
import Header from '@/components/Header'
import { useSearchParams } from 'next/navigation'

function Check({ className = 'text-success' }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 shrink-0 mt-0.5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

const tiers = [
  {
    name: 'Free',
    price: 0,
    description: 'For individuals and open groups',
    color: 'border-border',
    checkColor: 'text-success',
    features: [
      'Unlimited public talks',
      'Join, vote, and discuss',
      'Collective AI chat',
      'Join any group',
    ],
    cta: 'Get started free',
    href: '/auth/signup',
    priceEnv: null,
  },
  {
    name: 'Pro',
    price: 12,
    description: 'Support the mission + unlock private tools',
    color: 'border-accent',
    checkColor: 'text-accent',
    badge: 'POPULAR',
    badgeColor: 'bg-accent text-white',
    features: [
      'Everything in Free',
      '1 private group (500 members)',
      'Private talks',
      'Group feed page',
      'Talk analytics',
    ],
    priceEnv: 'pro',
  },
  {
    name: 'Org',
    price: 39,
    description: 'For teams who want to give back more',
    color: 'border-purple',
    checkColor: 'text-purple',
    features: [
      'Everything in Pro',
      '2 private groups (5,000 each)',
      'Data export (CSV/PDF)',
      'Priority support',
    ],
    priceEnv: 'business',
  },
  {
    name: 'Scale',
    price: null,
    description: 'For movements building something big',
    color: 'border-gold',
    checkColor: 'text-gold',
    badge: 'UNLIMITED',
    badgeColor: 'bg-gold text-background',
    features: [
      'Everything in Org',
      'Unlimited groups and members',
      'API access',
      'Dedicated support',
    ],
    priceEnv: 'scale',
  },
]

export default function PricingPage() {
  return (
    <Suspense>
      <PricingContent />
    </Suspense>
  )
}

function PricingContent() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const [userTier, setUserTier] = useState('free')
  const [loading, setLoading] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setSuccessMsg('Subscription activated! Welcome to Pro.')
      // Refresh tier
      fetch('/api/user/me').then(r => r.json()).then(data => {
        if (data.subscriptionTier) setUserTier(data.subscriptionTier)
      }).catch(() => {})
    }
    if (session?.user?.email) {
      fetch('/api/user/me').then(r => r.json()).then(data => {
        if (data.subscriptionTier) setUserTier(data.subscriptionTier)
      }).catch(() => {})
    }
  }, [session, searchParams])

  const priceIds: Record<string, string | undefined> = {
    pro: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO,
    business: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS,
    scale: process.env.NEXT_PUBLIC_STRIPE_PRICE_SCALE,
  }

  const handleCheckout = async (priceEnv: string) => {
    if (!session) return
    setLoading(priceEnv)
    try {
      const priceId = priceIds[priceEnv]
      if (!priceId) {
        alert('This plan is not available yet. Please contact support.')
        setLoading(null)
        return
      }
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      })
      const data = await res.json()
      if (data.error === 'ALREADY_SUBSCRIBED') {
        // Redirect to billing portal instead of showing alert
        const portalRes = await fetch('/api/stripe/portal', { method: 'POST' })
        const portalData = await portalRes.json()
        if (portalData.url) {
          window.location.href = portalData.url
          return
        }
        alert('Could not open billing portal. Please try again.')
        return
      }
      if (!res.ok) throw new Error(data.error || 'Checkout failed')
      if (data.url) window.location.href = data.url
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(null)
    }
  }

  const handlePortal = async () => {
    setLoading('portal')
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Portal failed')
      if (data.url) window.location.href = data.url
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(null)
    }
  }

  const tierIndex = ['free', 'pro', 'business', 'scale'].indexOf(userTier)

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Link href="/" className="text-muted hover:text-foreground text-sm mb-8 inline-block">
          &larr; Back to home
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Support Unity Chant</h1>
          <p className="text-lg text-muted max-w-xl mx-auto">
            Unity Chant is free for everyone. Supporters get extra tools while keeping the platform open for all.
          </p>
        </div>

        {successMsg && (
          <div className="max-w-md mx-auto mb-8 bg-success-bg border border-success text-success rounded-lg p-4 text-center text-sm font-medium">
            {successMsg}
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {tiers.map((tier, i) => {
            const isCurrent = tierIndex === i
            const isDowngrade = tierIndex > i && i > 0
            const isUpgrade = i > tierIndex

            return (
              <div
                key={tier.name}
                className={`bg-background rounded-xl border-2 ${tier.color} p-6 sm:p-8 relative flex flex-col`}
              >
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className={`text-xs px-3 py-1 rounded-full font-semibold ${tier.badgeColor}`}>
                      {tier.badge}
                    </span>
                  </div>
                )}

                <div className="mb-4">
                  <h2 className="text-xl font-bold text-foreground mb-1">{tier.name}</h2>
                  <p className="text-muted text-xs">{tier.description}</p>
                </div>

                <div className="mb-6">
                  {tier.price !== null ? (
                    <>
                      <span className="text-3xl sm:text-4xl font-bold text-foreground font-mono">
                        ${tier.price}
                      </span>
                      <span className="text-muted ml-1 text-sm">/month</span>
                    </>
                  ) : (
                    <span className="text-2xl sm:text-3xl font-bold text-foreground">
                      Contact us
                    </span>
                  )}
                </div>

                <ul className="space-y-2.5 mb-8 text-sm flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className={tier.checkColor} />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                {i === 0 ? (
                  isCurrent && session ? (
                    <div className="text-center py-3 px-6 rounded-lg bg-surface text-muted text-sm font-medium">
                      Current plan
                    </div>
                  ) : (
                    <Link
                      href={tier.href || '/auth/signup'}
                      className="block text-center py-3 px-6 rounded-lg border border-border text-foreground hover:bg-surface-hover font-medium transition-colors text-sm"
                    >
                      {tier.cta}
                    </Link>
                  )
                ) : isCurrent ? (
                  <button
                    onClick={handlePortal}
                    disabled={loading === 'portal'}
                    className="w-full py-3 px-6 rounded-lg border border-border text-foreground hover:bg-surface-hover font-medium transition-colors text-sm"
                  >
                    {loading === 'portal' ? 'Loading...' : 'Manage subscription'}
                  </button>
                ) : !session ? (
                  <Link
                    href="/auth/signup"
                    className="block text-center py-3 px-6 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors text-sm"
                  >
                    Sign up
                  </Link>
                ) : tier.price === null ? (
                  <Link
                    href="/contact"
                    className="block text-center w-full py-3 px-6 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors text-sm"
                  >
                    Contact us
                  </Link>
                ) : (
                  <button
                    onClick={() => handleCheckout(tier.priceEnv!)}
                    disabled={loading === tier.priceEnv}
                    className={`w-full py-3 px-6 rounded-lg font-medium transition-colors text-sm ${
                      isDowngrade
                        ? 'border border-border text-muted hover:bg-surface-hover'
                        : 'bg-accent hover:bg-accent-hover text-white'
                    }`}
                  >
                    {loading === tier.priceEnv
                      ? 'Loading...'
                      : isDowngrade
                        ? 'Downgrade'
                        : `Upgrade to ${tier.name}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Members always free */}
        <div className="mt-12 max-w-2xl mx-auto text-center">
          <div className="bg-background rounded-xl border border-border p-6">
            <h3 className="text-lg font-bold text-foreground mb-2">Members always join free</h3>
            <p className="text-muted text-sm leading-relaxed">
              Only the organizer who creates a group or talk pays.
              Members can join, vote, discuss, and submit ideas at no cost on any plan.
            </p>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-12 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-8 text-center">Questions</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-foreground font-semibold mb-1">What do I need Pro for?</h3>
              <p className="text-muted text-sm leading-relaxed">
                Pro unlocks private groups and talks. If you&apos;re running internal decisions,
                private group votes, or any talk that shouldn&apos;t be public, you need Pro.
              </p>
            </div>
            <div>
              <h3 className="text-foreground font-semibold mb-1">What&apos;s the member limit?</h3>
              <p className="text-muted text-sm leading-relaxed">
                The member limit applies to private groups you create. Pro supports up to 500 members,
                Org up to 5,000, and Scale is unlimited. Public talks have no member limits on any plan.
              </p>
            </div>
            <div>
              <h3 className="text-foreground font-semibold mb-1">Can I cancel anytime?</h3>
              <p className="text-muted text-sm leading-relaxed">
                Yes. Cancel from the billing portal at any time. Your subscription stays active until
                the end of your billing period. Private groups remain accessible but you can&apos;t create new ones.
              </p>
            </div>
            <div>
              <h3 className="text-foreground font-semibold mb-1">Do members need to pay?</h3>
              <p className="text-muted text-sm leading-relaxed">
                Never. Only the person creating private groups or talks needs a paid plan.
                Everyone else joins, votes, and participates for free.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
