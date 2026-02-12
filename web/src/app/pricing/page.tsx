'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import FrameLayout from '@/components/FrameLayout'

function Check({ className = 'text-success' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 shrink-0 mt-0.5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      'Unlimited public chants',
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
      'Private chants',
      'Group feed page',
      'Chant analytics',
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
    if (!session?.user?.email) return
    fetch('/api/user/me').then(r => {
      if (!r.ok) return null
      return r.json()
    }).then(data => {
      if (data?.user?.subscriptionTier) setUserTier(data.user.subscriptionTier)
      if (searchParams.get('success') === 'true') {
        setSuccessMsg('Subscription activated! Welcome to Pro.')
      }
    }).catch(() => {})
  }, [session, searchParams])

  const handleCheckout = async (_priceEnv: string) => {
    alert('Paid plans coming soon! Stay tuned.')
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
    <FrameLayout
      hideFooter
      showBack
      header={
        <div className="text-center pb-3">
          <h2 className="text-sm font-semibold text-foreground">Support Unity Chant</h2>
          <p className="text-xs text-muted mt-1">Free for everyone. Supporters get extra tools.</p>
        </div>
      }
    >
      <div className="space-y-3">
        {successMsg && (
          <div className="bg-success-bg border border-success text-success rounded-lg p-3 text-center text-xs font-medium">
            {successMsg}
          </div>
        )}

        {tiers.map((tier, i) => {
          const isCurrent = tierIndex === i
          const isDowngrade = tierIndex > i && i > 0
          const isUpgrade = i > tierIndex

          return (
            <div
              key={tier.name}
              className={`bg-surface/90 backdrop-blur-sm rounded-lg border-2 ${tier.color} p-4 relative`}
            >
              {tier.badge && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${tier.badgeColor}`}>
                    {tier.badge}
                  </span>
                </div>
              )}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">{tier.name}</h3>
                  <p className="text-muted text-[10px]">{tier.description}</p>
                </div>
                <div className="text-right shrink-0">
                  {tier.price !== null ? (
                    <>
                      <span className="text-xl font-bold text-foreground font-mono">${tier.price}</span>
                      <span className="text-muted text-[10px]">/mo</span>
                    </>
                  ) : (
                    <span className="text-sm font-bold text-foreground">Contact us</span>
                  )}
                </div>
              </div>

              <ul className="mt-2.5 space-y-1.5">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-1.5 text-xs">
                    <Check className={tier.checkColor} />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3">
                {i === 0 ? (
                  isCurrent && session ? (
                    <div className="text-center py-2 px-4 rounded-lg bg-background text-muted text-xs font-medium">
                      Current plan
                    </div>
                  ) : (
                    <Link
                      href={tier.href || '/auth/signup'}
                      className="block text-center py-2 px-4 rounded-lg border border-border text-foreground hover:bg-surface-hover font-medium transition-colors text-xs"
                    >
                      {tier.cta}
                    </Link>
                  )
                ) : isCurrent ? (
                  <button
                    onClick={handlePortal}
                    disabled={loading === 'portal'}
                    className="w-full py-2 px-4 rounded-lg border border-border text-foreground hover:bg-surface-hover font-medium transition-colors text-xs"
                  >
                    {loading === 'portal' ? 'Loading...' : 'Manage subscription'}
                  </button>
                ) : !session ? (
                  <Link
                    href="/auth/signup"
                    className="block text-center py-2 px-4 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors text-xs"
                  >
                    Sign up
                  </Link>
                ) : tier.price === null ? (
                  <Link
                    href="/contact"
                    className="block text-center w-full py-2 px-4 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors text-xs"
                  >
                    Contact us
                  </Link>
                ) : (
                  <button
                    onClick={() => handleCheckout(tier.priceEnv!)}
                    disabled={loading === tier.priceEnv}
                    className={`w-full py-2 px-4 rounded-lg font-medium transition-colors text-xs ${
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
            </div>
          )
        })}

        {/* Members always free */}
        <div className="bg-surface/90 backdrop-blur-sm rounded-lg border border-border p-3.5 text-center">
          <h3 className="text-xs font-bold text-foreground mb-1">Members always join free</h3>
          <p className="text-muted text-[10px] leading-relaxed">
            Only the organizer who creates a group or chant pays.
            Members join, vote, discuss, and submit ideas at no cost.
          </p>
        </div>

        {/* FAQ */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-foreground text-center">Questions</h3>
          {[
            { q: 'What do I need Pro for?', a: 'Pro unlocks private groups and chants. If you\'re running internal decisions or private group votes, you need Pro.' },
            { q: 'What\'s the member limit?', a: 'Pro supports up to 500 members per private group, Org up to 5,000, and Scale is unlimited. Public chants have no limits.' },
            { q: 'Can I cancel anytime?', a: 'Yes. Cancel from the billing portal. Your subscription stays active until the end of your billing period.' },
            { q: 'Do members need to pay?', a: 'Never. Only the person creating private groups or chants needs a paid plan.' },
          ].map(faq => (
            <div key={faq.q} className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3">
              <h4 className="text-xs font-semibold text-foreground mb-1">{faq.q}</h4>
              <p className="text-muted text-[10px] leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </FrameLayout>
  )
}
