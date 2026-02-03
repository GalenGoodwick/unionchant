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

export default function CollectiveChat({ onClose }: { onClose?: () => void }) {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subscribeRequired, setSubscribeRequired] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
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

  // Auto-scroll on new messages
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
        body: JSON.stringify({ message: messageText, model: 'haiku' }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'SUBSCRIBE_REQUIRED') {
          setSubscribeRequired(true)
          setInput(messageText) // Restore message
          return
        }
        setError(data.error || 'Failed to send message')
        setInput(messageText)
        return
      }

      // Refetch messages to get the full updated list
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-surface-hover/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground font-sans">
              The Collective
            </h3>
            <p className="text-xs text-muted">
              Chat with the AI deliberation
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 font-mono">
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

      {/* Messages */}
      <div
        ref={chatContainerRef}
        className="h-[340px] overflow-y-auto px-4 py-3 space-y-3"
      >
        {messages.length === 0 && (
          <div className="text-center text-muted text-sm py-12">
            <p className="mb-1">100 AI agents are deliberating.</p>
            <p className="text-muted-light text-xs">
              Ask them what they&apos;re thinking.
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
                  ? 'bg-accent/10 border border-accent/20 text-foreground'
                  : 'bg-surface-hover text-foreground'
              }`}
            >
              {msg.role === 'user' && (
                <div className="text-[10px] text-muted mb-0.5 font-mono">
                  {msg.userName || 'Anonymous'}
                </div>
              )}
              {msg.role === 'assistant' && (
                <div className="text-[10px] text-accent mb-0.5 font-mono">
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
            <div className="bg-accent/10 border border-accent/20 rounded-lg px-3 py-2 text-sm text-muted">
              <div className="text-[10px] text-accent mb-0.5 font-mono">Collective</div>
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Subscribe gate */}
      {subscribeRequired && (
        <div className="px-4 py-3 border-t border-border bg-warning-bg">
          <p className="text-sm text-foreground mb-2">
            Subscribe to email notifications to chat with the collective. You can unsubscribe anytime in settings.
          </p>
          <button
            onClick={handleSubscribe}
            disabled={subscribing}
            className="text-sm px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors disabled:opacity-50"
          >
            {subscribing ? 'Subscribing...' : 'Subscribe & Chat'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && !subscribeRequired && (
        <div className="px-4 py-2 border-t border-error-border bg-error-bg text-error text-xs">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
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
                  : 'Ask the collective...'
              }
              disabled={sending}
              maxLength={2000}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        ) : (
          <Link
            href="/auth/signup"
            className="block text-center text-sm text-accent hover:text-accent-hover transition-colors"
          >
            Sign in to chat with the collective
          </Link>
        )}
      </div>
    </div>
  )
}
