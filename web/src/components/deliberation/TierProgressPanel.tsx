'use client'

import { useEffect, useState } from 'react'
import Section from './Section'
import type { TierInfo } from './types'

export default function TierProgressPanel({ deliberationId, currentTier, onRefresh }: {
  deliberationId: string
  currentTier: number
  onRefresh: () => void
}) {
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCell, setSelectedCell] = useState<TierInfo['cells'][0] | null>(null)

  useEffect(() => {
    const fetchTierInfo = async () => {
      try {
        const res = await fetch(`/api/deliberations/${deliberationId}/tiers/${currentTier}`)
        if (res.ok) setTierInfo(await res.json())
      } catch (err) {
        console.error('Failed to fetch tier info:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTierInfo()
    const interval = setInterval(fetchTierInfo, 5000)
    return () => clearInterval(interval)
  }, [deliberationId, currentTier])

  if (loading || !tierInfo) return null

  const { stats, cells, ideas, liveTally, isBatch, batchGroups } = tierInfo
  const isFinalShowdown = isBatch && ideas && ideas.length <= 5 && cells.length > 0

  return (
    <Section
      title={isFinalShowdown ? `Final Showdown - Tier ${currentTier}` : `Tier ${currentTier} Progress`}
      badge={
        <span className={`text-xs px-2 py-0.5 rounded font-mono ${
          isFinalShowdown ? 'bg-purple text-white' : 'bg-warning text-black'
        }`}>
          {stats.completedCells}/{stats.totalCells} cells
        </span>
      }
      variant={isFinalShowdown ? 'purple' : 'warning'}
      defaultOpen={true}
    >
      {isFinalShowdown && (
        <div className="bg-purple-bg border border-purple rounded-lg p-3 mb-4 text-center">
          <div className="text-purple font-semibold text-sm">All {stats.totalCells} cells voting on the same {ideas?.length} ideas!</div>
          <div className="text-xs text-muted mt-1">Cross-cell tallying determines the champion</div>
        </div>
      )}

      <div className="mb-4">
        <div className="flex justify-between text-xs text-muted mb-1">
          <span>{stats.totalVotesCast} of {stats.totalVotesExpected} votes cast</span>
          <span>{stats.votingProgress}%</span>
        </div>
        <div className="w-full bg-background rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${isFinalShowdown ? 'bg-purple' : 'bg-warning'}`}
            style={{ width: `${stats.votingProgress}%` }}
          />
        </div>
      </div>

      {isBatch && liveTally && liveTally.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-muted uppercase tracking-wide mb-2">
            {isFinalShowdown ? 'Live Championship Tally' : 'Live Vote Tally'}
          </p>
          <div className="space-y-1">
            {liveTally.map((item, index) => {
              const maxVotes = Math.max(...liveTally.map(i => i.voteCount), 1)
              const percentage = maxVotes > 0 ? (item.voteCount / maxVotes) * 100 : 0
              const isLeading = index === 0 && item.voteCount > 0
              return (
                <div key={item.ideaId} className="relative">
                  <div
                    className={`absolute inset-y-0 left-0 rounded ${
                      isLeading ? (isFinalShowdown ? 'bg-purple-bg' : 'bg-warning-bg') : 'bg-surface'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                  <div className="relative flex justify-between items-center p-2 text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isLeading && <span className="text-success">●</span>}
                      <span className="text-foreground truncate">{item.text}</span>
                    </div>
                    <span className={`font-mono ml-2 ${
                      isLeading ? (isFinalShowdown ? 'text-purple font-bold' : 'text-warning font-bold') : 'text-muted'
                    }`}>
                      {item.voteCount}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mb-2">
        {(() => {
          const batches = new Map<number, typeof cells>()
          for (const cell of cells) {
            const b = cell.batch ?? 0
            if (!batches.has(b)) batches.set(b, [])
            batches.get(b)!.push(cell)
          }
          const batchEntries = [...batches.entries()].sort((a, b) => a[0] - b[0])
          const hasMultipleBatches = batchEntries.length > 1

          if (isBatch || !hasMultipleBatches) {
            return (
              <>
                <p className="text-xs text-muted uppercase tracking-wide mb-2">
                  {isFinalShowdown ? 'All Cells (voting on same ideas)' : hasMultipleBatches ? 'Batches (each with unique ideas)' : 'Cells'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cells.map((cell, index) => {
                    const isComplete = cell.status === 'COMPLETED'
                    return (
                      <button
                        key={cell.id}
                        onClick={() => setSelectedCell(cell)}
                        className={`w-10 h-10 rounded flex flex-col items-center justify-center text-[10px] font-mono transition-all cursor-pointer hover:ring-2 hover:ring-accent ${
                          isComplete
                            ? 'bg-success-bg border border-success text-success'
                            : 'bg-surface border border-border text-muted'
                        }`}
                        title={`Cell ${index + 1}: ${cell.votedCount}/${cell.participantCount} voted`}
                      >
                        <span>{cell.votedCount}/{cell.participantCount}</span>
                        {isComplete && <span>✓</span>}
                      </button>
                    )
                  })}
                </div>
              </>
            )
          }

          return (
            <>
              <p className="text-xs text-muted uppercase tracking-wide mb-2">
                Batches (each with unique ideas)
              </p>
              <div className="space-y-2">
                {batchEntries.map(([batchNum, batchCells]) => (
                  <div key={batchNum} className="border-l-2 border-accent/30 pl-3">
                    <div className="text-xs text-accent mb-1 flex items-center gap-2">
                      <span className="font-medium">Batch {batchNum + 1}</span>
                      <span className="text-muted">({batchCells.length} cells, {batchCells.reduce((s, c) => s + c.participantCount, 0)} people)</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {batchCells.map((cell, index) => {
                        const isComplete = cell.status === 'COMPLETED'
                        return (
                          <button
                            key={cell.id}
                            onClick={() => setSelectedCell(cell)}
                            className={`w-10 h-10 rounded flex flex-col items-center justify-center text-[10px] font-mono transition-all cursor-pointer hover:ring-2 hover:ring-accent ${
                              isComplete
                                ? 'bg-success-bg border border-success text-success'
                                : 'bg-surface border border-border text-muted'
                            }`}
                            title={`Batch ${batchNum + 1}, Cell ${index + 1}: ${cell.votedCount}/${cell.participantCount} voted`}
                          >
                            <span>{cell.votedCount}/{cell.participantCount}</span>
                            {isComplete && <span>✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        })()}
      </div>

      {!isBatch && ideas && ideas.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted uppercase tracking-wide mb-2">Ideas Competing ({ideas.length})</p>
          {batchGroups && batchGroups.length > 1 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {batchGroups.map(group => (
                <div key={group.batch}>
                  <p className="text-xs text-muted font-medium mb-1">Batch {group.batch + 1} ({group.ideas.length} ideas)</p>
                  <div className="space-y-1">
                    {group.ideas.map(idea => (
                      <div
                        key={idea.id}
                        className={`p-2 rounded text-xs ${
                          idea.status === 'ADVANCING' ? 'bg-success-bg border border-success' :
                          idea.status === 'ELIMINATED' ? 'bg-surface text-muted' :
                          'bg-background border border-border'
                        }`}
                      >
                        <p className="text-foreground truncate">{idea.text}</p>
                        <p className="text-muted text-xs">{idea.author?.name || 'Anonymous'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {ideas.map(idea => (
                <div
                  key={idea.id}
                  className={`p-2 rounded text-xs ${
                    idea.status === 'ADVANCING' ? 'bg-success-bg border border-success' :
                    idea.status === 'ELIMINATED' ? 'bg-surface text-muted' :
                    'bg-background border border-border'
                  }`}
                >
                  <p className="text-foreground truncate">{idea.text}</p>
                  <p className="text-muted text-xs">{idea.author?.name || 'Anonymous'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedCell && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCell(null)}>
          <div className="bg-surface rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-bold">Cell Details</h3>
              <button onClick={() => setSelectedCell(null)} className="text-muted hover:text-foreground">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted">Status</span>
                <span className={selectedCell.status === 'COMPLETED' ? 'text-success font-medium' : 'text-warning font-medium'}>
                  {selectedCell.status === 'COMPLETED' ? 'Completed' : 'Voting'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted">Votes</span>
                <span className="font-mono">{selectedCell.votedCount}/{selectedCell.participantCount}</span>
              </div>
              {selectedCell.status === 'COMPLETED' && selectedCell.winner && (
                <div className="bg-success-bg border border-success rounded-lg p-3">
                  <p className="text-success text-xs font-semibold uppercase mb-1">Winner</p>
                  <p className="text-foreground">{selectedCell.winner.text}</p>
                  <p className="text-muted text-sm">by {selectedCell.winner.author}</p>
                </div>
              )}
              <div>
                <p className="text-muted text-xs uppercase mb-2">Ideas in this cell</p>
                <div className="space-y-2">
                  {selectedCell.ideas?.map(idea => (
                    <div key={idea.id} className={`p-2 rounded border ${
                      selectedCell.winner?.id === idea.id ? 'bg-success-bg border-success' : 'bg-background border-border'
                    }`}>
                      <p className="text-foreground text-sm">{idea.text}</p>
                      <div className="flex justify-between text-xs text-muted mt-1">
                        <span>by {idea.author?.name || 'Anonymous'}</span>
                        {idea.voteCount !== undefined && <span>{idea.voteCount} votes</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-3 text-xs text-muted">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-surface border border-border"></div>
          <span>Voting</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-success-bg border border-success"></div>
          <span>Complete</span>
        </div>
        <span className="ml-auto">{stats.totalParticipants} participants</span>
      </div>
    </Section>
  )
}
