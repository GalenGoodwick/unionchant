'use client'

import { useState, useEffect, useRef } from 'react'
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
  const dropdownRef = useRef<HTMLDivElement>(null)
  const autoReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications?limit=10')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    }
  }

  // Initial fetch and polling with visibility check
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      fetchNotifications()
    }, 30000)

    // Re-fetch when tab becomes visible
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchNotifications()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-read when dropdown opens
  useEffect(() => {
    if (isOpen && unreadCount > 0) {
      autoReadTimerRef.current = setTimeout(() => {
        markAllRead()
      }, 1000)
    }
    return () => {
      if (autoReadTimerRef.current) clearTimeout(autoReadTimerRef.current)
    }
  }, [isOpen, unreadCount])

  // Mark all as read
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
    } catch (err) {
      console.error('Failed to mark as read:', err)
    } finally {
      setLoading(false)
    }
  }

  // Get icon for notification type
  const getIcon = (type: string) => {
    switch (type) {
      case 'COMMENT_REPLY': return '💬'
      case 'COMMENT_UPVOTE': return '👍'
      case 'COMMENT_UP_POLLINATE': return '🌸'
      case 'IDEA_ADVANCING': return '⬆️'
      case 'IDEA_WON': return '🏆'
      case 'VOTE_NEEDED': return '🗳️'
      case 'DELIBERATION_UPDATE': return '📢'
      case 'FOLLOW': return '👤'
      case 'COMMUNITY_INVITE': return '📨'
      case 'COMMUNITY_NEW_DELIB': return '🆕'
      case 'FOLLOWED_NEW_DELIB': return '📝'
      case 'FOLLOWED_VOTED': return '🗳️'
      default: return '🔔'
    }
  }

  // Get link for notification
  const getLink = (n: Notification) => {
    if (n.type === 'FOLLOW' && n.body) return `/user/${n.body}`
    if (n.deliberationId) return `/chants/${n.deliberationId}`
    return '/chants'
  }

  // Format time ago
  const timeAgo = (dateStr: string) => {
    const now = new Date()
    const date = new Date(dateStr)
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (seconds < 60) return 'now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    return `${Math.floor(seconds / 86400)}d`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => {
          const next = !isOpen
          setIsOpen(next)
          if (next) onOpen?.()
        }}
        className="relative p-2 text-muted-light hover:text-foreground transition-colors"
        aria-label="Notifications"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-error text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="fixed inset-x-0 top-14 mx-4 sm:absolute sm:inset-auto sm:right-0 sm:top-auto sm:mx-0 sm:mt-2 sm:w-80 bg-surface border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex justify-between items-center">
            <span className="font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                className="text-xs text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications list */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted">
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <Link
                  key={n.id}
                  href={getLink(n)}
                  onClick={() => {
                    setIsOpen(false)
                  }}
                  className={`block px-4 py-3 border-b border-border hover:bg-background transition-colors ${
                    !n.read ? 'bg-accent/5' : ''
                  }`}
                >
                  <div className="flex gap-3">
                    <span className="text-lg flex-shrink-0">{getIcon(n.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.read ? 'font-medium text-foreground' : 'text-muted'}`}>
                        {n.title}
                      </p>
                      {n.body && n.type !== 'FOLLOW' && (
                        <p className="text-xs text-muted truncate mt-0.5">{n.body}</p>
                      )}
                      <span className="text-xs text-subtle">{timeAgo(n.createdAt)}</span>
                    </div>
                    {!n.read && (
                      <span className="w-2 h-2 bg-accent rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-border">
              <Link
                href="/notifications"
                onClick={() => setIsOpen(false)}
                className="text-xs text-accent hover:text-accent-hover transition-colors"
              >
                View all notifications →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
