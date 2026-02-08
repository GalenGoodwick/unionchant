'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import type { StreamResponse, StreamItem } from '@/app/api/stream/route'

const POLL_INTERVAL = 5_000
const ITEM_LIFETIME = 30

export default function StreamPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [stream, setStream] = useState<StreamResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  // Track when each item first appeared — survives re-renders and re-fetches
  const appearedAtRef = useRef<Map<string, number>>(new Map())

  const fetchStream = useCallback(async () => {
    try {
      const res = await fetch('/api/stream')
      if (res.ok) {
        const data: StreamResponse = await res.json()
        setStream(data)

        // Register new items
        const all = [data.featured, ...data.queue].filter(Boolean) as StreamItem[]
        const currentTime = Date.now()
        for (const item of all) {
          if (!appearedAtRef.current.has(item.id)) {
            appearedAtRef.current.set(item.id, currentTime)
          }
        }
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchStream()
    const interval = setInterval(fetchStream, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchStream])

  // Tick every second
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  const handleJoin = async (deliberationId: string) => {
    if (!session) {
      router.push('/auth/signin')
      return
    }
    setJoining(deliberationId)
    try {
      const res = await fetch(`/api/deliberations/${deliberationId}/enter`, { method: 'POST' })
      const data = await res.json()
      if (data.success || data.alreadyInCell) {
        router.push(`/chants/${deliberationId}`)
      }
    } catch { /* ignore */ }
    setJoining(null)
  }

  const allItems = stream ? [stream.featured, ...stream.queue].filter(Boolean) as StreamItem[] : []

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      {/* Pulse Bar */}
      {stream?.pulse && (
        <div className="border-b border-border bg-surface">
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-center gap-6 text-xs">
            <PulseStat value={stream.pulse.activeVoters} label="Active Voters" color="text-accent" />
            <PulseStat value={stream.pulse.cellsFillingNow} label="Cells Open" color="text-warning" />
            <PulseStat value={stream.pulse.ideasToday} label="Ideas Today" color="text-success" />
            <PulseStat value={stream.pulse.votesToday} label="Votes Today" color="text-purple" />
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex-1 flex max-w-6xl mx-auto w-full">
        {/* Left: Stream */}
        <main className="flex-1 min-w-0 px-4 py-6">
          {loading && !stream ? (
            <div className="text-center py-20 text-muted">Loading stream...</div>
          ) : allItems.length === 0 && (stream?.results.length || 0) === 0 ? (
            <EmptyStream authenticated={!!session} />
          ) : (
            <div className="flex flex-col gap-3">
              {allItems.map(item => {
                const appeared = appearedAtRef.current.get(item.id) || now
                const age = Math.floor((now - appeared) / 1000)
                const timer = Math.min(age, ITEM_LIFETIME)
                const fading = age > ITEM_LIFETIME

                return (
                  <StreamCard
                    key={item.id}
                    item={item}
                    timer={timer}
                    maxTime={ITEM_LIFETIME}
                    fading={fading}
                    joining={joining}
                    onJoin={handleJoin}
                    authenticated={!!session}
                  />
                )
              })}

              {/* Results */}
              {stream && stream.results.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs uppercase tracking-widest text-muted font-semibold mb-3">Recent Results</div>
                  <div className="flex flex-col gap-2">
                    {stream.results.map(item => (
                      <ResultCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right: Chat (Discord-style) */}
        <aside className="hidden lg:flex w-[380px] flex-shrink-0 border-l border-border flex-col h-[calc(100vh-110px)] sticky top-0">
          <StreamChat />
        </aside>
      </div>
    </div>
  )
}

// ── Pulse Stat ──

function PulseStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`font-mono font-bold ${color}`}>{value}</span>
      <span className="text-muted-light">{label}</span>
    </div>
  )
}

// ── Stream Card ──

function StreamCard({
  item, timer, maxTime, fading, joining, onJoin, authenticated,
}: {
  item: StreamItem
  timer: number
  maxTime: number
  fading: boolean
  joining: string | null
  onJoin: (id: string) => void
  authenticated: boolean
}) {
  const d = item.deliberation
  const cell = item.cell

  const colorMap: Record<string, string> = {
    vote_now: 'var(--color-warning)',
    filling: 'var(--color-accent)',
    submit: 'var(--color-accent)',
    deliberate: 'var(--color-blue)',
    waiting: 'var(--color-border)',
    completed: 'var(--color-success)',
    champion: 'var(--color-success)',
  }

  const badgeMap: Record<string, string> = {
    vote_now: 'Vote Now',
    filling: `${cell?.filledCount || 0}/${cell?.capacity || 5} Joined`,
    submit: 'Submit Ideas',
    deliberate: 'Deliberate',
    waiting: 'Waiting',
    completed: 'Priority Declared',
    champion: 'Priority Declared',
  }

  const accentColor = colorMap[item.type] || 'var(--color-border)'
  const progress = Math.min(timer / maxTime, 1)

  return (
    <div
      className="bg-surface border border-border rounded-xl p-4 relative overflow-hidden transition-opacity duration-1000"
      style={{
        borderLeft: `3px solid ${accentColor}`,
        opacity: fading ? 0.4 : 1,
      }}
    >
      {/* Progress bar */}
      <div
        className="absolute top-0 left-0 h-0.5 transition-all duration-1000 ease-linear"
        style={{ width: `${progress * 100}%`, background: accentColor }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded"
              style={{ color: accentColor, backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)` }}
            >
              {badgeMap[item.type] || item.type}
              {cell && ` \u00B7 T${cell.tier}`}
            </span>
            <span className="text-xs font-mono text-muted">{timer}s</span>
          </div>

          <div className="text-base font-serif font-semibold text-foreground leading-snug">
            &ldquo;{d.question}&rdquo;
          </div>

          {cell && (
            <div className="flex gap-1.5 mt-2 items-center">
              {Array.from({ length: cell.capacity }).map((_, i) => (
                <div
                  key={i}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all duration-300"
                  style={
                    i < cell.filledCount
                      ? { background: accentColor, color: '#fff' }
                      : { background: 'var(--color-background)', border: '1.5px solid var(--color-border)', color: 'var(--color-muted)' }
                  }
                >
                  {i < cell.filledCount ? '\u2713' : ''}
                </div>
              ))}
              <span className="text-xs text-muted ml-1">
                {cell.capacity - cell.filledCount} spot{cell.capacity - cell.filledCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          <div className="mt-1.5 text-xs text-muted flex flex-wrap gap-1">
            <span>{d.participantCount} participants</span>
            <span>&middot;</span>
            <span>{d.ideaCount} ideas</span>
            {d.communityName && (<><span>&middot;</span><span>{d.communityName}</span></>)}
          </div>
        </div>

        <div className="flex-shrink-0">
          {item.type === 'filling' && (
            <button
              onClick={() => onJoin(d.id)}
              disabled={joining === d.id}
              className="px-4 py-2 rounded-lg text-white font-semibold text-sm transition-colors whitespace-nowrap"
              style={{ background: accentColor }}
            >
              {joining === d.id ? '...' : authenticated ? 'Jump In' : 'Sign In'}
            </button>
          )}
          {item.type === 'vote_now' && (
            <Link href={`/chants/${d.id}`} className="block px-4 py-2 rounded-lg text-white font-semibold text-sm text-center transition-colors whitespace-nowrap" style={{ background: accentColor }}>
              Vote &rarr;
            </Link>
          )}
          {item.type === 'deliberate' && (
            <Link href={`/chants/${d.id}`} className="block px-4 py-2 rounded-lg text-white font-semibold text-sm text-center transition-colors whitespace-nowrap" style={{ background: accentColor }}>
              Discuss &rarr;
            </Link>
          )}
          {item.type === 'submit' && (
            <Link href={`/chants/${d.id}`} className="block px-4 py-2 rounded-lg text-white font-semibold text-sm text-center transition-colors whitespace-nowrap" style={{ background: accentColor }}>
              Add Idea &rarr;
            </Link>
          )}
          {item.type === 'waiting' && (
            <Link href={`/chants/${d.id}`} className="block px-4 py-2 rounded-lg border border-border text-muted font-semibold text-sm text-center whitespace-nowrap">
              Watching &rarr;
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Discord-style Chat ──

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  userName: string | null
  createdAt: string
}

function StreamChat() {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/collective-chat')
      .then(r => r.ok ? r.json() : { messages: [] })
      .then(data => {
        setMessages(data.messages || [])
        requestAnimationFrame(() => {
          if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight
        })
      })
      .catch(() => {})
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    if (containerRef.current) {
      const el = containerRef.current
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
      if (nearBottom) el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)

    // Optimistic add
    const tempMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      userName: session?.user?.name || 'You',
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])

    try {
      const res = await fetch('/api/collective-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      if (res.ok) {
        const refreshRes = await fetch('/api/collective-chat')
        if (refreshRes.ok) {
          const data = await refreshRes.json()
          setMessages(data.messages || [])
        }
      }
    } catch { /* ignore */ }
    setSending(false)
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Channel header */}
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <span className="text-muted text-sm">#</span>
        <span className="text-sm font-semibold text-foreground">general</span>
        <span className="text-xs text-muted ml-auto">{messages.length} messages</span>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {messages.length === 0 && (
          <div className="text-center text-muted text-sm py-12">
            <p className="text-xs">This is the start of #general</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const prev = messages[i - 1]
          const sameAuthor = prev && prev.role === msg.role && prev.userName === msg.userName
          const timeDiff = prev ? new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() : Infinity
          const grouped = sameAuthor && timeDiff < 300_000 // 5 min grouping

          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 hover:bg-surface/50 rounded px-1 py-0.5 ${grouped ? '' : 'mt-3 pt-1'}`}
            >
              {/* Avatar gutter */}
              <div className="w-8 flex-shrink-0">
                {!grouped && (
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                      msg.role === 'assistant'
                        ? 'bg-gold/20 text-gold'
                        : 'bg-accent/20 text-accent'
                    }`}
                  >
                    {msg.role === 'assistant' ? 'C' : (msg.userName || 'U')[0].toUpperCase()}
                  </div>
                )}
              </div>

              {/* Message content */}
              <div className="flex-1 min-w-0">
                {!grouped && (
                  <div className="flex items-baseline gap-2">
                    <span className={`text-sm font-semibold ${msg.role === 'assistant' ? 'text-gold' : 'text-foreground'}`}>
                      {msg.role === 'assistant' ? 'Collective' : msg.userName || 'Anonymous'}
                    </span>
                    <span className="text-[10px] text-muted">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                <div className="text-sm text-subtle leading-relaxed whitespace-pre-wrap break-words">
                  {msg.content}
                </div>
              </div>
            </div>
          )
        })}

        {sending && (
          <div className="flex gap-2.5 px-1 py-0.5 mt-3 pt-1">
            <div className="w-8 flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-gold/20 text-gold flex items-center justify-center text-xs font-semibold">C</div>
            </div>
            <div>
              <span className="text-sm font-semibold text-gold">Collective</span>
              <div className="text-sm text-muted animate-pulse">typing...</div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-border">
        {session ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Message #general"
              disabled={sending}
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="px-3 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Send
            </button>
          </div>
        ) : (
          <Link href="/auth/signin" className="block text-center text-sm text-muted hover:text-accent transition-colors py-2">
            Sign in to chat
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Result Card ──

function ResultCard({ item }: { item: StreamItem }) {
  return (
    <Link
      href={`/chants/${item.deliberation.id}`}
      className="block bg-surface border border-border rounded-xl p-3 hover:bg-surface-hover transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-success px-2 py-0.5 rounded bg-success-bg">Priority Declared</span>
        {item.completedAt && <span className="text-xs text-muted">{timeAgo(item.completedAt)}</span>}
      </div>
      <div className="text-sm font-serif font-semibold text-foreground mt-1.5 truncate">
        &ldquo;{item.deliberation.question}&rdquo;
      </div>
      {item.champion && (
        <div className="text-xs text-success mt-1 truncate">
          Winner: &ldquo;{item.champion.text}&rdquo;
        </div>
      )}
    </Link>
  )
}

// ── Empty Stream ──

function EmptyStream({ authenticated }: { authenticated: boolean }) {
  return (
    <div className="text-center py-20 px-4">
      <div className="max-w-md mx-auto bg-surface border border-border rounded-2xl p-8">
        <div className="text-5xl mb-4">~</div>
        <h3 className="text-lg font-semibold mb-2">The stream is quiet</h3>
        <p className="text-muted text-sm mb-6">
          {authenticated
            ? 'No cells are filling right now. Start a chant to get things moving.'
            : 'Sign in to join the stream and vote on ideas with others.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {authenticated ? (
            <Link href="/chants/new" className="bg-accent hover:bg-accent-hover text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors">
              + Start a Chant
            </Link>
          ) : (
            <Link href="/auth/signin" className="bg-accent hover:bg-accent-hover text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
