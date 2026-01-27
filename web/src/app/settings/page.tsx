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
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-header text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-semibold font-serif hover:text-accent-light transition-colors">
            Union Chant
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/deliberations" className="hover:text-accent-light transition-colors">
              Deliberations
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <Link href="/deliberations" className="text-muted hover:text-foreground text-sm mb-4 inline-block">
          &larr; Back to deliberations
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-8">Settings</h1>

        {/* Profile Section */}
        <section className="bg-background rounded-lg p-6 border border-border mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Profile</h2>
          <div className="flex items-center gap-4">
            {session.user?.image && (
              <img
                src={session.user.image}
                alt=""
                className="w-16 h-16 rounded-full"
              />
            )}
            <div>
              <div className="text-foreground font-medium">{session.user?.name || 'Anonymous'}</div>
              <div className="text-muted text-sm">{session.user?.email}</div>
            </div>
          </div>
        </section>

        {/* Notifications Section */}
        <section className="bg-background rounded-lg p-6 border border-border mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Notifications</h2>

          {!isSupported ? (
            <p className="text-muted text-sm">
              Push notifications are not supported in this browser.
            </p>
          ) : permission === 'denied' ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 text-sm">
                Notifications are blocked. To enable, click the lock icon in your browser&apos;s address bar and allow notifications.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-foreground font-medium">Push Notifications</div>
                  <div className="text-muted text-sm">
                    Get notified when it&apos;s your turn to vote
                  </div>
                </div>
                <button
                  onClick={isSubscribed ? unsubscribe : subscribe}
                  disabled={isLoading}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isSubscribed ? 'bg-accent' : 'bg-border-strong'
                  } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                      isSubscribed ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {isSubscribed && (
                <p className="text-success text-sm">
                  Notifications enabled. You&apos;ll receive alerts when voting starts.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Account Section */}
        <section className="bg-background rounded-lg p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Account</h2>
          <Link
            href="/api/auth/signout"
            className="text-error hover:text-error-hover text-sm"
          >
            Sign out
          </Link>
        </section>
      </div>
    </div>
  )
}
