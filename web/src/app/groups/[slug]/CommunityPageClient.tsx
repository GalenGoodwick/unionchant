'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState, useRef, useCallback } from 'react'
import SectionNav from '@/components/SectionNav'
import { AmbientConstellation } from '@/components/ConstellationCanvas'
import { useCollectiveChat } from '@/app/providers'
import ShareMenu from '@/components/ShareMenu'
import { useToast } from '@/components/Toast'
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
    <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-surface-hover/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className={`w-3.5 h-3.5 text-muted transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <h2 className="text-xs font-semibold text-foreground">Group Chat</h2>
          {messages.length > 0 && (
            <span className="text-[10px] text-muted font-mono">{messages.length}</span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="max-h-48 overflow-y-auto p-3 space-y-2"
          >
            {hasMore && (
              <button
                onClick={() => messages.length > 0 && fetchMessages(messages[0].createdAt)}
                className="w-full text-[10px] text-accent hover:text-accent-hover py-1"
              >
                Load older messages
              </button>
            )}
            {loading ? (
              <p className="text-muted text-xs text-center py-4">Loading...</p>
            ) : messages.length === 0 ? (
              <p className="text-muted text-xs text-center py-4">No messages yet. Say hello!</p>
            ) : (
              messages.map(msg => {
                const role = memberRoles.current.get(msg.user.id)
                return (
                  <div key={msg.id} className="relative group flex gap-2">
                    <Link href={`/user/${msg.user.id}`} className="shrink-0 mt-0.5">
                      {msg.user.image ? (
                        <img src={msg.user.image} alt="" className="w-5 h-5 rounded-full" />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-medium text-accent">
                          {(msg.user.name || '?').charAt(0).toUpperCase()}
                        </span>
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <Link href={`/user/${msg.user.id}`} className="text-[11px] font-medium text-foreground hover:text-accent transition-colors">{msg.user.name || 'Anonymous'}</Link>
                        {(role === 'OWNER' || role === 'ADMIN') && (
                          <span className="text-[9px] px-1 rounded bg-accent/10 text-accent">
                            {role === 'OWNER' ? 'Owner' : 'Admin'}
                          </span>
                        )}
                        <span className="text-[9px] text-muted">{formatTime(msg.createdAt)}</span>
                        {isOwnerOrAdmin && role !== 'OWNER' && role !== 'ADMIN' && (
                          <button
                            onClick={() => handleBan(msg.user.id, msg.user.name || 'this user')}
                            className="text-[9px] text-muted hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                            title="Ban user"
                          >
                            ban
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-foreground break-words">{msg.text}</p>
                    </div>
                    {isOwnerOrAdmin && (
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center rounded text-muted opacity-0 group-hover:opacity-100 hover:text-error hover:bg-error/10 transition-all text-xs"
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
              className="flex-1 bg-background/80 border border-border rounded px-2.5 py-1.5 text-xs text-foreground placeholder-muted focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={sending || !newMsg.trim()}
              className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded text-xs disabled:opacity-50"
            >
              {sending ? '...' : 'Send'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

export default function CommunityPageClient() {
  const { data: session } = useSession()
  const { chatOpen, toggleChat } = useCollectiveChat()
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
    SUBMISSION: 'bg-accent/15 text-accent',
    VOTING: 'bg-warning/15 text-warning',
    ACCUMULATING: 'bg-purple/15 text-purple',
    COMPLETED: 'bg-success/15 text-success',
  }

  if (loading) {
    return (
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden max-w-[480px] w-full mx-auto relative border-x-4 border-white/50">
          <AmbientConstellation />
          <div className="flex-1 flex items-center justify-center relative z-10">
            <div className="text-muted text-sm animate-pulse">Loading group...</div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !community) {
    return (
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden max-w-[480px] w-full mx-auto relative border-x-4 border-white/50">
          <AmbientConstellation />
          <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-4">
            <p className="text-muted text-sm mb-4">{error || 'This group does not exist or you do not have access.'}</p>
            <Link href="/groups" className="text-accent text-sm hover:underline">Browse Groups</Link>
          </div>
        </div>
      </div>
    )
  }

  const isMember = community.userRole !== null
  const isOwnerOrAdmin = community.userRole === 'OWNER' || community.userRole === 'ADMIN'
  const activeTalks = community.deliberations.filter(d => d.phase !== 'COMPLETED')
  const completedTalks = community.deliberations.filter(d => d.phase === 'COMPLETED')

  const sortedActive = [...activeTalks].sort((a, b) => {
    const aIsOwner = a.creator.id === community.creatorId
    const bIsOwner = b.creator.id === community.creatorId
    if (aIsOwner && !bIsOwner) return -1
    if (!aIsOwner && bIsOwner) return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden max-w-[480px] w-full mx-auto relative border-x-4 border-white/50">
        <AmbientConstellation />

        {/* Top bar */}
        <div className="shrink-0 px-4 pt-4 relative z-10">
          <SectionNav active="groups" />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 relative z-10">
          {/* Group header */}
          <div className="mb-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h1 className="text-base font-bold text-foreground leading-tight">{community.name}</h1>
              <div className="flex items-center gap-1.5 shrink-0">
                {!community.isPublic && (
                  <span className="px-2 py-0.5 text-[10px] rounded-full font-medium bg-muted/15 text-muted">Private</span>
                )}
                {community.userRole && (
                  <span className="px-2 py-0.5 text-[10px] rounded-full font-medium bg-accent/15 text-accent">{community.userRole}</span>
                )}
              </div>
            </div>
            {community.description && (
              <p className="text-xs text-muted leading-relaxed">{community.description}</p>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-2.5 text-center">
              <div className="text-sm font-bold font-mono text-foreground">{community._count.members}</div>
              <div className="text-[10px] text-muted">Members</div>
            </div>
            <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-2.5 text-center">
              <div className="text-sm font-bold font-mono text-foreground">{activeTalks.length}</div>
              <div className="text-[10px] text-muted">Active</div>
            </div>
            <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-2.5 text-center">
              <div className="text-sm font-bold font-mono text-foreground">{completedTalks.length}</div>
              <div className="text-[10px] text-muted">Priorities</div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mb-4">
            {!isMember ? (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="flex-1 bg-accent hover:bg-accent-hover text-white px-3 py-2 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
              >
                {joining ? 'Joining...' : 'Join Group'}
              </button>
            ) : (
              <>
                <button
                  onClick={copyInviteLink}
                  disabled={!community.inviteCode}
                  className="flex-1 flex items-center justify-center gap-1 bg-accent hover:bg-accent-hover text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {copied ? 'Copied!' : '+ Invite'}
                </button>
                <ShareMenu url={`/groups/${slug}`} text={community.name} />
              </>
            )}
            {isMember && (
              <Link
                href={`/groups/${slug}/feed`}
                className="flex items-center justify-center border border-accent text-accent hover:bg-accent hover:text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              >
                Feed
              </Link>
            )}
            {isOwnerOrAdmin && (
              <Link
                href={`/groups/${slug}/settings`}
                className="flex items-center justify-center border border-border hover:border-accent text-muted hover:text-foreground px-2.5 py-2 rounded-lg text-xs transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
            )}
            {community.discordInviteUrl && (
              <a
                href={community.discordInviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 bg-[#5865F2] hover:bg-[#4752C4] text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              >
                Discord
              </a>
            )}
            {isMember && community.userRole !== 'OWNER' && (
              <button
                onClick={handleLeave}
                disabled={leaving}
                className="border border-border text-muted hover:text-error hover:border-error px-2.5 py-2 rounded-lg text-xs transition-colors disabled:opacity-50"
              >
                {leaving ? '...' : 'Leave'}
              </button>
            )}
          </div>

          {/* New Chant CTA */}
          {isMember && (community.isPublic || isOwnerOrAdmin) && (
            <Link
              href="/chants"
              className="block text-center bg-surface/90 backdrop-blur-sm border border-border hover:border-accent rounded-lg p-2.5 text-xs text-accent font-medium transition-colors mb-4"
            >
              + New Chant in this Group
            </Link>
          )}

          {/* Group Chat */}
          {isMember && (
            <div className="mb-4">
              <GroupChat slug={slug} members={community.members} isOwnerOrAdmin={isOwnerOrAdmin} />
            </div>
          )}

          {/* Active chants */}
          <div className="mb-4">
            <h2 className="text-xs font-semibold text-foreground mb-2">Active chants</h2>
            {sortedActive.length === 0 ? (
              <div className="text-center py-6 bg-surface/90 backdrop-blur-sm border border-border rounded-lg">
                <p className="text-muted text-xs">No active chants yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedActive.map(d => (
                  <Link
                    key={d.id}
                    href={`/chants/${d.id}`}
                    className="block bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 hover:border-accent hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${phaseColors[d.phase] || 'bg-muted/15 text-muted'}`}>
                        {phaseLabel(d.phase)}
                      </span>
                      {d.currentTier > 0 && (
                        <span className="text-[10px] text-muted">Tier {d.currentTier}</span>
                      )}
                      {!d.isPublic && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-muted/15 text-muted">Group Only</span>
                      )}
                    </div>
                    <h3 className="text-xs font-medium text-foreground leading-snug">{d.question}</h3>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted">
                      <span>{d._count.members} participants</span>
                      <span>{d._count.ideas} ideas</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Completed chants */}
          {completedTalks.length > 0 && (
            <div className="mb-4">
              <h2 className="text-xs font-semibold text-foreground mb-2">Priorities</h2>
              <div className="space-y-2">
                {completedTalks.map(d => (
                  <Link
                    key={d.id}
                    href={`/chants/${d.id}`}
                    className="block bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 hover:border-success hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/15 text-success">
                        {phaseLabel(d.phase)}
                      </span>
                    </div>
                    <h3 className="text-xs font-medium text-foreground leading-snug">{d.question}</h3>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted">
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
            <h2 className="text-xs font-semibold text-foreground mb-2">Members</h2>
            <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg divide-y divide-border/50">
              {community.members.map(m => (
                <Link
                  key={m.id}
                  href={`/user/${m.user.id}`}
                  className="flex items-center justify-between p-2.5 hover:bg-surface-hover/80 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    {m.user.image ? (
                      <img src={m.user.image} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-medium text-accent">
                        {(m.user.name || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div>
                      <span className="text-foreground text-xs">{getDisplayName(m.user)}</span>
                      <p className="text-[10px] text-muted">Joined {timeAgo(m.joinedAt)}</p>
                    </div>
                  </div>
                  {(m.role === 'OWNER' || m.role === 'ADMIN') && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                      {m.role === 'OWNER' ? 'Owner' : 'Admin'}
                    </span>
                  )}
                </Link>
              ))}
              {community._count.members > community.members.length && (
                <div className="p-2.5 text-center">
                  <span className="text-[10px] text-muted">+{community._count.members - community.members.length} more members</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer bar */}
        <div className="shrink-0 px-4 py-3 relative z-10 flex items-center justify-between">
          <button
            onClick={toggleChat}
            className={`h-10 px-4 rounded-full text-sm font-medium shadow-sm flex items-center gap-2 transition-colors ${
              chatOpen ? 'bg-gold/20 text-gold' : 'bg-gold text-header hover:bg-gold/90'
            }`}
            aria-label="Collective Consciousness"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="3" />
              <circle cx="12" cy="12" r="7" strokeDasharray="2 3" />
              <circle cx="12" cy="12" r="11" strokeDasharray="1.5 3" />
            </svg>
            <span>Collective</span>
          </button>
          <Link
            href="/groups"
            className="h-10 px-4 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-medium shadow-sm flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Groups</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
