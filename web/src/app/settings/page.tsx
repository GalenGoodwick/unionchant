'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useAdmin } from '@/hooks/useAdmin'
import { useTheme } from '@/app/providers'
import { startRegistration } from '@simplewebauthn/browser'
import FrameLayout from '@/components/FrameLayout'

type Passkey = { id: string; deviceName: string | null; createdAt: string; lastUsedAt: string | null }

export default function SettingsPage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const { isAdmin } = useAdmin()
  const { theme, toggleTheme } = useTheme()
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileBio, setProfileBio] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [currentBio, setCurrentBio] = useState<string | null>(null)
  const [profileZip, setProfileZip] = useState('')

  const [emailPrefs, setEmailPrefs] = useState({
    emailVoting: true, emailResults: true, emailSocial: true, emailCommunity: true, emailNews: true,
  })

  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const [passkeySuccess, setPasskeySuccess] = useState<string | null>(null)
  const [newDeviceName, setNewDeviceName] = useState('')

  type ApiKeyEntry = { id: string; name: string; keyPrefix: string; lastUsedAt: string | null; createdAt: string }
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([])
  const [apiKeyName, setApiKeyName] = useState('')
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [apiKeyCreating, setApiKeyCreating] = useState(false)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)

  const fetchPasskeys = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/webauthn/credentials')
      if (res.ok) setPasskeys(await res.json())
    } catch { /* silent */ }
  }, [])

  const fetchApiKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/user/api-keys')
      if (res.ok) {
        const data = await res.json()
        setApiKeys(data.keys)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => { if (isAdmin) fetchPasskeys() }, [isAdmin, fetchPasskeys])
  useEffect(() => { fetchApiKeys() }, [fetchApiKeys])

  const handleRegisterPasskey = async () => {
    setPasskeyLoading(true); setPasskeyError(null); setPasskeySuccess(null)
    try {
      const optRes = await fetch('/api/admin/webauthn/register-options')
      if (!optRes.ok) throw new Error('Failed to get registration options')
      const options = await optRes.json()
      const credential = await startRegistration({ optionsJSON: options })
      const verifyRes = await fetch('/api/admin/webauthn/register-verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, deviceName: newDeviceName || undefined }),
      })
      if (!verifyRes.ok) throw new Error('Registration failed')
      setPasskeySuccess('Passkey registered!'); setNewDeviceName(''); fetchPasskeys()
      setTimeout(() => setPasskeySuccess(null), 3000)
    } catch (err) {
      setPasskeyError(err instanceof Error ? err.message : 'Registration failed')
    } finally { setPasskeyLoading(false) }
  }

  const handleDeletePasskey = async (id: string) => {
    if (!confirm('Remove this passkey?')) return
    try { await fetch(`/api/admin/webauthn/credentials/${id}`, { method: 'DELETE' }); fetchPasskeys() } catch { /* silent */ }
  }

  const { isSupported, isSubscribed, isLoading, permission, subscribe, unsubscribe } = usePushNotifications()

  useEffect(() => { if (status === 'unauthenticated') router.push('/auth/signin') }, [status, router])

  useEffect(() => {
    async function fetchUserData() {
      try {
        const res = await fetch('/api/user/me')
        if (res.ok) {
          const data = await res.json()
          setCurrentBio(data.user.bio); setProfileBio(data.user.bio || '')
          setProfileName(data.user.name || ''); setProfileZip(data.user.zipCode || '')
          setEmailPrefs({
            emailVoting: data.user.emailVoting ?? true, emailResults: data.user.emailResults ?? true,
            emailSocial: data.user.emailSocial ?? true, emailCommunity: data.user.emailCommunity ?? true,
            emailNews: data.user.emailNews ?? true,
          })
        }
      } catch (error) { console.error('Error fetching user data:', error) }
    }
    if (session?.user) fetchUserData()
  }, [session])

  const handleSaveProfile = async () => {
    setProfileSaving(true); setProfileError(null); setProfileSuccess(false)
    try {
      const res = await fetch('/api/user/me', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profileName, bio: profileBio || null, zipCode: profileZip || null }),
      })
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || 'Failed to save') }
      await update({ name: profileName })
      setCurrentBio(profileBio || null); setProfileSuccess(true); setIsEditingProfile(false)
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setProfileSaving(false) }
  }

  const handleEmailPrefToggle = async (key: keyof typeof emailPrefs) => {
    const newValue = !emailPrefs[key]
    setEmailPrefs(prev => ({ ...prev, [key]: newValue }))
    try {
      await fetch('/api/user/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: newValue }) })
    } catch { setEmailPrefs(prev => ({ ...prev, [key]: !newValue })) }
  }

  const handleExportData = async () => {
    setIsExporting(true)
    try {
      const response = await fetch('/api/user/export')
      if (!response.ok) throw new Error('Export failed')
      const data = await response.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'my-union-chant-data.json'
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch { alert('Failed to export data. Please try again.') }
    finally { setIsExporting(false) }
  }

  const handleDeleteAccount = async () => {
    setIsDeleting(true); setDeleteError(null)
    try {
      const response = await fetch('/api/user', { method: 'DELETE' })
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Delete failed') }
      signOut({ callbackUrl: '/' })
    } catch (err) { setDeleteError(err instanceof Error ? err.message : 'Failed to delete account'); setIsDeleting(false) }
  }

  if (status === 'loading') {
    return (
      <FrameLayout active="chants" showBack>
        <div className="text-center text-muted py-12 animate-pulse text-sm">Loading...</div>
      </FrameLayout>
    )
  }

  if (!session) return null

  const sectionClass = "p-3.5 bg-surface/90 border border-border rounded-lg backdrop-blur-sm"
  const toggleClass = (on: boolean) => `relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${on ? 'bg-accent' : 'bg-border-strong'}`
  const dotClass = (on: boolean) => `inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`

  return (
    <FrameLayout
      active="chants"
      showBack
      header={<h2 className="text-sm font-semibold text-foreground pb-3">Settings</h2>}
    >
      <div className="space-y-3">
        {/* Profile */}
        <section className={sectionClass}>
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-xs font-semibold text-foreground">Profile</h3>
            <Link href="/profile" className="text-[10px] text-accent hover:underline">View Public</Link>
          </div>

          {!isEditingProfile ? (
            <>
              <div className="flex items-start gap-3">
                {session.user?.image && <img src={session.user.image} alt="" className="w-10 h-10 rounded-full" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{session.user?.name || 'Anonymous'}</div>
                  <div className="text-xs text-muted">{session.user?.email}</div>
                  {currentBio && <p className="text-xs text-muted mt-1">{currentBio}</p>}
                </div>
              </div>
              <button onClick={() => setIsEditingProfile(true)} className="mt-2 px-3 py-1.5 border border-border text-foreground rounded-lg hover:bg-surface text-xs transition-colors">
                Edit Profile
              </button>
              {profileSuccess && <p className="text-success text-xs mt-1">Saved!</p>}
            </>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-muted mb-1">Display Name</label>
                <input type="text" value={profileName} onChange={(e) => setProfileName(e.target.value)} maxLength={50}
                  className="w-full px-2.5 py-1.5 border border-border rounded-lg bg-background text-sm text-foreground focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Bio</label>
                <textarea value={profileBio} onChange={(e) => setProfileBio(e.target.value)} maxLength={200} rows={2} placeholder="Tell us about yourself..."
                  className="w-full px-2.5 py-1.5 border border-border rounded-lg bg-background text-sm text-foreground focus:outline-none focus:border-accent resize-none" />
                <p className="text-[10px] text-muted mt-0.5">{profileBio.length}/200</p>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Zip Code <span className="text-muted/60">(optional)</span></label>
                <input type="text" value={profileZip} onChange={(e) => setProfileZip(e.target.value.replace(/[^0-9-]/g, '').slice(0, 10))} maxLength={10} placeholder="e.g. 90210"
                  className="w-24 px-2.5 py-1.5 border border-border rounded-lg bg-background text-sm text-foreground focus:outline-none focus:border-accent" />
              </div>
              {profileError && <p className="text-error text-xs">{profileError}</p>}
              <div className="flex gap-2">
                <button onClick={handleSaveProfile} disabled={profileSaving || !profileName.trim()} className="px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 text-xs">
                  {profileSaving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => { setIsEditingProfile(false); setProfileName(session.user?.name || ''); setProfileBio(currentBio || ''); setProfileError(null) }}
                  disabled={profileSaving} className="px-3 py-1.5 border border-border text-muted rounded-lg hover:bg-surface text-xs">Cancel</button>
              </div>
            </div>
          )}
        </section>

        {/* Appearance */}
        <section className={sectionClass}>
          <h3 className="text-xs font-semibold text-foreground mb-2">Appearance</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-foreground">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</div>
            </div>
            <button onClick={toggleTheme} className={toggleClass(theme === 'light')}>
              <span className={dotClass(theme === 'light')} />
            </button>
          </div>
        </section>

        {/* Push Notifications */}
        <section className={sectionClass}>
          <h3 className="text-xs font-semibold text-foreground mb-2">Push Notifications</h3>
          {!isSupported ? (
            <p className="text-muted text-xs">Not supported in this browser.</p>
          ) : permission === 'denied' ? (
            <p className="text-error text-xs">Blocked. Allow in browser settings.</p>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted">Get notified when it&apos;s your turn</div>
              <button onClick={isSubscribed ? unsubscribe : subscribe} disabled={isLoading}
                className={`${toggleClass(isSubscribed)} ${isLoading ? 'opacity-50' : ''}`}>
                <span className={dotClass(isSubscribed)} />
              </button>
            </div>
          )}
        </section>

        {/* Email Notifications */}
        <section className={sectionClass}>
          <h3 className="text-xs font-semibold text-foreground mb-2">Email Notifications</h3>
          <div className="space-y-2.5">
            {([
              { key: 'emailVoting' as const, label: 'Voting alerts', desc: 'Your turn to vote' },
              { key: 'emailResults' as const, label: 'Results', desc: 'Priority declared' },
              { key: 'emailSocial' as const, label: 'Following', desc: 'New chants from follows' },
              { key: 'emailCommunity' as const, label: 'Groups', desc: 'Invitations, group activity' },
              { key: 'emailNews' as const, label: 'News', desc: 'Platform updates' },
            ]).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-foreground">{label}</div>
                  <div className="text-[10px] text-muted">{desc}</div>
                </div>
                <button onClick={() => handleEmailPrefToggle(key)} className={toggleClass(emailPrefs[key])}>
                  <span className={dotClass(emailPrefs[key])} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Security (admin) */}
        {isAdmin && (
          <section id="security" className={sectionClass}>
            <h3 className="text-xs font-semibold text-foreground mb-2">Security (Passkeys)</h3>
            {passkeys.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {passkeys.map(pk => (
                  <div key={pk.id} className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                    <div>
                      <div className="text-xs text-foreground font-medium">{pk.deviceName || 'Passkey'}</div>
                      <div className="text-[10px] text-muted">
                        Added {new Date(pk.createdAt).toLocaleDateString()}
                        {pk.lastUsedAt && ` · Used ${new Date(pk.lastUsedAt).toLocaleDateString()}`}
                      </div>
                    </div>
                    <button onClick={() => handleDeletePasskey(pk.id)} className="text-error text-[10px] hover:underline">Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input type="text" value={newDeviceName} onChange={e => setNewDeviceName(e.target.value)} placeholder="Device name" maxLength={50}
                className="flex-1 px-2.5 py-1.5 border border-border rounded-lg bg-background text-xs text-foreground focus:outline-none focus:border-accent" />
              <button onClick={handleRegisterPasskey} disabled={passkeyLoading}
                className="px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 text-xs whitespace-nowrap">
                {passkeyLoading ? '...' : 'Register'}
              </button>
            </div>
            {passkeyError && <p className="text-error text-xs mt-1">{passkeyError}</p>}
            {passkeySuccess && <p className="text-success text-xs mt-1">{passkeySuccess}</p>}
          </section>
        )}

        {/* Data Export */}
        <section className={sectionClass}>
          <h3 className="text-xs font-semibold text-foreground mb-2">Your Data</h3>
          <p className="text-xs text-muted mb-2">Download all your data including chants, ideas, votes, and comments.</p>
          <button onClick={handleExportData} disabled={isExporting}
            className="px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 text-xs">
            {isExporting ? 'Exporting...' : 'Export My Data'}
          </button>
        </section>

        {/* Account */}
        <section className={sectionClass}>
          <h3 className="text-xs font-semibold text-foreground mb-2">Account</h3>
          <p className="text-xs text-muted mb-2">Signed in as <span className="text-foreground">{session.user?.email}</span></p>
          <button onClick={() => signOut({ callbackUrl: '/' })}
            className="px-3 py-1.5 border border-border text-foreground rounded-lg hover:bg-surface text-xs transition-colors">
            Sign Out
          </button>
        </section>

        {/* API Keys */}
        <section id="api" className={sectionClass}>
          <h3 className="text-xs font-semibold text-foreground mb-2">API Keys</h3>
          <div className="flex gap-2 mb-2">
            <input type="text" value={apiKeyName} onChange={e => { setApiKeyName(e.target.value); setNewApiKey(null); setApiKeyError(null) }}
              placeholder="Key name" maxLength={50}
              className="flex-1 px-2.5 py-1.5 border border-border rounded-lg bg-background text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-accent" />
            <button onClick={async () => {
              if (!apiKeyName.trim()) return; setApiKeyCreating(true); setApiKeyError(null)
              try {
                const res = await fetch('/api/user/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: apiKeyName.trim() }) })
                const data = await res.json(); if (!res.ok) throw new Error(data.error)
                setNewApiKey(data.key); setApiKeyName(''); fetchApiKeys()
              } catch (err) { setApiKeyError(err instanceof Error ? err.message : 'Failed') }
              finally { setApiKeyCreating(false) }
            }} disabled={apiKeyCreating || !apiKeyName.trim()}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
              {apiKeyCreating ? '...' : 'Create'}
            </button>
          </div>
          {apiKeyError && <div className="bg-error-bg border border-error text-error text-[10px] p-2 rounded-lg mb-2">{apiKeyError}</div>}
          {newApiKey && (
            <div className="bg-success-bg border border-success rounded-lg p-2 mb-2">
              <p className="text-success text-[10px] font-medium mb-1">Copy now — won&apos;t be shown again.</p>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 text-[10px] text-foreground bg-background px-1.5 py-1 rounded border border-border break-all">{newApiKey}</code>
                <button onClick={() => navigator.clipboard.writeText(newApiKey)} className="px-2 py-1 bg-success text-white text-[10px] rounded transition-colors">Copy</button>
              </div>
            </div>
          )}
          {apiKeys.length > 0 ? (
            <div className="space-y-1.5">
              {apiKeys.map(k => (
                <div key={k.id} className="flex items-center justify-between bg-background rounded-lg px-2.5 py-2 border border-border">
                  <div>
                    <span className="text-xs text-foreground font-medium">{k.name}</span>
                    <span className="text-[10px] text-muted ml-1.5 font-mono">{k.keyPrefix}</span>
                    <div className="text-[10px] text-muted">
                      Created {new Date(k.createdAt).toLocaleDateString()}
                      {k.lastUsedAt && <> · Used {new Date(k.lastUsedAt).toLocaleDateString()}</>}
                    </div>
                  </div>
                  <button onClick={async () => { await fetch(`/api/user/api-keys/${k.id}`, { method: 'DELETE' }); fetchApiKeys() }}
                    className="text-error text-[10px] hover:text-error-hover transition-colors">Revoke</button>
                </div>
              ))}
            </div>
          ) : <p className="text-muted text-[10px]">No API keys yet.</p>}
        </section>

        {/* Danger Zone */}
        <section className="p-3.5 bg-surface/90 border border-error/50 rounded-lg backdrop-blur-sm">
          <h3 className="text-xs font-semibold text-error mb-2">Danger Zone</h3>
          {isAdmin ? (
            <p className="text-muted text-xs">Admin accounts cannot be self-deleted.</p>
          ) : deleteError === 'ACTIVE_SUBSCRIPTION' ? (
            <div>
              <p className="text-error text-xs mb-2">Cancel your subscription first.</p>
              <Link href="/billing" className="inline-block px-3 py-1.5 bg-accent text-white rounded-lg text-xs">Go to Billing</Link>
            </div>
          ) : !showDeleteConfirm ? (
            <>
              <p className="text-xs text-muted mb-2">Permanently delete your account. Contributions remain as &quot;[deleted]&quot;.</p>
              <button onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-1.5 border border-error text-error rounded-lg hover:bg-error hover:text-white text-xs transition-colors">
                Delete Account
              </button>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-error text-xs font-medium">Are you sure? This cannot be undone.</p>
              {deleteError && <p className="text-error text-xs">{deleteError}</p>}
              <div className="flex gap-2">
                <button onClick={handleDeleteAccount} disabled={isDeleting}
                  className="px-3 py-1.5 bg-error text-white rounded-lg hover:bg-error-hover disabled:opacity-50 text-xs">
                  {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
                <button onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}
                  className="px-3 py-1.5 border border-border text-muted rounded-lg text-xs">Cancel</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </FrameLayout>
  )
}
