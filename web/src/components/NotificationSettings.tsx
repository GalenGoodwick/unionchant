'use client'

import { useState } from 'react'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useSession } from 'next-auth/react'

export function NotificationSettings() {
  const { data: session } = useSession()
  const [error, setError] = useState<string | null>(null)
  const {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
  } = usePushNotifications()

  if (!session) {
    return null
  }

  if (!isSupported) {
    return (
      <div className="text-sm text-muted">
        Push notifications are not supported in this browser
      </div>
    )
  }

  if (permission === 'denied') {
    return (
      <div className="text-sm text-error">
        Notifications blocked. Please enable in browser settings.
      </div>
    )
  }

  const handleSubscribe = async () => {
    setError(null)
    const result = await subscribe()
    if (!result.success && result.error) {
      setError(result.error)
    }
  }

  return (
    <div>
      <button
        onClick={isSubscribed ? unsubscribe : handleSubscribe}
        disabled={isLoading}
        className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
          isSubscribed
            ? 'bg-surface hover:bg-background text-muted border border-border'
            : 'bg-accent hover:bg-accent-hover text-white'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isLoading ? (
          'Loading...'
        ) : isSubscribed ? (
          'Disable Notifications'
        ) : (
          'Enable Notifications'
        )}
      </button>
      {error && <p className="text-error text-sm mt-2">{error}</p>}
    </div>
  )
}

export function NotificationBanner() {
  const { data: session } = useSession()
  const [error, setError] = useState<string | null>(null)
  const { isSupported, isSubscribed, isLoading, permission, subscribe } =
    usePushNotifications()

  // Don't show if not logged in or not supported
  if (!session || !isSupported) {
    return null
  }

  if (permission === 'denied') {
    return (
      <div className="bg-error-bg border border-error rounded-lg p-4 mb-4">
        <p className="text-sm text-error">
          Notifications blocked. Enable in browser settings to receive voting alerts.
        </p>
      </div>
    )
  }

  if (isSubscribed) {
    return null // Don't show banner when already subscribed
  }

  const handleSubscribe = async () => {
    setError(null)
    const result = await subscribe()
    if (!result.success && result.error) {
      setError(result.error)
    }
  }

  return (
    <div className="bg-accent-light border border-accent rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-medium text-foreground">Stay Updated</h3>
          <p className="text-sm text-muted">
            Get notified when it&apos;s your turn to vote
          </p>
        </div>
        <button
          onClick={handleSubscribe}
          disabled={isLoading}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 shrink-0"
        >
          {isLoading ? 'Enabling...' : 'Enable'}
        </button>
      </div>
      {error && <p className="text-error text-sm mt-2">{error}</p>}
    </div>
  )
}
