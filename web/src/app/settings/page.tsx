'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useAdmin } from '@/hooks/useAdmin'
import Header from '@/components/Header'
import { useTheme } from '@/app/providers'

export default function SettingsPage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const { isAdmin } = useAdmin()
  const { theme, toggleTheme } = useTheme()
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
  const [profileZip, setProfileZip] = useState('')

  // Email preferences
  const [emailPrefs, setEmailPrefs] = useState({
    emailVoting: true,
    emailResults: true,
    emailSocial: true,
    emailCommunity: true,
    emailNews: true,
  })

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
          setProfileZip(data.user.zipCode || '')
          setEmailPrefs({
            emailVoting: data.user.emailVoting ?? true,
            emailResults: data.user.emailResults ?? true,
            emailSocial: data.user.emailSocial ?? true,
            emailCommunity: data.user.emailCommunity ?? true,
            emailNews: data.user.emailNews ?? true,
          })
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
        body: JSON.stringify({ name: profileName, bio: profileBio || null, zipCode: profileZip || null }),
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

  const handleEmailPrefToggle = async (key: keyof typeof emailPrefs) => {
    const newValue = !emailPrefs[key]
    setEmailPrefs(prev => ({ ...prev, [key]: newValue }))
    try {
      await fetch('/api/user/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: newValue }),
      })
    } catch {
      // Revert on failure
      setEmailPrefs(prev => ({ ...prev, [key]: !newValue }))
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

      <div className="max-w-xl mx-auto px-6 py-8">
        <Link href="/feed" className="text-muted hover:text-foreground text-sm mb-4 inline-block">
          &larr; Back to feed
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-8">Settings</h1>

        {/* Profile Section */}
        <section className="bg-background rounded-xl p-6 border border-border mb-6">
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
                className="mt-4 px-4 py-2 border border-border text-foreground rounded-xl hover:bg-surface text-sm transition-colors"
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
                      className="w-full px-3 py-2 border border-border rounded-xl bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
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
                      className="w-full px-3 py-2 border border-border rounded-xl bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                    />
                    <p className="text-xs text-muted mt-1">{profileBio.length}/200</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Zip Code <span className="text-muted font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={profileZip}
                      onChange={(e) => setProfileZip(e.target.value.replace(/[^0-9-]/g, '').slice(0, 10))}
                      maxLength={10}
                      placeholder="e.g. 90210"
                      className="w-32 px-3 py-2 border border-border rounded-xl bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
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
                  className="px-4 py-2 bg-accent text-white rounded-xl hover:bg-accent-hover disabled:opacity-50 text-sm"
                >
                  {profileSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => {
                    setIsEditingProfile(false)
                    setProfileName(session.user?.name || '')
                    setProfileBio(currentBio || '')
                    setProfileZip(profileZip)
                    setProfileError(null)
                  }}
                  disabled={profileSaving}
                  className="px-4 py-2 border border-border text-muted rounded-xl hover:bg-surface text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Appearance Section */}
        <section className="bg-background rounded-xl p-6 border border-border mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Appearance</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-foreground font-medium">Theme</div>
              <div className="text-muted text-sm">
                {theme === 'dark' ? 'Dark mode' : 'Light mode'}
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                theme === 'light' ? 'bg-accent' : 'bg-border-strong'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                  theme === 'light' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </section>

        {/* Notifications Section */}
        <section className="bg-background rounded-xl p-6 border border-border mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Notifications</h2>

          {!isSupported ? (
            <p className="text-muted text-sm">
              Push notifications are not supported in this browser.
            </p>
          ) : permission === 'denied' ? (
            <div className="bg-error-bg border border-error rounded-xl p-4">
              <p className="text-error text-sm">
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

        {/* Email Notifications Section */}
        <section className="bg-background rounded-xl p-6 border border-border mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Email Notifications</h2>
          <p className="text-muted text-sm mb-4">
            Choose which emails you receive. These are separate from push notifications.
          </p>
          <div className="space-y-4">
            {([
              { key: 'emailVoting' as const, label: 'Voting alerts', desc: 'Your turn to vote, voting ending soon' },
              { key: 'emailResults' as const, label: 'Results', desc: 'Priority declared, your idea advanced' },
              { key: 'emailSocial' as const, label: 'Following', desc: 'People you follow create new talks' },
              { key: 'emailCommunity' as const, label: 'Groups', desc: 'Invitations, new talks in your groups' },
              { key: 'emailNews' as const, label: 'News & announcements', desc: 'Platform updates and news' },
            ]).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <div className="text-foreground font-medium text-sm">{label}</div>
                  <div className="text-muted text-xs">{desc}</div>
                </div>
                <button
                  onClick={() => handleEmailPrefToggle(key)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                    emailPrefs[key] ? 'bg-accent' : 'bg-border-strong'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                      emailPrefs[key] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Data Export Section */}
        <section className="bg-background rounded-xl p-6 border border-border mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Your Data</h2>
          <p className="text-muted text-sm mb-4">
            Download a copy of all your data including deliberations you created, ideas you submitted, votes you cast, and comments you made.
          </p>
          <button
            onClick={handleExportData}
            disabled={isExporting}
            className="px-4 py-2 bg-accent text-white rounded-xl hover:bg-accent-hover disabled:opacity-50 text-sm"
          >
            {isExporting ? 'Exporting...' : 'Export My Data'}
          </button>
        </section>

        {/* Account Section */}
        <section className="bg-background rounded-xl p-6 border border-border mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Account</h2>
          <p className="text-muted text-sm mb-4">
            Signed in as <span className="text-foreground">{session.user?.email}</span>
          </p>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="px-4 py-2 border border-border text-foreground rounded-xl hover:bg-surface text-sm transition-colors"
          >
            Sign Out
          </button>
        </section>

        {/* Delete Account Section */}
        <section className="bg-background rounded-xl p-6 border border-error">
          <h2 className="text-lg font-semibold text-error mb-4">Danger Zone</h2>

          {isAdmin ? (
            <p className="text-muted text-sm">
              Admin accounts cannot be self-deleted. Please contact another admin if you need to remove this account.
            </p>
          ) : deleteError === 'ACTIVE_SUBSCRIPTION' ? (
            <div className="space-y-4">
              <p className="text-error font-medium text-sm">
                You have an active subscription. Cancel it before deleting your account.
              </p>
              <Link
                href="/billing"
                className="inline-block px-4 py-2 bg-accent text-white rounded-xl hover:bg-accent-hover text-sm transition-colors"
              >
                Go to Billing
              </Link>
            </div>
          ) : !showDeleteConfirm ? (
            <>
              <p className="text-muted text-sm mb-4">
                Permanently delete your account and remove your personal information. Your contributions (ideas, votes, comments) will remain but be shown as &quot;[deleted]&quot;.
              </p>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 border border-error text-error rounded-xl hover:bg-error hover:text-white text-sm transition-colors"
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
                  className="px-4 py-2 bg-error text-white rounded-xl hover:bg-error-hover disabled:opacity-50 text-sm"
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete My Account'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 border border-border text-muted rounded-xl hover:bg-surface text-sm"
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
