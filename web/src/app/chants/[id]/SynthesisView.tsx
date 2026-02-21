'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ChantStatus } from '@/types/chant-simulator'
import SynthesisCell from './SynthesisCell'
import ShareMenu from '@/components/ShareMenu'

interface SynthesisViewProps {
  id: string
  status: ChantStatus
  fetchStatus: () => void
}

type SynthesisTab = 'dialogue' | 'cells' | 'ideas' | 'manage'

export default function SynthesisView({ id, status, fetchStatus }: SynthesisViewProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const userId = session?.user?.id || null

  const [activeTab, setActiveTab] = useState<SynthesisTab>('dialogue')
  const [joined, setJoined] = useState(status.isMember)
  const [joining, setJoining] = useState(false)
  const [activeCellId, setActiveCellId] = useState<string | null>(null)
  const [loadingCells, setLoadingCells] = useState(false)
  const [myCells, setMyCells] = useState<{ id: string; tier: number; status: string }[]>([])
  const [ideaText, setIdeaText] = useState('')
  const [submittingIdea, setSubmittingIdea] = useState(false)
  const [ideaError, setIdeaError] = useState('')
  const [ideaSuccess, setIdeaSuccess] = useState(false)

  const isCreator = userId && status.creator.id === session?.user?.id

  // Use cells from status (public, no auth needed) instead of gated /cells API
  useEffect(() => {
    const cells = (status.cells || []).filter((c: { status: string }) =>
      c.status === 'DELIBERATING' || c.status === 'COMPLETED' || c.status === 'VOTING'
    )
    setMyCells(cells)
    setLoadingCells(false)

    // Auto-select the first active cell (only if none selected yet)
    setActiveCellId(prev => {
      if (prev) return prev
      const active = cells.find((c: { status: string }) => c.status === 'DELIBERATING')
      return active ? active.id : cells.length > 0 ? cells[0].id : null
    })
  }, [status.cells])

  const handleJoin = async () => {
    if (!userId) {
      router.push('/auth/signin')
      return
    }
    setJoining(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/join`, { method: 'POST' })
      if (res.ok) {
        setJoined(true)
        fetchStatus()
      }
    } catch { /* silent */ }
    finally { setJoining(false) }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h1 className="text-base font-semibold text-foreground leading-tight tracking-tight">{status.question}</h1>
          <div className="flex items-center gap-1 shrink-0">
            <ShareMenu url={`/chants/${id}`} text={status.question} variant="icon" />
            <span className="px-2 py-0.5 text-[11px] rounded-full font-medium shrink-0 bg-accent/15 text-accent">
              Synthesis
            </span>
          </div>
        </div>
        {status.description && (
          <p className="text-xs text-muted mb-1 leading-relaxed">{status.description}</p>
        )}
        <p className="text-xs text-muted">by {status.creator.name}</p>
      </div>

      {/* Join CTA */}
      {!joined && (
        <div className="mb-3">
          {!userId ? (
            <Link
              href="/auth/signin"
              className="block text-center bg-accent hover:bg-accent-hover text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              Sign in to join
            </Link>
          ) : (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full bg-success hover:bg-success-hover text-white px-4 py-3 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {joining ? 'Joining...' : 'Join This Synthesis'}
            </button>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        <StatBox value={status.ideaCount} label="Ideas" />
        <StatBox value={status.memberCount} label="Members" />
        <StatBox value={myCells.filter(c => c.status === 'DELIBERATING').length} label="Active" />
        <StatBox value={status.currentTier} label="Tier" />
      </div>

      {/* Idea Submission — during SUBMISSION phase for joined members */}
      {joined && status.phase === 'SUBMISSION' && (
        <div className="mb-3 p-3 bg-surface/90 rounded-lg border border-accent/20">
          <p className="text-xs font-semibold text-accent mb-2 uppercase tracking-wide">Submit an Idea</p>
          {ideaSuccess ? (
            <div className="text-xs text-success font-medium">
              Idea submitted!
              <button
                onClick={() => { setIdeaSuccess(false); setIdeaText('') }}
                className="ml-2 text-accent underline"
              >
                Submit another
              </button>
            </div>
          ) : (
            <form onSubmit={async (e) => {
              e.preventDefault()
              if (!ideaText.trim() || submittingIdea) return
              setSubmittingIdea(true)
              setIdeaError('')
              try {
                const res = await fetch(`/api/deliberations/${id}/ideas`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: ideaText.trim() }),
                })
                if (!res.ok) {
                  const data = await res.json()
                  throw new Error(data.error || 'Failed to submit')
                }
                setIdeaSuccess(true)
                fetchStatus()
              } catch (err) {
                setIdeaError((err as Error).message)
              } finally {
                setSubmittingIdea(false)
              }
            }} className="space-y-2">
              <textarea
                value={ideaText}
                onChange={e => setIdeaText(e.target.value)}
                placeholder="Your idea for synthesis..."
                maxLength={500}
                rows={2}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted/50 focus:outline-none focus:border-accent transition-colors resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted">{ideaText.length}/500</span>
                <button
                  type="submit"
                  disabled={submittingIdea || !ideaText.trim()}
                  className="px-4 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {submittingIdea ? 'Submitting...' : 'Submit'}
                </button>
              </div>
              {ideaError && <p className="text-error text-[10px]">{ideaError}</p>}
            </form>
          )}
        </div>
      )}

      {/* Champion / Outcome Banner */}
      {status.champion && (
        <div className="mb-3 p-3 bg-success/8 border border-success/20 rounded-lg">
          <p className="text-[11px] text-success font-bold mb-0.5 uppercase tracking-wide">Priority Declared</p>
          <p className="text-foreground font-medium text-sm select-text">{status.champion.text}</p>
          <p className="text-xs text-muted mt-0.5">by {status.champion.author.name}</p>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex border-b border-border mb-3 gap-0.5">
        {([
          { key: 'dialogue' as const, label: 'Dialogue', show: true },
          { key: 'ideas' as const, label: 'Ideas', badge: status.ideaCount, show: true },
          { key: 'cells' as const, label: 'Cells', badge: myCells.length, show: true },
          { key: 'manage' as const, label: 'Manage', show: !!isCreator },
        ] as const).filter(t => t.show).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-xs font-medium text-center whitespace-nowrap transition-colors rounded-t-md ${
              activeTab === tab.key
                ? 'text-foreground border-b-2 border-accent bg-surface/50'
                : 'text-muted hover:text-foreground hover:bg-surface/30'
            }`}
          >
            {tab.label}
            {'badge' in tab && tab.badge ? <span className="ml-1 text-muted/50 text-[10px]">{tab.badge}</span> : null}
          </button>
        ))}
      </div>

      {/* ─── DIALOGUE TAB ─── */}
      {activeTab === 'dialogue' && (
        <div>
          {loadingCells ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted animate-pulse">Finding your cells...</p>
            </div>
          ) : myCells.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted font-medium mb-1">Waiting for cell assignment</p>
              <p className="text-xs text-muted">You'll be placed in a synthesis cell when the next tier begins. Cells form when enough ideas and participants are ready.</p>
            </div>
          ) : (
            <div className="flex flex-col" style={{ height: 'calc(100vh - 380px)', minHeight: '300px' }}>
              {/* Cell tabs — always show for creator, show when multiple cells for others */}
              {(isCreator || myCells.length > 1) && (
                <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
                  {myCells.map((c, i) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveCellId(c.id)}
                      className={`px-2.5 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors border ${
                        activeCellId === c.id
                          ? c.status === 'COMPLETED'
                            ? 'bg-success/15 text-success font-medium border-success/30'
                            : 'bg-accent/15 text-accent font-medium border-accent/30'
                          : 'bg-surface/50 text-muted hover:text-foreground border-border/50'
                      }`}
                    >
                      Cell {i + 1}
                      {c.status === 'COMPLETED' && <span className="ml-1 text-[10px] opacity-60">done</span>}
                    </button>
                  ))}
                </div>
              )}

              {activeCellId && (
                <SynthesisCell
                  key={activeCellId}
                  cellId={activeCellId}
                  userId={userId}
                  onCellComplete={() => {
                    fetchStatus()
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── IDEAS TAB ─── */}
      {activeTab === 'ideas' && (
        <div>
          {status.ideas.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted font-medium">No ideas yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {status.ideas
                .sort((a, b) => (b.totalXP || 0) - (a.totalXP || 0))
                .map((idea, i) => (
                  <div
                    key={idea.id}
                    className={`p-2.5 rounded-lg border ${
                      idea.isChampion
                        ? 'bg-success/8 border-success/20'
                        : idea.status === 'ADVANCING'
                        ? 'bg-accent/8 border-accent/20'
                        : idea.status === 'ELIMINATED'
                        ? 'bg-surface/40 border-border/30 opacity-60'
                        : 'bg-surface/90 border-border'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-[11px] font-mono text-muted shrink-0">#{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground leading-snug">{idea.text}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[10px] text-muted">by {idea.author.name}</p>
                          {idea.totalXP > 0 && (
                            <span className="text-[10px] font-mono font-bold text-warning">{idea.totalXP} XP</span>
                          )}
                          <IdeaStatus status={idea.status} isChampion={idea.isChampion} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ─── CELLS TAB ─── */}
      {activeTab === 'cells' && (
        <div>
          {status.cells.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted font-medium">No cells yet</p>
              <p className="text-xs text-muted mt-1">Cells form when a synthesis tier begins.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from(new Set(status.cells.map(c => c.tier)))
                .sort((a, b) => a - b)
                .map(tier => {
                  const tierCells = status.cells.filter(c => c.tier === tier)
                  const completed = tierCells.filter(c => c.status === 'COMPLETED').length
                  const active = tierCells.filter(c => c.status === 'DELIBERATING').length
                  return (
                    <div key={tier}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-muted">Tier {tier}</span>
                        <span className="text-[10px] text-muted">
                          {completed}/{tierCells.length} concluded &middot; {active} active
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {tierCells.map((cell, i) => {
                          const isMyCell = myCells.some(c => c.id === cell.id)
                          const canClick = isMyCell || isCreator
                          return (
                            <button
                              key={cell.id}
                              onClick={() => {
                                if (canClick) {
                                  // Ensure this cell is in myCells so dialogue tab can show it
                                  if (!isMyCell) {
                                    setMyCells(prev => {
                                      if (prev.some(c => c.id === cell.id)) return prev
                                      return [...prev, { id: cell.id, tier: cell.tier, status: cell.status }]
                                    })
                                  }
                                  setActiveCellId(cell.id)
                                  setActiveTab('dialogue')
                                }
                              }}
                              className={`aspect-square rounded-lg border text-sm font-mono font-bold transition-all ${
                                canClick ? 'cursor-pointer' : 'cursor-default'
                              } ${
                                isMyCell && cell.status === 'DELIBERATING'
                                  ? 'bg-accent/20 border-accent/50 text-accent ring-1 ring-accent/30'
                                  : cell.status === 'COMPLETED'
                                  ? 'bg-success/8 border-success/25 text-success'
                                  : cell.status === 'DELIBERATING'
                                  ? 'bg-warning/8 border-warning/25 text-warning animate-pulse'
                                  : 'bg-surface/90 border-border text-muted'
                              }`}
                            >
                              {i + 1}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {/* ─── MANAGE TAB ─── */}
      {activeTab === 'manage' && isCreator && (
        <div className="space-y-3">
          <div className="p-3 bg-surface/90 rounded-lg border border-border">
            <p className="text-xs font-medium text-muted mb-2">Synthesis Mode</p>
            <p className="text-xs text-foreground/80 leading-relaxed">
              Cells discuss ideas through dialogue. The system detects convergence and suggests outcomes:
              select, merge, synthesize, or wipe. No manual voting needed.
            </p>
          </div>

          {status.phase === 'SUBMISSION' && (
            <div>
              <p className="text-xs text-muted mb-1">{status.ideaCount} ideas, {status.memberCount} members</p>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/deliberations/${id}/start-voting`, { method: 'POST' })
                    if (res.ok) fetchStatus()
                  } catch { /* silent */ }
                }}
                disabled={status.ideaCount < 2}
                className="w-full py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Start Synthesis (form cells)
              </button>
              {status.ideaCount < 2 && (
                <p className="text-xs text-warning mt-1">Need at least 2 ideas.</p>
              )}
            </div>
          )}

          {status.inviteCode && (
            <div className="p-3 bg-surface/90 rounded-lg border border-border">
              <p className="text-xs text-muted mb-1.5 font-medium">Invite Link</p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${status.inviteCode}`}
                  className="flex-1 bg-background border border-border text-foreground rounded px-2 py-1.5 text-xs font-mono truncate"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/invite/${status.inviteCode}`)}
                  className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded text-xs transition-colors shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          <div className="pt-2">
            <Link
              href={`/dashboard/${id}`}
              className="block text-center text-xs text-accent border border-accent/30 hover:bg-accent/8 rounded-lg py-2 transition-colors"
            >
              Full Dashboard
            </Link>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Helpers ───

function StatBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="p-2 bg-surface/90 backdrop-blur-sm rounded-lg border border-border text-center">
      <p className="text-base font-mono font-bold text-foreground">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  )
}

function IdeaStatus({ status, isChampion }: { status: string; isChampion: boolean }) {
  if (isChampion) return <span className="text-[10px] text-success font-bold">Priority</span>
  const map: Record<string, { label: string; color: string }> = {
    ADVANCING: { label: 'Advancing', color: 'text-accent' },
    IN_VOTING: { label: 'In Cell', color: 'text-success' },
    ELIMINATED: { label: 'Eliminated', color: 'text-muted' },
    PENDING: { label: 'Waiting', color: 'text-muted' },
  }
  const badge = map[status]
  if (!badge) return null
  return <span className={`text-[10px] ${badge.color}`}>{badge.label}</span>
}
