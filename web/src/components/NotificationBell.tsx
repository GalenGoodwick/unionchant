'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'

type Notification = {
  id: string
  type: string
  title: string
  body: string | null
  deliberationId: string | null
  cellId: string | null
  commentId: string | null
  read: boolean
  createdAt: string
}

export default function NotificationBell({ onOpen }: { onOpen?: () => void } = {}) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const autoReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications?limit=10')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
      }
    } catch {
      // silent
    }
  }

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      fetchNotifications()
    }, 30000)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchNotifications()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // Click-outside is now handled by the portal overlay's onClick

  useEffect(() => {
    if (isOpen && unreadCount > 0) {
      autoReadTimerRef.current = setTimeout(() => {
        markAllRead()
      }, 2000)
    }
    return () => {
      if (autoReadTimerRef.current) clearTimeout(autoReadTimerRef.current)
    }
  }, [isOpen, unreadCount])

  const markAllRead = async () => {
    setLoading(true)
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      })
      setUnreadCount(0)
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'COMMENT_REPLY': return '💬'
      case 'COMMENT_UPVOTE': return '👍'
      case 'COMMENT_UP_POLLINATE': return '🌸'
      case 'IDEA_ADVANCING': return '🚀'
      case 'IDEA_WON': return '🏆'
      case 'VOTE_NEEDED': return '🗳️'
      case 'DELIBERATION_UPDATE': return '📢'
      case 'FOLLOW': return '👤'
      case 'COMMUNITY_INVITE': return '📨'
      case 'COMMUNITY_NEW_DELIB': return '🆕'
      case 'FOLLOWED_NEW_DELIB': return '📝'
      case 'FOLLOWED_VOTED': return '🗳️'
      case 'PODIUM_NEWS': return '📰'
      case 'CONTENT_REMOVED': return '⚠️'
      default: return '🔔'
    }
  }

  const getLink = (n: Notification) => {
    if (n.type === 'FOLLOW' && n.body) return `/user/${n.body}`
    if (n.deliberationId) return `/chants/${n.deliberationId}`
    return '/chants'
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const secs = Math.floor(diff / 1000)
    if (secs < 60) return 'now'
    if (secs < 3600) return `${Math.floor(secs / 60)}m`
    if (secs < 86400) return `${Math.floor(secs / 3600)}h`
    return `${Math.floor(secs / 86400)}d`
  }

  const bellRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 })

  useEffect(() => {
    if (isOpen && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      })
    }
  }, [isOpen])

  return (
    <div>
      {/* Bell button */}
      <button
        ref={bellRef}
        onClick={() => {
          const next = !isOpen
          setIsOpen(next)
          if (next) {
            onOpen?.()
            fetchNotifications()
          }
        }}
        className={`relative p-1.5 rounded-lg transition-colors ${
          unreadCount > 0
            ? 'text-accent'
            : 'text-muted hover:text-foreground'
        }`}
        aria-label="Notifications"
      >
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {/* Alert signifier */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center">
            <span className="absolute w-4 h-4 rounded-full bg-error/30 animate-ping" />
            <span className="relative bg-error text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {/* Dropdown — portaled to body to escape overflow-hidden containers */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[9999]" onClick={() => setIsOpen(false)}>
          <div
            className="fixed w-80 bg-surface border border-border rounded-lg shadow-xl overflow-hidden"
            style={{ top: dropdownPos.top, right: dropdownPos.right }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-border flex justify-between items-center">
              <span className="text-sm font-semibold text-foreground">Notifications</span>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    disabled={loading}
                    className="text-[11px] text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
                  >
                    Mark all read
                  </button>
                )}
                <Link
                  href="/notifications"
                  onClick={() => setIsOpen(false)}
                  className="text-[11px] text-muted hover:text-foreground transition-colors"
                >
                  View all
                </Link>
              </div>
            </div>

            {/* Notifications list */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-muted text-sm">
                  No notifications yet
                </div>
              ) : (
                notifications.map(n => (
                  <Link
                    key={n.id}
                    href={getLink(n)}
                    onClick={() => setIsOpen(false)}
                    className={`block px-3 py-2.5 border-b border-border/50 hover:bg-background/80 transition-colors ${
                      !n.read ? 'bg-accent/5' : ''
                    }`}
                  >
                    <div className="flex gap-2.5">
                      <span className="text-base shrink-0 mt-0.5">{getIcon(n.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs leading-snug ${!n.read ? 'font-medium text-foreground' : 'text-muted'}`}>
                          {n.title}
                        </p>
                        {n.body && n.type !== 'FOLLOW' && (
                          <p className="text-[11px] text-muted truncate mt-0.5">{n.body}</p>
                        )}
                        <span className="text-[10px] text-muted/60">{timeAgo(n.createdAt)}</span>
                      </div>
                      {!n.read && (
                        <span className="w-1.5 h-1.5 bg-accent rounded-full shrink-0 mt-1.5" />
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
