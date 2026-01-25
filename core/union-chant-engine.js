// Union Chant Engine - Core Logic Module
// Extracted from v7-STABLE, preserves proven algorithms
// Pure logic, no HTTP - can be used by any interface

class UnionChantEngine {
  constructor(config = {}) {
    this.participants = []
    this.ideas = []
    this.cells = []
    this.votes = []
    this.comments = []  // NEW: For deliberation
    this.phase = 'submission'  // 'submission', 'voting', 'completed'
    this.currentTier = 1
    this.CELL_SIZE = 5  // Target cell size
    this.MAX_IDEAS_PER_CELL = 7

    // Timer and quorum settings
    this.votingTimeoutMs = config.votingTimeoutMs || 60000  // Default 1 minute
    this.quorumPercent = config.quorumPercent || 0.5  // 50% quorum
  }

  // === CORE ALGORITHM (Preserved from v7-STABLE) ===

  /**
   * Flexible cell sizing algorithm (3-7 participants per cell)
   * Preserved from v7-STABLE
   */
  calculateCellSizes(totalParticipants) {
    if (totalParticipants < 3) return []
    if (totalParticipants === 3) return [3]
    if (totalParticipants === 4) return [4]

    let numCells = Math.floor(totalParticipants / 5)
    let remainder = totalParticipants % 5

    if (remainder === 0) return Array(numCells).fill(5)

    if (remainder === 1) {
      if (numCells > 0) {
        numCells--
        remainder += 5
        return [...Array(numCells).fill(5), remainder]
      }
    }

    if (remainder === 2) {
      if (numCells > 0) {
        numCells--
        remainder += 5
        return [...Array(numCells).fill(5), remainder]
      }
    }

    if (remainder === 3) return [...Array(numCells).fill(5), 3]
    if (remainder === 4) return [...Array(numCells).fill(5), 4]

    return Array(numCells).fill(5)
  }

  /**
   * Reset system to initial state
   */
  reset() {
    this.participants = []
    this.ideas = []
    this.cells = []
    this.votes = []
    this.comments = []
    this.phase = 'submission'
    this.currentTier = 1

    return { success: true }
  }

  /**
   * Add participant to the system
   */
  addParticipant(participantData) {
    if (this.phase !== 'submission') {
      throw new Error('Not in submission phase')
    }

    const participant = {
      id: participantData.id || `p-${this.participants.length + 1}`,
      name: participantData.name,
      type: participantData.type || 'human',  // 'human' or 'ai-agent'
      personality: participantData.personality,  // For AI agents
      joinedAt: Date.now()
    }

    this.participants.push(participant)
    return participant
  }

  /**
   * Add idea to the system
   */
  addIdea(ideaData) {
    if (this.phase !== 'submission') {
      throw new Error('Not in submission phase')
    }

    const idea = {
      id: ideaData.id || `idea-${this.ideas.length + 1}`,
      text: ideaData.text,
      author: ideaData.author,
      authorId: ideaData.authorId,
      tier: 1,
      status: 'submitted',
      createdAt: Date.now()
    }

    this.ideas.push(idea)
    return idea
  }

  /**
   * Start voting phase - form Tier 1 cells
   */
  startVoting() {
    if (this.phase !== 'submission') {
      throw new Error('Not in submission phase')
    }

    const MIN_PARTICIPANTS = 3
    if (this.participants.length < MIN_PARTICIPANTS) {
      throw new Error(`Need at least ${MIN_PARTICIPANTS} participants`)
    }

    this.formTier1Cells()
    this.phase = 'voting'

    return {
      success: true,
      cellsFormed: this.cells.length,
      phase: 'voting'
    }
  }

  /**
   * Form Tier 1 cells (different ideas per cell)
   * Preserved from v7-STABLE
   */
  formTier1Cells() {
    const cellSizes = this.calculateCellSizes(this.participants.length)
    const numCells = cellSizes.length

    // Calculate max ideas each cell can receive (min of cellSize and 7)
    const cellMaxIdeas = cellSizes.map(size => Math.min(size, this.MAX_IDEAS_PER_CELL))

    let participantIndex = 0
    let ideaIndex = 0

    for (let i = 0; i < numCells; i++) {
      const cellSize = cellSizes[i]
      const maxIdeasForCell = cellMaxIdeas[i]

      // Assign participants
      const cellParticipants = this.participants.slice(participantIndex, participantIndex + cellSize)
      participantIndex += cellSize

      // Calculate how many ideas this cell should get
      const ideasLeft = this.ideas.length - ideaIndex
      const cellsLeft = numCells - i
      const fairShare = Math.ceil(ideasLeft / cellsLeft)
      const cellIdeaCount = Math.min(fairShare, maxIdeasForCell, ideasLeft)

      // Assign ideas (different ideas per cell)
      const cellIdeas = this.ideas.slice(ideaIndex, ideaIndex + cellIdeaCount)
      ideaIndex += cellIdeaCount

      // Mark ideas as in this cell
      cellIdeas.forEach(idea => {
        idea.status = 'in-voting'
      })

      const cell = {
        id: `cell-${this.cells.length + 1}`,
        tier: 1,
        participants: cellParticipants.map(p => p.id),
        ideaIds: cellIdeas.map(idea => idea.id),
        votesNeeded: cellSize,
        quorumNeeded: Math.ceil(cellSize * this.quorumPercent),
        status: 'voting',
        createdAt: Date.now(),
        votingStartedAt: null,  // Set when deliberation ends
        votingDeadline: null    // Set when voting starts
      }

      this.cells.push(cell)
    }

    return this.cells.filter(c => c.tier === 1)
  }

  /**
   * Form cells for Tier 2+ with idea batching
   * Ideas are divided among cell batches (like Tier 1, but for advancing ideas)
   */
  formNextTierCells(advancingIdeas, tier) {
    // Cell structure based on PARTICIPANTS (stays constant)
    const cellSizes = this.calculateCellSizes(this.participants.length)
    const numCells = cellSizes.length
    const numIdeas = advancingIdeas.length

    // Mark ideas as in this tier
    advancingIdeas.forEach(idea => {
      idea.tier = tier
      idea.status = 'in-voting'
    })

    // SPECIAL CASE: If we have very few ideas (2-4), all cells vote on all ideas
    // This is the final showdown - no batching needed
    if (numIdeas <= 4) {
      let participantIndex = 0

      for (let i = 0; i < numCells; i++) {
        const cellSize = cellSizes[i]
        const cellParticipants = this.participants.slice(participantIndex, participantIndex + cellSize)
        participantIndex += cellSize

        const cell = {
          id: `cell-${this.cells.length + 1}`,
          tier: tier,
          batch: 1, // All in one batch
          participants: cellParticipants.map(p => p.id),
          ideaIds: advancingIdeas.map(idea => idea.id), // ALL cells vote on ALL ideas
          votesNeeded: cellSize,
          quorumNeeded: Math.ceil(cellSize * this.quorumPercent),
          status: 'voting',
          createdAt: Date.now(),
          votingStartedAt: null,
          votingDeadline: null
        }

        this.cells.push(cell)
      }

      return this.cells.filter(c => c.tier === tier)
    }

    // NORMAL CASE: Batch ideas among cells
    // Goal: Reduce ideas by ~5:1 ratio each tier
    // Target ~5 ideas per batch to achieve this reduction
    const TARGET_REDUCTION_RATIO = 5
    const idealIdeasPerBatch = Math.min(this.MAX_IDEAS_PER_CELL, TARGET_REDUCTION_RATIO)

    // Determine how many batches we need
    const batchesNeeded = Math.max(1, Math.ceil(numIdeas / idealIdeasPerBatch))

    // Use batches as our cells needed
    const cellsNeeded = batchesNeeded

    // Group cells into batches
    const cellsPerBatch = Math.max(1, Math.floor(numCells / cellsNeeded))

    let participantIndex = 0
    let ideaIndex = 0

    for (let batchIdx = 0; batchIdx < cellsNeeded && ideaIndex < numIdeas; batchIdx++) {
      // Calculate how many ideas this batch gets
      const remainingIdeas = numIdeas - ideaIndex
      const remainingBatches = cellsNeeded - batchIdx
      const ideasInThisBatch = Math.ceil(remainingIdeas / remainingBatches)

      // Get ideas for this batch
      const batchIdeas = advancingIdeas.slice(ideaIndex, ideaIndex + ideasInThisBatch)
      ideaIndex += ideasInThisBatch

      // Calculate how many cells this batch gets
      const remainingCells = numCells - (batchIdx * cellsPerBatch)
      const cellsInThisBatch = Math.min(cellsPerBatch, remainingCells)

      // Create cells for this batch
      for (let cellInBatch = 0; cellInBatch < cellsInThisBatch && participantIndex < this.participants.length; cellInBatch++) {
        const cellSize = cellSizes[Math.floor(participantIndex / 5)] || 5

        const cellParticipants = this.participants.slice(participantIndex, participantIndex + cellSize)
        participantIndex += cellSize

        const cell = {
          id: `cell-${this.cells.length + 1}`,
          tier: tier,
          batch: batchIdx + 1,
          participants: cellParticipants.map(p => p.id),
          ideaIds: batchIdeas.map(idea => idea.id), // Cells in same batch get SAME ideas
          votesNeeded: cellSize,
          quorumNeeded: Math.ceil(cellSize * this.quorumPercent),
          status: 'voting',
          createdAt: Date.now(),
          votingStartedAt: null,
          votingDeadline: null
        }

        this.cells.push(cell)
      }
    }

    return this.cells.filter(c => c.tier === tier)
  }

  /**
   * Cast a vote
   */
  castVote(cellId, participantId, ideaId) {
    if (this.phase !== 'voting') {
      throw new Error('Not in voting phase')
    }

    const cell = this.cells.find(c => c.id === cellId)
    if (!cell) {
      throw new Error('Cell not found')
    }

    // Check if already voted
    const alreadyVoted = this.votes.some(v => v.cellId === cellId && v.participantId === participantId)
    if (alreadyVoted) {
      throw new Error('Already voted in this cell')
    }

    const vote = {
      id: `vote-${this.votes.length + 1}`,
      cellId,
      participantId,
      ideaId,
      votedAt: Date.now()
    }

    this.votes.push(vote)

    const voteCount = this.votes.filter(v => v.cellId === cellId).length

    // Check if cell is complete
    if (voteCount >= cell.votesNeeded) {
      cell.status = 'completed'

      // Calculate winner for this cell
      const cellVotes = this.votes.filter(v => v.cellId === cellId)
      const tally = {}
      cellVotes.forEach(v => {
        tally[v.ideaId] = (tally[v.ideaId] || 0) + 1
      })

      const winner = Object.keys(tally).reduce((a, b) => tally[a] > tally[b] ? a : b)

      // Mark as cell winner (for Tier 1 only)
      if (cell.tier === 1) {
        const winnerIdea = this.ideas.find(i => i.id === winner)
        if (winnerIdea) {
          winnerIdea.status = 'cell-winner'
          winnerIdea.tier = cell.tier
        }
      }
    }

    return { success: true, voteCount, vote }
  }

  /**
   * Start voting timer for a cell
   */
  startCellVoting(cellId) {
    const cell = this.cells.find(c => c.id === cellId)
    if (!cell) {
      throw new Error('Cell not found')
    }

    cell.votingStartedAt = Date.now()
    cell.votingDeadline = Date.now() + this.votingTimeoutMs

    return {
      cellId,
      votingStartedAt: cell.votingStartedAt,
      votingDeadline: cell.votingDeadline,
      timeoutMs: this.votingTimeoutMs
    }
  }

  /**
   * Check if a cell has timed out and has quorum - if so, force complete it
   * Returns true if cell was force-completed
   */
  checkCellTimeout(cellId) {
    const cell = this.cells.find(c => c.id === cellId)
    if (!cell || cell.status === 'completed') {
      return false
    }

    const now = Date.now()
    const voteCount = this.votes.filter(v => v.cellId === cellId).length
    const hasQuorum = voteCount >= cell.quorumNeeded
    const hasTimedOut = cell.votingDeadline && now >= cell.votingDeadline

    // Complete if timed out AND has quorum (or all voted)
    if (hasTimedOut && hasQuorum) {
      cell.status = 'completed'
      cell.completedByTimeout = true
      return true
    }

    return false
  }

  /**
   * Force complete all timed-out cells in a tier that have quorum
   * Returns list of cells that were force-completed
   */
  forceCompleteTierTimeouts(tier) {
    const tierCells = this.cells.filter(c => c.tier === tier && c.status !== 'completed')
    const forceCompleted = []

    for (const cell of tierCells) {
      if (this.checkCellTimeout(cell.id)) {
        forceCompleted.push(cell.id)
      }
    }

    return forceCompleted
  }

  /**
   * Get cell winners, handling ties (all tied ideas advance)
   */
  getCellWinners(cellId) {
    const cell = this.cells.find(c => c.id === cellId)
    if (!cell) return []

    const cellVotes = this.votes.filter(v => v.cellId === cellId)
    if (cellVotes.length === 0) return []

    const tally = {}
    cellVotes.forEach(v => {
      tally[v.ideaId] = (tally[v.ideaId] || 0) + 1
    })

    // Find the max vote count
    const maxVotes = Math.max(...Object.values(tally))

    // Return ALL ideas with the max vote count (handles ties)
    const winners = Object.keys(tally).filter(ideaId => tally[ideaId] === maxVotes)

    return winners
  }

  /**
   * Complete a tier and advance winners (Natural Reduction)
   * Now handles ties - all tied ideas advance
   */
  completeTier(tier) {
    // First, force complete any timed-out cells with quorum
    this.forceCompleteTierTimeouts(tier)

    const tierCells = this.cells.filter(c => c.tier === tier)
    const completedCells = tierCells.filter(c => c.status === 'completed')

    if (completedCells.length < tierCells.length) {
      throw new Error(`Not all cells completed (${completedCells.length}/${tierCells.length})`)
    }

    if (tier === 1) {
      // Tier 1: Get cell winners (handles ties - all tied ideas advance)
      const winnerIds = new Set()

      for (const cell of completedCells) {
        const cellWinnerIds = this.getCellWinners(cell.id)
        cellWinnerIds.forEach(id => winnerIds.add(id))
      }

      // Mark all winners
      const advancingIdeas = []
      for (const ideaId of winnerIds) {
        const idea = this.ideas.find(i => i.id === ideaId)
        if (idea) {
          idea.status = 'cell-winner'
          idea.tier = tier
          advancingIdeas.push(idea)
        }
      }

      // Mark non-winners as eliminated
      this.ideas.forEach(idea => {
        if (idea.tier === tier && !winnerIds.has(idea.id)) {
          idea.status = 'eliminated'
        }
      })

      if (advancingIdeas.length === 1) {
        advancingIdeas[0].status = 'winner'
        this.phase = 'completed'
        return {
          winner: advancingIdeas[0],
          message: 'Winner declared!'
        }
      }

      if (advancingIdeas.length === 0) {
        return {
          error: true,
          message: 'No ideas advanced (no votes cast?)'
        }
      }

      // Advance to Tier 2
      this.formNextTierCells(advancingIdeas, 2)
      this.currentTier = 2

      return {
        success: true,
        nextTier: 2,
        advancingIdeas: advancingIdeas.length
      }
    } else {
      // Tier 2+: Check if this is a final showdown (all cells voting on same small set of ideas)
      const batches = [...new Set(completedCells.map(c => c.batch))]

      // Check if all cells have the same ideas (final showdown indicator)
      const firstCellIdeas = completedCells[0]?.ideaIds || []
      const allCellsHaveSameIdeas = completedCells.every(cell =>
        cell.ideaIds.length === firstCellIdeas.length &&
        cell.ideaIds.every(id => firstCellIdeas.includes(id))
      )

      // FINAL SHOWDOWN: If all cells vote on same ideas and there are few ideas, do cross-cell tally
      if (allCellsHaveSameIdeas && firstCellIdeas.length <= 4) {
        const tierVotes = this.votes.filter(v =>
          completedCells.some(c => c.id === v.cellId)
        )

        const crossCellTally = {}
        tierVotes.forEach(v => {
          crossCellTally[v.ideaId] = (crossCellTally[v.ideaId] || 0) + 1
        })

        const sortedIdeas = Object.keys(crossCellTally)
          .sort((a, b) => crossCellTally[b] - crossCellTally[a])

        if (sortedIdeas.length > 0) {
          const winnerId = sortedIdeas[0]
          const winner = this.ideas.find(i => i.id === winnerId)

          // Mark winner
          winner.status = 'winner'

          // Mark losers
          this.ideas.forEach(idea => {
            if (idea.tier === tier && idea.id !== winnerId) {
              idea.status = 'eliminated'
            }
          })

          this.phase = 'completed'
          return {
            winner: { ...winner, totalVotes: crossCellTally[winnerId] },
            message: 'Winner declared!'
          }
        }
      }

      // NORMAL CASE: Batch-based tallying
      const batchWinners = []

      // Find winner from each batch
      for (const batchNum of batches) {
        const batchCells = completedCells.filter(c => c.batch === batchNum)

        // Tally votes within this batch
        const batchVotes = this.votes.filter(v =>
          batchCells.some(c => c.id === v.cellId)
        )

        const batchTally = {}
        batchVotes.forEach(v => {
          batchTally[v.ideaId] = (batchTally[v.ideaId] || 0) + 1
        })

        // Find top vote-getter in this batch
        const sortedBatchIdeas = Object.keys(batchTally)
          .sort((a, b) => batchTally[b] - batchTally[a])

        if (sortedBatchIdeas.length > 0) {
          const batchWinnerId = sortedBatchIdeas[0]
          const batchWinner = this.ideas.find(i => i.id === batchWinnerId)

          if (batchWinner) {
            batchWinner.status = 'cell-winner'
            batchWinners.push(batchWinner)
          }
        }
      }

      // Mark non-winners as eliminated
      const winnerIds = batchWinners.map(w => w.id)
      this.ideas.forEach(idea => {
        if (idea.tier === tier && !winnerIds.includes(idea.id)) {
          idea.status = 'eliminated'
        }
      })

      // If only 1 winner, declare victory
      if (batchWinners.length === 1) {
        this.phase = 'completed'
        return {
          winner: batchWinners[0],
          message: 'Winner declared!'
        }
      }

      // Multiple winners - advance to next tier
      this.formNextTierCells(batchWinners, tier + 1)
      this.currentTier++

      return {
        success: true,
        nextTier: this.currentTier,
        advancingIdeas: batchWinners.length
      }
    }
  }

  // === DELIBERATION METHODS (NEW for v8) ===

  /**
   * Add a comment to a cell discussion
   */
  addComment(cellId, participantId, text, replyTo = null) {
    const comment = {
      id: `comment-${this.comments.length + 1}`,
      cellId,
      participantId,
      text,
      replyTo,  // For threading
      timestamp: Date.now()
    }

    this.comments.push(comment)
    return comment
  }

  /**
   * Get all comments for a specific cell
   */
  getCellComments(cellId) {
    return this.comments.filter(c => c.cellId === cellId)
  }

  /**
   * Get participants in a specific cell
   */
  getCellParticipants(cellId) {
    const cell = this.cells.find(c => c.id === cellId)
    if (!cell) return []

    return cell.participants.map(pId =>
      this.participants.find(p => p.id === pId)
    ).filter(Boolean)
  }

  /**
   * Get ideas in a specific cell
   */
  getCellIdeas(cellId) {
    const cell = this.cells.find(c => c.id === cellId)
    if (!cell) return []

    return cell.ideaIds.map(ideaId =>
      this.ideas.find(i => i.id === ideaId)
    ).filter(Boolean)
  }

  // === STATE GETTERS ===

  /**
   * Get complete system state
   */
  getState() {
    return {
      phase: this.phase,
      totalParticipants: this.participants.length,
      currentTier: this.currentTier,
      participants: this.participants,
      ideas: this.ideas.map(i => ({
        id: i.id,
        text: i.text,
        author: i.author,
        authorId: i.authorId,
        tier: i.tier,
        status: i.status
      })),
      cells: this.cells.map(c => {
        const votesCast = this.votes.filter(v => v.cellId === c.id).length
        const cellVotes = this.votes.filter(v => v.cellId === c.id)

        const tally = {}
        cellVotes.forEach(v => {
          tally[v.ideaId] = (tally[v.ideaId] || 0) + 1
        })

        const participantsWhoVoted = cellVotes.map(v => v.participantId)

        return {
          id: c.id,
          tier: c.tier,
          batch: c.batch,
          participants: c.participants,
          participantsWhoVoted,
          ideaIds: c.ideaIds,
          voteTally: tally,
          votesNeeded: c.votesNeeded,
          quorumNeeded: c.quorumNeeded,
          votesCast,
          status: c.status,
          votingDeadline: c.votingDeadline,
          completedByTimeout: c.completedByTimeout || false
        }
      }),
      comments: this.comments,
      votingTimeoutMs: this.votingTimeoutMs,
      quorumPercent: this.quorumPercent
    }
  }

  /**
   * Get cells for a specific tier
   */
  getCellsByTier(tier) {
    return this.cells.filter(c => c.tier === tier)
  }

  /**
   * Get ideas for a specific tier
   */
  getIdeasByTier(tier) {
    return this.ideas.filter(i => i.tier === tier)
  }
}

module.exports = { UnionChantEngine }
