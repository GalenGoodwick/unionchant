'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import Header from '@/components/Header'

type Idea = {
  id: string
  text: string
  status: 'submitted' | 'in_voting' | 'advancing' | 'eliminated' | 'winner'
  tier: number
  votes: number
}

type Participant = {
  id: string
  name: string
}

type CellConversation = {
  participantName: string
  message: string
  ideaRef?: string
}

type Cell = {
  id: string
  tier: number
  batch: number  // Which batch this cell belongs to (for clustering)
  ideaIds: string[]
  participantIds: string[]
  votes: Record<string, string>
  status: 'deliberating' | 'voting' | 'completed'
  winner?: string
  conversations: CellConversation[]
}

type TierSummary = {
  tier: number
  ideasStart: number
  ideasEnd: number
  cells: number
  status: 'pending' | 'active' | 'completed'
}

const AI_NAMES = [
  'Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack',
  'Kate', 'Leo', 'Maya', 'Noah', 'Olivia', 'Paul', 'Quinn', 'Rose', 'Sam', 'Tara',
  'Uma', 'Victor', 'Wendy', 'Xavier', 'Yara', 'Zoe', 'Adam', 'Beth', 'Chris', 'Diana',
  'Erik', 'Fiona', 'George', 'Hannah', 'Ivan', 'Julia', 'Kevin', 'Laura', 'Mike', 'Nina'
]

const IDEA_ACTIONS = ['Implement', 'Introduce', 'Create', 'Establish', 'Launch', 'Offer', 'Start', 'Build']

const IDEA_SUBJECTS = [
  'a 4-day work week', 'flexible working hours', 'unlimited PTO', 'remote work options',
  'hybrid work model', 'no-meeting Fridays', 'weekly team lunches', 'monthly team events',
  'a mentorship program', 'learning stipends', 'conference attendance budget', 'profit sharing',
  'equity grants for all', 'home office stipend', 'gym membership coverage', 'mental health days',
  'wellness Wednesdays', 'free healthy snacks', 'catered meals', 'nap rooms',
  'game room', 'walking meetings', 'open door policy', 'anonymous feedback system',
  'employee recognition program', 'innovation time', 'sabbatical program', 'summer Fridays'
]

const CONVERSATION_TEMPLATES = {
  support: [
    "I really like {idea} - it would improve work-life balance significantly.",
    "As someone who {context}, I think {idea} makes a lot of sense.",
    "{idea} worked great at my previous company. Highly recommend.",
    "I've been hoping for something like {idea}. It addresses a real need.",
  ],
  question: [
    "How would {idea} work with our current policies?",
    "What's the cost estimate for {idea}?",
    "Has anyone seen {idea} implemented elsewhere?",
    "Would {idea} apply to all departments equally?",
  ],
  concern: [
    "I like the intent of {idea}, but I worry about implementation.",
    "{idea} sounds good, but how do we measure success?",
    "My concern with {idea} is whether it's sustainable long-term.",
  ],
  agreement: [
    "Good point about {idea}. I hadn't considered that angle.",
    "You've convinced me - changing my vote to {idea}.",
    "After hearing everyone's perspective, {idea} seems like the best choice.",
  ],
}

const CONTEXTS = [
  "commutes an hour each way",
  "has young kids at home",
  "works best in the mornings",
  "often collaborates with overseas teams",
  "values focused deep work time",
]

function generateIdea(): string {
  const action = IDEA_ACTIONS[Math.floor(Math.random() * IDEA_ACTIONS.length)]
  const subject = IDEA_SUBJECTS[Math.floor(Math.random() * IDEA_SUBJECTS.length)]
  return `${action} ${subject}`
}

function generateUniqueIdeas(count: number): string[] {
  const ideas = new Set<string>()
  while (ideas.size < count) {
    ideas.add(generateIdea())
  }
  return Array.from(ideas)
}

function generateConversation(ideaTexts: string[], participantNames: string[]): CellConversation[] {
  const conversations: CellConversation[] = []
  const numMessages = 3 + Math.floor(Math.random() * 3) // 3-5 messages

  for (let i = 0; i < numMessages; i++) {
    const participant = participantNames[Math.floor(Math.random() * participantNames.length)]
    const idea = ideaTexts[Math.floor(Math.random() * ideaTexts.length)]
    const shortIdea = idea.length > 30 ? idea.substring(0, 30) + '...' : idea

    let templateType: keyof typeof CONVERSATION_TEMPLATES
    if (i === 0) templateType = 'support'
    else if (i === numMessages - 1) templateType = 'agreement'
    else templateType = ['support', 'question', 'concern'][Math.floor(Math.random() * 3)] as keyof typeof CONVERSATION_TEMPLATES

    const templates = CONVERSATION_TEMPLATES[templateType]
    let message = templates[Math.floor(Math.random() * templates.length)]
    message = message.replace('{idea}', `"${shortIdea}"`)
    message = message.replace('{context}', CONTEXTS[Math.floor(Math.random() * CONTEXTS.length)])

    conversations.push({ participantName: participant, message, ideaRef: idea })
  }

  return conversations
}

export default function DemoPage() {
  const question = 'What workplace policy should we implement?'
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [cells, setCells] = useState<Cell[]>([])
  const [tierSummaries, setTierSummaries] = useState<TierSummary[]>([])
  const [phase, setPhase] = useState<'setup' | 'submission' | 'voting' | 'completed'>('setup')
  const [currentTier, setCurrentTier] = useState(0)
  const [champion, setChampion] = useState<Idea | null>(null)
  const [running, setRunning] = useState(false)
  const [activeCell, setActiveCell] = useState<Cell | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [explanation, setExplanation] = useState('Press "Start Demo" to begin.')
  const [paused, setPaused] = useState(false)
  const [runId, setRunId] = useState(0)
  const abortRef = useRef(false)
  const continueRef = useRef<(() => void) | null>(null)
  const speed = 0.5

  const participantCount = 40
  const CELL_SIZE = 5
  const IDEAS_PER_CELL = 5

  const sleep = (ms: number) => new Promise<void>(resolve => {
    if (abortRef.current) { resolve(); return }
    setTimeout(resolve, ms / speed)
  })

  const waitForContinue = (text: string): Promise<void> => {
    if (abortRef.current) return Promise.resolve()
    setExplanation(text)
    setPaused(true)
    return new Promise(resolve => {
      continueRef.current = () => {
        setPaused(false)
        continueRef.current = null
        resolve()
      }
    })
  }

  const shuffle = <T,>(array: T[]): T[] => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  const calculateTierPlan = (ideaCount: number, participantCount: number): TierSummary[] => {
    const summaries: TierSummary[] = []
    let remaining = ideaCount
    let tier = 1

    while (remaining > 1) {
      const cells = Math.ceil(remaining / IDEAS_PER_CELL)
      const advancing = cells // One winner per cell
      summaries.push({
        tier,
        ideasStart: remaining,
        ideasEnd: Math.max(1, advancing),
        cells,
        status: 'pending'
      })
      remaining = advancing
      tier++
      if (tier > 10) break // Safety
    }

    return summaries
  }

  const startDemo = async () => {
    abortRef.current = false
    setRunning(true)
    setPhase('submission')
    setCells([])
    setChampion(null)
    setCurrentTier(0)
    setActiveCell(null)
    setTierSummaries([])
    const currentRunId = runId + 1
    setRunId(currentRunId) // Increment run ID to ensure unique keys

    // Create participants
    setExplanation('Participants are joining the deliberation...')
    setStatusMessage('Participants joining the deliberation...')
    const newParticipants: Participant[] = shuffle(AI_NAMES)
      .slice(0, participantCount)
      .map((name, i) => ({ id: `p${i}`, name }))
    setParticipants(newParticipants)
    await sleep(800)

    await waitForContinue(`${participantCount} people have joined. Each will submit one idea for the group to evaluate.`)

    // Show tier plan
    const plan = calculateTierPlan(participantCount, participantCount)
    setTierSummaries(plan)
    setStatusMessage(`${participantCount} participants will submit ideas, then vote through ${plan.length} tiers`)
    await sleep(1500)

    // Submission phase
    setPhase('submission')
    setExplanation('Each participant is submitting one idea...')
    setStatusMessage('Submission phase: Each participant submits one idea...')
    const generatedIdeas = generateUniqueIdeas(participantCount)
    const newIdeas: Idea[] = []

    for (let i = 0; i < generatedIdeas.length; i++) {
      if (abortRef.current) return
      newIdeas.push({
        id: `idea${i}`,
        text: generatedIdeas[i],
        status: 'submitted',
        tier: 0,
        votes: 0
      })
      if (i % 5 === 0 || i === generatedIdeas.length - 1) {
        setIdeas([...newIdeas])
        setStatusMessage(`${newIdeas.length} ideas submitted...`)
        await sleep(100)
      }
    }

    setStatusMessage(`All ${newIdeas.length} ideas submitted. Starting voting phase...`)
    await sleep(1000)

    await waitForContinue(`All ${newIdeas.length} ideas are in. Now they'll be randomly grouped into cells of 5 ideas and 5 voters each.`)

    // Start voting
    setPhase('voting')
    await runVotingTiers(newIdeas, newParticipants, currentRunId)
  }

  const runVotingTiers = async (allIdeas: Idea[], allParticipants: Participant[], demoRunId: number) => {
    let activeIdeas = [...allIdeas]
    let tier = 1

    while (activeIdeas.length > 1 && !abortRef.current) {
      setCurrentTier(tier)

      // Check for final showdown (≤5 ideas remaining - all vote on same ideas)
      const isFinalShowdown = activeIdeas.length <= 5

      // Update tier summaries
      setTierSummaries(prev => prev.map(t => ({
        ...t,
        status: t.tier < tier ? 'completed' : t.tier === tier ? 'active' : 'pending'
      })))

      // Update idea statuses
      setIdeas(prev => prev.map(idea =>
        activeIdeas.find(ai => ai.id === idea.id)
          ? { ...idea, status: 'in_voting', tier }
          : idea
      ))

      if (isFinalShowdown) {
        setExplanation(`Final Showdown! All participants vote on the remaining ideas.`)
        setStatusMessage(`Final Showdown! All ${allParticipants.length} participants vote on ${activeIdeas.length} remaining ideas`)
        await sleep(1000)
        await waitForContinue(`Only ${activeIdeas.length} ideas left. Now ALL ${allParticipants.length} participants vote on these finalists together.`)
      } else {
        setExplanation(`Tier ${tier}: Ideas are being grouped into cells of 5.`)
        setStatusMessage(`Tier ${tier}: ${activeIdeas.length} ideas competing in small groups`)
        await sleep(1000)
      }

      // Create cells - ALL participants always vote (same number of cells each tier)
      const shuffledParticipants = shuffle(allParticipants)
      const numCells = Math.ceil(allParticipants.length / CELL_SIZE)

      const tierCells: Cell[] = []

      // Shuffle ideas ONCE before creating cells
      const shuffledIdeas = shuffle(activeIdeas)

      // Determine cell structure based on idea count:
      // - If enough ideas for each cell to have unique set: no batching (Tier 1)
      // - If not enough for unique sets but > 5: batch cells to vote on same ideas
      // - If ≤ 5 ideas: final showdown, all cells vote on all ideas
      const canHaveUniqueCells = activeIdeas.length >= numCells * IDEAS_PER_CELL

      let numBatches: number
      let cellsPerBatch: number

      if (isFinalShowdown) {
        // Final showdown: all cells in 1 batch, all vote on same ideas
        numBatches = 1
        cellsPerBatch = numCells
      } else if (canHaveUniqueCells) {
        // Tier 1 style: each cell gets unique ideas, no real batching
        numBatches = numCells
        cellsPerBatch = 1
      } else {
        // Later tiers: group cells into batches voting on same ideas
        numBatches = Math.ceil(activeIdeas.length / IDEAS_PER_CELL)
        cellsPerBatch = Math.ceil(numCells / numBatches)
      }

      for (let i = 0; i < numCells; i++) {
        const cellParticipants = shuffledParticipants.slice(i * CELL_SIZE, (i + 1) * CELL_SIZE)
        if (cellParticipants.length === 0) continue

        // Determine which batch this cell belongs to
        const batchIndex = isFinalShowdown ? 0 : Math.floor(i / cellsPerBatch)

        // Get ideas for this batch (use pre-shuffled ideas)
        let cellIdeas: Idea[]
        if (isFinalShowdown) {
          cellIdeas = activeIdeas // All cells vote on all remaining ideas
        } else {
          cellIdeas = shuffledIdeas.slice(batchIndex * IDEAS_PER_CELL, (batchIndex + 1) * IDEAS_PER_CELL)
          if (cellIdeas.length === 0) cellIdeas = shuffledIdeas.slice(0, IDEAS_PER_CELL)
        }

        const cell: Cell = {
          id: `r${demoRunId}t${tier}c${i}`,
          tier,
          batch: batchIndex,
          ideaIds: cellIdeas.map(idea => idea.id),
          participantIds: cellParticipants.map(p => p.id),
          votes: {},
          status: 'deliberating',
          conversations: generateConversation(
            cellIdeas.map(idea => idea.text),
            cellParticipants.map(p => p.name)
          )
        }
        tierCells.push(cell)
      }

      setCells(prev => [...prev, ...tierCells])
      if (isFinalShowdown) {
        setStatusMessage(`${tierCells.length} cells deliberating on the same ${activeIdeas.length} finalists...`)
      } else {
        setStatusMessage(`${tierCells.length} cells deliberating in parallel...`)
      }
      await sleep(800)

      if (!isFinalShowdown) {
        await waitForContinue(`${tierCells.length} cells formed. Each has 5 people discussing 5 ideas. They'll deliberate, then vote.`)
      }

      // ALL CELLS DELIBERATE IN PARALLEL
      setExplanation(`Each cell is discussing their 5 ideas before voting.`)
      setStatusMessage(`All ${tierCells.length} cells discussing...`)
      for (const cell of tierCells) {
        cell.status = 'deliberating'
      }
      // Show a sample cell's conversation
      setActiveCell(tierCells[0])
      setCells(prev => prev.map(c => {
        const tierCell = tierCells.find(tc => tc.id === c.id)
        return tierCell ? { ...tierCell } : c
      }))
      await sleep(1500)

      await waitForContinue('Discussion complete. Now each person picks their favorite idea from their cell.')

      // ALL CELLS VOTE - show individual votes accumulating
      setExplanation('Voting in progress — each person picks their favorite idea.')
      setStatusMessage(`All ${tierCells.length} cells voting...`)
      for (const cell of tierCells) {
        cell.status = 'voting'
      }
      setActiveCell({ ...tierCells[0] })
      setCells(prev => prev.map(c => {
        const tierCell = tierCells.find(tc => tc.id === c.id)
        return tierCell ? { ...tierCell } : c
      }))
      await sleep(300)

      // Collect all participant votes across all cells
      const allVotes: { cell: Cell; participantId: string; participantIndex: number }[] = []
      for (const cell of tierCells) {
        cell.participantIds.forEach((participantId, idx) => {
          allVotes.push({ cell, participantId, participantIndex: idx })
        })
      }
      // Shuffle for visual effect but voting pattern is deterministic
      const shuffledVotes = shuffle(allVotes)

      // Show votes coming in one by one
      for (let i = 0; i < shuffledVotes.length; i++) {
        if (abortRef.current) return
        const { cell, participantId, participantIndex } = shuffledVotes[i]
        // Deterministic voting: first 3 participants vote for idea 0, next 2 for idea 1
        // This ensures idea 0 always wins with 3 votes vs 2 votes
        const votedIdeaId = cell.ideaIds[participantIndex < 3 ? 0 : Math.min(1, cell.ideaIds.length - 1)]
        cell.votes[participantId] = votedIdeaId

        // Update every few votes to show progress
        if (i % 3 === 0 || i === shuffledVotes.length - 1) {
          const totalVotes = tierCells.reduce((sum, c) => sum + Object.keys(c.votes).length, 0)
          setStatusMessage(`Voting: ${totalVotes}/${shuffledVotes.length} votes cast...`)
          // Update active cell to show vote progress
          setActiveCell({ ...tierCells[0] })
          setCells(prev => prev.map(c => {
            const tierCell = tierCells.find(tc => tc.id === c.id)
            return tierCell ? { ...tierCell } : c
          }))
          await sleep(50)
        }
      }
      await sleep(500)

      // TALLY VOTES ACROSS ALL CELLS
      const globalVoteCounts: Record<string, number> = {}
      for (const cell of tierCells) {
        Object.values(cell.votes).forEach(ideaId => {
          globalVoteCounts[ideaId] = (globalVoteCounts[ideaId] || 0) + 1
        })
      }

      setExplanation('Tallying votes across all cells...')
      setStatusMessage(`Tallying votes across all ${tierCells.length} cells...`)
      await sleep(800)

      await waitForContinue('Votes tallied. The winning idea from each cell advances to the next tier. The rest are eliminated.')

      // Determine winners (no random tiebreaker - just pick highest votes, first alphabetically)
      let advancingIdeas: string[] = []

      if (isFinalShowdown) {
        // Final showdown: pick idea with most votes (deterministic)
        const sorted = Object.entries(globalVoteCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        advancingIdeas = [sorted[0][0]]
      } else {
        // Normal tier: each unique idea batch gets one winner
        // Group cells by their idea set
        const ideaSets = new Map<string, Cell[]>()
        for (const cell of tierCells) {
          const key = [...cell.ideaIds].sort().join(',')
          if (!ideaSets.has(key)) ideaSets.set(key, [])
          ideaSets.get(key)!.push(cell)
        }

        // For each idea set, tally votes and pick winner (deterministic)
        for (const [, batchCells] of ideaSets) {
          const batchVoteCounts: Record<string, number> = {}
          for (const cell of batchCells) {
            Object.values(cell.votes).forEach(ideaId => {
              batchVoteCounts[ideaId] = (batchVoteCounts[ideaId] || 0) + 1
            })
          }
          // Sort by votes descending, then by ID for deterministic tiebreaker
          const sorted = Object.entries(batchVoteCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          if (sorted.length > 0) {
            advancingIdeas.push(sorted[0][0])
          }
        }
      }

      // Mark cells as completed and set winners
      for (const cell of tierCells) {
        cell.status = 'completed'
        // Find the winner among this cell's ideas
        const cellWinner = advancingIdeas.find(id => cell.ideaIds.includes(id))
        cell.winner = cellWinner
      }
      setCells(prev => prev.map(c => {
        const tierCell = tierCells.find(tc => tc.id === c.id)
        return tierCell ? { ...tierCell } : c
      }))

      // Update idea statuses
      setIdeas(prev => prev.map(idea => {
        const votes = globalVoteCounts[idea.id] || 0
        if (activeIdeas.find(ai => ai.id === idea.id)) {
          return {
            ...idea,
            votes: idea.votes + votes,
            status: advancingIdeas.includes(idea.id) ? 'advancing' : 'eliminated'
          }
        }
        return idea
      }))

      // Update active ideas
      const uniqueAdvancing = [...new Set(advancingIdeas)]
      activeIdeas = allIdeas.filter(idea => uniqueAdvancing.includes(idea.id))

      if (isFinalShowdown) {
        setStatusMessage(`Final showdown complete! Champion determined by ${Object.values(globalVoteCounts).reduce((a, b) => a + b, 0)} votes across all cells.`)
      } else {
        setStatusMessage(`Tier ${tier} complete! ${activeIdeas.length} ideas advancing.`)
      }

      // Update tier summary
      setTierSummaries(prev => prev.map(t =>
        t.tier === tier ? { ...t, status: 'completed', ideasEnd: activeIdeas.length } : t
      ))

      if (!isFinalShowdown) {
        await waitForContinue(`Tier ${tier} done! ${activeIdeas.length} idea${activeIdeas.length === 1 ? '' : 's'} advance to the next round. The process repeats with fewer ideas.`)
      }

      tier++
      await sleep(1500)
    }

    // Champion!
    if (activeIdeas.length === 1 && !abortRef.current) {
      const winnerId = activeIdeas[0].id
      // Mark ONLY the winner as 'winner', ALL others as eliminated
      setIdeas(prev => prev.map(idea => ({
        ...idea,
        status: idea.id === winnerId ? 'winner' : (idea.status === 'submitted' ? 'submitted' : 'eliminated')
      })))
      setChampion(activeIdeas[0])
      setPhase('completed')
      // Mark all tiers as completed
      setTierSummaries(prev => prev.map(t => ({ ...t, status: 'completed' })))
      setStatusMessage(`Champion determined through ${tier - 1} tiers of deliberation!`)
      await waitForContinue(`One idea survived scrutiny from many independent groups across ${tier - 1} tiers. That's a stronger mandate than any poll.`)
    }

    setRunning(false)
  }

  const reset = () => {
    abortRef.current = true
    if (continueRef.current) {
      continueRef.current()
      continueRef.current = null
    }
    setPhase('setup')
    setIdeas([])
    setParticipants([])
    setCells([])
    setTierSummaries([])
    setChampion(null)
    setCurrentTier(0)
    setRunning(false)
    setActiveCell(null)
    setStatusMessage('')
    setExplanation('Press "Start Demo" to begin.')
    setPaused(false)
  }

  const getIdeaText = (ideaId: string) => ideas.find(i => i.id === ideaId)?.text || ''
  const getParticipantName = (pId: string) => participants.find(p => p.id === pId)?.name || ''

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Title */}
        <div className="mb-6">
          <Link href="/about" className="text-muted hover:text-foreground text-sm mb-2 inline-block">
            &larr; Back to About
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">See Union Chant in Action</h1>
          <p className="text-muted mt-1 text-sm sm:text-base">Watch how {participantCount} people reach consensus through structured small-group deliberation</p>
        </div>

        <div className="space-y-6">
          {/* Explanation banner — always visible */}
          <div className="bg-accent-light border-2 border-accent rounded-lg p-5">
            {phase === 'setup' ? (
              <>
                <div className="text-sm text-foreground space-y-1.5 mb-4">
                  <p><strong>1.</strong> {participantCount} participants each submit one idea</p>
                  <p><strong>2.</strong> Ideas are grouped into cells of 5 ideas, 5 people each</p>
                  <p><strong>3.</strong> Each cell deliberates (discusses trade-offs) then votes</p>
                  <p><strong>4.</strong> Winners advance to the next tier, losers are eliminated</p>
                  <p><strong>5.</strong> Process repeats until one champion emerges</p>
                </div>
                <button
                  onClick={startDemo}
                  className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  Start Demo
                </button>
              </>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="text-accent text-2xl shrink-0">💡</div>
                  <p className="text-foreground font-medium">{explanation}</p>
                </div>
                {paused && (
                  <button
                    onClick={() => continueRef.current?.()}
                    className="shrink-0 px-5 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
                  >
                    Continue
                  </button>
                )}
              </div>
            )}
          </div>

            <div className="grid lg:grid-cols-5 gap-6">
            {/* Left: Tier Progress */}
            <div className="lg:col-span-2 space-y-4">
              {/* Status */}
              <div className={`rounded-lg p-4 border ${champion ? 'bg-success-bg border-success' : 'bg-background border-border'}`}>
                <div className="text-sm text-muted mb-1">Status</div>
                <div className="text-foreground font-medium">{statusMessage}</div>
                {champion && (
                  <div className="mt-3 pt-3 border-t border-success/30">
                    <div className="text-success text-xs font-semibold uppercase tracking-wide mb-1">Champion</div>
                    <div className="text-foreground font-bold">{champion.text}</div>
                    <div className="text-muted text-xs mt-1">From {ideas.length} ideas → 1 winner through {currentTier} tiers</div>
                  </div>
                )}
              </div>


              {/* Tier Funnel - only show active or completed tiers */}
              <div className="bg-background rounded-lg p-4 border border-border">
                <h3 className="text-sm font-medium text-muted mb-4">Tournament Progress</h3>
                <div className="space-y-2">
                  {tierSummaries.filter(t => t.status !== 'pending').map((t, i, arr) => (
                    <div key={t.tier} className="relative">
                      <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                        t.status === 'active' ? 'bg-warning-bg border border-warning' :
                        t.status === 'completed' ? 'bg-success-bg border border-success' :
                        'bg-surface border border-border'
                      }`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          t.status === 'active' ? 'bg-warning text-white' :
                          t.status === 'completed' ? 'bg-success text-white' :
                          'bg-border text-muted'
                        }`}>
                          {t.tier}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-foreground font-medium">
                            Tier {t.tier}: {t.cells} cells
                          </div>
                          <div className="text-xs text-muted">
                            {t.ideasStart} ideas → {t.status === 'completed' ? t.ideasEnd : '?'} advancing
                          </div>
                        </div>
                        {t.status === 'completed' && (
                          <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        {t.status === 'active' && (
                          <div className="w-5 h-5 border-2 border-warning border-t-transparent rounded-full animate-spin" />
                        )}
                      </div>
                      {i < arr.length - 1 && (
                        <div className="absolute left-6 top-full w-0.5 h-2 bg-border" />
                      )}
                    </div>
                  ))}
                  {tierSummaries.filter(t => t.status === 'pending').length > 0 && (
                    <div className="text-xs text-muted text-center py-2">
                      {tierSummaries.filter(t => t.status === 'pending').length} more tier{tierSummaries.filter(t => t.status === 'pending').length > 1 ? 's' : ''} to go...
                    </div>
                  )}
                </div>
              </div>

              {/* Ideas Summary */}
              <div className="bg-background rounded-lg p-4 border border-border">
                <h3 className="text-sm font-medium text-muted mb-3">Ideas by Status</h3>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="bg-surface rounded p-2">
                    <div className="text-2xl font-bold text-foreground font-mono">{ideas.length}</div>
                    <div className="text-muted text-xs">Total</div>
                  </div>
                  <div className="bg-surface rounded p-2">
                    <div className="text-2xl font-bold text-muted font-mono">
                      {ideas.filter(i => i.status === 'eliminated').length}
                    </div>
                    <div className="text-muted text-xs">Eliminated</div>
                  </div>
                  <div className="bg-success-bg rounded p-2">
                    <div className="text-2xl font-bold text-success font-mono">
                      {ideas.filter(i => i.status === 'winner').length}
                    </div>
                    <div className="text-success text-xs">Winner</div>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <button
                onClick={reset}
                className="w-full bg-muted hover:bg-subtle text-white px-4 py-2 rounded-lg transition-colors"
              >
                {running ? 'Stop & Reset' : 'Reset Demo'}
              </button>
            </div>

            {/* Middle/Right: Panels */}
            <div className="lg:col-span-3 space-y-4">
              {/* Cells Grid - Always visible */}
              <div className="bg-background rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  {phase === 'completed' ? 'Final Voting Summary' : phase === 'voting' ? `Tier ${currentTier} Cells` : 'Voting Cells'}
                </h3>

                {cells.length > 0 ? (
                  /* Show all tiers */
                  <div className="space-y-4">
                    {Array.from(new Set(cells.map(c => c.tier))).sort((a, b) => a - b).map(tier => {
                      const tierCells = cells.filter(c => c.tier === tier)
                      const batches = [...new Set(tierCells.map(c => c.batch))].sort((a, b) => a - b)
                      const isCurrentTier = tier === currentTier && phase !== 'completed'

                      // Check if this is real batching (multiple cells per batch voting on same ideas)
                      const cellsPerBatch = tierCells.filter(c => c.batch === 0).length
                      const hasRealBatching = cellsPerBatch > 1
                      const isFinalShowdown = batches.length === 1 && tierCells.length > 1 && hasRealBatching

                      // Get ideas per batch (from first cell of first batch)
                      const ideasPerBatch = tierCells[0]?.ideaIds.length || 0

                      return (
                        <div key={tier} className={`${isCurrentTier ? '' : 'opacity-60'}`}>
                          <div className="text-xs text-muted mb-2 flex items-center gap-2">
                            <span className={`font-medium ${isCurrentTier ? 'text-warning' : 'text-success'}`}>
                              Tier {tier}
                            </span>
                            <span>
                              {isFinalShowdown
                                ? `(Final Showdown - all ${tierCells.length} cells vote on same ${ideasPerBatch} ideas)`
                                : hasRealBatching
                                  ? `(${batches.length} batches with ${ideasPerBatch} ideas each, ${cellsPerBatch} cells per batch)`
                                  : `(${tierCells.length} cells, each with ${ideasPerBatch} unique ideas)`
                              }
                            </span>
                          </div>

                          {/* Cells layout - horizontal for no batching, grouped for batching */}
                          {hasRealBatching ? (
                            /* Group cells by batch when real batching */
                            <div className="space-y-3">
                              {batches.map(batch => {
                                const batchCells = tierCells.filter(c => c.batch === batch)
                                return (
                                  <div key={batch} className="flex items-center gap-2 pb-2 border-b border-border/50 last:border-0 last:pb-0">
                                    <span className="text-[10px] text-muted w-8 font-medium">B{batch + 1}:</span>
                                    <div className="flex gap-1.5 flex-wrap">
                                      {batchCells.map(cell => (
                                        <div
                                          key={cell.id}
                                          onClick={() => setActiveCell(cell)}
                                          className={`w-8 h-8 rounded flex items-center justify-center text-[10px] font-mono cursor-pointer transition-all ${
                                            activeCell?.id === cell.id ? 'ring-2 ring-foreground' : ''
                                          } ${
                                            cell.status === 'completed' ? 'bg-success-bg border border-success text-success' :
                                            cell.status === 'voting' ? 'bg-warning-bg border border-warning text-warning' :
                                            cell.status === 'deliberating' ? 'bg-accent-light border border-accent text-accent' :
                                            'bg-surface border border-border text-muted'
                                          }`}
                                          title={`${Object.keys(cell.votes).length}/${cell.participantIds.length} voted`}
                                        >
                                          {Object.keys(cell.votes).length}/{cell.participantIds.length}
                                        </div>
                                      ))}
                                    </div>
                                    {/* Show batch winner */}
                                    {batchCells.every(c => c.status === 'completed') && (
                                      <span className="text-[10px] text-success ml-2 truncate max-w-[150px]">
                                        → {getIdeaText(batchCells[0]?.winner || '').slice(0, 25)}...
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            /* Horizontal layout when no batching (each cell has unique ideas) */
                            <div className="flex gap-1.5 flex-wrap">
                              {tierCells.map(cell => (
                                <div
                                  key={cell.id}
                                  onClick={() => setActiveCell(cell)}
                                  className={`w-8 h-8 rounded flex items-center justify-center text-[10px] font-mono cursor-pointer transition-all ${
                                    activeCell?.id === cell.id ? 'ring-2 ring-foreground' : ''
                                  } ${
                                    cell.status === 'completed' ? 'bg-success-bg border border-success text-success' :
                                    cell.status === 'voting' ? 'bg-warning-bg border border-warning text-warning' :
                                    cell.status === 'deliberating' ? 'bg-accent-light border border-accent text-accent' :
                                    'bg-surface border border-border text-muted'
                                  }`}
                                  title={`${Object.keys(cell.votes).length}/${cell.participantIds.length} voted`}
                                >
                                  {Object.keys(cell.votes).length}/{cell.participantIds.length}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  /* Placeholder when no cells yet */
                  <div className="text-center py-8 text-muted">
                    <div className="text-2xl mb-2">📦</div>
                    <p className="text-sm">Cells will appear here once voting begins</p>
                  </div>
                )}

                {/* Legend - always show */}
                <div className="flex gap-4 mt-4 pt-3 border-t border-border text-xs text-muted">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-accent-light border border-accent"></div>
                    <span>Deliberating</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-warning-bg border border-warning"></div>
                    <span>Voting</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-success-bg border border-success"></div>
                    <span>Complete</span>
                  </div>
                </div>
              </div>


              {/* Active Cell Detail - Always visible */}
              <div className="bg-background rounded-lg border border-border overflow-hidden">
                {activeCell ? (
                  <>
                    <div className={`p-3 ${
                      activeCell.status === 'deliberating' ? 'bg-accent-light' :
                      activeCell.status === 'voting' ? 'bg-warning-bg' :
                      'bg-success-bg'
                    }`}>
                      <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-foreground text-sm">
                          Cell Detail - Tier {activeCell.tier}
                        </h3>
                        <span className={`text-xs px-2 py-1 rounded ${
                          activeCell.status === 'deliberating' ? 'bg-accent text-white' :
                          activeCell.status === 'voting' ? 'bg-warning text-white' :
                          'bg-success text-white'
                        }`}>
                          {activeCell.status === 'deliberating' ? 'Discussing' :
                           activeCell.status === 'voting' ? 'Voting' : 'Complete'}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 grid md:grid-cols-2 gap-4">
                      {/* Ideas being voted on */}
                      <div>
                        <h4 className="text-sm font-medium text-muted mb-2">Ideas in this cell:</h4>
                        <div className="space-y-1.5">
                          {activeCell.ideaIds.map(ideaId => {
                            const voteCount = Object.values(activeCell.votes).filter(v => v === ideaId).length
                            const isWinner = activeCell.winner === ideaId
                            return (
                              <div key={ideaId} className={`p-2 rounded text-sm flex justify-between items-center ${
                                isWinner ? 'bg-success-bg border border-success' : 'bg-surface'
                              }`}>
                                <span className={`${isWinner ? 'text-success font-medium' : 'text-foreground'} text-xs`}>
                                  {getIdeaText(ideaId)}
                                </span>
                                {voteCount > 0 && (
                                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                                    isWinner ? 'bg-success text-white' : 'bg-border text-muted'
                                  }`}>
                                    {voteCount}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Conversation */}
                      <div>
                        <h4 className="text-sm font-medium text-muted mb-2">Discussion:</h4>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {activeCell.conversations.map((conv, i) => (
                            <div key={i} className="bg-surface rounded p-2 text-xs">
                              <span className="font-medium text-accent">{conv.participantName}:</span>
                              <span className="text-subtle ml-1">{conv.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Participants */}
                    <div className="px-4 pb-3">
                      <div className="flex flex-wrap gap-1.5">
                        {activeCell.participantIds.map(pId => {
                          const hasVoted = activeCell.votes[pId]
                          return (
                            <span key={pId} className={`text-xs px-2 py-0.5 rounded ${
                              hasVoted ? 'bg-success text-white' : 'bg-surface text-muted border border-border'
                            }`}>
                              {getParticipantName(pId)} {hasVoted ? '✓' : ''}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  /* Placeholder when no cell selected */
                  <div className="p-3 bg-surface/50">
                    <h3 className="font-semibold text-muted text-sm">Cell Detail</h3>
                  </div>
                )}
                {!activeCell && (
                  <div className="p-8 text-center text-muted text-sm">
                    <div className="text-2xl mb-2">💬</div>
                    <p>{phase === 'submission' ? 'Cell discussions will appear here' : 'Click a cell to see its discussion'}</p>
                  </div>
                )}
              </div>

              {/* Key Insight Box */}
              {!champion && (
                <div className="bg-purple-bg border border-purple rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="text-purple text-xl">💡</div>
                    <div>
                      <div className="text-purple font-medium text-sm">Why Small Groups Matter</div>
                      <div className="text-subtle text-sm mt-1">
                        In a traditional poll, the loudest voices dominate. In Union Chant, every participant
                        deliberates in a small group where their voice is heard. Ideas win by surviving
                        scrutiny across multiple independent groups—not by popularity or timing.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>

        {/* Bottom CTA */}
        {phase === 'completed' && (
          <div className="mt-8 text-center">
            <Link
              href="/deliberations/new"
              className="inline-block bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Start Your Own Deliberation
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
