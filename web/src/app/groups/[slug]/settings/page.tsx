'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import { getDisplayName } from '@/lib/user'

function MemberAvatar({ image, name }: { image: string | null; name: string | null }) {
  const [imgError, setImgError] = useState(false)
  const initial = (name || '?').charAt(0).toUpperCase()

  if (image && !imgError) {
    return (
      <img
        src={image}
        alt=""
        className="w-9 h-9 rounded-full"
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <span className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-sm font-medium text-accent">
      {initial}
    </span>
  )
}

type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED'

type Member = {
  id: string
  role: string
  userId: string
  joinedAt: string
  user: { id: string; name: string | null; image: string | null; status: UserStatus }
}

type Community = {
  id: string
  name: string
  slug: string
  description: string | null
  isPublic: boolean
  inviteCode: string | null
  userRole: string | null
  members: Member[]
  _count: { members: number; deliberations: number }
}

export default function CommunitySettingsPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [community, setCommunity] = useState<Community | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [formData, setFormData] = useState({ name: '', description: '', isPublic: true, postingPermission: 'anyone' })

  // Invite form
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteResult, setInviteResult] = useState('')

  // Banned users
  type BannedUser = { id: string; user: { id: string; name: string | null; image: string | null }; bannedBy: { name: string | null }; createdAt: string; reason: string | null }
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
      return
    }
    if (status === 'authenticated') {
      fetch(`/api/communities/${slug}`)
        .then(res => {
          if (!res.ok) throw new Error('Not found')
          return res.json()
        })
        .then(data => {
          setCommunity(data)
          setFormData({
            name: data.name,
            description: data.description || '',
            isPublic: data.isPublic,
            postingPermission: data.postingPermission || 'anyone',
          })
          fetch(`/api/communities/${slug}/ban`).then(r => r.ok ? r.json() : []).then(setBannedUsers).catch(() => {})
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [status, slug, router])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`/api/communities/${slug}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      setSuccess('Settings saved')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleRoleChange = async (userId: string, newRole: 'ADMIN' | 'MEMBER') => {
    try {
      const res = await fetch(`/api/communities/${slug}/members/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      // Refresh
      const updated = await fetch(`/api/communities/${slug}`).then(r => r.json())
      setCommunity(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role')
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Remove this member?')) return
    try {
      const res = await fetch(`/api/communities/${slug}/members/${userId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      const updated = await fetch(`/api/communities/${slug}`).then(r => r.json())
      setCommunity(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove')
    }
  }

  const handlePurgeChat = async () => {
    if (!confirm('Delete ALL chat messages in this group? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/communities/${slug}/chat`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      const data = await res.json()
      setSuccess(`Purged ${data.deleted} message(s)`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to purge chat')
    }
  }

  const handleBanMember = async (userId: string, userName: string) => {
    if (!confirm(`Permanently ban ${userName} from this group? They will not be able to rejoin.`)) return
    try {
      const res = await fetch(`/api/communities/${slug}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      setSuccess(`${userName} has been banned`)
      setTimeout(() => setSuccess(''), 3000)
      const updated = await fetch(`/api/communities/${slug}`).then(r => r.json())
      setCommunity(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ban user')
    }
  }

  const handleUnban = async (banId: string, userId: string, userName: string) => {
    if (!confirm(`Unban ${userName}? They will be able to rejoin the group.`)) return
    try {
      const res = await fetch(`/api/communities/${slug}/ban/${userId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      setBannedUsers(prev => prev.filter(b => b.id !== banId))
      setSuccess(`${userName} has been unbanned`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unban')
    }
  }

  const handleSendInvites = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteSending(true)
    setInviteResult('')

    const emails = inviteEmails.split(/[,\n]/).map(e => e.trim()).filter(e => e)
    if (emails.length === 0) {
      setInviteResult('Enter at least one email')
      setInviteSending(false)
      return
    }

    try {
      const res = await fetch(`/api/communities/${slug}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      const data = await res.json()
      setInviteResult(`Sent ${data.sent} invite(s)${data.failed ? `, ${data.failed} failed` : ''}`)
      setInviteEmails('')
    } catch (err) {
      setInviteResult(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setInviteSending(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-xl mx-auto px-4 py-8">
          <div className="animate-pulse h-8 bg-surface rounded w-1/3" />
        </div>
      </div>
    )
  }

  if (!community || (community.userRole !== 'OWNER' && community.userRole !== 'ADMIN')) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-xl mx-auto px-4 py-8 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Access Denied</h1>
          <p className="text-muted">Only owners and admins can access settings.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-xl mx-auto px-4 py-8">
        <Link href={`/groups/${slug}`} className="text-muted hover:text-foreground text-sm mb-4 inline-block">
          &larr; Back to group
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-6">Settings: {community.name}</h1>

        {error && <div className="bg-error-bg text-error p-4 rounded-xl mb-4">{error}</div>}
        {success && <div className="bg-success-bg text-success p-4 rounded-xl mb-4">{success}</div>}

        {/* Community Info */}
        <div className="bg-surface border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Group Info</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-foreground font-medium mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-background border border-border rounded-xl px-4 py-2 text-foreground focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-foreground font-medium mb-1">Description</label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-background border border-border rounded-xl px-4 py-2 text-foreground focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isPublic}
                  onChange={e => setFormData({ ...formData, isPublic: e.target.checked })}
                  className="w-4 h-4 text-accent"
                />
                <span className="text-foreground text-sm">Public group</span>
              </label>
            </div>
            <div>
              <label className="block text-foreground font-medium mb-2">Who can create talks?</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="postingPermission"
                    checked={formData.postingPermission === 'anyone'}
                    onChange={() => setFormData({ ...formData, postingPermission: 'anyone' })}
                    className="w-4 h-4 text-accent"
                  />
                  <span className="text-foreground text-sm">Any member</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="postingPermission"
                    checked={formData.postingPermission === 'admins'}
                    onChange={() => setFormData({ ...formData, postingPermission: 'admins' })}
                    className="w-4 h-4 text-accent"
                  />
                  <span className="text-foreground text-sm">Owners and admins only</span>
                </label>
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Email Invites */}
        <div className="bg-surface border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Invite Members</h2>
          <form onSubmit={handleSendInvites} className="space-y-4">
            <div>
              <label className="block text-foreground font-medium mb-1">Email addresses</label>
              <textarea
                rows={3}
                placeholder="Enter emails separated by commas or new lines"
                value={inviteEmails}
                onChange={e => setInviteEmails(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-2 text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
              />
            </div>
            {inviteResult && <p className="text-sm text-muted">{inviteResult}</p>}
            <button
              type="submit"
              disabled={inviteSending}
              className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              {inviteSending ? 'Sending...' : 'Send Invites'}
            </button>
          </form>
        </div>

        {/* Purge Chat */}
        <div className="bg-surface border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-2">Group Chat</h2>
          <p className="text-muted text-sm mb-4">Delete all chat messages in this group.</p>
          <button
            onClick={handlePurgeChat}
            className="bg-error/10 text-error border border-error/30 hover:bg-error/20 px-4 py-2 rounded-xl font-medium text-sm transition-colors"
          >
            Purge All Messages
          </button>
        </div>

        {/* Members */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Members ({community._count.members})
          </h2>
          <div className="space-y-2">
            {community.members.map(m => {
              const roleStyles: Record<string, string> = {
                OWNER: 'bg-warning/15 text-warning border border-warning/30',
                ADMIN: 'bg-accent/15 text-accent border border-accent/30',
                MEMBER: 'bg-surface text-muted border border-border',
              }
              return (
                <div key={m.id} className="flex items-center justify-between p-3 bg-background rounded-xl border border-border">
                  <div className="flex items-center gap-3">
                    <MemberAvatar image={m.user.image} name={m.user.name} />
                    <div>
                      <Link href={`/user/${m.user.id}`} className="text-foreground hover:text-accent text-sm font-medium">{getDisplayName(m.user)}</Link>
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-0.5 ${roleStyles[m.role] || roleStyles.MEMBER}`}>
                        {m.role}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.role !== 'OWNER' && community.userRole === 'OWNER' && (
                      <>
                        <button
                          onClick={() => handleRoleChange(m.user.id, m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN')}
                          className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-colors ${
                            m.role === 'ADMIN'
                              ? 'bg-muted/10 text-muted border border-border hover:border-muted'
                              : 'bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20'
                          }`}
                        >
                          {m.role === 'ADMIN' ? 'Demote to Member' : 'Make Admin'}
                        </button>
                        <button
                          onClick={() => handleRemoveMember(m.user.id)}
                          className="text-xs px-3 py-1.5 rounded-xl font-medium bg-error/10 text-error border border-error/30 hover:bg-error/20 transition-colors"
                        >
                          Remove
                        </button>
                        <button
                          onClick={() => handleBanMember(m.user.id, getDisplayName(m.user))}
                          className="text-xs px-3 py-1.5 rounded-xl font-medium bg-error text-white hover:bg-error-hover transition-colors"
                        >
                          Ban
                        </button>
                      </>
                    )}
                    {m.role === 'MEMBER' && community.userRole === 'ADMIN' && (
                      <>
                        <button
                          onClick={() => handleRemoveMember(m.user.id)}
                          className="text-xs px-3 py-1.5 rounded-xl font-medium bg-error/10 text-error border border-error/30 hover:bg-error/20 transition-colors"
                        >
                          Remove
                        </button>
                        <button
                          onClick={() => handleBanMember(m.user.id, getDisplayName(m.user))}
                          className="text-xs px-3 py-1.5 rounded-xl font-medium bg-error text-white hover:bg-error-hover transition-colors"
                        >
                          Ban
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Banned Users */}
        {bannedUsers.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6 mt-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Banned Users ({bannedUsers.length})
            </h2>
            <div className="space-y-2">
              {bannedUsers.map(b => (
                <div key={b.id} className="flex items-center justify-between p-3 bg-background rounded-xl border border-border">
                  <div className="flex items-center gap-3">
                    <MemberAvatar image={b.user.image} name={b.user.name} />
                    <div>
                      <span className="text-foreground text-sm font-medium">{b.user.name || 'Unknown'}</span>
                      <p className="text-xs text-muted">
                        Banned by {b.bannedBy.name || 'admin'}
                        {b.reason && <> &middot; {b.reason}</>}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnban(b.id, b.user.id, b.user.name || 'this user')}
                    className="text-xs px-3 py-1.5 rounded-xl font-medium bg-success/10 text-success border border-success/30 hover:bg-success/20 transition-colors"
                  >
                    Unban
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
