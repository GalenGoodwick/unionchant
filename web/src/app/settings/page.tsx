'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect } from 'react'
import { usePushNotifications } from '@/hooks/usePushNotifications'

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
  } = usePushNotifications()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/deliberations" className="text-slate-400 hover:text-slate-300 text-sm mb-4 inline-block">
          &larr; Back to deliberations
        </Link>

        <h1 className="text-2xl font-bold text-white mb-8">Settings</h1>

        {/* Profile Section */}
        <section className="bg-slate-800 rounded-lg p-6 border border-slate-700 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Profile</h2>
          <div className="flex items-center gap-4">
            {session.user?.image && (
              <img
                src={session.user.image}
                alt=""
                className="w-16 h-16 rounded-full"
              />
            )}
            <div>
              <div className="text-white font-medium">{session.user?.name || 'Anonymous'}</div>
              <div className="text-slate-400 text-sm">{session.user?.email}</div>
            </div>
          </div>
        </section>

        {/* Notifications Section */}
        <section className="bg-slate-800 rounded-lg p-6 border border-slate-700 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Notifications</h2>

          {!isSupported ? (
            <p className="text-slate-400 text-sm">
              Push notifications are not supported in this browser.
            </p>
          ) : permission === 'denied' ? (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
              <p className="text-red-300 text-sm">
                Notifications are blocked. To enable, click the lock icon in your browser&apos;s address bar and allow notifications.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">Push Notifications</div>
                  <div className="text-slate-400 text-sm">
                    Get notified when it&apos;s your turn to vote
                  </div>
                </div>
                <button
                  onClick={isSubscribed ? unsubscribe : subscribe}
                  disabled={isLoading}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isSubscribed ? 'bg-indigo-600' : 'bg-slate-600'
                  } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isSubscribed ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {isSubscribed && (
                <p className="text-green-400 text-sm">
                  Notifications enabled. You&apos;ll receive alerts when voting starts.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Account Section */}
        <section className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-lg font-semibold text-white mb-4">Account</h2>
          <Link
            href="/api/auth/signout"
            className="text-red-400 hover:text-red-300 text-sm"
          >
            Sign out
          </Link>
        </section>
      </div>
    </div>
  )
}
