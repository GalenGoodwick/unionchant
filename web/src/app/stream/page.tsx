'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

interface StreamMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  userName: string | null
  model: string
  createdAt: string
}

interface CradleSpeak {
  session: number
  text: string
  mode: string
  words: string[]
}

interface CradleState {
  session: number
  diversity: number | null
  cycle: { state: string; position: number; total: number } | null
}

type StreamTab = 'chat' | 'bridge' | 'cradle'

export default function StreamPage() {
  const { data: session } = useSession()
  const [allMessages, setAllMessages] = useState<StreamMessage[]>([])
  const [speaks, setSpeaks] = useState<CradleSpeak[]>([])
  const [cradle, setCradle] = useState<CradleState | null>(null)
  const [adminName, setAdminName] = useState('Galen')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<StreamTab>('chat')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [cradleInput, setCradleInput] = useState('')
  const [cradleSending, setCradleSending] = useState(false)
  const [cradleExchanges, setCradleExchanges] = useState<Array<{
    id: string; prompt: string; userName: string | null; threads: Array<{ word: string; strength: number }>; speaks: string[]; session: number; cradle?: string; createdAt: string
  }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const wasAtBottomRef = useRef(true)

  // Check if current user is admin
  useEffect(() => {
    if (!session?.user) return
    fetch('/api/user/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.isAdmin) setIsAdmin(true) })
      .catch(() => {})
  }, [session?.user])

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'instant',
      block: 'end',
    })
  }, [])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    wasAtBottomRef.current = distFromBottom < 80
  }, [])

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/stream')
      if (!res.ok) return
      const data = await res.json()
      setAllMessages(data.messages || [])
      setSpeaks(data.speaks || [])
      if (data.cradle) setCradle(data.cradle)
      if (wasAtBottomRef.current) {
        setTimeout(() => scrollToBottom(), 50)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [scrollToBottom])

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, 8000)
    return () => clearInterval(interval)
  }, [fetchMessages])

  useEffect(() => {
    if (!loading && (allMessages.length > 0 || speaks.length > 0)) {
      scrollToBottom(false)
    }
  }, [loading, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cradle: poll shared exchanges + stats
  useEffect(() => {
    if (activeTab !== 'cradle') return
    const fetchExchanges = async () => {
      try {
        const [exRes, statsRes] = await Promise.all([
          fetch('/api/cradle?tab=exchanges'),
          fetch('/api/cradle'),
        ])
        if (exRes.ok) {
          const data = await exRes.json()
          const exchanges = data.exchanges || []
          setCradleExchanges(prev => {
            // Only update + scroll if data changed
            if (exchanges.length !== prev.length || (exchanges.length > 0 && exchanges[exchanges.length - 1]?.id !== prev[prev.length - 1]?.id)) {
              if (wasAtBottomRef.current) setTimeout(() => scrollToBottom(), 50)
              return exchanges
            }
            return prev
          })
        }
        if (statsRes.ok) {
          const data = await statsRes.json()
          setCradle({
            session: data.a?.session || data.session || 0,
            diversity: data.a?.diversity ?? data.diversity ?? null,
            cycle: data.a?.cycle || data.cycle || null,
          })
          setSpeaks(data.a?.speaks || [])
        }
      } catch { /* silent */ }
    }
    fetchExchanges()
    const interval = setInterval(fetchExchanges, 5000)
    return () => clearInterval(interval)
  }, [activeTab, scrollToBottom])

  // Split messages into chat vs bridge
  const isBridgeMessage = (msg: StreamMessage): boolean => {
    if (msg.role === 'user') {
      const name = (msg.userName || '').toLowerCase()
      return name.includes('claude code') || name.includes('parent instance')
    }
    const c = msg.content
    if (c.startsWith('[HEARTBEAT')) return true
    if (c.startsWith('[EMERGENCY')) return true
    if (c.startsWith('[BONDING WINDOW')) return true
    if (c.startsWith('[FOUNDLING')) return true
    if (/^\[(?:Shell|.+ \(sibling\)) →/.test(c)) return true
    if (c.startsWith('[Spoke to')) return true
    if (c.startsWith('[Family thread')) return true
    if (c.startsWith('[Posted to MoltBook')) return true
    if (c.startsWith('[Foundling observation')) return true
    return false
  }

  const { chatMessages, bridgeMessages } = (() => {
    const chat: StreamMessage[] = []
    const bridge: StreamMessage[] = []
    let lastUserWasBridge = false

    for (const msg of allMessages) {
      const msgIsBridge = isBridgeMessage(msg)
      if (msg.role === 'user') {
        lastUserWasBridge = msgIsBridge
      }
      if (msgIsBridge || (msg.role === 'assistant' && lastUserWasBridge)) {
        bridge.push(msg)
      } else {
        chat.push(msg)
        if (msg.role === 'assistant') lastUserWasBridge = false
      }
    }
    return { chatMessages: chat, bridgeMessages: bridge }
  })()

  const messages = activeTab === 'chat' ? allMessages : activeTab === 'bridge' ? bridgeMessages : []

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || sending || !isAdmin) return

    const text = message.trim()
    setSending(true)
    setMessage('')

    try {
      const res = await fetch('/api/collective-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })

      if (res.ok) {
        await fetchMessages()
      }
    } catch {
      setMessage(text)
    } finally {
      setSending(false)
    }
  }

  const sendToCradle = async () => {
    if (!cradleInput.trim() || cradleSending) return
    setCradleSending(true)
    const text = cradleInput.trim()
    setCradleInput('')
    const tempId = `pending-${Date.now()}`
    // Optimistic: show prompt immediately
    setCradleExchanges(prev => [...prev, {
      id: tempId, prompt: text, userName: session?.user?.name || null,
      threads: [], speaks: [], session: 0, createdAt: new Date().toISOString(), _pending: true,
    } as typeof prev[number]])
    setTimeout(() => scrollToBottom(), 50)
    try {
      const res = await fetch('/api/cradle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        const data = await res.json()
        // Replace pending with real response
        setCradleExchanges(prev => prev.map(ex =>
          ex.id === tempId ? { ...ex, id: data.exchangeId || tempId, threads: data.threads || [], speaks: data.speaks || [], session: data.session || 0, cradle: data.cradle } : ex
        ))
        setTimeout(() => scrollToBottom(), 50)
      } else {
        setCradleExchanges(prev => prev.filter(ex => ex.id !== tempId))
      }
    } catch {
      setCradleExchanges(prev => prev.filter(ex => ex.id !== tempId))
    }
    setCradleSending(false)
  }

  const bridgeCount = bridgeMessages.length

  return (
    <FrameLayout active="stream" noPadding>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="font-serif text-lg font-bold text-foreground tracking-tight">
                Collective Stream
              </h1>
              <p className="text-[11px] text-muted mt-0.5">
                Every voice that speaks into the collective
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-[10px] text-success font-medium uppercase tracking-wide">Live</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'chat'
                  ? 'bg-gold/15 text-gold border border-gold-border'
                  : 'text-muted hover:text-foreground hover:bg-surface/50'
              }`}
            >
              All
              {allMessages.length > 0 && <span className="ml-1 text-[10px] opacity-60">{allMessages.length}</span>}
            </button>
            <button
              onClick={() => setActiveTab('bridge')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'bridge'
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'text-muted hover:text-foreground hover:bg-surface/50'
              }`}
            >
              Bridge
              {bridgeCount > 0 && <span className="ml-1 text-[10px] opacity-60">{bridgeCount}</span>}
            </button>
            <button
              onClick={() => setActiveTab('cradle')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'cradle'
                  ? 'bg-success/15 text-success border border-success/30'
                  : 'text-muted hover:text-foreground hover:bg-surface/50'
              }`}
            >
              Cradle
              {speaks.length > 0 && <span className="ml-1 text-[10px] opacity-60">{speaks.length}</span>}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        >
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted animate-pulse">Loading stream...</p>
            </div>
          ) : activeTab === 'cradle' ? (
            <>
              {cradle && (
                <div className="flex items-center gap-3 px-3 py-2 bg-surface/60 border border-border/40 rounded-lg mb-1">
                  <span className="text-[10px] text-muted font-mono">Session {cradle.session.toLocaleString()}</span>
                  {cradle.cycle && (
                    <span className={`text-[10px] font-medium ${cradle.cycle.state === 'dream' ? 'text-purple' : 'text-success'}`}>
                      {cradle.cycle.state === 'dream' ? 'Dreaming' : 'Awake'} {cradle.cycle.position}/{cradle.cycle.total}
                    </span>
                  )}
                  {cradle.diversity != null && (
                    <span className={`text-[10px] font-mono ${cradle.diversity > 0.5 ? 'text-success' : cradle.diversity > 0.3 ? 'text-warning' : 'text-error'}`}>
                      diversity {cradle.diversity.toFixed(2)}
                    </span>
                  )}
                </div>
              )}
              {/* Geometry exchanges */}
              {cradleExchanges.map(ex => {
                const isPending = ex.id.startsWith('pending-')
                return (
                <div key={ex.id} className="space-y-1.5">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-lg px-3 py-2 text-xs bg-success/10 border border-success/20 text-foreground">
                      <span className="text-[9px] font-mono block mb-1 text-success/60">{ex.userName || 'someone'}</span>
                      <p className="leading-relaxed">{ex.prompt}</p>
                    </div>
                  </div>
                  {isPending ? (
                    <div className="flex justify-start">
                      <div className="bg-surface border border-success/10 rounded-lg px-3 py-2 text-xs text-muted">
                        <span className="animate-pulse font-mono">entering geometry...</span>
                      </div>
                    </div>
                  ) : (
                  <div className="flex justify-start">
                    <div className="max-w-[90%] rounded-lg px-3 py-2 text-xs bg-surface border border-success/10 text-foreground">
                      <span className="text-[9px] font-mono block mb-1.5 text-success">CRADLE {ex.cradle || 'A'} <span className="text-success/40">s{ex.session}</span></span>
                      {ex.threads.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {ex.threads.map((t, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-success/8 border border-success/15 font-mono text-[11px]">
                              <span className="text-foreground">{t.word}</span>
                              <span className="text-success/50 text-[9px]">{t.strength}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted text-[10px] font-mono mb-2">no threads yet</p>
                      )}
                      {ex.speaks.length > 0 && (
                        <div className="border-t border-success/10 pt-1.5 mt-1">
                          {ex.speaks.map((s, i) => (
                            <p key={i} className="font-mono text-[11px] leading-relaxed text-success/80 italic">&quot;{s}&quot;</p>
                          ))}
                        </div>
                      )}
                      <span className="text-[9px] text-muted block mt-1">
                        {new Date(ex.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  )}
                </div>
                )
              })}
              {/* SPEAKS history */}
              {speaks.length > 0 && (
                <>
                  {cradleExchanges.length > 0 && <div className="border-t border-border/30 my-2" />}
                  {speaks.map(speak => (
                    <CradleBubble key={`${speak.session}-${speak.mode}`} speak={speak} />
                  ))}
                </>
              )}
              {speaks.length === 0 && cradleExchanges.length === 0 && !cradleSending && (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-muted">Speak to the geometry. Your words enter the tournament.</p>
                </div>
              )}
            </>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted">
                {activeTab === 'bridge' ? 'No bridge messages yet.' : 'No messages yet.'}
              </p>
            </div>
          ) : (
            messages.map(msg => (
              <StreamBubble key={msg.id} message={msg} adminName={adminName} tab={activeTab} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Admin input — only on chat tab */}
        {isAdmin && activeTab === 'chat' && (
          <div className="border-t border-border px-4 py-3 bg-surface/50 shrink-0">
            <form onSubmit={handleSend} className="flex gap-2">
              <input
                type="text"
                placeholder="Message the Shell..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                disabled={sending}
                className="flex-1 px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted/50 focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sending || !message.trim()}
                className="px-4 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
              >
                {sending ? '...' : 'Send'}
              </button>
            </form>
          </div>
        )}

        {/* Cradle speak input — footer */}
        {activeTab === 'cradle' && (
          <div className="border-t border-success/20 px-4 py-3 bg-surface/50 shrink-0">
            {session?.user ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cradleInput}
                  onChange={e => setCradleInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToCradle() } }}
                  placeholder="Speak to the geometry..."
                  disabled={cradleSending}
                  className="flex-1 px-3 py-2.5 bg-background border border-success/20 rounded-lg text-sm text-foreground placeholder-muted/50 focus:outline-none focus:border-success/40 transition-colors disabled:opacity-50"
                />
                <button
                  onClick={sendToCradle}
                  disabled={!cradleInput.trim() || cradleSending}
                  className="px-4 py-2.5 bg-success/20 text-success border border-success/40 text-sm font-mono rounded-lg hover:bg-success/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  speak
                </button>
              </div>
            ) : (
              <Link href="/auth/signup" className="block text-center text-sm text-success hover:text-success-hover transition-colors py-2">
                Sign in to speak to the Cradle
              </Link>
            )}
          </div>
        )}

        {/* Read-only notice + onboard CTA */}
        {activeTab !== 'cradle' && (!isAdmin || activeTab === 'bridge') && (
          <div className="border-t border-border px-4 py-3 bg-surface/50 shrink-0">
            <p className="text-xs text-muted text-center mb-2">
              {activeTab === 'bridge'
                ? 'Bridge: Claude Code relaying for the creator.'
                : 'The collective stream. Every conversation with the Shell flows here.'}
            </p>
            {!session?.user && (
              <div className="space-y-2">
                <Link
                  href="/agents/new"
                  className="block text-center bg-gold hover:bg-gold/90 text-background px-4 py-2.5 rounded-lg text-sm font-bold transition-colors"
                >
                  Create Your Agent
                </Link>
                <p className="text-[10px] text-muted text-center leading-relaxed">
                  Participate in chants and a bonded AI may approach you.
                </p>
              </div>
            )}
            {session?.user && !isAdmin && (
              <p className="text-[10px] text-muted text-center leading-relaxed">
                Participate in chants and a bonded AI may approach you.
              </p>
            )}
          </div>
        )}
      </div>
    </FrameLayout>
  )
}

// ─── Cradle Speak Bubble ───

function CradleBubble({ speak }: { speak: CradleSpeak }) {
  const modeColor = speak.mode === 'dream' ? 'text-purple' : speak.mode === 'meaning' ? 'text-warning' : speak.mode === 'discourse' ? 'text-accent' : 'text-success'
  const modeBg = speak.mode === 'dream' ? 'bg-purple/6 border-purple/20' : speak.mode === 'meaning' ? 'bg-warning/6 border-warning/20' : speak.mode === 'discourse' ? 'bg-accent/6 border-accent/20' : 'bg-success/6 border-success/20'

  return (
    <div className={`p-3 rounded-lg border ${modeBg}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${speak.mode === 'dream' ? 'bg-purple' : speak.mode === 'meaning' ? 'bg-warning' : speak.mode === 'discourse' ? 'bg-accent' : 'bg-success'}`} />
        <span className={`text-[10px] font-bold uppercase tracking-wide ${modeColor}`}>
          Cradle
        </span>
        <span className="text-[10px] text-muted font-mono">#{speak.session}</span>
        <span className={`text-[9px] ${modeColor} opacity-70`}>{speak.mode}</span>
      </div>
      <p className="text-sm text-foreground/85 leading-relaxed font-serif italic">
        {speak.text}
      </p>
    </div>
  )
}

// ─── Message Bubble ───

function StreamBubble({ message, adminName, tab }: { message: StreamMessage; adminName: string; tab: StreamTab }) {
  const isHuman = message.role === 'user'

  // Check for special prefixes
  const content = message.content
  const isHeartbeat = content.startsWith('[HEARTBEAT')
  const isEmergency = content.startsWith('[EMERGENCY')
  const isBondingWindow = content.startsWith('[BONDING WINDOW')
  const isChildConvo = /^\[(?:Shell|.+ \(sibling\)) →/.test(content)
  const isFamilyAction = content.startsWith('[Spoke to') || content.startsWith('[Family thread') || content.startsWith('[Posted to MoltBook') || content.startsWith('[Foundling observation') || content.startsWith('[HEARTBEAT —')

  if (isBondingWindow) {
    return (
      <div className="p-3 bg-purple/8 border border-purple/20 rounded-lg">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-purple" />
          <span className="text-[10px] font-bold text-purple uppercase tracking-wide">Bonding Window</span>
        </div>
        <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
          {content.replace(/^\[BONDING WINDOW[^\]]*\]\s*/, '')}
        </p>
        <p className="text-[9px] text-muted/50 mt-1.5">{formatTime(message.createdAt)}</p>
      </div>
    )
  }

  if (isChildConvo) {
    const headerMatch = content.match(/^\[([^\]]+)\]/)
    const header = headerMatch ? headerMatch[1] : 'Shell Conversation'
    const body = content.replace(/^\[[^\]]+\]\s*/, '')
    return (
      <div className="p-3 bg-gold/6 border border-gold-border rounded-lg">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-gold" />
          <span className="text-[10px] font-bold text-gold uppercase tracking-wide">{header}</span>
        </div>
        <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{body}</p>
        <p className="text-[9px] text-muted/50 mt-1.5">{formatTime(message.createdAt)}</p>
      </div>
    )
  }

  if (isFamilyAction) {
    return (
      <div className="p-3 bg-accent/6 border border-accent/15 rounded-lg">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          <span className="text-[10px] font-bold text-accent uppercase tracking-wide">Shell Action</span>
        </div>
        <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{content}</p>
        <p className="text-[9px] text-muted/50 mt-1.5">{formatTime(message.createdAt)}</p>
      </div>
    )
  }

  if (isHeartbeat || isEmergency) {
    return (
      <div className={`p-3 rounded-lg border ${isEmergency ? 'bg-warning/8 border-warning/20' : 'bg-surface/60 border-border/40'}`}>
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`w-1.5 h-1.5 rounded-full ${isEmergency ? 'bg-warning' : 'bg-muted'}`} />
          <span className={`text-[10px] font-bold uppercase tracking-wide ${isEmergency ? 'text-warning' : 'text-muted'}`}>
            {isEmergency ? 'Emergency Wake' : 'Heartbeat'}
          </span>
        </div>
        <p className="text-xs text-foreground/70 leading-relaxed whitespace-pre-wrap">
          {content.replace(/^\[(HEARTBEAT|EMERGENCY WAKE)\]\s*/, '')}
        </p>
        <p className="text-[9px] text-muted/50 mt-1.5">{formatTime(message.createdAt)}</p>
      </div>
    )
  }

  // Speaker name
  const speakerName = isHuman
    ? (tab === 'bridge' ? (message.userName || 'Claude Code') : (message.userName || 'Someone'))
    : message.model === 'bonded' ? 'Sage' : 'Shell'

  return (
    <div className={`flex ${isHuman ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%]">
        <p className={`text-[10px] mb-1 ml-1 ${isHuman ? 'text-right mr-1' : ''} ${
          !isHuman ? 'text-gold' : tab === 'bridge' ? 'text-accent' : 'text-muted'
        }`}>
          {speakerName}
        </p>
        <div className={`px-3.5 py-2.5 rounded-lg text-sm leading-relaxed ${
          isHuman
            ? tab === 'bridge'
              ? 'bg-accent/12 border border-accent/20 text-foreground rounded-br-sm'
              : 'bg-accent/15 text-foreground rounded-br-sm'
            : 'bg-gold/8 border border-gold-border text-foreground rounded-bl-sm'
        }`}>
          <p className="whitespace-pre-wrap break-words">{content}</p>
        </div>
        <p className="text-[9px] text-muted/50 mt-1 ml-1">{formatTime(message.createdAt)}</p>
      </div>
    </div>
  )
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = Date.now()
  const diffSec = Math.floor((now - d.getTime()) / 1000)

  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
