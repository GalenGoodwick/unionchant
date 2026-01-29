'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useAdmin } from '@/hooks/useAdmin'
import Header from '@/components/Header'

export default function SettingsPage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const { isAdmin } = useAdmin()
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileBio, setProfileBio] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [currentBio, setCurrentBio] = useState<string | null>(null)

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

  // Fetch user data for bio
  useEffect(() => {
    async function fetchUserData() {
      try {
        const res = await fetch('/api/user/me')
        if (res.ok) {
          const data = await res.json()
          setCurrentBio(data.user.bio)
          setProfileBio(data.user.bio || '')
          setProfileName(data.user.name || '')
        }
      } catch (error) {
        console.error('Error fetching user data:', error)
      }
    }
    if (session?.user) {
      fetchUserData()
    }
  }, [session])

  const handleSaveProfile = async () => {
    setProfileSaving(true)
    setProfileError(null)
    setProfileSuccess(false)

    try {
      const res = await fetch('/api/user/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profileName, bio: profileBio || null }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      // Update session name
      await update({ name: profileName })

      setCurrentBio(profileBio || null)
      setProfileSuccess(true)
      setIsEditingProfile(false)
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleExportData = async () => {
    setIsExporting(true)
    try {
      const response = await fetch('/api/user/export')
      if (!response.ok) throw new Error('Export failed')

      const data = await response.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'my-union-chant-data.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert('Failed to export data. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleDeleteAccount = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const response = await fetch('/api/user', { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Delete failed')
      }
      // Sign out and redirect
      signOut({ callbackUrl: '/' })
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account')
      setIsDeleting(false)
    }
  }

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
      <Header />

      <div className="max-w-2xl mx-auto px-6 py-8">
        <Link href="/deliberations" className="text-muted hover:text-foreground text-sm mb-4 inline-block">
          &larr; Back to deliberations
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-8">Settings</h1>

        {/* Profile Section */}
        <section className="bg-background rounded-lg p-6 border border-border mb-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-lg font-semibold text-foreground">Profile</h2>
            <Link
              href="/profile"
              className="text-sm text-accent hover:underline"
            >
              View Public Profile
            </Link>
          </div>

          {!isEditingProfile ? (
            <>
              <div className="flex items-start gap-4">
                {session.user?.image && (
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-16 h-16 rounded-full"
                  />
                )}
                <div className="flex-1">
                  <div className="text-foreground font-medium">{session.user?.name || 'Anonymous'}</div>
                  <div className="text-muted text-sm">{session.user?.email}</div>
                  {currentBio && (
                    <p className="text-muted text-sm mt-2">{currentBio}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setIsEditingProfile(true)}
                className="mt-4 px-4 py-2 border border-border text-foreground rounded-lg hover:bg-surface text-sm transition-colors"
              >
                Edit Profile
              </button>
              {profileSuccess && (
                <p className="text-success text-sm mt-2">Profile saved!</p>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                {session.user?.image && (
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-16 h-16 rounded-full"
                  />
                )}
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      maxLength={50}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Bio
                    </label>
                    <textarea
                      value={profileBio}
                      onChange={(e) => setProfileBio(e.target.value)}
                      maxLength={200}
                      rows={3}
                      placeholder="Tell us about yourself..."
                      className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                    />
                    <p className="text-xs text-muted mt-1">{profileBio.length}/200</p>
                  </div>
                </div>
              </div>

              {profileError && (
                <p className="text-error text-sm bg-error-bg p-2 rounded">{profileError}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleSaveProfile}
                  disabled={profileSaving || !profileName.trim()}
                  className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 text-sm"
                >
                  {profileSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => {
                    setIsEditingProfile(false)
                    setProfileName(session.user?.name || '')
                    setProfileBio(currentBio || '')
                    setProfileError(null)
                  }}
                  disabled={profileSaving}
                  className="px-4 py-2 border border-border text-muted rounded-lg hover:bg-surface text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
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

        {/* Data Export Section */}
        <section className="bg-background rounded-lg p-6 border border-border mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Your Data</h2>
          <p className="text-muted text-sm mb-4">
            Download a copy of all your data including deliberations you created, ideas you submitted, votes you cast, and comments you made.
          </p>
          <button
            onClick={handleExportData}
            disabled={isExporting}
            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 text-sm"
          >
            {isExporting ? 'Exporting...' : 'Export My Data'}
          </button>
        </section>

        {/* Account Section */}
        <section className="bg-background rounded-lg p-6 border border-border mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Account</h2>
          <p className="text-muted text-sm mb-4">
            Signed in as <span className="text-foreground">{session.user?.email}</span>
          </p>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="px-4 py-2 border border-border text-foreground rounded-lg hover:bg-surface text-sm transition-colors"
          >
            Sign Out
          </button>
        </section>

        {/* Delete Account Section */}
        <section className="bg-background rounded-lg p-6 border border-error">
          <h2 className="text-lg font-semibold text-error mb-4">Danger Zone</h2>

          {isAdmin ? (
            <p className="text-muted text-sm">
              Admin accounts cannot be self-deleted. Please contact another admin if you need to remove this account.
            </p>
          ) : !showDeleteConfirm ? (
            <>
              <p className="text-muted text-sm mb-4">
                Permanently delete your account and remove your personal information. Your contributions (ideas, votes, comments) will remain but be shown as &quot;[deleted]&quot;.
              </p>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 border border-error text-error rounded-lg hover:bg-error hover:text-white text-sm transition-colors"
              >
                Delete Account
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-error font-medium">
                Are you sure? This action cannot be undone.
              </p>
              <p className="text-muted text-sm">
                Your account will be permanently deleted. You will be signed out immediately.
              </p>
              {deleteError && (
                <p className="text-error text-sm bg-error-bg p-2 rounded">{deleteError}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-error text-white rounded-lg hover:bg-error-hover disabled:opacity-50 text-sm"
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete My Account'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 border border-border text-muted rounded-lg hover:bg-surface text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
