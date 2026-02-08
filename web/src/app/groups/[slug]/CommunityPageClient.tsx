'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState, useRef, useCallback } from 'react'
import Header from '@/components/Header'
import ShareMenu from '@/components/ShareMenu'
import { FullPageSpinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import CaptchaModal from '@/components/CaptchaModal'
import { getDisplayName } from '@/lib/user'
import { phaseLabel } from '@/lib/labels'

type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED'

type ChatMessage = {
  id: string
  text: string
  createdAt: string
  user: { id: string; name: string | null; image: string | null }
}

type Member = {
  id: string
  role: string
  joinedAt: string
  user: { id: string; name: string | null; image: string | null; status: UserStatus }
}

type Deliberation = {
  id: string
  question: string
  description: string | null
  phase: string
  isPublic: boolean
  currentTier: number
  createdAt: string
  creator: { id: string; name: string | null; status: UserStatus }
  _count: { members: number; ideas: number }
}

type Community = {
  id: string
  name: string
  slug: string
  description: string | null
  isPublic: boolean
  inviteCode: string | null
  discordInviteUrl: string | null
  creatorId: string
  creator: { id: string; name: string | null; image: string | null; status: UserStatus }
  createdAt: string
  userRole: string | null
  members: Member[]
  deliberations: Deliberation[]
  _count: { members: number; deliberations: number }
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

function GroupChat({ slug, members, isOwnerOrAdmin }: { slug: string; members: Member[]; isOwnerOrAdmin: boolean }) {
  const { showToast } = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isNearBottom = useRef(true)
  const [captchaOpen, setCaptchaOpen] = useState(false)
  const [captchaStrike, setCaptchaStrike] = useState(1)
  const [pendingMessage, setPendingMessage] = useState('')
  const [mutedUntil, setMutedUntil] = useState<number | null>(null)

  const memberRoles = useRef(new Map<string, string>())
  useEffect(() => {
    const m = new Map<string, string>()
    members.forEach(mb => m.set(mb.user.id, mb.role))
    memberRoles.current = m
  }, [members])

  const fetchMessages = useCallback(async (before?: string) => {
    try {
      const url = `/api/communities/${slug}/chat${before ? `?before=${before}` : ''}`
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      if (before) {
        setMessages(prev => [...data.messages, ...prev])
      } else {
        setMessages(data.messages)
      }
      setHasMore(data.hasMore)
    } catch {}
    setLoading(false)
  }, [slug])

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(() => fetchMessages(), 8000)
    return () => clearInterval(interval)
  }, [fetchMessages])

  useEffect(() => {
    if (isNearBottom.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMsg.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/communities/${slug}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newMsg }),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages(prev => [...prev, msg])
        setNewMsg('')
        isNearBottom.current = true
      } else {
        const data = await res.json()
        if (data.error === 'CAPTCHA_REQUIRED') {
          setCaptchaStrike(data.strike || 1)
          setPendingMessage(newMsg)
          setCaptchaOpen(true)
        } else if (data.error === 'MUTED') {
          setMutedUntil(data.mutedUntil)
          setCaptchaOpen(true)
        } else {
          showToast(data.error || 'Failed to send', 'error')
        }
      }
    } catch {
      showToast('Failed to send message', 'error')
    }
    setSending(false)
  }

  const handleCaptchaVerify = async (token: string) => {
    setCaptchaOpen(false)
    if (!pendingMessage.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/communities/${slug}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pendingMessage, captchaToken: token }),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages(prev => [...prev, msg])
        setNewMsg('')
        setPendingMessage('')
        isNearBottom.current = true
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to send', 'error')
      }
    } catch {
      showToast('Failed to send message', 'error')
    }
    setSending(false)
  }

  const handleDelete = async (messageId: string) => {
    try {
      const res = await fetch(`/api/communities/${slug}/chat/${messageId}`, { method: 'DELETE' })
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== messageId))
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to delete', 'error')
      }
    } catch {
      showToast('Failed to delete message', 'error')
    }
  }

  const handleBan = async (userId: string, userName: string) => {
    if (!confirm(`Ban ${userName} from this group permanently?`)) return
    try {
      const res = await fetch(`/api/communities/${slug}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (res.ok) {
        showToast(`${userName} has been banned`, 'success')
        setMessages(prev => prev.filter(m => m.user.id !== userId))
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to ban', 'error')
      }
    } catch {
      showToast('Failed to ban user', 'error')
    }
  }

  const formatTime = (d: string) => {
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  }

  return (
    <div className="bg-surface border border-border rounded-xl mb-6 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className={`w-4 h-4 text-muted transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <h2 className="text-sm font-semibold text-foreground">Group Chat</h2>
          {messages.length > 0 && (
            <span className="text-xs text-muted font-mono">{messages.length}</span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="max-h-64 overflow-y-auto p-3 space-y-2"
          >
            {hasMore && (
              <button
                onClick={() => messages.length > 0 && fetchMessages(messages[0].createdAt)}
                className="w-full text-xs text-accent hover:text-accent-hover py-1"
              >
                Load older messages
              </button>
            )}
            {loading ? (
              <p className="text-muted text-sm text-center py-4">Loading...</p>
            ) : messages.length === 0 ? (
              <p className="text-muted text-sm text-center py-4">No messages yet. Say hello!</p>
            ) : (
              messages.map(msg => {
                const role = memberRoles.current.get(msg.user.id)
                return (
                  <div key={msg.id} className="relative group flex gap-2">
                    <Link href={`/user/${msg.user.id}`} className="shrink-0 mt-0.5">
                      {msg.user.image ? (
                        <img src={msg.user.image} alt="" className="w-6 h-6 rounded-full" />
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-xs font-medium text-accent">
                          {(msg.user.name || '?').charAt(0).toUpperCase()}
                        </span>
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <Link href={`/user/${msg.user.id}`} className="text-xs font-medium text-foreground hover:text-accent transition-colors">{msg.user.name || 'Anonymous'}</Link>
                        {(role === 'OWNER' || role === 'ADMIN') && (
                          <span className="text-[10px] px-1 py-0 rounded bg-accent/10 text-accent">
                            {role === 'OWNER' ? 'Owner' : 'Admin'}
                          </span>
                        )}
                        <span className="text-[10px] text-muted">{formatTime(msg.createdAt)}</span>
                        {isOwnerOrAdmin && role !== 'OWNER' && role !== 'ADMIN' && (
                          <button
                            onClick={() => handleBan(msg.user.id, msg.user.name || 'this user')}
                            className="text-[10px] text-muted hover:text-error transition-colors"
                            title="Ban user"
                          >
                            ban
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-foreground break-words">{msg.text}</p>
                    </div>
                    {isOwnerOrAdmin && (
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center rounded text-muted opacity-0 group-hover:opacity-100 hover:text-error hover:bg-error/10 transition-all text-sm"
                        title="Delete message"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSend} className="border-t border-border p-2 flex gap-2">
            <input
              type="text"
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              placeholder="Message..."
              maxLength={2000}
              className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={sending || !newMsg.trim()}
              className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
            >
              {sending ? '...' : 'Send'}
            </button>
          </form>
        </div>
      )}

      <CaptchaModal
        open={captchaOpen}
        strike={captchaStrike}
        onVerify={handleCaptchaVerify}
        onClose={() => { setCaptchaOpen(false); setMutedUntil(null) }}
        mutedUntil={mutedUntil}
      />
    </div>
  )
}

export default function CommunityPageClient() {
  const { data: session } = useSession()
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [community, setCommunity] = useState<Community | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/communities/${slug}`)
      .then(res => {
        if (!res.ok) throw new Error('Community not found')
        return res.json()
      })
      .then(data => setCommunity(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [slug])

  const handleJoin = async () => {
    if (!session) {
      router.push(`/auth/signin?callbackUrl=/groups/${slug}`)
      return
    }
    setJoining(true)
    try {
      const res = await fetch(`/api/communities/${slug}/join`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to join')
      }
      const updated = await fetch(`/api/communities/${slug}`).then(r => r.json())
      setCommunity(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setJoining(false)
    }
  }

  const handleLeave = async () => {
    setLeaving(true)
    try {
      const res = await fetch(`/api/communities/${slug}/leave`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to leave')
      }
      const updated = await fetch(`/api/communities/${slug}`).then(r => r.json())
      setCommunity(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave')
    } finally {
      setLeaving(false)
    }
  }

  const copyInviteLink = () => {
    if (!community?.inviteCode) return
    const url = `${window.location.origin}/groups/invite/${community.inviteCode}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const phaseColors: Record<string, string> = {
    SUBMISSION: 'bg-accent-light text-accent',
    VOTING: 'bg-warning-bg text-warning',
    ACCUMULATING: 'bg-purple-bg text-purple',
    COMPLETED: 'bg-success-bg text-success',
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <FullPageSpinner />
      </div>
    )
  }

  if (error || !community) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-xl mx-auto px-4 py-8 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Group Not Found</h1>
          <p className="text-muted mb-6">{error || 'This group does not exist or you do not have access.'}</p>
          <Link href="/groups" className="text-accent hover:text-accent-hover">
            Browse Groups
          </Link>
        </div>
      </div>
    )
  }

  const isMember = community.userRole !== null
  const isOwnerOrAdmin = community.userRole === 'OWNER' || community.userRole === 'ADMIN'
  const activeTalks = community.deliberations.filter(d => d.phase !== 'COMPLETED')
  const completedTalks = community.deliberations.filter(d => d.phase === 'COMPLETED')

  // Sort: owner's deliberations first, then by date
  const sortedActive = [...activeTalks].sort((a, b) => {
    const aIsOwner = a.creator.id === community.creatorId
    const bIsOwner = b.creator.id === community.creatorId
    if (aIsOwner && !bIsOwner) return -1
    if (!aIsOwner && bIsOwner) return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-xl mx-auto px-4 py-4">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <Link href="/groups" className="text-muted hover:text-foreground text-sm">
            ← Back
          </Link>
          <div className="flex items-center gap-2">
            {isMember && (
              <Link
                href={`/groups/${slug}/feed`}
                className="border border-accent text-accent hover:bg-accent hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
              >
                Feed
              </Link>
            )}
          {isOwnerOrAdmin && (
            <Link
              href={`/groups/${slug}/settings`}
              className="border border-border hover:border-accent text-foreground px-3 py-1.5 rounded text-sm flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </Link>
          )}
          </div>
        </div>

        {/* Banner */}
        <div className="bg-surface border border-border rounded-xl p-6 mb-4 text-center">
          <h1 className="text-xl font-bold text-foreground mb-2">{community.name}</h1>
          {community.description && (
            <p className="text-muted text-sm leading-relaxed max-w-md mx-auto">{community.description}</p>
          )}
          {!community.isPublic && (
            <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-surface-hover text-muted border border-border">
              Private
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-surface border border-border rounded-xl p-3 text-center">
            <div className="text-xl font-bold font-mono text-foreground">{community._count.members}</div>
            <div className="text-xs text-muted">Members</div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-3 text-center">
            <div className="text-xl font-bold font-mono text-foreground">{activeTalks.length}</div>
            <div className="text-xs text-muted">Active</div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-3 text-center">
            <div className="text-xl font-bold font-mono text-foreground">{completedTalks.length}</div>
            <div className="text-xs text-muted">Priorities</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mb-6">
          {!isMember ? (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="flex-1 bg-accent hover:bg-accent-hover text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {joining ? 'Joining...' : 'Join Group'}
            </button>
          ) : (
            <>
              <button
                onClick={copyInviteLink}
                disabled={!community.inviteCode}
                className="flex-1 flex items-center justify-center gap-1.5 bg-accent hover:bg-accent-hover text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              >
                <span>+</span>
                {copied ? 'Copied!' : 'Invite'}
              </button>
              <ShareMenu url={`/groups/${slug}`} text={community.name} />
            </>
          )}
          {community.discordInviteUrl && (
            <a
              href={community.discordInviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              Discord
            </a>
          )}
          {isMember && community.userRole !== 'OWNER' && (
            <button
              onClick={handleLeave}
              disabled={leaving}
              className="border border-border text-muted hover:text-error hover:border-error px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
            >
              {leaving ? '...' : 'Leave'}
            </button>
          )}
        </div>

        {/* New Chant CTA — private groups: owner/admin only */}
        {isMember && (community.isPublic || isOwnerOrAdmin) && (
          <Link
            href={`/chants/new?community=${slug}`}
            className="block text-center bg-surface border border-border hover:border-accent rounded-xl p-3 text-sm text-accent font-medium transition-colors mb-6"
          >
            + New Chant in this Group
          </Link>
        )}

        {/* Group Chat — members only */}
        {isMember && <GroupChat slug={slug} members={community.members} isOwnerOrAdmin={isOwnerOrAdmin} />}

        {/* Active questions */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">Active questions</h2>
          {sortedActive.length === 0 ? (
            <div className="text-center py-8 bg-surface border border-border rounded-xl">
              <p className="text-muted text-sm">No active chants yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedActive.map(d => (
                <Link
                  key={d.id}
                  href={`/chants/${d.id}`}
                  className="block bg-surface border border-border rounded-xl p-4 hover:border-accent transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${phaseColors[d.phase] || 'bg-surface text-muted'}`}>
                      {phaseLabel(d.phase)}
                    </span>
                    {d.currentTier > 0 && (
                      <span className="text-xs text-muted">Tier {d.currentTier}</span>
                    )}
                    {!d.isPublic && (
                      <span className="px-2 py-0.5 rounded text-xs bg-surface-hover text-muted border border-border">
                        Group Only
                      </span>
                    )}
                  </div>
                  <h3 className="text-foreground font-medium text-sm">{d.question}</h3>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
                    <span>{d._count.members} participants</span>
                    <span>{d._count.ideas} ideas</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Completed */}
        {completedTalks.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-foreground mb-3">Priorities</h2>
            <div className="space-y-2">
              {completedTalks.map(d => (
                <Link
                  key={d.id}
                  href={`/chants/${d.id}`}
                  className="block bg-surface border border-border rounded-xl p-4 hover:border-success transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-success-bg text-success">
                      {phaseLabel(d.phase)}
                    </span>
                  </div>
                  <h3 className="text-foreground font-medium text-sm">{d.question}</h3>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
                    <span>{d._count.members} participants</span>
                    <span>{d._count.ideas} ideas</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Members */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Members</h2>
          <div className="bg-surface border border-border rounded-xl divide-y divide-border">
            {community.members.map(m => (
              <Link
                key={m.id}
                href={`/user/${m.user.id}`}
                className="flex items-center justify-between p-3 hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  {m.user.image ? (
                    <img src={m.user.image} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-sm font-medium text-accent">
                      {(m.user.name || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <span className="text-foreground text-sm">{getDisplayName(m.user)}</span>
                    <p className="text-xs text-muted">Joined {timeAgo(m.joinedAt)}</p>
                  </div>
                </div>
                {(m.role === 'OWNER' || m.role === 'ADMIN') && (
                  <span className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent">
                    {m.role === 'OWNER' ? 'Owner' : 'Admin'}
                  </span>
                )}
              </Link>
            ))}
            {community._count.members > community.members.length && (
              <div className="p-3 text-center">
                <span className="text-xs text-accent">View all {community._count.members} members →</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
