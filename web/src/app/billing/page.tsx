'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

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
      <FrameLayout hideFooter showBack>
        <div className="text-center text-muted py-12">Loading...</div>
      </FrameLayout>
    )
  }

  return (
    <FrameLayout hideFooter showBack>
      <div className="py-4">
        <h1 className="text-sm font-bold text-foreground mb-4">Billing</h1>

        {error && (
          <div className="bg-error-bg border border-error-border text-error px-4 py-3 rounded-lg mb-4 text-xs">
            {error}
          </div>
        )}

        {/* Current Plan */}
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-4 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted mb-1">Current plan</p>
              <h2 className="text-sm font-bold text-foreground">{info.name}</h2>
              <p className="text-muted text-xs mt-1">{info.description}</p>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-foreground font-mono">{info.price}</span>
              <span className="text-muted text-xs">/mo</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {tier === 'free' ? (
            <>
              <p className="text-muted text-xs">
                You&apos;re on the Free plan. Upgrade to unlock private groups, analytics, and more.
              </p>
              <Link
                href="/pricing"
                className="block text-center bg-accent hover:bg-accent-hover text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-xs"
              >
                View Plans
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/pricing"
                className="block text-center border border-border text-foreground hover:bg-surface-hover font-medium py-2.5 px-4 rounded-lg transition-colors text-xs"
              >
                Change Plan
              </Link>

              {hasSubscription && (
                <button
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  className="w-full border border-border text-foreground hover:bg-surface-hover font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 text-xs"
                >
                  {portalLoading ? 'Opening portal...' : 'Manage Subscription'}
                </button>
              )}

              <div className="border-t border-border pt-4 mt-4">
                <p className="text-muted text-xs mb-3">
                  Need to cancel? You can cancel anytime from the Stripe billing portal. Your plan stays active until the end of the billing period.
                </p>
                {hasSubscription && (
                  <button
                    onClick={handleManageSubscription}
                    disabled={portalLoading}
                    className="text-error hover:text-error-hover text-xs underline hover:no-underline transition-colors"
                  >
                    Cancel Subscription
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </FrameLayout>
  )
}
