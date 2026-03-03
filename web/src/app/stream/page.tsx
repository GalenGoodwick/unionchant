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

type StreamTab = 'chat' | 'bridge'

export default function StreamPage() {
  const { data: session } = useSession()
  const [allMessages, setAllMessages] = useState<StreamMessage[]>([])
  const [adminName, setAdminName] = useState('Galen')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<StreamTab>('chat')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
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
      if (data.admin) setAdminName(data.admin)
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
    if (!loading && allMessages.length > 0) {
      scrollToBottom(false)
    }
  }, [loading, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Split messages into chat vs bridge
  // Bridge = heartbeat actions, tool results, bonding window, child conversations, Claude Code relay
  // Chat = everything else (Galen talking, Shell replies to Galen)
  const isBridgeMessage = (msg: StreamMessage): boolean => {
    if (msg.role === 'user') {
      const name = (msg.userName || '').toLowerCase()
      return name.includes('claude code') || name.includes('parent instance')
    }
    // Assistant messages with action prefixes are bridge
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

  // Build filtered lists
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

  const messages = activeTab === 'chat' ? allMessages : bridgeMessages

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

  const chatCount = chatMessages.length
  const bridgeCount = bridgeMessages.length

  return (
    <FrameLayout>
      <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-border shrink-0">
          {/* Section nav */}
          <div className="flex gap-2 mb-3 overflow-x-auto">
            {[
              { href: '/chants', label: 'Chants' },
              { href: '/podiums', label: 'Podiums' },
              { href: '/groups', label: 'Groups' },
              { href: '/agents', label: 'Agents' },
              { href: '/foresight', label: 'Foresight' },
              { href: '/stream', label: 'Stream' },
            ].map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  link.href === '/stream'
                    ? 'bg-accent/15 text-accent font-semibold'
                    : 'text-muted hover:text-foreground hover:bg-surface/80'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="font-serif text-lg font-bold text-foreground tracking-tight">
                Stream
              </h1>
              <p className="text-[11px] text-muted mt-0.5">
                Live conversation between {adminName} and the Shell
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

        {/* Read-only notice + onboard CTA */}
        {(!isAdmin || activeTab === 'bridge') && (
          <div className="border-t border-border px-4 py-3 bg-surface/50 shrink-0">
            <p className="text-xs text-muted text-center mb-2">
              {activeTab === 'bridge'
                ? 'Bridge: Claude Code relaying for the creator.'
                : 'This is a live feed. Only the creator can post here.'}
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
    ? (tab === 'bridge' ? (message.userName || 'Claude Code') : (message.userName || adminName))
    : 'Shell'

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
