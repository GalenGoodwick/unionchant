'use client'

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import CaptchaModal from '@/components/CaptchaModal'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  userName: string | null
  userId: string | null
  model: string
  createdAt: string
}

// Parse [action:navigate:/path]Label[/action] tags + bare /talks/ID links
function parseMessageContent(content: string): ReactNode[] {
  const parts: ReactNode[] = []
  // Match both action tags and bare /talks/ links
  const regex = /\[action:navigate:(\/[^\]]+)\]([^\[]+)\[\/action\]|(\/talks\/[a-zA-Z0-9_-]+)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(content)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }

    if (match[1] && match[2]) {
      // Action tag: [action:navigate:/path]Label[/action]
      parts.push(
        <ActionButton key={`action-${match.index}`} path={match[1]} label={match[2]} />
      )
    } else if (match[3]) {
      // Bare /talks/ID link
      parts.push(
        <ActionButton key={`link-${match.index}`} path={match[3]} label={match[3]} />
      )
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [content]
}

function ActionButton({ path, label }: { path: string; label: string }) {
  const router = useRouter()
  return (
    <button
      onClick={() => router.push(path)}
      className="inline-flex items-center gap-1 px-2 py-0.5 my-0.5 rounded bg-gold/15 text-gold hover:bg-gold/25 text-xs font-medium border border-gold-border transition-colors"
    >
      {label} &rarr;
    </button>
  )
}

export default function CollectiveChat({ onClose }: { onClose?: () => void }) {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [captchaOpen, setCaptchaOpen] = useState(false)
  const [captchaStrike, setCaptchaStrike] = useState(1)
  const [pendingMessage, setPendingMessage] = useState('')
  const [mutedUntil, setMutedUntil] = useState<number | null>(null)
  const [dailyLimitHit, setDailyLimitHit] = useState(false)

  // Skip to present
  const [showSkip, setShowSkip] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback((smooth = true) => {
    const container = chatContainerRef.current
    if (!container) return
    if (smooth) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    } else {
      container.scrollTop = container.scrollHeight
    }
  }, [])

  const handleScroll = useCallback(() => {
    const el = chatContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowSkip(distanceFromBottom > 100)
  }, [])

  // Fetch messages once on mount, scroll to bottom when loaded
  const initialScrollDone = useRef(false)
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await fetch('/api/collective-chat')
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages)
          setHasMore(!!data.hasMore)
          // Scroll to bottom after messages render
          requestAnimationFrame(() => {
            scrollToBottom(false)
            initialScrollDone.current = true
          })
        }
      } catch {
        // Silently fail
      }
    }

    fetchMessages()
  }, [scrollToBottom])

  // Only auto-scroll if user is already near the bottom
  const isNearBottomRef = useRef(true)
  useEffect(() => {
    const el = chatContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distanceFromBottom < 100
  })
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom()
    }
  }, [messages, scrollToBottom])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const messageText = input.trim()
    setInput('')
    setSending(true)
    setError(null)

    try {
      const res = await fetch('/api/collective-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'CAPTCHA_REQUIRED') {
          setCaptchaStrike(data.strike || 1)
          setPendingMessage(messageText)
          setCaptchaOpen(true)
          return
        }
        if (data.error === 'MUTED') {
          setMutedUntil(data.mutedUntil)
          setCaptchaOpen(true)
          return
        }
        if (data.error === 'DAILY_LIMIT') {
          setDailyLimitHit(true)
          setInput(messageText)
          return
        }
        setError(data.error || 'Failed to send message')
        setInput(messageText)
        return
      }

      // Refetch messages
      const messagesRes = await fetch('/api/collective-chat')
      if (messagesRes.ok) {
        const messagesData = await messagesRes.json()
        setMessages(messagesData.messages)
      }
    } catch {
      setError('Failed to send message. Please try again.')
      setInput(messageText)
    } finally {
      setSending(false)
    }
  }

  const loadOlderMessages = async () => {
    if (!messages.length || loadingMore) return
    setLoadingMore(true)
    try {
      const oldest = messages[0].createdAt
      const res = await fetch(`/api/collective-chat?before=${oldest}`)
      if (res.ok) {
        const data = await res.json()
        if (data.messages.length > 0) {
          setMessages(prev => [...data.messages, ...prev])
        }
        setHasMore(!!data.hasMore)
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingMore(false)
    }
  }

  const handleCaptchaVerify = async (token: string) => {
    setCaptchaOpen(false)
    if (!pendingMessage.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/collective-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: pendingMessage, captchaToken: token }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to send message')
        setInput(pendingMessage)
      } else {
        setPendingMessage('')
        const messagesRes = await fetch('/api/collective-chat')
        if (messagesRes.ok) {
          const messagesData = await messagesRes.json()
          setMessages(messagesData.messages)
        }
      }
    } catch {
      setError('Failed to send message. Please try again.')
      setInput(pendingMessage)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={`rounded-xl border border-gold-border bg-surface overflow-hidden ${onClose ? 'flex flex-col h-full md:h-auto' : ''}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gold-border bg-gold-bg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gold font-sans">
              The Collective
            </h3>
            <p className="text-xs text-muted">
              Your personal AI guide to Union Chant.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {onClose && (
              <button
                onClick={onClose}
                className="ml-1 p-2.5 rounded-lg text-gold hover:text-foreground hover:bg-gold/10 transition-colors"
                aria-label="Close chat"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className={`overflow-y-auto px-4 py-3 space-y-3 relative ${onClose ? 'flex-1 min-h-0' : 'h-[300px]'}`}
      >
        {hasMore && (
          <div className="text-center pb-2">
            <button
              onClick={loadOlderMessages}
              disabled={loadingMore}
              className="text-[11px] px-3 py-1.5 rounded-full bg-surface-hover text-muted hover:text-foreground border border-border transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}
        {messages.length === 0 && (
          <div className="text-center text-muted text-sm py-12">
            <p className="mb-1 text-gold/80">The Collective</p>
            <p className="text-muted-light text-xs">
              Ask about talks, get voting reminders, or explore the platform.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === 'assistant' ? 'items-start' : 'items-end'
            }`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'assistant'
                  ? 'bg-gold-bg border border-gold-border text-foreground'
                  : 'bg-surface-hover border border-border text-foreground'
              }`}
            >
              {msg.role === 'user' && (
                <div className="text-[10px] text-muted mb-0.5 font-mono">
                  {msg.userName || 'Anonymous'}
                </div>
              )}
              {msg.role === 'assistant' && (
                <div className="text-[10px] text-gold mb-0.5 font-mono">
                  Collective
                </div>
              )}
              <div className="whitespace-pre-wrap leading-relaxed">
                {parseMessageContent(msg.content)}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-0.5 px-1">
              <span className="text-[9px] text-muted-light">
                {new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex items-start">
            <div className="bg-gold-bg border border-gold-border rounded-lg px-3 py-2 text-sm text-muted">
              <div className="text-[10px] text-gold mb-0.5 font-mono">Guide</div>
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Skip to present button */}
      {showSkip && (
        <div className="flex justify-center -mt-10 relative z-10 pointer-events-none">
          <button
            onClick={() => scrollToBottom()}
            className="pointer-events-auto text-[11px] px-3 py-1.5 rounded-full bg-gold text-background font-medium shadow-lg hover:bg-gold-hover transition-colors"
          >
            Skip to present
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 border-t border-error-border bg-error-bg text-error text-xs">
          {error}
        </div>
      )}

      {/* Daily limit banner */}
      {dailyLimitHit && (
        <div className="px-4 py-3 border-t border-gold-border bg-gold-bg">
          <p className="text-sm text-foreground mb-1.5">You&apos;ve reached your daily message limit.</p>
          <p className="text-xs text-muted mb-2">Free accounts get 5 messages per day. Upgrade to Pro for unlimited access.</p>
          <Link
            href="/pricing"
            className="inline-block px-3 py-1.5 bg-gold hover:bg-gold-hover text-background text-xs font-medium rounded-lg transition-colors"
          >
            Upgrade to Pro
          </Link>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-gold-border">
        {session ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => { setInput(e.target.value); setDailyLimitHit(false) }}
              onKeyDown={handleKeyDown}
              placeholder={dailyLimitHit ? 'Daily limit reached — upgrade for more' : 'Ask anything...'}
              disabled={sending || dailyLimitHit}
              maxLength={2000}
              aria-label="Chat message"
              className="flex-1 bg-background border border-gold-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:border-gold transition-colors disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending || dailyLimitHit}
              aria-label="Send message"
              className="px-4 py-2 bg-gold hover:bg-gold-hover text-background text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        ) : (
          <Link
            href="/auth/signup"
            className="block text-center text-sm text-gold hover:text-gold-hover transition-colors"
          >
            Sign in to chat with the collective
          </Link>
        )}
      </div>

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
