'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { getSubspace } from './subspace-data'
import type { SubspaceMessage } from './subspace-data'

interface IdeaSubspaceProps {
  ideaId: string
  onClose: () => void
  onNavigateToSubspace: (ideaId: string) => void
  bookmarks: string[]
  xp?: number
  onXpChange?: (value: number) => void
  flashDocks?: boolean
}

export default function IdeaSubspace({
  ideaId,
  onClose,
  onNavigateToSubspace,
  bookmarks,
  xp = 0,
  onXpChange,
  flashDocks,
}: IdeaSubspaceProps) {
  const subspace = getSubspace(ideaId)
  const [chatInput, setChatInput] = useState('')
  const [localMessages, setLocalMessages] = useState<SubspaceMessage[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset messages when switching subspaces
  useEffect(() => {
    setLocalMessages(subspace?.messages || [])
    setChatInput('')
  }, [ideaId, subspace])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages])

  const handleSend = useCallback(() => {
    const text = chatInput.trim()
    if (!text) return
    const msg: SubspaceMessage = {
      id: `local-${Date.now()}`,
      author: 'You',
      authorColor: '#22d3ee',
      text,
      time: 'now',
    }
    setLocalMessages(prev => [...prev, msg])
    setChatInput('')
    inputRef.current?.focus()
  }, [chatInput])

  if (!subspace) {
    return (
      <div className="flex flex-col h-full bg-header items-center justify-center">
        <div className="text-muted-light text-sm font-mono">Subspace not found</div>
        <button onClick={onClose} className="mt-3 text-accent text-xs font-mono hover:underline">Back</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-header">
      {/* ── HEADER ── */}
      <div className="px-3 py-3 bg-surface/30 border-b border-border/30 shrink-0">
        <h3 className="font-serif text-sm text-foreground leading-snug mb-1">{subspace.ideaText}</h3>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-light">
          <span className="text-accent">{subspace.ideaAuthor}</span>
          <span className="text-muted-light/40">&middot;</span>
          <span>Tier {subspace.highestTier}</span>
          <span className="text-muted-light/40">&middot;</span>
          <span>{subspace.xpAccumulated} XP</span>
          <span className="text-muted-light/40">&middot;</span>
          <span>{subspace.members.length} members</span>
        </div>
        {/* ── XP STARS ── */}
        {onXpChange && (
          <div className="flex items-center gap-1 mt-2">
            <div className="flex items-center gap-1 flex-1">
              {Array.from({ length: 10 }, (_, i) => (
                <div
                  key={i}
                  onClick={() => onXpChange(xp === i + 1 ? 0 : i + 1)}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all duration-200 ${flashDocks ? 'animate-flash-gold' : ''} ${i < xp ? 'border-[#f59e0b] bg-[#f59e0b]/20 shadow-[0_0_8px_rgba(245,158,11,0.4)]' : 'border-accent/40 bg-accent/5 shadow-[0_0_4px_rgba(34,211,238,0.15)]'}`}
                >
                  <svg className={`w-2.5 h-2.5 transition-colors ${i < xp ? 'fill-[#f59e0b]' : 'fill-accent/30'}`} viewBox="0 0 24 24">
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
                  </svg>
                </div>
              ))}
            </div>
            <span className="text-2xl font-mono font-bold text-[#f59e0b]">{xp}</span>
          </div>
        )}
      </div>

      {/* ── MEMBERS BAR ── */}
      <div className="px-3 py-2 border-b border-border/20 shrink-0">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="text-[9px] font-mono text-muted-light/50 uppercase tracking-wider">Members</div>
          <button
            data-interactive
            className="ml-auto px-2 py-0.5 rounded border border-accent/30 text-[9px] font-mono text-accent hover:bg-accent/10 transition-colors"
          >
            + Invite
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {subspace.members.map(member => (
            <div key={member.id} className="flex items-center gap-1 shrink-0">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: member.color }}
              />
              <span className="text-[9px] font-mono text-muted-light whitespace-nowrap">
                {member.name}
              </span>
              {member.role === 'founder' && (
                <svg className="w-2 h-2 fill-gold shrink-0" viewBox="0 0 24 24">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── PORTALS ── */}
      {subspace.portals.length > 0 && (
        <div className="px-3 py-2 border-b border-border/20 shrink-0">
          <div className="text-[9px] font-mono text-muted-light/50 uppercase tracking-wider mb-1.5">Portals</div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {subspace.portals.map(portal => (
              <button
                key={portal.targetIdeaId}
                onClick={() => onNavigateToSubspace(portal.targetIdeaId)}
                data-interactive
                className="flex items-center gap-1 px-2 py-1 bg-accent/8 border border-accent/20 rounded text-[10px] font-mono text-accent hover:bg-accent/15 hover:border-accent/40 transition-colors shrink-0 max-w-[200px]"
              >
                <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                <span className="truncate">{portal.targetIdeaText}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── CHAT FEED ── */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {localMessages.map(msg => (
          <div key={msg.id}>
            {msg.isPortal ? (
              // Portal link message
              <div className="flex items-start gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: msg.authorColor }} />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[10px] font-mono font-bold" style={{ color: msg.authorColor }}>{msg.author}</span>
                    <span className="text-[9px] text-muted-light/40">{msg.time}</span>
                  </div>
                  <div className="text-xs text-muted-light mb-1">{msg.text}</div>
                  <button
                    onClick={() => onNavigateToSubspace(msg.isPortal!)}
                    data-interactive
                    className="flex items-center gap-1 px-2 py-1 bg-accent/8 border border-accent/20 rounded text-[10px] font-mono text-accent hover:bg-accent/15 transition-colors"
                  >
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    <span className="truncate max-w-[180px]">
                      {getSubspace(msg.isPortal!)?.ideaText.slice(0, 40) || msg.isPortal}...
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              // Regular message
              <div className="flex items-start gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: msg.authorColor }} />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[10px] font-mono font-bold" style={{ color: msg.authorColor }}>{msg.author}</span>
                    <span className="text-[9px] text-muted-light/40">{msg.time}</span>
                  </div>
                  <div className="text-xs text-muted-light leading-relaxed">{msg.text}</div>
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* ── MESSAGE INPUT ── */}
      <div className="px-3 py-2 border-t border-border/30 shrink-0 safe-area-bottom">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
            placeholder="Message this subspace..."
            className="flex-1 bg-surface border-2 border-border/30 rounded px-3 py-2.5 text-sm text-foreground placeholder:text-muted-light/40 outline-none focus:border-accent focus:shadow-[0_0_12px_rgba(8,145,178,0.15)] transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!chatInput.trim()}
            data-interactive
            className="px-3 py-2.5 rounded bg-accent/20 border border-accent/40 text-accent text-sm font-mono hover:bg-accent/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
