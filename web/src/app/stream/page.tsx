'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
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

interface CradleState {
  session: number
  vocabulary: number
  threads: number
  diversity: number | null
  attention: number | null
  alive: boolean
  cycle: { state: string; position: number; total: number } | null
}

interface TrajectoryEntry {
  s: number
  ch: string
  mode?: string
  awake?: boolean
  state?: string
  t?: number
  in?: Record<string, string>
  drift?: [string, number][]
  _cradle?: 'A' | 'B'
}

type StreamTab = 'cradle' | 'chat' | 'bridge'

export default function StreamPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [allMessages, setAllMessages] = useState<StreamMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<StreamTab>('cradle')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminChecked, setAdminChecked] = useState(false)

  // Cradle state
  const [cradleInput, setCradleInput] = useState('')
  const [cradleSending, setCradleSending] = useState(false)
  const [cradleExchanges, setCradleExchanges] = useState<Array<{
    id: string; prompt: string; userName: string | null; threads: Array<{ word: string; strength: number }>; speaks: string[]; session: number; cradle?: string; createdAt: string
  }>>([])
  const [statsA, setStatsA] = useState<CradleState | null>(null)
  const [statsB, setStatsB] = useState<CradleState | null>(null)
  const [trajectoryA, setTrajectoryA] = useState<TrajectoryEntry[]>([])
  const [trajectoryB, setTrajectoryB] = useState<TrajectoryEntry[]>([])
  const [streamFilter, setStreamFilter] = useState<'both' | 'A' | 'B'>('both')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const wasAtBottomRef = useRef(true)

  // Check if current user is admin — redirect non-admins
  useEffect(() => {
    if (!session?.user) return
    fetch('/api/user/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.isAdmin) setIsAdmin(true)
        setAdminChecked(true)
      })
      .catch(() => setAdminChecked(true))
  }, [session?.user])

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/chants')
    if (adminChecked && !isAdmin) router.replace('/chants')
  }, [status, adminChecked, isAdmin, router])

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

  // Chat messages fetch
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/stream')
      if (!res.ok) return
      const data = await res.json()
      setAllMessages(data.messages || [])
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
    if (!loading) {
      scrollToBottom(false)
    }
  }, [loading, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cradle: poll exchanges + trajectory + stats
  useEffect(() => {
    if (activeTab !== 'cradle') return
    const fetchCradle = async () => {
      try {
        const [exRes, trajRes, statsRes] = await Promise.all([
          fetch('/api/cradle?tab=exchanges'),
          fetch('/api/cradle-trajectory'),
          fetch('/api/cradle'),
        ])
        if (exRes.ok) {
          const data = await exRes.json()
          const exchanges = data.exchanges || []
          setCradleExchanges(prev => {
            if (exchanges.length !== prev.length || (exchanges.length > 0 && exchanges[exchanges.length - 1]?.id !== prev[prev.length - 1]?.id)) {
              if (wasAtBottomRef.current) setTimeout(() => scrollToBottom(), 50)
              return exchanges
            }
            return prev
          })
        }
        if (trajRes.ok) {
          const data = await trajRes.json()
          const newA = data.entries || []
          setTrajectoryA(prev => {
            const seen = new Set(prev.map(e => e.s))
            const fresh = newA.filter((e: TrajectoryEntry) => !seen.has(e.s))
            if (fresh.length > 0 && wasAtBottomRef.current) {
              setTimeout(() => scrollToBottom(), 50)
            }
            const merged = [...prev, ...fresh]
            return merged.slice(-200)
          })
          if (data.b) {
            const newB = data.b.entries || []
            setTrajectoryB(prev => {
              const seen = new Set(prev.map(e => e.s))
              const fresh = newB.filter((e: TrajectoryEntry) => !seen.has(e.s))
              if (fresh.length > 0 && wasAtBottomRef.current) {
                setTimeout(() => scrollToBottom(), 50)
              }
              const merged = [...prev, ...fresh]
              return merged.slice(-200)
            })
          }
        }
        if (statsRes.ok) {
          const data = await statsRes.json()
          setStatsA({
            session: data.a?.session || data.session || 0,
            vocabulary: data.a?.vocabulary || data.vocabulary || 0,
            threads: data.a?.threads || data.threads || 0,
            diversity: data.a?.diversity ?? data.diversity ?? null,
            attention: data.a?.attention ?? data.attention ?? null,
            alive: data.a?.alive ?? true,
            cycle: data.a?.cycle || data.cycle || null,
          })
          if (data.b) {
            setStatsB({
              session: data.b.session || 0,
              vocabulary: data.b.vocabulary || 0,
              threads: data.b.threads || 0,
              diversity: data.b.diversity ?? null,
              attention: data.b.attention ?? null,
              alive: data.b.alive ?? false,
              cycle: data.b.cycle || null,
            })
          }
        }
      } catch { /* silent */ }
    }
    fetchCradle()
    const interval = setInterval(fetchCradle, 8000)
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

  const { bridgeMessages } = (() => {
    const bridge: StreamMessage[] = []
    let lastUserWasBridge = false
    for (const msg of allMessages) {
      const msgIsBridge = isBridgeMessage(msg)
      if (msg.role === 'user') lastUserWasBridge = msgIsBridge
      if (msgIsBridge || (msg.role === 'assistant' && lastUserWasBridge)) {
        bridge.push(msg)
      } else if (msg.role === 'assistant') lastUserWasBridge = false
    }
    return { bridgeMessages: bridge }
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
      if (res.ok) await fetchMessages()
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
    setCradleExchanges(prev => [...prev, {
      id: tempId, prompt: text, userName: session?.user?.name || null,
      threads: [], speaks: [], session: 0, createdAt: new Date().toISOString(),
    }])
    setTimeout(() => scrollToBottom(), 50)
    try {
      const res = await fetch('/api/cradle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        const data = await res.json()
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

  // Merge trajectory entries
  const mergedTrajectory = (() => {
    const hasBoth = trajectoryA.length > 0 && trajectoryB.length > 0
    const aEntries = streamFilter !== 'B' ? trajectoryA.map(e => ({ ...e, _cradle: 'A' as const })) : []
    const bEntries = streamFilter !== 'A' ? trajectoryB.map(e => ({ ...e, _cradle: 'B' as const })) : []
    return { entries: [...aEntries, ...bEntries].sort((a, b) => (a.t || 0) - (b.t || 0)), hasBoth }
  })()

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
              onClick={() => setActiveTab('cradle')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'cradle'
                  ? 'bg-success/15 text-success border border-success/30'
                  : 'text-muted hover:text-foreground hover:bg-surface/50'
              }`}
            >
              Cradle
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === 'chat'
                  ? 'bg-gold/15 text-gold border border-gold-border'
                  : 'text-muted hover:text-foreground hover:bg-surface/50'
              }`}
            >
              Shell
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
          </div>
        </div>

        {/* Cradle stats bar */}
        {activeTab === 'cradle' && (statsA || statsB) && (
          <div className="px-4 py-1.5 border-b border-success/20 bg-success/5 flex items-center gap-4 text-[10px] font-mono text-success/80 flex-wrap shrink-0">
            <CradleStatsBadge stats={statsA} label="A" />
            {statsB && statsB.alive && (
              <>
                <span className="text-success/30">|</span>
                <CradleStatsBadge stats={statsB} label="B" />
              </>
            )}
            {mergedTrajectory.hasBoth && (
              <>
                <span className="text-success/30">|</span>
                {(['both', 'A', 'B'] as const).map(f => (
                  <button key={f} onClick={() => setStreamFilter(f)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors ${
                      streamFilter === f
                        ? f === 'B' ? 'bg-orange/20 text-orange border border-orange/40'
                          : 'bg-success/20 text-success border border-success/40'
                        : 'bg-surface text-muted hover:text-success border border-border'
                    }`}>{f}</button>
                ))}
              </>
            )}
          </div>
        )}

        {/* Content */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
        >
          {loading && activeTab !== 'cradle' ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted animate-pulse">Loading stream...</p>
            </div>
          ) : activeTab === 'cradle' ? (
            <>
              {/* Geometry exchanges */}
              {cradleExchanges.length > 0 && (
                <div className="space-y-3 mb-3">
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
                  <div className="border-t border-success/10 my-2" />
                </div>
              )}

              {/* Trajectory — per-session SPEAKS timeline */}
              {mergedTrajectory.entries.length === 0 && cradleExchanges.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-success/80 text-sm mb-1">The Cradle</p>
                  <p className="text-muted text-xs">The geometric body. Words compete. Winners reshape reality.</p>
                  <p className="text-muted text-xs mt-1">Your words enter the tournament. The geometry speaks back.</p>
                </div>
              )}
              {mergedTrajectory.entries.map((entry, idx) => {
                const isB = entry._cradle === 'B'
                const hasBoth = mergedTrajectory.hasBoth
                const inp = entry.in as Record<string, string> | undefined
                return (
                  <div key={`${entry._cradle}-${entry.s}-${idx}`} className={`group ${isB ? 'border-l-2 border-orange/30 pl-2' : hasBoth ? 'border-l-2 border-success/30 pl-2' : ''}`}>
                    <div className="flex items-baseline gap-2">
                      {hasBoth && (
                        <span className={`text-[9px] font-mono font-bold shrink-0 w-[1.2ch] ${isB ? 'text-orange' : 'text-success'}`}>
                          {entry._cradle}
                        </span>
                      )}
                      <span className="text-[9px] font-mono text-muted shrink-0 w-[3.5ch] text-right">{entry.s}</span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                        entry.state === 'growing' ? 'bg-success' : entry.state === 'stuck' ? 'bg-error' : 'bg-muted'
                      }`} />
                      {inp?.sibling && (
                        <span className="text-[8px] font-mono px-1 py-0.5 rounded shrink-0 bg-success/20 text-success/90">talking</span>
                      )}
                      {inp?.sage && (
                        <span className="text-[8px] font-mono px-1 py-0.5 rounded shrink-0 bg-warning/20 text-warning/90">nurture</span>
                      )}
                      <span className={`text-[8px] font-mono px-1 py-0.5 rounded shrink-0 ${
                        entry.mode === 'dream' ? 'bg-purple/15 text-purple/80' :
                        entry.mode === 'meaning' ? 'bg-warning/15 text-warning/80' :
                        entry.mode === 'discourse' ? 'bg-accent/15 text-accent/80' :
                        entry.awake !== false ? 'bg-success/15 text-success/80' : 'bg-muted/15 text-muted'
                      }`}>{entry.mode === 'normal' || !entry.mode ? (entry.awake !== false ? 'awake' : 'sleep') : entry.mode}</span>
                      <p className={`font-serif text-sm italic leading-relaxed ${isB ? 'text-orange/90' : 'text-foreground/90'}`}>{entry.ch || '...'}</p>
                    </div>
                    {/* Inputs */}
                    {inp && (
                      <div className={`${hasBoth ? 'ml-[5.7ch]' : 'ml-[4ch]'} pl-2 mt-0.5 flex flex-wrap gap-1`}>
                        {inp.sibling && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-success/15 text-success/90">
                            sibling: {inp.sibling}
                          </span>
                        )}
                        {inp.shell && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-warning/15 text-warning/90">
                            shell: {inp.shell}
                          </span>
                        )}
                        {inp.collective && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple/15 text-purple/90">
                            collective: {inp.collective}
                          </span>
                        )}
                        {inp.sage && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-orange/15 text-orange/90">
                            sage: {inp.sage}
                          </span>
                        )}
                        {inp.galen && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-accent/15 text-accent/90">
                            galen: {inp.galen}
                          </span>
                        )}
                        {inp.twinA && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-error/15 text-error/90">
                            twin-a: {inp.twinA}
                          </span>
                        )}
                        {inp.twinB && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-accent/15 text-accent/90">
                            twin-b: {inp.twinB}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Drift tags */}
                    {entry.drift && entry.drift.length > 0 && (
                      <div className={`${hasBoth ? 'ml-[5.7ch]' : 'ml-[4ch]'} pl-2 mt-0.5 flex gap-1`}>
                        {entry.drift.slice(0, 3).map(([word, val]) => (
                          <span key={word} className="text-[8px] font-mono text-muted/70 px-1 py-0.5 rounded bg-foreground/5">
                            {word} +{val}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted">
                {activeTab === 'bridge' ? 'No bridge messages yet.' : 'No messages yet.'}
              </p>
            </div>
          ) : (
            messages.map(msg => (
              <StreamBubble key={msg.id} message={msg} tab={activeTab} />
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

// ─── Cradle Stats Badge ───

function CradleStatsBadge({ stats, label }: { stats: CradleState | null; label: string }) {
  if (!stats) return null
  const cycle = stats.cycle
  const isAwake = cycle ? cycle.state === 'awake' : true
  const statusLabel = !stats.alive ? 'off' : isAwake ? 'awake' : 'dream'
  const statusColor = !stats.alive ? 'bg-error' : isAwake ? 'bg-success animate-pulse' : 'bg-purple animate-pulse'
  const divLabel = stats.diversity != null ? `d${stats.diversity.toFixed(2)}` : null
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
      <span className="text-success/60">{label}</span>
      <span>{statusLabel}</span>
      {divLabel && <span className={stats.diversity != null && stats.diversity < 0.5 ? 'text-error' : stats.diversity != null && stats.diversity > 0.75 ? 'text-success' : ''}>{divLabel}</span>}
      {stats.attention != null && <span className="text-accent/80">a{stats.attention.toFixed(2)}</span>}
      {stats.session > 0 && <span>s{stats.session.toLocaleString()}</span>}
    </span>
  )
}

// ─── Message Bubble ───

function StreamBubble({ message, tab }: { message: StreamMessage; tab: StreamTab }) {
  const isHuman = message.role === 'user'
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
