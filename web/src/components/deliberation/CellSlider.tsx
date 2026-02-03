'use client'

import { useState } from 'react'
import VotingCell from './VotingCell'
import type { Cell } from './types'

export default function CellSlider({
  activeCells,
  votedCells,
  onVote,
  voting,
  onRefresh,
}: {
  activeCells: Cell[]
  votedCells: Cell[]
  onVote: (cellId: string, ideaId: string) => void
  voting: string | null
  onRefresh: () => void
}) {
  // Active cells first, then voted/completed — sorted by tier descending
  const allCells = [
    ...activeCells.sort((a, b) => b.tier - a.tier),
    ...votedCells.sort((a, b) => b.tier - a.tier),
  ]

  const [index, setIndex] = useState(0)

  const prev = () => setIndex(i => Math.max(0, i - 1))
  const next = () => setIndex(i => Math.min(allCells.length - 1, i + 1))

  const current = allCells.length > 0 ? allCells[Math.min(index, allCells.length - 1)] : null

  return (
    <div>
      {/* Header with nav */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Your Cells</span>
          {activeCells.length > 0 && (
            <span className="text-xs bg-warning text-black px-1.5 py-0.5 rounded font-medium">
              {activeCells.length} to vote
            </span>
          )}
        </div>
        {allCells.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={prev}
              disabled={index === 0}
              className="w-7 h-7 rounded flex items-center justify-center text-muted hover:text-foreground hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-xs text-muted font-mono min-w-[3ch] text-center">
              {index + 1}/{allCells.length}
            </span>
            <button
              onClick={next}
              disabled={index === allCells.length - 1}
              className="w-7 h-7 rounded flex items-center justify-center text-muted hover:text-foreground hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Dot indicators */}
      {allCells.length > 1 && (
        <div className="flex items-center gap-1 mb-2 overflow-x-auto">
          {allCells.map((cell, i) => {
            const isCellActive = cell.status === 'VOTING' && cell.votes.length === 0
            const isCellVoted = cell.votes.length > 0 && cell.status === 'VOTING'
            const isCellComplete = cell.status === 'COMPLETED'
            return (
              <button
                key={cell.id}
                onClick={() => setIndex(i)}
                className={`shrink-0 h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4' : 'w-1.5'
                } ${
                  i === index
                    ? isCellActive ? 'bg-warning' : isCellComplete ? 'bg-success' : 'bg-accent'
                    : isCellActive ? 'bg-warning/40' : isCellComplete ? 'bg-success/40' : 'bg-border'
                }`}
              />
            )
          })}
        </div>
      )}

      {/* Current cell or empty state */}
      {current ? (
        <VotingCell
          cell={current}
          onVote={onVote}
          voting={voting}
          onRefresh={onRefresh}
        />
      ) : (
        <div className="rounded-lg border border-border border-dashed p-6 text-center">
          <p className="text-muted text-sm">No cells yet — you'll be assigned when voting begins</p>
        </div>
      )}
    </div>
  )
}
