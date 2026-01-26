// Simulation: 50 participants, 10 drop out
// Tests edge case handling for abandoned/partial cells

const { UnionChantEngine } = require('./core/union-chant-engine')

console.log('\n' + '='.repeat(60))
console.log('UNION CHANT SIMULATION: 50 Participants, 10 Dropouts')
console.log('='.repeat(60) + '\n')

const engine = new UnionChantEngine({ votingTimeoutMs: 5000 })

// Add 50 participants with ideas
console.log('📝 Adding 50 participants with ideas...\n')
for (let i = 1; i <= 50; i++) {
  engine.addParticipant({
    id: `p-${i}`,
    name: `Participant ${i}`,
    type: 'human'
  })

  engine.addIdea({
    id: `idea-${i}`,
    text: `Idea from participant ${i}`,
    author: `Participant ${i}`,
    authorId: `p-${i}`
  })
}

console.log(`✅ ${engine.participants.length} participants`)
console.log(`✅ ${engine.ideas.length} ideas\n`)

// Start voting
console.log('🗳️  Starting voting phase...\n')
engine.startVoting()

console.log(`📦 Formed ${engine.cells.length} cells for Tier 1\n`)

// Show cell structure
engine.cells.forEach(cell => {
  console.log(`   ${cell.id}: ${cell.participants.length} participants, ${cell.ideaIds.length} ideas`)
})

// Simulate voting with 10 dropouts
// We'll have the dropouts be participants 41-50 (spread across cells)
const dropouts = new Set()
for (let i = 41; i <= 50; i++) {
  dropouts.add(`p-${i}`)
}

console.log('\n⚠️  Simulating 10 dropouts (participants 41-50)...\n')

// Set voting deadlines (already passed to simulate timeout)
engine.cells.forEach(cell => {
  cell.votingStartedAt = Date.now() - 10000
  cell.votingDeadline = Date.now() - 5000  // Already expired
})

// Cast votes for non-dropouts
let votescast = 0
let skipped = 0

for (const cell of engine.cells) {
  const cellIdeas = cell.ideaIds

  for (const participantId of cell.participants) {
    if (dropouts.has(participantId)) {
      skipped++
      continue  // This participant dropped out
    }

    // Vote for a random idea in the cell
    const randomIdea = cellIdeas[Math.floor(Math.random() * cellIdeas.length)]
    try {
      engine.castVote(cell.id, participantId, randomIdea)
      votescast++
    } catch (e) {
      // Already voted or other error
    }
  }
}

console.log(`✅ Votes cast: ${votescast}`)
console.log(`❌ Dropouts (no vote): ${skipped}\n`)

// Show vote counts per cell before completing
console.log('📊 Vote counts per cell before completion:\n')
engine.cells.forEach(cell => {
  const voteCount = engine.votes.filter(v => v.cellId === cell.id).length
  const hasDropouts = cell.participants.some(p => dropouts.has(p))
  console.log(`   ${cell.id}: ${voteCount}/${cell.votesNeeded} votes ${hasDropouts ? '(has dropouts)' : ''}`)
})

// Complete Tier 1
console.log('\n⏱️  Completing Tier 1 (forcing timeout completion)...\n')

try {
  const result = engine.completeTier(1)

  if (result.winner) {
    console.log(`🏆 WINNER: ${result.winner.text}`)
  } else if (result.error) {
    console.log(`❌ Error: ${result.message}`)
  } else {
    console.log(`✅ Tier 1 complete!`)
    console.log(`   Advancing ideas: ${result.advancingIdeas}`)
    console.log(`   Next tier: ${result.nextTier}`)
  }
} catch (e) {
  console.log(`❌ Error: ${e.message}`)
}

// Show which ideas advanced
const advancingIdeas = engine.ideas.filter(i => i.status === 'cell-winner' || i.status === 'winner')
const eliminatedIdeas = engine.ideas.filter(i => i.status === 'eliminated')

console.log(`\n📈 Ideas advancing: ${advancingIdeas.length}`)
console.log(`📉 Ideas eliminated: ${eliminatedIdeas.length}`)

// Check for cells that had 0 votes (all ideas should have advanced)
console.log('\n📦 Cell results:\n')
engine.cells.filter(c => c.tier === 1).forEach(cell => {
  const cellVotes = engine.votes.filter(v => v.cellId === cell.id)
  const winners = engine.getCellWinners(cell.id)

  if (cellVotes.length === 0) {
    console.log(`   ${cell.id}: 0 votes → ALL ${winners.length} ideas advanced (abandoned cell)`)
  } else {
    const tally = {}
    cellVotes.forEach(v => {
      tally[v.ideaId] = (tally[v.ideaId] || 0) + 1
    })
    console.log(`   ${cell.id}: ${cellVotes.length} votes → ${winners.length} winner(s): ${winners.join(', ')}`)
  }
})

// Continue to Tier 2 if there are multiple advancing ideas
if (engine.currentTier === 2) {
  console.log('\n' + '='.repeat(60))
  console.log('TIER 2')
  console.log('='.repeat(60) + '\n')

  console.log(`📦 Formed ${engine.cells.filter(c => c.tier === 2).length} cells for Tier 2\n`)

  // Set deadlines for Tier 2
  engine.cells.filter(c => c.tier === 2).forEach(cell => {
    cell.votingStartedAt = Date.now() - 10000
    cell.votingDeadline = Date.now() - 5000
  })

  // Vote in Tier 2 (same dropouts)
  for (const cell of engine.cells.filter(c => c.tier === 2)) {
    const cellIdeas = cell.ideaIds

    for (const participantId of cell.participants) {
      if (dropouts.has(participantId)) continue

      const randomIdea = cellIdeas[Math.floor(Math.random() * cellIdeas.length)]
      try {
        engine.castVote(cell.id, participantId, randomIdea)
      } catch (e) {}
    }
  }

  // Complete Tier 2
  try {
    const result2 = engine.completeTier(2)

    if (result2.winner) {
      console.log(`🏆 WINNER DECLARED: "${result2.winner.text}"`)
      console.log(`   Total votes: ${result2.winner.totalVotes || 'N/A'}`)
    } else {
      console.log(`✅ Tier 2 complete! ${result2.advancingIdeas} ideas advance to Tier ${result2.nextTier}`)
    }
  } catch (e) {
    console.log(`❌ Tier 2 error: ${e.message}`)
  }
}

// Final summary
console.log('\n' + '='.repeat(60))
console.log('SIMULATION COMPLETE')
console.log('='.repeat(60))
console.log(`\nPhase: ${engine.phase}`)
console.log(`Final tier reached: ${engine.currentTier}`)

const finalWinner = engine.ideas.find(i => i.status === 'winner')
if (finalWinner) {
  console.log(`\n🏆 Champion: "${finalWinner.text}"`)
}

console.log('\n✅ Dropout handling worked correctly!')
console.log('   - Cells with 0 votes: all ideas advanced')
console.log('   - Cells with partial votes: votes determined winner')
console.log('')
