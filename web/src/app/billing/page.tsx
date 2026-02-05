'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'

const tierInfo: Record<string, { name: string; price: string; description: string }> = {
  free: { name: 'Free', price: '$0', description: 'For individuals and open groups' },
  pro: { name: 'Pro', price: '$12', description: '1 private group, 500 members' },
  business: { name: 'Org', price: '$39', description: '2 private groups, 5,000 members each' },
  scale: { name: 'Scale', price: 'Custom', description: 'Unlimited groups and members' },
}

export default function BillingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tier, setTier] = useState('free')
  const [hasSubscription, setHasSubscription] = useState(false)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
      return
    }
    if (status === 'authenticated') {
      fetch('/api/user/me')
        .then(r => r.json())
        .then(data => {
          const u = data.user || data
          if (u.subscriptionTier) setTier(u.subscriptionTier)
          if (u.stripeSubscriptionId) setHasSubscription(true)
        })
        .catch(() => setError('Failed to load billing info'))
        .finally(() => setLoading(false))
    }
  }, [status, router])

  const handleManageSubscription = async () => {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to open billing portal')
      }
      const { url } = await res.json()
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setPortalLoading(false)
    }
  }

  const info = tierInfo[tier] || tierInfo.free

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
        <Link href="/profile" className="text-muted hover:text-foreground text-sm mb-6 inline-block">
          &larr; Back to profile
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-6">Billing</h1>

        {error && (
          <div className="bg-error-bg border border-error-border text-error px-4 py-3 rounded-xl mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Current Plan */}
        <div className="bg-surface border border-border rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted mb-1">Current plan</p>
              <h2 className="text-xl font-bold text-foreground">{info.name}</h2>
              <p className="text-muted text-sm mt-1">{info.description}</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-foreground font-mono">{info.price}</span>
              <span className="text-muted text-sm">/mo</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {tier === 'free' ? (
            <>
              <p className="text-muted text-sm">
                You&apos;re on the Free plan. Upgrade to unlock private groups, analytics, and more.
              </p>
              <Link
                href="/pricing"
                className="block text-center bg-accent hover:bg-accent-hover text-white font-medium py-3 px-6 rounded-xl transition-colors"
              >
                View Plans
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/pricing"
                className="block text-center border border-border text-foreground hover:bg-surface-hover font-medium py-3 px-6 rounded-xl transition-colors"
              >
                Change Plan
              </Link>

              {hasSubscription && (
                <button
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  className="w-full border border-border text-foreground hover:bg-surface-hover font-medium py-3 px-6 rounded-xl transition-colors disabled:opacity-50"
                >
                  {portalLoading ? 'Opening portal...' : 'Manage Subscription'}
                </button>
              )}

              <div className="border-t border-border pt-4 mt-4">
                <p className="text-muted text-sm mb-3">
                  Need to cancel? You can cancel anytime from the Stripe billing portal. Your plan stays active until the end of the billing period.
                </p>
                {hasSubscription && (
                  <button
                    onClick={handleManageSubscription}
                    disabled={portalLoading}
                    className="text-error hover:text-error-hover text-sm underline hover:no-underline transition-colors"
                  >
                    Cancel Subscription
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
