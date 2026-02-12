'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getDisplayName } from '@/lib/user'
import FrameLayout from '@/components/FrameLayout'

function MemberAvatar({ image, name }: { image: string | null; name: string | null }) {
  const [imgError, setImgError] = useState(false)
  const initial = (name || '?').charAt(0).toUpperCase()

  if (image && !imgError) {
    return (
      <img
        src={image}
        alt=""
        className="w-7 h-7 rounded-full"
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <span className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs font-medium text-accent">
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

  const handleDeleteGroup = async () => {
    if (!confirm(`Permanently delete "${community?.name}"? Members, bans, and messages will be removed. Chants will be unlinked but keep their current visibility. This cannot be undone.`)) return
    if (!confirm('Are you absolutely sure? This action is irreversible.')) return
    try {
      const res = await fetch(`/api/communities/${slug}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }
      router.push('/groups')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group')
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
      <FrameLayout active="groups" showBack>
        <div className="pt-4">
          <div className="animate-pulse h-6 bg-surface rounded w-1/3" />
        </div>
      </FrameLayout>
    )
  }

  if (!community || (community.userRole !== 'OWNER' && community.userRole !== 'ADMIN')) {
    return (
      <FrameLayout active="groups" showBack>
        <div className="pt-4 text-center">
          <h1 className="text-sm font-bold text-foreground mb-2">Access Denied</h1>
          <p className="text-xs text-muted">Only owners and admins can access settings.</p>
        </div>
      </FrameLayout>
    )
  }

  return (
    <FrameLayout active="groups" showBack>
      <div className="pt-4 space-y-4">
        <h1 className="text-sm font-bold text-foreground">Settings: {community.name}</h1>

        {error && <div className="bg-error-bg text-error p-3 rounded-lg text-xs">{error}</div>}
        {success && <div className="bg-success-bg text-success p-3 rounded-lg text-xs">{success}</div>}

        {/* Community Info */}
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-4">
          <h2 className="text-xs font-semibold text-foreground mb-3">Group Info</h2>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Description</label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isPublic}
                  onChange={e => setFormData({ ...formData, isPublic: e.target.checked })}
                  className="w-3.5 h-3.5 text-accent"
                />
                <span className="text-foreground text-xs">Public group</span>
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-2">Who can create chants?</label>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="postingPermission"
                    checked={formData.postingPermission === 'anyone'}
                    onChange={() => setFormData({ ...formData, postingPermission: 'anyone' })}
                    className="w-3.5 h-3.5 text-accent"
                  />
                  <span className="text-foreground text-xs">Any member</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="postingPermission"
                    checked={formData.postingPermission === 'admins'}
                    onChange={() => setFormData({ ...formData, postingPermission: 'admins' })}
                    className="w-3.5 h-3.5 text-accent"
                  />
                  <span className="text-foreground text-xs">Owners and admins only</span>
                </label>
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Email Invites */}
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-4">
          <h2 className="text-xs font-semibold text-foreground mb-3">Invite Members</h2>
          <form onSubmit={handleSendInvites} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Email addresses</label>
              <textarea
                rows={3}
                placeholder="Enter emails separated by commas or new lines"
                value={inviteEmails}
                onChange={e => setInviteEmails(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
              />
            </div>
            {inviteResult && <p className="text-xs text-muted">{inviteResult}</p>}
            <button
              type="submit"
              disabled={inviteSending}
              className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
            >
              {inviteSending ? 'Sending...' : 'Send Invites'}
            </button>
          </form>
        </div>

        {/* Members */}
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-4">
          <h2 className="text-xs font-semibold text-foreground mb-3">
            Members ({community._count.members})
          </h2>
          <div className="space-y-1.5">
            {community.members.map(m => {
              const roleStyles: Record<string, string> = {
                OWNER: 'bg-warning/15 text-warning border border-warning/30',
                ADMIN: 'bg-accent/15 text-accent border border-accent/30',
                MEMBER: 'bg-surface text-muted border border-border',
              }
              return (
                <div key={m.id} className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                  <div className="flex items-center gap-2">
                    <MemberAvatar image={m.user.image} name={m.user.name} />
                    <div>
                      <Link href={`/user/${m.user.id}`} className="text-foreground hover:text-accent text-xs font-medium">{getDisplayName(m.user)}</Link>
                      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full mt-0.5 ${roleStyles[m.role] || roleStyles.MEMBER}`}>
                        {m.role}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {m.role !== 'OWNER' && community.userRole === 'OWNER' && (
                      <>
                        <button
                          onClick={() => handleRoleChange(m.user.id, m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN')}
                          className={`text-[10px] px-2 py-1 rounded-lg font-medium transition-colors ${
                            m.role === 'ADMIN'
                              ? 'bg-muted/10 text-muted border border-border hover:border-muted'
                              : 'bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20'
                          }`}
                        >
                          {m.role === 'ADMIN' ? 'Demote' : 'Admin'}
                        </button>
                        <button
                          onClick={() => handleRemoveMember(m.user.id)}
                          className="text-[10px] px-2 py-1 rounded-lg font-medium bg-error/10 text-error border border-error/30 hover:bg-error/20 transition-colors"
                        >
                          Remove
                        </button>
                        <button
                          onClick={() => handleBanMember(m.user.id, getDisplayName(m.user))}
                          className="text-[10px] px-2 py-1 rounded-lg font-medium bg-error text-white hover:bg-error-hover transition-colors"
                        >
                          Ban
                        </button>
                      </>
                    )}
                    {m.role === 'MEMBER' && community.userRole === 'ADMIN' && (
                      <>
                        <button
                          onClick={() => handleRemoveMember(m.user.id)}
                          className="text-[10px] px-2 py-1 rounded-lg font-medium bg-error/10 text-error border border-error/30 hover:bg-error/20 transition-colors"
                        >
                          Remove
                        </button>
                        <button
                          onClick={() => handleBanMember(m.user.id, getDisplayName(m.user))}
                          className="text-[10px] px-2 py-1 rounded-lg font-medium bg-error text-white hover:bg-error-hover transition-colors"
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
          <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-4">
            <h2 className="text-xs font-semibold text-foreground mb-3">
              Banned Users ({bannedUsers.length})
            </h2>
            <div className="space-y-1.5">
              {bannedUsers.map(b => (
                <div key={b.id} className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                  <div className="flex items-center gap-2">
                    <MemberAvatar image={b.user.image} name={b.user.name} />
                    <div>
                      <span className="text-foreground text-xs font-medium">{b.user.name || 'Unknown'}</span>
                      <p className="text-[10px] text-muted">
                        Banned by {b.bannedBy.name || 'admin'}
                        {b.reason && <> &middot; {b.reason}</>}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnban(b.id, b.user.id, b.user.name || 'this user')}
                    className="text-[10px] px-2 py-1 rounded-lg font-medium bg-success/10 text-success border border-success/30 hover:bg-success/20 transition-colors"
                  >
                    Unban
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Danger Zone */}
        {community.userRole === 'OWNER' && (
          <div className="border border-error/30 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-error mb-3">Danger Zone</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-foreground">Purge all messages</p>
                  <p className="text-[10px] text-muted">Delete all chat messages in this group.</p>
                </div>
                <button
                  onClick={handlePurgeChat}
                  className="text-[10px] px-3 py-1.5 rounded-lg font-medium bg-error/10 text-error border border-error/30 hover:bg-error/20 transition-colors"
                >
                  Purge Messages
                </button>
              </div>
              <div className="border-t border-error/15" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-foreground">Delete this group</p>
                  <p className="text-[10px] text-muted">Permanently delete the group, members, and messages.</p>
                </div>
                <button
                  onClick={handleDeleteGroup}
                  className="text-[10px] px-3 py-1.5 rounded-lg font-medium bg-error text-white hover:bg-error-hover transition-colors"
                >
                  Delete Group
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </FrameLayout>
  )
}
