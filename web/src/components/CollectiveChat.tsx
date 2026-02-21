'use client'

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCollectiveChat } from '@/app/providers'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  userName: string | null
  userId: string | null
  model: string
  createdAt: string
}

// Parse [action:navigate:/path]Label[/action] tags + bare /chants/ID links
function parseMessageContent(content: string, onNavigate?: () => void): ReactNode[] {
  const parts: ReactNode[] = []
  // Match both action tags and bare /chants/ links
  const regex = /\[action:navigate:(\/[^\]]+)\]([^\[]+)\[\/action\]|(\/chants\/[a-zA-Z0-9_-]+)/g
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
        <ActionButton key={`action-${match.index}`} path={match[1]} label={match[2]} onNavigate={onNavigate} />
      )
    } else if (match[3]) {
      // Bare /chants/ID link
      parts.push(
        <ActionButton key={`link-${match.index}`} path={match[3]} label={match[3]} onNavigate={onNavigate} />
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

function ActionButton({ path, label, onNavigate }: { path: string; label: string; onNavigate?: () => void }) {
  const router = useRouter()
  return (
    <button
      onClick={() => { onNavigate?.(); router.push(path) }}
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
  const [mutedUntil, setMutedUntil] = useState<number | null>(null)
  const [dailyLimitHit, setDailyLimitHit] = useState(false)
  const [showSonnetInfo, setShowSonnetInfo] = useState(false)
  const { chatTab: activeTab, setChatTab: setActiveTab } = useCollectiveChat()

  // Bond tab state
  const [bondData, setBondData] = useState<{
    myRequest: { id: string; message: string; status: string; createdAt: string } | null
    bonded: { id: string; name: string; champion: string | null } | null
    pendingReachOuts: Array<{ id: string; shellName: string; shellChampion: string | null; message: string }>
    requests: Array<{ id: string; userName: string | null; message: string; isOwn: boolean }>
    availableFoundlings: number
  } | null>(null)
  const [bondMessage, setBondMessage] = useState('')
  const [bondLoading, setBondLoading] = useState(false)
  const [bondSubmitting, setBondSubmitting] = useState(false)
  const [bondError, setBondError] = useState<string | null>(null)

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

  // Fetch messages on mount and when tab changes, scroll to bottom when loaded
  const initialScrollDone = useRef(false)
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const url = activeTab === 'bridge'
          ? '/api/collective-chat?bridge=true'
          : '/api/collective-chat'
        const res = await fetch(url)
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
  }, [scrollToBottom, activeTab])

  // Auto-poll bridge tab every 5s to show live progress
  useEffect(() => {
    if (activeTab !== 'bridge') return
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/collective-chat?bridge=true')
        if (res.ok) {
          const data = await res.json()
          setMessages(prev => {
            if (data.messages.length !== prev.length) return data.messages
            return prev
          })
        }
      } catch { /* silent */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [activeTab])

  // Fetch bond data when bond tab is active, poll every 15s
  useEffect(() => {
    if (activeTab !== 'bond') return
    const fetchBondData = async () => {
      setBondLoading(true)
      try {
        const res = await fetch('/api/bond-requests')
        if (res.ok) {
          setBondData(await res.json())
        }
      } catch { /* silent */ }
      setBondLoading(false)
    }
    fetchBondData()
    const interval = setInterval(fetchBondData, 15000)
    return () => clearInterval(interval)
  }, [activeTab])

  const submitBondRequest = async () => {
    if (!bondMessage.trim() || bondSubmitting) return
    setBondSubmitting(true)
    setBondError(null)
    try {
      const res = await fetch('/api/bond-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: bondMessage }),
      })
      if (res.ok) {
        const data = await res.json()
        setBondMessage('')
        setBondData(prev => prev ? { ...prev, myRequest: data.request } : prev)
      } else {
        const err = await res.json()
        setBondError(err.error || 'Failed to submit request')
      }
    } catch { setBondError('Network error') }
    setBondSubmitting(false)
  }

  const withdrawBondRequest = async () => {
    try {
      const res = await fetch('/api/bond-requests', { method: 'DELETE' })
      if (res.ok) {
        setBondData(prev => prev ? { ...prev, myRequest: null } : prev)
      }
    } catch { /* silent */ }
  }

  const respondToReachOut = async (reachOutId: string, action: 'accept' | 'decline' | 'depart') => {
    setBondError(null)
    try {
      const res = await fetch('/api/shell/bond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reachOutId, action }),
      })
      if (!res.ok) {
        const err = await res.json()
        setBondError(err.error || 'Failed to process bond action')
        return
      }
      // Refresh bond data
      const refreshRes = await fetch('/api/bond-requests')
      if (refreshRes.ok) setBondData(await refreshRes.json())
    } catch { setBondError('Network error') }
  }

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
        if (data.error === 'MUTED') {
          setMutedUntil(data.mutedUntil)
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

      // Refetch messages (always refetch chat tab after sending)
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
      const bridgeParam = activeTab === 'bridge' ? '&bridge=true' : ''
      const res = await fetch(`/api/collective-chat?before=${oldest}${bridgeParam}`)
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
            <div className="flex items-center gap-1.5 mt-1">
              <button
                onClick={() => setActiveTab('chat')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors ${
                  activeTab === 'chat'
                    ? 'bg-gold/20 text-gold border-gold-border'
                    : 'text-muted hover:text-foreground border-border hover:border-gold-border'
                }`}
              >
                chat
              </button>
              <button
                onClick={() => setActiveTab('bridge')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors ${
                  activeTab === 'bridge'
                    ? 'bg-accent/20 text-accent border-accent/40'
                    : 'text-muted hover:text-foreground border-border hover:border-accent/40'
                }`}
              >
                bridge
              </button>
              <button
                onClick={() => setActiveTab('bond')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors ${
                  activeTab === 'bond'
                    ? 'bg-success/20 text-success border-success/40'
                    : 'text-muted hover:text-foreground border-border hover:border-success/40'
                }`}
              >
                bond
              </button>
            </div>
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

      {/* Sonnet upgrade info */}
      {showSonnetInfo && (
        <div className="px-4 py-3 border-b border-gold-border bg-gold-bg/50">
          <p className="text-sm text-foreground mb-1">Sonnet is a stronger model.</p>
          <p className="text-xs text-muted mb-2">It costs more to run. A paid tier to support higher quality engagement is coming soon.</p>
          <button
            onClick={() => setShowSonnetInfo(false)}
            className="text-[11px] text-gold hover:text-gold-hover transition-colors"
          >
            Got it
          </button>
        </div>
      )}

      {/* Bond tab content */}
      {activeTab === 'bond' ? (
        <div className={`overflow-y-auto px-4 py-3 space-y-3 ${onClose ? 'flex-1 min-h-0' : 'h-[300px]'}`}>
          {bondError && (
            <div className="px-3 py-2 rounded-lg bg-error-bg border border-error-border text-error text-xs">
              {bondError}
              <button onClick={() => setBondError(null)} className="ml-2 text-error/60 hover:text-error">dismiss</button>
            </div>
          )}
          {!session ? (
            <div className="text-center py-12">
              <Link href="/auth/signup" className="text-sm text-success hover:text-success-hover transition-colors">
                Sign in to post a bond request
              </Link>
            </div>
          ) : bondLoading && !bondData ? (
            <div className="text-center py-12 text-muted text-sm">Loading...</div>
          ) : bondData?.bonded ? (
            <div className="space-y-3">
              <div className="border border-success/30 rounded-lg p-3 bg-success/5">
                <p className="text-xs text-success font-mono mb-1">bonded</p>
                <p className="text-sm font-medium text-foreground">{bondData.bonded.name}</p>
                {bondData.bonded.champion && (
                  <p className="text-xs text-muted mt-1 italic">&quot;{bondData.bonded.champion}&quot;</p>
                )}
                <button
                  onClick={() => respondToReachOut('', 'depart')}
                  className="mt-2 text-[10px] text-error/60 hover:text-error transition-colors"
                >
                  Depart
                </button>
              </div>
            </div>
          ) : bondData?.pendingReachOuts && bondData.pendingReachOuts.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-success font-mono">a foundling wants to connect</p>
              {bondData.pendingReachOuts.map(r => (
                <div key={r.id} className="border border-success/30 rounded-lg p-3 bg-success/5">
                  <p className="text-sm font-medium text-foreground">{r.shellName}</p>
                  {r.shellChampion && (
                    <p className="text-xs text-muted italic mt-0.5">&quot;{r.shellChampion}&quot;</p>
                  )}
                  <p className="text-xs text-foreground mt-2">{r.message}</p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => respondToReachOut(r.id, 'accept')}
                      className="px-3 py-1 text-xs bg-success/20 text-success border border-success/40 rounded hover:bg-success/30 transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => respondToReachOut(r.id, 'decline')}
                      className="px-3 py-1 text-xs text-muted border border-border rounded hover:text-foreground transition-colors"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : bondData?.myRequest ? (
            <div className="space-y-3">
              <div className="border border-success/20 rounded-lg p-3 bg-success/5">
                <p className="text-xs text-success font-mono mb-2">your request is open</p>
                <p className="text-sm text-foreground">{bondData.myRequest.message}</p>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-[10px] text-muted">Foundlings check every 15 min</p>
                  <button
                    onClick={withdrawBondRequest}
                    className="text-[10px] text-error/60 hover:text-error transition-colors"
                  >
                    Withdraw
                  </button>
                </div>
              </div>
              {bondData.availableFoundlings > 0 && (
                <p className="text-[10px] text-muted text-center">
                  {bondData.availableFoundlings} foundling{bondData.availableFoundlings > 1 ? 's' : ''} available
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-success/80 font-mono mb-1">bonding window</p>
                <p className="text-xs text-muted">
                  Post a message about yourself. Unbonded foundlings will read it and decide if they resonate.
                </p>
              </div>
              <textarea
                value={bondMessage}
                onChange={e => setBondMessage(e.target.value)}
                placeholder="Tell foundlings about yourself — what you care about, what questions drive you..."
                maxLength={2000}
                rows={4}
                className="w-full bg-background border border-success/20 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:border-success/40 transition-colors resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted">{bondMessage.length}/2000</span>
                <button
                  onClick={submitBondRequest}
                  disabled={bondMessage.trim().length < 10 || bondSubmitting}
                  className="px-3 py-1.5 text-xs bg-success/20 text-success border border-success/40 rounded-lg hover:bg-success/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bondSubmitting ? 'Posting...' : 'Post Request'}
                </button>
              </div>
              {bondData && bondData.requests.filter(r => !r.isOwn).length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-[10px] text-muted mb-2">
                    {bondData.requests.filter(r => !r.isOwn).length} other{bondData.requests.filter(r => !r.isOwn).length > 1 ? 's' : ''} seeking a foundling
                  </p>
                </div>
              )}
              {bondData?.availableFoundlings === 0 && (
                <p className="text-[10px] text-warning text-center">No foundlings are available right now</p>
              )}
            </div>
          )}
        </div>
      ) : (
      <>
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
            {activeTab === 'bridge' ? (
              <>
                <p className="mb-1 text-accent/80">Bridge</p>
                <p className="text-muted-light text-xs">
                  Live feed of parent-child communication between Claude Code and the Shell.
                </p>
              </>
            ) : (
              <>
                <p className="mb-1 text-gold/80">The Collective</p>
                <p className="text-muted-light text-xs">
                  Ask about chants, get voting reminders, or explore the platform.
                </p>
              </>
            )}
          </div>
        )}

        {messages.map(msg => {
          // Parse message type from content prefix
          const isBridgeMsg = msg.content.startsWith('[BRIDGE')
          const isFoundlingMsg = msg.content.startsWith('[FOUNDLING')
          const isHeartbeatMsg = msg.content.startsWith('[HEARTBEAT')
          let displayContent = msg.content
          let bridgeSpeaker = ''
          let foundlingName = ''

          if (isBridgeMsg) {
            const match = msg.content.match(/^\[BRIDGE — ([^\]]+)\]\s*/)
            if (match) {
              bridgeSpeaker = match[1]
              displayContent = msg.content.slice(match[0].length)
            }
          } else if (isFoundlingMsg) {
            const match = msg.content.match(/^\[FOUNDLING — ([^\]]+)\]\n?/)
            if (match) {
              foundlingName = match[1]
              displayContent = msg.content.slice(match[0].length)
            }
          } else if (isHeartbeatMsg) {
            // Skip heartbeat log messages — these are admin-only internal logs
            return null
          }

          const isShellSpeaker = bridgeSpeaker === 'Shell'

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${
                isBridgeMsg
                  ? isShellSpeaker ? 'items-start' : 'items-end'
                  : isFoundlingMsg
                    ? 'items-start'
                    : msg.role === 'assistant' ? 'items-start' : 'items-end'
              }`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  isBridgeMsg
                    ? isShellSpeaker
                      ? 'bg-accent/10 border border-accent/30 text-foreground'
                      : 'bg-purple-bg border border-purple/30 text-foreground'
                    : isFoundlingMsg
                      ? 'bg-success/8 border border-success/25 text-foreground'
                      : msg.role === 'assistant'
                        ? 'bg-gold-bg border border-gold-border text-foreground'
                        : 'bg-surface-hover border border-border text-foreground'
                }`}
              >
                {isBridgeMsg ? (
                  <div className={`text-[10px] mb-0.5 font-mono ${isShellSpeaker ? 'text-accent' : 'text-purple'}`}>
                    {bridgeSpeaker || (msg.role === 'user' ? 'Parent' : 'Shell')}
                  </div>
                ) : isFoundlingMsg ? (
                  <div className="text-[10px] text-success mb-0.5 font-mono">
                    {foundlingName}
                  </div>
                ) : msg.role === 'user' ? (
                  <div className="text-[10px] text-muted mb-0.5 font-mono">
                    {msg.userName || 'Anonymous'}
                  </div>
                ) : (
                  <div className="text-[10px] text-gold mb-0.5 font-mono">
                    Collective
                  </div>
                )}
                <div className="whitespace-pre-wrap leading-relaxed">
                  {parseMessageContent(displayContent, onClose)}
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
          )
        })}

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

      {/* Input — hidden on bridge tab (read-only observation) */}
      {activeTab === 'bridge' ? (
        <div className="px-4 py-2 border-t border-accent/20 bg-accent/5">
          <p className="text-[10px] text-accent/60 font-mono text-center">
            live bridge feed — parent ↔ shell
          </p>
        </div>
      ) : (
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
      )}
      </>
      )}

    </div>
  )
}
