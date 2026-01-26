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
  const { isSupported, isSubscribed, isLoading, permission, subscribe, unsubscribe } =
    usePushNotifications()

  // Don't show if not logged in or not supported
  if (!session || !isSupported) {
    return null
  }

  if (permission === 'denied') {
    return (
      <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
        <p className="text-sm text-red-300">
          Notifications blocked. Enable in browser settings to receive voting alerts.
        </p>
      </div>
    )
  }

  if (isSubscribed) {
    return (
      <div className="bg-green-900/50 border border-green-700 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-green-300">
            Notifications enabled - you&apos;ll be alerted when it&apos;s time to vote
          </p>
          <button
            onClick={unsubscribe}
            disabled={isLoading}
            className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors disabled:opacity-50"
          >
            Disable
          </button>
        </div>
      </div>
    )
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
