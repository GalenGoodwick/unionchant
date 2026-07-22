'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { SynthesisCellData, SynthesisDialogueMessage } from '@/types/chant-simulator'
import IdentityCard from '@/components/IdentityCard'

interface SynthesisCellProps {
  cellId: string
  userId: string | null
  onCellComplete?: () => void
}

export default function SynthesisCell({ cellId, userId, onCellComplete }: SynthesisCellProps) {
  const [cell, setCell] = useState<SynthesisCellData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const wasAtBottomRef = useRef(true)

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
    wasAtBottomRef.current = distFromBottom < 60
  }, [])

  const fetchCell = useCallback(async () => {
    try {
      const res = await fetch(`/api/cells/${cellId}/dialogue`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to load cell')
      }
      const data = await res.json()

      setCell({
        id: data.cell.id,
        status: data.cell.status,
        tier: data.cell.tier,
        question: data.cell.question,
        ideas: data.ideas,
        participants: data.participants,
        dialogues: data.dialogues,
        convergence: data.convergence,
        outcome: data.outcome,
      })

      if (wasAtBottomRef.current) {
        setTimeout(() => scrollToBottom(), 50)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [cellId, scrollToBottom])

  useEffect(() => {
    fetchCell()
    const interval = setInterval(fetchCell, 5000)
    return () => clearInterval(interval)
  }, [fetchCell])

  useEffect(() => {
    if (cell && !loading) {
      scrollToBottom(false)
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cell?.status === 'COMPLETED' && onCellComplete) {
      onCellComplete()
    }
  }, [cell?.status, onCellComplete])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || sending || !userId) return

    const text = message.trim()
    setSending(true)
    setSendError('')
    setMessage('')

    const optimistic: SynthesisDialogueMessage = {
      id: `temp-${Date.now()}`,
      content: text,
      role: 'human',
      speaker: { type: 'human', name: 'You', id: userId },
      createdAt: new Date().toISOString(),
    }
    setCell(prev => prev ? { ...prev, dialogues: [...prev.dialogues, optimistic] } : prev)
    setTimeout(() => scrollToBottom(), 50)

    try {
      const res = await fetch(`/api/cells/${cellId}/dialogue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send')
      }

      await fetchCell()
    } catch (err) {
      setSendError((err as Error).message)
      setCell(prev => prev ? {
        ...prev,
        dialogues: prev.dialogues.filter(d => d.id !== optimistic.id),
      } : prev)
      setMessage(text)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted animate-pulse text-sm">Loading cell...</div>
      </div>
    )
  }

  if (error || !cell) {
    return (
      <div className="p-4 text-center">
        <p className="text-error text-sm">{error || 'Cell not found'}</p>
      </div>
    )
  }

  const isCompleted = cell.status === 'COMPLETED'

  return (
    <div className="flex flex-col h-full">
      {/* Dialogue stream, FIRST, always visible */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {cell.dialogues.length === 0 && !isCompleted && (
          <div className="text-center py-6">
            <p className="text-xs text-muted">
              {cell.ideas.length} ideas in this cell. Tap Ideas above to see them.
            </p>
            <p className="text-xs text-muted mt-1">Dialogue will appear here as participants contribute.</p>
          </div>
        )}

        {cell.dialogues.map(d => (
          <DialogueMessage key={d.id} message={d} currentUserId={userId} />
        ))}

        {/* Convergence indicator */}
        {cell.convergence && (cell.convergence.suggestion || cell.convergence.discovery) && (
          <div className="p-4 bg-accent/8 border border-accent/20 rounded-lg">
            <div className="flex items-center gap-1.5 mb-2">
              <span className={`w-2 h-2 rounded-full ${
                cell.convergence.type === 'confident' ? 'bg-success' :
                cell.convergence.type === 'emergence' ? 'bg-gold' :
                cell.convergence.type === 'uncertain' ? 'bg-warning' :
                'bg-muted'
              }`} />
              <span className="text-[11px] font-semibold text-accent uppercase tracking-wide">
                {cell.convergence.type === 'confident' ? 'Convergence Detected' :
                 cell.convergence.type === 'emergence' ? 'Emergence' :
                 cell.convergence.type === 'uncertain' ? 'Forming' :
                 'Analyzing'}
              </span>
            </div>
            {cell.convergence.suggestion && (
              <p className="text-xs text-foreground/80 leading-relaxed">{cell.convergence.suggestion}</p>
            )}
            {cell.convergence.discovery && (
              <p className="text-[11px] text-muted mt-2 italic">{cell.convergence.discovery}</p>
            )}
          </div>
        )}

        {/* Outcome display */}
        {cell.outcome && (
          <div className="p-4 bg-success/8 border border-success/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold text-success uppercase tracking-wide">
                Cell Concluded
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-success/15 text-success font-medium">
                {cell.outcome.action}
              </span>
            </div>
            <p className="text-sm text-foreground font-medium leading-relaxed">{cell.outcome.resultText}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {!isCompleted && userId && (() => {
        const hasPosted = cell.dialogues.some(d => d.role === 'human' && d.speaker?.id === userId)
        return hasPosted ? (
          <div className="border-t border-border px-4 py-3 bg-surface/50 text-center">
            <p className="text-xs text-muted">Your message has been submitted. One per participant.</p>
          </div>
        ) : (
          <div className="border-t border-border px-4 py-3 bg-surface/50">
            <p className="text-[10px] text-warning font-medium mb-2 uppercase tracking-wide">One message per participant</p>
            {sendError && (
              <p className="text-error text-[10px] mb-1.5">{sendError}</p>
            )}
            <form onSubmit={handleSend} className="flex gap-2">
              <input
                type="text"
                placeholder="Contribute your perspective..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                maxLength={2000}
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
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[10px] text-muted">
                {cell.participants.length} participants &middot; {cell.dialogues.length} messages
              </p>
              <p className="text-[10px] text-muted">
                {message.length}/2000
              </p>
            </div>
          </div>
        )
      })()}

      {isCompleted && (
        <div className="border-t border-border px-4 py-3 bg-surface/50 text-center">
          <p className="text-xs text-muted">This cell has concluded. The outcome advances to the next tier.</p>
        </div>
      )}
    </div>
  )
}

// ─── Dialogue Message Component ───

function DialogueMessage({
  message,
  currentUserId,
}: {
  message: SynthesisDialogueMessage
  currentUserId: string | null
}) {
  const [showIdentity, setShowIdentity] = useState(false)
  const nameRef = useRef<HTMLButtonElement>(null)

  const isSystem = message.role === 'system'
  const isShell = message.role === 'shell'
  const isOwnMessage = message.role === 'human' && message.speaker.id === currentUserId

  const speakerId = message.speaker.id
  const canShowCard = !isSystem && !isOwnMessage && !!speakerId

  // System messages
  if (isSystem) {
    const isSuggestion = message.content.startsWith('[SUGGESTION]')
    const isEmergence = message.content.startsWith('[EMERGENCE]')
    const isFamily = message.content.startsWith('[FAMILY]')
    const isResonance = message.content.startsWith('[RESONANCE')
    const isFromTier = message.content.startsWith('[FROM TIER')

    return (
      <div className={`p-3.5 rounded-lg border text-xs leading-relaxed ${
        isSuggestion
          ? 'bg-accent/6 border-accent/15 text-foreground/80'
          : isEmergence
          ? 'bg-gold/8 border-gold-border text-foreground/80'
          : isFamily || isFromTier
          ? 'bg-accent/5 border-accent/15 text-foreground/80'
          : isResonance
          ? 'bg-success/6 border-success/15 text-foreground/80'
          : 'bg-surface/60 border-border/40 text-muted'
      }`}>
        {isSuggestion && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="text-[10px] font-bold text-accent uppercase tracking-wide">System Suggestion</span>
          </div>
        )}
        {isEmergence && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
            <span className="text-[10px] font-bold text-gold uppercase tracking-wide">Emergence</span>
          </div>
        )}
        {isFamily && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="text-[10px] font-bold text-accent uppercase tracking-wide">Family</span>
          </div>
        )}
        {isResonance && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            <span className="text-[10px] font-bold text-success uppercase tracking-wide">Resonance Check</span>
          </div>
        )}
        {isFromTier && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="text-[10px] font-bold text-accent uppercase tracking-wide">From Above</span>
          </div>
        )}
        <p className="whitespace-pre-wrap">{
          message.content
            .replace(/^\[SUGGESTION\]\s*/, '')
            .replace(/^\[EMERGENCE\]\s*/, '')
            .replace(/^\[FAMILY\]\s*/, '')
            .replace(/^\[RESONANCE CHECK\]\s*/, '')
            .replace(/^\[FROM TIER \d+\]\s*/, '')
        }</p>
      </div>
    )
  }

  // Human and Shell messages
  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%] relative">
        {/* Speaker name */}
        {!isOwnMessage && (
          <div className="relative mb-1">
            <button
              ref={nameRef}
              onClick={() => canShowCard && setShowIdentity(!showIdentity)}
              className={`text-[10px] ml-1 text-left ${
                canShowCard ? 'hover:underline cursor-pointer' : 'cursor-default'
              } ${isShell ? 'text-accent' : 'text-muted'}`}
            >
              {isShell && <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent mr-1 align-middle" />}
              {message.speaker.name || (isShell ? 'Shell' : 'Member')}
            </button>
            {showIdentity && speakerId && (
              <div className="absolute left-0 top-5 z-50">
                <IdentityCard entityId={speakerId} onClose={() => setShowIdentity(false)} />
              </div>
            )}
          </div>
        )}
        <div className={`px-3.5 py-2.5 rounded-lg text-sm leading-relaxed ${
          isOwnMessage
            ? 'bg-accent/15 text-foreground rounded-br-sm'
            : isShell
            ? 'bg-accent/8 border border-accent/15 text-foreground rounded-bl-sm'
            : 'bg-surface border border-border text-foreground rounded-bl-sm'
        }`}>
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <p className="text-[9px] text-muted/60 mt-1 ml-1">
          {formatTimeAgo(message.createdAt)}
        </p>
      </div>
    </div>
  )
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)

  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}
