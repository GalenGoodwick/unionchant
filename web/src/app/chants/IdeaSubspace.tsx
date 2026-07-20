'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface SubspaceComment {
  id: string
  text: string
  ideaId: string | null
  createdAt: string
  upvoteCount: number
  userHasUpvoted: boolean
  user: { id: string; name: string | null; image: string | null }
}

interface PresencePlayer {
  id: string
  name: string
  color: string
  rx?: number
  ry?: number
  isSelf?: boolean
}

interface IdeaSubspaceProps {
  ideaId: string
  deliberationId: string
  ideaText?: string
  ideaAuthor?: string
  onClose: () => void
  onNavigateToSubspace: (ideaId: string) => void
  bookmarks: string[]
  xp?: number
  onXpChange?: (value: number) => void
  flashDocks?: boolean
  players?: PresencePlayer[]
  onMovePosition?: (rx: number, ry: number)  => void
  /** Override API endpoint for comments (GET returns {comments}, POST accepts {text}) */
  commentEndpoint?: string
  /** Accent color override for input focus (default: cyan) */
  accentColor?: string
}

const POLL_INTERVAL = 10_000

// Stable color from user name
function nameColor(name: string): string {
  const colors = ['#f97316', '#34d399', '#a78bfa', '#38bdf8', '#fbbf24', '#f472b6', '#22c55e', '#6366f1', '#ef4444', '#0ea5e9']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  return colors[Math.abs(hash) % colors.length]
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

export default function IdeaSubspace({
  ideaId,
  deliberationId,
  ideaText,
  ideaAuthor,
  onClose,
  onNavigateToSubspace,
  bookmarks,
  xp = 0,
  onXpChange,
  flashDocks,
  players = [],
  onMovePosition,
  commentEndpoint,
  accentColor,
}: IdeaSubspaceProps) {
  const [comments, setComments] = useState<SubspaceComment[]>([])
  const [loading, setLoading] = useState(true)
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [upvoting, setUpvoting] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isInitialLoad = useRef(true)
  const mountedRef = useRef(true)

  const fetchComments = useCallback(async () => {
    try {
      const url = commentEndpoint || `/api/deliberations/${deliberationId}/flat-comments`
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      if (!mountedRef.current) return
      if (commentEndpoint) {
        // Custom endpoint — accept both {comments} and {messages} keys
        setComments(data.comments || data.messages || [])
      } else {
        // Filter to this idea's comments
        const filtered = (data.comments || []).filter(
          (c: SubspaceComment) => c.ideaId === ideaId
        )
        setComments(filtered)
      }
    } catch {
      // silent
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [deliberationId, ideaId, commentEndpoint])

  // Fetch on mount / ideaId change
  useEffect(() => {
    mountedRef.current = true
    isInitialLoad.current = true
    setLoading(true)
    setComments([])
    setChatInput('')
    fetchComments()
    return () => { mountedRef.current = false }
  }, [fetchComments])

  // Poll for new comments
  useEffect(() => {
    const timer = setInterval(fetchComments, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [fetchComments])

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: isInitialLoad.current ? 'instant' : 'smooth' })
    isInitialLoad.current = false
  }, [comments])

  const handleSend = useCallback(async () => {
    const text = chatInput.trim()
    if (!text || sending) return
    setSending(true)
    setSendError(null)
    try {
      const url = commentEndpoint || `/api/deliberations/${deliberationId}/flat-comments`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commentEndpoint ? { text } : { text, ideaId }),
      })
      if (res.ok) {
        const newComment = await res.json()
        setComments(prev => [...prev, newComment])
        setChatInput('')
        inputRef.current?.focus()
      } else {
        const data = await res.json().catch(() => ({}))
        setSendError(data.error || 'Failed to send message')
      }
    } catch {
      setSendError('Network error')
    } finally {
      setSending(false)
    }
  }, [chatInput, sending, deliberationId, ideaId, commentEndpoint])

  const handleUpvote = useCallback(async (commentId: string) => {
    if (upvoting) return
    setUpvoting(commentId)
    try {
      const res = await fetch(`/api/comments/${commentId}/upvote`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setComments(prev => prev.map(c =>
          c.id === commentId
            ? {
                ...c,
                userHasUpvoted: data.upvoted,
                upvoteCount: data.upvoted ? c.upvoteCount + 1 : Math.max(0, c.upvoteCount - 1),
              }
            : c
        ))
      }
    } catch {
      // silent
    } finally {
      setUpvoting(null)
    }
  }, [upvoting])

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="text-muted-light text-sm font-mono animate-pulse">Loading subspace...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* XP STARS -- only in voting phase */}
      {onXpChange && (
        <div className="px-3 py-2 border-y border-border/20 shrink-0">
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1 flex-1">
              {Array.from({ length: 10 }, (_, i) => (
                <div
                  key={i}
                  onClick={() => onXpChange(xp === i + 1 ? 0 : i + 1)}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all duration-200 ${i < xp ? 'border-accent bg-accent/20 shadow-[0_0_8px_rgba(34,211,238,0.4)]' : 'border-border/30 bg-transparent hover:border-muted-light/50'} ${flashDocks ? 'animate-flash-gold' : ''}`}
                >
                  <svg className={`w-2.5 h-2.5 transition-colors ${i < xp ? 'fill-accent' : 'fill-muted-light/20'}`} viewBox="0 0 24 24">
                    <path d="M4 4l7.07 17 2.51-7.39L21 11.07z" />
                  </svg>
                </div>
              ))}
            </div>
            <span className={`text-xl font-mono font-bold ${xp > 0 ? 'text-accent' : 'text-muted-light/20'}`}>{xp}</span>
          </div>
        </div>
      )}

      {/* CHAT AREA — scrollable messages */}
      <div className="relative flex-1 overflow-hidden">
        {/* Scrollable chat messages */}
        <div className="absolute inset-0 overflow-y-auto px-3 py-3 space-y-3 z-0">
          {comments.length === 0 && !loading && (
            <div className="text-center py-8 text-muted-light/50 text-sm font-mono">
              No messages yet. Start the conversation.
            </div>
          )}
          {comments.map(comment => {
            const authorName = comment.user?.name || 'Anonymous'
            const color = nameColor(authorName)
            return (
              <div key={comment.id} data-chat-msg>
                <div className="flex items-baseline gap-1.5 mb-0.5">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 translate-y-[-1px]" style={{ backgroundColor: color }} />
                  <span className="text-xs font-mono font-bold" style={{ color }}>{authorName}</span>
                  <span className="text-[9px] text-muted-light/30">{relativeTime(comment.createdAt)}</span>
                </div>
                <div className="pl-3 flex items-start gap-2">
                  <div className="text-sm text-foreground/80 leading-relaxed flex-1">{comment.text}</div>
                  <button
                    onClick={() => handleUpvote(comment.id)}
                    disabled={upvoting === comment.id}
                    data-interactive
                    className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors text-[11px] font-mono ${
                      comment.userHasUpvoted
                        ? 'text-accent bg-accent/10'
                        : 'text-muted-light/60 hover:text-foreground/80 hover:bg-surface'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={comment.userHasUpvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                    <span>{comment.upvoteCount}</span>
                  </button>
                </div>
              </div>
            )
          })}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* MESSAGE INPUT — spans full viewport width */}
      <div className="shrink-0 bg-header border-t border-border/30 px-3 py-2" style={{ marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)', paddingLeft: 'max(0.75rem, calc(50vw - 336px))', paddingRight: 'max(0.75rem, calc(50vw - 336px))' }}>
        {sendError && (
          <div className="text-error text-xs font-mono mb-1 px-1">{sendError}</div>
        )}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
            placeholder="Message this subspace..."
            autoFocus
            disabled={sending}
            className={`flex-1 bg-surface border-2 border-border/30 rounded px-3 py-2.5 text-sm text-foreground placeholder:text-muted-light/40 outline-none transition-all disabled:opacity-50 ${!accentColor ? 'focus:border-[#f59e0b] focus:shadow-[0_0_12px_rgba(245,158,11,0.2)] focus:placeholder:text-[#f59e0b]/40' : ''}`}
            style={accentColor ? { '--focus-color': accentColor } as React.CSSProperties : undefined}
            onFocus={accentColor ? (e) => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.boxShadow = `0 0 12px ${accentColor}33` } : undefined}
            onBlur={accentColor ? (e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = '' } : undefined}
          />
          <button
            onClick={handleSend}
            disabled={!chatInput.trim() || sending}
            data-interactive
            className={accentColor ? "px-3 py-2.5 rounded text-sm font-mono disabled:opacity-30 disabled:cursor-not-allowed transition-colors" : "px-3 py-2.5 rounded bg-accent/20 border border-accent/40 text-accent text-sm font-mono hover:bg-accent/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"}
            style={accentColor ? { backgroundColor: `${accentColor}33`, border: `1px solid ${accentColor}66`, color: accentColor } : undefined}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
