'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import CountdownTimer from '@/components/CountdownTimer'
import { useToast } from '@/components/Toast'
import { getDisplayName } from '@/lib/user'
import CellDiscussion from './CellDiscussion'
import type { Cell } from './types'

type RevisionVoter = { userId: string; approve: boolean; user: { name: string | null } }
type Revision = {
  id: string
  proposedText: string
  proposedBy: { id: string; name: string | null }
  status: string
  approvals: number
  required: number
  votes: RevisionVoter[]
}

export default function VotingCell({
  cell,
  onVote,
  voting,
  onRefresh
}: {
  cell: Cell
  onVote: (cellId: string, allocations: { ideaId: string; points: number }[]) => void
  voting: string | null
  onRefresh: () => void
}) {
  const { data: session } = useSession()
  const { showToast } = useToast()
  const userId = session?.user?.id
  const hasVoted = cell.votes.length > 0
  const isActive = cell.status === 'VOTING' && !hasVoted
  const isFinalizing = cell.status === 'VOTING' && !!cell.finalizesAt
  const canChangeVote = isFinalizing && hasVoted

  // Build initial XP state from existing votes (for change mode)
  const existingAllocation: Record<string, number> = {}
  if (hasVoted) {
    cell.votes.forEach(v => {
      existingAllocation[v.ideaId] = (existingAllocation[v.ideaId] || 0) + v.xpPoints
    })
  }

  const [xp, setXP] = useState<Record<string, number>>({})
  const [editing, setEditing] = useState(false)

  // Revision state
  const [revisions, setRevisions] = useState<Record<string, Revision>>({})
  const [editingIdea, setEditingIdea] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [submittingRevision, setSubmittingRevision] = useState(false)
  const [confirmingRevision, setConfirmingRevision] = useState<string | null>(null)
  const [showEdit, setShowEdit] = useState<Record<string, boolean>>({}) // toggle original vs proposed

  // Track text changes for flash effect (cross-cell edit propagation)
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  const prevTexts = useRef<Record<string, string>>({})
  useEffect(() => {
    const newFlash = new Set<string>()
    for (const ci of cell.ideas) {
      const prev = prevTexts.current[ci.idea.id]
      if (prev !== undefined && prev !== ci.idea.text) {
        newFlash.add(ci.idea.id)
      }
      prevTexts.current[ci.idea.id] = ci.idea.text
    }
    if (newFlash.size > 0) {
      setFlashIds(newFlash)
      const timer = setTimeout(() => setFlashIds(new Set()), 3000)
      return () => clearTimeout(timer)
    }
  }, [cell.ideas])

  const totalSpent = Object.values(xp).reduce((sum, v) => sum + v, 0)
  const remaining = 10 - totalSpent
  const canEdit = cell.status === 'DELIBERATING' || cell.status === 'VOTING'

  // Fetch pending revisions for ideas in this cell
  const ideaIds = cell.ideas.map(ci => ci.idea.id).join(',')
  useEffect(() => {
    if (!canEdit || !ideaIds) return
    const fetchRevisions = async () => {
      const results: Record<string, Revision> = {}
      for (const id of ideaIds.split(',')) {
        try {
          const res = await fetch(`/api/ideas/${id}/revise`)
          if (res.ok) {
            const data = await res.json()
            if (data.revision) results[id] = data.revision
          }
        } catch { /* ignore */ }
      }
      setRevisions(results)
    }
    fetchRevisions()
  }, [ideaIds, canEdit])

  const adjustXP = useCallback((ideaId: string, delta: number) => {
    setXP(prev => {
      const current = prev[ideaId] || 0
      const newVal = Math.max(0, Math.min(10, current + delta))
      const newTotal = Object.entries(prev).reduce(
        (sum, [id, v]) => sum + (id === ideaId ? newVal : v), 0
      )
      if (newTotal > 10) return prev
      const next = { ...prev, [ideaId]: newVal }
      if (next[ideaId] === 0) delete next[ideaId]
      return next
    })
  }, [])

  const handleSubmit = () => {
    const allocations = Object.entries(xp)
      .filter(([, points]) => points > 0)
      .map(([ideaId, points]) => ({ ideaId, points }))
    if (allocations.length === 0 || remaining !== 0) return
    onVote(cell.id, allocations)
  }

  const startEditing = () => {
    setXP(existingAllocation)
    setEditing(true)
  }

  const handleProposeRevision = async (ideaId: string) => {
    if (!editText.trim() || editText.trim().length < 5) return
    setSubmittingRevision(true)
    try {
      const res = await fetch(`/api/ideas/${ideaId}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newText: editText }),
      })
      if (res.ok) {
        const data = await res.json()
        setRevisions(prev => ({ ...prev, [ideaId]: data.revision }))
        setEditingIdea(null)
        setEditText('')
        showToast('Chant proposed — waiting for confirmations', 'success')
      } else {
        const data = await res.json().catch(() => ({ error: 'Failed to propose edit' }))
        showToast(data.error || 'Failed to propose edit', 'error')
      }
    } catch {
      showToast('Network error — please try again', 'error')
    } finally {
      setSubmittingRevision(false)
    }
  }

  const handleConfirm = async (ideaId: string) => {
    setConfirmingRevision(ideaId)
    try {
      const res = await fetch(`/api/ideas/${ideaId}/revise/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve: true }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'approved') {
          setRevisions(prev => {
            const next = { ...prev }
            delete next[ideaId]
            return next
          })
          showToast('Chant approved!', 'success')
          onRefresh()
        } else {
          // Re-fetch the full revision to get accurate state
          const revRes = await fetch(`/api/ideas/${ideaId}/revise`)
          if (revRes.ok) {
            const revData = await revRes.json()
            if (revData.revision) {
              setRevisions(prev => ({ ...prev, [ideaId]: revData.revision }))
            }
          }
          showToast('Confirmation recorded', 'success')
        }
      } else {
        const data = await res.json().catch(() => ({ error: 'Failed to confirm' }))
        showToast(data.error || 'Failed to confirm edit', 'error')
      }
    } catch {
      showToast('Network error — please try again', 'error')
    } finally {
      setConfirmingRevision(null)
    }
  }

  const showStepper = (isActive && !hasVoted) || editing

  return (
    <div className={`rounded-lg border p-3 ${isActive ? 'border-warning bg-warning-bg' : isFinalizing ? 'border-accent bg-accent-light' : 'border-border'}`}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">Tier {cell.tier}</span>
          {isActive && <span className="w-2 h-2 bg-warning rounded-full animate-pulse" />}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {cell.status === 'VOTING' && cell.votingDeadline && !isFinalizing && (
            <CountdownTimer deadline={cell.votingDeadline} onExpire={onRefresh} compact />
          )}
          {isFinalizing && cell.finalizesAt && (
            <CountdownTimer deadline={cell.finalizesAt} onExpire={onRefresh} compact label="Finalizing" />
          )}
          <span className={`px-2 py-0.5 rounded text-xs ${
            cell.status === 'COMPLETED' ? 'bg-success-bg text-success' :
            isFinalizing ? 'bg-accent-light text-accent' :
            hasVoted && !editing ? 'bg-accent-light text-accent' :
            'bg-warning-bg text-warning'
          }`}>
            {isFinalizing ? 'Finalizing' : hasVoted && !editing && cell.status === 'VOTING' ? 'Voted' : cell.status}
          </span>
        </div>
      </div>

      {isFinalizing && !editing && (
        <p className="text-xs text-accent mb-2">All votes in — you can change your XP before it finalizes.</p>
      )}

      {/* XP remaining header */}
      {showStepper && (
        <div className={`text-center text-sm font-medium mb-2 ${remaining === 0 ? 'text-success' : 'text-warning'}`}>
          {remaining === 0 ? 'All 10 XP allocated' : `${remaining} XP remaining`}
        </div>
      )}

      <div className="space-y-1.5">
        {cell.ideas.map(({ idea }) => {
          const isWinner = idea.status === 'ADVANCING' || idea.status === 'WINNER'
          const isEliminated = idea.status === 'ELIMINATED'
          const isFlashing = flashIds.has(idea.id)
          const allocated = xp[idea.id] || 0
          const votedXP = existingAllocation[idea.id] || 0
          const revision = revisions[idea.id]
          const isProposer = revision?.proposedBy.id === userId
          const userConfirmed = revision?.votes.some(v => v.userId === userId && v.approve)
          const showingEdit = showEdit[idea.id] && revision
          const displayText = showingEdit ? revision!.proposedText : idea.text

          return (
            <div key={idea.id}>
              <div
                className={`p-2 rounded text-sm transition-all ${
                  isFlashing ? 'animate-idea-flash ring-2 ring-blue' :
                  isWinner ? 'bg-success-bg border border-success' :
                  isEliminated ? 'bg-surface text-muted border border-border' :
                  allocated > 0 ? 'bg-accent-light border border-accent' :
                  votedXP > 0 && !editing ? 'bg-accent-light border border-accent' :
                  revision ? 'bg-blue-bg border border-blue' :
                  'bg-background border border-border'
                }`}
              >
                {/* Idea text + edit toggle */}
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`${isEliminated ? 'text-muted' : 'text-foreground'} ${showingEdit ? 'text-blue' : ''}`}>
                      {displayText}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted">{getDisplayName(idea.author)}</p>
                      {/* Edit button — anyone in an active cell */}
                      {canEdit && !revision && !isEliminated && (
                        <button
                          onClick={() => { setEditingIdea(idea.id); setEditText(idea.text) }}
                          className="text-[10px] text-muted hover:text-accent transition-colors"
                        >
                          chant
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 ml-1 shrink-0">
                    {/* Swipe toggle: original / edit */}
                    {revision && (
                      <button
                        onClick={() => setShowEdit(prev => ({ ...prev, [idea.id]: !prev[idea.id] }))}
                        className={`text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                          showingEdit ? 'bg-blue text-white' : 'bg-surface text-blue border border-blue'
                        }`}
                        title={showingEdit ? 'Show original' : 'Show proposed chant'}
                      >
                        {showingEdit ? 'chant' : 'orig'}
                      </button>
                    )}

                    {/* Completed: show XP total */}
                    {cell.status === 'COMPLETED' && (
                      <span className="text-muted text-xs font-mono">{idea.totalXP} XP</span>
                    )}

                    {/* Stepper: +/- controls */}
                    {showStepper && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => adjustXP(idea.id, -1)}
                          disabled={allocated === 0}
                          className="w-6 h-6 rounded bg-surface border border-border text-foreground text-xs font-bold disabled:opacity-30 hover:bg-background transition-colors"
                        >
                          -
                        </button>
                        <span className={`w-6 text-center text-xs font-mono ${allocated > 0 ? 'text-accent font-bold' : 'text-muted'}`}>
                          {allocated}
                        </span>
                        <button
                          onClick={() => adjustXP(idea.id, 1)}
                          disabled={remaining === 0}
                          className="w-6 h-6 rounded bg-surface border border-border text-foreground text-xs font-bold disabled:opacity-30 hover:bg-background transition-colors"
                        >
                          +
                        </button>
                      </div>
                    )}

                    {/* Voted (not editing): show user's allocation */}
                    {hasVoted && !editing && cell.status === 'VOTING' && votedXP > 0 && (
                      <span className="text-accent text-xs font-mono">{votedXP} XP</span>
                    )}

                    {isWinner && <span className="text-success text-xs">&#8593;</span>}
                  </div>
                </div>

                {/* Revision confirm bar — inside the idea box */}
                {revision && !isProposer && (
                  <div className="mt-1.5 pt-1.5 border-t border-blue/20 flex items-center justify-between">
                    <span className="text-[10px] text-blue">
                      Chant by {revision.proposedBy.name || 'Anonymous'} &middot; {revision.approvals}/{revision.required} confirmed
                    </span>
                    {userConfirmed ? (
                      <span className="text-[10px] text-success font-medium px-2 py-0.5 bg-success-bg rounded">
                        Confirmed
                      </span>
                    ) : (
                      <button
                        onClick={() => handleConfirm(idea.id)}
                        disabled={confirmingRevision === idea.id}
                        className="text-[10px] font-medium px-2 py-0.5 bg-blue text-white rounded hover:bg-blue-hover transition-colors disabled:opacity-40"
                      >
                        {confirmingRevision === idea.id ? '...' : 'Confirm'}
                      </button>
                    )}
                  </div>
                )}

                {/* Proposer sees status */}
                {revision && isProposer && (
                  <div className="mt-1.5 pt-1.5 border-t border-blue/20">
                    <span className="text-[10px] text-blue">
                      Your chant &middot; {revision.approvals}/{revision.required} confirmed
                      {revision.votes.filter(v => v.approve).map(v => (
                        <span key={v.userId} className="ml-1 text-success">&bull; {v.user.name || 'anon'}</span>
                      ))}
                    </span>
                  </div>
                )}
              </div>

              {/* Inline edit form */}
              {editingIdea === idea.id && (
                <div className="mt-1 p-2 rounded border border-blue bg-blue-bg">
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={2}
                    className="w-full text-sm bg-background border border-border rounded p-2 text-foreground resize-none"
                    placeholder="Propose a chant..."
                  />
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => handleProposeRevision(idea.id)}
                      disabled={submittingRevision || editText.trim() === idea.text || editText.trim().length < 5}
                      className="px-3 py-1 bg-blue text-white text-xs rounded font-medium disabled:opacity-40 hover:bg-blue-hover transition-colors"
                    >
                      {submittingRevision ? 'Proposing...' : 'Propose Chant'}
                    </button>
                    <button
                      onClick={() => { setEditingIdea(null); setEditText('') }}
                      className="px-3 py-1 text-muted text-xs hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Submit / Change buttons */}
      {showStepper && (
        <button
          onClick={handleSubmit}
          disabled={remaining !== 0 || voting === cell.id}
          className="w-full mt-3 py-2 rounded-lg bg-warning hover:bg-warning-hover text-black text-sm font-medium disabled:opacity-40 transition-colors"
        >
          {voting === cell.id ? 'Submitting...' : editing ? 'Update XP' : 'Submit XP'}
        </button>
      )}

      {canChangeVote && !editing && (
        <button
          onClick={startEditing}
          className="w-full mt-2 py-1.5 rounded-lg border border-accent text-accent text-sm font-medium hover:bg-accent-light transition-colors"
        >
          Change XP
        </button>
      )}

      <CellDiscussion
        cellId={cell.id}
        isParticipant={true}
        ideas={cell.ideas.map(ci => ({ id: ci.idea.id, text: ci.idea.text }))}
      />
    </div>
  )
}
