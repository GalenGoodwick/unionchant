'use client'

import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useSession } from 'next-auth/react'

export function NotificationSettings() {
  const { data: session } = useSession()
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
      <div className="text-sm text-slate-500">
        Push notifications are not supported in this browser
      </div>
    )
  }

  if (permission === 'denied') {
    return (
      <div className="text-sm text-red-400">
        Notifications blocked. Please enable in browser settings.
      </div>
    )
  }

  return (
    <button
      onClick={isSubscribed ? unsubscribe : subscribe}
      disabled={isLoading}
      className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
        isSubscribed
          ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
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
  )
}

export function NotificationBanner() {
  const { data: session } = useSession()
  const { isSupported, isSubscribed, isLoading, permission, subscribe } =
    usePushNotifications()

  // Don't show banner if not logged in, not supported, already subscribed, or denied
  if (!session || !isSupported || isSubscribed || permission === 'denied') {
    return null
  }

  return (
    <div className="bg-indigo-900/50 border border-indigo-700 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-medium text-white">Stay Updated</h3>
          <p className="text-sm text-slate-300">
            Get notified when it&apos;s your turn to vote
          </p>
        </div>
        <button
          onClick={subscribe}
          disabled={isLoading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Enabling...' : 'Enable'}
        </button>
      </div>
    </div>
  )
}
