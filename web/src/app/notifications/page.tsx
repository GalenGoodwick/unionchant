'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

type Notification = {
  id: string
  type: string
  title: string
  body: string | null
  deliberationId: string | null
  cellId: string | null
  commentId: string | null
  ideaId: string | null
  read: boolean
  readAt: string | null
  createdAt: string
}

export default function NotificationsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const pendingReadsRef = useRef<Set<string>>(new Set())
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
      return
    }
    if (status === 'authenticated') {
      fetchNotifications()
    }
  }, [status, router])

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  const markAllRead = async () => {
    setMarking(true)
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      })
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      }
    } catch {
      // silent
    } finally {
      setMarking(false)
    }
  }

  const flushPendingReads = useCallback(async () => {
    const ids = Array.from(pendingReadsRef.current)
    if (ids.length === 0) return
    pendingReadsRef.current.clear()
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: ids }),
      })
    } catch {
      // silent
    }
  }, [])

  const scheduleRead = useCallback((id: string) => {
    pendingReadsRef.current.add(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    flushTimerRef.current = setTimeout(flushPendingReads, 800)
  }, [flushPendingReads])

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
      flushPendingReads()
    }
  }, [flushPendingReads])

  // Auto-mark as read on scroll into view
  const observerRef = useRef<IntersectionObserver | null>(null)
  const timerMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    observerRef.current = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.notifId
        if (!id) continue
        if (entry.isIntersecting) {
          if (!timerMapRef.current.has(id)) {
            const timer = setTimeout(() => {
              scheduleRead(id)
              timerMapRef.current.delete(id)
            }, 500)
            timerMapRef.current.set(id, timer)
          }
        } else {
          const timer = timerMapRef.current.get(id)
          if (timer) {
            clearTimeout(timer)
            timerMapRef.current.delete(id)
          }
        }
      }
    }, { threshold: 0.5 })

    return () => {
      observerRef.current?.disconnect()
      for (const timer of timerMapRef.current.values()) clearTimeout(timer)
      timerMapRef.current.clear()
    }
  }, [scheduleRead])

  const observeRef = useCallback((el: HTMLElement | null) => {
    if (el && observerRef.current) {
      observerRef.current.observe(el)
    }
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <FrameLayout
      active="chants"
      showBack
      header={
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={marking}
              className="text-xs text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
            >
              {marking ? 'Marking...' : `Mark all read (${unreadCount})`}
            </button>
          )}
        </div>
      }
      footerRight={
        <Link
          href="/chants"
          className="h-10 px-4 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-medium shadow-sm flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Chants</span>
        </Link>
      }
    >
      {loading ? (
        <div className="text-center text-muted py-12 animate-pulse text-sm">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted mb-2 text-sm">No notifications yet.</p>
          <p className="text-muted/60 text-xs">Activity from your chants, comments, and followers will show here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const link = getLink(n)
            const card = (
              <div
                ref={!n.read ? observeRef : undefined}
                data-notif-id={n.id}
                className={`p-3 rounded-lg border transition-colors backdrop-blur-sm ${
                  n.read
                    ? 'bg-surface/70 border-border'
                    : 'bg-surface/90 border-accent/30 shadow-sm'
                }`}
              >
                <div className="flex gap-2.5">
                  <span className="text-base shrink-0 mt-0.5">{getIcon(n.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getTypeColor(n.type)}`}>
                        {getTypeLabel(n.type)}
                      </span>
                      <span className="text-[10px] text-muted/60">{timeAgo(n.createdAt)}</span>
                      {!n.read && (
                        <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
                      )}
                    </div>
                    <p className={`text-xs leading-snug ${!n.read ? 'font-medium text-foreground' : 'text-muted'}`}>
                      {n.title}
                    </p>
                    {n.body && n.type !== 'FOLLOW' && (
                      <p className="text-[11px] text-muted mt-0.5 line-clamp-2">{n.body}</p>
                    )}
                  </div>
                </div>
              </div>
            )

            if (link) {
              return <Link key={n.id} href={link}>{card}</Link>
            }
            return <div key={n.id}>{card}</div>
          })}
        </div>
      )}
    </FrameLayout>
  )
}

function getIcon(type: string) {
  switch (type) {
    case 'COMMENT_REPLY': return '💬'
    case 'COMMENT_UPVOTE': return '👍'
    case 'COMMENT_UP_POLLINATE': return '🌸'
    case 'IDEA_ADVANCING': return '🚀'
    case 'IDEA_WON': return '🏆'
    case 'VOTE_NEEDED':
    case 'CELL_READY': return '🗳️'
    case 'DELIBERATION_UPDATE':
    case 'DELIBERATION_COMPLETE': return '✅'
    case 'FOLLOW': return '👤'
    case 'COMMUNITY_INVITE': return '📨'
    case 'COMMUNITY_NEW_DELIB': return '🆕'
    case 'FOLLOWED_NEW_DELIB': return '📝'
    case 'FOLLOWED_VOTED': return '🗳️'
    case 'PODIUM_NEWS': return '📰'
    case 'CONTENT_REMOVED': return '⚠️'
    case 'IDEA_ELIMINATED': return '❌'
    default: return '🔔'
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'COMMENT_UPVOTE': return 'Upvote'
    case 'COMMENT_REPLY': return 'Reply'
    case 'COMMENT_UP_POLLINATE': return 'Up-Pollinated'
    case 'IDEA_ADVANCING': return 'Advancing'
    case 'IDEA_WON': return 'Won'
    case 'IDEA_ELIMINATED': return 'Eliminated'
    case 'VOTE_NEEDED':
    case 'CELL_READY': return 'Vote Ready'
    case 'DELIBERATION_UPDATE':
    case 'DELIBERATION_COMPLETE': return 'Complete'
    case 'FOLLOW': return 'New Follower'
    case 'COMMUNITY_INVITE': return 'Invite'
    case 'COMMUNITY_NEW_DELIB': return 'Group'
    case 'FOLLOWED_NEW_DELIB': return 'Following'
    case 'FOLLOWED_VOTED': return 'Following'
    case 'PODIUM_NEWS': return 'News'
    case 'CONTENT_REMOVED': return 'Moderation'
    default: return 'Update'
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case 'COMMENT_UP_POLLINATE':
    case 'COMMUNITY_INVITE':
    case 'COMMUNITY_NEW_DELIB': return 'bg-purple/15 text-purple'
    case 'IDEA_ADVANCING':
    case 'IDEA_WON':
    case 'DELIBERATION_COMPLETE': return 'bg-success/15 text-success'
    case 'IDEA_ELIMINATED':
    case 'CONTENT_REMOVED': return 'bg-error/15 text-error'
    case 'VOTE_NEEDED':
    case 'CELL_READY':
    case 'FOLLOWED_VOTED': return 'bg-warning/15 text-warning'
    case 'FOLLOW':
    case 'FOLLOWED_NEW_DELIB': return 'bg-accent/15 text-accent'
    case 'PODIUM_NEWS': return 'bg-gold/15 text-gold'
    default: return 'bg-accent/15 text-accent'
  }
}

function getLink(n: Notification) {
  if (n.type === 'FOLLOW' && n.body) return `/user/${n.body}`
  if (n.deliberationId) return `/chants/${n.deliberationId}`
  return null
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
