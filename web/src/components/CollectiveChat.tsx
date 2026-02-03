'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  userName: string | null
  userId: string | null
  model: string
  createdAt: string
}

interface ExistingTalk {
  id: string
  question: string
}

export default function CollectiveChat({ onClose }: { onClose?: () => void }) {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subscribeRequired, setSubscribeRequired] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [existingTalk, setExistingTalk] = useState<ExistingTalk | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [rateLimited, setRateLimited] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Poll for messages every 10 seconds
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await fetch('/api/collective-chat')
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages)
          if (data.existingTalk) {
            setExistingTalk(data.existingTalk)
          }
        }
      } catch {
        // Silently fail polling
      }
    }

    fetchMessages()
    const interval = setInterval(fetchMessages, 10000)
    return () => clearInterval(interval)
  }, [])

  // Check subscription status
  useEffect(() => {
    if (!session?.user?.email) {
      setSubscribed(null)
      return
    }

    const checkSubscription = async () => {
      try {
        const res = await fetch('/api/user/me')
        if (res.ok) {
          const data = await res.json()
          setSubscribed(data.user.emailNotifications)
        }
      } catch {
        // Silently fail
      }
    }

    checkSubscription()
  }, [session?.user?.email])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleSubscribe = async () => {
    setSubscribing(true)
    try {
      const res = await fetch('/api/user/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailNotifications: true }),
      })
      if (res.ok) {
        setSubscribed(true)
        setSubscribeRequired(false)
        setError(null)
      }
    } catch {
      setError('Failed to subscribe. Please try again.')
    } finally {
      setSubscribing(false)
    }
  }

  const sendMessage = async (messageText: string, replaceExisting: boolean = false) => {
    setSending(true)
    setError(null)
    setRateLimited(null)
    setConfirmReplace(false)
    setPendingMessage(null)

    try {
      const res = await fetch('/api/collective-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, model: 'haiku', replaceExisting }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'SUBSCRIBE_REQUIRED') {
          setSubscribeRequired(true)
          setInput(messageText)
          return
        }
        if (data.error === 'HAS_EXISTING_TALK') {
          setExistingTalk(data.existingTalk)
          setPendingMessage(messageText)
          setConfirmReplace(true)
          return
        }
        if (data.error === 'RATE_LIMITED') {
          setRateLimited(data.message)
          setInput(messageText)
          return
        }
        setError(data.error || 'Failed to send message')
        setInput(messageText)
        return
      }

      // Update existing talk reference
      if (data.talkCreated) {
        setExistingTalk(data.talkCreated)
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

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const messageText = input.trim()
    setInput('')
    await sendMessage(messageText)
  }

  const handleConfirmReplace = async () => {
    if (!pendingMessage) return
    await sendMessage(pendingMessage, true)
  }

  const handleCancelReplace = () => {
    setConfirmReplace(false)
    if (pendingMessage) {
      setInput(pendingMessage)
    }
    setPendingMessage(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="rounded-xl border border-gold-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gold-border bg-gold-bg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gold font-sans">
              The Collective
            </h3>
            <p className="text-xs text-muted">
              Ask it to create a Talk for you or simply chat with it &mdash; your own facilitated conversation.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold-bg text-gold border border-gold-border font-mono">
              Haiku
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-muted-light border border-border font-mono cursor-not-allowed" title="Coming soon">
              Sonnet
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-muted-light border border-border font-mono cursor-not-allowed" title="Coming soon">
              Opus
            </span>
            {onClose && (
              <button
                onClick={onClose}
                className="ml-1 p-0.5 text-muted hover:text-foreground transition-colors"
                aria-label="Close chat"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Your active Talk */}
      {existingTalk && !confirmReplace && (
        <div className="px-4 py-2 border-b border-gold-border bg-gold-bg">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gold-muted font-mono uppercase">Your Talk</span>
            <Link
              href={`/talks/${existingTalk.id}`}
              className="flex-1 text-xs text-gold hover:text-gold-hover truncate transition-colors"
            >
              {existingTalk.question}
            </Link>
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={chatContainerRef}
        className="h-[300px] overflow-y-auto px-4 py-3 space-y-3"
      >
        {messages.length === 0 && (
          <div className="text-center text-muted text-sm py-12">
            <p className="mb-1 text-gold/80">100 AI agents are deliberating.</p>
            <p className="text-muted-light text-xs">
              Your message becomes a Talk that others can join.
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
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
            <div className="text-[9px] text-muted-light mt-0.5 px-1">
              {new Date(msg.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex items-start">
            <div className="bg-gold-bg border border-gold-border rounded-lg px-3 py-2 text-sm text-muted">
              <div className="text-[10px] text-gold mb-0.5 font-mono">Collective</div>
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Confirm replacement dialog */}
      {confirmReplace && existingTalk && (
        <div className="px-4 py-3 border-t border-gold-border bg-gold-bg">
          <p className="text-sm text-foreground mb-1">
            You already have a Talk:
          </p>
          <p className="text-xs text-gold mb-3 italic truncate">
            &ldquo;{existingTalk.question}&rdquo;
          </p>
          <p className="text-xs text-muted mb-3">
            Sending this message will <strong className="text-error">delete</strong> your existing Talk and create a new one. All ideas, votes, and comments on it will be lost.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirmReplace}
              disabled={sending}
              className="text-xs px-3 py-1.5 rounded-lg bg-gold hover:bg-gold-hover text-background font-medium transition-colors disabled:opacity-50"
            >
              {sending ? 'Replacing...' : 'Replace Talk'}
            </button>
            <button
              onClick={handleCancelReplace}
              className="text-xs px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-hover text-foreground border border-border transition-colors"
            >
              Keep existing
            </button>
          </div>
        </div>
      )}

      {/* Rate limit notice */}
      {rateLimited && !confirmReplace && (
        <div className="px-4 py-2 border-t border-gold-border bg-error-bg">
          <p className="text-xs text-error mb-1">{rateLimited}</p>
          <Link href="/pricing" className="text-xs text-gold hover:text-gold-hover underline">
            Upgrade to Pro for unlimited changes
          </Link>
        </div>
      )}

      {/* Subscribe gate */}
      {subscribeRequired && !confirmReplace && (
        <div className="px-4 py-3 border-t border-gold-border bg-gold-bg">
          <p className="text-sm text-foreground mb-2">
            Subscribe to email notifications to chat with the collective. You can unsubscribe anytime.
          </p>
          <button
            onClick={handleSubscribe}
            disabled={subscribing}
            className="text-sm px-4 py-1.5 rounded-lg bg-gold hover:bg-gold-hover text-background font-medium transition-colors disabled:opacity-50"
          >
            {subscribing ? 'Subscribing...' : 'Subscribe & Chat'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && !subscribeRequired && !confirmReplace && !rateLimited && (
        <div className="px-4 py-2 border-t border-error-border bg-error-bg text-error text-xs">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-gold-border">
        {session ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                subscribed === false
                  ? 'Subscribe to notifications to chat...'
                  : existingTalk
                    ? 'New message replaces your Talk...'
                    : 'Your message becomes a Talk...'
              }
              disabled={sending || confirmReplace}
              maxLength={2000}
              className="flex-1 bg-background border border-gold-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:border-gold transition-colors disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending || confirmReplace}
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
    </div>
  )
}
