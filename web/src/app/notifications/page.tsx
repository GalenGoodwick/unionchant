'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Spinner from '@/components/Spinner'

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
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
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
    } catch (err) {
      console.error('Failed to mark all read:', err)
    } finally {
      setMarking(false)
    }
  }

  // Batch mark-read: collect IDs and flush after a short window
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
    } catch (err) {
      console.error('Failed to batch mark read:', err)
    }
  }, [])

  const scheduleRead = useCallback((id: string) => {
    pendingReadsRef.current.add(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))

    if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    flushTimerRef.current = setTimeout(flushPendingReads, 800)
  }, [flushPendingReads])

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
      flushPendingReads()
    }
  }, [flushPendingReads])

  // IntersectionObserver to auto-mark unread notifications as read
  const observerRef = useRef<IntersectionObserver | null>(null)
  const timerMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    observerRef.current = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.notifId
        if (!id) continue

        if (entry.isIntersecting) {
          // Start timer when visible
          if (!timerMapRef.current.has(id)) {
            const timer = setTimeout(() => {
              scheduleRead(id)
              timerMapRef.current.delete(id)
            }, 500)
            timerMapRef.current.set(id, timer)
          }
        } else {
          // Cancel timer if scrolled away
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

  // Ref callback to observe unread notification elements
  const observeRef = useCallback((el: HTMLElement | null) => {
    if (el && observerRef.current) {
      observerRef.current.observe(el)
    }
  }, [])

  const getIcon = (type: string) => {
    switch (type) {
      case 'COMMENT_UPVOTE': return '👍'
      case 'COMMENT_REPLY': return '💬'
      case 'COMMENT_UP_POLLINATE': return '🌸'
      case 'IDEA_ADVANCING': return '🚀'
      case 'IDEA_WON': return '🏆'
      case 'IDEA_ELIMINATED': return '❌'
      case 'CELL_READY': return '🗳️'
      case 'DELIBERATION_COMPLETE': return '✅'
      case 'FOLLOW': return '👤'
      case 'COMMUNITY_INVITE': return '📨'
      case 'COMMUNITY_NEW_DELIB': return '🆕'
      case 'FOLLOWED_NEW_DELIB': return '📝'
      case 'FOLLOWED_VOTED': return '🗳️'
      default: return '🔔'
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'COMMENT_UPVOTE': return 'Upvote'
      case 'COMMENT_REPLY': return 'Reply'
      case 'COMMENT_UP_POLLINATE': return 'Up-Pollinated'
      case 'IDEA_ADVANCING': return 'Advancing'
      case 'IDEA_WON': return 'Won'
      case 'IDEA_ELIMINATED': return 'Eliminated'
      case 'CELL_READY': return 'Vote Ready'
      case 'DELIBERATION_COMPLETE': return 'Complete'
      case 'FOLLOW': return 'New Follower'
      case 'COMMUNITY_INVITE': return 'Invite'
      case 'COMMUNITY_NEW_DELIB': return 'Group'
      case 'FOLLOWED_NEW_DELIB': return 'Following'
      case 'FOLLOWED_VOTED': return 'Following'
      default: return 'Notification'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'COMMENT_UP_POLLINATE': return 'bg-purple text-white'
      case 'IDEA_ADVANCING':
      case 'IDEA_WON': return 'bg-success text-white'
      case 'IDEA_ELIMINATED': return 'bg-error text-white'
      case 'CELL_READY': return 'bg-warning text-black'
      case 'FOLLOW': return 'bg-accent text-white'
      case 'COMMUNITY_INVITE':
      case 'COMMUNITY_NEW_DELIB': return 'bg-purple text-white'
      case 'FOLLOWED_NEW_DELIB': return 'bg-accent text-white'
      case 'FOLLOWED_VOTED': return 'bg-warning text-black'
      default: return 'bg-accent text-white'
    }
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const getLink = (n: Notification) => {
    if (n.type === 'FOLLOW' && n.body) return `/user/${n.body}`
    if (n.deliberationId) return `/talks/${n.deliberationId}`
    return null
  }

  const unreadCount = notifications.filter(n => !n.read).length

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-xl mx-auto px-4 py-8">
          <div className="flex flex-col items-center gap-6 py-12">
            <Spinner size="lg" label="Loading notifications" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-muted text-sm">{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={marking}
              className="text-accent hover:text-accent-hover text-sm transition-colors disabled:opacity-50"
            >
              {marking ? 'Marking...' : 'Mark all read'}
            </button>
          )}
        </div>

        {/* Empty state */}
        {notifications.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🔔</div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              No notifications yet
            </h2>
            <p className="text-muted">
              You'll see activity here when people interact with your comments and ideas.
            </p>
          </div>
        )}

        {/* Notifications list */}
        <div className="space-y-2">
          {notifications.map((n) => {
            const link = getLink(n)
            const content = (
              <div
                ref={!n.read ? observeRef : undefined}
                data-notif-id={n.id}
                className={`p-4 rounded-xl border transition-colors ${
                  n.read
                    ? 'bg-surface border-border'
                    : 'bg-surface border-accent'
                }`}
              >
                <div className="flex gap-3">
                  {/* Icon */}
                  <div className="text-2xl shrink-0">{getIcon(n.type)}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${getTypeColor(n.type)}`}>
                        {getTypeLabel(n.type)}
                      </span>
                      <span className="text-muted text-xs">{timeAgo(n.createdAt)}</span>
                      {!n.read && (
                        <span className="w-2 h-2 bg-accent rounded-full" />
                      )}
                    </div>
                    <p className="text-foreground font-medium">{n.title}</p>
                    {n.body && n.type !== 'FOLLOW' && (
                      <p className="text-muted text-sm mt-1 line-clamp-2">{n.body}</p>
                    )}
                  </div>
                </div>
              </div>
            )

            if (link) {
              return (
                <Link key={n.id} href={link}>
                  {content}
                </Link>
              )
            }

            return <div key={n.id}>{content}</div>
          })}
        </div>
      </div>
    </div>
  )
}
