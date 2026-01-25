import { useMemo } from 'react'
import './ProcessVisualization.css'

function ProcessVisualization({ state, winner }) {
  // Group cells by tier (only show tiers up to current tier - don't show future tiers)
  const tierData = useMemo(() => {
    if (!state || !state.cells.length) return []

    const tiers = [...new Set(state.cells.map(c => c.tier))]
      .filter(t => t <= state.currentTier)  // Only show tiers that have started
      .sort((a, b) => a - b)

    return tiers.map(tier => {
      const tierCells = state.cells.filter(c => c.tier === tier)
      const isTier1 = tier === 1

      // Group by batch for Tier 2+
      let batches = []
      if (isTier1) {
        // Tier 1: No batches, each cell is independent
        batches = [{
          id: 'all',
          ideas: [],
          cells: tierCells
        }]
      } else {
        // Tier 2+: Group by batch
        const batchNums = [...new Set(tierCells.map(c => c.batch))].sort()
        batches = batchNums.map(batchNum => {
          const batchCells = tierCells.filter(c => c.batch === batchNum)
          const batchIdeas = batchCells[0]?.ideaIds || []
          return {
            id: batchNum,
            ideas: batchIdeas,
            cells: batchCells
          }
        })
      }

      // Calculate tier stats
      const completedCount = tierCells.filter(c => c.status === 'completed').length
      const totalCells = tierCells.length
      const advancingIdeas = state.ideas.filter(i =>
        i.tier === tier && (i.status === 'cell-winner' || i.status === 'winner')
      ).length

      return {
        tier,
        batches,
        completedCount,
        totalCells,
        advancingIdeas,
        isCurrent: tier === state.currentTier,
        isComplete: completedCount === totalCells
      }
    })
  }, [state])

  // Get winner idea text
  const winnerIdea = useMemo(() => {
    if (!winner) return null
    return state?.ideas?.find(i => i.status === 'winner')
  }, [state, winner])

  if (!state || state.cells.length === 0) {
    return (
      <div className="process-viz">
        <div className="viz-empty">
          Run a demo to see the voting process unfold
        </div>
      </div>
    )
  }

  return (
    <div className="process-viz">
      <div className="viz-timeline">
        {tierData.map((tier, idx) => (
          <div key={tier.tier} className="viz-tier-wrapper">
            {/* Tier column */}
            <div className={`viz-tier ${tier.isCurrent ? 'viz-tier-current' : ''} ${tier.isComplete ? 'viz-tier-complete' : ''}`}>
              <div className="viz-tier-header">
                <span className="viz-tier-label">Tier {tier.tier}</span>
                <span className="viz-tier-progress">{tier.completedCount}/{tier.totalCells}</span>
              </div>

              <div className="viz-batches">
                {tier.batches.map(batch => (
                  <div key={batch.id} className={`viz-batch ${tier.tier > 1 ? 'viz-batch-grouped' : ''}`}>
                    {tier.tier > 1 && (
                      <div className="viz-batch-label">
                        Batch {batch.id}
                        <span className="viz-batch-ideas">{batch.ideas.length} ideas</span>
                      </div>
                    )}
                    <div className="viz-cells">
                      {batch.cells.map(cell => (
                        <div
                          key={cell.id}
                          className={`viz-cell viz-cell-${cell.status} ${cell.completedByTimeout ? 'viz-cell-timeout' : ''}`}
                          title={`${cell.id}: ${cell.votesCast}/${cell.votesNeeded} votes`}
                        >
                          <span className="viz-cell-votes">{cell.votesCast}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="viz-tier-footer">
                {tier.isComplete && tier.advancingIdeas > 0 && (
                  <span className="viz-advancing">{tier.advancingIdeas} advancing</span>
                )}
              </div>
            </div>

            {/* Arrow between tiers */}
            {idx < tierData.length - 1 && (
              <div className="viz-arrow">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5l8 7-8 7V5z" />
                </svg>
              </div>
            )}
          </div>
        ))}

        {/* Winner column */}
        <div className="viz-tier-wrapper">
          <div className="viz-arrow">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5l8 7-8 7V5z" />
            </svg>
          </div>
          <div className={`viz-winner ${winnerIdea ? 'viz-winner-declared' : ''}`}>
            <div className="viz-winner-header">Winner</div>
            {winnerIdea ? (
              <div className="viz-winner-content">
                <div className="viz-winner-star">★</div>
                <div className="viz-winner-text">{winnerIdea.text}</div>
                <div className="viz-winner-id">{winnerIdea.id}</div>
              </div>
            ) : (
              <div className="viz-winner-pending">
                <div className="viz-winner-placeholder">?</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="viz-legend">
        <div className="viz-legend-item">
          <div className="viz-cell viz-cell-voting viz-legend-dot"></div>
          <span>Voting</span>
        </div>
        <div className="viz-legend-item">
          <div className="viz-cell viz-cell-completed viz-legend-dot"></div>
          <span>Complete</span>
        </div>
        <div className="viz-legend-item">
          <div className="viz-cell viz-cell-timeout viz-legend-dot"></div>
          <span>Timeout</span>
        </div>
        <div className="viz-legend-item">
          <div className="viz-winner-star viz-legend-star">★</div>
          <span>Winner</span>
        </div>
      </div>
    </div>
  )
}

export default ProcessVisualization
