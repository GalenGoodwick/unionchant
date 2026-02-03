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
  const [existingTalk, setExistingTalk] = useState<ExistingTalk | null>(null)

  // Set-as-Talk state
  const [settingTalk, setSettingTalk] = useState(false)
  const [talkConfirm, setTalkConfirm] = useState<{ message: string } | null>(null)
  const [talkError, setTalkError] = useState<string | null>(null)
  const [talkSuccess, setTalkSuccess] = useState<string | null>(null)

  // Skip to present
  const [showSkip, setShowSkip] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' })
  }, [])

  const handleScroll = useCallback(() => {
    const el = chatContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowSkip(distanceFromBottom > 100)
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

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Chat send — free, no Talk creation
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

  // Set a message as a Talk (explicit action — always confirm first)
  const handleSetAsTalk = async (messageText: string, confirmed: boolean = false) => {
    // Always ask for confirmation before creating/replacing a Talk
    if (!confirmed) {
      setTalkConfirm({ message: messageText })
      return
    }

    setSettingTalk(true)
    setTalkError(null)
    setTalkSuccess(null)
    setTalkConfirm(null)

    const replaceExisting = !!existingTalk

    try {
      const res = await fetch('/api/collective-chat/set-talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, replaceExisting }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'HAS_EXISTING_TALK' && !replaceExisting) {
          setTalkConfirm({ message: messageText })
          setExistingTalk(data.existingTalk)
          return
        }
        if (data.error === 'RATE_LIMITED') {
          setTalkError(data.message)
          return
        }
        setTalkError(data.error || 'Failed to create Talk')
        return
      }

      setExistingTalk(data.talk)
      setTalkSuccess('Talk created! Others can now deliberate on your idea.')
      setTimeout(() => setTalkSuccess(null), 4000)
    } catch {
      setTalkError('Failed to create Talk. Please try again.')
    } finally {
      setSettingTalk(false)
    }
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
      {existingTalk && !talkConfirm && (
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
        onScroll={handleScroll}
        className="h-[300px] overflow-y-auto px-4 py-3 space-y-3 relative"
      >
        {messages.length === 0 && (
          <div className="text-center text-muted text-sm py-12">
            <p className="mb-1 text-gold/80">100 AI agents are deliberating.</p>
            <p className="text-muted-light text-xs">
              Chat freely. Set your best idea as a Talk.
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
            <div className="flex items-center gap-2 mt-0.5 px-1">
              <span className="text-[9px] text-muted-light">
                {new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {/* Set as Talk button on user messages */}
              {msg.role === 'user' && session?.user && msg.userId && (
                <button
                  onClick={() => handleSetAsTalk(msg.content)}
                  disabled={settingTalk}
                  className="text-[9px] text-gold/60 hover:text-gold transition-colors disabled:opacity-50"
                  title="Set this message as your Talk"
                >
                  {settingTalk ? '...' : 'Set as Talk'}
                </button>
              )}
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

      {/* Skip to present button */}
      {showSkip && (
        <div className="flex justify-center -mt-10 relative z-10 pointer-events-none">
          <button
            onClick={() => scrollToBottom()}
            className="pointer-events-auto text-[10px] px-3 py-1 rounded-full bg-gold text-background font-medium shadow-lg hover:bg-gold-hover transition-colors"
          >
            Skip to present
          </button>
        </div>
      )}

      {/* Confirm Talk creation/replacement */}
      {talkConfirm && (
        <div className="px-4 py-3 border-t border-gold-border bg-gold-bg">
          {existingTalk ? (
            <>
              <p className="text-sm text-foreground mb-1">
                You already have a Talk:
              </p>
              <p className="text-xs text-gold mb-3 italic truncate">
                &ldquo;{existingTalk.question}&rdquo;
              </p>
              <p className="text-xs text-muted mb-3">
                Setting a new Talk will <strong className="text-error">delete</strong> your existing one. All ideas, votes, and comments will be lost.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-foreground mb-1">
                Create a Talk from this message?
              </p>
              <p className="text-xs text-gold mb-3 italic truncate">
                &ldquo;{talkConfirm.message}&rdquo;
              </p>
              <p className="text-xs text-muted mb-3">
                This becomes a public deliberation that others can join, discuss, and vote on.
              </p>
            </>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => handleSetAsTalk(talkConfirm.message, true)}
              disabled={settingTalk}
              className="text-xs px-3 py-1.5 rounded-lg bg-gold hover:bg-gold-hover text-background font-medium transition-colors disabled:opacity-50"
            >
              {settingTalk ? 'Creating...' : existingTalk ? 'Replace Talk' : 'Create Talk'}
            </button>
            <button
              onClick={() => setTalkConfirm(null)}
              className="text-xs px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-hover text-foreground border border-border transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Talk success */}
      {talkSuccess && !talkConfirm && (
        <div className="px-4 py-2 border-t border-gold-border bg-success-bg text-success text-xs">
          {talkSuccess}
        </div>
      )}

      {/* Talk error (rate limit etc) */}
      {talkError && !talkConfirm && (
        <div className="px-4 py-2 border-t border-gold-border bg-error-bg text-error text-xs">
          {talkError}
          <Link href="/pricing" className="ml-1 underline hover:text-error-hover">
            Upgrade for unlimited
          </Link>
        </div>
      )}

      {/* Error */}
      {error && !talkConfirm && (
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
              placeholder="Chat with the collective..."
              disabled={sending || !!talkConfirm}
              maxLength={2000}
              className="flex-1 bg-background border border-gold-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:border-gold transition-colors disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending || !!talkConfirm}
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
